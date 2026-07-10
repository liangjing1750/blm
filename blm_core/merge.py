from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any
from uuid import uuid4

from blm_core.document import SCHEMA_VERSION, _deterministic_ui_uid, canonical_document, migrate_document
from blm_core.model_strategy import (
    DESCRIPTORS,
    INTERNAL_SCALAR_FIELDS,
    RULE_APPLIES_TO_COLLECTIONS,
    SEMANTIC_KEY_ONLY_TYPES,
    SEMANTIC_UNIQUE_IN_COMBINE,
    collection_label,
    normalize_strategy_text,
    semantic_key,
)


MISSING = object()
VERSION_SUFFIX_RE = re.compile(r"(?:[-_\s]?v\d+|[-_\s]?版本\d+)$", re.IGNORECASE)
TRAILING_SEPARATOR_RE = re.compile(r"[-_\s]+$")


def _normalize_name(text: Any) -> str:
    return normalize_strategy_text(text)


def _value_equal(left: Any, right: Any) -> bool:
    return left == right


def _is_empty(value: Any) -> bool:
    if value in ("", None):
        return True
    if isinstance(value, list):
        return not value
    if isinstance(value, dict):
        return not value
    return False


def _copy(value: Any) -> Any:
    return deepcopy(value)


def _merge_internal_scalar_field(base_value: Any, left_value: Any, right_value: Any) -> Any:
    """Merge UI-owned position/layout scalars without letting stale clients erase newer placement."""
    if base_value is not MISSING:
        if _value_equal(left_value, right_value):
            return _copy(left_value)
        if _value_equal(left_value, base_value) and not _value_equal(right_value, base_value):
            return _copy(right_value)
        if _value_equal(right_value, base_value) and not _value_equal(left_value, base_value):
            return _copy(left_value)
    for value in (left_value, right_value, base_value):
        if value is not MISSING and not _is_empty(value):
            return _copy(value)
    return ""


def _reference_tokens(item: dict) -> set[str]:
    tokens = set()
    for key in ("uid", "name"):
        value = str(item.get(key, "")).strip()
        if value:
            tokens.add(value)
    return tokens


def _semantic_duplicate_equal(left: Any, right: Any) -> bool:
    if isinstance(left, dict) and isinstance(right, dict):
        ignored_fields = {"uid", "id"}
        left_keys = set(left) - ignored_fields
        right_keys = set(right) - ignored_fields
        if left_keys != right_keys:
            return False
        return all(_semantic_duplicate_equal(left.get(key), right.get(key)) for key in left_keys)
    if isinstance(left, list) and isinstance(right, list):
        if len(left) != len(right):
            return False
        return all(_semantic_duplicate_equal(left_item, right_item) for left_item, right_item in zip(left, right))
    return left == right


def _should_trust_identity(raw_document: dict | None) -> bool:
    meta = (raw_document or {}).get("meta", {})
    try:
        schema_version = int(meta.get("schema_version") or 0)
    except (TypeError, ValueError):
        schema_version = 0
    return bool(str(meta.get("document_uid", "")).strip()) and schema_version >= SCHEMA_VERSION


def _prepare_input(document: dict | None) -> tuple[dict, bool]:
    raw = deepcopy(document or {})
    return canonical_document(raw), _should_trust_identity(raw)


def _collect_model_uids(value: Any) -> set[str]:
    uids: set[str] = set()
    if isinstance(value, dict):
        uid = str(value.get("uid", "")).strip()
        if uid:
            uids.add(uid)
        for child_value in value.values():
            uids.update(_collect_model_uids(child_value))
    elif isinstance(value, list):
        for item in value:
            uids.update(_collect_model_uids(item))
    return uids


def _has_shared_model_identity(left: MergeInput, right: MergeInput) -> bool:
    if not (left.trust_identity and right.trust_identity):
        return False
    return bool(_collect_model_uids(left.document) & _collect_model_uids(right.document))


def _merge_set_values(base_value: Any, left_value: Any, right_value: Any) -> list[Any]:
    """3-way merge of set-like lists（如 businessConstructUids）。

    协议：- base ∩ left ∩ right → 保留（双方都保留的原有项）
          - (left - base)   → 保留（left 新增的项）
          - (right - base)  → 保留（right 新增的项）
          - base 中存在但 left 或 right 移除的项 → 删除
    避免纯 union 导致的"删除永远不传播"缺陷。
    """
    base_set = {str(item) for item in (base_value or [])}
    left_set = {str(item) for item in (left_value or [])}
    right_set = {str(item) for item in (right_value or [])}

    # 三方都保留的 + 各自新增的
    keep_keys = (base_set & left_set & right_set) | (left_set - base_set) | (right_set - base_set)

    result = []
    seen = set()
    for source in (left_value or [], right_value or []):
        for item in source:
            key = str(item)
            if key not in keep_keys:
                continue
            if key in seen:
                continue
            seen.add(key)
            result.append(item)
    return result


def _merge_panorama_item(existing: dict, candidate: dict) -> dict:
    """Fill-empty merge for combine mode (无 base 时的 2-way 合并)。"""
    for field in ("uid", "id", "name", "badge", "scope", "note", "status", "text"):
        if _is_empty(existing.get(field)) and not _is_empty(candidate.get(field)):
            existing[field] = _copy(candidate.get(field))
    return existing


def _merge_panorama_item_3way(base_item: dict, left_item: dict, right_item: dict) -> dict:
    """3-way merge of a single panorama item's scalar fields。

    与 _merge_scalar 一致的语义：
    - left == right → 无冲突，取 left
    - left == base → right 变更 → 取 right
    - right == base → left 变更 → 取 left
    - 其他 → 冲突，暂取 left（保留用户修改）
    """
    result = _copy(left_item or right_item or base_item or {})
    for field in ("uid", "id", "name", "badge", "scope", "note", "status", "text"):
        bv = base_item.get(field) if isinstance(base_item, dict) else None
        lv = left_item.get(field) if isinstance(left_item, dict) else None
        rv = right_item.get(field) if isinstance(right_item, dict) else None
        if _value_equal(lv, rv):
            result[field] = _copy(lv)
        elif not _value_equal(lv, bv) and _value_equal(rv, bv):
            result[field] = _copy(lv)
        elif _value_equal(lv, bv) and not _value_equal(rv, bv):
            result[field] = _copy(rv)
        elif _is_empty(lv) and not _is_empty(rv):
            result[field] = _copy(rv)
        elif _is_empty(rv) and not _is_empty(lv):
            result[field] = _copy(lv)
        else:
            result[field] = _copy(lv if lv is not None else rv)
    return result


def _panorama_item_key(item: dict, *, prefer_semantic: bool = False) -> str:
    name_key = _normalize_name(item.get("name"))
    if prefer_semantic and name_key:
        return f"name:{name_key}"
    uid = str(item.get("uid", "")).strip()
    if uid:
        return f"uid:{uid}"
    if name_key:
        return f"name:{name_key}"
    id_key = _normalize_name(item.get("id"))
    if id_key:
        return f"id:{id_key}"
    return ""


