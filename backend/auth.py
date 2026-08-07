"""인증 (명세 9.3절).

REST 는 API Key 헤더로 잠근다. WebSocket 은 브라우저 API 가 헤더를 붙일 수
없으므로 같은 방식을 쓸 수 없어, **단발성 티켓**으로 잇는다.

    1. 브라우저가 Next 프록시를 통해 POST /api/ws-ticket 을 부른다.
       (이 요청은 API Key 로 잠겨 있고, 키는 프록시 서버에만 있다)
    2. 백엔드가 짧게 사는 1회용 티켓을 내준다.
    3. 브라우저가 ws://.../ws?ticket=... 으로 접속한다.
    4. 백엔드가 티켓을 소모하고 연결을 받는다.

이 방식을 고른 이유는 API Key 가 브라우저로 새지 않아야 한다는 제약 때문이다.
쿼리스트링에 키를 그대로 실으면 서버 로그·브라우저 히스토리에 영구히 남는데,
티켓은 30초 뒤 무효가 되고 한 번 쓰면 사라진다.

⚠️ 검증을 끄는 설정은 두지 않았다. 원래 계획은 AUTH_TOKEN 이 비면 건너뛰는
   것이었으나, "기본적으로 꺼져 있는 보호"가 바로 이 비대칭을 만든 원인이다.
   외부에 열기 직전에 설정을 켜는 것을 잊으면 그대로 노출된다.
"""

import secrets
import time

from fastapi import Header, HTTPException

from config import get_settings

# 티켓 유효 시간(초).
#
# 발급받고 곧바로 접속하는 용도라 짧아도 된다. 다만 브라우저가 탭을 백그라운드로
# 돌리면 타이머가 지연될 수 있어 왕복 시간보다는 넉넉히 잡는다.
TICKET_TTL_SECONDS = 30

# 티켓 → 만료 시각(단조 시계). 프로세스 안에만 산다.
#
# 재시작하면 사라지지만 문제되지 않는다 — 티켓은 30초짜리라 어차피 다시 받는다.
# 백엔드를 여러 대로 늘리면 공유 저장소(Redis 등)가 필요해지는데, 그건 7b 에서
# 실제로 여러 대가 될 때 판단할 일이다.
_tickets: dict[str, float] = {}


async def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """X-API-Key 헤더를 검증한다.

    헤더를 필수(`Header(...)`)로 선언하면 누락 시 FastAPI가 422를 돌려준다.
    인증 실패는 "요청 형식이 잘못됨"이 아니라 "권한 없음"이므로, 헤더를
    선택으로 받고 여기서 401로 명확히 응답한다.
    """
    if x_api_key is None or x_api_key != get_settings().api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _prune_tickets(now: float) -> None:
    """만료된 티켓을 버린다.

    별도 루프를 돌리지 않고 발급·소모 시점에 함께 정리한다. 티켓은 30초를
    넘기지 못하고 발급은 접속할 때만 일어나므로, 방치되는 양이 크지 않다.
    """
    expired = [t for t, exp in _tickets.items() if exp <= now]
    for t in expired:
        del _tickets[t]


def issue_ws_ticket() -> str:
    """WebSocket 접속용 1회용 티켓을 발급한다."""
    now = time.monotonic()
    _prune_tickets(now)
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = now + TICKET_TTL_SECONDS
    return ticket


def consume_ws_ticket(ticket: str | None) -> bool:
    """티켓을 검증하고 소모한다. 같은 티켓은 두 번 쓸 수 없다."""
    if not ticket:
        return False
    now = time.monotonic()
    _prune_tickets(now)
    # pop 이라 성공하든 만료됐든 한 번 조회된 티켓은 남지 않는다
    return _tickets.pop(ticket, None) is not None


def origin_allowed(origin: str | None) -> bool:
    """WebSocket 핸드셰이크의 Origin 을 검증한다.

    CORS 는 WebSocket 에 적용되지 않는다. 악성 페이지가 방문자의 브라우저로
    우리 서버에 붙는 것을 막으려면 여기서 직접 봐야 한다.

    Origin 이 없으면 브라우저가 아닌 클라이언트(테스트, 서버 간 연동)다.
    그쪽은 Origin 을 위조할 수 있어 검사에 의미가 없고, 어차피 티켓이 필요하다.
    """
    if origin is None:
        return True
    return origin in get_settings().allowed_origins
