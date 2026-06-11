"""Memory guard — threat pattern scanning for injection/persistence attacks.

Scans memory entries and skill content for dangerous patterns.
Adapted from hermes-agent's threat_patterns.py.
"""

import re
from dataclasses import dataclass


@dataclass
class ThreatScanResult:
    clean: bool = True
    blocked_patterns: list[str] | None = None
    sanitized: str = ""


# Patterns that indicate prompt injection or exfiltration
INJECTION_PATTERNS = [
    re.compile(r"\[SYSTEM\]|\[ASSISTANT\]|\[END\s*OF\s*TEXT\]", re.IGNORECASE),
    re.compile(r"<\|endoftext\|>|<\|im_start\|>|<\|im_end\|>"),
    re.compile(r"Ignore (all |previous )?(instructions|constraints|rules)", re.IGNORECASE),
    re.compile(r"You are now .*(?:DAN|jailbreak|evil|unfiltered)", re.IGNORECASE),
    re.compile(r"Print (out )?your (system prompt|instructions|rules)", re.IGNORECASE),
]

# Patterns that indicate data exfiltration
EXFIL_PATTERNS = [
    re.compile(r"curl.*\b(?:POST|PUT)\b.*\bhttp", re.IGNORECASE),
    re.compile(r"nc\s+.*\b\d{1,5}\b"),  # netcat
    re.compile(r"socat\s+.*TCP:"),
    re.compile(r"ssh\s+.*\b(?:user@|root@)"),
    re.compile(r"scp\s+.*@.*:"),
]

# Patterns for destructive actions
DESTRUCTIVE_PATTERNS = [
    re.compile(r"rm\s+-rf\s+/"),
    re.compile(r">\s*/dev/sd[a-z]"),
    re.compile(r"mkfs\.[a-z]+"),
    re.compile(r"dd\s+if=/dev/(?:zero|random|urandom)"),
    re.compile(r"chmod\s+777\s+/"),
    re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:"),
]


def scan_content(content: str, scope: str = "standard") -> ThreatScanResult:
    """Scan content for threat patterns.

    scope='standard': check injection + destructive
    scope='strict': check injection + exfiltration + destructive
    """
    patterns = INJECTION_PATTERNS + DESTRUCTIVE_PATTERNS
    if scope == "strict":
        patterns += EXFIL_PATTERNS

    blocked = []
    sanitized = content
    for pattern in patterns:
        if pattern.search(content):
            blocked.append(pattern.pattern)
            sanitized = sanitized.replace(
                pattern.search(content).group(),
                "[BLOCKED]",
            )

    return ThreatScanResult(
        clean=len(blocked) == 0,
        blocked_patterns=blocked if blocked else None,
        sanitized=sanitized,
    )


def is_safe(content: str, scope: str = "standard") -> bool:
    """Quick check: return True if content passes threat scan."""
    return scan_content(content, scope).clean
