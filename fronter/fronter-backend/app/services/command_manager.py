"""
命令进程管理器

管理后台运行的命令进程，包括启动、停止、状态查询和输出捕获
"""

import asyncio
import logging
import os
import signal
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class CommandProcess:
    """命令进程信息"""

    def __init__(self, command_id: str, command: str, process: asyncio.subprocess.Process):
        self.command_id = command_id
        self.command = command
        self.process = process
        self.status = "running"
        self.output_lines: List[str] = []
        self.start_time = datetime.now()
        self.end_time: Optional[datetime] = None
        self.exit_code: Optional[int] = None

    def add_output(self, line: str):
        """添加输出行"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.output_lines.append(f"[{timestamp}] {line}")

    def get_output(self, offset: int = 0, limit: int = 1000) -> List[str]:
        """获取输出行"""
        return self.output_lines[offset : offset + limit]

    def get_total_output_lines(self) -> int:
        """获取总输出行数"""
        return len(self.output_lines)


class CommandManager:
    """命令管理器"""

    def __init__(self):
        self.commands: Dict[str, CommandProcess] = {}
        self._output_tasks: Dict[str, asyncio.Task] = {}

    async def start_command(self, command_id: str, command: str) -> CommandProcess:
        """
        启动命令进程

        Args:
            command_id: 命令ID
            command: 要执行的命令

        Returns:
            CommandProcess: 命令进程对象
        """
        try:
            logger.info(f"Starting command {command_id}: {command}")

            # 创建子进程，使用 start_new_session 来创建新的进程组
            # 这样可以一次性终止所有子进程
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,  # 合并stderr到stdout
                stdin=asyncio.subprocess.PIPE,
                start_new_session=True,  # 关键：创建新的会话
            )

            # 创建命令进程对象
            cmd_process = CommandProcess(command_id, command, process)
            self.commands[command_id] = cmd_process

            # 启动输出捕获任务
            output_task = asyncio.create_task(self._capture_output(cmd_process))
            self._output_tasks[command_id] = output_task

            logger.info(f"Command {command_id} started with PID {process.pid}")
            return cmd_process

        except Exception as e:
            logger.error(f"Failed to start command {command_id}: {e}", exc_info=True)
            raise

    async def _capture_output(self, cmd_process: CommandProcess):
        """
        捕获进程输出

        Args:
            cmd_process: 命令进程对象
        """
        try:
            process = cmd_process.process

            # 读取stdout
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                line_str = line.decode("utf-8", errors="replace").rstrip()
                if line_str:
                    cmd_process.add_output(line_str)
                    logger.debug(f"[{cmd_process.command_id}] {line_str}")

            # 等待进程结束
            exit_code = await process.wait()
            cmd_process.exit_code = exit_code
            cmd_process.end_time = datetime.now()

            if exit_code == 0:
                cmd_process.status = "completed"
                cmd_process.add_output(f"✅ 命令执行成功，退出码: {exit_code}")
                logger.info(f"Command {cmd_process.command_id} completed successfully")
            else:
                cmd_process.status = "failed"
                cmd_process.add_output(f"❌ 命令执行失败，退出码: {exit_code}")
                logger.warning(
                    f"Command {cmd_process.command_id} failed with exit code {exit_code}"
                )

        except asyncio.CancelledError:
            logger.info(f"Output capture cancelled for command {cmd_process.command_id}")
            raise
        except Exception as e:
            cmd_process.status = "error"
            cmd_process.add_output(f"❌ 捕获输出时出错: {str(e)}")
            logger.error(f"Error capturing output for {cmd_process.command_id}: {e}", exc_info=True)

    async def stop_command(self, command_id: str) -> bool:
        """
        停止命令进程

        Args:
            command_id: 命令ID

        Returns:
            bool: 是否成功停止
        """
        print('停止')
        if command_id not in self.commands:
            logger.warning(f"Command {command_id} not found")
            return False

        cmd_process = self.commands[command_id]

        if cmd_process.status not in ["running"]:
            logger.info(f"Command {command_id} is not running (status: {cmd_process.status})")
            return False

        try:
            pid = cmd_process.process.pid
            logger.info(f"Stopping command {command_id} (PID: {pid})")
            cmd_process.add_output(f"⏸️ 正在停止命令 (PID: {pid})...")

            # 由于使用了 start_new_session=True，需要向整个进程组发送信号
            try:
                # 1. 首先尝试优雅终止整个进程组 (SIGTERM)
                print(pid)
                logger.info(f"Sending SIGTERM to process group {pid}")
                os.killpg(os.getpgid(pid), signal.SIGTERM)
                cmd_process.add_output("📤 已发送 SIGTERM 信号到进程组")

                # 等待进程结束，最多等待5秒
                try:
                    await asyncio.wait_for(cmd_process.process.wait(), timeout=5.0)
                    logger.info(f"Command {command_id} terminated gracefully")
                    cmd_process.add_output("✅ 进程已优雅退出")
                except asyncio.TimeoutError:
                    # 2. 如果超时，强制杀死整个进程组 (SIGKILL)
                    logger.warning(f"Command {command_id} did not terminate gracefully, killing...")
                    cmd_process.add_output("⚠️ 进程未响应，强制终止...")
                    os.killpg(os.getpgid(pid), signal.SIGKILL)
                    cmd_process.add_output("📤 已发送 SIGKILL 信号到进程组")
                    await cmd_process.process.wait()
                    logger.info(f"Command {command_id} killed forcefully")
                    cmd_process.add_output("✅ 进程已强制终止")

            except ProcessLookupError:
                # 进程已经不存在了
                logger.info(f"Process {pid} already terminated")
                cmd_process.add_output("ℹ️ 进程已经终止")

            # 取消输出捕获任务
            if command_id in self._output_tasks:
                self._output_tasks[command_id].cancel()
                try:
                    await self._output_tasks[command_id]
                except asyncio.CancelledError:
                    pass
                del self._output_tasks[command_id]

            cmd_process.status = "stopped"
            cmd_process.end_time = datetime.now()
            cmd_process.add_output("⏹️ 命令已被停止")

            logger.info(f"Command {command_id} stopped successfully")
            return True

        except Exception as e:
            logger.error(f"Error stopping command {command_id}: {e}", exc_info=True)
            cmd_process.add_output(f"❌ 停止命令时出错: {str(e)}")
            return False

    def get_command_status(self, command_id: str) -> Optional[Dict]:
        """
        获取命令状态

        Args:
            command_id: 命令ID

        Returns:
            Dict: 命令状态信息
        """
        if command_id not in self.commands:
            return None

        cmd_process = self.commands[command_id]

        return {
            "commandId": command_id,
            "status": cmd_process.status,
            "command": cmd_process.command,
            "startTime": cmd_process.start_time.isoformat(),
            "endTime": cmd_process.end_time.isoformat() if cmd_process.end_time else None,
            "exitCode": cmd_process.exit_code,
            "pid": cmd_process.process.pid if cmd_process.process else None,
            "outputLines": cmd_process.get_total_output_lines(),
        }

    def get_command_output(
        self, command_id: str, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict]:
        """
        获取命令输出

        Args:
            command_id: 命令ID
            offset: 起始行号
            limit: 最大行数

        Returns:
            Dict: 输出信息
        """
        if command_id not in self.commands:
            return None

        cmd_process = self.commands[command_id]
        lines = cmd_process.get_output(offset, limit)
        total = cmd_process.get_total_output_lines()

        return {
            "commandId": command_id,
            "lines": lines,
            "total": total,
            "offset": offset,
            "limit": limit,
        }

    def list_commands(self) -> List[Dict]:
        """列出所有命令"""
        return [self.get_command_status(cmd_id) for cmd_id in self.commands.keys()]

    async def cleanup_finished_commands(self, keep_last_n: int = 10):
        """
        清理已完成的命令，保留最近N个

        Args:
            keep_last_n: 保留的命令数量
        """
        finished_commands = [
            cmd_id
            for cmd_id, cmd_proc in self.commands.items()
            if cmd_proc.status in ["completed", "failed", "stopped", "error"]
        ]

        if len(finished_commands) > keep_last_n:
            # 按结束时间排序
            finished_commands.sort(
                key=lambda cmd_id: self.commands[cmd_id].end_time or datetime.min
            )

            # 删除最旧的命令
            for cmd_id in finished_commands[:-keep_last_n]:
                logger.info(f"Cleaning up old command {cmd_id}")
                del self.commands[cmd_id]
                if cmd_id in self._output_tasks:
                    del self._output_tasks[cmd_id]


# 全局命令管理器实例
command_manager = CommandManager()