from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class CommandStatus(str, Enum):
    """命令状态"""

    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class CommandInfo(BaseModel):
    """命令信息"""

    commandId: str
    status: CommandStatus
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    exitCode: Optional[int] = None
    output: List[str] = []


class CalibrateRequest(BaseModel):
    """校准请求"""

    deviceType: str = Field(..., pattern="^(leader|follower)$")
    port: str = Field(..., pattern="^/dev/tty.*$")
    id: str = Field(default="my_awesome_arm")
