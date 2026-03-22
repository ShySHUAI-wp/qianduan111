from fastapi import APIRouter
import platform
import sys
from app.models.response import ApiResponse
from app.config import settings

router = APIRouter()


@router.get("/info")
async def get_system_info():
    """获取系统信息"""
    return ApiResponse.success(
        data={
            "platform": platform.system(),
            "version": platform.release(),
            "lerobot_path": settings.LEROBOT_PATH,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        }
    )
