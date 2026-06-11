from __future__ import annotations

import mimetypes
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape


EMU_PER_PIXEL = 9525
MAX_IMAGE_WIDTH_PX = 900


@dataclass(frozen=True)
class DocxAttachment:
    name: str
    content_type: str
    payload: bytes


@dataclass(frozen=True)
class DocxImage:
    name: str
    content_type: str
    payload: bytes
    width: int
    height: int


def build_docx_from_markdown(markdown: str, *, title: str, attachments: list[DocxAttachment] | None = None) -> bytes:
    """Build a dependency-free DOCX package and freeze Mermaid blocks as SVG images."""
    clean_title = _text(title) or "BLM Document"
    blocks, images = _parse_markdown_blocks(markdown)
    attachment_parts = _prepare_attachments(attachments or [])
    image_parts = _prepare_images(images)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml(attachment_parts, image_parts))
        archive.writestr("_rels/.rels", _root_rels_xml())
        archive.writestr("docProps/core.xml", _core_xml(clean_title))
        archive.writestr("docProps/app.xml", _app_xml())
        archive.writestr("word/styles.xml", _styles_xml())
        archive.writestr("word/_rels/document.xml.rels", _document_rels_xml(attachment_parts, image_parts))
        archive.writestr("word/document.xml", _document_xml(blocks, clean_title, attachment_parts, image_parts))
        for part_name, attachment in attachment_parts:
            archive.writestr(f"word/{part_name}", attachment.payload)
        for part_name, image in image_parts:
            archive.writestr(f"word/{part_name}", image.payload)
    return buffer.getvalue()


def build_docx_with_screenshots(
    markdown: str,
    *,
    title: str,
    screenshots: list[DocxImage] | None = None,
    attachments: list[DocxAttachment] | None = None,
) -> bytes:
    """Build a DOCX package that includes both Mermaid SVG images and PNG screenshots.

    PNG screenshots are appended after the markdown content as additional images.
    """
    clean_title = _text(title) or "BLM Document"
    blocks, markdown_images = _parse_markdown_blocks(markdown)
    screenshot_images = list(screenshots or [])

    # Add screenshot blocks after markdown content
    for i in range(len(screenshot_images)):
        blocks.append({"type": "image", "index": len(markdown_images) + i})

    all_images = markdown_images + screenshot_images
    attachment_parts = _prepare_attachments(attachments or [])
    image_parts = _prepare_images(all_images)

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml(attachment_parts, image_parts))
        archive.writestr("_rels/.rels", _root_rels_xml())
        archive.writestr("docProps/core.xml", _core_xml(clean_title))
        archive.writestr("docProps/app.xml", _app_xml())
        archive.writestr("word/styles.xml", _styles_xml())
        archive.writestr("word/_rels/document.xml.rels", _document_rels_xml(attachment_parts, image_parts))
        archive.writestr(
            "word/document.xml",
            _document_xml_with_screenshots(
                blocks, clean_title, attachment_parts, image_parts,
                len(screenshot_images), len(markdown_images),
            ),
        )
        for part_name, attachment in attachment_parts:
            archive.writestr(f"word/{part_name}", attachment.payload)
        for part_name, image in image_parts:
            archive.writestr(f"word/{part_name}", image.payload)
    return buffer.getvalue()


def _document_xml_with_screenshots(
    blocks: list[dict],
    title: str,
    attachment_parts: list[tuple[str, DocxAttachment]],
    image_parts: list[tuple[str, DocxImage]],
    screenshot_count: int,
    markdown_image_count: int,
) -> str:
    """Like _document_xml but adds a 'Screenshots' heading before screenshot images."""
    body_parts = [_paragraph(title, style="Title")]
    screenshot_header_added = False

    for block in blocks:
        if block.get("type") == "image":
            image_index = int(block.get("index") or 0)
            if 0 <= image_index < len(image_parts):
                if not screenshot_header_added and image_index >= markdown_image_count and screenshot_count > 0:
                    screenshot_header_added = True
                    body_parts.append(_paragraph("截图附件", style="Heading1"))
                _, image = image_parts[image_index]
                body_parts.append(_image_paragraph(f"rImage{image_index + 1}", image))
            continue
        body_parts.append(_paragraph(str(block.get("text", "")), style=str(block.get("style", ""))))

    if attachment_parts:
        body_parts.append(_paragraph("附件", style="Heading1"))
        body_parts.append(_paragraph("以下附件已嵌入到当前 DOCX 文件中。"))
        for _, attachment in attachment_parts:
            size_label = _format_size(len(attachment.payload))
            body_parts.append(
                _paragraph(
                    f"• {attachment.name}（{attachment.content_type or 'application/octet-stream'}，{size_label}）",
                    style="ListParagraph",
                )
            )

    body_parts.append(
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f"<w:body>{''.join(body_parts)}</w:body></w:document>"
    )


