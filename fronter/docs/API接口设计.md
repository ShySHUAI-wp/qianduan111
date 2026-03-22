# API 接口设计文档

## 1. 通用规范

### 1.1 Base URL
```
开发环境: http://localhost:8000
生产环境: http://<服务器IP>:8000
```

### 1.2 响应格式

所有 API 返回统一的 JSON 格式：

```typescript
interface ApiResponse<T> {
  code: number;        // 状态码：0 成功，非 0 失败
  message: string;     // 消息描述
  data?: T;            // 数据（可选）
  error?: string;      // 错误详情（失败时）
}
```

**示例：**

成功响应：
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "ports": ["/dev/ttyACM0", "/dev/ttyACM1"]
  }
}
```

失败响应：
```json
{
  "code": 1001,
  "message": "Port not found",
  "error": "No serial ports detected on the system"
}
```

### 1.3 错误码

| 错误码 | 说明 |
|-------|------|
| 0 | 成功 |
| 1000 | 通用错误 |
| 1001 | 资源不存在 |
| 1002 | 参数错误 |
| 1003 | 权限不足 |
| 1004 | 命令执行失败 |
| 1005 | 设备不可用 |
| 1006 | 文件不存在 |
| 1007 | 进程已存在 |
| 1008 | 进程不存在 |
| 2000 | 服务器内部错误 |

### 1.4 HTTP 状态码

- `200 OK`: 请求成功
- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器错误

---

## 2. 系统相关 API

### 2.1 健康检查

**接口：** `GET /health`

**描述：** 检查服务是否正常运行

**请求参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "status": "healthy",
    "timestamp": "2025-02-01T10:00:00Z"
  }
}
```

---

### 2.2 获取系统信息

**接口：** `GET /api/system/info`

**描述：** 获取系统基本信息

**请求参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "platform": "Linux",
    "version": "5.15.0-generic",
    "lerobot_path": "/home/shuo/cola/lerobot",
    "python_version": "3.10.12"
  }
}
```

---

## 3. 端口相关 API

### 3.1 列出所有串口

**接口：** `GET /api/ports/list`

**描述：** 获取所有可用串口列表

**请求参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "ports": [
      {
        "path": "/dev/ttyACM0",
        "description": "USB Serial Device",
        "hwid": "USB VID:PID=1A86:7523"
      },
      {
        "path": "/dev/ttyACM1",
        "description": "USB Serial Device",
        "hwid": "USB VID:PID=1A86:7523"
      }
    ]
  }
}
```

---

### 3.2 交互式查找端口

**接口：** `POST /api/ports/find`

**描述：** 执行 `lerobot-find-port` 命令，交互式查找端口

