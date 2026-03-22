import { io, Socket } from 'socket.io-client';
import type {
  CommandOutputPayload,
  InputRequiredPayload,
  CommandStatusPayload,
  RecordProgressPayload,
} from '@/types';

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