def _parse_markdown_blocks(markdown: str) -> tuple[list[dict], list[DocxImage]]:
    blocks: list[dict] = []
    images: list[DocxImage] = []
    lines = str(markdown or "").splitlines()
    index = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if stripped == "```mermaid":
            diagram_lines: list[str] = []
            index += 1
            while index < len(lines) and lines[index].strip() != "```":
                diagram_lines.append(lines[index])
                index += 1
            svg, width, height = _render_mermaid_static_svg("\n".join(diagram_lines), len(images) + 1)
            image = DocxImage(
                name=f"diagram-{len(images) + 1}.svg",
                content_type="image/svg+xml",
                payload=svg.encode("utf-8"),
                width=width,
                height=height,
            )
            images.append(image)
            blocks.append({"type": "image", "index": len(images) - 1})
        elif stripped and stripped != "---":
            blocks.append(_markdown_line_to_block(stripped))
        index += 1
    return blocks, images


def _markdown_line_to_block(line: str) -> dict:
    if line.startswith("### "):
        return {"type": "paragraph", "text": line[4:], "style": "Heading3"}
    if line.startswith("## "):
        return {"type": "paragraph", "text": line[3:], "style": "Heading2"}
    if line.startswith("# "):
        return {"type": "paragraph", "text": line[2:], "style": "Heading1"}
    if line.startswith("- "):
        return {"type": "paragraph", "text": f"• {line[2:]}", "style": "ListParagraph"}
    return {"type": "paragraph", "text": line, "style": ""}


