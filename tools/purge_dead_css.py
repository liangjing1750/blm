"""
扫描并删除 styles.scss 中的废弃 CSS 规则。

模块意图：
  一体化的「扫描 + 删除」工具，消除 scanner 和 purger 之间的 CSS 解析差异。
  先构建项目词索引，逐规则判定生死，然后从 styles.scss 中精确删除废弃规则。

关键流程：
  1. 构建项目词索引（同 scan_dead_css.py）
  2. 逐字符解析 styles.scss，提取每条规则的选择器文本和字节边界
  3. 从选择器中提取令牌，对照词索引分类
  4. 标记疑似废弃规则，从后往前删除
  5. 写入清理后的文件

边界细节：
  - 必须先有 styles.scss.bak 备份才执行删除
  - 删除后自动清理多余空行
  - 跳过 @media / @keyframes 等嵌套 at-rule
"""
import re
import sys
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
STYLES_SCSS = ROOT / 'frontend-angular' / 'src' / 'styles.scss'
BACKUP_SCSS = ROOT / 'frontend-angular' / 'src' / 'styles.scss.bak'
APP_DIR = ROOT / 'frontend-angular' / 'src' / 'app'

HTML_ELEMENTS = {
    'body', 'html', 'head', 'div', 'span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
    'input', 'button', 'select', 'option', 'textarea', 'label', 'form', 'fieldset',
    'img', 'svg', 'path', 'circle', 'rect', 'g', 'text', 'header', 'footer', 'nav',
    'main', 'section', 'article', 'aside', 'pre', 'code', 'strong', 'em', 'small',
    'br', 'hr', 'iframe', 'video', 'audio', 'canvas',
}
PSEUDO_ROOTS = {':root', '*', '*, *::before', '*::after', '::before', '::after'}


# ─── 词索引构建（复刻 scan_dead_css.py） ────────────────────────

def build_word_index(search_dir: Path) -> dict:
    word_files = defaultdict(set)
    exts = ['*.html', '*.ts', '*.scss']

    for ext in exts:
        for filepath in search_dir.rglob(ext):
            rel = str(filepath.relative_to(ROOT)).replace('\\', '/')
            if 'styles.scss' == filepath.name and filepath.parent.name == 'src':
                continue
            if '/styles/shared/' in rel:
                continue
            try:
                content = filepath.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            if ext == '*.html':
                for m in re.finditer(r'class=["\']([^"\']*)["\']', content):
                    for w in m.group(1).split():
                        if len(w) >= 2:
                            word_files[w].add(rel)
                for m in re.finditer(r'id=["\']([^"\']+)["\']', content):
                    word_files[m.group(1)].add(rel)
                for m in re.finditer(r'\[class\.([a-zA-Z][a-zA-Z0-9_-]*)\]', content):
                    word_files[m.group(1)].add(rel)

            elif ext == '*.ts':
                for m in re.finditer(r"""['"]([a-zA-Z][a-zA-Z0-9_-]{2,})['"]""", content):
                    w = m.group(1)
                    if not w.startswith('_') and not w.isdigit():
                        word_files[w].add(rel)

            elif ext == '*.scss':
                for m in re.finditer(r'\.([a-zA-Z_][a-zA-Z0-9_-]{1,})', content):
                    word_files[m.group(1)].add(rel)
                for m in re.finditer(r'#([a-zA-Z_][a-zA-Z0-9_-]{1,})', content):
                    word_files[m.group(1)].add(rel)

    return dict(word_files)


# ─── 选择器令牌提取 ──────────────────────────────────────────

