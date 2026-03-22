import logging
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api import ports, cameras, tutorials, commands, system, rerun, calibrate, record
from app.websocket import sio
from app.services.camera_stream_manager import camera_stream_manager

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)

# 确保所有 logger 都使用 INFO 级别
logging.getLogger("app.api.calibrate").setLevel(logging.INFO)
logging.getLogger("app.api.record").setLevel(logging.INFO)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # 减少访问日志噪音
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="Fronter Backend",
    description="机械臂控制平台后端 API",
    version="1.0.0",
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建 Socket.IO ASGI 应用
socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
    socketio_path="/socket.io",
)

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Starting application...")


# 健康检查
@app.get("/health")
async def health_check():
    return {
        "code": 0,
        "message": "OK",
        "data": {"status": "healthy"},
    }

# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "code": 2000,
            "message": "Internal server error",
            "error": str(exc),
        },
    )

# 注册路由
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(ports.router, prefix="/api/ports", tags=["ports"])
app.include_router(cameras.router, prefix="/api/cameras", tags=["cameras"])
app.include_router(tutorials.router, prefix="/api/tutorials", tags=["tutorials"])
app.include_router(commands.router, prefix="/api/commands", tags=["commands"])
app.include_router(rerun.router, prefix="/api/rerun", tags=["rerun"])
app.include_router(calibrate.router, prefix="/api/calibrate", tags=["calibrate"])
app.include_router(record.router, prefix="/api/record", tags=["record"])

if __name__ == "__main__":
    import uvicorn

    # 使用 socket_app 而不是 app,以支持 WebSocket
    uvicorn.run(
        socket_app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"  # 确保日志级别为 info
    )