**请求参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "message": "Command started",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "running"
  }
}
```

**说明：**
- 该接口启动命令后立即返回
- 命令输出通过 WebSocket 实时推送
- 当命令需要用户输入时，通过 WebSocket 发送 `input_required` 事件
- 前端通过 WebSocket 发送用户确认
- 命令完成后，通过 WebSocket 发送 `command_completed` 事件

**WebSocket 事件流：**
1. `command_output`: 推送命令输出
2. `input_required`: 需要用户输入（拔掉 USB 线）
3. 前端发送：`user_input` (confirm/cancel)
4. `command_output`: 继续推送输出
5. `command_completed`: 命令完成，包含找到的端口

---

### 3.3 检查端口权限

**接口：** `GET /api/ports/permission`

**描述：** 检查指定端口的读写权限

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| port | string | 是 | 端口路径，如 `/dev/ttyACM0` |

**示例：**
```
GET /api/ports/permission?port=/dev/ttyACM0
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "port": "/dev/ttyACM0",
    "readable": true,
    "writable": true,
    "mode": "0666",
    "owner": "root",
    "group": "dialout"
  }
}
```

---

### 3.4 授予端口权限

**接口：** `POST /api/ports/grant-permission`

**描述：** 执行 `sudo chmod 666 <port>` 授予端口读写权限

**请求参数：**
```json
{
  "port": "/dev/ttyACM0"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Permission granted successfully",
  "data": {
    "port": "/dev/ttyACM0",
    "new_mode": "0666"
  }
}
```

---

## 4. 相机相关 API

### 4.1 查找相机

**接口：** `POST /api/cameras/find`

**描述：** 执行 `lerobot-find-cameras` 查找可用相机

**请求参数：**
```json
{
  "cameraType": "opencv"  // "opencv" 或 "realsense"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "cameras": [
      {
        "id": 0,
        "type": "OpenCV",
        "resolution": "640x480",
        "fps": 30,
        "device": "/dev/video0"
      },
      {
        "id": 2,
        "type": "OpenCV",
        "resolution": "640x480",
        "fps": 30,
        "device": "/dev/video2"
      }
    ]
  }
}
```

---

### 4.2 相机预览

**接口：** `GET /api/cameras/preview`

**描述：** 获取相机实时画面（MJPEG 流）

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 相机 ID |

**示例：**
```
GET /api/cameras/preview?id=0
```

**响应：**
- Content-Type: `multipart/x-mixed-replace; boundary=frame`
- 返回 MJPEG 视频流

**前端使用：**
```html
<img src="/api/cameras/preview?id=0" alt="Camera Preview" />
```

---

### 4.3 检查相机权限

**接口：** `GET /api/cameras/permission`

**描述：** 检查相机设备权限

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| device | string | 是 | 设备路径，如 `/dev/video0` |

**示例：**
```
GET /api/cameras/permission?device=/dev/video0
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "device": "/dev/video0",
    "readable": true,
    "writable": true,
    "mode": "0666"
  }
}
```

---

## 5. 教程相关 API

### 5.1 获取教程目录树

**接口：** `GET /api/tutorials/tree`

**描述：** 扫描 `fronter/turtorial` 目录，返回树形结构

**请求参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "tree": {
      "教程分支1": [
        {
          "name": "1",
          "path": "教程分支1/1.md"
        },
        {
          "name": "2",
          "path": "教程分支1/2.md"
        }
      ],
      "教程分支2": [
        {
          "name": "3",
          "path": "教程分支2/3.md"
        }
      ]
    }
  }
}
```

---

### 5.2 获取教程内容

**接口：** `GET /api/tutorials/content`

**描述：** 读取指定 Markdown 文档内容

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | 是 | 文档相对路径，如 `教程分支1/1.md` |

**示例：**
```
GET /api/tutorials/content?path=教程分支1/1.md
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "path": "教程分支1/1.md",
    "content": "# 测试\n测试1测试1测试1...",
    "lastModified": "2025-02-01T10:00:00Z"
  }
}
```

---

## 6. 命令执行相关 API

### 6.1 执行校准命令

**接口：** `POST /api/commands/calibrate`

**描述：** 执行 `lerobot-calibrate` 命令

**请求参数：**
```json
{
  "deviceType": "leader",     // "leader" 或 "follower"
  "port": "/dev/ttyACM1",
  "id": "my_awesome_leader_arm"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Command started",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "running",
    "command": "lerobot-calibrate --teleop.type=so101_leader ..."
  }
}
```

---

### 6.2 执行遥操命令

**接口：** `POST /api/commands/teleoperate`

**描述：** 执行 `lerobot-teleoperate` 命令

**请求参数：**
```json
{
  "robot": {
    "type": "so101_follower",
    "port": "/dev/ttyACM0",
    "id": "my_awesome_follower_arm",
    "cameras": {
      "front": {
        "type": "opencv",
        "index_or_path": 2,
        "width": 640,
        "height": 480,
        "fps": 30,
        "fourcc": "MJPG",
        "rotation": "ROTATE_180"
      },
      "side": {
        "type": "opencv",
        "index_or_path": 0,
        "width": 640,
        "height": 480,
        "fps": 30,
        "fourcc": "MJPG"
      }
    }
  },
  "teleop": {
    "type": "so101_leader",
    "port": "/dev/ttyACM1",
    "id": "my_awesome_leader_arm"
  },
  "displayData": true,
  "fps": 30
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Command started",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "running",
    "dataUrl": "http://localhost:8000"  // 数据可视化界面 URL（如果 displayData=true）
  }
}
```

---

### 6.3 执行数据采集命令

**接口：** `POST /api/commands/record`

**描述：** 执行 `lerobot-record` 命令