def extract_tokens(selector: str) -> dict:
    result = {'classes': set(), 'ids': set(), 'attrs': set(), 'elems': set(), 'is_root': False}
    cleaned = selector.strip()
    if cleaned in PSEUDO_ROOTS or re.match(r'^[\s*:]+$', cleaned):
        result['is_root'] = True
        return result

    for m in re.finditer(r'\[([a-zA-Z][a-zA-Z0-9_-]*)\]', cleaned):
        result['attrs'].add(m.group(1))
    cleaned = re.sub(r'\[[^\]]*\]', '', cleaned)
    cleaned = re.sub(r'::[a-zA-Z-]+', '', cleaned)
    cleaned = re.sub(r':[a-zA-Z-]+(\([^)]*\))?', '', cleaned)

    for m in re.finditer(r'\.([a-zA-Z_][a-zA-Z0-9_-]*)', cleaned):
        name = m.group(1)
        if len(name) >= 2:
            result['classes'].add(name)
    for m in re.finditer(r'#([a-zA-Z_][a-zA-Z0-9_-]*)', cleaned):
        result['ids'].add(m.group(1))
    for m in re.finditer(r'(?:(?:^|[>+~\s])\s*)([a-zA-Z][a-zA-Z0-9]*)', cleaned):
        elem = m.group(1)
        if elem in HTML_ELEMENTS:
            result['elems'].add(elem)

    return result


def is_dead(tokens: dict, word_index: dict) -> bool:
    if tokens['is_root']:
        return False
    if tokens['elems'] and not (tokens['classes'] or tokens['ids'] or tokens['attrs']):
        return False
    all_tokens = tokens['classes'] | tokens['ids'] | tokens['attrs']
    if not all_tokens:
        return False
    return not any(t in word_index for t in all_tokens)


# ─── CSS 规则解析（含字节边界） ─────────────────────────────────

def parse_rules_with_boundaries(text: str) -> list[dict]:
    """
    字符级解析，返回每条顶层规则的完整信息。
    {selector, start_offset, open_brace, close_offset}
    close_offset 指向 } 之后的位置。
    """
    rules = []
    i = 0
    n = len(text)
    in_block = False
    in_single = False
    depth = 0
    sel_start = 0
    ob = -1

    while i < n:
        ch = text[i]
        if i + 1 < n and text[i:i+2] == '/*' and not in_single:
            in_block = True; i += 2; continue
        if in_block and i + 1 < n and text[i:i+2] == '*/':
            in_block = False; i += 2; continue
        if in_block:
            i += 1; continue
        if i + 1 < n and text[i:i+2] == '//' and not in_block:
            in_single = True; i += 2; continue
        if in_single and ch == '\n':
            in_single = False; i += 1; continue
        if in_single:
            i += 1; continue

        if ch == '{':
            if depth == 0:
                ob = i
                # 向前找选择器起始 — 处理多行选择器
                s = i - 1
                while s >= 0 and text[s] in (' ', '\t', '\n', '\r'):
                    s -= 1
                # s 现在指向选择器最后一个字符
                # 向前找到这行的开头
                line_start = s
                while line_start > 0 and text[line_start - 1] != '\n':
                    line_start -= 1
                sel_start = line_start

                # 继续向前包含前面的选择器行
                # 前一行以 , 结尾或是选择器的延续（不以 } 结尾且非空行/注释）
                while sel_start > 0:
                    # 跳过 sel_start 前面的空白
                    prev = sel_start - 1
                    while prev > 0 and text[prev] in (' ', '\t', '\n', '\r'):
                        prev -= 1
                    if prev <= 0:
                        break
                    # 找到前一行的开头
                    prev_line_start = prev
                    while prev_line_start > 0 and text[prev_line_start - 1] != '\n':
                        prev_line_start -= 1
                    # 检查前一行是否是选择器的一部分
                    prev_line = text[prev_line_start:prev+1].strip()
                    if not prev_line:
                        break  # 空行，选择器开始
                    if prev_line.startswith('//') or prev_line.startswith('/*'):
                        break  # 注释，选择器开始
                    if '}' in prev_line:
                        break  # 前一个规则结束
                    # 前一行是选择器的一部分（可能是逗号分隔的延续）
                    sel_start = prev_line_start
                    # 如果前一行以 , 结尾，肯定属于同一个选择器，继续往前找
                    # 否则也包含进来（可能是缩进延续）
                    if not prev_line.endswith(','):
                        # 检查当前已累积的选择器文本是否看起来像完整的
                        # 如果不是以 , 开头且前一行不以 , 结尾，可能已经到达起始
                        # 这种情况下继续但留个标记
                        pass
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and ob >= 0:
                sel_text = text[sel_start:ob].strip()
                sel_text = ' '.join(sel_text.split())
                if sel_text and not sel_text.startswith('@'):
                    rules.append({
                        'selector': sel_text,
                        'start': sel_start,
                        'open_brace': ob,
                        'close': i + 1,
                    })
                ob = -1
                sel_start = i + 1
        elif depth == 0 and ch == '@':
            rest = text[i:i+20]
            if rest.startswith('@media') or rest.startswith('@keyframes') or rest.startswith('@supports'):
                j = text.find('{', i)
                if j >= 0:
                    d = 1; k = j + 1
                    while k < n and d > 0:
                        if text[k:k+2] == '/*':
                            e = text.find('*/', k+2)
                            k = e + 2 if e >= 0 else k + 1
                            continue
                        if text[k:k+2] == '//':
                            e = text.find('\n', k)
                            k = e + 1 if e >= 0 else k + 1
                            continue
                        if text[k] == '{': d += 1
                        elif text[k] == '}': d -= 1
                        k += 1
                    i = k; sel_start = i; continue
        i += 1

    return rules


