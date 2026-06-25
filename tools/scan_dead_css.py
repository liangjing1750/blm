"""
CSS 选择器静态死代码扫描。

模块意图：
  解析 styles.scss 中的每条 CSS 规则，提取其选择器中的类名/ID 令牌，
  然后在 Angular 项目源码（.html / .ts / .scss）中搜索这些令牌，
  判断每条规则是 still-used、global-shell 还是 suspected-dead。

关键流程：
  1. 解析 styles.scss → 提取每条规则的选择器文本和行号
  2. 拆分选择器 → 提取独立的类名、ID、属性名令牌
  3. 构建项目词索引 → 扫描所有 Angular 源文件，建立词 → 文件映射
  4. 逐规则判定 → 规则中任一令牌命中 → still-used；全未命中 → suspected-dead

边界细节：
  - 搜索范围排除 styles.scss 自身和 styles/shared/ 目录
  - HTML 元素选择器（body, input 等）和伪类（:root）直接标记为 global-shell
  - 令牌匹配使用单词边界，避免 btn 误匹配 button
  - 属性选择器 [data-*] 搜索属性名而非方括号内的完整文本
"""
import re
import sys
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
STYLES_SCSS = ROOT / 'frontend-angular' / 'src' / 'styles.scss'
SRC_DIR = ROOT / 'frontend-angular' / 'src'
APP_DIR = SRC_DIR / 'app'
STYLES_DIR = SRC_DIR / 'styles'

# HTML 原生元素 — 不需要在源码中搜索，天然 global-shell
HTML_ELEMENTS = {
    'body', 'html', 'head', 'div', 'span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
    'input', 'button', 'select', 'option', 'textarea', 'label', 'form', 'fieldset',
    'img', 'svg', 'path', 'circle', 'rect', 'g', 'text', 'header', 'footer', 'nav',
    'main', 'section', 'article', 'aside', 'pre', 'code', 'strong', 'em', 'small',
    'br', 'hr', 'iframe', 'video', 'audio', 'canvas',
}

# 伪类/伪元素根 — 全局基础
PSEUDO_ROOTS = {':root', '*', '*, *::before', '*::after', '::before', '::after'}


def extract_css_rules(filepath: Path) -> list[dict]:
    """
    从 SCSS 文件中提取每条 CSS 规则。
    返回 list of {selector, line, lines_range}。
    处理多行选择器、逗号分隔、嵌套媒体查询。
    """
    text = filepath.read_text(encoding='utf-8')
    lines = text.splitlines()
    rules = []

    # 状态机：逐个字符扫描，跟踪花括号深度
    # 我们只关心顶层规则（深度 0 → 1）
    i = 0
    n = len(text)
    depth = 0
    rule_start = 0
    brace_start_line = 0
    in_comment = False
    in_single_comment = False

    while i < n:
        ch = text[i]

        # 跳过块注释
        if i + 1 < n and text[i:i+2] == '/*' and not in_single_comment:
            in_comment = True
            i += 2
            continue
        if in_comment and i + 1 < n and text[i:i+2] == '*/':
            in_comment = False
            i += 2
            continue
        if in_comment:
            i += 1
            continue

        # 跳过行注释
        if i + 1 < n and text[i:i+2] == '//' and not in_comment:
            in_single_comment = True
            i += 2
            continue
        if in_single_comment and ch == '\n':
            in_single_comment = False
            i += 1
            continue
        if in_single_comment:
            i += 1
            continue

        if ch == '{':
            if depth == 0:
                # 顶层规则开始
                selector_text = text[rule_start:i].strip()
                if selector_text and not selector_text.startswith('@'):
                    line_num = text[:i].count('\n') + 1
                    rules.append({
                        'selector': selector_text,
                        'line': line_num,
                        'open_offset': i,
                    })
                brace_start_line = text[:i].count('\n') + 1
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                rule_start = i + 1
        elif ch == '\n' and depth == 0:
            # 可能是一行的结束，更新 rule_start
            # 检查下一行是否是选择器开始（简单启发式）
            pass
        elif depth == 0 and ch not in (' ', '\t', '\n', '\r', ';'):
            # 非空白字符在深度0，可能是新选择器的开始
            # 但如果刚才是一段 @use/@import 后的空行，rule_start 应该已经正确
            pass

        i += 1

    return rules


