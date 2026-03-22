// ==================== API 响应类型 ====================

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  error?: string;
}

// ==================== 设备相关类型 ====================

export interface PortInfo {
  path: string;
  description: string;
  hwid: string;
}

export interface PortPermission {
  port: string;
  readable: boolean;
  writable: boolean;
  mode: string;
  owner?: string;
  group?: string;
}

export interface CameraInfo {
  name: string;
  type: string;  // "OpenCV" | "RealSense"
  id: number | string;  // 设备路径或索引
  backend_api: string;  // "V4L2" | "AVFoundation" | "DSHOW"
  default_stream_profile: {
    format: number;
    fourcc: string;
    width: number;
    height: number;
    fps: number;
  };
}

export interface CameraConfig {
  type: 'opencv' | 'realsense';
  index_or_path: number | string;
  width: number;
  height: number;
  fps: number;
  fourcc: string;
  rotation?: 'ROTATE_0' | 'ROTATE_90' | 'ROTATE_180' | 'ROTATE_270';
}

// ==================== 命令相关类型 ====================

export type CommandStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface CommandInfo {
  commandId: string;
  status: CommandStatus;
  startTime?: string;
  endTime?: string;
  exitCode?: number;
  output: string[];
}

export interface CalibrateParams {
  deviceType: 'leader' | 'follower';
  port: string;
  id: string;
}

export interface TeleoperateParams {
  robot: {
    type: string;
    port: string;
    id: string;
    cameras?: Record<string, CameraConfig>;
  };
  teleop: {
    type: string;
    port: string;
    id: string;
  };
  displayData: boolean;
  fps?: number;
}

export interface RecordParams extends TeleoperateParams {
  dataset: {
    repoId: string;
    numEpisodes: number;
    singleTask: string;
    episodeTimeS: number;
    resetTimeS: number;
    fps: number;
    pushToHub: boolean;
  };
}

// ==================== WebSocket 事件类型 ====================

export interface WsMessage<T = any> {
  type: string;
  payload: T;
}

export interface CommandOutputPayload {
  commandId: string;
  line: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
}

export interface InputRequiredPayload {
  commandId: string;
  prompt: string;
  options: string[];
}

export interface CommandStatusPayload {
  commandId: string;
  status: CommandStatus;
  exitCode?: number;
  timestamp: string;
}

export interface RecordProgressPayload {
  commandId: string;
  currentEpisode: number;
  totalEpisodes: number;
  episodeStatus: 'recording' | 'resetting';
  timeRemaining: number;
}

// ==================== 教程相关类型 ====================

export interface TutorialNode {
  name: string;
  path: string;
}

export type TutorialTree = Record<string, TutorialNode[]>;

export interface TutorialContent {
  path: string;
  content: string;
  lastModified?: string;
}
