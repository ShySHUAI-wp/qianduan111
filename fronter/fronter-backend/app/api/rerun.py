"""
Rerun可视化代理API

用于代理Rerun可视化服务器的内容，解决CORS跨域问题
"""

import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
import logging
from app.services.command_manager import command_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# Rerun服务器配置
RERUN_HOST = "127.0.0.1"
RERUN_PORT = 9876
RERUN_VIEWER_COMMAND_ID = "rerun-viewer"


@router.api_route("/proxy{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
async def proxy_rerun(request: Request, path: str):
    """
    代理所有到Rerun服务器的请求

    这个代理解决了直接在iframe中嵌入Rerun时的CORS跨域问题
    """
    # 构建目标URL
    # 如果 path 为空，默认使用 "/"
    if not path:
        path = "/"
    # 确保 path 以 "/" 开头
    elif not path.startswith("/"):
        path = f"/{path}"

    target_url = f"http://{RERUN_HOST}:{RERUN_PORT}{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    logger.info(f"Proxying request to Rerun: {request.method} {target_url}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 转发请求头（排除某些不需要的头）
            headers = {
                key: value
                for key, value in request.headers.items()
                if key.lower() not in ["host", "connection", "transfer-encoding"]
            }

            # 读取请求体（如果有）
            body = await request.body()

            # 发送请求到Rerun服务器
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body if body else None,
            )

            # 检查是否是流式响应（如WebSocket或SSE）
            content_type = response.headers.get("content-type", "")

            # 如果是流式内容，使用StreamingResponse
            if "stream" in content_type or "event-stream" in content_type:
                async def generate():
                    async for chunk in response.aiter_bytes():
                        yield chunk

                return StreamingResponse(
                    generate(),
                    status_code=response.status_code,
                    headers={
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() not in ["content-encoding", "content-length", "transfer-encoding"]
                    },
                    media_type=content_type,
                )

            # 普通响应
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    key: value
                    for key, value in response.headers.items()
                    if key.lower() not in ["content-encoding", "content-length", "transfer-encoding"]
                },
            )

    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to Rerun server at {RERUN_HOST}:{RERUN_PORT}: {e}")
        # 返回友好的HTML错误页面
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Rerun Viewer Not Running</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f0f2f5;
                }}
                .container {{
                    text-align: center;
                    padding: 40px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    max-width: 500px;
                }}
                h1 {{
                    color: #ff4d4f;
                    margin-bottom: 16px;
                }}
                p {{
                    color: #595959;
                    line-height: 1.6;
                }}
                .code {{
                    background: #f5f5f5;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-family: 'Courier New', monospace;
                    margin: 16px 0;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>⚠️ Rerun Viewer 未运行</h1>
                <p>无法连接到 Rerun 可视化服务器。</p>
                <p>请确保已启用"显示数据界面"并启动了遥操。</p>
                <div class="code">服务器地址: {RERUN_HOST}:{RERUN_PORT}</div>
                <p style="font-size: 12px; color: #8c8c8c; margin-top: 24px;">
                    如果问题持续，请检查后端日志或联系管理员。
                </p>
            </div>
        </body>
        </html>
        """
        return Response(
            content=html_content,
            status_code=503,
            media_type="text/html",
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error from Rerun server: {e.response.status_code} - {e}")
        return Response(
            content=e.response.content,
            status_code=e.response.status_code,
            headers=dict(e.response.headers),
        )
    except Exception as e:
        logger.error(f"Error proxying to Rerun: {e}", exc_info=True)
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Proxy Error</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f0f2f5;
                }}
                .container {{
                    text-align: center;
                    padding: 40px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    max-width: 500px;
                }}
                h1 {{
                    color: #ff4d4f;
                    margin-bottom: 16px;
                }}
                p {{
                    color: #595959;
                    line-height: 1.6;
                }}
                .error {{
                    background: #fff1f0;
                    border: 1px solid #ffccc7;
                    padding: 12px;
                    border-radius: 4px;
                    margin: 16px 0;
                    color: #cf1322;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    word-break: break-all;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❌ 代理错误</h1>
                <p>转发请求到 Rerun 服务器时发生错误。</p>
                <div class="error">{str(e)}</div>
            </div>
        </body>
        </html>
        """
        return Response(
            content=html_content,
            status_code=500,
            media_type="text/html",
        )


@router.get("/status")
async def get_rerun_status():
    """检查Rerun服务器状态"""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"http://{RERUN_HOST}:{RERUN_PORT}/")

            # 同时检查 viewer 进程状态
            viewer_status = command_manager.get_command_status(RERUN_VIEWER_COMMAND_ID)

            return {
                "code": 0,
                "message": "Rerun server is running",
                "data": {
                    "running": True,
                    "url": f"http://{RERUN_HOST}:{RERUN_PORT}",
                    "viewer_status": viewer_status.get("status") if viewer_status else None,
                },
            }
    except Exception as e:
        # 检查 viewer 进程是否在运行
        viewer_status = command_manager.get_command_status(RERUN_VIEWER_COMMAND_ID)

        return {
            "code": 1,
            "message": "Rerun server is not running",
            "data": {
                "running": False,
                "error": str(e),
                "viewer_status": viewer_status.get("status") if viewer_status else None,
            },
        }


@router.post("/start")
async def start_rerun_viewer():
    """启动Rerun viewer"""
    try:
        # 检查是否已经在运行
        existing_status = command_manager.get_command_status(RERUN_VIEWER_COMMAND_ID)
        if existing_status and existing_status["status"] == "running":
            logger.info("Rerun viewer is already running")
            return {
                "code": 0,
                "message": "Rerun viewer is already running",
                "data": existing_status,
            }

        # 启动 Rerun viewer
        command = f"rerun --port {RERUN_PORT}"
        logger.info(f"Starting Rerun viewer: {command}")

        cmd_process = await command_manager.start_command(RERUN_VIEWER_COMMAND_ID, command)

        # 等待一下让服务器启动
        import asyncio
        await asyncio.sleep(2)

        # 验证服务器是否启动成功
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.get(f"http://{RERUN_HOST}:{RERUN_PORT}/")

            return {
                "code": 0,
                "message": "Rerun viewer started successfully",
                "data": {
                    "commandId": RERUN_VIEWER_COMMAND_ID,
                    "status": "running",
                    "url": f"http://{RERUN_HOST}:{RERUN_PORT}",
                    "pid": cmd_process.process.pid,
                },
            }
        except Exception as e:
            logger.warning(f"Rerun viewer process started but server not responding yet: {e}")
            return {
                "code": 0,
                "message": "Rerun viewer process started (server may need a few more seconds)",
                "data": {
                    "commandId": RERUN_VIEWER_COMMAND_ID,
                    "status": "starting",
                    "pid": cmd_process.process.pid,
                },
            }

    except Exception as e:
        logger.error(f"Failed to start Rerun viewer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"启动Rerun viewer失败: {str(e)}")


@router.post("/stop")
async def stop_rerun_viewer():
    """停止Rerun viewer"""
    try:
        logger.info("Stopping Rerun viewer")

        success = await command_manager.stop_command(RERUN_VIEWER_COMMAND_ID)

        if not success:
            status = command_manager.get_command_status(RERUN_VIEWER_COMMAND_ID)
            if status is None:
                raise HTTPException(status_code=404, detail="Rerun viewer未运行")
            return {
                "code": 1,
                "message": f"无法停止Rerun viewer，当前状态: {status['status']}",
                "data": status,
            }

        return {
            "code": 0,
            "message": "Rerun viewer已停止",
            "data": command_manager.get_command_status(RERUN_VIEWER_COMMAND_ID),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop Rerun viewer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"停止Rerun viewer失败: {str(e)}")
