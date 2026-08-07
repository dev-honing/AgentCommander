"""FastAPI 앱 진입점 (명세 6.2절).

⚠️ 명세 6.2절은 @app.on_event("startup")을 쓰지만 현재 FastAPI에서
   deprecated다. lifespan 컨텍스트를 쓰면 풀 생성/해제와 백그라운드 태스크의
   시작/취소를 대칭적으로 관리할 수 있다 — docs/SPEC-NOTES.md 7번 항목.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import db
import orchestrator
from auth import consume_ws_ticket, origin_allowed
from config import get_settings
from hub import hub
from models import AgentSnapshotMessage, AgentSpeakMessage, AgentSpeakPayload
from routers import agents, roles, runs, ws_auth
from storage import ensure_upload_dir

settings = get_settings()

# 대화풍선 텍스트 길이 상한 (명세 5.2절).
# 최근 LLM 응답을 별도 요약 호출 없이 앞부분만 잘라 쓴다 — 추가 비용과
# 지연이 없다는 것이 이 선택의 이유다.
SPEECH_MAX_CHARS = 100


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- 시작 ---
    ensure_upload_dir()
    await db.init_pool()
    await orchestrator.load_agents()

    tasks: list[asyncio.Task] = []
    if settings.background_tasks_enabled:
        tasks.append(asyncio.create_task(orchestrator.purge_loop()))
        # 목업은 데모 모드에서만 돈다. 실제 작업과 섞이면 화면이 거짓말을 한다.
        if settings.demo_mode:
            tasks.append(asyncio.create_task(orchestrator.mock_state_loop()))

    yield

    # --- 종료 ---
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await db.close_pool()


app = FastAPI(title="AgentCommander", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.ws_allowed_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드된 glTF 모델을 정적 서빙한다.
#
# 명세에는 이 설정이 없다. 9.2절은 파일을 backend/uploads에 저장하고 DB에는
# '/models/{role_id}.glb'를 기록하는데, 6.4절 프론트는 그 경로를 그대로
# useGLTF에 넘긴다 — 그러면 Next.js(:3000) 기준으로 해석되어 404가 난다.
# 백엔드가 /models를 서빙하고 프론트가 API 오리진을 붙이도록 잇는다.
# docs/SPEC-NOTES.md 5번 항목 참고.
app.mount("/models", StaticFiles(directory=settings.upload_dir), name="models")

app.include_router(agents.router)
app.include_router(roles.router)
app.include_router(runs.router)
app.include_router(ws_auth.router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "connections": hub.count,
        "agents": len(orchestrator.AGENTS),
        "logs": await db.count_agent_logs(),
    }


def _speech_for(agent_id: str) -> AgentSpeakMessage | None:
    """클릭된 에이전트가 말할 내용을 만든다 (명세 5.2절)."""
    agent = orchestrator.AGENTS.get(agent_id)
    if agent is None:
        return None
    text = agent.message or "대기 중입니다"
    return AgentSpeakMessage(
        payload=AgentSpeakPayload(agent_id=agent_id, text=text[:SPEECH_MAX_CHARS])
    )


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    """실시간 상태 스트림 (명세 4장).

    접속 시 1회 전체 스냅샷을 보내고, 이후에는 orchestrator가 변경분만
    브로드캐스트한다.

    접속하려면 POST /api/ws-ticket 으로 받은 1회용 티켓이 필요하다.
    브라우저 WebSocket API 가 헤더를 붙이지 못해 REST 와 방식이 갈린 것이며,
    보호 수준은 같다 — 근거는 auth.py 참고.

    거절은 accept 전에 한다. 받아들인 뒤 끊으면 클라이언트 입장에서
    "붙었다가 끊긴 것"으로 보여 인증 실패와 네트워크 장애가 구분되지 않는다.
    accept 전에 닫으면 핸드셰이크 자체가 실패하므로 원인이 분명해진다.
    """
    if not origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    if not consume_ws_ticket(websocket.query_params.get("ticket")):
        await websocket.close(code=1008, reason="Invalid or expired ticket")
        return

    await hub.connect(websocket)
    try:
        snapshot = AgentSnapshotMessage(payload=list(orchestrator.AGENTS.values()))
        await websocket.send_json(snapshot.model_dump(mode="json"))

        while True:
            data = await websocket.receive_json()
            # 생성/종료는 REST가 정본이므로 여기서 처리하지 않는다
            # (docs/SPEC-NOTES.md 6번 항목)
            if data.get("type") == "agent_click":
                speech = _speech_for(data.get("payload", {}).get("agent_id", ""))
                if speech is not None:
                    await websocket.send_json(speech.model_dump(mode="json"))
    except WebSocketDisconnect:
        hub.disconnect(websocket)
