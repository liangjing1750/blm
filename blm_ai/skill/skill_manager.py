"""Skill manager — CRUD for SKILL.md files in the workspace skills directory."""

import os
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

SKILL_FILE = "SKILL.md"
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
NAME_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
MAX_NAME_LEN = 64
MAX_DESC_LEN = 1024
MAX_CONTENT_CHARS = 100_000


class SkillError(Exception):
    """Raised when skill validation fails."""


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(content)
    if m:
        meta = yaml.safe_load(m.group(1)) or {}
        body = content[m.end():]
        return meta, body
    return {}, content


def _make_frontmatter(meta: dict) -> str:
    return "---\n" + yaml.dump(meta, allow_unicode=True, sort_keys=False).strip() + "\n---\n"


def _validate_name(name: str) -> str:
    name = (name or "").strip().lower().replace(" ", "-").replace("_", "-")
    name = re.sub(r"[^a-z0-9-]", "", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    if not name or len(name) > MAX_NAME_LEN:
        raise SkillError(f"Invalid skill name: {name!r} (1-{MAX_NAME_LEN} chars)")
    if not NAME_RE.match(name):
        raise SkillError(f"Skill name must be lowercase hyphenated: {name!r}")
    return name


def _validate_description(desc: str) -> str:
    desc = (desc or "").strip()
    if not desc:
        raise SkillError("Skill description is required")
    if len(desc) > MAX_DESC_LEN:
        raise SkillError(f"Description too long ({len(desc)} > {MAX_DESC_LEN})")
    return desc


class SkillManager:
    """Manages SKILL.md files in the skills directory."""

    def __init__(self, skills_dir: Path):
        self.skills_dir = Path(skills_dir)
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self._archive_dir = self.skills_dir / ".archive"
        self._archive_dir.mkdir(parents=True, exist_ok=True)

    # ---- create ----

    def create(self, name: str, description: str, content: str) -> Path:
        name = _validate_name(name)
        _validate_description(description)
        content = content[:MAX_CONTENT_CHARS]

        skill_dir = self.skills_dir / name
        if skill_dir.exists():
            raise SkillError(f"Skill '{name}' already exists")

        skill_dir.mkdir(parents=True)

        meta = {
            "name": name,
            "description": description,
            "version": "1.0.0",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        skill_path = skill_dir / SKILL_FILE
        full = _make_frontmatter(meta) + content
        _atomic_write(skill_path, full)
        return skill_path

    # ---- list ----

    def list_all(self) -> list[dict]:
        skills = []
        for entry in sorted(self.skills_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            skill_file = entry / SKILL_FILE
            if not skill_file.exists():
                continue
            try:
                meta, _ = _parse_frontmatter(skill_file.read_text("utf-8"))
                skills.append({
                    "name": meta.get("name", entry.name),
                    "description": meta.get("description", ""),
                    "version": meta.get("version", ""),
                    "tags": meta.get("tags", []),
                    "dir": str(entry),
                })
            except Exception:
                continue
        return skills

    # ---- view ----

    def view(self, name: str) -> str | None:
        skill_file = self._skill_file(name)
        if not skill_file:
            return None
        return skill_file.read_text("utf-8")

    # ---- patch ----

    def patch(self, name: str, old_string: str, new_string: str) -> bool:
        skill_file = self._skill_file(name)
        if not skill_file:
            return False
        content = skill_file.read_text("utf-8")
        if old_string not in content:
            # Try fuzzy: normalize whitespace
            import difflib
            old_norm = " ".join(old_string.split())
            content_norm_lines = [" ".join(line.split()) for line in content.splitlines()]
            best_ratio = 0
            best_block = None
            for i in range(len(content_norm_lines)):
                for j in range(i + 1, min(i + 50, len(content_norm_lines) + 1)):
                    block = "\n".join(content_norm_lines[i:j])
                    ratio = difflib.SequenceMatcher(None, old_norm, block).ratio()
                    if ratio > best_ratio and ratio > 0.7:
                        best_ratio = ratio
                        best_block = "\n".join(content.splitlines()[i:j])
            if best_block and best_block in content:
                old_string = best_block
            else:
                return False
        new_content = content.replace(old_string, new_string, 1)
        if new_content == content:
            return False
        _atomic_write(skill_file, new_content)
        return True

    # ---- edit (full replace) ----

    def edit(self, name: str, content: str) -> bool:
        skill_file = self._skill_file(name)
        if not skill_file:
            return False
        _, old_body = _parse_frontmatter(skill_file.read_text("utf-8"))
        old_meta = _parse_frontmatter(skill_file.read_text("utf-8"))[0]
        full = _make_frontmatter(old_meta) + content[:MAX_CONTENT_CHARS]
        _atomic_write(skill_file, full)
        return True

    # ---- delete / archive ----

    def delete(self, name: str, permanent: bool = False) -> bool:
        skill_dir = self.skills_dir / name
        if not skill_dir.is_dir():
            return False
        if permanent:
            shutil.rmtree(skill_dir)
        else:
            # Archive: move to .archive/
            dest = self._archive_dir / name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.move(str(skill_dir), str(dest))
        return True

    # ---- helpers ----

    def _skill_file(self, name: str) -> Path | None:
        name = (name or "").strip().lower()
        skill_file = self.skills_dir / name / SKILL_FILE
        if skill_file.exists():
            return skill_file
        # Try fuzzy lookup
        for entry in self.skills_dir.iterdir():
            if entry.is_dir() and entry.name.lower() == name:
                sf = entry / SKILL_FILE
                if sf.exists():
                    return sf
        return None


def _atomic_write(path: Path, content: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix="." + path.name + ".")
    try:
        os.write(fd, content.encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, str(path))
