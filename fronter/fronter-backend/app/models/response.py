from pydantic import BaseModel
from typing import Optional, Any, Dict


class ApiResponse(BaseModel):
    """
    统一响应格式

    注意: success() 和 error() 方法直接返回字典,
    而不是 Pydantic 模型实例,以确保 FastAPI 正确序列化
    """

    code: int
    message: str
    data: Optional[Any] = None

    @classmethod
    def success(cls, data: Any = None, message: str = "Success") -> Dict[str, Any]:
        """
        成功响应

        Returns:
            dict: {"code": 0, "message": "Success", "data": ...}
        """
        response = {"code": 0, "message": message}
        if data is not None:
            response["data"] = data
        return response

    @classmethod
    def error(
        cls, code: int = 1000, message: str = "Error", error: str = None
    ) -> Dict[str, Any]:
        """
        错误响应

        Returns:
            dict: {"code": 错误码, "message": "错误信息", "error": "详细错误"}
        """
        response = {"code": code, "message": message}
        if error is not None:
            response["error"] = error
        return response
