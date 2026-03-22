#!/usr/bin/env python

# Copyright 2025 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from dataclasses import dataclass, field

from lerobot.cameras import CameraConfig

from ..config import RobotConfig


@RobotConfig.register_subclass("bi_so100_follower")
@dataclass
class BiSO100FollowerConfig(RobotConfig):
    left_arm_port: str
    right_arm_port: str

    # Optional
    # 配置机械臂断开与控制器的连接时，是否自动禁用电机的扭矩输出
    left_arm_disable_torque_on_disconnect: bool = True
    right_arm_disable_torque_on_disconnect: bool = True
    # 为左机械臂设置安全运动限制，限制电机「目标位置与当前位置的相对差值幅值」，防止单次运动步长过大导致机械臂卡顿、关节损坏或动作失控
    left_arm_max_relative_target: float | dict[str, float] | None = None
    right_arm_max_relative_target: float | dict[str, float] | None = None
    # 配置左机械臂的关节位置数据（观测 / 动作）是否使用角度单位（度） 作为统一格式，默认使用「原始归一化值」
    left_arm_use_degrees: bool = False
    right_arm_use_degrees: bool = False

    # 相机(两机械臂共享)
    cameras: dict[str, CameraConfig] = field(default_factory=dict)
