"""LLM provider 추상화 (명세 11.1절).

초기엔 Anthropic + OpenAI 두 제공자만 지원한다.

⚠️ 명세 11.1절의 get_llm_client()는 provider별 클라이언트 객체를 그대로
   반환하는데, 두 클라이언트는 호출 시그니처가 다르다.

     client.messages.create(model=..., max_tokens=..., messages=[...])  # Anthropic
     client.chat.completions.create(model=..., messages=[...])          # OpenAI

   그러면 LangGraph 노드가 결국 provider를 알아야 해서 "노드는 provider를
   몰라도 되게 분리한다"는 명세의 목표가 성립하지 않는다. 그래서 클라이언트
   대신 통일된 complete() 메서드를 가진 얇은 래퍼를 반환한다.
   docs/SPEC-NOTES.md 8번 항목 참고.
"""

from enum import StrEnum
from typing import Protocol


class LLMProvider(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


class LLMClient(Protocol):
    """LangGraph 노드가 의존하는 유일한 인터페이스.

    새 provider를 추가할 때 고칠 파일은 이 파일 하나뿐이어야 한다.
    """

    async def complete(self, messages: list[dict], *, model: str, max_tokens: int = 1024) -> str:
        """대화 메시지를 받아 응답 텍스트만 돌려준다."""
        ...


# TODO(Phase 6): 아래 두 래퍼 구현
#
#   class AnthropicClient:
#       def __init__(self, api_key: str):
#           import anthropic
#           self._client = anthropic.AsyncAnthropic(api_key=api_key)
#
#       async def complete(self, messages, *, model, max_tokens=1024) -> str:
#           resp = await self._client.messages.create(
#               model=model, max_tokens=max_tokens, messages=messages)
#           return resp.content[0].text
#
#   class OpenAIClient:
#       ... resp.choices[0].message.content 를 반환
#
# 모델 ID는 하드코딩하지 말고 역할(role) 정의나 설정에서 주입받을 것.


def get_llm_client(provider: LLMProvider, api_key: str) -> LLMClient:
    raise NotImplementedError(f"LLM 연동은 Phase 6에서 구현합니다 (요청된 provider: {provider})")
