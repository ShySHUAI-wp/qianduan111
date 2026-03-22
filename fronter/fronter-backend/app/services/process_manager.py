"""
进程管理器
管理命令执行的子进程，提供实时输出捕获和进程控制功能
"""
import asyncio
import logging
import subprocess
import uuid
from typing import Dict, List, Optional, Callable
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class CommandStatus(str, Enum):
    """命令状态"""
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class CommandInfo:
    """命令信息"""

    def __init__(self, command: str, cwd: Optional[str] = None):
        self.command_id = f"cmd-{uuid.uuid4().hex[:12]}"
        self.command = command
        self.cwd = cwd
        self.status = CommandStatus.IDLE
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.exit_code: Optional[int] = None
        self.output: List[str] = []
        self.process: Optional[subprocess.Popen] = None

    def to_dict(self):
        """转换为字典"""
        return {
            "commandId": self.command_id,
            "status": self.status.value,
            "startTime": self.start_time.isoformat() if self.start_time else None,
            "endTime": self.end_time.isoformat() if self.end_time else None,
            "exitCode": self.exit_code,
            "output": self.output,
        }


class ProcessManager:
    """进程管理器单例"""

    _instance = None
    _commands: Dict[str, CommandInfo] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._commands = {}
            self._initialized = True

    async def execute_command(
        self,
        command: str,
        cwd: Optional[str] = None,
        output_callback: Optional[Callable[[str], None]] = None,
        error_callback: Optional[Callable[[str], None]] = None,
    ) -> CommandInfo:
        """
        执行命令并捕获输出

        Args:
            command: 要执行的命令
            cwd: 工作目录
            output_callback: 输出回调函数（每行输出）
            error_callback: 错误回调函数

        Returns:
            CommandInfo: 命令信息对象
        """
        cmd_info = CommandInfo(command, cwd)
        self._commands[cmd_info.command_id] = cmd_info

        try:
            cmd_info.status = CommandStatus.RUNNING
            cmd_info.start_time = datetime.now()

            logger.info(f"Executing command [{cmd_info.command_id}]: {command}")

            # 启动子进程
            cmd_info.process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=cwd,
            )

            # 异步读取输出
            while True:
                line = await asyncio.to_thread(cmd_info.process.stdout.readline)
                if not line:
                    break

                line = line.rstrip()
                cmd_info.output.append(line)
                logger.debug(f"[{cmd_info.command_id}] {line}")

                if output_callback:
                    try:
                        if asyncio.iscoroutinefunction(output_callback):
                            await output_callback(line)
                        else:
                            output_callback(line)
                    except Exception as e:
                        logger.error(f"Output callback error: {e}")

            # 等待进程结束
            exit_code = await asyncio.to_thread(cmd_info.process.wait)
            cmd_info.exit_code = exit_code
            cmd_info.end_time = datetime.now()

            if exit_code == 0:
                cmd_info.status = CommandStatus.COMPLETED
                logger.info(f"Command [{cmd_info.command_id}] completed successfully")
            else:
                cmd_info.status = CommandStatus.FAILED
                logger.warning(f"Command [{cmd_info.command_id}] failed with exit code {exit_code}")

                if error_callback:
                    try:
                        if asyncio.iscoroutinefunction(error_callback):
                            await error_callback(f"Command failed with exit code {exit_code}")
                        else:
                            error_callback(f"Command failed with exit code {exit_code}")
                    except Exception as e:
                        logger.error(f"Error callback error: {e}")

        except Exception as e:
            cmd_info.status = CommandStatus.FAILED
            cmd_info.end_time = datetime.now()
            error_msg = f"Command execution error: {e}"
            cmd_info.output.append(error_msg)
            logger.error(f"[{cmd_info.command_id}] {error_msg}", exc_info=True)

            if error_callback:
                try:
                    if asyncio.iscoroutinefunction(error_callback):
                        await error_callback(error_msg)
                    else:
                        error_callback(error_msg)
                except Exception as callback_error:
                    logger.error(f"Error callback error: {callback_error}")

        return cmd_info

    def stop_command(self, command_id: str) -> bool:
        """
        停止正在执行的命令

        Args:
            command_id: 命令ID

        Returns:
            bool: 是否成功停止
        """
        cmd_info = self._commands.get(command_id)
        if not cmd_info:
            logger.warning(f"Command {command_id} not found")
            return False

        if cmd_info.status != CommandStatus.RUNNING:
            logger.warning(f"Command {command_id} is not running (status: {cmd_info.status})")
            return False

        if cmd_info.process:
            try:
                cmd_info.process.terminate()
                cmd_info.process.wait(timeout=5)
                cmd_info.status = CommandStatus.STOPPED
                cmd_info.end_time = datetime.now()
                logger.info(f"Command {command_id} stopped successfully")
                return True
            except subprocess.TimeoutExpired:
                # 强制结束
                cmd_info.process.kill()
                cmd_info.status = CommandStatus.STOPPED
                cmd_info.end_time = datetime.now()
                logger.warning(f"Command {command_id} killed forcefully")
                return True
            except Exception as e:
                logger.error(f"Error stopping command {command_id}: {e}")
                return False

        return False

    def get_command_info(self, command_id: str) -> Optional[CommandInfo]:
        """获取命令信息"""
        return self._commands.get(command_id)

    def get_all_commands(self) -> Dict[str, CommandInfo]:
        """获取所有命令信息"""
        return self._commands.copy()

    def remove_command(self, command_id: str) -> bool:
        """删除命令记录"""
        if command_id in self._commands:
            del self._commands[command_id]
            return True
        return False


# 全局实例
process_manager = ProcessManager()