def _resolution_choice(resolution: dict | None) -> str:
    return str((resolution or {}).get("choice", "")).strip()


def _document_label(document: dict | None) -> str:
    meta = (document or {}).get("meta", {})
    for field in ("domain", "title"):
        value = str(meta.get(field, "")).strip()
        if value:
            return value
    return ""


def _strip_version_suffix(name: str) -> str:
    normalized = str(name or "").strip()
    if not normalized:
        return ""
    stripped = VERSION_SUFFIX_RE.sub("", normalized).strip()
    stripped = TRAILING_SEPARATOR_RE.sub("", stripped).strip()
    return stripped or normalized


def suggest_merge_name(left_document: dict | None, right_document: dict | None) -> str:
    left_label = _document_label(left_document)
    right_label = _document_label(right_document)
    left_base = _strip_version_suffix(left_label)
    right_base = _strip_version_suffix(right_label)

    if left_base and left_base == right_base:
        return f"{left_base}-合并"

    names: list[str] = []
    seen: set[str] = set()
    for candidate in (left_base or left_label, right_base or right_label):
        key = _normalize_name(candidate)
        if not key or key in seen:
            continue
        seen.add(key)
        names.append(candidate.strip())

    if not names:
        return "合并文档"
    if len(names) == 1:
        return f"{names[0]}-合并"
    ordered = sorted(names, key=_normalize_name)
    return f"{'-'.join(ordered)}-合并"


@dataclass
class MergeInput:
    document: dict
    trust_identity: bool


