"""Bash 安全沙箱 — 只读命令分类、危险命令检测、危险子模式匹配。

reasonix sandbox 模式: 某些 bash 命令天然只读（ls/cat/grep），
即使 bash 工具被标记为写工具，这些命令也可以绕过 Plan 模式的门控。

参考来源:
  - reasonix permission/bash_readonly.go: 只读命令分类
  - cc dangerousPatterns.ts: 危险子模式检测
  - pi-mono bash.ts: 环境变量注入

用途:
  - classify_bash(command) → BashClassification（完整分类结果）
  - is_bash_readonly(command) → bool（快速只读判断）
  - get_safe_readonly_commands() → set[str]（可配置的只读命令集）
"""

import re
import shlex
from dataclasses import dataclass, field

# ---- 只读命令集（不修改系统状态） ----

READONLY_COMMANDS: set[str] = {
    # 文件查看
    "ls", "cat", "head", "tail", "zcat", "zless", "bzcat",
    "wc", "du", "df", "file", "stat",
    # 文本搜索
    "find", "grep", "egrep", "fgrep", "rg", "ack", "ag",
    "awk", "sed", "sort", "uniq", "cut", "tr", "paste", "join",
    "comm", "diff", "cmp", "sdiff",
    # 输出
    "echo", "printf", "tee",
    # 日期和环境
    "date", "cal", "env", "printenv", "pwd", "which", "whereis",
    "uname", "hostname", "whoami", "id", "groups", "who", "w",
    # 版本控制（查看）
    "git",
    # 数学和摘要
    "md5sum", "sha1sum", "sha256sum", "sha512sum", "cksum", "sum",
    # 路径工具
    "basename", "dirname", "readlink", "realpath",
    # 文档查看
    "tree", "less", "more", "man", "info", "whatis", "apropos",
    # 脚本（仅查看/编译时）
    "python", "python3", "node", "ruby", "perl", "php",
    "pip", "pip3", "npm", "cargo", "go",
    # 系统状态
    "ps", "top", "htop", "uptime", "free", "vmstat", "iostat",
    "netstat", "ss", "lsof", "strace",
    # 网络诊断
    "ping", "ping6", "traceroute", "tracepath",
    "nslookup", "dig", "host", "hostname",
    # HTTP 客户端
    "curl", "wget",
    # SSH 和远程
    "ssh", "scp", "rsync",
    # 压缩/归档
    "tar", "gzip", "gunzip", "zcat",
    "zip", "unzip", "xz", "bzip2", "bunzip2",
    "zipinfo", "unzip", "zmore",
}

# ---- 危险命令 ----

DANGEROUS_COMMANDS: set[str] = {
    # 文件系统破坏
    "rm", "rmdir",
    "shutdown", "reboot", "halt", "poweroff",
    "mkfs", "mkswap", "fdisk", "parted", "partprobe",
    "dd",
    "mount", "umount",
    # 权限变更
    "chmod", "chown", "chgrp", "chattr", "setfacl",
    # 进程管理（破坏性）
    "kill", "killall", "pkill", "killall5",
    # 文件移动/复制（可能覆盖重要文件）
    "mv", "cp",
    # 系统服务
    "systemctl", "service", "initctl", "launchctl",
    # 防火墙
    "iptables", "ip6tables", "ufw", "firewall-cmd", "nft",
    # 用户管理
    "useradd", "userdel", "usermod", "groupadd", "groupdel",
    "passwd", "chpasswd",
    # 定时任务
    "crontab", "at", "batch",
    # 包管理
    "apt", "apt-get", "yum", "dnf", "pacman", "brew",
    "pip", "pip3", "npm", "cargo", "gem",
    # 容器/编排
    "docker", "podman", "kubectl", "helm", "docker-compose",
    # Git 破坏性操作
    "git",
}

# ---- 危险子模式（即使命令不那么危险，子模式也可疑） ----

DANGEROUS_SUB_PATTERNS: list[str] = [
    r"\brm\s+(-[rRf]+\s+)",  # rm -rf 模式
    r"--force", r"--hard",
    r">\s*/dev/sd[a-z]",  # 写入块设备
    r">\s*/etc/",         # 写入系统配置
    r"\bdrop\s+.*\bdatabase\b",
    r"\bdelete\s+.*\b(?:all|everything)\b",
    r"\btruncate\b",
    r"\bgit\s+push\s+.*--force",
    r"\bgit\s+reset\s+--hard",
    r"\bgit\s+clean\s+-[fd]",
    r"pip\s+uninstall\s+-y",
    r"npm\s+uninstall\s+-g",
]

# ---- 分类结果 ----

@dataclass
class BashClassification:
    """Bash 命令分类结果 — 由 classify_bash() 返回。

    is_readonly: 命令是否只读（可绕过 Plan 模式）
    is_dangerous: 命令是否危险（需要特殊审批）
    dangerous_patterns: 命中的危险子模式列表
    """
    command: str
    is_readonly: bool = True
    is_dangerous: bool = False
    dangerous_patterns: list[str] = field(default_factory=list)


def classify_bash(command: str) -> BashClassification:
    """分类 bash 命令 — 返回完整的只读/危险性分析。

    算法:
      1. 提取主命令（shlex 解析或空格分割）
      2. 检查危险子模式（优先）
      3. 检查主命令是否在危险命令集中
      4. 检查主命令是否在只读命令集中（且不危险）
    """
    cmd = command.strip()
    if not cmd:
        return BashClassification(command=cmd, is_readonly=True)

    # 提取主命令
    try:
        parts = shlex.split(cmd)
    except ValueError:
        parts = cmd.split()
    if not parts:
        return BashClassification(command=cmd, is_readonly=True)

    primary = parts[0]

    # Shell 内置命令 — 始终只读，除非有管道
    if primary in ("cd", "export", "set", "unset", "alias", "source", "."):
        if "|" in cmd:
            return classify_bash(cmd.split("|")[-1].strip())
        return BashClassification(command=cmd, is_readonly=True)

    # 管道命令 — 分析管道最后一个命令
    if "|" in cmd and primary not in ("echo", "printf", "cat"):
        return classify_bash(cmd.split("|")[-1].strip())

    # 检查危险子模式
    dangerous = []
    for pattern in DANGEROUS_SUB_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            dangerous.append(pattern)

    # 分类
    is_dangerous = primary in DANGEROUS_COMMANDS or len(dangerous) > 0
    is_readonly = primary in READONLY_COMMANDS and not is_dangerous

    # git 特殊处理：只有推/destructive 子命令是危险的
    if primary == "git" and not dangerous:
        is_readonly = True
        is_dangerous = False

    return BashClassification(
        command=cmd,
        is_readonly=is_readonly,
        is_dangerous=is_dangerous,
        dangerous_patterns=dangerous,
    )


def is_bash_readonly(command: str) -> bool:
    """快速只读检查 — 用于权限门控。"""
    return classify_bash(command).is_readonly


def add_readonly_command(cmd: str) -> None:
    """向只读命令集中添加自定义命令。"""
    READONLY_COMMANDS.add(cmd.strip())


def add_dangerous_command(cmd: str) -> None:
    """向危险命令集中添加自定义命令。"""
    DANGEROUS_COMMANDS.add(cmd.strip())
