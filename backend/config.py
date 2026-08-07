"""환경변수 로딩 지점.

명세 8.1절은 "로컬 PC → AWS 전환 시 환경변수만 갈아끼우면 되는 구조"를 요구한다.
os.environ 접근이 여러 모듈에 흩어지면 그 원칙이 조용히 깨지므로,
읽는 지점을 이 파일 하나로 모은다.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # DB (8.1절)
    database_url: str = "postgresql://user:pass@localhost:5432/subagent_viz"

    # agent_logs 보관 기간 (일).
    #
    # 이 테이블은 append-only라 방치하면 무한정 쌓인다 — 20개 에이전트가
    # 2초마다 갱신되면 하루 약 86만 행이다. 명세가 "Phase 1에서 함께 설계할 것"
    # 으로 남겨 둔 항목이며, 30일 보관 + 주기적 자동 삭제로 확정했다.
    log_retention_days: int = 30
    # 정리 작업 실행 주기 (시간). 기동 직후 1회 돌고 이후 이 간격으로 반복한다.
    log_purge_interval_hours: int = 6

    # 인증 (9.3절)
    api_key: str = "change-me-local-dev-key"
    ws_allowed_origin: str = "http://localhost:3000"
    # WebSocket 인증 토큰 — Phase 7b부터 필수. 빈 값이면 검증을 건너뛴다.
    auth_token: str = ""

    # 저장소 (9.2 / 10.6절)
    upload_dir: str = "uploads"
    max_model_size: int = 20 * 1024 * 1024  # 20MB
    allowed_model_ext: tuple[str, ...] = (".glb", ".gltf")

    # 백그라운드 루프(목업 상태 전이, 로그 정리) 실행 여부.
    #
    # 테스트에서는 꺼야 한다 — 목업 루프가 2초마다 DB를 바꾸면 방금 만든
    # 에이전트의 상태가 검증 직전에 뒤바뀌어 테스트가 불안정해진다.
    background_tasks_enabled: bool = True

    # 목업 에이전트 수 (Phase 0~5).
    # 명세 10.1절은 "Phase 3 진입 전에 큐브 스텁 상태로 20개 동시 렌더링
    # 성능을 먼저 측정할 것"을 권고한다. 이 값을 20으로 올리면 바로 잰다.
    mock_agent_count: int = 3

    # 재시도 정책 (11.2절) — 최대 3회, 1s → 2s → 4s
    max_retry_count: int = 3
    retry_initial_interval: float = 1.0
    retry_backoff_factor: float = 2.0

    # LLM (11.1절, Phase 6)
    #
    # 'fake' 는 실제 호출 없이 응답을 흉내 낸다. 비용이 들지 않고 API 키도
    # 필요 없어서, 파이프라인 구조를 먼저 완성하고 나중에 어댑터만 갈아끼울
    # 수 있다. 데모도 키 없이 돌아간다.
    llm_provider: str = "fake"
    llm_model: str = ""

    # 가짜 LLM 의 지연과 실패율.
    #
    # 실패를 섞는 이유: 이 도구가 풀려는 문제가 "조용히 재시도만 반복하는
    # 에이전트를 놓치지 않는다"인데, 실패가 없으면 retrying/error 존이 영영
    # 비어 있어 정작 핵심 기능을 검증할 수 없다.
    fake_llm_failure_rate: float = 0.25
    fake_llm_min_delay: float = 0.8
    fake_llm_max_delay: float = 3.0

    # 리서치 파이프라인 (Phase 6). 질문 하나당 조사 담당 수.
    # 여기에 검증·정리 담당 2명이 더해지므로 3이면 에이전트 5개가 뜬다.
    research_agent_count: int = 3

    anthropic_api_key: str = ""
    openai_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
