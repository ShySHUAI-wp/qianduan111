"""
相机流管理器
管理相机连接、视频流和心跳机制
"""

import asyncio
import logging
import time
from typing import Dict, Optional, Any
from threading import Lock

logger = logging.getLogger(__name__)


class CameraSession:
    """相机会话"""

    def __init__(self, camera_id: str, camera_instance: Any):
        self.camera_id = camera_id
        self.camera_instance = camera_instance
        self.is_active = True
        self.created_at = time.time()

    def stop(self):
        """停止会话"""
        logger.info(f"[SESSION] Stopping session for camera {self.camera_id}")
        self.is_active = False
        try:
            if self.camera_instance:
                logger.info(f"[SESSION] Camera instance exists, is_connected: {self.camera_instance.is_connected}")
                if self.camera_instance.is_connected:
                    self.camera_instance.disconnect()
                    logger.info(f"[SESSION] Camera {self.camera_id} disconnected successfully")
                else:
                    logger.warning(f"[SESSION] Camera {self.camera_id} was not connected")
            else:
                logger.warning(f"[SESSION] Camera instance is None for {self.camera_id}")
        except Exception as e:
            logger.error(f"[SESSION] Error disconnecting camera {self.camera_id}: {e}")


class CameraStreamManager:
    """相机流管理器（单例）"""

    _instance: Optional["CameraStreamManager"] = None
    _lock = Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.sessions: Dict[str, CameraSession] = {}
        self.session_lock = Lock()
        self._initialized = True

        logger.info("CameraStreamManager initialized")

    def create_session(self, camera_id: str, camera_instance: Any) -> CameraSession:
        """创建相机会话"""
        with self.session_lock:
            # 如果已存在会话，先停止旧会话
            if camera_id in self.sessions:
                logger.warning(f"Session for camera {camera_id} already exists, stopping old session")
                self.stop_session(camera_id)

            session = CameraSession(camera_id, camera_instance)
            self.sessions[camera_id] = session
            logger.info(f"Created session for camera {camera_id}")
            return session

    def get_session(self, camera_id: str) -> Optional[CameraSession]:
        """获取相机会话"""
        with self.session_lock:
            return self.sessions.get(camera_id)

    def stop_session(self, camera_id: str) -> bool:
        """停止会话"""
        with self.session_lock:
            session = self.sessions.get(camera_id)
            if session:
                session.stop()
                del self.sessions[camera_id]
                logger.info(f"Stopped session for camera {camera_id}")
                return True
            return False

    def get_active_sessions_count(self) -> int:
        """获取活跃会话数"""
        with self.session_lock:
            return len(self.sessions)


# 全局单例实例
camera_stream_manager = CameraStreamManager()
