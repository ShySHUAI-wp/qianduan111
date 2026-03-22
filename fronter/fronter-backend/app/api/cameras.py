import logging
import cv2
import threading
import asyncio
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from app.models.response import ApiResponse
from app.utils.camera_utils import CameraUtils
from app.services.camera_stream_manager import camera_stream_manager
from lerobot.cameras.opencv.camera_opencv import OpenCVCamera
from lerobot.cameras.opencv.configuration_opencv import OpenCVCameraConfig, ColorMode

logger = logging.getLogger(__name__)

router = APIRouter()

# 优化会话结构：增加状态标识，避免重复释放
camera_sessions = {}
session_lock = threading.Lock()
# 会话状态：idle(空闲), streaming(流传输中), stopping(停止中)
SESSION_STATUS = {"IDLE": "idle", "STREAMING": "streaming", "STOPPING": "stopping"}

@router.get("/list")
async def list_cameras(camera_type: str = Query(default="opencv", description="相机类型: opencv, realsense, all")):
    """
    查找系统中所有可用的相机

    Args:
        camera_type: 相机类型，可选值：opencv, realsense, all

    Returns:
        相机列表，包含相机名称、类型、标识符、默认配置等信息
    """
    try:
        cameras = CameraUtils.list_cameras(camera_type=camera_type)
        return ApiResponse.success(data={"cameras": cameras})
    except Exception as e:
        return ApiResponse.error(message=f"查找相机失败: {str(e)}")


@router.get("/permission")
async def check_camera_permission(device: str):
    """检查相机权限"""
    # TODO: 实现权限检查
    return ApiResponse.success(
        data={"device": device, "readable": True, "writable": True, "mode": "0666"}
    )


async def generate_mjpeg_stream(camera_id: str):
    """
    生成 MJPEG 流（适配 lerobot 的 OpenCVCamera）
    """
    logger.info(f"[GENERATOR] 进入生成器，camera_id: {camera_id}")
    print(f"[DEBUG] 生成器已启动，camera_id: {camera_id}")
    
    # 获取会话
    with session_lock:
        session = camera_sessions.get(camera_id)
    
    if not session or session["status"] != SESSION_STATUS["STREAMING"]:
        logger.error(f"[GENERATOR] 无效会话或非流传输状态，camera_id: {camera_id}")
        return
    
    cap = session["cap"]
    stop_event = session["stop_event"]
    n = 0

    try:
        loop = asyncio.get_event_loop()  # 获取事件循环，用于异步执行read

        while not stop_event.is_set():
            # 检查会话状态，提前退出
            with session_lock:
                current_session = camera_sessions.get(camera_id)
                if not current_session or current_session["status"] != SESSION_STATUS["STREAMING"]:
                    break

            try:
                # 异步读取帧（lerobot 的 OpenCVCamera.read() 直接返回帧数据，不是元组）
                frame = await asyncio.wait_for(
                    loop.run_in_executor(None, cap.read),
                    timeout=5.0
                )

                # 检查帧是否有效（lerobot返回None表示读取失败）
                if frame is None or frame.size == 0:
                    logger.warning(f"[GENERATOR] Empty frame from {camera_id}")
                    await asyncio.sleep(0.01)
                    continue

                n += 1
                # RGB 转 BGR（OpenCV 编码需要）
                frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

                # 停止信号触发，立即退出
                if stop_event.is_set():
                    logger.info(f"[GENERATOR] Stop signal received, exiting")
                    break

                # 编码为 JPEG（用 BGR 帧）
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 70]
                _, buffer = cv2.imencode('.jpg', frame_bgr, encode_param)

                # 生成标准 MJPEG 帧
                yield b'--frame\r\n'
                yield b'Content-Type: image/jpeg\r\n'
                yield f'Content-Length: {len(buffer)}\r\n\r\n'.encode('utf-8')
                yield buffer.tobytes()
                yield b'\r\n'

                print(f'生成了{n}帧')

            except asyncio.TimeoutError:
                logger.error(f"[GENERATOR] 读取帧超时（5秒），camera_id: {camera_id}")
                break
            except RuntimeError as e:
                if "read failed" in str(e) and stop_event.is_set():
                    logger.info(f"[GENERATOR] 相机已停止，读取失败（正常退出）: {e}")
                    break
                else:
                    logger.error(f"[GENERATOR] 读取帧运行时异常: {e}", exc_info=True)
                    break
            except Exception as e:
                logger.error(f"[GENERATOR] 帧处理异常: {e}", exc_info=True)
                break

    finally:
        print('生成器结束了')
        logger.info(f"[GENERATOR] Stream ended for {camera_id}, total frames: {n}")

        # 生成器结束后，检查会话是否还存在（可能已被stop_camera清理）
        with session_lock:
            if camera_id in camera_sessions:
                current_session = camera_sessions[camera_id]
                logger.info(f"[GENERATOR] 清理残留会话，camera_id: {camera_id}")

                # 如果会话还存在，说明是客户端断开或异常退出（非正常停止）
                # 这种情况下需要手动清理资源
                try:
                    current_session["stop_event"].set()
                    current_session["cap"].disconnect()
                    logger.info(f"[GENERATOR] 相机资源已释放（异常退出），camera_id: {camera_id}")
                except Exception as e:
                    logger.warning(f"[GENERATOR] 释放资源失败: {e}")
                finally:
                    # 删除会话
                    del camera_sessions[camera_id]
                    logger.info(f"[GENERATOR] 会话已删除（异常退出），camera_id: {camera_id}")