def extract_rules_simple(filepath: Path) -> list[dict]:
    """
    简化版提取：逐行扫描，用花括号深度跟踪。
    更健壮地处理多行选择器。
    """
    text = filepath.read_text(encoding='utf-8')
    lines = text.splitlines()
    rules = []
    depth = 0
    selector_lines = []
    selector_start_line = 0
    in_block_comment = False

    for line_num, raw_line in enumerate(lines, 1):
        # 处理块注释
        line = raw_line
        if '/*' in line and '*/' not in line:
            in_block_comment = True
        if in_block_comment:
            if '*/' in line:
                in_block_comment = False
                line = line.split('*/', 1)[1] if '*/' in line else ''
            else:
                continue

        # 移除行注释
        if '//' in line:
            # 简单处理：不处理字符串内的 //
            line = line.split('//')[0]

        stripped = line.strip()

        # 跳过空行和 @use/@import
        if not stripped:
            continue
        if stripped.startswith('@use ') or stripped.startswith('@import ') or stripped.startswith('@forward '):
            continue

        # 跟踪花括号
        open_count = line.count('{')
        close_count = line.count('}')

        if depth == 0 and '{' in line:
            # 顶层规则开始
            # 选择器是之前累积的 + 当前行 { 之前的部分
            before_brace = line.split('{', 1)[0].strip()
            selector_lines.append(before_brace)
            full_selector = ' '.join(s for s in selector_lines if s)
            full_selector = ' '.join(full_selector.split())  # 规范化空白
            rules.append({
                'selector': full_selector,
                'line': selector_start_line or line_num,
            })
            selector_lines = []
            selector_start_line = 0
            depth += open_count - close_count
        elif depth > 0:
            depth += open_count - close_count
            if depth <= 0:
                depth = 0
        else:
            # depth == 0，可能是选择器的开始（或延续）
            if stripped.startswith('@media') or stripped.startswith('@keyframes'):
                continue  # 跳过 at-rules 嵌套
            selector_lines.append(stripped)
            if selector_start_line == 0:
                selector_start_line = line_num

    return rules


