# 명세 해석 노트

원본 설계 명세서([`subagent-viz-design-spec.docx`](./subagent-viz-design-spec.docx))를 구현으로 옮기는 과정에서 발견한 **내부 불일치**와, 각 항목에 대해 채택한 해석을 기록한다. 명세를 고치는 대신 이 문서에 남기는 이유는, 원본이 인터뷰 결과를 담은 의사결정 기록이라 그 자체로 보존 가치가 있기 때문이다.

각 항목은 `§`로 원본 절 번호를 참조한다.

---

## 1. SQLite vs PostgreSQL — §2.1 다이어그램

**불일치**: §2.1 아키텍처 다이어그램에 `Persistence (SQLite)`라고 적혀 있으나, §1.2 기술 스택과 §3.2 영속성 설계는 PostgreSQL을 명시적으로 확정하고 그 근거("백엔드가 상시 실행되는 서버 프로세스인 이상 SQLite의 이점이 성립하지 않는다")까지 서술한다.

**채택**: **PostgreSQL**. 다이어그램 쪽이 초기 버전의 잔재로 판단된다. 근거가 서술된 쪽이 최신 결정이다.

---

## 2. Alembic vs `CREATE TABLE IF NOT EXISTS` — §6.2 ↔ §11.3

**불일치**: §11.3은 "`CREATE TABLE IF NOT EXISTS` 방식 대신 처음부터 Alembic으로 관리한다"고 확정하지만, §6.2의 `db.py` 샘플 코드는 `init_db()` 안에서 `CREATE TABLE IF NOT EXISTS`를 직접 실행한다. 나아가 Alembic의 `--autogenerate`는 SQLAlchemy 모델을 필요로 하는데, §6.2의 쿼리는 전부 raw asyncpg다.

**채택**: 다음 세 갈래로 분리한다.

| 파일 | 역할 |
|---|---|
| `backend/models_db.py` | SQLAlchemy 모델 — **스키마 정의 전용**. Alembic autogenerate의 대상. |
| `backend/models.py` | pydantic 모델 — API 스키마 및 WebSocket 페이로드. |
| `backend/db.py` | asyncpg — **런타임 쿼리 전용**. DDL을 실행하지 않는다. |

SQLAlchemy를 ORM으로 쓰지 않고 스키마 선언에만 쓰는 것이 어색해 보일 수 있으나, 이렇게 해야 §11.3의 Alembic 요구와 §3.2의 asyncpg 성능 요구를 동시에 만족한다. §11.3 주의사항이 지적한 "pydantic은 API용, SQLAlchemy는 DB용"이라는 구분을 그대로 구조화한 것이다.

---

## 3. 테이블 컬럼 누락 — §3.1 ↔ §3.2 ↔ §6.2

**불일치**: §3.1 `SubAgent` 모델에는 `retry_count`와 `position`이 있으나,

- §3.2 DDL: `pos_x/pos_y/pos_z`는 있고 `retry_count`는 **없음**
- §6.2 샘플 DDL: `pos_*`도 `retry_count`도 **둘 다 없음**

`retry_count`는 §5.1에서 "retry_count를 대화풍선에 노출"하라고, §11.2에서 "retry_count를 포함한 agent_update를 브로드캐스트"하라고 요구하므로 반드시 영속화되어야 한다.

**채택**: `agents` 테이블에 `retry_count INTEGER NOT NULL DEFAULT 0`과 `pos_x/pos_y/pos_z`를 모두 포함한다. `agent_logs`에도 `retry_count`를 남겨 재시도 이력을 복기할 수 있게 한다.

---

## 4. roles FK 생성 순서와 시드 데이터 — §6.2 ↔ §9.1

**불일치**: §9.1은 `agents.role → roles.role_id` 외래키를 건다. 그런데 §6.2의 목업은 `researcher` / `coder` 역할의 에이전트를 하드코딩된 딕셔너리로 들고 있다. `roles` 테이블에 해당 레코드가 없는 상태에서 `upsert_agent()`가 호출되면 FK 위반(23503)으로 죽는다.

**채택**: 초기 Alembic 마이그레이션에 기본 역할 시드를 포함한다. 최소 `researcher`, `coder`, `reviewer` 3종. §10.3이 "역할 수를 초기에는 3~5종으로 제한"할 것을 권고하는 것과도 맞는다.

