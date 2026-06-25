"""
检查样式分层合规性。

模块意图：
  检测 BLM Angular 项目的 CSS/SCSS 是否违反三级管理规范：
  - styles.scss 应只包含 @use 指令，不直接写选择器规则
  - shared/ 目录中不应出现工作台特定选择器
  - 统计疑似废弃选择器数量，辅助清理决策

边界细节：
  - 不修改文件，只输出报告
  - 不检测组件内部 SCSS 内容
  - @use / @forward / @import 行视为合法的入口指令
  - 空行和纯注释行不计入规则行
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLES_DIR = ROOT / 'frontend-angular' / 'src' / 'styles'
APP_DIR = ROOT / 'frontend-angular' / 'src' / 'app'
STYLES_SCSS = ROOT / 'frontend-angular' / 'src' / 'styles.scss'
CSV_PATH = ROOT / 'docs' / 'refactor' / 'styles-classification.csv'

# 工作台前缀，用于检测 shared/ 中是否混入工作台特定选择器
WORKBENCH_PREFIXES = [
    'panorama-', 'process-', 'role-', 'knowledge-',
    'component-', 'entity-', 'orchestration-', 'support-',
    'business-model-', 'entity-design-', 'entity-state-',
    'feedback-', 'manual-',
]


def is_import_line(line: str) -> bool:
    """判断是否为 @use / @forward / @import 指令"""
    stripped = line.strip()
    return bool(re.match(r'@(use|forward|import)\s', stripped))


def is_comment_or_empty(line: str) -> bool:
    """判断是否为注释行或空行"""
    stripped = line.strip()
    return not stripped or stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*')


def is_rule_line(line: str) -> bool:
    """判断是否为包含样式规则的行（含选择器或属性）"""
    if not line.strip():
        return False
    if is_import_line(line):
        return False
    if is_comment_or_empty(line):
        return False
    if line.strip().startswith('}'):
        return False
    return True


def check_styles_scss():
    """检查 styles.scss 是否只包含 @use 指令"""
    issues = []

    if not STYLES_SCSS.exists():
        issues.append(f'[ERROR] {STYLES_SCSS} not found')
        return issues

    lines = STYLES_SCSS.read_text(encoding='utf-8').splitlines()
    rule_lines = []
    import_count = 0

    for i, line in enumerate(lines, 1):
        if is_import_line(line):
            import_count += 1
        elif is_rule_line(line):
            rule_lines.append((i, line.strip()[:80]))

    total_lines = len(lines)

    if rule_lines:
        issues.append(
            f'[WARN] styles.scss has {len(rule_lines)} inline rule line(s) '
            f'(should be @use-only). First 5:'
        )
        for ln, text in rule_lines[:5]:
            issues.append(f'       L{ln}: {text}')
    else:
        issues.append('[PASS] styles.scss is @use-only (no inline rules)')

    issues.append(f'[INFO] styles.scss: {total_lines} total lines, '
                  f'{import_count} @use/@forward/@import directives')
    return issues


def check_shared_selectors():
    """检查 shared/ 目录中是否混入工作台特定选择器"""
    issues = []
    shared_dir = STYLES_DIR / 'shared'

    if not shared_dir.exists():
        issues.append(f'[WARN] {shared_dir} directory not found')
        return issues

    for scss_file in sorted(shared_dir.glob('*.scss')):
        content = scss_file.read_text(encoding='utf-8')
        for prefix in WORKBENCH_PREFIXES:
            # 只检测类选择器（.），跳过 overlay ID 列表（#）— 后者在 _modals.scss 中
            # 是已知的集中声明模式，后续迭代再拆分
            pattern = re.compile(rf'\.{prefix}')
            matches = pattern.findall(content)
            if matches:
                issues.append(
                    f'[WARN] {scss_file.name}: contains workbench-specific '
                    f'class selector ".{prefix}*" (found {len(matches)} match(es))'
                )

    if not any('[WARN]' in i for i in issues):
        issues.append('[PASS] shared/ has no workbench-specific selectors')

    return issues


def check_suspected_dead():
    """从 CSV 统计疑似废弃选择器数量"""
    issues = []

    if not CSV_PATH.exists():
        issues.append(f'[WARN] {CSV_PATH} not found, cannot check suspected-dead')
        return issues

    total = 0
    suspected = 0
    still_used = 0
    global_shell = 0

    for line in CSV_PATH.read_text(encoding='utf-8').splitlines():
        total += 1
        if 'suspected-dead' in line:
            suspected += 1
        elif 'still-used' in line:
            still_used += 1
        elif 'global-shell-or-rendered-content' in line:
            global_shell += 1

    total -= 1  # 减去 header 行

    issues.append(f'[INFO] Style classification: {total} selectors total')
    issues.append(f'       still-used: {still_used}')
    issues.append(f'       global-shell-or-rendered-content: {global_shell}')
    issues.append(f'       suspected-dead: {suspected}')

    if suspected > 900:
        issues.append(f'[WARN] {suspected} suspected-dead selectors — '
                      f'consider running a cleanup pass')

    return issues


def check_css_remnants():
    """检查是否还有 .css 文件或 .css 引用残留"""
    issues = []
    css_files = list(APP_DIR.rglob('*.css'))
    if css_files:
        for f in css_files:
            issues.append(f'[WARN] Found .css file: {f.relative_to(ROOT)}')
    else:
        issues.append('[PASS] No .css files found in src/app/')

    # 检查 .ts 文件中是否还有 .css 引用
    css_refs = []
    for ts_file in APP_DIR.rglob('*.ts'):
        content = ts_file.read_text(encoding='utf-8')
        if re.search(r"\.css'", content):
            css_refs.append(str(ts_file.relative_to(ROOT)))
    if css_refs:
        for ref in css_refs:
            issues.append(f'[WARN] .css reference in TypeScript: {ref}')
    else:
        issues.append('[PASS] No .css references in TypeScript files')

    return issues


def main():
    all_issues = []

    all_issues.append('=== styles.scss 入口检查 ===')
    all_issues.extend(check_styles_scss())

    all_issues.append('\n=== shared/ 工作台选择器检查 ===')
    all_issues.extend(check_shared_selectors())

    all_issues.append('\n=== 样式分类统计 ===')
    all_issues.extend(check_suspected_dead())

    all_issues.append('\n=== .css 残留检查 ===')
    all_issues.extend(check_css_remnants())

    # 输出
    for line in all_issues:
        print(line)

    # 退出码
    has_error = any('[ERROR]' in line for line in all_issues)
    has_warn = any('[WARN]' in line for line in all_issues)

    if has_error:
        print('\nExiting with errors.')
        sys.exit(1)
    elif has_warn:
        print('\nExiting with warnings (non-zero for CI visibility).')
        sys.exit(1)
    else:
        print('\nAll checks passed.')
        sys.exit(0)


if __name__ == '__main__':
    main()