**请求参数：**
```json
{
  "robot": {
    "type": "so101_follower",
    "port": "/dev/ttyACM0",
    "id": "my_awesome_follower_arm",
    "cameras": { /* 同遥操 */ }
  },
  "teleop": {
    "type": "so101_leader",
    "port": "/dev/ttyACM1",
    "id": "my_awesome_leader_arm"
  },
  "dataset": {
    "repoId": "/home/shuo/datasets/my_data",  // 本地存储路径
    "numEpisodes": 5,
    "singleTask": "Grab the pink cube",
    "episodeTimeS": 30,
    "resetTimeS": 20,
    "fps": 30,
    "pushToHub": false
  },
  "displayData": true,
  "fps": 30
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Command started",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "running",
    "dataUrl": "http://localhost:8000"
  }
}
```

---

### 6.4 停止命令

**接口：** `POST /api/commands/stop`

**描述：** 停止正在执行的命令

**请求参数：**
```json
{
  "commandId": "cmd-1234567890"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Command stopped successfully",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "stopped"
  }
}
```

---

### 6.5 查询命令状态

**接口：** `GET /api/commands/status`

**描述：** 查询命令执行状态

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| commandId | string | 是 | 命令 ID |

**示例：**
```
GET /api/commands/status?commandId=cmd-1234567890
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "commandId": "cmd-1234567890",
    "status": "running",  // "running" | "completed" | "failed" | "stopped"
    "startTime": "2025-02-01T10:00:00Z",
    "endTime": null,
    "exitCode": null,
    "output": [
      "Line 1...",
      "Line 2..."
    ]
  }
}
```

---

### 6.6 获取命令输出

**接口：** `GET /api/commands/output`

**描述：** 获取命令的历史输出（用于恢复日志）

**请求参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| commandId | string | 是 | 命令 ID |
| offset | integer | 否 | 起始行号（默认 0） |
| limit | integer | 否 | 返回行数（默认 1000） |

**示例：**
```
GET /api/commands/output?commandId=cmd-1234567890&offset=0&limit=100
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "commandId": "cmd-1234567890",
    "lines": [
      "Line 1...",
      "Line 2...",
      "..."
    ],
    "total": 256,
    "offset": 0,
    "limit": 100
  }
}
```

---

## 7. WebSocket 协议

### 7.1 连接

**URL：** `ws://localhost:8000/ws`

**连接建立后，客户端应发送认证信息（可选）：**
```json
{
  "type": "auth",
  "payload": {
    "token": "optional-token"
  }
}
```

---

### 7.2 客户端 → 服务端事件

#### 7.2.1 订阅命令日志

```json
{
  "type": "subscribe_command",
  "payload": {
    "commandId": "cmd-1234567890"
  }
}
```

#### 7.2.2 取消订阅

```json
{
  "type": "unsubscribe_command",
  "payload": {
    "commandId": "cmd-1234567890"
  }
}
```

#### 7.2.3 用户输入响应

```json
{
  "type": "user_input",
  "payload": {
    "commandId": "cmd-1234567890",
    "action": "confirm"  // "confirm" 或 "cancel"
  }
}
```

---

### 7.3 服务端 → 客户端事件

#### 7.3.1 命令输出

```json
{
  "type": "command_output",
  "payload": {
    "commandId": "cmd-1234567890",
    "line": "Executing command...",
    "timestamp": "2025-02-01T10:00:00.123Z",
    "level": "info"  // "info" | "warning" | "error"
  }
}
```

#### 7.3.2 需要用户输入

```json
{
  "type": "input_required",
  "payload": {
    "commandId": "cmd-1234567890",
    "prompt": "Remove the USB cable and press Enter when done.",
    "options": ["confirm", "cancel"]
  }
}
```

#### 7.3.3 命令状态更新

```json
{
  "type": "command_status",
  "payload": {
    "commandId": "cmd-1234567890",
    "status": "completed",  // "running" | "completed" | "failed" | "stopped"
    "exitCode": 0,
    "timestamp": "2025-02-01T10:05:00Z"
  }
}
```

#### 7.3.4 采集进度更新

```json
{
  "type": "record_progress",
  "payload": {
    "commandId": "cmd-1234567890",
    "currentEpisode": 3,
    "totalEpisodes": 5,
    "episodeStatus": "recording",  // "recording" | "resetting"
    "timeRemaining": 25  // 秒
  }
}
```

#### 7.3.5 数据界面 URL

```json
{
  "type": "data_url",
  "payload": {
    "commandId": "cmd-1234567890",
    "url": "http://localhost:8000"
  }
}
```

