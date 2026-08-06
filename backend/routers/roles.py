"""역할 및 glTF 모델 REST API (명세 9.1 / 9.2절).

역할을 코드에 고정하지 않고 API로 동적 관리한다. 캐릭터 모델(glTF 경로)
매핑이 역할 정의에 포함되므로, 새 역할을 추가하는 것이 곧 새 캐릭터를
등록하는 행위가 된다.
"""

import os

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

import db
from auth import verify_api_key
from config import get_settings
from models import Role, RoleCreate, RolePatch
from storage import get_storage

router = APIRouter(prefix="/api/roles", dependencies=[Depends(verify_api_key)])


@router.get("")
async def list_roles() -> list[Role]:
    return await db.fetch_roles()


@router.post("", status_code=201)
async def create_role(body: RoleCreate) -> Role:
    async with db.get_pool().acquire() as conn:
        try:
            await conn.execute(
                "INSERT INTO roles (role_id, display_name, model_path) VALUES ($1,$2,$3)",
                body.role_id,
                body.display_name,
                body.model_path,
            )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(409, f"role '{body.role_id}' 가 이미 있습니다") from exc

    roles = {r.role_id: r for r in await db.fetch_roles()}
    return roles[body.role_id]


@router.patch("/{role_id}")
async def patch_role(role_id: str, body: RolePatch) -> Role:
    if not await db.role_exists(role_id):
        raise HTTPException(404, f"role '{role_id}' not found")

    if body.display_name is not None:
        async with db.get_pool().acquire() as conn:
            await conn.execute(
                "UPDATE roles SET display_name = $1 WHERE role_id = $2",
                body.display_name,
                role_id,
            )

    roles = {r.role_id: r for r in await db.fetch_roles()}
    return roles[role_id]


@router.delete("/{role_id}", status_code=204)
async def delete_role(role_id: str) -> None:
    """역할 삭제.

    ⚠️ 해당 역할을 쓰는 에이전트가 하나라도 있으면 FK 제약 위반(23503)이
       발생한다. 이 에러를 그대로 노출하지 말고 409 Conflict로 감싸서
       "사용 중인 에이전트가 있습니다"로 응답한다 (9장 주의사항).
    """
    if not await db.role_exists(role_id):
        raise HTTPException(404, f"role '{role_id}' not found")

    async with db.get_pool().acquire() as conn:
        try:
            await conn.execute("DELETE FROM roles WHERE role_id = $1", role_id)
        except asyncpg.ForeignKeyViolationError as exc:
            in_use = await conn.fetchval("SELECT count(*) FROM agents WHERE role = $1", role_id)
            raise HTTPException(409, f"사용 중인 에이전트가 있습니다 ({in_use}개)") from exc


@router.post("/{role_id}/model")
async def upload_model(role_id: str, file: UploadFile = File(...)) -> dict:
    """glTF 모델 업로드 (multipart, .glb/.gltf, 최대 20MB).

    저장은 storage 모듈에 위임한다 — AWS 전환 시 S3 구현으로 갈아끼우기
    위한 경계다 (10.6절). DB에는 오리진 없는 경로만 기록하고, 절대 URL
    조립은 프론트가 담당한다 (docs/SPEC-NOTES.md 5번 항목).
    """
    settings = get_settings()

    if not await db.role_exists(role_id):
        raise HTTPException(404, f"role '{role_id}' not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in settings.allowed_model_ext:
        allowed = " / ".join(settings.allowed_model_ext)
        raise HTTPException(400, f"허용되지 않은 확장자: {ext or '(없음)'} ({allowed}만 가능)")

    contents = await file.read()
    if len(contents) > settings.max_model_size:
        limit_mb = settings.max_model_size // (1024 * 1024)
        raise HTTPException(413, f"파일이 {limit_mb}MB를 초과합니다")

    model_path = get_storage().save(f"{role_id}{ext}", contents)

    async with db.get_pool().acquire() as conn:
        await conn.execute(
            "UPDATE roles SET model_path = $1 WHERE role_id = $2", model_path, role_id
        )

    return {"role_id": role_id, "model_path": model_path, "size": len(contents)}
