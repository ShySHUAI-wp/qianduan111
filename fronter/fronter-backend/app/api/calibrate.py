import logging
import threading
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.response import ApiResponse
from app.config import settings, get_project_root
from lerobot.robots import make_robot_from_config
from lerobot.teleoperators import make_teleoperator_from_config
from lerobot.robots.so101_follower.config_so101_follower import SO101FollowerConfig
from lerobot.robots.so100_follower.config_so100_follower import SO100FollowerConfig
from lerobot.robots.bi_so100_follower.config_bi_so100_follower import BiSO100FollowerConfig
from lerobot.teleoperators.so101_leader.config_so101_leader import SO101LeaderConfig
from lerobot.teleoperators.so100_leader.config_so100_leader import SO100LeaderConfig
from lerobot.teleoperators.bi_so100_leader.config_bi_so100_leader import BiSO100LeaderConfig
import os
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter()

# 校准会话管理
calibration_sessions = {}
session_lock = threading.Lock()


class CalibrateStartRequest(BaseModel):
    arm_type: str  # 'so101_leader', 'so101_follower', 'so100_leader', 'so100_follower', 'bi_so100_leader', 'bi_so100_follower'
    port: Optional[str] = None  # 单臂端口
    left_arm_port: Optional[str] = None  # 双臂左臂端口
    right_arm_port: Optional[str] = None  # 双臂右臂端口
    arm_id: str  # 机械臂ID


class CalibrateStepRequest(BaseModel):
    session_id: str


def get_config_path(arm_type: str, arm_id: str) -> Path:
    """获取校准配置文件路径 (保存在项目根目录下的calibration文件夹)"""
    project_root = get_project_root()
    calibration_dir = project_root / settings.CALIBRATION_PATH

    # 根据类型创建子目录
    if 'leader' in arm_type:
        base_path = calibration_dir / "teleoperators" / arm_type
    else:
        base_path = calibration_dir / "robots" / arm_type

    return base_path / f"{arm_id}.json"


@router.post("/check-config")
async def check_calibration_config(request: CalibrateStartRequest):
    """检查是否存在校准配置文件"""
    try:
        config_path = get_config_path(request.arm_type, request.arm_id)
        exists = config_path.exists()

        return ApiResponse.success(data={
            "exists": exists,
            "path": str(config_path)
        })
    except Exception as e:
        logger.error(f"检查配置文件失败: {e}", exc_info=True)
        return ApiResponse.error(message=f"检查配置文件失败: {str(e)}")


@router.post("/start")
async def start_calibration(request: CalibrateStartRequest):
    """启动校准流程"""
    try:
        # 验证输入
        if 'bi_so100' in request.arm_type:
            # 双臂需要两个端口
            if not request.left_arm_port or not request.right_arm_port:
                raise HTTPException(status_code=400, detail="双臂机械臂需要提供左臂和右臂端口")
        else:
            # 单臂需要一个端口
            if not request.port:
                raise HTTPException(status_code=400, detail="单臂机械臂需要提供端口")

        # 创建设备配置
        config = None
        device_type = "teleop" if "leader" in request.arm_type else "robot"

        if request.arm_type == "so101_leader":
            config = SO101LeaderConfig(port=request.port, id=request.arm_id)
        elif request.arm_type == "so100_leader":
            config = SO100LeaderConfig(port=request.port, id=request.arm_id)
        elif request.arm_type == "bi_so100_leader":
            config = BiSO100LeaderConfig(
                left_arm_port=request.left_arm_port,
                right_arm_port=request.right_arm_port,
                id=request.arm_id
            )
        elif request.arm_type == "so101_follower":
            config = SO101FollowerConfig(port=request.port, id=request.arm_id)
        elif request.arm_type == "so100_follower":
            config = SO100FollowerConfig(port=request.port, id=request.arm_id)
        elif request.arm_type == "bi_so100_follower":
            config = BiSO100FollowerConfig(
                left_arm_port=request.left_arm_port,
                right_arm_port=request.right_arm_port,
                id=request.arm_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"不支持的机械臂类型: {request.arm_type}")

        # 创建设备实例
        if device_type == "teleop":
            device = make_teleoperator_from_config(config)
        else:
            device = make_robot_from_config(config)

        # 连接设备（不自动校准）
        device.connect(calibrate=False)

        # 禁用扭矩，允许手动移动
        device.bus.disable_torque()

        # 生成会话ID
        import uuid
        session_id = str(uuid.uuid4())

        # 保存会话
        with session_lock:
            calibration_sessions[session_id] = {
                "device": device,
                "config": config,
                "arm_type": request.arm_type,
                "arm_id": request.arm_id,
                "step": "started",
                "homing_offsets": None,
                "range_mins": None,
                "range_maxes": None,
                "recording": False
            }

        logger.info(f"启动校准会话: {session_id}, 类型: {request.arm_type}, ID: {request.arm_id}")

        return ApiResponse.success(data={
            "session_id": session_id,
            "message": "校准会话已启动，设备已连接"
        })

    except Exception as e:
        logger.error(f"启动校准失败: {e}", exc_info=True)
        return ApiResponse.error(message=f"启动校准失败: {str(e)}")