---

## 5. glTF 모델 서빙 경로 단절 — §9.2 ↔ §6.4

**불일치**: 이것이 명세에서 가장 실질적인 구멍이다.

- §9.2 업로드 핸들러는 파일을 `backend/uploads/`에 저장하고, DB에는 `/models/{role_id}.glb`라는 경로를 기록한다.
- §6.4 프론트엔드는 `useGLTF('/models/${agent.role}.glb')`로 그 경로를 로드한다.

그런데 `/models/...`는 **Next.js 기준 상대 경로**로 해석되어 `localhost:3000/models/...`를 찌른다. 파일은 백엔드(`localhost:8000`)의 `uploads/` 디렉토리에 있으므로 404가 난다. 명세 어디에도 이 둘을 잇는 정적 서빙 설정이 없다.

**채택**:

1. 백엔드가 `app.mount("/models", StaticFiles(directory=UPLOAD_DIR))`로 업로드 디렉토리를 정적 서빙한다.
2. 프론트엔드는 `NEXT_PUBLIC_API_URL`의 오리진을 기준으로 **절대 URL**을 조립한다.
3. 모델 경로 조립은 `frontend/lib/models.ts` 한 곳에 모아, AWS 전환(§10.6) 후 S3 URL로 바뀌어도 그 파일만 고치면 되게 한다.

DB에 저장하는 값은 명세대로 `/models/{role_id}.glb` 형태의 **경로**로 유지하고, 오리진 결합은 클라이언트가 담당한다. 이렇게 해야 백엔드 주소가 바뀌어도 DB 값을 마이그레이션할 필요가 없다.

---

## 6. 에이전트 생성 경로 중복 — §4.2 ↔ §9.2

**불일치**: 에이전트 생성/삭제가 두 경로로 정의되어 있다.

- §4.2 WebSocket: `{"type": "create_agent"}`, `{"type": "terminate_agent"}`
- §9.2 REST: `POST /api/agents`, `DELETE /api/agents/{agent_id}`

**채택**: **REST를 정본**으로 한다. §9장 도입부가 "WebSocket은 실시간 상태 스트리밍 전용이고, 설정성 작업은 REST API로 분리한다"고 원칙을 세웠으므로 §4.2 쪽이 그 원칙 이전에 작성된 것으로 본다.

REST로 생성/삭제가 일어나면 그 **결과**를 WebSocket으로 브로드캐스트한다(`agent_update` 또는 신규 `agent_created` / `agent_removed`). 즉 WebSocket은 여전히 단방향 상태 스트림이고, 클라이언트→서버 방향은 `agent_click`만 남는다.

부수 효과로 §9.3의 API Key 인증이 생성/삭제 경로 전체를 자동으로 덮는다. WebSocket에 인증이 없는 Phase 7a 이전 구간에서, 인증 없는 채널로 에이전트를 만들 수 있는 구멍이 애초에 생기지 않는다.

---

## 7. `@app.on_event("startup")` — §6.2

**불일치라기보다 시의성 문제**: §6.2의 `@app.on_event("startup")`은 현재 FastAPI에서 deprecated다.

**채택**: `lifespan` 비동기 컨텍스트 매니저를 쓴다. DB 풀 생성/해제와 목업 루프 태스크의 시작/취소를 한곳에서 대칭적으로 관리할 수 있어 오히려 명세 의도에 더 잘 맞는다. §6.2 코드에는 풀 종료와 백그라운드 태스크 취소가 빠져 있는데, lifespan을 쓰면 자연히 채워진다.

---

## 8. LLM 어댑터의 추상화 수준 — §11.1

**불일치**: §11.1은 "LangGraph 노드 내부에서는 이 어댑터만 호출하고, 어떤 provider인지는 몰라도 되게 분리한다"고 목표를 밝히지만, `get_llm_client()`는 `anthropic.Anthropic` 또는 `openai.OpenAI` **클라이언트 객체를 그대로 반환**한다. 두 클라이언트는 호출 시그니처가 다르다.

```python
client.messages.create(model=..., max_tokens=..., messages=[...])   # Anthropic
client.chat.completions.create(model=..., messages=[...])            # OpenAI
```

따라서 노드는 결국 provider를 알아야 하고, 선언한 목표가 달성되지 않는다.

