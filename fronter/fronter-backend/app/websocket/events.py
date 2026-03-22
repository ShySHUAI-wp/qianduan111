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
