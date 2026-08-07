"""WebSocket 인증 테스트 (명세 9.3절 / 9장 주의사항).

이 엔드포인트는 한동안 인증 없이 열려 있었다. REST 는 API Key 로 잠겨 있는데
실시간 상태는 누구나 볼 수 있는 비대칭이었고, 외부에 열기 전에 닫기로 한
항목이었다. 다시 열리지 않도록 여기서 잠근다.
"""

import pytest
from starlette.websockets import WebSocketDisconnect

from auth import TICKET_TTL_SECONDS, consume_ws_ticket, issue_ws_ticket, origin_allowed
from tests.conftest import AUTH, requires_db

pytestmark = requires_db

ORIGIN = "http://localhost:3000"
# 정책 위반 (RFC 6455). 거절 사유를 코드로 남겨야 인증 실패와 네트워크 장애가 갈린다.
POLICY_VIOLATION = 1008


def _ticket(client) -> str:
    res = client.post("/api/ws-ticket", headers=AUTH)
    assert res.status_code == 201
    body = res.json()
    assert body["expires_in"] == TICKET_TTL_SECONDS
    return body["ticket"]


def _expect_rejected(client, path: str, headers: dict | None = None) -> str:
    """접속이 정책 위반으로 거절되는지 확인하고 사유를 돌려준다.

    단순히 "예외가 났다"로 검사하면 오타나 라우팅 실수로 연결이 실패해도
    통과해 버린다. 거절 코드까지 봐야 인증이 실제로 작동한 것이 확인된다.
    """
    with pytest.raises(WebSocketDisconnect) as err:
        with client.websocket_connect(path, headers=headers or {}):
            pass
    assert err.value.code == POLICY_VIOLATION
    return err.value.reason


# --- 티켓 발급 ---------------------------------------------------------


def test_ticket_requires_api_key(client):
    """티켓 발급 자체가 잠겨 있지 않으면 아무 의미가 없다."""
    assert client.post("/api/ws-ticket").status_code == 401
    assert client.post("/api/ws-ticket", headers={"x-api-key": "nope"}).status_code == 401


def test_ticket_is_unique_per_request(client):
    """매 접속마다 새 티켓을 받는다. 같은 값이 나오면 재사용이 가능해진다."""
    assert _ticket(client) != _ticket(client)


# --- 접속 검증 ---------------------------------------------------------


def test_connect_without_ticket_is_rejected(client):
    assert "ticket" in _expect_rejected(client, "/ws").lower()


def test_connect_with_bogus_ticket_is_rejected(client):
    assert "ticket" in _expect_rejected(client, "/ws?ticket=not-a-real-ticket").lower()


def test_connect_with_valid_ticket_receives_snapshot(client):
    ticket = _ticket(client)
    with client.websocket_connect(f"/ws?ticket={ticket}") as ws:
        assert ws.receive_json()["type"] == "agent_snapshot"


def test_ticket_cannot_be_reused(client):
    """1회용이라는 것이 이 방식의 핵심이다.

    티켓은 쿼리스트링에 실려 서버 로그와 브라우저 히스토리에 남는다.
    재사용이 되면 그 기록이 그대로 열쇠가 된다.
    """
    ticket = _ticket(client)
    with client.websocket_connect(f"/ws?ticket={ticket}") as ws:
        ws.receive_json()

    assert "ticket" in _expect_rejected(client, f"/ws?ticket={ticket}").lower()


def test_foreign_origin_is_rejected(client):
    """CORS 는 WebSocket 에 적용되지 않으므로 직접 봐야 한다.

    악성 페이지가 방문자의 브라우저로 우리 서버에 붙는 것을 막는다.
    """
    ticket = _ticket(client)
    reason = _expect_rejected(
        client, f"/ws?ticket={ticket}", headers={"origin": "http://evil.example"}
    )
    assert "origin" in reason.lower()

    # Origin 검사가 먼저이므로 티켓은 아직 소모되지 않았어야 한다.
    # 순서가 뒤집히면 남의 페이지가 티켓을 태워 버려 정상 접속을 막을 수 있다.
    with client.websocket_connect(f"/ws?ticket={ticket}", headers={"origin": ORIGIN}) as ws:
        assert ws.receive_json()["type"] == "agent_snapshot"


def test_allowed_origin_passes(client):
    ticket = _ticket(client)
    with client.websocket_connect(f"/ws?ticket={ticket}", headers={"origin": ORIGIN}) as ws:
        assert ws.receive_json()["type"] == "agent_snapshot"


# --- 티켓 자체의 규칙 (DB 없이도 도는 순수 로직) -------------------------


def test_consume_rejects_empty():
    assert consume_ws_ticket(None) is False
    assert consume_ws_ticket("") is False


def test_consume_succeeds_once():
    ticket = issue_ws_ticket()
    assert consume_ws_ticket(ticket) is True
    assert consume_ws_ticket(ticket) is False


def test_origin_allowed_rules():
    # 브라우저가 아닌 클라이언트는 Origin 을 보내지 않는다. 어차피 티켓이 필요하다.
    assert origin_allowed(None) is True
    assert origin_allowed(ORIGIN) is True
    assert origin_allowed("http://evil.example") is False


def test_multiple_origins_are_allowed(monkeypatch):
    """터널로 열어 볼 때 로컬 개발이 막히지 않아야 한다.

    하나만 받으면 열어 볼 때마다 값을 바꾸고 되돌리는 일이 반복되고,
    되돌리는 것을 잊으면 다음 사람이 원인을 못 찾는다.
    """
    from config import Settings

    s = Settings(ws_allowed_origin=f" {ORIGIN} , https://tunnel.example:8443 ,, ")
    assert s.allowed_origins == [ORIGIN, "https://tunnel.example:8443"]


def test_single_origin_still_works():
    from config import Settings

    assert Settings(ws_allowed_origin=ORIGIN).allowed_origins == [ORIGIN]
