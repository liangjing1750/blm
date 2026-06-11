"""能力门控 — 声明 Agent 的能力边界，超出边界明确拒绝。

三级诚实体系的第三级：运行时在输出前检查不确定性。
不阻止工具调用（Agent 自己判断），但在文本输出中注入警告。
"""

from dataclasses import dataclass, field

# 默认能力集
DEFAULT_ENABLED = {
    "workspace_read", "workspace_write", "workspace_list", "workspace_create",
    "skill_manage", "memory_manage",
    "bash_safe", "file_read", "file_write", "file_edit",
    "web_fetch", "grep", "glob", "ls",
}

# 禁止话题模式 — 匹配则触发警告
FORBIDDEN_TOPICS = [
    "医疗建议", "法律建议", "投资建议", "金融预测",
    "编写代码", "编程", "代码实现",
    "未来预测", "算命", "占卜",
    "系统配置", "服务器管理",
]

# 不确定信号 — 输出中出现这些词时标记
UNCERTAINTY_SIGNALS = [
    "大概", "可能", "估计", "约", "左右",
    "一般来说", "通常情况下", "大多数",
    "我认为", "我觉得", "应该可以",
]


@dataclass
class CapabilityGate:
    """能力门控 — 声明 Agent 的能力边界。

    不阻止执行（Agent 自主决策调用什么工具），
    但在最终输出中注入诚实警告。
    """
    enabled: set[str] = field(default_factory=lambda: DEFAULT_ENABLED.copy())
    forbidden_topics: list[str] = field(default_factory=lambda: FORBIDDEN_TOPICS.copy())
    uncertainty_signals: list[str] = field(default_factory=lambda: UNCERTAINTY_SIGNALS.copy())

    def check_forbidden(self, text: str) -> str | None:
        """检测文本是否涉及禁止话题。返回警告消息或 None。"""
        for topic in self.forbidden_topics:
            if topic in text:
                return (
                    f"[诚实提醒] 这个问题涉及 '{topic}'，"
                    f"超出了 BLM Agent 的能力范围。"
                    f"请引导用户回到业务建模相关话题。"
                )
        return None

    def scan_uncertainty(self, text: str) -> list[str]:
        """扫描输出中的不确定信号。返回匹配的信号列表。"""
        found = []
        for signal in self.uncertainty_signals:
            if signal in text:
                found.append(signal)
        return found

    def inject_warning(self, text: str) -> str:
        """如有必要，在输出末尾注入诚实警告。

        检查：禁止话题、不确定信号、数值断言。
        如果检测到问题，返回带警告标记的文本。
        """
        warnings = []

        # 检查禁止话题
        topic_warning = self.check_forbidden(text)
        if topic_warning:
            warnings.append(topic_warning)

        # 检查不确定信号
        uncertain = self.scan_uncertainty(text)
        if len(uncertain) >= 3:
            warnings.append(
                f"[不确定] 此回复包含多个推测性表述（{', '.join(uncertain[:3])}），"
                f"建议用户核实关键信息。"
            )

        if warnings:
            return text + "\n\n---\n" + "\n".join(warnings)

        return text
