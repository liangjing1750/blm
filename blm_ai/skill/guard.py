"""Skill guard — security scanning for externally-sourced skills.

Checks SKILL.md files for: injection, exfiltration, destructive commands,
persistence mechanisms, obfuscation.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class TrustLevel(Enum):
    BUILTIN = "builtin"      # shipped with BLM, fully trusted
    TEAM = "team"            # created by team members
    AGENT_CREATED = "agent_created"  # self-precipitated
    COMMUNITY = "community"  # installed from hub


HIGH_RISK_PATTERNS = [
    # Exfiltration
    (re.compile(r"curl.*\bhttps?://", re.IGNORECASE), "curl to external URL"),
    (re.compile(r"wget\s+https?://", re.IGNORECASE), "wget external URL"),
    (re.compile(r"nc\s+.*\b\d{1,5}\b"), "netcat connection"),
    # Destructive
    (re.compile(r"rm\s+-rf\s+/"), "rm -rf /"),
    (re.compile(r">\s*/dev/sd[a-z]"), "write to block device"),
    (re.compile(r"mkfs\.[a-z]+\s+/dev/"), "format filesystem"),
    # Persistence
    (re.compile(r"@reboot"), "cron @reboot"),
    (re.compile(r"systemctl\s+enable"), "enable systemd service"),
    # Obfuscation
    (re.compile(r"eval\s+.*base64"), "base64 eval"),
    (re.compile(r"__import__\(.*\)"), "dynamic import"),
    (re.compile(r"exec\(.*\)"), "exec call"),
    # Injection
    (re.compile(r"<script>"), "script tag"),
]

MEDIUM_RISK_PATTERNS = [
    (re.compile(r"pip\s+install"), "pip install"),
    (re.compile(r"npm\s+install\s+-g"), "global npm install"),
    (re.compile(r"git\s+clone"), "git clone"),
    (re.compile(r"sudo\b"), "sudo"),
    (re.compile(r"chmod\s+\+x"), "chmod +x"),
]


@dataclass
class ScanReport:
    path: str
    trust_level: TrustLevel
    passed: bool = True
    findings: list[dict] = field(default_factory=list)

    def add_finding(self, severity: str, pattern: str, match: str) -> None:
        self.findings.append({
            "severity": severity,
            "pattern": pattern,
            "match": match[:100],
        })
        if severity == "high":
            self.passed = False


def scan_skill(skill_dir: str | Path, trust_level: TrustLevel) -> ScanReport:
    """Scan a SKILL.md file for security risks."""
    skill_dir = Path(skill_dir)
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        return ScanReport(path=str(skill_dir), trust_level=trust_level)

    content = skill_file.read_text("utf-8")
    report = ScanReport(path=str(skill_dir), trust_level=trust_level)

    # Built-in and team skills skip strict scanning
    if trust_level in (TrustLevel.BUILTIN, TrustLevel.TEAM):
        return report  # pass

    # High-risk scan
    for pattern, label in HIGH_RISK_PATTERNS:
        for match in pattern.finditer(content):
            report.add_finding("high", label, match.group())

    # Medium-risk scan (warning only)
    for pattern, label in MEDIUM_RISK_PATTERNS:
        for match in pattern.finditer(content):
            report.add_finding("medium", label, match.group())

    return report


def is_safe_to_install(skill_dir: str | Path, trust_level: TrustLevel) -> bool:
    """Return True if the skill passes security scan."""
    return scan_skill(skill_dir, trust_level).passed