class MergeEngine:
    def __init__(self, mode: str, resolutions: dict[str, dict] | None = None):
        self.mode = mode
        self.resolutions = resolutions or {}
        self.conflicts: list[dict] = []
        self.validation_issues: list[dict] = []
        self.consistency_repairs: list[dict] = []
        self.auto_merged_count = 0
        self.suggested_name = ""

    def analyze(self, left_raw: dict, right_raw: dict, base_raw: dict | None = None) -> dict:
        left = MergeInput(*_prepare_input(left_raw))
        right = MergeInput(*_prepare_input(right_raw))
        base = MergeInput(*_prepare_input(base_raw)) if base_raw is not None else None
        merged = self._merge_document(base, left, right)
        merged = migrate_document(merged)
        merged, self.consistency_repairs = repair_document_consistency(merged)
        self.validation_issues = validate_document(merged)

        merged = canonical_document(merged)
        return {
            "mode": self.mode,
            "suggested_name": self.suggested_name,
            "summary": {
                "autoMergedCount": self.auto_merged_count,
                "conflictCount": len(self.conflicts),
                "validationIssueCount": len(self.validation_issues),
                "consistencyRepairCount": len(self.consistency_repairs),
            },
            "conflicts": self.conflicts,
            "validation_issues": self.validation_issues,
            "consistency_repairs": self.consistency_repairs,
            "merged_document": merged,
        }

    def _merge_document(self, base: MergeInput | None, left: MergeInput, right: MergeInput) -> dict:
        merged_meta = self._merge_object(
            "meta",
            ["meta"],
            getattr(base, "document", {}).get("meta") if base else MISSING,
            left.document.get("meta", {}),
            right.document.get("meta", {}),
            match_source="meta",
        )
        if base and left.document["meta"].get("document_uid") == right.document["meta"].get("document_uid"):
            merged_meta["document_uid"] = left.document["meta"].get("document_uid")
        elif left.document["meta"].get("document_uid") and left.document["meta"].get("document_uid") == right.document["meta"].get("document_uid"):
            merged_meta["document_uid"] = left.document["meta"].get("document_uid")
        else:
            merged_meta["document_uid"] = uuid4().hex
        merged_meta["schema_version"] = SCHEMA_VERSION
        if self.mode == "combine":
            self.suggested_name = suggest_merge_name(left.document, right.document)
            merged_meta["title"] = self.suggested_name
            merged_meta["domain"] = self.suggested_name
            self.conflicts = [
                conflict
                for conflict in self.conflicts
                if conflict.get("path") not in {"meta.title", "meta.domain"}
            ]
        else:
            self.suggested_name = ""

        panorama, panorama_reference_maps = self._merge_panorama(
            getattr(base, "document", {}) if base else {},
            left.document,
            right.document,
        )
        if panorama:
            left_document = self._copy_with_panorama_reference_map(left.document, panorama_reference_maps.get("left", {}))
            right_document = self._copy_with_panorama_reference_map(right.document, panorama_reference_maps.get("right", {}))
            base_document = (
                self._copy_with_panorama_reference_map(base.document, panorama_reference_maps.get("base", {}))
                if base
                else {}
            )
        else:
            left_document = left.document
            right_document = right.document
            base_document = getattr(base, "document", {}) if base else {}

        merged = {"meta": merged_meta}
        if panorama:
            merged["panorama"] = panorama
        for field, item_type in DESCRIPTORS["document"]["lists"].items():
            merged[field] = self._merge_list(
                item_type,
                [field],
                base_document.get(field, []) if base else [],
                left_document.get(field, []),
                right_document.get(field, []),
                base_trust=base.trust_identity if base else False,
                left_trust=left.trust_identity,
                right_trust=right.trust_identity,
            )
        return merged

    def _merge_panorama(self, base_document: dict, left_document: dict, right_document: dict) -> tuple[dict, dict[str, dict[str, dict[str, str]]]]:
        left_pano = left_document.get("panorama", {}) if isinstance(left_document.get("panorama"), dict) else {}
        right_pano = right_document.get("panorama", {}) if isinstance(right_document.get("panorama"), dict) else {}
        base_pano = base_document.get("panorama", {}) if isinstance(base_document.get("panorama"), dict) else {}

        if not any(isinstance(p, dict) and p for p in (left_pano, right_pano, base_pano)):
            return {}, {}

        maps: dict[str, dict[str, dict[str, str]]] = {
            "left": {"columns": {}, "lanes": {}},
            "right": {"columns": {}, "lanes": {}},
            "base": {"columns": {}, "lanes": {}},
        }

        def collect_by_key(panorama: dict, axis: str) -> dict[str, dict]:
            result: dict[str, dict] = {}
            for item in panorama.get(axis, []) if isinstance(panorama, dict) else []:
                if not isinstance(item, dict):
                    continue
                key = _panorama_item_key(item, prefer_semantic=self.mode == "combine")
                if not key or key == "uid:":
                    continue
                result[key] = item
            return result

        def merge_axis_3way(axis: str) -> list[dict]:
            base_items = collect_by_key(base_pano, axis)
            left_items = collect_by_key(left_pano, axis)
            right_items = collect_by_key(right_pano, axis)

            all_keys: set[str] = set()
            for items in (base_items, left_items, right_items):
                all_keys.update(items.keys())

            base_keys = set(base_items.keys())
            left_keys = set(left_items.keys())
            right_keys = set(right_items.keys())

            # 3-way deletion：base中存在但被任一方移除的项 → 删除
            keep_keys = (base_keys & left_keys & right_keys) | (left_keys - base_keys) | (right_keys - base_keys)

            ordered: list[dict] = []
            seen: set[str] = set()
            # 保持 left → right → base 的顺序，确保新增项优先取 left
            for items in (left_items, right_items):
                for key, item in items.items():
                    if key not in keep_keys or key in seen:
                        continue
                    seen.add(key)
                    base_item = base_items.get(key, {})
                    left_item = left_items.get(key, {})
                    right_item = right_items.get(key, {})
                    if self.mode == "3way" and base_item:
                        merged = _merge_panorama_item_3way(base_item, left_item, right_item)
                    else:
                        merged = _copy(left_item or right_item)
                        if right_item:
                            _merge_panorama_item(merged, right_item)
                        if base_item:
                            _merge_panorama_item(merged, base_item)
                        if self.mode == "combine":
                            name = str(merged.get("name", "")).strip()
                            if name:
                                prefix = "panorama-column" if axis == "columns" else "panorama-lane"
                                merged["uid"] = _deterministic_ui_uid(prefix, name)
                    ordered.append(merged)

                    # reference maps
                    target_uid = str(merged.get("uid") or merged.get("id") or "").strip()
                    if target_uid:
                        for source_name, source_items in [("left", left_items), ("right", right_items), ("base", base_items)]:
                            source_item = source_items.get(key)
                            if source_item:
                                for source_field in ("uid", "id"):
                                    source_ref = str(source_item.get(source_field, "")).strip()
                                    if source_ref:
                                        maps[source_name][axis][source_ref] = target_uid

            return ordered

        columns = merge_axis_3way("columns")
        lanes = merge_axis_3way("lanes")
        # 构建全局 reference map（解决 uid/id 引用不一致）
        for axis in ("columns", "lanes"):
            global_map: dict[str, str] = {}
            ambiguous_refs: set[str] = set()
            for source_maps in maps.values():
                for source_ref, target_ref in source_maps[axis].items():
                    if source_ref in global_map and global_map[source_ref] != target_ref:
                        ambiguous_refs.add(source_ref)
                    else:
                        global_map[source_ref] = target_ref
            for ambiguous_ref in ambiguous_refs:
                global_map.pop(ambiguous_ref, None)
            for source_maps in maps.values():
                for source_ref, target_ref in global_map.items():
                    source_maps[axis].setdefault(source_ref, target_ref)

        # 收集所有 source 的 cells（按标准化 key）
        def collect_cells(panorama: dict, source_maps_item: dict) -> dict[tuple[str, str], dict]:
            result: dict[tuple[str, str], dict] = {}
            if not isinstance(panorama, dict):
                return result
            column_map = source_maps_item.get("columns", {})
            lane_map = source_maps_item.get("lanes", {})
            for cell in panorama.get("cells", []):
                if not isinstance(cell, dict):
                    continue
                column_ref = str(cell.get("columnUid") or cell.get("columnId") or "").strip()
                lane_ref = str(cell.get("laneUid") or cell.get("laneId") or "").strip()
                column_id = column_map.get(column_ref, column_ref)
                lane_id = lane_map.get(lane_ref, lane_ref)
                if not column_id or not lane_id:
                    continue
                key = (lane_id, column_id)
                normalized = _copy(cell)
                normalized["columnUid"] = column_id
                normalized["laneUid"] = lane_id
                normalized.pop("columnId", None)
                normalized.pop("laneId", None)
                result[key] = normalized
            return result

        base_cells = collect_cells(base_pano, maps["base"])
        left_cells = collect_cells(left_pano, maps["left"])
        right_cells = collect_cells(right_pano, maps["right"])

        base_cell_keys = set(base_cells.keys())
        left_cell_keys = set(left_cells.keys())
        right_cell_keys = set(right_cells.keys())

        # 3-way deletion for cells
        keep_cell_keys = (base_cell_keys & left_cell_keys & right_cell_keys) | (left_cell_keys - base_cell_keys) | (right_cell_keys - base_cell_keys)

        merged_cells: list[dict] = []
        seen_cell_keys: set[tuple[str, str]] = set()
        # 先 left 后 right（新增项优先取 left 的字段值）
        for cell_items in (left_cells, right_cells):
            for key, cell in cell_items.items():
                if key not in keep_cell_keys or key in seen_cell_keys:
                    continue
                seen_cell_keys.add(key)
                if self.mode == "3way":
                    merged = _merge_panorama_item_3way(
                        base_cells.get(key, {}), left_cells.get(key, {}), right_cells.get(key, {})
                    )
                else:
                    merged = _copy(left_cells.get(key) or right_cells.get(key) or {})
                    if right_cells.get(key):
                        _merge_panorama_item(merged, right_cells[key])
                merged_cells.append(merged)

        return {"columns": columns, "lanes": lanes, "cells": merged_cells}, maps

    def _copy_with_panorama_reference_map(self, document: dict, reference_map: dict[str, dict[str, str]]) -> dict:
        if not reference_map:
            return document
        result = _copy(document)
        column_map = reference_map.get("columns", {})
        lane_map = reference_map.get("lanes", {})

        for stage in result.get("stages", []):
            if not isinstance(stage, dict):
                continue
            column_id = str(stage.get("panoramaColumnUid") or stage.get("panoramaColumnId") or "").strip()
            lane_id = str(stage.get("panoramaLaneUid") or stage.get("panoramaLaneId") or "").strip()
            if column_id in column_map:
                stage["panoramaColumnUid"] = column_map[column_id]
                stage.pop("panoramaColumnId", None)
            if lane_id in lane_map:
                stage["panoramaLaneUid"] = lane_map[lane_id]
                stage.pop("panoramaLaneId", None)

        for role in result.get("roles", []):
            if not isinstance(role, dict):
                continue
            lane_id = str(
                role.get("panoramaLaneUid")
                or role.get("panoramaLaneId")
                or role.get("businessDomainUid")
                or role.get("businessDomainId")
                or ""
            ).strip()
            if lane_id in lane_map:
                if "panoramaLaneUid" in role or "panoramaLaneId" in role:
                    role["panoramaLaneUid"] = lane_map[lane_id]
                    role.pop("panoramaLaneId", None)
                if "businessDomainUid" in role or "businessDomainId" in role:
                    role["businessDomainUid"] = lane_map[lane_id]
                    role.pop("businessDomainId", None)

        panorama = result.get("panorama")
        if isinstance(panorama, dict):
            for cell in panorama.get("cells", []):
                if not isinstance(cell, dict):
                    continue
                column_id = str(cell.get("columnUid") or cell.get("columnId") or "").strip()
                lane_id = str(cell.get("laneUid") or cell.get("laneId") or "").strip()
                if column_id in column_map:
                    cell["columnUid"] = column_map[column_id]
                    cell.pop("columnId", None)
                if lane_id in lane_map:
                    cell["laneUid"] = lane_map[lane_id]
                    cell.pop("laneId", None)
        return result

    def _merge_object(
        self,
        item_type: str,
        path: list[str],
        base_value: Any,
        left_value: Any,
        right_value: Any,
        *,
        match_source: str,
        base_trust: bool = False,
        left_trust: bool = False,
        right_trust: bool = False,
    ) -> dict:
        descriptor = DESCRIPTORS[item_type]
        merged: dict[str, Any] = {}

        if item_type != "process_flow":
            left_uid = left_value.get("uid") if isinstance(left_value, dict) else ""
            right_uid = right_value.get("uid") if isinstance(right_value, dict) else ""
            base_uid = base_value.get("uid") if isinstance(base_value, dict) else ""
            merged["uid"] = str(left_uid or right_uid or base_uid or uuid4().hex)

        if self.mode == "combine" and match_source == "name" and base_value is MISSING:
            if self._needs_object_conflict(item_type, left_value, right_value):
                return self._resolve_object_conflict(item_type, path, left_value, right_value)

        for field in descriptor.get("scalars", []):
            if field in INTERNAL_SCALAR_FIELDS:
                merged[field] = _merge_internal_scalar_field(
                    base_value.get(field) if isinstance(base_value, dict) and base_value is not MISSING else MISSING,
                    left_value.get(field),
                    right_value.get(field),
                )
                continue
            merged[field] = self._merge_scalar(
                path + [field],
                base_value.get(field) if isinstance(base_value, dict) and base_value is not MISSING else MISSING,
                left_value.get(field),
                right_value.get(field),
                item_type=item_type,
            )

        for field in descriptor.get("set_lists", []):
            merged[field] = _merge_set_values(
                base_value.get(field, []) if isinstance(base_value, dict) and base_value is not MISSING else [],
                left_value.get(field, []),
                right_value.get(field, []),
            )

        for field, child_type in descriptor.get("objects", {}).items():
            base_child = base_value.get(field) if isinstance(base_value, dict) and base_value is not MISSING else MISSING
            left_child = left_value.get(field) if isinstance(left_value, dict) else {}
            right_child = right_value.get(field) if isinstance(right_value, dict) else {}
            if not isinstance(left_child, dict):
                left_child = {}
            if not isinstance(right_child, dict):
                right_child = {}
            if base_child is not MISSING and not isinstance(base_child, dict):
                base_child = {}
            if base_child is MISSING and not left_child and not right_child:
                continue
            merged[field] = self._merge_object(
                child_type,
                path + [field],
                base_child,
                left_child,
                right_child,
                match_source=field,
                base_trust=base_trust,
                left_trust=left_trust,
                right_trust=right_trust,
            )

        for field, child_type in descriptor.get("lists", {}).items():
            merged[field] = self._merge_list(
                child_type,
                path + [field],
                base_value.get(field, []) if isinstance(base_value, dict) and base_value is not MISSING else [],
                left_value.get(field, []),
                right_value.get(field, []),
                base_trust=base_trust,
                left_trust=left_trust,
                right_trust=right_trust,
            )
        return merged

    def _needs_object_conflict(self, item_type: str, left_value: dict, right_value: dict) -> bool:
        descriptor = DESCRIPTORS[item_type]
        for field in descriptor.get("scalars", []):
            if field in INTERNAL_SCALAR_FIELDS:
                continue
            left_field = left_value.get(field)
            right_field = right_value.get(field)
            if _value_equal(left_field, right_field):
                continue
            if _is_empty(left_field) or _is_empty(right_field):
                continue
            return True
        for field in descriptor.get("set_lists", []):
            if sorted(left_value.get(field, [])) != sorted(right_value.get(field, [])):
                return True
        for field, child_type in descriptor.get("lists", {}).items():
            left_items = left_value.get(field, [])
            right_items = right_value.get(field, [])
            if len(left_items) != len(right_items):
                return True
            for left_item, right_item in zip(left_items, right_items):
                if self._needs_object_conflict(child_type, left_item, right_item):
                    return True
        return False

    def _resolve_object_conflict(self, item_type: str, path: list[str], left_value: dict, right_value: dict) -> dict:
        conflict_id = self._next_conflict_id(path + ["object"])
        resolution = self.resolutions.get(conflict_id)
        choice = _resolution_choice(resolution)
        if choice == "right":
            return _copy(right_value)
        if choice == "left":
            return _copy(left_value)
        self.conflicts.append(
            {
                "id": conflict_id,
                "kind": "object",
                "item_type": item_type,
                "path": ".".join(path),
                "label": f"{collection_label(item_type)}存在同名不同义冲突",
                "left_value": left_value,
                "right_value": right_value,
                "resolution_options": ["left", "right"],
            }
        )
        return _copy(left_value)

    def _merge_scalar(
        self,
        path: list[str],
        base_value: Any,
        left_value: Any,
        right_value: Any,
        *,
        item_type: str,
    ) -> Any:
        if _value_equal(left_value, right_value):
            self.auto_merged_count += 1
            return _copy(left_value)

        if self.mode == "3way":
            if base_value is not MISSING and _value_equal(left_value, base_value):
                self.auto_merged_count += 1
                return _copy(right_value)
            if base_value is not MISSING and _value_equal(right_value, base_value):
                self.auto_merged_count += 1
                return _copy(left_value)

        if _is_empty(left_value) and not _is_empty(right_value):
            self.auto_merged_count += 1
            return _copy(right_value)
        if _is_empty(right_value) and not _is_empty(left_value):
            self.auto_merged_count += 1
            return _copy(left_value)

        conflict_id = self._next_conflict_id(path)
        resolution = self.resolutions.get(conflict_id)
        choice = _resolution_choice(resolution)
        if choice == "left":
            return _copy(left_value)
        if choice == "right":
            return _copy(right_value)
        if choice == "custom":
            return _copy((resolution or {}).get("custom_value"))

        self.conflicts.append(
            {
                "id": conflict_id,
                "kind": "field",
                "item_type": item_type,
                "path": ".".join(path),
                "field": path[-1],
                "label": f"{'.'.join(path)} 字段冲突",
                "left_value": left_value,
                "right_value": right_value,
                "resolution_options": ["left", "right", "custom"],
            }
        )
        return _copy(left_value)

    def _merge_list(
        self,
        item_type: str,
        path: list[str],
        base_items: list[dict],
        left_items: list[dict],
        right_items: list[dict],
        *,
        base_trust: bool,
        left_trust: bool,
        right_trust: bool,
    ) -> list[dict]:
        ordered_keys = self._ordered_keys(item_type, base_items, left_items, right_items, base_trust, left_trust, right_trust)
        base_groups = self._group_items(item_type, base_items, base_trust)
        left_groups = self._group_items(item_type, left_items, left_trust)
        right_groups = self._group_items(item_type, right_items, right_trust)

        merged_items: list[dict] = []
        for key in ordered_keys:
            base_group = list(base_groups.get(key, []))
            left_group = list(left_groups.get(key, []))
            right_group = list(right_groups.get(key, []))
            max_len = max(len(base_group), len(left_group), len(right_group))
            for index in range(max_len):
                base_item = base_group[index] if index < len(base_group) else MISSING
                left_item = left_group[index] if index < len(left_group) else MISSING
                right_item = right_group[index] if index < len(right_group) else MISSING
                match_source = key[0]

                if left_item is MISSING and right_item is MISSING:
                    continue
                if left_item is MISSING:
                    if self.mode == "3way" and base_item is not MISSING:
                        if self._needs_delete_modify_conflict(item_type, base_item, right_item):
                            merged_items.append(self._resolve_delete_modify_conflict(item_type, path, "left_deleted", base_item, right_item))
                        elif not self._item_changed(base_item, right_item):
                            continue
                        else:
                            continue
                    else:
                        merged_items.append(_copy(right_item))
                        self.auto_merged_count += 1
                    continue
                if right_item is MISSING:
                    if self.mode == "3way" and base_item is not MISSING:
                        if self._needs_delete_modify_conflict(item_type, base_item, left_item):
                            merged_items.append(self._resolve_delete_modify_conflict(item_type, path, "right_deleted", base_item, left_item))
                        elif not self._item_changed(base_item, left_item):
                            continue
                        else:
                            continue
                    else:
                        merged_items.append(_copy(left_item))
                        self.auto_merged_count += 1
                    continue

                if base_item is MISSING and self.mode == "combine" and match_source == "name" and self._needs_object_conflict(item_type, left_item, right_item):
                    resolution = self._resolve_duplicate_conflict(item_type, path, left_item, right_item)
                    if isinstance(resolution, list):
                        merged_items.extend(resolution)
                    else:
                        merged_items.append(resolution)
                    continue

                merged_items.append(
                    self._merge_object(
                        item_type,
                        path + [self._item_path_token(item_type, left_item, index)],
                        base_item,
                        left_item,
                        right_item,
                        match_source=match_source,
                        base_trust=base_trust,
                        left_trust=left_trust,
                        right_trust=right_trust,
                    )
                )
        return merged_items

    def _resolve_duplicate_conflict(self, item_type: str, path: list[str], left_item: dict, right_item: dict) -> dict | list[dict]:
        if _semantic_duplicate_equal(left_item, right_item):
            return _copy(left_item)
        conflict_id = self._next_conflict_id(path + [self._item_path_token(item_type, left_item, 0), "duplicate"])
        resolution = self.resolutions.get(conflict_id)
        choice = _resolution_choice(resolution)
        if choice == "right":
            return _copy(right_item)
        if choice == "keep_both":
            return [_copy(left_item), _copy(right_item)]
        if choice == "left":
            return _copy(left_item)
        self.conflicts.append(
            {
                "id": conflict_id,
                "kind": "duplicate_object",
                "item_type": item_type,
                "path": ".".join(path),
                "label": f"{collection_label(item_type)}同名但内容不同",
                "left_value": left_item,
                "right_value": right_item,
                "resolution_options": ["left", "right", "keep_both"],
            }
        )
        return _copy(left_item)

    def _needs_delete_modify_conflict(self, item_type: str, base_item: dict, changed_item: dict) -> bool:
        if item_type == "language":
            return self._item_changed(base_item, changed_item)
        return self._item_changed(base_item, changed_item)

    def _resolve_delete_modify_conflict(
        self,
        item_type: str,
        path: list[str],
        reason: str,
        base_item: dict,
        changed_item: dict,
    ) -> dict:
        conflict_id = self._next_conflict_id(path + [self._item_path_token(item_type, changed_item, 0), reason])
        resolution = self.resolutions.get(conflict_id)
        choice = _resolution_choice(resolution)
        if choice == "left":
            return _copy(base_item)
        if choice == "right":
            return _copy(changed_item)
        self.conflicts.append(
            {
                "id": conflict_id,
                "kind": "delete_modify",
                "item_type": item_type,
                "path": ".".join(path),
                "label": f"{collection_label(item_type)}出现删改冲突",
                "left_value": base_item,
                "right_value": changed_item,
                "resolution_options": ["left", "right"],
            }
        )
        return _copy(changed_item)

    def _item_changed(self, base_item: dict, candidate_item: dict) -> bool:
        if base_item is MISSING or candidate_item is MISSING:
            return True
        ignored_fields = {"uid", *INTERNAL_SCALAR_FIELDS}
        comparable_base = {key: value for key, value in base_item.items() if key not in ignored_fields}
        comparable_candidate = {key: value for key, value in candidate_item.items() if key not in ignored_fields}
        return comparable_base != comparable_candidate

    def _group_items(self, item_type: str, items: list[dict], trust_identity: bool) -> dict[tuple[str, str], list[dict]]:
        groups: dict[tuple[str, str], list[dict]] = {}
        for item in items or []:
            if not isinstance(item, dict):
                continue
            key = self._item_key(item_type, item, trust_identity)
            groups.setdefault(key, []).append(item)
        return groups

    def _ordered_keys(
        self,
        item_type: str,
        base_items: list[dict],
        left_items: list[dict],
        right_items: list[dict],
        base_trust: bool,
        left_trust: bool,
        right_trust: bool,
    ) -> list[tuple[str, str]]:
        base_keys = [self._item_key(item_type, item, base_trust) for item in base_items]
        left_keys = [self._item_key(item_type, item, left_trust) for item in left_items]
        right_keys = [self._item_key(item_type, item, right_trust) for item in right_items]

        if self.mode == "3way":
            left_changed = left_keys != base_keys
            right_changed = right_keys != base_keys
            if left_changed and not right_changed:
                ordered = list(left_keys)
            elif right_changed and not left_changed:
                ordered = list(right_keys)
            else:
                ordered = list(left_keys) if left_changed else list(base_keys)
            # 追加对方新增的项（本方的排序中不包含对方独有的 key）
            for key in right_keys:
                if key not in ordered:
                    ordered.append(key)
            for key in left_keys:
                if key not in ordered:
                    ordered.append(key)
            return ordered

        # combine mode: left → right → base
        ordered: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for item, trust in [*[(item, left_trust) for item in left_items], *[(item, right_trust) for item in right_items], *[(item, base_trust) for item in base_items]]:
            key = self._item_key(item_type, item, trust)
            if key in seen:
                continue
            seen.add(key)
            ordered.append(key)
        return ordered

    def _item_key(self, item_type: str, item: dict, trust_identity: bool) -> tuple[str, str]:
        uid = str(item.get("uid", "")).strip()
        item_semantic_key = semantic_key(item_type, item)
        if self.mode == "combine" and item_type in SEMANTIC_UNIQUE_IN_COMBINE and item_semantic_key:
            return ("name", item_semantic_key)
        # uid随机、无确定性名称的类型只能用语义key匹配（如relation）
        if item_type in SEMANTIC_KEY_ONLY_TYPES and item_semantic_key:
            return ("name", item_semantic_key)
        if trust_identity and uid:
            return ("uid", uid)
        return ("name", item_semantic_key)

    def _item_path_token(self, item_type: str, item: dict, index: int) -> str:
        label = item.get("name") or item.get("term") or item.get("id") or item.get("uid") or str(index)
        return f"{item_type}:{label}"

    def _next_conflict_id(self, path: list[str]) -> str:
        token = "::".join(path)
        return f"conflict::{token}"


