"""업로드 파일 저장소 추상화 (명세 10.6절).

명세 10.6절이 직접 권고한 모듈이다. glTF 모델을 로컬 디스크에 저장하는 방식은
"DATABASE_URL만 바꾸면 전환 끝"이라는 8장 원칙과 다르게 움직인다 — EC2를
재배포하거나 여러 대로 늘리면 파일이 유실되거나 인스턴스마다 따로 저장된다.

지금 로컬 디스크 구현과 (장래의) S3 구현을 인터페이스로 갈라 두면,
환경변수 하나로 전환되지는 않아도 코드 재작성 범위는 최소화할 수 있다.
"""

import os
from pathlib import Path
from typing import Protocol

from config import get_settings


class Storage(Protocol):
    """저장소 인터페이스.

    save()가 반환하는 것은 절대 URL이 아니라 '/models/researcher.glb' 형태의
    경로다. 오리진 결합은 클라이언트가 담당한다 — 그래야 백엔드 주소가 바뀌어도
    DB에 저장된 model_path를 마이그레이션할 필요가 없다.
    """

    def save(self, filename: str, content: bytes) -> str: ...

    def delete(self, filename: str) -> None: ...


class LocalDiskStorage:
    """로컬 디스크 구현 (Phase 1~7a)."""

    def __init__(self, base_dir: str) -> None:
        self.base_dir = Path(base_dir)

    def save(self, filename: str, content: bytes) -> str:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        # 경로 조작 방지 — role_id가 '../' 를 포함해도 base_dir를 벗어나지 못하게 한다
        safe_name = os.path.basename(filename)
        (self.base_dir / safe_name).write_bytes(content)
        return f"/models/{safe_name}"

    def delete(self, filename: str) -> None:
        safe_name = os.path.basename(filename)
        (self.base_dir / safe_name).unlink(missing_ok=True)


# TODO(Phase 7b): S3Storage 구현 후 환경변수로 선택하도록 전환 (10.6절)
#   class S3Storage:
#       def __init__(self, bucket: str, prefix: str = "models/"): ...


def get_storage() -> Storage:
    return LocalDiskStorage(get_settings().upload_dir)


def ensure_upload_dir() -> None:
    """StaticFiles 마운트는 디렉토리가 없으면 기동 시점에 실패한다."""
    Path(get_settings().upload_dir).mkdir(parents=True, exist_ok=True)