@router.get("/stream/{camera_id:path}")
async def stream_camera(camera_id: str):
    """
    开始相机流传输（MJPEG 格式）

    Args:
        camera_id: 相机标识符（设备路径或索引，支持包含斜杠的路径如 /dev/video0）

    Returns:
        MJPEG 视频流
    """
    try:
        logger.info(f"[STREAM] Received stream request for camera {camera_id}")
        print('发送了数据')
        # 先停止旧会话（加锁确保原子操作）
        with session_lock:
            if camera_id in camera_sessions:
                old_session = camera_sessions[camera_id]
                logger.warning(f"[STREAM] Stopping old session for {camera_id}")
                old_session["stop_event"].set()
                old_session["status"] = SESSION_STATUS["STOPPING"]
                try:
                    old_session["cap"].disconnect()
                except Exception as e:
                    logger.warning(f"[STREAM] 释放旧会话资源失败: {e}")
                del camera_sessions[camera_id]
        
        # 解析相机ID
        try:
            index_or_path = int(camera_id)
        except ValueError:
            index_or_path = camera_id

        # 创建相机配置和实例
        config = OpenCVCameraConfig(
            index_or_path=index_or_path,
            color_mode=ColorMode.RGB,
            fps=30,
            width=640,
            height=480,
            warmup_s=0
        )
        
        # 重新创建相机实例（关键：每次都新建，不复用旧实例）
        cap = OpenCVCamera(config)
        cap.connect(warmup=False)

        # 检查相机是否打开
        if not cap.is_connected:
            raise HTTPException(status_code=400, detail=f"无法打开相机 {camera_id}")
        
        # 创建停止事件和会话（标记为流传输状态）
        stop_event = threading.Event()
        with session_lock:
            camera_sessions[camera_id] = {
                "cap": cap,
                "stop_event": stop_event,
                "status": SESSION_STATUS["STREAMING"],
                "thread": None
            }
        
        logger.info(f"[STREAM] Camera {camera_id} opened successfully")
        
        # 返回流
        return StreamingResponse(
            generate_mjpeg_stream(camera_id),
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",  # 新增：标记资源已过期
                "Connection": "keep-alive",
                # 补充跨域头，防止单独拦截
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )

    except Exception as e:
        logger.error(f"[STREAM] Error starting stream: {e}", exc_info=True)
        # 清理失败的资源
        with session_lock:
            if camera_id in camera_sessions:
                try:
                    camera_sessions[camera_id]["cap"].disconnect()
                except:
                    pass
                del camera_sessions[camera_id]
        raise HTTPException(status_code=500, detail=f"启动相机流失败: {str(e)}")


@router.post("/stop/{camera_id:path}")
async def stop_camera(camera_id: str):
    """
    停止相机流

    Args:
        camera_id: 相机标识符（支持包含斜杠的路径）

    Returns:
        停止确认
    """
    print('触发停止')
    logger.info(f"[STOP] Received stop request for camera {camera_id}")

    # 加锁原子操作，避免并发问题
    with session_lock:
        session = camera_sessions.get(camera_id)

        if not session:
            logger.warning(f"[STOP] Session not found for {camera_id}（已被清理）")
            return ApiResponse.success(
                data={"camera_id": camera_id, "stopped": True, "message": "会话已清理"}
            )

        # 触发停止信号
        session["stop_event"].set()

        # 直接释放相机资源（关键修复：确保资源被释放）
        try:
            session["cap"].disconnect()
            logger.info(f"[STOP] 相机资源已释放，camera_id: {camera_id}")
        except Exception as e:
            logger.warning(f"[STOP] 释放资源失败: {e}")
        finally:
            # 删除会话
            if camera_id in camera_sessions:
                del camera_sessions[camera_id]
                logger.info(f"[STOP] 会话已删除，camera_id: {camera_id}")

    logger.info(f"[STOP] 相机 {camera_id} 已完全停止")
    return ApiResponse.success(data={"camera_id": camera_id, "stopped": True})