def analyze_merge(mode: str, left_document: dict, right_document: dict, base_document: dict | None = None) -> dict:
    if mode not in {"combine", "3way"}:
        raise ValueError("merge mode must be 'combine' or '3way'")
    engine = MergeEngine(mode)
    return engine.analyze(left_document, right_document, base_document)


def apply_merge(
    mode: str,
    left_document: dict,
    right_document: dict,
    *,
    base_document: dict | None = None,
    resolutions: dict[str, dict] | None = None,
) -> dict:
    if mode not in {"combine", "3way"}:
        raise ValueError("merge mode must be 'combine' or '3way'")
    engine = MergeEngine(mode, resolutions=resolutions)
    return engine.analyze(left_document, right_document, base_document)


def repair_document_consistency(document: dict) -> tuple[dict, list[dict]]:
    doc = canonical_document(document)
    repairs: list[dict] = []

    def add_repair(kind: str, path: str, action: str) -> None:
        repairs.append({"kind": kind, "path": path, "action": action})

    role_uids = {str(role.get("uid", "")).strip() for role in doc.get("roles", [])}
    stage_uids = {str(stage.get("uid", "")).strip() for stage in doc.get("stages", [])}
    process_uids = {str(process.get("uid", "")).strip() for process in doc.get("processes", [])}
    entity_uids = {str(entity.get("uid", "")).strip() for entity in doc.get("entities", [])}

    stage_links = []
    for link in doc.get("stageLinks", []):
        from_stage_uid = str(link.get("fromStageUid", "")).strip()
        to_stage_uid = str(link.get("toStageUid", "")).strip()
        if from_stage_uid and to_stage_uid and from_stage_uid in stage_uids and to_stage_uid in stage_uids:
            stage_links.append(link)
        else:
            add_repair("stage_link", f"stageLinks.{link.get('uid', '')}", "remove dangling stage link")
    doc["stageLinks"] = stage_links

    for stage in doc.get("stages", []):
        next_links = []
        stage_uid = str(stage.get("uid", "")).strip()
        stage_process_uids = {
            str(process.get("uid", "")).strip()
            for process in doc.get("processes", [])
            if str(process.get("stageUid", "")).strip() == stage_uid
        }
        for link in stage.get("processLinks", []):
            from_process_uid = str(link.get("fromProcessUid", "")).strip()
            to_process_uid = str(link.get("toProcessUid", "")).strip()
            if (
                from_process_uid
                and to_process_uid
                and from_process_uid in process_uids
                and to_process_uid in process_uids
                and (not stage_process_uids or (from_process_uid in stage_process_uids and to_process_uid in stage_process_uids))
            ):
                next_links.append(link)
            else:
                add_repair("stage_process_link", f"stages.{stage_uid}.processLinks.{link.get('uid', '')}", "remove dangling process link")
        stage["processLinks"] = next_links

    stage_flow_refs = []
    for ref in doc.get("stageFlowRefs", []):
        ref_uid = str(ref.get("uid", "")).strip()
        stage_uid = str(ref.get("stageUid", "")).strip()
        process_uid = str(ref.get("processUid", "")).strip()
        if stage_uid in stage_uids and process_uid in process_uids:
            stage_flow_refs.append(ref)
        else:
            add_repair("stage_flow_ref", f"stageFlowRefs.{ref_uid}", "remove dangling stage flow ref")
    doc["stageFlowRefs"] = stage_flow_refs

    # 去重：按 (stageUid, processUid) 保留第一条，修复因合并冲突或前端 bug 产生的重复 ref
    deduped_refs = []
    seen_pairs = set()
    for ref in doc.get("stageFlowRefs", []):
        pair = (str(ref.get("stageUid", "")).strip(), str(ref.get("processUid", "")).strip())
        if pair in seen_pairs:
            add_repair("stage_flow_ref", f"stageFlowRefs.{ref.get('uid', '')}", "remove duplicate stage flow ref")
            continue
        seen_pairs.add(pair)
        deduped_refs.append(ref)
    doc["stageFlowRefs"] = deduped_refs

    stage_flow_ref_by_uid = {
        str(ref.get("uid", "")).strip(): ref
        for ref in doc.get("stageFlowRefs", [])
        if str(ref.get("uid", "")).strip()
    }
    stage_flow_links = []
    for link in doc.get("stageFlowLinks", []):
        link_uid = str(link.get("uid", "")).strip()
        from_ref_uid = str(link.get("fromRefUid", "")).strip()
        to_ref_uid = str(link.get("toRefUid", "")).strip()
        from_ref = stage_flow_ref_by_uid.get(from_ref_uid)
        to_ref = stage_flow_ref_by_uid.get(to_ref_uid)
        if not from_ref or not to_ref:
            add_repair("stage_flow_link", f"stageFlowLinks.{link_uid}", "remove dangling stage flow link")
            continue
        from_stage_uid = str(from_ref.get("stageUid", "")).strip()
        to_stage_uid = str(to_ref.get("stageUid", "")).strip()
        if from_stage_uid != to_stage_uid:
            add_repair("stage_flow_link", f"stageFlowLinks.{link_uid}", "remove cross-stage flow link")
            continue
        if link.get("stageUid") != from_stage_uid:
            link["stageUid"] = from_stage_uid
            add_repair("stage_flow_link", f"stageFlowLinks.{link_uid}.stageUid", "realign stage flow link owner")
        stage_flow_links.append(link)
    doc["stageFlowLinks"] = stage_flow_links

    relations = []
    for relation in doc.get("relations", []):
        relation_from = str(relation.get("from", "")).strip()
        relation_to = str(relation.get("to", "")).strip()
        if relation_from in entity_uids and relation_to in entity_uids:
            relations.append(relation)
        else:
            add_repair("relation", f"relations.{relation.get('uid', '')}", "remove dangling entity relation")
    doc["relations"] = relations

    for process in doc.get("processes", []):
        process_uid = str(process.get("uid", "")).strip()
        for node in process.get("nodes", []):
            node_uid = str(node.get("uid", "")).strip()
            next_role_uids = []
            for role_uid in node.get("role_uids", []):
                normalized = str(role_uid or "").strip()
                if normalized in role_uids:
                    next_role_uids.append(normalized)
                elif normalized:
                    add_repair("node_role", f"processes.{process_uid}.nodes.{node_uid}.role_uids", "remove dangling role reference")
            node["role_uids"] = next_role_uids
            if str(node.get("role_uid", "")).strip() and str(node.get("role_uid", "")).strip() not in role_uids:
                node["role_uid"] = ""
                node["role"] = ""
                add_repair("node_role", f"processes.{process_uid}.nodes.{node_uid}.role_uid", "clear dangling role reference")

            entity_ops = []
            for entity_op in node.get("entity_ops", []):
                entity_uid = str(entity_op.get("entity_uid", "")).strip()
                if entity_uid in entity_uids:
                    entity_ops.append(entity_op)
                elif entity_uid:
                    add_repair("entity_op", f"processes.{process_uid}.nodes.{node_uid}.entity_ops", "remove dangling entity op")
            node["entity_ops"] = entity_ops

            for form in node.get("forms", []):
                form_uid = str(form.get("uid", "")).strip()
                if str(form.get("entity_uid", "")).strip() and str(form.get("entity_uid", "")).strip() not in entity_uids:
                    form["entity_uid"] = ""
                    add_repair("form_entity", f"processes.{process_uid}.nodes.{node_uid}.forms.{form_uid}.entity_uid", "clear dangling form entity")
                for section in form.get("sections", []):
                    section_uid = str(section.get("uid", "")).strip()
                    if str(section.get("entity_uid", "")).strip() and str(section.get("entity_uid", "")).strip() not in entity_uids:
                        section["entity_uid"] = ""
                        add_repair("form_entity", f"processes.{process_uid}.nodes.{node_uid}.forms.{form_uid}.sections.{section_uid}.entity_uid", "clear dangling form section entity")

    valid_applies_to = set()
    for collection in RULE_APPLIES_TO_COLLECTIONS:
        for item in doc.get(collection, []):
            if isinstance(item, dict):
                valid_applies_to.update(_reference_tokens(item))
    for process in doc.get("processes", []):
        for node in process.get("nodes", []):
            if isinstance(node, dict):
                valid_applies_to.update(_reference_tokens(node))
    for rule in doc.get("rules", []):
        applies_to = str(rule.get("appliesToUid", "")).strip()
        if applies_to and applies_to not in valid_applies_to:
            rule["appliesToUid"] = ""
            add_repair("rule_applies_to", f"rules.{rule.get('uid', '')}.appliesToUid", "clear dangling rule target")

    return doc, repairs