@router.post("/use-existing")
async def use_existing_calibration(request: CalibrateStepRequest):
    """使用已有的校准文件"""
    try:
        with session_lock:
            session = calibration_sessions.get(request.session_id)

        if not session:
            raise HTTPException(status_code=404, detail="校准会话不存在")

        device = session["device"]

        # 读取并写入已有的校准文件
        if device.calibration:
            device.bus.write_calibration(device.calibration)
            logger.info(f"已使用现有校准文件: {session['arm_id']}")

            # 断开设备
            device.disconnect()

            # 清理会话
            with session_lock:
                del calibration_sessions[request.session_id]

            return ApiResponse.success(data={
                "message": "已成功应用现有校准文件"
            })
        else:
            raise HTTPException(status_code=404, detail="未找到校准文件")

    except Exception as e:
        logger.error(f"使用现有校准失败: {e}", exc_info=True)
        # 清理会话
        try:
            with session_lock:
                if request.session_id in calibration_sessions:
                    calibration_sessions[request.session_id]["device"].disconnect()
                    del calibration_sessions[request.session_id]
        except:
            pass
        return ApiResponse.error(message=f"使用现有校准失败: {str(e)}")


@router.post("/set-middle")
async def set_middle_position(request: CalibrateStepRequest):
    """设置中间位置（用户应该已经手动将机械臂移动到中间位置）"""
    try:
        logger.info(f"[SET-MIDDLE] Received request for session: {request.session_id}")

        with session_lock:
            session = calibration_sessions.get(request.session_id)
            if session:
                logger.info(f"[SET-MIDDLE] Current session state before update: step={session.get('step', 'unknown')}, recording={session.get('recording', False)}")

        if not session:
            logger.error(f"[SET-MIDDLE] Session not found: {request.session_id}")
            raise HTTPException(status_code=404, detail="校准会话不存在")

        device = session["device"]

        # 读取当前位置
        current_positions = device.bus.sync_read("Present_Position", normalize=False)
        logger.info(f"[SET-MIDDLE] 当前位置: {current_positions}")

        # 设置半圈归零偏移（将当前位置设为中间位置）
        homing_offsets = device.bus.set_half_turn_homings()

        # 保存到会话 - 直接操作 calibration_sessions 字典以确保更新生效
        with session_lock:
            calibration_sessions[request.session_id]["homing_offsets"] = homing_offsets
            calibration_sessions[request.session_id]["step"] = "middle_set"
            # 验证更新是否成功
            updated_step = calibration_sessions[request.session_id]["step"]
            logger.info(f"[SET-MIDDLE] Session step updated to '{updated_step}' for session: {request.session_id}")
            logger.info(f"[SET-MIDDLE] Session state after update: {calibration_sessions[request.session_id]}")

        logger.info(f"[SET-MIDDLE] 中间位置已设置: {homing_offsets}")

        return ApiResponse.success(data={
            "homing_offsets": {k: int(v) for k, v in homing_offsets.items()},
            "message": "中间位置已设置",
            "step": "middle_set"  # 返回当前步骤供前端验证
        })

    except Exception as e:
        logger.error(f"设置中间位置失败: {e}", exc_info=True)
        # 清理会话
        try:
            with session_lock:
                if request.session_id in calibration_sessions:
                    calibration_sessions[request.session_id]["device"].disconnect()
                    del calibration_sessions[request.session_id]
        except:
            pass
        return ApiResponse.error(message=f"设置中间位置失败: {str(e)}")


