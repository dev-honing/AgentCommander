"""역할 REST API 테스트.

핵심은 "사용 중인 역할 삭제"다. FK 제약 위반(23503)을 그대로 노출하지 않고
409 Conflict로 감싸는지 확인한다 — 명세 9장 주의사항.
"""

from config import get_settings
from tests.conftest import AUTH, requires_db

pytestmark = requires_db


def test_seed_roles_exist(client):
    """초기 마이그레이션이 기본 역할 3종을 넣어야 한다.

    이게 없으면 목업 오케스트레이터의 첫 저장이 FK 위반으로 죽는다.
    """
    roles = client.get("/api/roles", headers=AUTH).json()
    ids = {r["role_id"] for r in roles}
    assert {"researcher", "coder", "reviewer"} <= ids


def test_delete_role_in_use_is_409(client):
    """FK 위반을 사용자에게 보여줄 형태로 감싸는지 확인한다."""
    client.post("/api/agents", headers=AUTH, json={"name": "User", "role": "reviewer"})

    res = client.delete("/api/roles/reviewer", headers=AUTH)
    assert res.status_code == 409
    assert "사용 중인 에이전트" in res.json()["detail"]

    # 역할이 실제로 남아 있어야 한다
    ids = {r["role_id"] for r in client.get("/api/roles", headers=AUTH).json()}
    assert "reviewer" in ids


def test_delete_unused_role_succeeds(client):
    client.post(
        "/api/roles",
        headers=AUTH,
        json={"role_id": "temp", "display_name": "Temp", "model_path": "/models/temp.glb"},
    )
    assert client.delete("/api/roles/temp", headers=AUTH).status_code == 204


def test_delete_unknown_role_is_404(client):
    assert client.delete("/api/roles/nope", headers=AUTH).status_code == 404


def test_duplicate_role_is_409(client):
    body = {"role_id": "researcher", "display_name": "Dup", "model_path": "/models/x.glb"}
    assert client.post("/api/roles", headers=AUTH, json=body).status_code == 409


def test_patch_role_display_name(client):
    res = client.patch("/api/roles/coder", headers=AUTH, json={"display_name": "Coder2"})
    assert res.status_code == 200
    assert res.json()["display_name"] == "Coder2"
    # 원상복구 — 이 테이블은 테스트 간 초기화 대상이 아니다
    client.patch("/api/roles/coder", headers=AUTH, json={"display_name": "Coder"})


# --- 모델 업로드 (9.2절) -----------------------------------------------


def test_upload_rejects_bad_extension(client):
    res = client.post(
        "/api/roles/coder/model",
        headers=AUTH,
        files={"file": ("evil.exe", b"MZ", "application/octet-stream")},
    )
    assert res.status_code == 400
    assert ".glb" in res.json()["detail"]


def test_upload_rejects_oversized_file(client, monkeypatch):
    """20MB짜리 더미를 만들지 않도록 상한을 임시로 낮춰 검증한다."""
    monkeypatch.setattr(get_settings(), "max_model_size", 8)
    res = client.post(
        "/api/roles/coder/model",
        headers=AUTH,
        files={"file": ("big.glb", b"0123456789", "model/gltf-binary")},
    )
    assert res.status_code == 413


def test_upload_unknown_role_is_404(client):
    res = client.post(
        "/api/roles/nope/model",
        headers=AUTH,
        files={"file": ("a.glb", b"x", "model/gltf-binary")},
    )
    assert res.status_code == 404


def test_upload_stores_path_without_origin(client, tmp_path, monkeypatch):
    """DB에는 오리진 없는 경로만 기록한다.

    절대 URL 조립은 프론트가 담당한다 — 백엔드 주소가 바뀌어도 DB 값을
    마이그레이션할 필요가 없게 하려는 분리다 (docs/SPEC-NOTES.md 5번).
    """
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))

    res = client.post(
        "/api/roles/coder/model",
        headers=AUTH,
        files={"file": ("coder.glb", b"glTF-dummy", "model/gltf-binary")},
    )
    assert res.status_code == 200
    assert res.json()["model_path"] == "/models/coder.glb"
    assert (tmp_path / "coder.glb").read_bytes() == b"glTF-dummy"


def test_upload_path_traversal_is_contained(client, tmp_path, monkeypatch):
    """role_id에 경로 조작이 섞여도 저장 위치를 벗어나면 안 된다."""
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    client.post(
        "/api/roles",
        headers=AUTH,
        json={"role_id": "trav", "display_name": "T", "model_path": "/models/trav.glb"},
    )

    res = client.post(
        "/api/roles/trav/model",
        headers=AUTH,
        files={"file": ("../../escape.glb", b"x", "model/gltf-binary")},
    )
    assert res.status_code == 200
    # 파일명은 basename만 남고 upload_dir 안에 저장된다
    assert not (tmp_path.parent / "escape.glb").exists()
    assert list(tmp_path.glob("*.glb"))