def validate_document(document: dict) -> list[dict]:
    doc = canonical_document(document)
    issues: list[dict] = []

    def add_issue(path: str, message: str, level: str = "error") -> None:
        issues.append({"level": level, "path": path, "message": message})

    def duplicate_uid_issues(items: list[dict], item_type: str, path_prefix: str, scope_label: str = "") -> None:
        seen: set[str] = set()
        for item in items or []:
            if not isinstance(item, dict):
                continue
            uid = str(item.get("uid", "")).strip()
            if not uid:
                add_issue(f"{path_prefix}.missingUid", f"{collection_label(item_type)}缺少 UID")
                continue
            if uid in seen:
                suffix = f"（{scope_label}）" if scope_label else ""
                add_issue(f"{path_prefix}.{uid}.uid", f"{collection_label(item_type)} UID 重复{suffix}: {uid}")
            seen.add(uid)

    role_uids = {str(role.get("uid", "")).strip() for role in doc.get("roles", []) if isinstance(role, dict)}
    stage_uids = {str(stage.get("uid", "")).strip() for stage in doc.get("stages", []) if isinstance(stage, dict)}
    process_uids = {str(process.get("uid", "")).strip() for process in doc.get("processes", []) if isinstance(process, dict)}
    entity_uids = {str(entity.get("uid", "")).strip() for entity in doc.get("entities", []) if isinstance(entity, dict)}

    duplicate_uid_issues(doc.get("roles", []), "role", "roles")
    duplicate_uid_issues(doc.get("stages", []), "stage", "stages")
    duplicate_uid_issues(doc.get("processes", []), "process", "processes")
    duplicate_uid_issues(doc.get("entities", []), "entity", "entities")
    duplicate_uid_issues(doc.get("rules", []), "rule", "rules")
    duplicate_uid_issues(doc.get("businessComponents", []), "business_component", "businessComponents")
    duplicate_uid_issues(doc.get("businessConstructs", []), "business_construct", "businessConstructs")
    duplicate_uid_issues(doc.get("taskDefinitions", []), "task_definition", "taskDefinitions")
    for process in doc.get("processes", []):
        if not isinstance(process, dict):
            continue
        process_uid = str(process.get("uid", "")).strip()
        duplicate_uid_issues(process.get("nodes", []), "node", f"processes.{process_uid}.nodes", process_uid)
        flow = process.get("flow") if isinstance(process.get("flow"), dict) else {}
        duplicate_uid_issues(flow.get("nodes", []), "stage_flow_ref", f"processes.{process_uid}.flow.nodes", process_uid)
        duplicate_uid_issues(flow.get("edges", []), "stage_flow_link", f"processes.{process_uid}.flow.edges", process_uid)

    for process in doc.get("processes", []):
        if not isinstance(process, dict):
            continue
        process_uid = str(process.get("uid", "")).strip()
        stage_uid = str(process.get("stageUid", "")).strip()
        if stage_uid and stage_uid not in stage_uids:
            add_issue(f"processes.{process_uid}.stageUid", f"流程 {process_uid} 引用了不存在的阶段 {stage_uid}")

    stage_member_processes: dict[str, set[str]] = {}
    stage_flow_refs = [ref for ref in doc.get("stageFlowRefs", []) if isinstance(ref, dict)]
    stage_flow_ref_by_uid = {str(ref.get("uid", "")).strip(): ref for ref in stage_flow_refs if str(ref.get("uid", "")).strip()}
    for ref in stage_flow_refs:
        ref_uid = str(ref.get("uid", "")).strip()
        stage_uid = str(ref.get("stageUid", "")).strip()
        process_uid = str(ref.get("processUid", "")).strip()
        if stage_uid and stage_uid not in stage_uids:
            add_issue(f"stageFlowRefs.{ref_uid}.stageUid", f"阶段流程引用 {ref_uid} 引用了不存在的阶段 {stage_uid}")
        if process_uid and process_uid not in process_uids:
            add_issue(f"stageFlowRefs.{ref_uid}.processUid", f"阶段流程引用 {ref_uid} 引用了不存在的流程 {process_uid}")
        if stage_uid and process_uid:
            stage_member_processes.setdefault(stage_uid, set()).add(process_uid)

    for stage in doc.get("stages", []):
        if not isinstance(stage, dict):
            continue
        stage_uid = str(stage.get("uid", "")).strip()
        members = stage_member_processes.get(stage_uid, set()) or {
            str(process.get("uid", "")).strip()
            for process in doc.get("processes", [])
            if isinstance(process, dict) and str(process.get("stageUid", "")).strip() == stage_uid
        }
        for link in stage.get("processLinks", []) if isinstance(stage.get("processLinks"), list) else []:
            if not isinstance(link, dict):
                continue
            from_process_uid = str(link.get("fromProcessUid", "")).strip()
            to_process_uid = str(link.get("toProcessUid", "")).strip()
            if from_process_uid and from_process_uid not in process_uids:
                add_issue(f"stages.{stage_uid}.processLinks.{link.get('uid', '')}.fromProcessUid", f"阶段 {stage_uid} 的流程连线引用了不存在的上游流程 {from_process_uid}")
            if to_process_uid and to_process_uid not in process_uids:
                add_issue(f"stages.{stage_uid}.processLinks.{link.get('uid', '')}.toProcessUid", f"阶段 {stage_uid} 的流程连线引用了不存在的下游流程 {to_process_uid}")
            if from_process_uid and members and from_process_uid not in members:
                add_issue(f"stages.{stage_uid}.processLinks.{link.get('uid', '')}.fromProcessUid", f"阶段 {stage_uid} 的流程连线引用了不属于本阶段的上游流程 {from_process_uid}")
            if to_process_uid and members and to_process_uid not in members:
                add_issue(f"stages.{stage_uid}.processLinks.{link.get('uid', '')}.toProcessUid", f"阶段 {stage_uid} 的流程连线引用了不属于本阶段的下游流程 {to_process_uid}")

    for stage_link in doc.get("stageLinks", []):
        if not isinstance(stage_link, dict):
            continue
        from_stage_uid = str(stage_link.get("fromStageUid", "")).strip()
        to_stage_uid = str(stage_link.get("toStageUid", "")).strip()
        if from_stage_uid and from_stage_uid not in stage_uids:
            add_issue(f"stageLinks.{stage_link.get('uid', '')}.fromStageUid", f"阶段连线引用了不存在的上游阶段 {from_stage_uid}")
        if to_stage_uid and to_stage_uid not in stage_uids:
            add_issue(f"stageLinks.{stage_link.get('uid', '')}.toStageUid", f"阶段连线引用了不存在的下游阶段 {to_stage_uid}")

    for stage_flow_link in doc.get("stageFlowLinks", []):
        if not isinstance(stage_flow_link, dict):
            continue
        link_uid = str(stage_flow_link.get("uid", "")).strip()
        stage_uid = str(stage_flow_link.get("stageUid", "")).strip()
        from_ref_uid = str(stage_flow_link.get("fromRefUid", "")).strip()
        to_ref_uid = str(stage_flow_link.get("toRefUid", "")).strip()
        if stage_uid and stage_uid not in stage_uids:
            add_issue(f"stageFlowLinks.{link_uid}.stageUid", f"阶段内流程连线引用了不存在的阶段 {stage_uid}")
        if from_ref_uid and from_ref_uid not in stage_flow_ref_by_uid:
            add_issue(f"stageFlowLinks.{link_uid}.fromRefUid", f"阶段内流程连线引用了不存在的上游流程引用 {from_ref_uid}")
        if to_ref_uid and to_ref_uid not in stage_flow_ref_by_uid:
            add_issue(f"stageFlowLinks.{link_uid}.toRefUid", f"阶段内流程连线引用了不存在的下游流程引用 {to_ref_uid}")
        from_ref = stage_flow_ref_by_uid.get(from_ref_uid)
        to_ref = stage_flow_ref_by_uid.get(to_ref_uid)
        if stage_uid and from_ref and str(from_ref.get("stageUid", "")).strip() != stage_uid:
            add_issue(f"stageFlowLinks.{link_uid}.fromRefUid", f"阶段内流程连线的上游引用不属于当前阶段 {from_ref_uid}")
        if stage_uid and to_ref and str(to_ref.get("stageUid", "")).strip() != stage_uid:
            add_issue(f"stageFlowLinks.{link_uid}.toRefUid", f"阶段内流程连线的下游引用不属于当前阶段 {to_ref_uid}")

    for process in doc.get("processes", []):
        if not isinstance(process, dict):
            continue
        process_uid = str(process.get("uid", "")).strip()
        for node in process.get("nodes", []) if isinstance(process.get("nodes"), list) else []:
            if not isinstance(node, dict):
                continue
            node_uid = str(node.get("uid", "")).strip()
            referenced_role_uids = []
            seen_role_uids = set()
            for role_uid in node.get("role_uids", []) if isinstance(node.get("role_uids"), list) else []:
                normalized_role_uid = str(role_uid or "").strip()
                if not normalized_role_uid or normalized_role_uid in seen_role_uids:
                    continue
                seen_role_uids.add(normalized_role_uid)
                referenced_role_uids.append(normalized_role_uid)
            role_uid = str(node.get("role_uid", "")).strip()
            if role_uid and role_uid not in seen_role_uids:
                referenced_role_uids.insert(0, role_uid)
            for index, role_uid in enumerate(referenced_role_uids):
                if role_uid not in role_uids:
                    add_issue(f"processes.{process_uid}.nodes.{node_uid}.role_uids.{index}", f"节点 {node_uid} 引用了不存在的角色 {role_uid}")
            for entity_op in node.get("entity_ops", []) if isinstance(node.get("entity_ops"), list) else []:
                entity_uid = str((entity_op or {}).get("entity_uid", "")).strip() if isinstance(entity_op, dict) else ""
                if entity_uid and entity_uid not in entity_uids:
                    add_issue(f"processes.{process_uid}.nodes.{node_uid}.entity_ops", f"节点 {node_uid} 引用了不存在的实体 {entity_uid}")
            for form in node.get("forms", []) if isinstance(node.get("forms"), list) else []:
                if not isinstance(form, dict):
                    continue
                form_uid = str(form.get("uid", "")).strip()
                form_entity_uid = str(form.get("entity_uid", "")).strip()
                if form_entity_uid and form_entity_uid not in entity_uids:
                    add_issue(f"processes.{process_uid}.nodes.{node_uid}.forms.{form_uid}.entity_uid", f"表单 {form_uid} 引用了不存在的实体 {form_entity_uid}")
                for section in form.get("sections", []) if isinstance(form.get("sections"), list) else []:
                    if not isinstance(section, dict):
                        continue
                    section_uid = str(section.get("uid", "")).strip()
                    section_entity_uid = str(section.get("entity_uid", "")).strip()
                    if section_entity_uid and section_entity_uid not in entity_uids:
                        add_issue(f"processes.{process_uid}.nodes.{node_uid}.forms.{form_uid}.sections.{section_uid}.entity_uid", f"表单分组 {section_uid} 引用了不存在的实体 {section_entity_uid}")

    for relation in doc.get("relations", []):
        if not isinstance(relation, dict):
            continue
        relation_from = str(relation.get("from", "")).strip()
        relation_to = str(relation.get("to", "")).strip()
        if relation_from and relation_from not in entity_uids:
            add_issue(f"relations.{relation.get('uid', '')}.from", f"实体关系引用了不存在的起点实体 {relation_from}")
        if relation_to and relation_to not in entity_uids:
            add_issue(f"relations.{relation.get('uid', '')}.to", f"实体关系引用了不存在的终点实体 {relation_to}")

    valid_applies_to = set()
    for collection in RULE_APPLIES_TO_COLLECTIONS:
        for item in doc.get(collection, []):
            if isinstance(item, dict):
                valid_applies_to.update(_reference_tokens(item))
    for process in doc.get("processes", []):
        for node in process.get("nodes", []) if isinstance(process.get("nodes"), list) else []:
            if isinstance(node, dict):
                valid_applies_to.update(_reference_tokens(node))
    for rule in doc.get("rules", []):
        if not isinstance(rule, dict):
            continue
        applies_to = str(rule.get("appliesToUid", "")).strip()
        if applies_to and applies_to not in valid_applies_to:
            add_issue(f"rules.{rule.get('uid', '')}.appliesToUid", f"规则 {rule.get('name', '') or rule.get('uid', '')} 的 appliesToUid 引用了不存在的对象 {applies_to}", "warning")

    return issues
