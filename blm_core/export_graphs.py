from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ExportGraph:
    id: str
    kind: str
    title: str
    selector: str
    params: dict[str, str]
    filename: str


def list_export_graphs(document: dict[str, Any]) -> list[ExportGraph]:
    """Return the dynamic graph surfaces that can be frozen as image assets."""
    graphs: list[ExportGraph] = []
    stages = [stage for stage in _as_list(document.get("stages")) if not stage.get("virtual")]
    processes = _as_list(document.get("processes"))
    entities = _as_list(document.get("entities"))
    if stages:
        graphs.append(_graph("stage-panorama", "stage-panorama", "全景视图", {}))
        for index, stage in enumerate(stages, start=1):
            stage_id = _identity(stage, f"stage-{index}")
            graphs.append(_graph("stage-flow", f"stage-flow:{stage_id}", f"阶段视图 - {_display_name(stage, f'阶段 {index}')}", {"stageId": stage_id}))
    for index, process in enumerate(processes, start=1):
        process_id = _identity(process, f"process-{index}")
        graphs.append(_graph("process-flow", f"process-flow:{process_id}", f"流程图 - {_display_name(process, f'流程 {index}')}", {"processId": process_id}))
    if entities:
        graphs.append(_graph("entity-relation", "entity-relation", "实体关系图", {}))
        for index, entity in enumerate(entities, start=1):
            entity_id = _identity(entity, f"entity-{index}")
            graphs.append(_graph("entity-state", f"entity-state:{entity_id}", f"实体状态图 - {_display_name(entity, f'实体 {index}')}", {"entityId": entity_id}))
    return graphs


def _graph(kind: str, graph_id: str, title: str, params: dict[str, str]) -> ExportGraph:
    return ExportGraph(
        id=graph_id,
        kind=kind,
        title=title,
        selector=f'[data-export-graph-id="{graph_id}"]',
        params=params,
        filename=f"{_safe_filename(graph_id)}.png",
    )


def _as_list(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _identity(item: dict[str, Any], fallback: str) -> str:
    return str(item.get("uid") or item.get("id") or fallback).strip()


def _display_name(item: dict[str, Any], fallback: str) -> str:
    return str(item.get("name") or item.get("title") or fallback).strip()


def _safe_filename(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return safe or "graph"
