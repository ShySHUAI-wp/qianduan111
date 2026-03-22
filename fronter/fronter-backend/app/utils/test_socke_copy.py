import requests
import time
import threading

# 后端API地址
BASE_URL = "http://localhost:8000/api/record"

# 测试用的请求参数
START_PARAMS = {
    "robot_type": "so101_follower",
    "robot_port": "/dev/ttyACM1",
    "robot_id": "my_awesome_follower_arm",
    "robot_cameras": {
        "front": {
            "type": "opencv",
            "index_or_path": "/dev/video2",
            "width": 640,
            "height": 480,
            "fps": 30,
            "fourcc": "MJPG",
            "rotation": "ROTATE_180"
        },
        "side": {
            "type": "opencv",
            "index_or_path": "/dev/video0",
            "width": 640,
            "height": 480,
            "fps": 30,
            "fourcc": "MJPG"
        }
    },
    "teleop_type": "so101_leader",
    "teleop_port": "/dev/ttyACM0",
    "teleop_id": "my_awesome_leader_arm",
    "dataset_path": "/tmp/test_datasets",
    "dataset_name": "test_dj",
    "dataset_fps": 30,
    "dataset_num_episodes": 5,
    "dataset_single_task": "Grab the pink cube",
    "dataset_episode_time_s": 30,
    "dataset_reset_time_s": 20,
    "dataset_push_to_hub": False,
    "display_data": True,
}

command_id = None
# 后台轮询线程用的状态
_poll_stop = threading.Event()
_poll_thread = None
_last_message = None  # 最新收到的消息


def call_api(endpoint, method="post", params=None, quiet=False):
    """调用API并打印结果"""
    url = f"{BASE_URL}/{endpoint}"
    try:
        if method == "post":
            resp = requests.post(url, json=params or {})
        else:
            resp = requests.get(url, params=params or {})
        data = resp.json()
        if not quiet:
            print(f"  [{endpoint}] {resp.status_code} -> {data.get('data', data)}")
        return data
    except requests.ConnectionError:
        if not quiet:
            print(f"  [{endpoint}] 连接失败，请确认后端已启动: {BASE_URL}")
        return None
    except Exception as e:
        if not quiet:
            print(f"  [{endpoint}] 异常: {e}")
        return None


def _message_poll_loop():
    """后台线程：轮询 /latest-message，打印状态变化"""
    global _last_message
    while not _poll_stop.is_set():
        if not command_id:
            time.sleep(1)
            continue
        data = call_api("latest-message", params={"commandId": command_id}, quiet=True)
        if data and data.get("data"):
            msgs = data["data"].get("messages", [])
            for msg in msgs:
                if msg:
                    _last_message = msg
                    _handle_server_message(msg)
        time.sleep(1)


def _handle_server_message(msg: str):
    """根据服务端消息类型打印友好提示"""
    if msg.startswith("ready|"):
        # ready|current:1|total:5
        parts = dict(p.split(":") for p in msg.split("|")[1:])
        current = parts.get("current", "?")
        total = parts.get("total", "?")
        print(f"\n  [服务端就绪] Episode {current}/{total} 准备好了")
        print(f"  >>> 输入 begin 开始采集，或 stop/cancel 终止 <<<")
        print("> ", end="", flush=True)

    elif msg.startswith("progress|"):
        # progress|current:1.23|total:30|remaining:28.77
        parts = dict(p.split(":") for p in msg.split("|")[1:])
        current = parts.get("current", "?")
        total = parts.get("total", "?")
        remaining = parts.get("remaining", "?")
        print(f"\r  [录制中] {current}s / {total}s (剩余 {remaining}s)    ", end="", flush=True)

    elif msg == "saving_start":
        print(f"\n  [保存中] 正在保存 episode 数据...")

    elif msg == "saving_complete":
        print(f"  [保存完成] episode 数据已保存")

    elif msg == "resetting":
        print(f"\n  [回正阶段] 请操控遥操设备将机器人移回初始位置")
        print(f"  >>> 输入 reset_done 完成回正 <<<")
        print("> ", end="", flush=True)

    elif msg == "record_finish":
        print(f"\n  [录制结束] 所有 episode 已完成!")

    else:
        print(f"\n  [服务端消息] {msg}")


