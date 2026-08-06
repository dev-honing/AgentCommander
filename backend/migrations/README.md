# 마이그레이션

스키마는 전부 Alembic으로 관리한다(명세 11.3절). 코드에 `CREATE TABLE IF NOT EXISTS`를 쓰지 않는다.

## 최초 1회 초기화

이 디렉토리는 아직 비어 있다. 아래 절차로 Alembic을 초기화한다.

```bash
cd backend
pip install -r requirements-dev.txt
alembic init migrations
```

생성된 파일에 다음 세 가지를 반영한다.

**1. `alembic.ini`** — `sqlalchemy.url` 줄을 비운다. 값을 하드코딩하지 않고 환경변수에서 읽어야 로컬 → AWS 전환 시 코드 변경이 없다(명세 8.1절).

```ini
sqlalchemy.url =
```

**2. `migrations/env.py`** — `DATABASE_URL`을 읽고 SQLAlchemy 메타데이터를 연결한다.

```python
import os
from models_db import Base

config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
target_metadata = Base.metadata
```

`target_metadata`를 연결하지 않으면 `--autogenerate`가 아무 변경도 감지하지 못한다.

**3. 첫 마이그레이션 생성**

```bash
alembic revision --autogenerate -m "create roles, agents, agent_logs tables"
alembic upgrade head
```

## 기본 역할 시드

첫 마이그레이션에 기본 역할 3종(`researcher`, `coder`, `reviewer`)을 INSERT하는 단계를 반드시 포함한다.

`agents.role`은 `roles.role_id`를 FK로 참조하므로, 역할 레코드가 없으면 목업 오케스트레이터의 첫 에이전트 저장이 FK 위반(23503)으로 실패한다. 명세에는 이 시드가 빠져 있다 — `docs/SPEC-NOTES.md` 4번 항목 참고.

역할 수를 초기에 3~5종으로 제한하는 것은 명세 10.3절의 권고이기도 하다. 역할이 늘어날 때마다 캐릭터 모델을 새로 준비해야 하기 때문이다.

## 주의

⚠️ AWS 전환(Phase 7b) 시 RDS에 대해서도 `alembic upgrade head`를 **배포 파이프라인에 포함**시켜야 한다. 로컬에서만 마이그레이션을 돌리고 잊어버리기 쉬운 지점이다(명세 11.3절 주의사항).
