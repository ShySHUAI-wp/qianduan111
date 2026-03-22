from pydantic import BaseModel
from typing import Optional


class PortInfo(BaseModel):
    """串口信息"""

    path: str
    description: str
    hwid: str


class PortPermission(BaseModel):
    """串口权限信息"""

    port: str
    readable: bool
    writable: bool
    mode: str
    owner: Optional[str] = None
    group: Optional[str] = None


class CameraInfo(BaseModel):
    """相机信息"""

    id: int
    type: str
    resolution: str
    fps: int
    device: str
