"""WebSocket 연결 관리 및 브로드캐스트 (명세 4장).

전체 상태 재전송이 아니라 변경분(delta) 브로드캐스트를 기본으로 한다.
에이전트 수가 늘어도 트래픽이 선형으로 커지지 않게 하기 위함이다.

⚠️ 브로드캐스트는 연결마다 순차 전송이므로 접속자가 많아지면 지연이 생긴다.
   개인/팀용(접속자 소수)이라는 전제에서는 문제없으나, 외부 공개 시
   재검토가 필요하다 — 10.1절.
"""

from fastapi import WebSocket


class ConnectionHub:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        """끊긴 연결은 조용히 정리하고 나머지에 전송한다."""
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 — 개별 연결 실패가 전체를 막아선 안 된다
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def count(self) -> int:
        return len(self._connections)


hub = ConnectionHub()
