import io as _io, zipfile as _zipfile, base64

# Read the file
with open('blm_core/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find range to replace (from 'def _handle_panorama_docx' to the next 'def ')
start = None
end = None
for i, line in enumerate(lines):
    if line.strip().startswith('def _handle_panorama_docx'):
        start = i
    if start is not None and i > start and line.strip().startswith('def ') and '_handle_panorama_docx' not in line:
        end = i
        break

if start is None or end is None:
    print('ERROR: could not find function boundaries')
    exit(1)

print(f'Replacing lines {start+1}-{end}')

# Build replacement
new_code = '''        def _build_minimal_docx(self, img_bytes):
            """Build a minimal DOCX with just one image, no text."""
            import io, zipfile
            EMU = 9525
            cx = min(900 * EMU, 1200 * EMU)
            cy = min(900 * EMU, 800 * EMU)
            doc = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
                'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                '<w:body>'
                '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                '<wp:extent cx="CX" cy="CY"/>'
                '<wp:docPr id="1" name="panorama.png"/>'
                '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="panorama.png"/><pic:cNvPicPr/></pic:nvPicPr>'
                '<pic:blipFill><a:blip r:embed="rImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
                '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="CX" cy="CY"/></a:xfrm>'
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
                '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
                '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
                '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>'
                '</w:body></w:document>'
            ).replace("CX", str(cx)).replace("CY", str(cy))
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("[Content_Types].xml",
                    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                    '<Default Extension="xml" ContentType="application/xml"/>'
                    '<Default Extension="png" ContentType="image/png"/>'
                    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                    '</Types>')
                z.writestr("_rels/.rels",
                    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                    '</Relationships>')
                z.writestr("word/_rels/document.xml.rels",
                    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/panorama.png"/>'
                    '</Relationships>')
                z.writestr("word/document.xml", doc.encode("utf-8"))
                z.writestr("word/media/panorama.png", img_bytes)
            return buf.getvalue()

        def _handle_panorama_docx(self, body):
            """Screenshot to image-only DOCX."""
            try:
                p = self._decode_json(body)
                if isinstance(p, tuple):
                    return self._json(p[0], p[1])
                d = str(p.get("screenshot", "") or "")
                if not d.startswith("data:image/png;base64,"):
                    return self._json({"error": "invalid screenshot"}, 400)
                raw = base64.b64decode(d[len("data:image/png;base64,"):])
                docx = self._build_minimal_docx(raw)
                return self._binary(docx,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    filename="panorama.docx")
            except Exception as exc:
                import traceback
                traceback.print_exc()
                return self._json({"error": str(exc)}, 500)

        def _handle_panorama_md(self, body):
            """Screenshot to .md + .png zip."""
            try:
                p = self._decode_json(body)
                if isinstance(p, tuple):
                    return self._json(p[0], p[1])
                d = str(p.get("screenshot", "") or "")
                if not d.startswith("data:image/png;base64,"):
                    return self._json({"error": "invalid screenshot"}, 400)
                raw = base64.b64decode(d[len("data:image/png;base64,"):])
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                    z.writestr("panorama.md", b"![panorama](panorama.png)\\n")
                    z.writestr("panorama.png", raw)
                return self._binary(buf.getvalue(), "application/zip", filename="panorama.zip")
            except Exception as exc:
                import traceback
                traceback.print_exc()
                return self._json({"error": str(exc)}, 500)
'''
new_lines = new_code.splitlines(keepends=True)

# Also need to add `import io` and `import zipfile` at the top of server.py
# Check if they're already imported
content = ''.join(lines)
if 'import io' not in content:
    # Add after the existing imports
    for i, line in enumerate(lines):
        if line.startswith('import ') and not any(line.startswith(p) for p in ['import io', 'import zipfile']):
            continue
        if line.strip() == '':
            lines.insert(i, 'import io\n')
            lines.insert(i+1, 'import zipfile\n')
            break
    else:
        lines.insert(0, 'import io\nimport zipfile\n')

# Replace the function range
result = lines[:start] + new_lines + lines[end+1:]

with open('blm_core/server.py', 'w', encoding='utf-8') as f:
    f.writelines(result)

import ast
ast.parse(''.join(result))
print('OK - syntax validated')
