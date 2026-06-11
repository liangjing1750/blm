"""LLM 提供者 — OpenAI 原生格式，零格式转换。

内部消息和工具定义均为 OpenAI 格式，直接传给 API。
provider_kind 仅影响 base_url 和 api_key 来源。
"""

import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any

from openai import OpenAI


class LLMProvider(ABC):
    model_id: str = ""

    @abstractmethod
    async def create_message(self, messages, tools=None, system="", max_tokens=8000
                             ) -> tuple[str, list[dict], dict | None]: ...


class OpenAIProvider(LLMProvider):
    """OpenAI 原生提供者 — 无格式转换。"""

    def __init__(self, base_url: str, api_key: str, model_id: str):
        self.model_id = model_id
        self._client = OpenAI(base_url=base_url, api_key=api_key)

    async def create_message(self, messages, tools=None, system="", max_tokens=8000):
        api_messages = []
        if system:
            api_messages.append({"role": "system", "content": system})
        api_messages.extend(messages)

        kwargs: dict[str, Any] = {"model": self.model_id, "messages": api_messages, "max_completion_tokens": max_tokens}
        if tools: kwargs["tools"] = tools

        for attempt in range(3):
            try:
                resp = await asyncio.to_thread(self._client.chat.completions.create, **kwargs)
                return self._parse(resp)
            except Exception as exc:
                if attempt == 2: raise RuntimeError(f"LLM call failed: {exc}") from exc
                await asyncio.sleep(2 ** attempt)

    @staticmethod
    def _parse(response) -> tuple[str, list[dict], dict | None]:
        choice = response.choices[0]; msg = choice.message
        text = msg.content or ""
        tool_blocks = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try: args = json.loads(tc.function.arguments)
                except: args = {}
                tool_blocks.append({"id": tc.id, "name": tc.function.name, "input": args})
        usage = getattr(response, "usage", None)
        usage_info = {"input_tokens": usage.prompt_tokens, "output_tokens": usage.completion_tokens} if usage else None
        return text, tool_blocks, usage_info


# 工厂: kind 仅影响配置来源，所有提供者都用 OpenAIProvider
def create_provider(kind: str, base_url: str, api_key: str, model_id: str) -> LLMProvider:
    return OpenAIProvider(base_url, api_key, model_id)
