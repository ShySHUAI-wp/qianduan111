# 端口查找组件使用指南

## 功能概述

端口查找组件已完成开发,包含以下功能:

### 后端功能

1. **进程管理器** (`app/services/process_manager.py`)
   - 管理命令执行的子进程
   - 捕获实时输出
   - 支持异步执行和输出回调

2. **端口工具类** (`app/utils/port_utils.py`)
   - 列出所有可用串口
   - 检查端口读写权限
   - 授予端口权限 (sudo chmod 666)
   - 解析 lerobot-find-port 命令输出

3. **端口API** (`app/api/ports.py`)
   - `GET /api/ports/list` - 列出所有串口
   - `POST /api/ports/find` - 交互式查找端口
   - `GET /api/ports/permission?port=xxx` - 检查端口权限
   - `POST /api/ports/grant-permission` - 授予端口权限

4. **WebSocket支持** (`app/websocket/events.py`)
   - 实时推送命令输出
   - 支持订阅/取消订阅命令日志
   - 命令状态更新通知

### 前端功能

1. **PortFinder组件** (`src/components/PortFinder/`)
   - 查找端口按钮
   - 确认对话框
   - 端口列表表格
   - 权限状态显示
   - 一键授权功能
   - 端口选择器

2. **LogViewer组件** (`src/components/LogViewer/`)
   - 实时日志显示
   - 自动滚动到底部
   - 复制日志功能
   - 清空日志功能

3. **RobotControl页面集成**
   - 端口查找标签页
   - 日志输出区域
   - 端口状态跟踪

## 使用方法

### 1. 启动后端服务

```bash
cd /home/shuo/cola/lerobot_cobot/fronter/fronter-backend
conda activate lerobot
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 启动前端服务

```bash
cd /home/shuo/cola/lerobot_cobot/fronter/fronter-web
npm run dev
```

### 3. 使用端口查找功能

1. 访问 http://localhost:5173
2. 点击左侧菜单 "机械臂控制"
3. 在 "查找端口" 标签页中:
   - 点击 "查找端口" 按钮
   - 在弹出的对话框中确认
   - 按照提示拔掉USB串口
   - 等待命令执行完成
   - 查看找到的端口列表
4. 如果端口权限不足,点击 "授权" 按钮
5. 从下拉框中选择要使用的端口

## 技术实现

### 后端架构

```
ProcessManager (进程管理)
    ↓
PortUtils (端口工具)
    ↓
API Routes (API路由)
    ↓
WebSocket (实时通信)
```

### 前端架构

```
RobotControl Page (页面)
    ↓
PortFinder Component (端口查找组件)
    ├── API Service (API调用)
    ├── WebSocket Service (WebSocket连接)
    └── LogViewer Component (日志查看器)
```

### WebSocket事件流程

1. 前端调用 `POST /api/ports/find`
2. 后端启动 lerobot-find-port 命令
3. 后端通过 WebSocket 推送命令输出
4. 前端订阅命令 ID 接收实时日志
5. 命令完成后推送状态更新
6. 前端解析结果并更新UI

## 待完成功能

当前实现的是基础版本,以下功能需要后续完善:

1. **WebSocket前端集成**
   - 在 PortFinder 组件中添加 WebSocket 连接
   - 订阅命令输出事件
   - 实时显示 lerobot-find-port 的输出到日志区

2. **交互式输入支持**
   - 处理 lerobot-find-port 需要用户确认的场景
   - 通过 WebSocket 发送用户输入

3. **错误处理优化**
   - 更友好的错误提示
   - 重试机制

4. **状态持久化**
   - 保存最近使用的端口
   - 自动恢复配置

## 文件清单

### 后端文件

- `app/services/process_manager.py` - 进程管理器
- `app/utils/port_utils.py` - 端口工具类
- `app/api/ports.py` - 端口API路由
- `app/websocket/events.py` - WebSocket事件处理
- `app/websocket/__init__.py` - WebSocket模块导出

### 前端文件

- `src/components/PortFinder/PortFinder.tsx` - 端口查找组件
- `src/components/PortFinder/index.ts` - 组件导出
- `src/components/LogViewer/LogViewer.tsx` - 日志查看器组件
- `src/components/LogViewer/index.ts` - 组件导出
- `src/pages/RobotControl.tsx` - 机械臂控制页面(已更新)
- `src/services/api.ts` - API服务(已包含端口API)
- `src/types/index.ts` - 类型定义(已包含端口类型)

## 下一步计划

根据实现路线图,接下来应该完成:

1. **相机查找组件** (阶段3)
   - 查找相机功能
   - 相机预览功能
   - 相机配置功能

2. **校准功能** (阶段4)
   - Leader/Follower校准面板
   - 校准命令执行

3. **遥操和数据采集** (阶段4)
   - 遥操配置和执行
   - 数据采集配置和执行

## 测试建议

1. 测试端口列表加载
2. 测试端口权限检查
3. 测试权限授予功能
4. 测试端口查找命令执行(需要实际硬件)
5. 测试WebSocket连接和消息推送

## 注意事项

1. 端口查找功能需要实际的串口硬件才能完整测试
2. 权限授予功能需要 sudo 权限,确保系统配置正确
3. WebSocket 连接使用 Socket.IO 协议,前端需要正确配置客户端
4. 日志输出目前是前端本地记录,后续可以改为接收WebSocket推送的日志