**채택**: 클라이언트를 반환하는 대신 `complete(messages, ...) -> str` 같은 **통일된 메서드를 가진 래퍼**를 반환한다. provider별 차이를 래퍼 안에 가둔다. 새 provider 추가 시 `adapter.py`만 고치면 된다는 §11.1의 의도는 이 형태에서 비로소 성립한다.

---

## 9. 절 번호 순서 — §10.5 / §10.6

§10.6(업로드 파일 저장소 전환)이 §10.5(최종 확정 사항)보다 **앞에** 배치되어 있다. 내용에는 영향이 없다. 이 문서에서는 원본 번호를 그대로 인용한다.

---

## 10. 프로젝트 루트 디렉토리명 — §6.1

§6.1의 프로젝트 구조 트리는 루트를 `subagent-viz/`로 적고 있으나, §10.5에서 프로젝트명이 `AgentCommander`로 확정되었다. 실제 작업 디렉토리도 `AgentCommand`다.

**채택**: 레포 루트를 그대로 쓰고 그 아래에 `backend/`와 `frontend/`를 둔다. `subagent-viz/`라는 중간 디렉토리는 만들지 않는다. 다만 DB 이름(`subagent_viz`)은 명세의 연결 문자열 예시를 그대로 따랐다 — 바꾸면 §8.1 표와 어긋나고 실익이 없다.

---

## 명세에 없어 추가한 것

구현상 불가피하거나, 명세가 정한 원칙을 지키려면 필요한 항목들이다.

| 추가 | 이유 |
|---|---|
| `backend/config.py` | §8.1이 "환경변수로만 갈아끼우면 되는 구조"를 요구한다. `os.environ[...]`이 여러 모듈에 흩어지면 그 원칙이 깨진다. 로딩 지점을 한곳으로 모은다. |
| `backend/storage.py` | §10.6이 "업로드/조회 로직을 storage.py 같은 별도 모듈로 감싸 로컬 디스크와 S3를 인터페이스로 분리"할 것을 **직접 권고**한다. |
| `backend/requirements-dev.txt` | §11.5 CI가 `ruff`와 `pytest`를 실행하지만 이들은 런타임 의존성이 아니다. 프로덕션 이미지에 테스트 도구가 들어가지 않도록 분리한다. |
| `frontend/lib/protocol.ts` | §2.2 주의사항이 "WebSocket 메시지 스키마를 먼저 고정하라"고 강조한다. 프론트 쪽 계약을 한 파일에 못박아 백엔드 `models.py`와 1:1 대응시킨다. |
| DB healthcheck + `depends_on: condition` | §8.2의 `depends_on: [db]`는 컨테이너 **기동**만 기다리고 PostgreSQL이 연결을 받을 준비가 됐는지는 보지 않는다. 백엔드가 첫 실행에서 연결 실패로 죽는 전형적인 경합이다. |

---

## 열려 있는 항목

명세에서 아직 결정되지 않았거나, 구현이 진행되면 결정해야 하는 것들.

- **`agent_logs` 보관 기간 정책** — §3.2와 §10.2가 "Phase 1에서 함께 설계할 것"이라고 남겨 두었다. 20개 에이전트 × 2초 간격이면 하루 약 86만 행이다. Phase 1 진입 시 반드시 정해야 한다.
- **`agent_id` 생성 방식** — §9.3의 `f"agent-{name.lower()}"`는 동일 이름 재생성 시 충돌한다. 명세도 이를 인지하고 "프로토타입 단계엔 허용하되 Phase 6 이후 UUID 전환 권장"으로 남겼다.
- **WebSocket 인증 시점** — §9장 주의사항이 지적한 대로, REST는 지금 잠그고 WebSocket은 Phase 7b에 잠그면 그 사이 "설정은 막혔는데 상태는 누구나 보는" 비대칭이 생긴다. Phase 7a(Tunnel 공개) **이전에** WebSocket 인증을 앞당기는 것이 맞다.
- **역할별 애니메이션 클립 이름** — §5.1은 `Working`, `LookAround`, `Retry`, `Alert`, `Cheer`를 예시로 들지만, Mixamo 기성 클립의 실제 이름과 다를 가능성이 높다. Phase 3에서 실제 에셋을 받아 본 뒤 매핑 테이블을 확정한다.