def _render_mermaid_static_svg(code: str, diagram_index: int) -> tuple[str, int, int]:
    graph = _parse_mermaid_flowchart(code)
    if not graph["nodes"]:
        return _fallback_diagram_svg(code, diagram_index)
    nodes = graph["nodes"]
    edges = graph["edges"]
    order = list(nodes.keys())
    levels = _assign_levels(order, edges)
    rows_by_level: dict[int, list[str]] = {}
    for node_id in order:
        rows_by_level.setdefault(levels.get(node_id, 0), []).append(node_id)
    node_w, node_h = 170, 58
    gap_x, gap_y = 95, 34
    margin_x, margin_y = 34, 30
    positions: dict[str, tuple[int, int]] = {}
    for level, node_ids in rows_by_level.items():
        total_height = len(node_ids) * node_h + max(0, len(node_ids) - 1) * gap_y
        start_y = margin_y + max(0, (max(len(items) for items in rows_by_level.values()) * (node_h + gap_y) - gap_y - total_height) // 2)
        for row, node_id in enumerate(node_ids):
            positions[node_id] = (
                margin_x + level * (node_w + gap_x),
                start_y + row * (node_h + gap_y),
            )
    max_level = max(rows_by_level) if rows_by_level else 0
    max_rows = max(len(items) for items in rows_by_level.values()) if rows_by_level else 1
    width = max(420, margin_x * 2 + (max_level + 1) * node_w + max_level * gap_x)
    height = max(160, margin_y * 2 + max_rows * node_h + max(0, max_rows - 1) * gap_y)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "<defs>",
        '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="#64748b"/></marker>',
        "</defs>",
        '<rect width="100%" height="100%" rx="12" fill="#ffffff"/>',
    ]
    for source, target, label in edges:
        if source not in positions or target not in positions:
            continue
        sx, sy = positions[source]
        tx, ty = positions[target]
        x1, y1 = sx + node_w, sy + node_h // 2
        x2, y2 = tx, ty + node_h // 2
        mid_x = (x1 + x2) // 2
        if x2 >= x1:
            path = f"M{x1},{y1} L{mid_x},{y1} L{mid_x},{y2} L{x2},{y2}"
        else:
            top_y = min(y1, y2) - 28
            path = f"M{x1},{y1} L{x1 + 28},{y1} L{x1 + 28},{top_y} L{x2 - 28},{top_y} L{x2 - 28},{y2} L{x2},{y2}"
        parts.append(f'<path d="{path}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>')
        if label:
            label_x, label_y = mid_x, (y1 + y2) // 2 - 7
            parts.append(f'<rect x="{label_x - 24}" y="{label_y - 13}" width="48" height="24" rx="12" fill="#eff6ff" stroke="#bfdbfe"/>')
            parts.append(f'<text x="{label_x}" y="{label_y + 4}" text-anchor="middle" font-size="12" fill="#2563eb">{escape(label)}</text>')
    palette = ["#dbeafe:#2563eb", "#dcfce7:#16a34a", "#fef3c7:#d97706", "#ffe4e6:#e11d48"]
    for index, node_id in enumerate(order):
        x, y = positions[node_id]
        fill, stroke = palette[index % len(palette)].split(":")
        label = _wrap_svg_text(nodes[node_id], 16, max_lines=3)
        radius = 24 if node_id.lower() in {"start", "end"} else 8
        parts.append(f'<rect x="{x}" y="{y}" width="{node_w}" height="{node_h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        text_y = y + 24 - (len(label) - 1) * 8
        for line in label:
            parts.append(f'<text x="{x + node_w / 2:.1f}" y="{text_y}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">{escape(line)}</text>')
            text_y += 17
    parts.append("</svg>")
    return "".join(parts), width, height


def _parse_mermaid_flowchart(code: str) -> dict:
    nodes: dict[str, str] = {}
    edges: list[tuple[str, str, str]] = []
    for raw_line in str(code or "").splitlines():
        line = raw_line.strip().rstrip(";")
        if not line or line.startswith("flowchart") or line.startswith("graph") or line.startswith("subgraph") or line == "end":
            continue
        for node_id, label in re.findall(r'([A-Za-z0-9_:-]+)\s*\["([^"]*)"\]', line):
            nodes.setdefault(node_id, _clean_mermaid_label(label))
        for node_id, label in re.findall(r"([A-Za-z0-9_:-]+)\s*\(\[([^\]]*)\]\)", line):
            nodes.setdefault(node_id, _clean_mermaid_label(label))
        edge_matches = list(re.finditer(r"(.+?)-->(?:\|([^|]*)\|)?(.+)", line))
        if edge_matches:
            segments = re.split(r"-->(?:\|[^|]*\|)?", line)
            labels = re.findall(r"-->\|([^|]*)\|", line)
            ids = [_extract_mermaid_node_id(segment) for segment in segments]
            for idx in range(len(ids) - 1):
                source, target = ids[idx], ids[idx + 1]
                if source and target:
                    nodes.setdefault(source, _default_node_label(source))
                    nodes.setdefault(target, _default_node_label(target))
                    edges.append((source, target, labels[idx] if idx < len(labels) else ""))
        else:
            node_id = _extract_mermaid_node_id(line)
            if node_id and node_id not in nodes:
                nodes[node_id] = _default_node_label(node_id)
    return {"nodes": nodes, "edges": edges}


def _extract_mermaid_node_id(segment: str) -> str:
    text = segment.strip()
    match = re.match(r"([A-Za-z0-9_:-]+)", text)
    return match.group(1) if match else ""


def _assign_levels(order: list[str], edges: list[tuple[str, str, str]]) -> dict[str, int]:
    levels = {node_id: 0 for node_id in order}
    changed = True
    for _ in range(max(1, len(order))):
        if not changed:
            break
        changed = False
        for source, target, _ in edges:
            if source not in levels or target not in levels:
                continue
            next_level = levels[source] + 1
            if next_level > levels[target]:
                levels[target] = next_level
                changed = True
    return levels


def _fallback_diagram_svg(code: str, diagram_index: int) -> tuple[str, int, int]:
    lines = _wrap_svg_text(code or f"Diagram {diagram_index}", 72, max_lines=18)
    width = 860
    height = 70 + len(lines) * 18
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>',
        '<text x="24" y="34" font-size="15" font-weight="700" fill="#0f172a">图形快照</text>',
    ]
    y = 62
    for line in lines:
        parts.append(f'<text x="24" y="{y}" font-size="12" font-family="Consolas,monospace" fill="#334155">{escape(line)}</text>')
        y += 18
    parts.append("</svg>")
    return "".join(parts), width, height


def _prepare_attachments(attachments: list[DocxAttachment]) -> list[tuple[str, DocxAttachment]]:
    used: set[str] = set()
    result: list[tuple[str, DocxAttachment]] = []
    for index, attachment in enumerate(attachments, start=1):
        safe_name = _unique_part_name(attachment.name or f"attachment-{index}.bin", used)
        result.append((f"attachments/{safe_name}", attachment))
    return result


def _prepare_images(images: list[DocxImage]) -> list[tuple[str, DocxImage]]:
    used: set[str] = set()
    result: list[tuple[str, DocxImage]] = []
    for index, image in enumerate(images, start=1):
        safe_name = _unique_part_name(image.name or f"diagram-{index}.svg", used)
        result.append((f"media/{safe_name}", image))
    return result