def split_selectors(selector_text: str) -> list[str]:
    """将逗号分隔的选择器拆分为独立选择器列表。处理括号内的逗号。"""
    parts = []
    depth = 0
    current = []
    for ch in selector_text:
        if ch == '(':
            depth += 1
            current.append(ch)
        elif ch == ')':
            depth -= 1
            current.append(ch)
        elif ch == ',' and depth == 0:
            parts.append(''.join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        parts.append(''.join(current).strip())
    return [p for p in parts if p]


def extract_tokens(selector: str) -> dict:
    """
    从单个选择器中提取所有有意义的令牌。
    返回 {'classes': set, 'ids': set, 'attributes': set, 'elements': set, 'is_pseudo_root': bool}
    """
    result = {
        'classes': set(),
        'ids': set(),
        'attributes': set(),
        'elements': set(),
        'is_pseudo_root': False,
    }

    # 移除伪类和伪元素以便提取基令牌
    # :hover, :focus, :nth-child(...), ::after, ::before, [data-x] 等
    cleaned = selector

    # 检测 :root 和全局选择器
    if re.match(r'^[\s*:]+$', cleaned) or cleaned.strip() in PSEUDO_ROOTS:
        result['is_pseudo_root'] = True
        return result

    # 提取属性选择器 [attr] [attr=val] [attr^=val] 等
    attr_pattern = re.compile(r'\[([a-zA-Z][a-zA-Z0-9_-]*)\]')
    for m in attr_pattern.finditer(cleaned):
        result['attributes'].add(m.group(1))

    # 移除属性选择器（避免 attr=value 中的 value 被误提取为类名）
    cleaned = re.sub(r'\[[^\]]*\]', '', cleaned)

    # 移除伪类和伪元素（保留 ::ng-deep 等穿透指令的特殊处理）
    cleaned = re.sub(r'::[a-zA-Z-]+', '', cleaned)
    cleaned = re.sub(r':[a-zA-Z-]+(\([^)]*\))?', '', cleaned)

    # 提取类名 .xxx
    class_pattern = re.compile(r'\.([a-zA-Z_][a-zA-Z0-9_-]*)')
    for m in class_pattern.finditer(cleaned):
        name = m.group(1)
        # 过滤过短的令牌
        if len(name) >= 2:
            result['classes'].add(name)

    # 提取 ID #xxx
    id_pattern = re.compile(r'#([a-zA-Z_][a-zA-Z0-9_-]*)')
    for m in id_pattern.finditer(cleaned):
        result['ids'].add(m.group(1))

    # 提取元素选择器（在最外层位置）
    elem_pattern = re.compile(r'(?:(?:^|[>+~\s])\s*)([a-zA-Z][a-zA-Z0-9]*)')
    for m in elem_pattern.finditer(cleaned):
        elem = m.group(1)
        if elem in HTML_ELEMENTS:
            result['elements'].add(elem)

    return result


def build_project_word_index(search_dir: Path, exclude_paths: set) -> dict:
    """
    扫描项目中所有源文件，建立词 → 出现文件集的索引。
    返回 {'class_name': {'file1', 'file2'}, 'id_name': {...}, ...}
    """
    word_files = defaultdict(set)

    # 需要扫描的文件类型
    extensions = {'*.html', '*.ts', '*.scss'}

    for ext in extensions:
        for filepath in search_dir.rglob(ext):
            # 排除 styles.scss 和 styles/shared/
            rel = str(filepath.relative_to(ROOT))
            if rel in exclude_paths:
                continue
            if '/styles/shared/' in rel.replace('\\', '/'):
                continue
            if filepath.name == 'styles.scss' and filepath.parent.name == 'src':
                continue

            try:
                content = filepath.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            rel_path = str(filepath.relative_to(ROOT))

            if ext == '*.html':
                # 提取 class="..." 和 id="..." 中的词
                for m in re.finditer(r'class=["\']([^"\']*)["\']', content):
                    for word in m.group(1).split():
                        word = word.strip()
                        if word and len(word) >= 2:
                            word_files[word].add(rel_path)
                for m in re.finditer(r'id=["\']([^"\']+)["\']', content):
                    word_files[m.group(1)].add(rel_path)
                # 提取 [class.xxx]="..." 或 [ngClass] 中的类名
                for m in re.finditer(r'\[class\.([a-zA-Z][a-zA-Z0-9_-]*)\]', content):
                    word_files[m.group(1)].add(rel_path)

            elif ext == '*.ts':
                # 提取字符串字面量中可能是类名的词
                for m in re.finditer(r"""['"]([a-zA-Z][a-zA-Z0-9_-]{2,})['"]""", content):
                    word = m.group(1)
                    # 过滤明显的非 CSS 标识符模式
                    if not word.startswith('_') and not word.isdigit():
                        word_files[word].add(rel_path)
                # 提取 element.classList 等操作中的类名
                for m in re.finditer(r"""['"]([a-zA-Z][a-zA-Z0-9_-]{2,})['"]""", content):
                    word_files[m.group(1)].add(rel_path)

            elif ext == '*.scss':
                # 提取 SCSS 中定义的类名和 ID（作为选择器出现）
                for m in re.finditer(r'\.([a-zA-Z_][a-zA-Z0-9_-]{1,})', content):
                    word_files[m.group(1)].add(rel_path)
                for m in re.finditer(r'#([a-zA-Z_][a-zA-Z0-9_-]{1,})', content):
                    word_files[m.group(1)].add(rel_path)

    return dict(word_files)


def classify_rule(tokens: dict, word_index: dict) -> tuple[str, set]:
    """
    根据令牌判定规则分类。
    返回 (category, matched_tokens)。
    category: 'global-shell' | 'still-used' | 'suspected-dead'
    """
    if tokens['is_pseudo_root']:
        return 'global-shell', set()

    # 收集所有待搜索的令牌
    all_tokens = set()
    all_tokens.update(tokens['classes'])
    all_tokens.update(tokens['ids'])
    all_tokens.update(tokens['attributes'])

    # 元素选择器 → global-shell
    if tokens['elements'] and not all_tokens:
        return 'global-shell', tokens['elements']

    if not all_tokens:
        # 既没有类名也没有 ID 也没有属性（纯元素或伪类）
        return 'global-shell', set()

    # 在词索引中搜索
    matched = set()
    for token in all_tokens:
        if token in word_index:
            matched.add(token)

    if matched:
        return 'still-used', matched
    else:
        return 'suspected-dead', set()


def main():
    # 排除路径
    exclude = {
        'frontend-angular/src/styles.scss',
    }

    print("=" * 60)
    print("CSS 死代码扫描器")
    print("=" * 60)

    # Step 1: 提取 CSS 规则
    print(f"\n[1/4] 解析 {STYLES_SCSS.relative_to(ROOT)} ...")
    rules = extract_rules_simple(STYLES_SCSS)
    print(f"       提取到 {len(rules)} 条 CSS 规则")

    # Step 2: 为每条规则提取令牌
    print("\n[2/4] 拆分选择器令牌 ...")
    rule_tokens = []
    for rule in rules:
        selector = rule['selector']
        # 处理逗号分隔的选择器
        sub_selectors = split_selectors(selector)
        all_classes = set()
        all_ids = set()
        all_attrs = set()
        all_elems = set()
        is_root = False

        for sub in sub_selectors:
            t = extract_tokens(sub)
            all_classes.update(t['classes'])
            all_ids.update(t['ids'])
            all_attrs.update(t['attributes'])
            all_elems.update(t['elements'])
            if t['is_pseudo_root']:
                is_root = True

        rule_tokens.append({
            'selector': selector,
            'line': rule['line'],
            'classes': all_classes,
            'ids': all_ids,
            'attributes': all_attrs,
            'elements': all_elems,
            'is_pseudo_root': is_root,
        })

    unique_classes = set()
    unique_ids = set()
    for rt in rule_tokens:
        unique_classes.update(rt['classes'])
        unique_ids.update(rt['ids'])
    print(f"       唯一类名: {len(unique_classes)}, 唯一 ID: {len(unique_ids)}")

    # Step 3: 构建项目词索引
    print("\n[3/4] 构建项目词索引 ...")
    word_index = build_project_word_index(APP_DIR, exclude)
    print(f"       索引词数: {len(word_index)}")

    # Step 4: 分类每条规则
    print("\n[4/4] 分类每条规则 ...")
    results = {'still-used': [], 'global-shell': [], 'suspected-dead': []}
    token_cache = {}

    for rt in rule_tokens:
        category, matched = classify_rule(
            {'classes': rt['classes'], 'ids': rt['ids'],
             'attributes': rt['attributes'], 'elements': rt['elements'],
             'is_pseudo_root': rt['is_pseudo_root']},
            word_index
        )
        results[category].append({
            'selector': rt['selector'],
            'line': rt['line'],
            'matched': sorted(matched),
            'tokens': sorted(rt['classes'] | rt['ids'] | rt['attributes']),
        })

    # 输出报告
    total = len(rules)
    still = len(results['still-used'])
    shell = len(results['global-shell'])
    dead = len(results['suspected-dead'])

    print(f"\n{'=' * 60}")
    print(f"扫描结果")
    print(f"{'=' * 60}")
    print(f"  总规则数:           {total}")
    print(f"  still-used:         {still}  ({still*100//total}%)")
    print(f"  global-shell:       {shell}  ({shell*100//total}%)")
    print(f"  suspected-dead:     {dead}  ({dead*100//total}%)")

    # 输出 suspected-dead 列表
    if results['suspected-dead']:
        print(f"\n{'─' * 60}")
        print(f"疑似废弃规则 ({dead} 条):")
        print(f"{'─' * 60}")
        for item in results['suspected-dead'][:100]:  # 最多显示前 100 条
            tokens_str = ', '.join(item['tokens'][:5])
            if len(item['tokens']) > 5:
                tokens_str += f' ... (+{len(item["tokens"])-5})'
            print(f"  L{item['line']:5d}  {item['selector'][:70]}")
            if item['tokens']:
                print(f"           tokens: [{tokens_str}]")

        if dead > 100:
            print(f"\n  ... 还有 {dead - 100} 条未显示")

    # 输出到 JSON 供后续工具使用
    json_path = ROOT / 'docs' / 'refactor' / 'dead-css-scan.json'
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(json_path), 'w', encoding='utf-8') as f:
        json.dump({
            'summary': {
                'total': total,
                'still_used': still,
                'global_shell': shell,
                'suspected_dead': dead,
            },
            'suspected_dead': [
                {'line': r['line'], 'selector': r['selector'], 'tokens': r['tokens']}
                for r in results['suspected-dead']
            ],
        }, f, ensure_ascii=False, indent=2)
    print(f"\n详细结果已写入: {json_path.relative_to(ROOT)}")

    # 退出码
    if dead > 900:
        print(f"\n[WARN] {dead} 条疑似废弃规则，建议分批清理")
    return 0


if __name__ == '__main__':
    sys.exit(main())
