"""
相机工具类，用于查找和管理相机设备
"""

import logging
from typing import Any, List, Dict
from pathlib import Path

logger = logging.getLogger(__name__)


class CameraUtils:
    """相机工具类"""

    @staticmethod
    def list_cameras(camera_type: str = "opencv") -> List[Dict[str, Any]]:
        """
        查找系统中所有可用的相机

        Args:
            camera_type: 相机类型 ("opencv" 或 "realsense")

        Returns:
            相机信息列表，每个相机包含以下字段：
            - name: 相机名称
            - type: 相机类型 (OpenCV/RealSense)
            - id: 相机标识符 (设备路径或索引)
            - backend_api: 后端 API (V4L2/AVFoundation/DSHOW)
            - default_stream_profile: 默认流配置
                - format: 格式代码
                - fourcc: FOURCC 编码
                - width: 宽度
                - height: 高度
                - fps: 帧率
        """
        camera_type = camera_type.lower()
        all_cameras: List[Dict[str, Any]] = []

        if camera_type in ["opencv", "all"]:
            opencv_cameras = CameraUtils._find_opencv_cameras()
            all_cameras.extend(opencv_cameras)

        if camera_type in ["realsense", "all"]:
            realsense_cameras = CameraUtils._find_realsense_cameras()
            all_cameras.extend(realsense_cameras)

        return all_cameras

    @staticmethod
    def _find_opencv_cameras() -> List[Dict[str, Any]]:
        """查找 OpenCV 相机"""
        try:
            from lerobot.cameras.opencv.camera_opencv import OpenCVCamera

            logger.info("Searching for OpenCV cameras...")
            opencv_cameras = OpenCVCamera.find_cameras()
            logger.info(f"Found {len(opencv_cameras)} OpenCV cameras.")
            return opencv_cameras
        except Exception as e:
            logger.error(f"Error finding OpenCV cameras: {e}")
            return []

    @staticmethod
    def _find_realsense_cameras() -> List[Dict[str, Any]]:
        """查找 RealSense 相机"""
        try:
            from lerobot.cameras.realsense.camera_realsense import RealSenseCamera

            logger.info("Searching for RealSense cameras...")
            realsense_cameras = RealSenseCamera.find_cameras()
            logger.info(f"Found {len(realsense_cameras)} RealSense cameras.")
            return realsense_cameras
        except ImportError:
            logger.warning(
                "Skipping RealSense camera search: pyrealsense2 library not found or not importable."
            )
            return []
        except Exception as e:
            logger.error(f"Error finding RealSense cameras: {e}")
            return []