@router.post("/start-recording")
async def start_recording_range(request: CalibrateStepRequest):
    """开始记录运动范围"""
    try:
        logger.info(f"[START-RECORDING] Received request for session: {request.session_id}")

        with session_lock:
            session = calibration_sessions.get(request.session_id)
            if session:
                current_step = session.get("step", "unknown")
                logger.info(f"[START-RECORDING] Session state: step={current_step}, recording={session.get('recording', False)}, has_homing_offsets={session.get('homing_offsets') is not None}")
                logger.info(f"[START-RECORDING] Full session keys: {list(session.keys())}")

        if not session:
            logger.error(f"[START-RECORDING] Session not found: {request.session_id}")
            logger.error(f"[START-RECORDING] Available sessions: {list(calibration_sessions.keys())}")
            raise HTTPException(status_code=404, detail="校准会话不存在")

        current_step = session.get("step", "unknown")

        if current_step != "middle_set":
            logger.error(
                f"[START-RECORDING] Invalid step: expected 'middle_set', got '{current_step}'. "
                f"Session ID: {request.session_id}"
            )
            raise HTTPException(status_code=400, detail=f"必须先设置中间位置（当前步骤：{current_step}）")

        # 标记开始记录 - 直接操作 calibration_sessions 字典
        with session_lock:
            device = calibration_sessions[request.session_id]["device"]
            start_positions = device.bus.sync_read("Present_Position", normalize=False)

            calibration_sessions[request.session_id]["recording"] = True
            calibration_sessions[request.session_id]["step"] = "recording"
            calibration_sessions[request.session_id]["range_mins"] = start_positions.copy()
            calibration_sessions[request.session_id]["range_maxes"] = start_positions.copy()

            logger.info(f"[START-RECORDING] Session step updated to 'recording'")
            logger.info(f"[START-RECORDING] Initial positions: {start_positions}")

        logger.info(f"[START-RECORDING] 开始记录运动范围")

        return ApiResponse.success(data={
            "message": "开始记录运动范围，请移动机械臂到各个关节的最大和最小角度"
        })

    except Exception as e:
        logger.error(f"开始记录失败: {e}", exc_info=True)
        return ApiResponse.error(message=f"开始记录失败: {str(e)}")


@router.get("/recording-status/{session_id}")
async def get_recording_status(session_id: str):
    """获取当前记录状态（用于实时显示）"""
    try:
        with session_lock:
            session = calibration_sessions.get(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="校准会话不存在")

        if not session["recording"]:
            return ApiResponse.success(data={"recording": False})

        device = session["device"]

        # 读取当前位置并更新范围
        current_positions = device.bus.sync_read("Present_Position", normalize=False)

        with session_lock:
            mins = session["range_mins"]
            maxes = session["range_maxes"]

            # 更新最小值和最大值
            for motor, pos in current_positions.items():
                mins[motor] = min(pos, mins[motor])
                maxes[motor] = max(pos, maxes[motor])

            session["range_mins"] = mins
            session["range_maxes"] = maxes

        # 格式化数据用于显示
        status_data = []
        for motor in current_positions.keys():
            status_data.append({
                "motor": motor,
                "min": int(mins[motor]),
                "current": int(current_positions[motor]),
                "max": int(maxes[motor])
            })

        return ApiResponse.success(data={
            "recording": True,
            "positions": status_data
        })

    except Exception as e:
        logger.error(f"获取记录状态失败: {e}", exc_info=True)
        return ApiResponse.error(message=f"获取记录状态失败: {str(e)}")


