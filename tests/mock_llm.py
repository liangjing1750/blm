"""Mock LLM Client — 预设响应用于可重复测试。

支持:
  - 预设响应序列（按顺序返回）
  - 调用历史记录（验证 LLM 调用参数）
  - 自动 fallback（响应用完后返回 done）

用法:
    mock = MockLLMClient([
        ("分析中", [{"id":"t1","name":"read_workspace","input":{"name":"test"}}],
         {"input_tokens":100,"output_tokens":50}),
        ("分析完成", [], {"input_tokens":80,"output_tokens":30}),
    ])
    text, blocks, usage = await mock.create_message(messages=[...])
"""

from typing import Any


class MockLLMClient:
    """预设响应的 Mock LLM — 用于测试 Agent 循环。

    响应格式: (text, tool_blocks, usage_info)
    - text: LLM 文本输出
    - tool_blocks: [{"id":..., "name":..., "input":...}]
    - usage_info: {"input_tokens": N, "output_tokens": M} 或 {}
    """

    def __init__(self, responses: list[tuple[str, list[dict], dict]] | None = None):
        self.responses = responses or []
        self.call_count = 0
        self.call_history: list[dict] = []

    async def create_message(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        system: str = "",
        max_tokens: int = 8000,
    ) -> tuple[str, list[dict], dict]:
        """返回预设响应 — 记录每次调用参数。"""
        self.call_history.append({
            "message_count": len(messages),
            "tool_count": len(tools) if tools else 0,
            "system_length": len(system),
        })
        if self.call_count < len(self.responses):
            r = self.responses[self.call_count]
            self.call_count += 1
            return r
        # fallback: 空响应
        return "done", [], {"input_tokens": 0, "output_tokens": 0}


def make_text_response(text: str) -> tuple[str, list[dict], dict]:
    """快捷工厂: 纯文本响应，无工具调用。"""
    return (text, [], {"input_tokens": 10, "output_tokens": len(text) // 4})


def make_tool_response(
    tool_name: str,
    tool_input: dict,
    tool_id: str = "mock-1",
    text: str = "",
) -> tuple[str, list[dict], dict]:
    """快捷工厂: 包含一个工具调用的响应。"""
    return (
        text,
        [{"id": tool_id, "name": tool_name, "input": tool_input}],
        {"input_tokens": 20, "output_tokens": 30},
    )


def make_multi_tool_response(
    tools: list[tuple[str, dict, str]],
    text: str = "",
) -> tuple[str, list[dict], dict]:
    """快捷工厂: 包含多个工具调用的响应。"""
    return (
        text,
        [{"id": tid, "name": name, "input": inp} for name, inp, tid in tools],
        {"input_tokens": 30, "output_tokens": 40},
    )