def start_recording():
    """启动录制 -> 自动连接 socket -> 等待 ready"""
    global command_id

    # 1. 调用 /start
    print("\n[1/3] 启动录制进程...")
    data = call_api("start", params=START_PARAMS)
    if not data or not data.get("data"):
        print("  启动失败")
        return
    command_id = data["data"].get("commandId")
    pid = data["data"].get("pid")
    print(f"  commandId: {command_id}, PID: {pid}")

    # 2. 自动重试 /connect-socket
    print("\n[2/3] 连接 socket（等待录制脚本启动 socket 服务器）...")
    connected = False
    for i in range(30):  # 最多等60秒
        data = call_api("connect-socket", params={"commandId": command_id}, quiet=True)
        if data and data.get("data", {}).get("connected"):
            print(f"  socket 连接成功（第 {i+1} 次尝试）")
            connected = True
            break
        time.sleep(2)

    if not connected:
        print("  socket 连接超时，请检查录制脚本是否正常启动")
        return

    # 3. 启动后台消息轮询
    print("\n[3/3] 等待服务端就绪（ready 消息）...")
    _start_poll_thread()


def _start_poll_thread():
    """启动后台轮询线程"""
    global _poll_thread
    _poll_stop.clear()
    if _poll_thread and _poll_thread.is_alive():
        return
    _poll_thread = threading.Thread(target=_message_poll_loop, daemon=True)
    _poll_thread.start()


def _stop_poll_thread():
    """停止后台轮询线程"""
    _poll_stop.set()


def start_episode():
    """发送 begin（start）指令"""
    if not command_id:
        print("没有 commandId，请先 start")
        return
    print("\n  发送开始采集指令...")
    call_api("start-episode", params={"commandId": command_id})


def stop_recording():
    """发送 stop 指令"""
    if not command_id:
        print("没有 commandId")
        return
    print("\n  发送停止指令...")
    call_api("stop", params={"commandId": command_id})


def rerecord():
    """发送 rerecord 指令"""
    if not command_id:
        print("没有 commandId")
        return
    print("\n  发送重新录制指令...")
    call_api("rerecord", params={"commandId": command_id})


def next_episode():
    """发送 exit_early 跳到下一轮"""
    if not command_id:
        print("没有 commandId")
        return
    print("\n  发送下一轮指令...")
    call_api("next-episode", params={"commandId": command_id})


def reset_done():
    """发送 reset_done 回正完成指令"""
    if not command_id:
        print("没有 commandId")
        return
    print("\n  发送回正完成指令...")
    call_api("reset-done", params={"commandId": command_id})


def cancel_recording():
    """取消录制并终止进程"""
    if not command_id:
        print("没有 commandId")
        return
    print("\n  发送取消指令...")
    call_api("cancel", params={"commandId": command_id})
    _stop_poll_thread()


def print_help():
    print("""
可用指令:
  start       - 启动录制（自动连接 socket 并等待 ready）
  begin       - 开始采集当前 episode
  next        - 提前结束当前 episode，保存并进入下一轮
  rerecord    - 丢弃当前 episode，重新录制
  reset_done  - 回正完成（在回正阶段使用）
  stop        - 停止全部录制并保存已完成的数据
  cancel      - 强制终止进程（不保存）
  help        - 显示帮助
  quit        - 退出

交互流程:
  start -> [等待 ready] -> begin -> [录制中] -> next/rerecord
    -> [保存/丢弃] -> [回正阶段] -> reset_done -> [等待 ready] -> begin -> ...
  stop: 停止全部录制，保存已完成的 episode 数据
  cancel: 强制终止进程，不保存任何数据
""")


COMMANDS = {
    "begin": start_episode,
    "next": next_episode,
    "stop": stop_recording,
    "rerecord": rerecord,
    "reset_done": reset_done,
    "cancel": cancel_recording,
    "help": print_help,
}


if __name__ == "__main__":
    print("=== Record API 测试客户端 ===")
    print(f"后端地址: {BASE_URL}")
    print_help()

    try:
        while True:
            cmd = input("> ").strip().lower()
            if not cmd:
                continue
            if cmd == "quit":
                _stop_poll_thread()
                print("退出")
                break
            elif cmd == "start":
                start_recording()
            elif cmd in COMMANDS:
                COMMANDS[cmd]()
            else:
                print(f"未知指令: {cmd}，输入 help 查看帮助")
    except KeyboardInterrupt:
        _stop_poll_thread()
        print("\n中断退出")
