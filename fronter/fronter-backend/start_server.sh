#!/bin/bash

# LeRobot Fronter Backend 启动脚本
# 确保日志正常输出

cd "$(dirname "$0")"

# 使用 uvicorn 启动，明确指定日志级别
uvicorn app.main:socket_app \
    --reload \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    --access-log
