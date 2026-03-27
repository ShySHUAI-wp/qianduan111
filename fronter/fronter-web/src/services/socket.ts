import { io, Socket } from 'socket.io-client';
import type {
  CommandOutputPayload,
  InputRequiredPayload,
  CommandStatusPayload,
  RecordProgressPayload,
} from '@/types';

export interface WsResponse {
  requestId: string;
  code: number;
  message?: string;
  data?: any;
}

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor() {
    this.connect();
  }

  // 连接到 WebSocket 服务器
  connect() {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io('ws://localhost:8000', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.setupListeners();
  }

  // 设置基础监听器
  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // 监听服务端事件
    this.socket.on('command_output', (data: CommandOutputPayload) => {
      this.emit('command_output', data);
    });

    this.socket.on('input_required', (data: InputRequiredPayload) => {
      this.emit('input_required', data);
    });

    this.socket.on('command_status', (data: CommandStatusPayload) => {
      this.emit('command_status', data);
    });

    this.socket.on('record_progress', (data: RecordProgressPayload) => {
      this.emit('record_progress', data);
    });

    this.socket.on('data_url', (data: { commandId: string; url: string }) => {
      this.emit('data_url', data);
    });

    this.socket.on('error', (data: { commandId: string; message: string; details: string }) => {
      this.emit('error', data);
    });
  }

  // 订阅命令日志
  subscribeCommand(commandId: string) {
    if (!this.socket) return;
    this.socket.emit('subscribe_command', { commandId });
  }

  // 取消订阅
  unsubscribeCommand(commandId: string) {
    if (!this.socket) return;
    this.socket.emit('unsubscribe_command', { commandId });
  }

  // 发送用户输入响应
  sendUserInput(commandId: string, action: 'confirm' | 'cancel') {
    if (!this.socket) return;
    this.socket.emit('user_input', { commandId, action });
  }

  // 请求机器人状态（用于前端轮询）
  getRobotState() {
    if (!this.socket) return;
    this.socket.emit('get_robot_state', {});
  }

  // 通用请求-响应模式（用于REST API迁移到WebSocket）
  call(event: string, data: object = {}): Promise<WsResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.off(responseEvent, handler);
        reject(new Error(`Timeout waiting for ${responseEvent}`));
      }, 10000);

      const responseEvent = `${event}_resp`;
      const handler = (resp: WsResponse) => {
        if (resp.requestId === requestId) {
          clearTimeout(timeout);
          this.off(responseEvent, handler);
          resolve(resp);
        }
      };
      this.on(responseEvent, handler);
      this.socket!.emit(event, { requestId, ...data });
    });
  }

  // Home page APIs
  async systemHealth(): Promise<WsResponse> {
    return this.call('system_health', {});
  }

  async systemInfo(): Promise<WsResponse> {
    return this.call('system_info', {});
  }

  async portsList(): Promise<WsResponse> {
    return this.call('ports_list', {});
  }

  // ==================== 校准相关 API ====================
  async calibrateCheckConfig(params: {
    arm_type: string;
    arm_id: string;
    port?: string;
    left_arm_port?: string;
    right_arm_port?: string;
  }): Promise<WsResponse> {
    return this.call('calibrate_check_config', params);
  }

  async calibrateStart(params: {
    arm_type: string;
    arm_id: string;
    port?: string;
    left_arm_port?: string;
    right_arm_port?: string;
  }): Promise<WsResponse> {
    return this.call('calibrate_start', params);
  }

  async calibrateUseExisting(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_use_existing', { session_id: sessionId });
  }

  async calibrateSetMiddle(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_set_middle', { session_id: sessionId });
  }

  async calibrateStartRecording(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_start_recording', { session_id: sessionId });
  }

  async calibrateRecordingStatus(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_recording_status', { session_id: sessionId });
  }

  async calibrateStopRecording(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_stop_recording', { session_id: sessionId });
  }

  async calibrateSave(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_save', { session_id: sessionId });
  }

  async calibrateCancel(sessionId: string): Promise<WsResponse> {
    return this.call('calibrate_cancel', { session_id: sessionId });
  }

  // 发送手动输入的关节值
  async calibrateManualJointUpdate(
    sessionId: string,
    joints: Record<string, number>
  ): Promise<WsResponse> {
    return this.call('calibrate_manual_joint_update', { session_id: sessionId, joints });
  }

  // 注册事件监听器
  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.off(event, callback);
    };
  }

  // 移除事件监听器
  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  // 触发事件（内部使用）
  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  // 获取连接状态
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// 导出单例
export const wsService = new WebSocketService();

export default wsService;
