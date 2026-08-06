"""에이전트 REST API 테스트.

명세 11.5절이 지정한 테스트 우선순위 중 2번(REST API의 role 존재 검증 404)에
해당하며, 그 주변의 인증·충돌·페이지네이션까지 함께 덮는다.
"""

from tests.conftest import AUTH, requires_db

pytestmark = requires_db


# --- 인증 (9.3절) ------------------------------------------------------


def test_missing_api_key_is_401(client):
    """헤더 누락은 422가 아니라 401이어야 한다.

    Header(...)로 필수 선언하면 FastAPI가 422를 준다. 인증 실패는
    "요청 형식 오류"가 아니라 "권한 없음"이므로 401로 감쌌다.
    """
    assert client.get("/api/agents").status_code == 401


def test_wrong_api_key_is_401(client):
    assert client.get("/api/agents", headers={"x-api-key": "nope"}).status_code == 401


def test_valid_api_key_passes(client):
    assert client.get("/api/agents", headers=AUTH).status_code == 200


# --- 생성 (9.3절 핵심) --------------------------------------------------


def test_create_with_unknown_role_is_404(client):
    """role 존재 여부를 앱 레벨에서 먼저 확인해 404로 명확히 응답한다.

    FK 제약은 최후 방어선이지 사용자에게 보여줄 에러가 아니다.
    """
    res = client.post("/api/agents", headers=AUTH, json={"name": "Ghost", "role": "nope"})
    assert res.status_code == 404
    assert "nope" in res.json()["detail"]


def test_create_then_duplicate_name_is_409(client):
    body = {"name": "Probe", "role": "coder"}

    first = client.post("/api/agents", headers=AUTH, json=body)
    assert first.status_code == 201
    created = first.json()
    assert created["state"] == "idle"
    assert created["retry_count"] == 0

    # agent_id를 이름 기반으로 만들기 때문에 같은 이름은 충돌한다.
    # 프로토타입 단계의 의도된 제약이며 Phase 6에서 UUID로 바꾼다.
    assert client.post("/api/agents", headers=AUTH, json=body).status_code == 409


def test_get_unknown_agent_is_404(client):
    assert client.get("/api/agents/agent-nope", headers=AUTH).status_code == 404


def test_state_filter(client):
    client.post("/api/agents", headers=AUTH, json={"name": "Filt", "role": "coder"})

    idle = client.get("/api/agents?state=idle", headers=AUTH).json()
    assert any(a["agent_id"] == "agent-filt" for a in idle)

    done = client.get("/api/agents?state=done", headers=AUTH).json()
    assert all(a["state"] == "done" for a in done)


def test_patch_renames_agent(client):
    client.post("/api/agents", headers=AUTH, json={"name": "Before", "role": "coder"})
    res = client.patch("/api/agents/agent-before", headers=AUTH, json={"name": "After"})
    assert res.status_code == 200
    assert res.json()["name"] == "After"


# --- 삭제와 이력 보존 (3.2절) ------------------------------------------


def test_delete_keeps_logs(client):
    """에이전트를 지워도 이력은 남아야 한다.

    삭제된 에이전트도 나중에 복기할 수 있어야 하므로 agent_logs는
    agents를 FK로 참조하지 않는다.
    """
    client.post("/api/agents", headers=AUTH, json={"name": "Temp", "role": "coder"})

    before = client.get("/api/agents/agent-temp/logs", headers=AUTH).json()
    assert before["total"] >= 1

    assert client.delete("/api/agents/agent-temp", headers=AUTH).status_code == 204
    assert client.get("/api/agents/agent-temp", headers=AUTH).status_code == 404

    after = client.get("/api/agents/agent-temp/logs", headers=AUTH).json()
    assert after["total"] == before["total"]


def test_delete_unknown_agent_is_404(client):
    assert client.delete("/api/agents/agent-nope", headers=AUTH).status_code == 404


# --- 이력 조회 (9.2절) --------------------------------------------------


def test_logs_pagination(client):
    client.post("/api/agents", headers=AUTH, json={"name": "Paged", "role": "coder"})
    # 상태를 여러 번 바꿔 이력을 쌓는다
    for name in ("A", "B", "C"):
        client.patch("/api/agents/agent-paged", headers=AUTH, json={"name": name})

    page = client.get("/api/agents/agent-paged/logs?limit=2", headers=AUTH).json()
    assert page["limit"] == 2
    assert page["offset"] == 0
    assert page["total"] >= 4
    assert len(page["items"]) == 2

    # 최신순 정렬이므로 offset을 밀면 다른 항목이 나와야 한다
    second = client.get("/api/agents/agent-paged/logs?limit=2&offset=2", headers=AUTH).json()
    assert second["items"][0]["created_at"] != page["items"][0]["created_at"]


def test_logs_limit_is_bounded(client):
    """limit 상한이 없으면 실수로 수십만 행을 한 번에 끌어올 수 있다."""
    assert client.get("/api/agents/agent-x/logs?limit=9999", headers=AUTH).status_code == 422
    assert client.get("/api/agents/agent-x/logs?limit=0", headers=AUTH).status_code == 422
    assert client.get("/api/agents/agent-x/logs?offset=-1", headers=AUTH).status_code == 422
