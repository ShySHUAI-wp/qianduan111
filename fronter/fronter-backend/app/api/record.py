import json
import os
import sys
import logging
import re
import uuid
import socket
import threading
import asyncio
from pathlib import Path
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException
from app.models.response import ApiResponse
from app.websocket import sio
from app.services.command_manager import command_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# 存储运行中的录制任务
recording_tasks: Dict[str, threading.Thread] = {}

# 全局socket客户端管理器
class SocketClientManager:
    def __init__(self):
        self.clients: Dict[str, socket.socket] = {}  # commandId -> socket
        self.recv_threads: Dict[str, threading.Thread] = {}  # commandId -> thread
        self.stop_flags: Dict[str, bool] = {}  # commandId -> stop flag
        self.message_queues: Dict[str, list] = {}  # commandId -> 未读消息队列
        self.lock = threading.Lock()

    def create_connection(
        self,
        command_id: str,
        host: str = "localhost",
        port: int = 9020,
    ) -> tuple[bool, str]:
        """尝试创建socket连接到lerobot_record_socket服务（单次尝试）"""
        # 检查是否已经连接
        with self.lock:
            if command_id in self.clients:
                return True, "已经连接"

        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((host, port))
            logger.info(f"[SocketClient] 成功连接到 {host}:{port}")

            with self.lock:
                self.clients[command_id] = sock
                self.stop_flags[command_id] = False

            # 启动接收线程
            recv_thread = threading.Thread(
                target=self._recv_thread,
                args=(command_id, sock),
                daemon=True
            )
            recv_thread.start()
            self.recv_threads[command_id] = recv_thread

            return True, "连接成功"

        except Exception as e:
            logger.debug(f"[SocketClient] 连接失败: {str(e)}")
            if sock:
                try:
                    sock.close()
                except:
                    pass
            return False, str(e)

    def _recv_thread(self, command_id: str, sock: socket.socket):
        """接收socket消息并通过Socket.IO广播"""
        buffer = b""
        delimiter = b"\n"

        while not self.stop_flags.get(command_id, False):
            try:
                sock.settimeout(0.5)
                data = sock.recv(4096)
                if not data:
                    logger.info(f"[SocketClient] 服务端断开连接: {command_id}")
                    break

                buffer += data
                while delimiter in buffer:
                    msg, buffer = buffer.split(delimiter, 1)
                    msg_str = msg.decode("utf-8").strip()
                    if msg_str:
                        logger.info(f"[SocketClient] 收到消息: {msg_str}")
                        # 追加到消息队列供轮询
                        with self.lock:
                            if command_id not in self.message_queues:
                                self.message_queues[command_id] = []
                            self.message_queues[command_id].append(msg_str)
                        # 通过 Socket.IO 广播消息
                        asyncio.run(self._broadcast_message(command_id, msg_str))

            except socket.timeout:
                continue
            except Exception as e:
                if not self.stop_flags.get(command_id, False):
                    logger.error(f"[SocketClient] 接收异常: {str(e)}")
                break

        logger.info(f"[SocketClient] 接收线程退出: {command_id}")

    async def _broadcast_message(self, command_id: str, message: str):
        """通过Socket.IO广播消息到订阅了该命令的客户端"""
        try:
            await sio.emit(
                "record_message",
                {"type": "message", "data": message},
                room=f"record_{command_id}"
            )
            logger.debug(f"[SocketIO] 广播消息到房间 record_{command_id}: {message}")
        except Exception as e:
            logger.error(f"[SocketIO] 广播消息失败: {str(e)}")

    def send_command(self, command_id: str, command: str) -> bool:
        """发送命令到socket服务端"""
        with self.lock:
            sock = self.clients.get(command_id)

        if not sock:
            logger.error(f"[SocketClient] 未找到连接: {command_id}")
            return False

        try:
            sock.sendall(command.encode("utf-8"))
            logger.info(f"[SocketClient] 发送命令: {command}")
            return True
        except Exception as e:
            logger.error(f"[SocketClient] 发送命令失败: {str(e)}")
            return False

    def drain_messages(self, command_id: str) -> list:
        """取走某个命令的所有未读消息（取后清空）"""
        with self.lock:
            msgs = self.message_queues.pop(command_id, [])
            return msgs

    def close_connection(self, command_id: str):
        """关闭socket连接"""
        with self.lock:
            self.stop_flags[command_id] = True
            self.message_queues.pop(command_id, None)

            # 关闭socket
            sock = self.clients.pop(command_id, None)
            if sock:
                try:
                    sock.close()
                    logger.info(f"[SocketClient] 已关闭连接: {command_id}")
                except Exception as e:
                    logger.error(f"[SocketClient] 关闭连接异常: {str(e)}")

            # 等待接收线程结束
            recv_thread = self.recv_threads.pop(command_id, None)

        if recv_thread and recv_thread.is_alive():
            recv_thread.join(timeout=2.0)