@router.post("/stop-recording")
async def stop_recording_range(request: CalibrateStepRequest):
    """停止记录运动范围并验证"""
    try:
        with session_lock:
            session = calibration_sessions.get(request.session_id)

        if not session:
            raise HTTPException(status_code=404, detail="校准会话不存在")

        if not session["recording"]:
            raise HTTPException(status_code=400, detail="未在记录状态")

        # 停止记录
        with session_lock:
            session["recording"] = False
            session["step"] = "recording_stopped"
            mins = session["range_mins"]
            maxes = session["range_maxes"]

        # 验证：检查是否有关节的最小值和最大值相同
        same_min_max = [motor for motor in mins.keys() if mins[motor] == maxes[motor]]

        if same_min_max:
            error_msg = f"以下关节的最小值和最大值相同，未移动到极限位置: {', '.join(same_min_max)}"
            logger.warning(error_msg)

            # 清理会话
            device = session["device"]
            device.disconnect()
            with session_lock:
                del calibration_sessions[request.session_id]

            return ApiResponse.error(message=error_msg)

        logger.info(f"运动范围记录完成并验证通过")

        return ApiResponse.success(data={
            "message": "运动范围记录完成",
            "mins": {k: int(v) for k, v in mins.items()},
            "maxes": {k: int(v) for k, v in maxes.items()}
        })

    except Exception as e:
        logger.error(f"停止记录失败: {e}", exc_info=True)
        # 清理会话
        try:
            with session_lock:
                if request.session_id in calibration_sessions:
                    calibration_sessions[request.session_id]["device"].disconnect()
                    del calibration_sessions[request.session_id]
        except:
            pass
        return ApiResponse.error(message=f"停止记录失败: {str(e)}")


@router.post("/save")
async def save_calibration(request: CalibrateStepRequest):
    """保存校准结果"""
    try:
        with session_lock:
            session = calibration_sessions.get(request.session_id)

        if not session:
            raise HTTPException(status_code=404, detail="校准会话不存在")

        if session["step"] != "recording_stopped":
            raise HTTPException(status_code=400, detail="必须先完成运动范围记录")

        device = session["device"]
        homing_offsets = session["homing_offsets"]
        range_mins = session["range_mins"]
        range_maxes = session["range_maxes"]

        # 构建校准数据
        from lerobot.motors import MotorCalibration
        calibration = {}
        for motor, m in device.bus.motors.items():
            calibration[motor] = MotorCalibration(
                id=m.id,
                drive_mode=0,
                homing_offset=homing_offsets[motor],
                range_min=range_mins[motor],
                range_max=range_maxes[motor],
            )

        # 写入校准到设备
        device.bus.write_calibration(calibration)

        # 保存校准文件到自定义路径
        device.calibration = calibration

        # 使用自定义校准路径
        custom_config_path = get_config_path(session["arm_type"], session["arm_id"])
        custom_config_path.parent.mkdir(parents=True, exist_ok=True)
        device.calibration_fpath = custom_config_path

        device._save_calibration()

        config_path = str(device.calibration_fpath)
        logger.info(f"校准文件已保存: {config_path}")

        # 断开设备
        device.disconnect()

        # 清理会话
        with session_lock:
            del calibration_sessions[request.session_id]

        return ApiResponse.success(data={
            "message": "校准成功完成",
            "config_path": config_path
        })

    except Exception as e:
        logger.error(f"保存校准失败: {e}", exc_info=True)
        # 清理会话
        try:
            with session_lock:
                if request.session_id in calibration_sessions:
                    calibration_sessions[request.session_id]["device"].disconnect()
                    del calibration_sessions[request.session_id]
        except:
            pass
        return ApiResponse.error(message=f"保存校准失败: {str(e)}")


@router.post("/cancel")
async def cancel_calibration(request: CalibrateStepRequest):
    """取消校准"""
    try:
        with session_lock:
            session = calibration_sessions.get(request.session_id)

        if not session:
            return ApiResponse.success(data={"message": "会话已不存在"})

        # 断开设备
        try:
            session["device"].disconnect()
        except Exception as e:
            logger.warning(f"断开设备时出错: {e}")

        # 清理会话
        with session_lock:
            del calibration_sessions[request.session_id]

        logger.info(f"校准已取消: {request.session_id}")

        return ApiResponse.success(data={"message": "校准已安全取消"})

    except Exception as e:
        logger.error(f"取消校准失败: {e}", exc_info=True)
        return ApiResponse.error(message=f"取消校准失败: {str(e)}")
