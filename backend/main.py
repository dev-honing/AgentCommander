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
from config import get_settings
from hub import hub
from models import AgentSnapshotMessage, AgentSpeakMessage, AgentSpeakPayload
from routers import agents, roles, runs
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
        tasks.append(asyncio.create_task(orchestrator.mock_state_loop()))
        tasks.append(asyncio.create_task(orchestrator.purge_loop()))

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

    ⚠️ 이 엔드포인트에는 아직 인증이 없다. REST는 9.3절에 따라 지금부터
       API Key로 잠그지만 WebSocket 인증은 Phase 7b 계획이라, 그 사이에는
       "설정 변경은 막혀 있는데 실시간 상태는 누구나 보는" 비대칭이 생긴다.
       로컬 전용 단계에서는 무해하나 Phase 7a(Tunnel로 임시 공개) 시점에는
       실제 노출 경로가 되므로 그전에 AUTH_TOKEN 검증을 앞당길 것 — 9장 주의사항.
    """
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
