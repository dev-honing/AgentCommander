# 마이그레이션

스키마는 전부 Alembic으로 관리한다. 코드에 `CREATE TABLE IF NOT EXISTS`를 쓰지 않는다.

## 적용

```bash
cd backend
alembic upgrade head
```

`DATABASE_URL` 환경변수를 읽는다. `alembic.ini`에는 연결 문자열을 하드코딩하지 않았다 — 로컬 → AWS(RDS) 전환 시 코드를 고치지 않고 환경변수만 바꾸기 위해서다.

## 새 마이그레이션 만들기

```bash
alembic revision --autogenerate -m "설명"
alembic upgrade head
```

⚠️ `--autogenerate`는 **SQLAlchemy 모델(`backend/models_db.py`)만** 본다. `backend/models.py`의 pydantic 모델을 고쳐도 Alembic은 아무것도 감지하지 못한다. 테이블을 바꿀 때는 SQLAlchemy 쪽을 먼저 수정할 것.

생성된 파일은 반드시 열어서 확인한다. autogenerate가 인덱스 순서나 서버 기본값을 놓치는 경우가 있다.

## 현재 리비전

| 리비전 | 내용 |
|---|---|
| `0001_initial` | `roles`, `agents`, `agent_logs` 생성 + 인덱스 2종 + **기본 역할 3종 시드** |

### 기본 역할 시드가 첫 마이그레이션에 포함된 이유

`agents.role`은 `roles.role_id`를 FK로 참조한다. 역할 레코드가 하나도 없으면 목업 오케스트레이터의 첫 에이전트 저장이 FK 위반(SQLSTATE 23503)으로 실패한다. 명세에는 이 시드가 빠져 있다 — [`docs/SPEC-NOTES.md`](../../docs/SPEC-NOTES.md) 4번 항목 참고.

시드 역할(`researcher`, `coder`, `reviewer`)은 `backend/orchestrator.py`의 `_SEED`와 **반드시 일치해야 한다**. 한쪽만 바꾸면 목업이 FK 위반으로 죽는다.

## agent_logs 보관 정책

`agent_logs`는 append-only라 방치하면 무한정 쌓인다 — 20개 에이전트가 2초마다 갱신되면 하루 약 86만 행이다.

**30일 보관 + 자동 삭제**로 확정했다. 백엔드가 기동 직후 1회, 이후 6시간마다 보관 기간이 지난 행을 지운다(`orchestrator.purge_loop`). 수치는 환경변수로 조절한다.

| 변수 | 기본값 |
|---|---|
| `LOG_RETENTION_DAYS` | 30 |
| `LOG_PURGE_INTERVAL_HOURS` | 6 |

정리 작업이 `created_at`만으로 스캔하므로 `idx_agent_logs_created_at` 인덱스를 함께 만들어 두었다.

## 배포 시 주의

⚠️ AWS 전환(Phase 7b) 시 RDS에 대해서도 `alembic upgrade head`를 **배포 파이프라인에 포함**시켜야 한다. 로컬에서만 마이그레이션을 돌리고 잊어버리기 쉬운 지점이다.
