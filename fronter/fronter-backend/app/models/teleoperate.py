from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class TeleoperateRequest(BaseModel):
    """遥操请求模型"""

    # Robot配置
    robot_type: str = Field(..., description="机器人类型，如 bi_so100_follower")
    robot_left_arm_port: Optional[str] = Field(
        None, description="机器人左臂端口，如 /dev/tty.usbmodem5A460851411"
    )
    robot_right_arm_port: Optional[str] = Field(
        None, description="机器人右臂端口，如 /dev/tty.usbmodem5A460812391"
    )
    robot_port: Optional[str] = Field(None, description="单臂机器人端口")
    robot_id: str = Field(..., description="机器人ID")

    # Teleop配置
    teleop_type: str = Field(..., description="遥操类型，如 bi_so100_leader")
    teleop_left_arm_port: Optional[str] = Field(
        None, description="遥操左臂端口，如 /dev/tty.usbmodem5A460828611"
    )
    teleop_right_arm_port: Optional[str] = Field(
        None, description="遥操右臂端口，如 /dev/tty.usbmodem5A460826981"
    )
    teleop_port: Optional[str] = Field(None, description="单臂遥操端口")
    teleop_id: str = Field(..., description="遥操ID")

    # 相机配置
    enable_cameras: bool = Field(False, description="是否启用相机")
    cameras: Optional[Dict[str, Dict[str, Any]]] = Field(
        None,
        description="相机配置，格式: {name: {type, index_or_path, width, height, fps, fourcc, rotation?}}",
    )

    # 显示选项
    fps: int = Field(60, description="控制循环帧率")
    display_data: bool = Field(False, description="是否显示数据界面")
    display_ip: Optional[str] = Field(None, description="Rerun服务器IP")
    display_port: Optional[int] = Field(None, description="Rerun服务器端口")
    display_compressed_images: bool = Field(False, description="是否压缩图像")

    # 其他选项
    teleop_time_s: Optional[float] = Field(None, description="遥操时长（秒）")


class TeleoperateResponse(BaseModel):
    """遥操响应模型"""

    command_id: str = Field(..., description="命令ID")
    status: str = Field(..., description="命令状态")
    rerun_url: Optional[str] = Field(None, description="Rerun可视化URL")
