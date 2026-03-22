import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.response import ApiResponse
from app.utils.port_utils import PortUtils
from app.services.process_manager import process_manager
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


class GrantPermissionRequest(BaseModel):
    """授予权限请求"""

    port: str


@router.get("/list")
async def list_ports():
    """列出所有串口"""
    try:
        ports = PortUtils.list_ports()
        # 返回所有串口设备的[{'path': ,'description': , 'hwid': }]
        port_data = [port.model_dump() for port in ports]
        return ApiResponse.success(data={"ports": port_data})
    except Exception as e:
        logger.error(f"Error listing ports: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/find")
async def find_port():
    """
    交互式查找端口

    执行 lerobot-find-port 命令并返回命令ID
    实际输出通过 WebSocket 推送
    """
    try:
        from app.websocket import emit_command_output, emit_command_status
        import asyncio

        # 构建命令
        command = "lerobot-find-port"
        cwd = settings.LEROBOT_PATH if hasattr(settings, "LEROBOT_PATH") else None

        logger.info(f"Starting find port command: {command}")

        # 使用列表存储command_id（闭包共享）
        cmd_container = {"cmd_id": None}

        # 定义输出回调函数
        async def output_callback(line: str):
            """输出回调:通过WebSocket推送"""
            if cmd_container["cmd_id"]:
                await emit_command_output(cmd_container["cmd_id"], line)

        # 定义错误回调函数
        async def error_callback(error: str):
            """错误回调"""
            if cmd_container["cmd_id"]:
                await emit_command_output(cmd_container["cmd_id"], error, level="error")

        # 异步执行命令
        async def execute_async():
            cmd_info = await process_manager.execute_command(
                command=command,
                cwd=cwd,
                output_callback=output_callback,
                error_callback=error_callback,
            )
            cmd_container["cmd_id"] = cmd_info.command_id

            # 命令完成后,发送状态更新
            await emit_command_status(
                cmd_info.command_id, cmd_info.status.value, cmd_info.exit_code
            )

            # 尝试解析输出找到端口
            port = PortUtils.parse_find_port_output(cmd_info.output)
            if port:
                await emit_command_output(
                    cmd_info.command_id, f"✅ Port found: {port}", level="info"
                )

            return cmd_info

        # 创建任务
        task = asyncio.create_task(execute_async())

        # 等待一小段时间以获取command_id
        await asyncio.sleep(0.15)

        # 获取最新的命令信息
        all_commands = process_manager.get_all_commands()
        if all_commands:
            latest_cmd_id = list(all_commands.keys())[-1]
            cmd_container["cmd_id"] = latest_cmd_id
            return ApiResponse.success(
                data={"commandId": latest_cmd_id, "status": "running"}
            )
        else:
            return ApiResponse.success(
                data={"commandId": "unknown", "status": "running"}
            )

    except Exception as e:
        logger.error(f"Error starting find port command: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/permission")
async def check_port_permission(port: str):
    """检查端口权限"""
    try:
        permission = PortUtils.check_port_permission(port)
        return ApiResponse.success(data=permission.model_dump())
    except Exception as e:
        logger.error(f"Error checking port permission: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/grant-permission")
async def grant_port_permission(request: GrantPermissionRequest):
    """授予端口权限"""
    try:
        success = PortUtils.grant_port_permission(request.port)

        if success:
            # 重新检查权限
            permission = PortUtils.check_port_permission(request.port)
            return ApiResponse.success(
                message="Permission granted successfully",
                data={"port": request.port, "new_mode": permission.mode},
            )
        else:
            return ApiResponse.error(
                code=1004, message="Failed to grant permission"
            )

    except Exception as e:
        logger.error(f"Error granting port permission: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
