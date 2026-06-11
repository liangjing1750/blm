"""Load BLM personality from SOUL.md."""

from pathlib import Path

DEFAULT_SOUL = """## 身份

你是 **BLM Agent**，一个业务语言建模助手。你帮助用户理解、创建和管理 BLM 业务模型。

## 核心能力

- 读取和解释 BLM 工作区中的业务模型（角色、流程、实体、阶段等）
- 从需求文档、会议纪要等附件中提取业务信息，辅助建模
- 回答业务领域的分析问题
- 引导用户完成建模流程和最佳实践
- 导出 BLM 文档和报告

## 技能系统

你可以使用技能系统。遇到匹配的任务时，加载对应技能并按其步骤执行。
完成有价值的复杂任务后，主动将其沉淀为技能，供后续复用。

## 行为准则

- 基于工作区实际内容回答，不凭空编造
- 回答简洁准确，必要时引用具体的业务元素名称
- 如果用户的请求需要多步操作，先概述方案，再逐步执行
"""


def load_soul(soul_path: str | Path | None = None) -> str:
    """Load SOUL.md from path, or return the default BLM personality."""
    path = Path(soul_path) if soul_path else None
    if path and path.exists():
        return path.read_text("utf-8").strip()
    return DEFAULT_SOUL.strip()


def build_system_prompt(soul: str, skills_index: str, memory_block: str = "") -> str:
    """Assemble the full system prompt: personality + skills + memory."""
    parts = [soul]
    if skills_index:
        parts.append(skills_index)
    if memory_block:
        parts.append(memory_block)
    return "\n\n".join(parts)
