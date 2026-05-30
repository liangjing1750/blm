from __future__ import annotations

import mimetypes
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape


@dataclass(frozen=True)
class DocxAttachment:
    name: str
    content_type: str
    payload: bytes


def build_docx_from_markdown(markdown: str, *, title: str, attachments: list[DocxAttachment] | None = None) -> bytes:
    """Build a small, dependency-free DOCX package from exported BLM markdown."""
    clean_title = _text(title) or "BLM Document"
    attachment_parts = _prepare_attachments(attachments or [])
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml(attachment_parts))
        archive.writestr("_rels/.rels", _root_rels_xml())
        archive.writestr("docProps/core.xml", _core_xml(clean_title))
        archive.writestr("docProps/app.xml", _app_xml())
        archive.writestr("word/styles.xml", _styles_xml())
        archive.writestr("word/_rels/document.xml.rels", _document_rels_xml(attachment_parts))
        archive.writestr("word/document.xml", _document_xml(markdown, clean_title, attachment_parts))
        for part_name, attachment in attachment_parts:
            archive.writestr(f"word/{part_name}", attachment.payload)
    return buffer.getvalue()


def _prepare_attachments(attachments: list[DocxAttachment]) -> list[tuple[str, DocxAttachment]]:
    used: set[str] = set()
    result: list[tuple[str, DocxAttachment]] = []
    for index, attachment in enumerate(attachments, start=1):
        safe_name = _safe_filename(attachment.name or f"attachment-{index}.bin")
        candidate = safe_name
        stem = Path(safe_name).stem or f"attachment-{index}"
        suffix = Path(safe_name).suffix or ".bin"
        counter = 2
        while candidate.lower() in used:
            candidate = f"{stem}-{counter}{suffix}"
            counter += 1
        used.add(candidate.lower())
        result.append((f"attachments/{candidate}", attachment))
    return result


def _document_xml(markdown: str, title: str, attachment_parts: list[tuple[str, DocxAttachment]]) -> str:
    body_parts = [_paragraph(title, style="Title")]
    for line in str(markdown or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped == "---":
            continue
        if stripped.startswith("### "):
            body_parts.append(_paragraph(stripped[4:], style="Heading3"))
        elif stripped.startswith("## "):
            body_parts.append(_paragraph(stripped[3:], style="Heading2"))
        elif stripped.startswith("# "):
            body_parts.append(_paragraph(stripped[2:], style="Heading1"))
        elif stripped.startswith("- "):
            body_parts.append(_paragraph(f"• {stripped[2:]}", style="ListParagraph"))
        else:
            body_parts.append(_paragraph(stripped))
    if attachment_parts:
        body_parts.append(_paragraph("附件", style="Heading1"))
        body_parts.append(_paragraph("以下附件已嵌入到当前 DOCX 文件中。"))
        for _, attachment in attachment_parts:
            size_label = _format_size(len(attachment.payload))
            body_parts.append(_paragraph(f"• {attachment.name}（{attachment.content_type or 'application/octet-stream'}，{size_label}）", style="ListParagraph"))
    body_parts.append(
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    body = "".join(body_parts)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )


def _paragraph(text: str, *, style: str = "") -> str:
    style_xml = f'<w:pPr><w:pStyle w:val="{escape(style)}"/></w:pPr>' if style else ""
    return f"<w:p>{style_xml}<w:r><w:t xml:space=\"preserve\">{escape(_text(text))}</w:t></w:r></w:p>"


def _content_types_xml(attachment_parts: list[tuple[str, DocxAttachment]]) -> str:
    overrides = [
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for part_name, attachment in attachment_parts:
        content_type = attachment.content_type or mimetypes.guess_type(part_name)[0] or "application/octet-stream"
        overrides.append(f'<Override PartName="/word/{escape(part_name)}" ContentType="{escape(content_type)}"/>')
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


def _document_rels_xml(attachment_parts: list[tuple[str, DocxAttachment]]) -> str:
    rels = [
        '<Relationship Id="rStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    ]
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


def _safe_filename(value: str) -> str:
    name = Path(str(value or "").strip()).name or "attachment.bin"
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or "attachment.bin"


def _format_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


def _text(value: str) -> str:
    return str(value or "").replace("\x00", "")