def _document_xml(blocks: list[dict], title: str, attachment_parts: list[tuple[str, DocxAttachment]], image_parts: list[tuple[str, DocxImage]]) -> str:
    body_parts = [_paragraph(title, style="Title")]
    for block in blocks:
        if block.get("type") == "image":
            image_index = int(block.get("index") or 0)
            if 0 <= image_index < len(image_parts):
                _, image = image_parts[image_index]
                body_parts.append(_image_paragraph(f"rImage{image_index + 1}", image))
            continue
        body_parts.append(_paragraph(str(block.get("text", "")), style=str(block.get("style", ""))))
    if attachment_parts:
        body_parts.append(_paragraph("附件", style="Heading1"))
        body_parts.append(_paragraph("以下附件已嵌入到当前 DOCX 文件中。"))
        for _, attachment in attachment_parts:
            size_label = _format_size(len(attachment.payload))
            body_parts.append(_paragraph(f"• {attachment.name}（{attachment.content_type or 'application/octet-stream'}，{size_label}）", style="ListParagraph"))
    body_parts.append(
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f"<w:body>{''.join(body_parts)}</w:body></w:document>"
    )


def _paragraph(text: str, *, style: str = "") -> str:
    style_xml = f'<w:pPr><w:pStyle w:val="{escape(style)}"/></w:pPr>' if style else ""
    return f"<w:p>{style_xml}<w:r><w:t xml:space=\"preserve\">{escape(_text(text))}</w:t></w:r></w:p>"


def _image_paragraph(rel_id: str, image: DocxImage) -> str:
    width = min(MAX_IMAGE_WIDTH_PX, max(240, int(image.width or MAX_IMAGE_WIDTH_PX)))
    height = max(120, int((image.height or 480) * (width / max(1, int(image.width or width)))))
    cx, cy = width * EMU_PER_PIXEL, height * EMU_PER_PIXEL
    name = escape(image.name)
    return (
        "<w:p><w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\">"
        f"<wp:extent cx=\"{cx}\" cy=\"{cy}\"/><wp:docPr id=\"1\" name=\"{name}\"/>"
        "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">"
        "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\""
        f"{name}"
        "\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>"
        f"<a:blip r:embed=\"{escape(rel_id)}\"/><a:stretch><a:fillRect/></a:stretch>"
        "</pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/>"
        f"<a:ext cx=\"{cx}\" cy=\"{cy}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>"
        "</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
    )


def _content_types_xml(attachment_parts: list[tuple[str, DocxAttachment]], image_parts: list[tuple[str, DocxImage]]) -> str:
    overrides = [
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for part_name, attachment in attachment_parts:
        content_type = attachment.content_type or mimetypes.guess_type(part_name)[0] or "application/octet-stream"
        overrides.append(f'<Override PartName="/word/{escape(part_name)}" ContentType="{escape(content_type)}"/>')
    for part_name, image in image_parts:
        overrides.append(f'<Override PartName="/word/{escape(part_name)}" ContentType="{escape(image.content_type)}"/>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f"{''.join(overrides)}</Types>"
    )


def _root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )


def _document_rels_xml(attachment_parts: list[tuple[str, DocxAttachment]], image_parts: list[tuple[str, DocxImage]]) -> str:
    rels = [
        '<Relationship Id="rStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    ]
    for index, (part_name, _) in enumerate(image_parts, start=1):
        rels.append(
            f'<Relationship Id="rImage{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{escape(part_name)}"/>'
        )
    for index, (part_name, _) in enumerate(attachment_parts, start=1):
        rels.append(
            f'<Relationship Id="rAttach{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="{escape(part_name)}"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{''.join(rels)}</Relationships>"
    )


def _styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>'
        "</w:styles>"
    )


def _core_xml(title: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f"<dc:title>{escape(title)}</dc:title><dc:creator>BLM</dc:creator>"
        "</cp:coreProperties>"
    )


def _app_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
        "<Application>BLM</Application></Properties>"
    )


def _unique_part_name(value: str, used: set[str]) -> str:
    safe_name = _safe_filename(value)
    candidate = safe_name
    stem = Path(safe_name).stem or "file"
    suffix = Path(safe_name).suffix or ".bin"
    counter = 2
    while candidate.lower() in used:
        candidate = f"{stem}-{counter}{suffix}"
        counter += 1
    used.add(candidate.lower())
    return candidate


def _safe_filename(value: str) -> str:
    name = Path(str(value or "").strip()).name or "attachment.bin"
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or "attachment.bin"


def _clean_mermaid_label(value: str) -> str:
    return str(value or "").replace("\\n", " ").replace("<br>", " ").replace("<br/>", " ").strip()


def _default_node_label(node_id: str) -> str:
    lower = node_id.lower()
    if lower == "start":
        return "开始"
    if lower == "end":
        return "结束"
    return node_id


def _wrap_svg_text(value: str, width: int, *, max_lines: int) -> list[str]:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return [""]
    lines: list[str] = []
    current = ""
    for char in text:
        current += char
        if len(current) >= width:
            lines.append(current)
            current = ""
            if len(lines) >= max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) == max_lines and len(text) > sum(len(line) for line in lines):
        lines[-1] = lines[-1].rstrip("。,.， ") + "..."
    return lines


def _format_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


def _text(value: str) -> str:
    return str(value or "").replace("\x00", "")
