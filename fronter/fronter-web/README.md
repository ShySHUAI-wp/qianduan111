# Fronter Web - 前端项目

机械臂控制平台的 Web 前端。

## 技术栈

- React 18
- TypeScript
- Vite
- Ant Design
- Zustand (状态管理)
- Axios (HTTP 客户端)
- Socket.IO Client (WebSocket)

## 快速开始

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 生产构建

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
src/
├── components/      # 可复用组件
│   ├── Layout/      # 布局组件
│   ├── Tutorial/    # 教程相关组件
│   ├── RobotControl/# 机械臂控制组件
│   └── Common/      # 通用组件
├── pages/          # 页面组件
├── stores/         # Zustand 状态管理
├── services/       # API 和 WebSocket 服务
├── hooks/          # 自定义 Hooks
├── utils/          # 工具函数
├── types/          # TypeScript 类型定义
├── App.tsx         # 根组件
├── main.tsx        # 入口文件
└── router.tsx      # 路由配置
```

## 代码规范

- ESLint: 代码质量检查
- Prettier: 代码格式化

运行 lint:
```bash
npm run lint
```

格式化代码:
```bash
npm run format
```

## 环境变量

创建 `.env.local` 文件：

```
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

## 注意事项

- 确保后端服务已启动（默认 http://localhost:8000）
- WebSocket 需要后端支持
