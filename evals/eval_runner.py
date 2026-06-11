"""Eval Runner — 加载 JSON 用例，运行 Agent，验证断言。

用法:
    python -m evals.eval_runner                  # 运行所有 eval
    python -m evals.eval_runner eval-001.json     # 运行单个
"""

import asyncio
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from blm_ai.kernel.boot import assemble_agent
from blm_ai.kernel.loop import agent_loop, LoopConfig, LoopState
from blm_ai.kernel.permission import PermissionPipeline
from blm_ai.kernel.tool import ToolRegistry
from blm_ai.tools.blm_workspace import create_blm_tools
from blm_ai.tools.skill_manage import create_skill_manage_tool


@dataclass
class EvalResult:
    id: str = ""
    name: str = ""
    passed: bool = False
    assertions_passed: int = 0
    assertions_total: int = 0
    turns_executed: int = 0
    tools_called: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class MockEvalProvider:
    """根据 eval 用例中的 mock_llm 返回预设响应。"""

    def __init__(self, turns: list[dict]):
        self.turns = turns
        self._index = 0

    async def create_message(self, messages, tools=None, system="", max_tokens=8000):
        if self._index >= len(self.turns):
            return "done", [], {"input_tokens": 0, "output_tokens": 0}
        turn = self.turns[self._index]
        self._index += 1
        mock = turn.get("mock_llm", {})
        return (
            mock.get("text", ""),
            mock.get("tool_blocks", []),
            {"input_tokens": 10, "output_tokens": 20},
        )


def load_eval_cases(evals_dir: str | Path) -> list[dict]:
    """从目录加载所有 JSON eval 文件。"""
    cases = []
    for f in sorted(Path(evals_dir).glob("*.json")):
        if f.name.startswith("eval-"):
            cases.append(json.loads(f.read_text("utf-8")))
    return cases


def run_eval_case(eval_case: dict) -> EvalResult:
    """运行单个 eval 用例。"""
    result = EvalResult(id=eval_case["id"], name=eval_case["name"])

    # 准备工具和状态
    tools = ToolRegistry()
    ws_dir = Path(eval_case.get("setup", {}).get("workspace_dir", "."))
    skills_dir = Path(eval_case.get("setup", {}).get("skills_dir", ws_dir / ".blm" / "skills"))
    tools.register(create_skill_manage_tool(skills_dir))
    for t in create_blm_tools(ws_dir):
        tools.register(t)

    provider = MockEvalProvider(eval_case["turns"])
    permissions = PermissionPipeline(interactive=False)

    state = LoopState(
        system_prompt=eval_case.get("setup", {}).get("system_prompt", "You are a test agent."),
        tools=tools,
        provider=provider,
        permissions=permissions,
        config=LoopConfig(max_turns=10, interactive=False),
    )

    # 运行
    tools_called = []
    final_text = ""

    async def _run():
        nonlocal final_text
        for turn_data in eval_case["turns"]:
            user_msg = turn_data.get("user", "")
            if user_msg:
                state.messages.append({"role": "user", "content": user_msg})
            # 注入上轮工具结果
            user_result = turn_data.get("user_result")
            if user_result:
                state.messages.append({"role": "user", "content": user_result})
            async for event in agent_loop(state):
                if isinstance(event, dict):
                    continue  # skip tool_result dicts
                if event.kind == "llm_response":
                    final_text += event.text
                    for tb in event.tool_blocks:
                        tools_called.append(tb["name"])
                elif event.kind == "agent_complete":
                    break

    asyncio.run(_run())

    result.tools_called = tools_called
    result.turns_executed = state.turn

    # 断言
    assertions = eval_case.get("assertions", {})
    result.assertions_total = len(assertions.get("tools_called", [])) + 2  # +min_turns + output_contains

    # 验证工具调用
    expected_tools = set(assertions.get("tools_called", []))
    actual_tools = set(tools_called)
    if expected_tools.issubset(actual_tools):
        result.assertions_passed += len(expected_tools)
    else:
        missing = expected_tools - actual_tools
        result.errors.append(f"Missing tools: {missing}")

    # 验证轮次
    min_turns = assertions.get("min_turns", 0)
    if state.turn >= min_turns:
        result.assertions_passed += 1
    else:
        result.errors.append(f"Expected >= {min_turns} turns, got {state.turn}")

    # 验证输出内容
    for phrase in assertions.get("output_contains", []):
        if phrase in final_text:
            result.assertions_passed += 1
        else:
            result.errors.append(f"Output missing: '{phrase}'")

    result.passed = len(result.errors) == 0
    return result


def main():
    evals_dir = Path(__file__).parent
    if len(sys.argv) > 1:
        cases = [json.loads(Path(sys.argv[1]).read_text("utf-8"))]
    else:
        cases = load_eval_cases(evals_dir)

    passed = 0
    for case in cases:
        result = run_eval_case(case)
        status = "PASS" if result.passed else "FAIL"
        print(f"  {status}  {result.id}: {result.name}")
        if not result.passed:
            for err in result.errors:
                print(f"         {err}")
        else:
            passed += 1

    print(f"\n  {passed}/{len(cases)} passed")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
