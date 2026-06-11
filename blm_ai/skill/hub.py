"""Skill hub — install skills from remote registries.

Supports GitHub-based skill registries (openai/skills, anthropics/skills, etc.).
"""

import json
import logging
import shutil
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen

from blm_ai.skill.guard import TrustLevel, is_safe_to_install
from blm_ai.skill.skill_manager import SKILL_FILE, SkillError, SkillManager

logger = logging.getLogger(__name__)

# Known registries
REGISTRIES = {
    "blm-core": "https://raw.githubusercontent.com/user/blm-skills/main/index.json",
}


def list_hub_skills(registry: str = "blm-core") -> list[dict]:
    """List available skills from a remote registry."""
    url = REGISTRIES.get(registry)
    if not url:
        return []

    try:
        with urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Failed to fetch registry %s: %s", registry, exc)
        return []


def install_from_hub(
    skill_name: str,
    skills_dir: Path,
    registry: str = "blm-core",
    trust_level: TrustLevel = TrustLevel.COMMUNITY,
) -> str:
    """Download and install a skill from a hub registry.

    Returns "ok", "already_exists", or an error message.
    """
    mgr = SkillManager(skills_dir)
    if mgr.view(skill_name):
        return "already_exists"

    # Fetch skill metadata
    skills = list_hub_skills(registry)
    skill_meta = next((s for s in skills if s.get("name") == skill_name), None)
    if not skill_meta:
        return f"Skill '{skill_name}' not found in registry '{registry}'"

    # Download skill bundle
    download_url = skill_meta.get("download_url", "")
    if not download_url:
        return "No download URL"

    try:
        with urlopen(download_url, timeout=30) as resp:
            data = resp.read()
    except Exception as exc:
        return f"Download failed: {exc}"

    # Extract to temp dir for scanning
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        if download_url.endswith(".zip"):
            with zipfile.ZipFile(zipfile.Path(tmp).open("rb")) as zf:
                zf.extractall(str(tmpdir))
        else:
            # Assume single SKILL.md content
            (tmpdir / SKILL_FILE).write_bytes(data)

        # Security scan
        if not is_safe_to_install(tmpdir, trust_level):
            return "Security scan failed"

        # Install
        skill_dir = skills_dir / skill_name
        if skill_dir.exists():
            return "already_exists"
        shutil.copytree(tmpdir, skill_dir)
        return "ok"