socket_manager = SocketClientManager()

@router.post("/start")
async def start_recording(request: dict):
    """启动数据采集脚本并建立socket连接"""
    # 提取参数（带默认值）
    robot_type = request.get("robot_type")
    robot_port = request.get("robot_port")
    robot_id = request.get("robot_id", "robot")
    robot_cameras = request.get("robot_cameras")

    teleop_type = request.get("teleop_type")
    teleop_port = request.get("teleop_port")
    teleop_id = request.get("teleop_id", "teleop")

    dataset_path = request.get("dataset_path")
    dataset_name = request.get("dataset_name")

    # # 测试用
    # dataset_name = "test_dj"

    dataset_fps = request.get("dataset_fps", 30)
    dataset_num_episodes = request.get("dataset_num_episodes", 5)
    dataset_single_task = request.get("dataset_single_task", "")
    dataset_episode_time_s = request.get("dataset_episode_time_s", 30)
    dataset_reset_time_s = request.get("dataset_reset_time_s", 20)
    dataset_push_to_hub = request.get("dataset_push_to_hub", False)

    display_data = request.get("display_data", False)
    display_ip = request.get("display_ip")

    logger.info(f"[RECORD-START] Starting recording session")
    logger.info(f"[RECORD-START] Robot: {robot_type}, Port: {robot_port}")
    logger.info(f"[RECORD-START] Dataset: {dataset_path}/{dataset_name}")
    logger.info(f"[RECORD-START] Episodes: {dataset_num_episodes}")

    # 创建数据集目录
    dataset_full_path = Path(dataset_path) / dataset_name
    dataset_full_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"[RECORD-START] Dataset directory: {dataset_full_path}")

    command_id = f"record-{uuid.uuid4().hex[:8]}"

    cameras_raw_str = ""
    # 相机配置
    if robot_cameras:
        try:
            if isinstance(robot_cameras, str):
                camera_dict = json.loads(robot_cameras)
            else:
                camera_dict = robot_cameras

            camera_segments = []
            quote_fields = {"fourcc", "rotation"}

            for cam_name, cam_config in camera_dict.items():
                prop_list = []
                for k, v in cam_config.items():
                    if k == "index_or_path":
                        video_pattern = re.compile(r'^/dev/video(\d+)$')
                        match = video_pattern.match(str(v))
                        if match:
                            v = match.group(1)

                    if k in quote_fields:
                        prop_list.append(f'{k}: "{v}"')
                    else:
                        prop_list.append(f'{k}: {v}')

                props_str = ", ".join(prop_list)
                camera_segments.append(f"{cam_name}: {{{props_str}}}")

            cameras_raw_str = "{ " + ", ".join(camera_segments) + " }"

        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"[RECORD-START] 相机配置解析失败: {robot_cameras}, error: {e}")
            raise HTTPException(status_code=400, detail="相机配置格式错误")

    cmd_config_display_data = 'false'
    if display_data:
        cmd_config_display_data = 'true'

    # Dataset 配置 - 计算 repo_id
    hf_cache_dir = Path.home() / ".cache" / "huggingface" / "lerobot" / dataset_name
    logger.info(f"[RECORD-START] Scanning cache directory: {hf_cache_dir}")

    max_num = -1
    pattern = re.compile(rf"^{re.escape(dataset_name)}_(\d{{6}})$")

    if hf_cache_dir.exists() and hf_cache_dir.is_dir():
        for dir_name in os.listdir(hf_cache_dir):
            dir_path = hf_cache_dir / dir_name
            if dir_path.is_dir():
                match = pattern.match(dir_name)
                if match:
                    dir_num = int(match.group(1))
                    if dir_num > max_num:
                        max_num = dir_num


    new_num = max_num + 1
    new_num_str = f"{new_num:06d}"
    repo_id = f"{dataset_name}/{dataset_name}_{new_num_str}"
    logger.info(f"[RECORD-START] Max number found: {max_num}, New number: {new_num_str}, Final repo_id: {repo_id}")

    # 修改为使用 lerobot-record-socket
    cmd = [
        f"lerobot-record-socket",
        f"--robot.type={robot_type}",
        f"--robot.port={robot_port}",
        f"--robot.id={robot_id}",
        f"--robot.cameras=\"{cameras_raw_str}\"",
        f"--teleop.type={teleop_type}",
        f"--teleop.port={teleop_port}",
        f"--teleop.id={teleop_id}",
        f"--display_data={cmd_config_display_data}",
        f"--dataset.repo_id={repo_id}",
        f"--dataset.num_episodes={dataset_num_episodes}",
        f"--dataset.single_task=\"{dataset_single_task}\"",
        f"--dataset.push_to_hub={'true' if dataset_push_to_hub else 'false'}",
        f"--dataset.episode_time_s={dataset_episode_time_s}",
        f"--dataset.reset_time_s={dataset_reset_time_s}",
        f"--dataset.fps={dataset_fps}",
    ]

    # # 测试用
    # cameras_raw_str = "{ front: {type: opencv, index_or_path: 1, width: 640, height: 480, fps: 30, fourcc: \"MJPG\", rotation: \"ROTATE_180\"}, side: {type: opencv, index_or_path: 2, width: 640, height: 480, fps: 30, fourcc: \"MJPG\"}}"
    # cmd = [
    #     f"lerobot-record-socket",
    #     f"--robot.type=so101_follower",
    #     f"--robot.port=/dev/ttyACM1",
    #     f"--robot.id=my_awesome_follower_arm",
    #     f"--robot.cameras=\"{cameras_raw_str}\"",
    #     f"--teleop.type=so101_leader",
    #     f"--teleop.port=/dev/ttyACM0",
    #     f"--teleop.id=my_awesome_leader_arm",
    #     f"--display_data=true",
    #     f"--dataset.repo_id={repo_id}",
    #     f"--dataset.num_episodes=5",
    #     f"--dataset.single_task=\"Grab the pink cube\"",
    #     f"--dataset.push_to_hub=false",
    #     f"--dataset.episode_time_s=30",
    #     f"--dataset.reset_time_s=20",
    #     f"--dataset.fps=30",
    # ]

    command = " ".join(cmd)

    try:
        # 在后台启动进程
        logger.info(f"Starting teleoperate command: {command}")
        print(f"启动: ")
        print(command)
        cmd_process = await command_manager.start_command(command_id, command)

        # 计算Rerun URL
        rerun_url = None
        if display_data and not display_ip:
            # 本地模式，通过代理访问
            rerun_url = "/api/rerun/proxy"

        return ApiResponse.success(
            data={
                "commandId": command_id,
                "status": "running",
                "command": command,
                "rerunUrl": rerun_url,
                "pid": cmd_process.process.pid,
            }
        )
    except Exception as e:
        logger.error(f"Failed to start teleoperate command: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"启动录制失败: {str(e)}")




@router.post("/connect-socket")
async def connect_socket(request: dict):
    """尝试连接到lerobot_record_socket的socket服务（单次尝试）"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.debug(f"[RECORD-CONNECT] Attempting to connect socket for: {command_id}")

    try:
        success, message = socket_manager.create_connection(command_id)
        if success:
            return ApiResponse.success(data={"message": message, "connected": True})
        else:
            return ApiResponse.success(data={"message": message, "connected": False})
    except Exception as e:
        logger.error(f"[RECORD-CONNECT] Error: {e}", exc_info=True)
        return ApiResponse.success(data={"message": str(e), "connected": False})


@router.post("/latest-message")
async def get_latest_message(request: dict):
    """取走录制脚本发来的所有未读socket消息（取后清空）"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    messages = socket_manager.drain_messages(command_id)
    return ApiResponse.success(data={"commandId": command_id, "messages": messages})


@router.post("/start-episode")
async def start_episode(request: dict):
    """发送start指令开始新一轮采集"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-START-EPISODE] Starting episode for: {command_id}")

    try:
        success = socket_manager.send_command(command_id, "start")
        if success:
            return ApiResponse.success(data={"message": "已发送开始采集信号"})
        else:
            raise HTTPException(status_code=500, detail="发送指令失败")
    except Exception as e:
        logger.error(f"[RECORD-START-EPISODE] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"发送开始信号失败: {str(e)}")


@router.post("/stop")
async def stop_recording(request: dict):
    """停止录制（通过socket）"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-STOP] Stopping recording: {command_id}")

    try:
        success = socket_manager.send_command(command_id, "stop")
        if success:
            return ApiResponse.success(data={"message": "已发送停止信号"})
        else:
            raise HTTPException(status_code=500, detail="发送指令失败")
    except Exception as e:
        logger.error(f"[RECORD-STOP] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"发送停止信号失败: {str(e)}")


@router.post("/rerecord")
async def rerecord_episode(request: dict):
    """重新录制当前轮（通过socket）- 对应后端的rerecord指令"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-RERECORD] Re-recording episode for: {command_id}")

    try:
        success = socket_manager.send_command(command_id, "rerecord")
        if success:
            return ApiResponse.success(data={"message": "已发送重新录制信号"})
        else:
            raise HTTPException(status_code=500, detail="发送指令失败")
    except Exception as e:
        logger.error(f"[RECORD-RERECORD] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"发送重新录制信号失败: {str(e)}")


@router.post("/next-episode")
async def next_episode(request: dict):
    """进入下一轮（通过socket）- 对应后端的exit_early指令"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-NEXT] Moving to next episode for: {command_id}")

    try:
        success = socket_manager.send_command(command_id, "exit_early")
        if success:
            return ApiResponse.success(data={"message": "已发送下一轮信号"})
        else:
            raise HTTPException(status_code=500, detail="发送指令失败")
    except Exception as e:
        logger.error(f"[RECORD-NEXT] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"发送下一轮信号失败: {str(e)}")


@router.post("/reset-done")
async def reset_done(request: dict):
    """通知录制脚本回正完成，可以进入下一轮"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-RESET-DONE] Reset done for: {command_id}")

    try:
        success = socket_manager.send_command(command_id, "reset_done")
        if success:
            return ApiResponse.success(data={"message": "已发送回正完成信号"})
        else:
            raise HTTPException(status_code=500, detail="发送指令失败")
    except Exception as e:
        logger.error(f"[RECORD-RESET-DONE] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"发送回正完成信号失败: {str(e)}")


@router.post("/cancel")
async def cancel_recording(request: dict):
    """取消录制并强制终止进程"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少 commandId 参数")

    logger.info(f"[RECORD-CANCEL] Canceling recording: {command_id}")

    # 先关闭socket连接
    socket_manager.close_connection(command_id)

    # 再停止命令进程
    if command_id in recording_tasks:
        process = recording_tasks[command_id]
        try:
            import signal
            # 发送 SIGTERM 信号给进程组
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            logger.info(f"Sent SIGTERM to process {process.pid}")

            # 等待进程结束
            try:
                process.wait(timeout=5)
                logger.info(f"Process {process.pid} terminated gracefully")
            except:
                # 如果超时，强制杀死
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                logger.info(f"Process {process.pid} killed forcefully")

            del recording_tasks[command_id]
        except Exception as e:
            logger.error(f"Error stopping process: {e}")
            raise HTTPException(status_code=500, detail=f"停止进程失败: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail=f"录制任务不存在: {command_id}")

    return ApiResponse.success(data={"message": "录制已取消", "commandId": command_id})


# Socket.IO 事件处理器
@sio.on("subscribe_record")
async def on_subscribe_record(sid, data):
    """订阅录制进度更新"""
    command_id = data.get("commandId")
    if command_id:
        room = f"record_{command_id}"
        await sio.enter_room(sid, room)
        logger.info(f"[SocketIO] 客户端 {sid} 订阅录制: {command_id}, 房间: {room}")
        await sio.emit("subscribed_record", {"commandId": command_id}, to=sid)
    else:
        logger.warning(f"[SocketIO] 客户端 {sid} 订阅录制缺少 commandId")

@sio.on("unsubscribe_record")
async def on_unsubscribe_record(sid, data):
    """取消订阅录制进度更新"""
    command_id = data.get("commandId")
    if command_id:
        room = f"record_{command_id}"
        await sio.leave_room(sid, room)
        logger.info(f"[SocketIO] 客户端 {sid} 取消订阅录制: {command_id}")
        await sio.emit("unsubscribed_record", {"commandId": command_id}, to=sid)
    else:
        logger.warning(f"[SocketIO] 客户端 {sid} 取消订阅录制缺少 commandId")

@router.get("/status")
async def get_recording_status(commandId: str):
    """获取录制状态"""
    logger.debug(f"[RECORD-STATUS] Querying status: {commandId}")

    if commandId not in recording_tasks:
        raise HTTPException(status_code=404, detail=f"录制任务不存在: {commandId}")

    process = recording_tasks[commandId]
    poll_result = process.poll()

    status = {
        "commandId": commandId,
        "status": "running" if poll_result is None else "completed",
        "pid": process.pid,
        "exitCode": poll_result
    }

    return ApiResponse.success(data=status)


@router.get("/output")
async def get_recording_output(commandId: str, offset: int = 0, limit: int = 1000):
    """获取录制输出（输出现在直接打印到后端终端）"""
    logger.debug(f"[RECORD-OUTPUT] Getting output: {commandId}")

    if commandId not in recording_tasks:
        raise HTTPException(status_code=404, detail=f"录制任务不存在: {commandId}")

    return ApiResponse.success(data={
        "commandId": commandId,
        "lines": ["输出已重定向到后端终端，请查看后端日志"],
        "total": 1,
        "offset": 0,
        "limit": limit
    })


@router.get("/list")
async def list_recordings():
    """列出所有录制任务"""
    commands = []
    for cmd_id, process in recording_tasks.items():
        poll_result = process.poll()
        commands.append({
            "commandId": cmd_id,
            "status": "running" if poll_result is None else "completed",
            "pid": process.pid,
            "exitCode": poll_result
        })
    return ApiResponse.success(data={"commands": commands, "total": len(commands)})