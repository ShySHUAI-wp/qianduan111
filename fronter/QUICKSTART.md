# Fronter 项目快速启动指南

## 项目状态

✅ **第一阶段已完成：项目初始化与基础框架**

已完成内容：
- 前端项目骨架（React + TypeScript + Vite）
- 后端项目骨架（FastAPI）
- 基础路由和布局
- 状态管理（Zustand stores）
- API 和 WebSocket 封装
- 通用组件（LogViewer, IframeEmbed）
- 基础 API 接口

## 项目结构

```
fronter/
├── docs/                    # 开发文档（已完成）
├── fronter-web/            # 前端项目（已初始化）
├── fronter-backend/        # 后端项目（已初始化）
└── turtorial/              # 教程目录
```

## 环境要求

### 前端
- Node.js 18+ (需要升级，当前系统为 v12)
- npm 或 pnpm

### 后端
- Python 3.10+ (conda lerobot 环境中)
- pip

## 启动步骤

### 1. 升级 Node.js（必需）

当前 conda lerobot 环境中的 Node.js 版本为 v12.22.9，需要升级到 v18+。

**在 conda 环境中升级**
```bash
source ~/miniconda3/bin/activate
conda activate lerobot
conda install -c conda-forge nodejs=18 -y
```

### 2. 安装前端依赖

```bash
cd /home/shuo/cola/lerobot_cobot/fronter/fronter-web

# 使用 npm
npm install

npm install http-proxy-middleware --save-dev
```

### 3. 安装后端依赖

```bash
cd /home/shuo/cola/lerobot_cobot/fronter/fronter-backend

# 直接在 conda lerobot 环境中安装
conda activate lerobot

# 安装依赖
pip install -r requirements.txt

# numpy要降级到1.0版本
pip install "numpy<2"

pip install httpx

# 安装 Rerun SDK（用于数据可视化）
pip install rerun-sdk
```

### 4. 配置环境变量

```bash
# 后端
cd fronter-backend
cp .env.example .env
# 根据需要修改 .env 文件

# 前端（可选）
cd ../fronter-web
```

### 5. 启动服务

**终端 1 - 启动后端：**
```bash
whoami
groups

# 提前保证用户在用户组里，否则无法接口提权限
sudo usermod -a -G dialout shuo

cd /home/shuo/cola/lerobot_cobot/fronter/fronter-backend
conda activate lerobot 
uvicorn app.main:socket_app     --reload     --host 0.0.0.0     --port 8000     --log-level info     --access-log
pip install rerun-sdk
```

**终端 2 - 启动前端：**
```bash
cd /home/shuo/cola/lerobot_cobot/fronter/fronter-web
npm run dev
```

### 6. Rerun 可视化说明

本项目使用 Rerun 进行机器人数据可视化。Rerun 的工作方式：

1. **数据生成**：当启用"显示数据界面"并开始遥操时，`lerobot-teleoperate` 进程会在内部启动 Rerun，并通过 WebSocket 推送数据到 `ws://127.0.0.1:9876`

2. **网页显示**：前端通过嵌入 `app.rerun.io` 的 iframe 来显示可视化界面：
   ```
   https://app.rerun.io/version/0.20.3/index.html?url=ws://127.0.0.1:9876
   ```

3. **无需手动启动**：不需要手动运行 `rerun --port 9876` 命令，因为：
   - `rerun --port 9876` 启动的是桌面 GUI 应用，不是 Web 服务器
   - `lerobot-teleoperate` 会在内部处理 Rerun 数据推送
   - 前端 iframe 会自动连接到本地 WebSocket 端点

4. **可视化内容**：
   - 机械臂关节位置和状态
   - 相机画面（如果配置了相机）
   - 传感器数据
   - 3D 场景可视化

### 7. 访问应用

- **前端**: http://localhost:5173
- **后端 API 文档**: http://localhost:8000/docs
- **健康检查**: http://localhost:8000/health

## 验证安装

### 测试后端

```bash
curl http://localhost:8000/health
```

预期输出：
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "status": "healthy"
  }
}
```

### 测试前端

访问 http://localhost:5173，应该看到：
- 左侧侧边栏有三个菜单：教程、底盘控制、机械臂控制
- 右侧显示页面内容

### 测试教程 API

访问 http://localhost:8000/api/tutorials/tree，应该返回教程目录树。

## 已完成的功能

### 前端
✅ 基础框架和配置
✅ 路由系统（React Router）
✅ 布局组件（侧边栏 + 内容区）
✅ 状态管理（Zustand stores）
✅ API 封装（Axios）
✅ WebSocket 封装（Socket.IO Client）
✅ 通用组件（LogViewer, IframeEmbed）
✅ TypeScript 类型定义

### 后端
✅ FastAPI 基础框架
✅ CORS 配置
✅ 统一响应格式
✅ API 路由结构
✅ 教程 API（已实现）
✅ 系统信息 API（已实现）
✅ 其他 API 骨架（待实现）

## 待实现的功能

根据 [实现路线图.md](docs/实现路线图.md)，接下来需要完成：

### 阶段 2：教程页面（2-3 天）
- 前端教程目录树组件
- Markdown 渲染组件
- 教程页面完整功能

### 阶段 3：端口与相机功能（4-5 天）
- 端口查找功能
- 相机查找和预览
- 权限管理

### 阶段 4：校准、遥操、数据采集（5-6 天）
- 机械臂校准
- 遥操功能
- 数据采集

### 阶段 5：优化与测试（3-4 天）
### 阶段 6：文档与部署（2-3 天）

## 常见问题

### Q1: Node.js 版本太旧
A: 按照上面的步骤升级到 Node.js 18+。

### Q2: 后端启动失败
A: 检查 Python 依赖是否安装完整：
```bash
pip install -r requirements.txt
```

### Q3: 前端启动失败
A: 检查依赖是否安装：
```bash
npm install
```

### Q4: CORS 错误
A: 检查后端的 CORS 配置，确保前端地址在 `CORS_ORIGINS` 中。

### Q5: 教程 API 返回空
A: 检查 `TUTORIAL_PATH` 配置是否正确，确保目录存在并包含 Markdown 文件。

## 下一步

1. **升级 Node.js**（必需）
2. **安装依赖**（前后端）
3. **启动服务**（前后端）
4. **验证功能**（访问前端，测试 API）
5. **开始阶段 2 开发**（教程页面）

详细的开发计划请参考 [docs/实现路线图.md](docs/实现路线图.md)。

## 开发文档

- [README.md](docs/README.md) - 文档导航
- [技术栈选型.md](docs/技术栈选型.md)
- [系统架构设计.md](docs/系统架构设计.md)
- [详细功能需求.md](docs/详细功能需求.md)
- [实现路线图.md](docs/实现路线图.md)
- [API接口设计.md](docs/API接口设计.md)
- [开发规范与部署.md](docs/开发规范与部署.md)

## 联系

如有问题，请参考开发文档或联系项目负责人。
