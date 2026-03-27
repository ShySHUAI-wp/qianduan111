"""
WebSocket 事件处理器
"""
import logging
import socketio

logger = logging.getLogger(__name__)

# 创建 Socket.IO 服务器实例
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=logger,
    engineio_logger=logger,
)


@sio.event
async def connect(sid, environ):
    """客户端连接事件"""
    logger.info(f"Client connected: {sid}")
    await sio.emit("connected", {"message": "Connected to server"}, to=sid)


@sio.event
async def disconnect(sid):
    """客户端断开事件"""
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def subscribe_command(sid, data):
    """订阅命令输出"""
    command_id = data.get("commandId")
    if command_id:
        logger.info(f"Client {sid} subscribed to command {command_id}")
        # 将客户端加入命令房间
        await sio.enter_room(sid, command_id)
        await sio.emit(
            "subscribed",
            {"commandId": command_id},
            to=sid,
        )
    else:
        logger.warning(f"Client {sid} subscribe_command missing commandId")


@sio.event
async def unsubscribe_command(sid, data):
    """取消订阅命令输出"""
    command_id = data.get("commandId")
    if command_id:
        logger.info(f"Client {sid} unsubscribed from command {command_id}")
        # 将客户端从命令房间移除
        await sio.leave_room(sid, command_id)
        await sio.emit(
            "unsubscribed",
            {"commandId": command_id},
            to=sid,
        )
    else:
        logger.warning(f"Client {sid} unsubscribe_command missing commandId")


@sio.event
async def user_input(sid, data):
    """用户输入响应"""
    command_id = data.get("commandId")
    action = data.get("action")  # "confirm" or "cancel"

    logger.info(f"Client {sid} user input for command {command_id}: {action}")

    # TODO: 处理用户输入，通知命令执行器
    # 这里需要与进程管理器交互


@sio.event
async def get_robot_state(sid, data):
    """返回机器人当前状态（响应式）- 前端每150ms轮询一次"""
    import time
    # TODO: 从实际的机器人硬件/ROS获取真实数据
    # 目前返回模拟数据用于演示
    await sio.emit(
        "robot_state",
        {
            "ts": int(time.time() * 1000),
            "base": {"x": 0, "y": 0, "z": 0, "yaw": 0},
            "joints": {"shoulder": 0, "elbow": 0, "wrist": 0},
        },
        to=sid,
    )


@sio.event
async def system_health(sid, data):
    """健康检查"""
    request_id = data.get("requestId")
    await sio.emit(
        "system_health_resp",
        {
            "requestId": request_id,
            "code": 0,
            "data": {"status": "healthy"},
        },
        to=sid,
    )


