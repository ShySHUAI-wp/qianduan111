import socket
import time
import threading

# 全局退出标志，用于安全终止子线程
exit_flag = False
# 服务端配置
HOST, PORT = "localhost", 9020
# 客户端配置
CONNECT_DELAY = 3       # 启动后延迟3秒开始连接服务端
RETRY_INTERVAL = 0.1    # 重连间隔/通信轮询间隔
MAX_RETRY_TIMES = 300   # 最大连接重试次数
BUFFER_SIZE = 4096      # 扩大缓冲区，避免大消息截断
DELIMITER = b"\n"       # 消息分隔符（与服务端保持一致）


def recv_thread(sock: socket.socket):
    """
    子线程：持续接收服务端消息，按分隔符解析，解决TCP粘包问题
    处理所有服务端推送的消息：状态、指令响应、录制完成信号
    """
    global exit_flag
    # 缓存未解析完的数据流，解决半包问题
    buffer = b""
    while not exit_flag:
        try:
            sock.settimeout(0.5)
            data = sock.recv(BUFFER_SIZE)
            if not data:
                print("\n[错误] 服务端断开连接")
                exit_flag = True
                break

            # 追加到缓存区，按分隔符拆分完整消息
            buffer += data
            while DELIMITER in buffer:
                # 拆分出第一条完整消息
                msg, buffer = buffer.split(DELIMITER, 1)
                msg_str = msg.decode("utf-8").strip()
                if not msg_str:
                    continue

                # 打印服务端消息
                print(f"\n[服务端消息] {msg_str}")

                # 录制完成指令，主动退出
                if "record_finish" in msg_str:
                    print("\n[信息] 收到录制完成指令，客户端即将退出")
                    exit_flag = True
                    break

                # 状态消息专属提示
                if msg_str.startswith("ready|"):
                    print(f"\n[录制状态] 就绪，等待开始指令")
                elif msg_str == "resetting":
                    print(f"\n[录制状态] 回正中，请操作机器人回到初始位置")
                elif msg_str.startswith("progress|"):
                    # 解析进度消息
                    parts = msg_str.split("|")
                    progress_info = {}
                    for part in parts[1:]:
                        if ":" in part:
                            key, value = part.split(":", 1)
                            progress_info[key] = value
                    print(f"\n[录制进度] 当前: {progress_info.get('current', 'N/A')}s / 总计: {progress_info.get('total', 'N/A')}s / 剩余: {progress_info.get('remaining', 'N/A')}s")
                elif msg_str == "saving_start":
                    print(f"\n[录制状态] 开始保存数据...")
                elif msg_str == "saving_complete":
                    print(f"\n[录制状态] 数据保存完成")

            # 重新打印输入提示符
            print("> 请输入指令（start/stop/rerecord/exit_early/reset_done）：", end="", flush=True)

        except socket.timeout:
            continue
        except Exception as e:
            if not exit_flag:
                print(f"\n[接收异常] {str(e)}")
                exit_flag = True
            break


def create_socket_client():
    global exit_flag
    exit_flag = False

    print(f"客户端启动，等待{CONNECT_DELAY}秒后开始连接服务端...")
    time.sleep(CONNECT_DELAY)

    retry_count = 0
    sock = None
    while retry_count < MAX_RETRY_TIMES and not exit_flag:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((HOST, PORT))
            print(f"成功连接到录制服务端 {HOST}:{PORT}，共重试{retry_count}次")
            break
        except Exception as e:
            retry_count += 1
            print(f"连接失败({retry_count}/{MAX_RETRY_TIMES})：{str(e)}，{RETRY_INTERVAL}秒后重试...")
            time.sleep(RETRY_INTERVAL)
            if sock:
                sock.close()
                sock = None
    else:
        if not exit_flag:
            print(f"达到最大重试次数{MAX_RETRY_TIMES}，连接失败，客户端退出")
        return

    try:
        thread = threading.Thread(target=recv_thread, args=(sock,), daemon=True)
        thread.start()

        print("\n=== 指令说明 ===")
        print("start       - 开始录制当前episode")
        print("stop        - 停止全部录制并退出")
        print("rerecord    - 重录当前episode（清空缓存）")
        print("exit_early  - 提前结束当前episode（保存数据）")
        print("reset_done  - 回正完成，开始下一轮录制")
        print("===============\n")

        print("> 请输入指令（start/stop/rerecord/exit_early/reset_done）：", end="", flush=True)

        while not exit_flag:
            try:
                cmd = input().strip().lower()
                if not cmd:
                    print("> 请输入有效指令：", end="", flush=True)
                    continue

                # 发送指令，无需添加分隔符（服务端仅解析控制指令，无粘包风险）
                sock.sendall(cmd.encode("utf-8"))

                if cmd == "stop":
                    print("\n[信息] 已发送停止指令，客户端退出")
                    exit_flag = True
                    break

                print("> 请输入指令（start/stop/rerecord/exit_early/reset_done）：", end="", flush=True)

            except EOFError:
                exit_flag = True
                break
            except Exception as e:
                if not exit_flag:
                    print(f"\n[发送异常] {str(e)}")
                    exit_flag = True
                break

        thread.join(timeout=1)

    finally:
        if sock and sock.fileno() != -1:
            try:
                sock.close()
            except:
                pass
        print("\n[信息] 客户端已关闭连接")


if __name__ == "__main__":
    create_socket_client()
