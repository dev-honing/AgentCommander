"""WebSocket 접속 티켓 발급 (명세 9.3절).

브라우저의 WebSocket API 는 핸드셰이크에 헤더를 붙일 수 없어서 REST 와 같은
X-API-Key 방식을 쓸 수 없다. 대신 API Key 로 잠긴 이 엔드포인트에서 짧게 사는
1회용 티켓을 받아 쿼리스트링에 실어 접속한다 — 자세한 근거는 auth.py 참고.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import TICKET_TTL_SECONDS, issue_ws_ticket, verify_api_key

router = APIRouter(prefix="/api/ws-ticket", dependencies=[Depends(verify_api_key)])


class WsTicket(BaseModel):
    ticket: str
    """티켓 유효 시간(초). 클라이언트가 재사용 여부를 판단하는 데 쓴다."""
    expires_in: int


@router.post("", status_code=201)
async def create_ws_ticket() -> WsTicket:
    """WebSocket 접속용 티켓을 발급한다.

    201 을 쓰는 이유: 매 호출이 새 티켓을 만든다. 같은 요청을 두 번 보내면
    티켓도 두 개가 되므로 멱등하지 않다.
    """
    return WsTicket(ticket=issue_ws_ticket(), expires_in=TICKET_TTL_SECONDS)
