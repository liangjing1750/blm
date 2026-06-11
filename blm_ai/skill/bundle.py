"""Skill bundles — group multiple skills under a single slash command.

Example: /doc-export bundle loads docx-export + workspace-analysis together.
"""

import yaml
from pathlib import Path


class SkillBundle:
    """A named group of skills loaded together."""

    def __init__(self, name: str, description: str, skills: list[str]):
        self.name = name
        self.description = description
        self.skills = skills

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "skills": self.skills,
        }


def load_bundles(bundles_dir: Path) -> dict[str, SkillBundle]:
    """Load all .yaml bundle files from a directory."""
    bundles: dict[str, SkillBundle] = {}
    bundles_dir = Path(bundles_dir)
    if not bundles_dir.exists():
        return bundles

    for f in bundles_dir.glob("*.yaml"):
        try:
            data = yaml.safe_load(f.read_text("utf-8"))
            if not isinstance(data, dict):
                continue
            name = data.get("name", f.stem)
            bundles[name] = SkillBundle(
                name=name,
                description=data.get("description", ""),
                skills=data.get("skills", []),
            )
        except Exception:
            continue

    return bundles


def save_bundle(bundles_dir: Path, bundle: SkillBundle) -> Path:
    """Save a bundle as a YAML file."""
    bundles_dir = Path(bundles_dir)
    bundles_dir.mkdir(parents=True, exist_ok=True)
    filepath = bundles_dir / f"{bundle.name}.yaml"
    filepath.write_text(
        yaml.dump(bundle.to_dict(), allow_unicode=True, sort_keys=False),
        "utf-8",
    )
    return filepath


def resolve_bundle(name: str, bundles: dict[str, SkillBundle]) -> list[str] | None:
    """Resolve a bundle name to a list of skill names. Returns None if not found."""
    b = bundles.get(name)
    return b.skills if b else None