#### 7.3.6 错误通知

```json
{
  "type": "error",
  "payload": {
    "commandId": "cmd-1234567890",
    "message": "Device not found",
    "details": "Serial port /dev/ttyACM0 not accessible"
  }
}
```

---

## 8. TypeScript 类型定义

### 8.1 API 响应类型

```typescript
// 通用响应
interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  error?: string;
}

// 端口信息
interface PortInfo {
  path: string;
  description: string;
  hwid: string;
}

// 端口权限
interface PortPermission {
  port: string;
  readable: boolean;
  writable: boolean;
  mode: string;
  owner: string;
  group: string;
}

// 相机信息
interface CameraInfo {
  id: number;
  type: string;
  resolution: string;
  fps: number;
  device: string;
}

// 相机配置
interface CameraConfig {
  type: 'opencv' | 'realsense';
  index_or_path: number | string;
  width: number;
  height: number;
  fps: number;
  fourcc: string;
  rotation?: 'ROTATE_0' | 'ROTATE_90' | 'ROTATE_180' | 'ROTATE_270';
}

// 命令状态
interface CommandStatus {
  commandId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startTime: string;
  endTime?: string;
  exitCode?: number;
  output: string[];
}

// 教程树
interface TutorialTree {
  [folder: string]: {
    name: string;
    path: string;
  }[];
}

// 教程内容
interface TutorialContent {
  path: string;
  content: string;
  lastModified: string;
}
```

### 8.2 WebSocket 事件类型

```typescript
// WebSocket 消息基类
interface WsMessage<T = any> {
  type: string;
  payload: T;
}

// 命令输出
interface CommandOutputPayload {
  commandId: string;
  line: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
}

// 需要输入
interface InputRequiredPayload {
  commandId: string;
  prompt: string;
  options: string[];
}

// 命令状态
interface CommandStatusPayload {
  commandId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  exitCode?: number;
  timestamp: string;
}

// 采集进度
interface RecordProgressPayload {
  commandId: string;
  currentEpisode: number;
  totalEpisodes: number;
  episodeStatus: 'recording' | 'resetting';
  timeRemaining: number;
}
```

---

## 9. 示例代码

### 9.1 前端 API 调用示例

```typescript
import axios from 'axios';

// 创建 axios 实例
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 查找端口
export const findPort = async () => {
  const response = await api.post<ApiResponse<{ commandId: string }>>('/ports/find');
  return response.data;
};

// 执行校准
export const calibrate = async (params: {
  deviceType: 'leader' | 'follower';
  port: string;
  id: string;
}) => {
  const response = await api.post<ApiResponse<CommandStatus>>('/commands/calibrate', params);
  return response.data;
};
```

### 9.2 WebSocket 使用示例

```typescript
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket;

  constructor() {
    this.socket = io('ws://localhost:8000/ws', {
      transports: ['websocket'],
      reconnection: true,
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('command_output', (data: CommandOutputPayload) => {
      // 处理命令输出
      console.log(data.line);
    });

    this.socket.on('input_required', (data: InputRequiredPayload) => {
      // 弹出确认框
      const confirmed = window.confirm(data.prompt);
      this.sendUserInput(data.commandId, confirmed ? 'confirm' : 'cancel');
    });
  }

  subscribeCommand(commandId: string) {
    this.socket.emit('subscribe_command', { commandId });
  }

  sendUserInput(commandId: string, action: 'confirm' | 'cancel') {
    this.socket.emit('user_input', { commandId, action });
  }
}

export const wsService = new WebSocketService();
```

---

## 10. 注意事项

### 10.1 安全性
- 所有涉及文件路径的参数需要验证，防止路径遍历攻击
- 命令执行需要白名单验证，只允许特定的 lerobot 命令
- 敏感操作（如授予权限）需要额外确认

### 10.2 性能
- 命令输出通过 WebSocket 推送，避免频繁轮询
- 使用队列缓冲输出，批量发送（减少 WebSocket 消息数量）
- 限制并发执行的命令数量

### 10.3 错误处理
- 提供清晰的错误消息和建议
- 区分用户错误和系统错误
- 记录详细的错误日志供调试

### 10.4 兼容性
- 确保所有路径使用 Linux 格式（`/`）
- 检查 lerobot 命令的版本兼容性
- 处理不同设备的差异（如权限、设备路径）
