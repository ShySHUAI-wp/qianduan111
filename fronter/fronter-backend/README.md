# Fronter Backend - 后端项目

机械臂控制平台的后端 API 服务。

## 技术栈

- FastAPI
- Python 3.10+
- python-socketio (WebSocket)
- pyserial (串口通信)
- OpenCV (相机)

## 快速开始

### 创建虚拟环境

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows
```

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置环境变量

复制 `.env.example` 到 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

### 启动开发服务器

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问：
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 项目结构

```
app/
├── api/            # API 路由
│   ├── system.py   # 系统相关
│   ├── ports.py    # 端口管理
│   ├── cameras.py  # 相机管理
│   ├── tutorials.py# 教程
│   └── commands.py # 命令执行
├── services/       # 业务逻辑
├── models/         # 数据模型
├── utils/          # 工具函数
├── websocket/      # WebSocket 处理
├── config.py       # 配置
└── main.py         # 应用入口
```

## API 文档

启动服务后访问 http://localhost:8000/docs 查看自动生成的 API 文档。

## 开发

### 代码规范

遵循 PEP 8 代码规范。

### 测试

```bash
pytest
```

## 部署

参考 `fronter/docs/开发规范与部署.md` 文档。