@sio.event
async def system_info(sid, data):
    """获取系统信息"""
    import platform
    import sys
    from app.config import settings

    request_id = data.get("requestId")
    await sio.emit(
        "system_info_resp",
        {
            "requestId": request_id,
            "code": 0,
            "data": {
                "platform": platform.system(),
                "version": platform.release(),
                "lerobot_path": settings.LEROBOT_PATH,
                "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            },
        },
        to=sid,
    )


@sio.event
async def ports_list(sid, data):
    """列出所有串口"""
    from app.utils.port_utils import PortUtils

    request_id = data.get("requestId")
    try:
        ports = PortUtils.list_ports()
        port_data = [port.model_dump() for port in ports]
        await sio.emit(
            "ports_list_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {"ports": port_data},
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"Error listing ports: {e}", exc_info=True)
        await sio.emit(
            "ports_list_resp",
            {
                "requestId": request_id,
                "code": 1,
                "message": str(e),
            },
            to=sid,
        )


# ==================== 校准相关事件处理器 ====================

@sio.event
async def calibrate_check_config(sid, data):
    """检查校准配置文件是否存在"""
    from app.api.calibrate import get_config_path

    request_id = data.get("requestId")
    try:
        arm_type = data.get("arm_type")
        arm_id = data.get("arm_id")
        config_path = get_config_path(arm_type, arm_id)
        exists = config_path.exists()
        await sio.emit(
            "calibrate_check_config_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {"exists": exists, "path": str(config_path)},
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_check_config error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_check_config_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_start(sid, data):
    """启动校准流程"""
    from app.api.calibrate import calibration_sessions, session_lock
    from lerobot.robots import make_robot_from_config
    from lerobot.teleoperators import make_teleoperator_from_config
    from lerobot.robots.so101_follower.config_so101_follower import SO101FollowerConfig
    from lerobot.robots.so100_follower.config_so100_follower import SO100FollowerConfig
    from lerobot.robots.bi_so100_follower.config_bi_so100_follower import BiSO100FollowerConfig
    from lerobot.teleoperators.so101_leader.config_so101_leader import SO101LeaderConfig
    from lerobot.teleoperators.so100_leader.config_so100_leader import SO100LeaderConfig
    from lerobot.teleoperators.bi_so100_leader.config_bi_so100_leader import BiSO100LeaderConfig
    import uuid

    request_id = data.get("requestId")
    try:
        arm_type = data.get("arm_type")
        arm_id = data.get("arm_id")
        port = data.get("port")
        left_arm_port = data.get("left_arm_port")
        right_arm_port = data.get("right_arm_port")

        config = None
        device_type = "teleop" if "leader" in arm_type else "robot"

        if arm_type == "so101_leader":
            config = SO101LeaderConfig(port=port, id=arm_id)
        elif arm_type == "so100_leader":
            config = SO100LeaderConfig(port=port, id=arm_id)
        elif arm_type == "bi_so100_leader":
            config = BiSO100LeaderConfig(left_arm_port=left_arm_port, right_arm_port=right_arm_port, id=arm_id)
        elif arm_type == "so101_follower":
            config = SO101FollowerConfig(port=port, id=arm_id)
        elif arm_type == "so100_follower":
            config = SO100FollowerConfig(port=port, id=arm_id)
        elif arm_type == "bi_so100_follower":
            config = BiSO100FollowerConfig(left_arm_port=left_arm_port, right_arm_port=right_arm_port, id=arm_id)
        else:
            raise ValueError(f"不支持的机械臂类型: {arm_type}")

        if device_type == "teleop":
            device = make_teleoperator_from_config(config)
        else:
            device = make_robot_from_config(config)

        device.connect(calibrate=False)
        device.bus.disable_torque()

        session_id = str(uuid.uuid4())

        with session_lock:
            calibration_sessions[session_id] = {
                "device": device,
                "config": config,
                "arm_type": arm_type,
                "arm_id": arm_id,
                "step": "started",
                "homing_offsets": None,
                "range_mins": None,
                "range_maxes": None,
                "recording": False,
                "manual_overrides": {},
            }

        logger.info(f"校准会话启动: {session_id}")
        await sio.emit(
            "calibrate_start_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {"session_id": session_id, "message": "校准会话已启动，设备已连接"},
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_start error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_start_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_use_existing(sid, data):
    """使用已有的校准文件"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        device = session["device"]
        if device.calibration:
            device.bus.write_calibration(device.calibration)
            device.disconnect()
            with session_lock:
                del calibration_sessions[session_id]

        await sio.emit(
            "calibrate_use_existing_resp",
            {"requestId": request_id, "code": 0, "data": {"message": "已成功应用现有校准文件"}},
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_use_existing error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_use_existing_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_set_middle(sid, data):
    """设置中间位置"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        device = session["device"]
        current_positions = device.bus.sync_read("Present_Position", normalize=False)
        homing_offsets = device.bus.set_half_turn_homings()

        with session_lock:
            calibration_sessions[session_id]["homing_offsets"] = homing_offsets
            calibration_sessions[session_id]["step"] = "middle_set"

        await sio.emit(
            "calibrate_set_middle_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {
                    "homing_offsets": {k: int(v) for k, v in homing_offsets.items()},
                    "message": "中间位置已设置",
                    "step": "middle_set",
                },
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_set_middle error: {e}", exc_info=True)
        try:
            with session_lock:
                if session_id in calibration_sessions:
                    calibration_sessions[session_id]["device"].disconnect()
                    del calibration_sessions[session_id]
        except:
            pass
        await sio.emit(
            "calibrate_set_middle_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_start_recording(sid, data):
    """开始记录运动范围"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        if session.get("step") != "middle_set":
            raise ValueError("必须先设置中间位置")

        with session_lock:
            device = calibration_sessions[session_id]["device"]
            start_positions = device.bus.sync_read("Present_Position", normalize=False)
            calibration_sessions[session_id]["recording"] = True
            calibration_sessions[session_id]["step"] = "recording"
            calibration_sessions[session_id]["range_mins"] = start_positions.copy()
            calibration_sessions[session_id]["range_maxes"] = start_positions.copy()

        await sio.emit(
            "calibrate_start_recording_resp",
            {"requestId": request_id, "code": 0, "data": {"message": "开始记录运动范围"}},
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_start_recording error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_start_recording_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_recording_status(sid, data):
    """获取记录状态"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        if not session["recording"]:
            await sio.emit(
                "calibrate_recording_status_resp",
                {"requestId": request_id, "code": 0, "data": {"recording": False}},
                to=sid,
            )
            return

        device = session["device"]
        manual_overrides = session.get("manual_overrides", {})
        current_positions = device.bus.sync_read("Present_Position", normalize=False)

        # 应用手动覆盖值
        for motor, value in manual_overrides.items():
            if motor in current_positions:
                current_positions[motor] = value

        with session_lock:
            mins = session["range_mins"]
            maxes = session["range_maxes"]
            for motor, pos in current_positions.items():
                mins[motor] = min(pos, mins[motor])
                maxes[motor] = max(pos, maxes[motor])
            session["range_mins"] = mins
            session["range_maxes"] = maxes

        status_data = []
        for motor in current_positions.keys():
            status_data.append({
                "motor": motor,
                "min": int(mins[motor]),
                "current": int(current_positions[motor]),
                "max": int(maxes[motor]),
            })

        await sio.emit(
            "calibrate_recording_status_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {"recording": True, "positions": status_data},
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_recording_status error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_recording_status_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_stop_recording(sid, data):
    """停止记录运动范围"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        if not session["recording"]:
            raise ValueError("未在记录状态")

        with session_lock:
            session["recording"] = False
            session["step"] = "recording_stopped"
            mins = session["range_mins"]
            maxes = session["range_maxes"]

        same_min_max = [motor for motor in mins.keys() if mins[motor] == maxes[motor]]
        if same_min_max:
            error_msg = f"以下关节最小值和最大值相同: {', '.join(same_min_max)}"
            device = session["device"]
            device.disconnect()
            with session_lock:
                del calibration_sessions[session_id]
            await sio.emit(
                "calibrate_stop_recording_resp",
                {"requestId": request_id, "code": 1, "message": error_msg},
                to=sid,
            )
            return

        await sio.emit(
            "calibrate_stop_recording_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {
                    "message": "运动范围记录完成",
                    "mins": {k: int(v) for k, v in mins.items()},
                    "maxes": {k: int(v) for k, v in maxes.items()},
                },
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_stop_recording error: {e}", exc_info=True)
        try:
            with session_lock:
                if session_id in calibration_sessions:
                    calibration_sessions[session_id]["device"].disconnect()
                    del calibration_sessions[session_id]
        except:
            pass
        await sio.emit(
            "calibrate_stop_recording_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_save(sid, data):
    """保存校准结果"""
    from app.api.calibrate import calibration_sessions, session_lock, get_config_path
    from lerobot.motors import MotorCalibration

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise ValueError("校准会话不存在")

        if session["step"] != "recording_stopped":
            raise ValueError("必须先完成运动范围记录")

        device = session["device"]
        homing_offsets = session["homing_offsets"]
        range_mins = session["range_mins"]
        range_maxes = session["range_maxes"]

        calibration = {}
        for motor, m in device.bus.motors.items():
            calibration[motor] = MotorCalibration(
                id=m.id,
                drive_mode=0,
                homing_offset=homing_offsets[motor],
                range_min=range_mins[motor],
                range_max=range_maxes[motor],
            )

        device.bus.write_calibration(calibration)
        device.calibration = calibration

        custom_config_path = get_config_path(session["arm_type"], session["arm_id"])
        custom_config_path.parent.mkdir(parents=True, exist_ok=True)
        device.calibration_fpath = custom_config_path
        device._save_calibration()
        config_path = str(device.calibration_fpath)

        device.disconnect()
        with session_lock:
            del calibration_sessions[session_id]

        await sio.emit(
            "calibrate_save_resp",
            {
                "requestId": request_id,
                "code": 0,
                "data": {"message": "校准成功完成", "config_path": config_path},
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_save error: {e}", exc_info=True)
        try:
            with session_lock:
                if session_id in calibration_sessions:
                    calibration_sessions[session_id]["device"].disconnect()
                    del calibration_sessions[session_id]
        except:
            pass
        await sio.emit(
            "calibrate_save_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_cancel(sid, data):
    """取消校准"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            await sio.emit(
                "calibrate_cancel_resp",
                {"requestId": request_id, "code": 0, "data": {"message": "会话已不存在"}},
                to=sid,
            )
            return

        try:
            session["device"].disconnect()
        except Exception as ex:
            logger.warning(f"断开设备时出错: {ex}")

        with session_lock:
            del calibration_sessions[session_id]

        logger.info(f"校准已取消: {session_id}")
        await sio.emit(
            "calibrate_cancel_resp",
            {"requestId": request_id, "code": 0, "data": {"message": "校准已安全取消"}},
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_cancel error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_cancel_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


@sio.event
async def calibrate_manual_joint_update(sid, data):
    """接收用户手动输入的关节值"""
    from app.api.calibrate import calibration_sessions, session_lock

    request_id = data.get("requestId")
    session_id = data.get("session_id")
    joints = data.get("joints", {})  # {motor_name: value, ...}
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if session:
            with session_lock:
                if "manual_overrides" not in session:
                    session["manual_overrides"] = {}
                session["manual_overrides"].update(joints)
            logger.info(f"手动关节值更新: session={session_id}, joints={joints}")

        await sio.emit(
            "calibrate_manual_joint_update_resp",
            {
                "requestId": request_id,
                "code": 0,
                "message": f"已收到关节值更新: {joints}",
            },
            to=sid,
        )
    except Exception as e:
        logger.error(f"calibrate_manual_joint_update error: {e}", exc_info=True)
        await sio.emit(
            "calibrate_manual_joint_update_resp",
            {"requestId": request_id, "code": 1, "message": str(e)},
            to=sid,
        )


# 辅助函数：向特定命令的订阅者发送消息
async def emit_command_output(command_id: str, line: str, level: str = "info"):
    """
    向订阅了特定命令的客户端发送输出

    Args:
        command_id: 命令ID
        line: 输出行
        level: 日志级别 (info/warning/error)
    """
    await sio.emit(
        "command_output",
        {
            "commandId": command_id,
            "line": line,
            "level": level,
        },
        room=command_id,
    )


async def emit_command_status(command_id: str, status: str, exit_code: int = None):
    """
    向订阅了特定命令的客户端发送状态更新

    Args:
        command_id: 命令ID
        status: 状态 (running/completed/failed/stopped)
        exit_code: 退出码
    """
    payload = {
        "commandId": command_id,
        "status": status,
    }
    if exit_code is not None:
        payload["exitCode"] = exit_code

    await sio.emit(
        "command_status",
        payload,
        room=command_id,
    )


async def emit_input_required(command_id: str, prompt: str):
    """
    向订阅了特定命令的客户端发送需要输入的请求

    Args:
        command_id: 命令ID
        prompt: 提示信息
    """
    await sio.emit(
        "input_required",
        {
            "commandId": command_id,
            "prompt": prompt,
            "options": ["confirm", "cancel"],
        },
        room=command_id,
    )
