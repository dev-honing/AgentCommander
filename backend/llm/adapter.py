"""LLM provider 추상화 (명세 11.1절).

⚠️ 명세 11.1절의 get_llm_client()는 provider별 클라이언트 객체를 그대로
   반환하는데, 두 클라이언트는 호출 시그니처가 다르다.

     client.messages.create(model=..., max_tokens=..., messages=[...])  # Anthropic
     client.chat.completions.create(model=..., messages=[...])          # OpenAI

   그러면 노드가 결국 provider를 알아야 해서 "노드는 provider를 몰라도 되게
   분리한다"는 목표가 성립하지 않는다. 그래서 클라이언트 대신 통일된
   complete() 메서드를 가진 얇은 래퍼를 반환한다.
   docs/SPEC-NOTES.md 8번 항목 참고.

FAKE provider는 개발·데모용이다. 실제 호출 없이 지연과 실패를 흉내 내므로
비용 없이 retrying/error 연출까지 검증할 수 있고, API 키 없이도 데모가 돈다.
"""

import asyncio
import random
from enum import StrEnum
from typing import Protocol

from config import get_settings


class LLMProvider(StrEnum):
    FAKE = "fake"
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


class LLMError(RuntimeError):
    """LLM 호출 실패. 재시도 대상이 되는 오류다."""


class LLMClient(Protocol):
    """LangGraph 노드가 의존하는 유일한 인터페이스.

    새 provider를 추가할 때 고칠 파일은 이 파일 하나뿐이어야 한다.
    """

    async def complete(self, messages: list[dict], *, max_tokens: int = 1024) -> str:
        """대화 메시지를 받아 응답 텍스트만 돌려준다."""
        ...


# --- 가짜 구현 ---------------------------------------------------------

# 역할별로 그럴듯한 응답을 돌려준다. 화면의 대화풍선에 그대로 노출되므로
# 사람이 읽었을 때 "무슨 일을 하는지" 알아볼 수 있는 문장이어야 한다.
_FAKE_RESPONSES: dict[str, list[str]] = {
    "researcher": [
        "관련 자료 3건을 찾았습니다. 출처는 공식 문서 2건, 블로그 1건입니다.",
        "검색 결과가 부족해 질의어를 바꿔 다시 조사했습니다.",
        "경쟁 제품 5종을 추렸고 각각의 차별점을 정리했습니다.",
    ],
    "reviewer": [
        "조사 결과 중 1건은 출처가 불분명해 제외했습니다.",
        "두 자료의 수치가 어긋나 원문을 다시 확인했습니다.",
        "교차 검증 완료. 신뢰할 만한 항목은 4건입니다.",
    ],
    "coder": [
        "요약 초안을 작성했습니다. 문단 3개, 인용 4건입니다.",
        "구조를 바꿔 결론을 앞으로 옮겼습니다.",
        "최종본을 정리했습니다.",
    ],
}


class FakeLLMClient:
    """실제 호출 없이 응답을 흉내 내는 클라이언트.

    지연과 실패를 섞는 이유: 이 도구가 풀려는 문제가 "조용히 재시도만
    반복하는 에이전트를 놓치지 않는다"인데, 실패가 없으면 retrying/error
    존이 영영 비어 있어 정작 핵심 기능을 검증할 수 없다.
    """

    def __init__(self, role: str = "researcher") -> None:
        settings = get_settings()
        self.role = role
        self.failure_rate = settings.fake_llm_failure_rate
        self.min_delay = settings.fake_llm_min_delay
        self.max_delay = settings.fake_llm_max_delay

    async def complete(self, messages: list[dict], *, max_tokens: int = 1024) -> str:
        await asyncio.sleep(random.uniform(self.min_delay, self.max_delay))

        if random.random() < self.failure_rate:
            raise LLMError("호출 실패 (가짜 LLM 이 의도적으로 낸 오류)")

        pool = _FAKE_RESPONSES.get(self.role) or _FAKE_RESPONSES["researcher"]
        return random.choice(pool)


# --- 실제 구현 (Phase 6 후반) ------------------------------------------
#
#   class AnthropicClient:
#       def __init__(self, api_key: str, model: str):
#           import anthropic
#           self._client = anthropic.AsyncAnthropic(api_key=api_key)
#           self._model = model
#
#       async def complete(self, messages, *, max_tokens=1024) -> str:
#           resp = await self._client.messages.create(
#               model=self._model, max_tokens=max_tokens, messages=messages)
#           return resp.content[0].text
#
#   class OpenAIClient:
#       ... resp.choices[0].message.content 를 반환
#
# 모델 ID는 하드코딩하지 말고 설정이나 역할 정의에서 주입받을 것.


def get_llm_client(role: str = "researcher") -> LLMClient:
    """설정에 따라 클라이언트를 만든다. 노드는 provider를 알 필요가 없다."""
    provider = LLMProvider(get_settings().llm_provider)

    if provider is LLMProvider.FAKE:
        return FakeLLMClient(role=role)

    raise NotImplementedError(
        f"'{provider}' 연동은 아직 구현되지 않았습니다. "
        "LLM_PROVIDER=fake 로 두거나 llm/adapter.py 에 구현을 추가하세요."
    )
