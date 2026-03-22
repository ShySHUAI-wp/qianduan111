"""
端口工具类
提供串口相关的工具函数
"""
import os
import stat
import logging
import subprocess
from typing import List, Optional
import serial.tools.list_ports

from app.models.device import PortInfo, PortPermission

logger = logging.getLogger(__name__)


class PortUtils:
    """端口工具类"""

    @staticmethod
    def list_ports() -> List[PortInfo]:
        """
        列出所有可用的串口

        Returns:
            List[PortInfo]: 串口信息列表
        """
        try:
            ports = serial.tools.list_ports.comports()
            port_list = []

            for port in ports:
                port_info = PortInfo(
                    path=port.device,
                    description=port.description or "Unknown",
                    hwid=port.hwid or "Unknown",
                )
                port_list.append(port_info)

            logger.info(f"Found {len(port_list)} serial ports")
            return port_list

        except Exception as e:
            logger.error(f"Error listing ports: {e}", exc_info=True)
            return []

    @staticmethod
    def check_port_permission(port: str) -> PortPermission:
        """
        检查端口权限

        Args:
            port: 端口路径，如 /dev/ttyACM0

        Returns:
            PortPermission: 权限信息
        """
        try:
            if not os.path.exists(port):
                logger.warning(f"Port {port} does not exist")
                return PortPermission(
                    port=port,
                    readable=False,
                    writable=False,
                    mode="0000",
                    owner="unknown",
                    group="unknown",
                )

            # 获取文件状态
            file_stat = os.stat(port)
            mode = stat.filemode(file_stat.st_mode)
            octal_mode = oct(file_stat.st_mode)[-4:]

            # 检查读写权限
            readable = os.access(port, os.R_OK)
            writable = os.access(port, os.W_OK)

            # 获取所有者和组信息
            try:
                import pwd
                import grp

                owner = pwd.getpwuid(file_stat.st_uid).pw_name
                group = grp.getgrgid(file_stat.st_gid).gr_name
            except Exception as e:
                logger.warning(f"Error getting owner/group info: {e}")
                owner = str(file_stat.st_uid)
                group = str(file_stat.st_gid)

            permission = PortPermission(
                port=port,
                readable=readable,
                writable=writable,
                mode=octal_mode,
                owner=owner,
                group=group,
            )

            logger.info(
                f"Port {port} permission: {mode} (readable: {readable}, writable: {writable})"
            )
            return permission

        except Exception as e:
            logger.error(f"Error checking port permission for {port}: {e}", exc_info=True)
            return PortPermission(
                port=port,
                readable=False,
                writable=False,
                mode="0000",
                owner="unknown",
                group="unknown",
            )

    @staticmethod
    def grant_port_permission(port: str) -> bool:
        """
        授予端口读写权限

        Args:
            port: 端口路径，如 /dev/ttyACM0

        Returns:
            bool: 是否成功授予权限
        """
        try:
            if not os.path.exists(port):
                logger.error(f"Port {port} does not exist")
                return False

            # 执行 sudo chmod 666
            command = f"sudo chmod 666 {port}"
            logger.info(f"Granting permission to {port}: {command}")

            result = subprocess.run(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5,
            )

            if result.returncode == 0:
                logger.info(f"Successfully granted permission to {port}")
                return True
            else:
                logger.error(
                    f"Failed to grant permission to {port}: {result.stderr}"
                )
                return False

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout while granting permission to {port}")
            return False
        except Exception as e:
            logger.error(
                f"Error granting permission to {port}: {e}", exc_info=True
            )
            return False

    @staticmethod
    def parse_find_port_output(output: List[str]) -> Optional[str]:
        """
        解析 lerobot-find-port 命令的输出，提取找到的端口

        Args:
            output: 命令输出行列表

        Returns:
            Optional[str]: 找到的端口路径，如果没找到则返回 None
        """
        try:
            for line in output:
                # 查找类似 "The port is '/dev/ttyACM0'" 的行
                if "The port is" in line:
                    # 提取引号中的路径
                    import re

                    match = re.search(r"'([^']+)'", line)
                    if match:
                        port = match.group(1)
                        logger.info(f"Found port from output: {port}")
                        return port

            logger.warning("Could not find port in output")
            return None

        except Exception as e:
            logger.error(f"Error parsing find port output: {e}", exc_info=True)
            return None
