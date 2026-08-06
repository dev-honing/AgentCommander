# 기여 가이드

AgentCommander에 기여해 주셔서 감사합니다. 이 문서는 로컬 개발 환경 세팅부터 PR을 올리기까지의 절차를 정리한 것입니다.

## 1. 사전 요구사항

| 도구 | 버전 | 비고 |
|---|---|---|
| Python | 3.12 | CI가 3.12로 고정되어 있음 |
| Node.js | 20 LTS | CI가 20으로 고정되어 있음 |
| Docker | 최신 | PostgreSQL 구동용 |

> 버전을 고정하는 이유: CI와 로컬의 런타임 차이로 인한 "내 PC에서는 되는데" 문제를 차단하기 위함입니다. 다른 버전을 쓰고 싶다면 `.github/workflows/ci.yml`도 함께 바꿔 주세요.

## 2. 로컬 개발 환경 세팅

### 2.1 저장소 클론 및 환경변수 준비

```bash
git clone https://github.com/OWNER/AgentCommander.git
cd AgentCommander
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

`backend/.env`의 `API_KEY`는 로컬 개발용 임의 문자열로 바꿔 주세요. LLM 연동(Phase 6)을 건드리지 않는다면 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`는 비워 둬도 됩니다.

### 2.2 데이터베이스 + 백엔드 (Docker Compose)

```bash
docker compose up -d
```

PostgreSQL 16과 백엔드가 함께 뜹니다. DB만 띄우고 백엔드는 로컬에서 직접 실행하고 싶다면:

```bash
docker compose up -d db
```

### 2.3 백엔드를 로컬에서 직접 실행하는 경우

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate    # Windows
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
```

> macOS/Linux는 `source .venv/bin/activate`.
>
> 로컬 실행 시 `.env`의 `DATABASE_URL` 호스트를 `db`가 아니라 `localhost`로 두어야 합니다.

### 2.4 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

## 3. 데이터베이스 마이그레이션

스키마 변경은 **반드시** Alembic 마이그레이션으로 관리합니다. `CREATE TABLE IF NOT EXISTS`를 코드에 직접 쓰지 마세요.

```bash
cd backend
alembic revision --autogenerate -m "설명"
alembic upgrade head
```

⚠️ **주의**: Alembic의 `--autogenerate`는 SQLAlchemy 모델(`backend/models_db.py`)을 기준으로 동작합니다. `backend/models.py`의 pydantic 모델은 API 요청/응답 스키마용이라 Alembic이 인식하지 못합니다. 테이블을 추가·변경할 때는 **SQLAlchemy 모델 쪽을 먼저** 수정하세요. 두 파일의 역할은 다음과 같이 나뉩니다.

| 파일 | 역할 |
|---|---|
| `backend/models.py` | pydantic — API 스키마, WebSocket 메시지 페이로드 |
| `backend/models_db.py` | SQLAlchemy — DB 스키마 정의 (Alembic autogenerate 대상) |

## 4. 코드 스타일

머지 조건입니다. PR 전에 로컬에서 통과시켜 주세요.

```bash
ruff check backend/
ruff format --check backend/
```

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
```

`npm run build`에는 TypeScript 타입 체크가 포함됩니다. 빌드가 깨진 채로 PR을 올리지 말아 주세요.

## 5. 테스트

```bash
pytest backend/tests/
```

테스트 우선순위는 다음 세 가지입니다. 로직을 건드렸다면 해당 영역의 테스트를 함께 추가해 주세요.

1. **상태 전이 로직** — `AgentState` 변화가 명세대로 일어나는가
2. **REST API의 role 존재 검증** — 없는 역할로 에이전트를 만들면 404인가
3. **재시도 소진 후 error 전이** — `max_attempts` 소진 시 `retrying` → `error`로 가는가

## 6. 브랜치 전략

- `main`은 보호 브랜치입니다. 직접 푸시할 수 없습니다.
- 모든 변경은 PR을 거칩니다. CI 통과가 머지 조건입니다.
- 브랜치 이름: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `chore/…`

## 7. 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/)를 따릅니다.

```
feat(scene): 상태별 존 이동 lerp 보간 추가
fix(api): 사용 중인 역할 삭제 시 409로 응답하도록 수정
docs(readme): 빠른 시작 절차 보완
```

## 8. PR을 올리기 전에

- [ ] `ruff check backend/` 통과
- [ ] `pytest backend/tests/` 통과
- [ ] `npm run lint --prefix frontend` 통과
- [ ] `npm run build --prefix frontend` 통과
- [ ] 스키마를 바꿨다면 Alembic 마이그레이션 파일 포함
- [ ] WebSocket 메시지 스키마를 바꿨다면 `backend/models.py`와 `frontend/lib/protocol.ts` **양쪽** 수정
- [ ] 환경변수를 추가했다면 `.env.example`에도 반영

> 마지막 두 항목이 특히 자주 누락됩니다. 프로토콜은 백엔드와 프론트엔드에 각각 정의되어 있어 한쪽만 고치면 런타임에 조용히 어긋납니다.

## 9. 처음 기여한다면

`good first issue` 라벨이 붙은 이슈부터 보시길 권합니다. 3D나 백엔드 지식 없이도 손댈 수 있는 항목 위주로 골라 두었습니다.

- 캐릭터 애니메이션 클립 추가
- 새 역할(role) 프리셋 추가
- 상태 패널 UI 개선
- 문서 오탈자 및 설명 보완
