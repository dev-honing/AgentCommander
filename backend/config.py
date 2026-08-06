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

    # 인증 (9.3절)
    api_key: str = "change-me-local-dev-key"
    ws_allowed_origin: str = "http://localhost:3000"
    # WebSocket 인증 토큰 — Phase 7b부터 필수. 빈 값이면 검증을 건너뛴다.
    auth_token: str = ""

    # 저장소 (9.2 / 10.6절)
    upload_dir: str = "uploads"
    max_model_size: int = 20 * 1024 * 1024  # 20MB
    allowed_model_ext: tuple[str, ...] = (".glb", ".gltf")

    # 목업 에이전트 수 (Phase 0~5).
    # 명세 10.1절은 "Phase 3 진입 전에 큐브 스텁 상태로 20개 동시 렌더링
    # 성능을 먼저 측정할 것"을 권고한다. 이 값을 20으로 올리면 바로 잰다.
    mock_agent_count: int = 3

    # 재시도 정책 (11.2절) — 최대 3회, 1s → 2s → 4s
    max_retry_count: int = 3
    retry_initial_interval: float = 1.0
    retry_backoff_factor: float = 2.0

    # LLM (11.1절, Phase 6)
    anthropic_api_key: str = ""
    openai_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
