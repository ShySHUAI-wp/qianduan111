import os
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """应用配置"""

    # LeRobot 配置
    LEROBOT_PATH: str = "/home/shuo/cola/lerobot"
    TUTORIAL_PATH: str = "/home/shuo/cola/lerobot_cobot/fronter/turtorial"

    # 服务配置
    MAX_CONCURRENT_COMMANDS: int = 5
    LOG_LEVEL: str = "INFO"

    # CORS 配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


# 全局配置实例
settings = Settings()
