"""REST API 인증 (명세 9.3절).

로컬 단계부터 API Key 헤더 인증을 적용한다. WebSocket 인증은 Phase 7b 계획이라
그 사이 비대칭이 생긴다는 점은 main.py의 ws_endpoint 주석 참고.
"""

from fastapi import Header, HTTPException

from config import get_settings


async def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """X-API-Key 헤더를 검증한다.

    헤더를 필수(`Header(...)`)로 선언하면 누락 시 FastAPI가 422를 돌려준다.
    인증 실패는 "요청 형식이 잘못됨"이 아니라 "권한 없음"이므로, 헤더를
    선택으로 받고 여기서 401로 명확히 응답한다.
    """
    if x_api_key is None or x_api_key != get_settings().api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# TODO(Phase 7a 이전): WebSocket 핸드셰이크용 토큰 검증 추가
#   async def verify_ws_token(token: str | None) -> None: ...
#   AUTH_TOKEN이 빈 값이면 검증을 건너뛰어 로컬 개발을 방해하지 않게 한다.
