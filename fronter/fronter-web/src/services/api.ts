import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import type { ApiResponse } from '@/types';

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加 token 等
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // 统一错误处理
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

// ==================== 端口相关 API ====================

export const portApi = {
  // 列出所有串口
  list: () => api.get<ApiResponse<{ ports: any[] }>>('/ports/list'),

  // 查找端口（交互式）
  find: () => api.post<ApiResponse<{ commandId: string }>>('/ports/find'),

  // 检查端口权限
  checkPermission: (port: string) =>
    api.get<ApiResponse<any>>('/ports/permission', { params: { port } }),

  // 授予端口权限
  grantPermission: (port: string) =>
    api.post<ApiResponse<any>>('/ports/grant-permission', { port }),
};

// ==================== 相机相关 API ====================

export const cameraApi = {
  // 列出所有相机
  list: (cameraType: 'opencv' | 'realsense' | 'all' = 'opencv') =>
    api.get<ApiResponse<{ cameras: any[] }>>('/cameras/list', { params: { camera_type: cameraType } }),

  // 检查相机权限
  checkPermission: (device: string) =>
    api.get<ApiResponse<any>>('/cameras/permission', { params: { device } }),

  // 获取相机流 URL（添加时间戳避免浏览器缓存）
  // getStreamUrl: (cameraId: string) => `/api/cameras/stream/${encodeURIComponent(cameraId)}?t=${Date.now()}`,
  getStreamUrl: (cameraId: string) => `/api/cameras/stream/${encodeURIComponent(cameraId)}`,


  // 发送心跳
  sendHeartbeat: (cameraId: string) =>
    api.post<ApiResponse<any>>(`/cameras/heartbeat/${encodeURIComponent(cameraId)}`),

  // 停止相机流
  stopStream: (cameraId: string) =>
    api.post<ApiResponse<any>>(`/cameras/stop/${encodeURIComponent(cameraId)}`),
};

// ==================== 教程相关 API ====================

export const tutorialApi = {
  // 获取教程目录树
  getTree: () => api.get<ApiResponse<{ tree: any }>>('/tutorials/tree'),

  // 获取教程内容
  getContent: (path: string) =>
    api.get<ApiResponse<any>>('/tutorials/content', { params: { path } }),
};

// ==================== 命令执行相关 API ====================

export const commandApi = {
  // 执行校准命令
  calibrate: (params: any) =>
    api.post<ApiResponse<{ commandId: string }>>('/commands/calibrate', params),

  // 执行遥操命令
  teleoperate: (params: any) =>
    api.post<ApiResponse<{ commandId: string; dataUrl?: string }>>(
      '/commands/teleoperate',
      params
    ),

  // 执行数据采集命令
  record: (params: any) =>
    api.post<ApiResponse<{ commandId: string; dataUrl?: string }>>(
      '/commands/record',
      params
    ),

  // 停止命令
  stop: (commandId: string) =>
    api.post<ApiResponse<any>>('/commands/stop', { commandId }),

  // 查询命令状态
  getStatus: (commandId: string) =>
    api.get<ApiResponse<any>>('/commands/status', { params: { commandId } }),

  // 获取命令输出
  getOutput: (commandId: string, offset = 0, limit = 1000) =>
    api.get<ApiResponse<any>>('/commands/output', {
      params: { commandId, offset, limit },
    }),
};

// ==================== 系统相关 API ====================

export const systemApi = {
  // 健康检查
  health: () => api.get<ApiResponse<any>>('/health'),

  // 获取系统信息
  getInfo: () => api.get<ApiResponse<any>>('/system/info'),
};

// ==================== 校准相关 API ====================

export const calibrateApi = {
  // 检查是否存在校准配置文件
  checkConfig: (params: {
    arm_type: string;
    port?: string;
    left_arm_port?: string;
    right_arm_port?: string;
    arm_id: string;
  }) => api.post<ApiResponse<{ exists: boolean; path: string }>>('/calibrate/check-config', params),

  // 启动校准
  start: (params: {
    arm_type: string;
    port?: string;
    left_arm_port?: string;
    right_arm_port?: string;
    arm_id: string;
  }) => api.post<ApiResponse<{ session_id: string; message: string }>>('/calibrate/start', params),

  // 使用已有的校准文件
  useExisting: (sessionId: string) =>
    api.post<ApiResponse<{ message: string }>>('/calibrate/use-existing', { session_id: sessionId }),

  // 设置中间位置
  setMiddle: (sessionId: string) =>
    api.post<ApiResponse<{ homing_offsets: Record<string, number>; message: string }>>(
      '/calibrate/set-middle',
      { session_id: sessionId }
    ),

  // 开始记录运动范围
  startRecording: (sessionId: string) =>
    api.post<ApiResponse<{ message: string }>>('/calibrate/start-recording', {
      session_id: sessionId,
    }),

  // 获取记录状态
  getRecordingStatus: (sessionId: string) =>
    api.get<
      ApiResponse<{
        recording: boolean;
        positions?: Array<{ motor: string; min: number; current: number; max: number }>;
      }>
    >(`/calibrate/recording-status/${sessionId}`),

  // 停止记录
  stopRecording: (sessionId: string) =>
    api.post<
      ApiResponse<{
        message: string;
        mins?: Record<string, number>;
        maxes?: Record<string, number>;
      }>
    >('/calibrate/stop-recording', { session_id: sessionId }),

  // 保存校准
  save: (sessionId: string) =>
    api.post<ApiResponse<{ message: string; config_path: string }>>('/calibrate/save', {
      session_id: sessionId,
    }),

  // 取消校准
  cancel: (sessionId: string) =>
    api.post<ApiResponse<{ message: string }>>('/calibrate/cancel', { session_id: sessionId }),
};

export default api;