# ─── 主流程 ──────────────────────────────────────────────────

def main():
    if not BACKUP_SCSS.exists():
        print("[ERROR] 未找到备份文件 styles.scss.bak")
        print(f"  请先备份: cp {STYLES_SCSS} {BACKUP_SCSS}")
        sys.exit(1)

    if not STYLES_SCSS.exists():
        print(f"[ERROR] {STYLES_SCSS} 不存在")
        sys.exit(1)

    # Step 1: 构建词索引
    print("[1/4] 构建项目词索引 ...")
    word_index = build_word_index(APP_DIR)
    print(f"      索引词数: {len(word_index)}")

    # Step 2: 解析 CSS 规则
    print("[2/4] 解析 styles.scss ...")
    text = STYLES_SCSS.read_text(encoding='utf-8')
    rules = parse_rules_with_boundaries(text)
    print(f"      解析到 {len(rules)} 条规则")

    # Step 3: 分类
    print("[3/4] 分类规则 ...")
    dead_rules = []
    still = shell = 0
    for rule in rules:
        tokens = extract_tokens(rule['selector'])
        if is_dead(tokens, word_index):
            dead_rules.append(rule)
        elif tokens['is_root'] or (tokens['elems'] and not (tokens['classes'] or tokens['ids'] or tokens['attrs'])):
            shell += 1
        else:
            still += 1

    print(f"      still-used: {still}")
    print(f"      global-shell: {shell}")
    print(f"      suspected-dead: {len(dead_rules)}")

    if not dead_rules:
        print("\n没有需要删除的废弃规则")
        return 0

    # 显示前 15 条待删除
    print(f"\n待删除规则 ({len(dead_rules)} 条)，前 15 条：")
    for rule in dead_rules[:15]:
        ln = text[:rule['start']].count('\n') + 1
        print(f"  L{ln}: {rule['selector'][:75]}")

    # Step 4: 删除
    print("\n[4/4] 删除废弃规则 ...")
    dead_rules.sort(key=lambda r: r['start'], reverse=True)

    result = text
    for rule in dead_rules:
        s, e = rule['start'], rule['close']
        # 清理前导空白
        while s > 0 and result[s-1] in (' ', '\t'):
            s -= 1
        nl = 0
        t = s
        while t > 0 and result[t-1] in ('\n', '\r'):
            if result[t-1] == '\n':
                nl += 1
            t -= 1
        s = t + (1 if nl > 1 else 0)  # 保留最多一个换行
        result = result[:s] + result[e:]

    # 清理多余空行
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.lstrip('\n')

    # 写入
    STYLES_SCSS.write_text(result, encoding='utf-8')

    old_lines = text.count('\n')
    new_lines = result.count('\n')
    old_bytes = len(text)
    new_bytes = len(result)

    print(f"\n{'=' * 50}")
    print(f"删除完成：")
    print(f"  删除规则数:   {len(dead_rules)}")
    print(f"  行数:         {old_lines} → {new_lines} (-{old_lines - new_lines})")
    print(f"  字节数:       {old_bytes} → {new_bytes} (-{old_bytes - new_bytes})")
    print(f"  备份:         {BACKUP_SCSS}")
    print(f"\n恢复命令: cp {BACKUP_SCSS} {STYLES_SCSS}")


if __name__ == '__main__':
    main()
