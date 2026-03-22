from fastapi import APIRouter
import os
from pathlib import Path
from app.models.response import ApiResponse
from app.config import settings

router = APIRouter()


@router.get("/tree")
async def get_tutorial_tree():
    """获取教程目录树"""
    tutorial_path = Path(settings.TUTORIAL_PATH)

    if not tutorial_path.exists():
        return ApiResponse.error(code=1006, message="Tutorial directory not found")

    tree = {}

    try:
        # 扫描目录
        for folder in tutorial_path.iterdir():
            if folder.is_dir():
                folder_name = folder.name
                tree[folder_name] = []

                # 扫描 Markdown 文件
                for md_file in folder.glob("*.md"):
                    tree[folder_name].append(
                        {
                            "name": md_file.stem,  # 文件名（不含扩展名）
                            "path": f"{folder_name}/{md_file.name}",
                        }
                    )

        return ApiResponse.success(data={"tree": tree})

    except Exception as e:
        return ApiResponse.error(code=2000, message="Failed to scan tutorial directory", error=str(e))


@router.get("/content")
async def get_tutorial_content(path: str):
    """获取教程内容"""
    tutorial_path = Path(settings.TUTORIAL_PATH) / path

    if not tutorial_path.exists():
        return ApiResponse.error(code=1006, message="Tutorial file not found")

    if not tutorial_path.suffix == ".md":
        return ApiResponse.error(code=1002, message="Only Markdown files are supported")

    try:
        content = tutorial_path.read_text(encoding="utf-8")
        return ApiResponse.success(
            data={
                "path": path,
                "content": content,
                "lastModified": str(tutorial_path.stat().st_mtime),
            }
        )
    except Exception as e:
        return ApiResponse.error(code=2000, message="Failed to read tutorial file", error=str(e))
