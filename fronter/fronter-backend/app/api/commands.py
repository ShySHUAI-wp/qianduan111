import uuid
import json
import logging
from fastapi import APIRouter, HTTPException
from app.models.response import ApiResponse
from app.models.command import CalibrateRequest
from app.models.teleoperate import TeleoperateRequest
from app.services.command_manager import command_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/calibrate")
async def calibrate(request: CalibrateRequest):
    """执行校准命令"""
    # TODO: 实现校准功能
    return ApiResponse.success(
        data={
            "commandId": "cmd-001",
            "status": "running",
            "command": f"lerobot-calibrate --{request.deviceType}...",
        }
    )


@router.post("/teleoperate")
async def teleoperate(request: TeleoperateRequest):
    print(f'request.enable_cameras is {request.enable_cameras}')
    print(f'request.cameras is {request.cameras}')
    """执行遥操命令"""
    command_id = f"teleop-{uuid.uuid4().hex[:8]}"

    # 构建lerobot-teleoperate命令
    cmd_parts = ["lerobot-teleoperate"]

    # Robot配置
    cmd_parts.append(f"--robot.type={request.robot_type}")
    if request.robot_left_arm_port:
        cmd_parts.append(f"--robot.left_arm_port={request.robot_left_arm_port}")
    if request.robot_right_arm_port:
        cmd_parts.append(f"--robot.right_arm_port={request.robot_right_arm_port}")
    if request.robot_port:
        cmd_parts.append(f"--robot.port={request.robot_port}")
    cmd_parts.append(f"--robot.id={request.robot_id}")

    # Teleop配置
    cmd_parts.append(f"--teleop.type={request.teleop_type}")
    if request.teleop_left_arm_port:
        cmd_parts.append(f"--teleop.left_arm_port={request.teleop_left_arm_port}")
    if request.teleop_right_arm_port:
        cmd_parts.append(f"--teleop.right_arm_port={request.teleop_right_arm_port}")
    if request.teleop_port:
        cmd_parts.append(f"--teleop.port={request.teleop_port}")
    cmd_parts.append(f"--teleop.id={request.teleop_id}")

    # 相机配置
    if request.enable_cameras and request.cameras:
        print('进入camera')
        camera_segments = []
        quote_fields = {"fourcc", "rotation"}  # 需要加双引号的字段（type不需要）
        # 遍历相机配置，手动拼接无引号格式
        for cam_name, cam_config in request.cameras.items():
            # 拼接单个相机配置：key: value, 字符串类型值保留双引号
            prop_list = []
            for k, v in cam_config.items():
                if k in quote_fields:
                    # 字符串值加双引号：fourcc: "MJPG", rotation: "ROTATE_180"
                    prop_list.append(f'{k}: "{v}"')
                else:
                    # 数字类型和type不加引号：type: opencv, index_or_path: 2
                    prop_list.append(f'{k}: {v}')
            props_str = ", ".join(prop_list)
            # 拼接相机项：camera_0: {type: opencv, index_or_path: 2, ...}
            camera_segments.append(f"{cam_name}: {{{props_str}}}")

        # 拼接完整相机配置字符串
        cameras_raw_str = "{ " + ", ".join(camera_segments) + " }"
        # 外层用双引号包裹
        cmd_parts.append(f"--robot.cameras=\"{cameras_raw_str}\"")

    # 显示选项
    cmd_parts.append(f"--fps={request.fps}")
    if request.display_data:
        cmd_parts.append("--display_data=true")
        # 如果指定了IP和端口，添加远程显示配置
        if request.display_ip:
            cmd_parts.append(f"--display_ip={request.display_ip}")
        if request.display_port:
            cmd_parts.append(f"--display_port={request.display_port}")
        if request.display_compressed_images:
            cmd_parts.append("--display_compressed_images=true")

    # 遥操时长 - 遥操模式不限制时长，注释掉
    # if request.teleop_time_s:
    #     cmd_parts.append(f"--teleop_time_s={request.teleop_time_s}")

    command = " ".join(cmd_parts)

    try:
        # 在后台启动进程
        logger.info(f"Starting teleoperate command: {command}")
        print(f"启动: ")
        print(command)
        cmd_process = await command_manager.start_command(command_id, command)

        # 计算Rerun URL
        rerun_url = None
        if request.display_data and not request.display_ip:
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
        raise HTTPException(status_code=500, detail=f"启动遥操失败: {str(e)}")


@router.post("/record")
async def record(request: dict):
    """执行数据采集命令"""
    # TODO: 实现数据采集功能
    return ApiResponse.success(data={"commandId": "cmd-003", "status": "running"})


@router.post("/stop")
async def stop_command(request: dict):
    """停止命令"""
    command_id = request.get("commandId")
    if not command_id:
        raise HTTPException(status_code=400, detail="缺少commandId参数")

    logger.info(f"Stopping command: {command_id}")

    success = await command_manager.stop_command(command_id)

    if not success:
        status = command_manager.get_command_status(command_id)
        if status is None:
            raise HTTPException(status_code=404, detail=f"命令不存在: {command_id}")
        return ApiResponse.error(
            message=f"命令无法停止，当前状态: {status['status']}", data=status
        )

    return ApiResponse.success(data=command_manager.get_command_status(command_id))


@router.get("/status")
async def get_command_status(commandId: str):
    """查询命令状态"""
    logger.debug(f"Querying command status: {commandId}")

    status = command_manager.get_command_status(commandId)

    if status is None:
        raise HTTPException(status_code=404, detail=f"命令不存在: {commandId}")

    return ApiResponse.success(data=status)


@router.get("/output")
async def get_command_output(commandId: str, offset: int = 0, limit: int = 1000):
    """获取命令输出"""
    logger.debug(f"Getting command output: {commandId}, offset={offset}, limit={limit}")

    output = command_manager.get_command_output(commandId, offset, limit)

    if output is None:
        raise HTTPException(status_code=404, detail=f"命令不存在: {commandId}")

    return ApiResponse.success(data=output)


@router.get("/list")
async def list_commands():
    """列出所有命令"""
    commands = command_manager.list_commands()
    return ApiResponse.success(data={"commands": commands, "total": len(commands)})
