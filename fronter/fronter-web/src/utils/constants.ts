// API Base URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

// LeRobot 路径
export const LEROBOT_PATH = '/home/shuo/cola/lerobot';

// 默认配置
export const DEFAULT_CONFIG = {
  // 机械臂 ID
  LEADER_ARM_ID: 'my_awesome_leader_arm',
  FOLLOWER_ARM_ID: 'my_awesome_follower_arm',

  // 机械臂类型
  LEADER_TYPE: 'so101_leader',
  FOLLOWER_TYPE: 'so101_follower',

  // 相机默认配置
  CAMERA: {
    WIDTH: 640,
    HEIGHT: 480,
    FPS: 30,
    FOURCC: 'MJPG',
    ROTATION: 'ROTATE_0',
  },

  // 数据集默认配置
  DATASET: {
    NUM_EPISODES: 5,
    EPISODE_TIME_S: 30,
    RESET_TIME_S: 20,
    FPS: 30,
    PUSH_TO_HUB: false,
  },
};

// 旋转角度选项
export const ROTATION_OPTIONS = [
  { label: '0°', value: 'ROTATE_0' },
  { label: '90°', value: 'ROTATE_90' },
  { label: '180°', value: 'ROTATE_180' },
  { label: '270°', value: 'ROTATE_270' },
];

// 相机名称选项
export const CAMERA_NAME_OPTIONS = [
  { label: 'front (前置)', value: 'front' },
  { label: 'side (侧面)', value: 'side' },
  { label: 'top (顶部)', value: 'top' },
];

// 命令状态文本映射
export const COMMAND_STATUS_TEXT = {
  idle: '空闲',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  stopped: '已停止',
};

// 命令状态颜色映射
export const COMMAND_STATUS_COLOR = {
  idle: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  stopped: 'warning',
} as const;
