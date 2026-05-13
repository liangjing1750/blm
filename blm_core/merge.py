from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any
from uuid import uuid4

from blm_core.document import SCHEMA_VERSION, migrate_document, renumber_document_ids
from blm_core.model_strategy import (
    DESCRIPTORS,
    RULE_APPLIES_TO_COLLECTIONS,
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


def _reference_tokens(item: dict) -> set[str]:
    tokens = set()
    for key in ("uid", "id", "name"):
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
    return migrate_document(raw), _should_trust_identity(raw)


def _merge_set_values(base_value: Any, left_value: Any, right_value: Any) -> list[Any]:
    result = []
    seen = set()
    for source in (base_value or [], left_value or [], right_value or []):
        for item in source:
            key = str(item)
            if key in seen:
                continue
            seen.add(key)
            result.append(item)
    return result


def _merge_panorama_item(existing: dict, candidate: dict) -> dict:
    for field in ("uid", "id", "name", "badge", "scope", "note", "status", "text"):
        if _is_empty(existing.get(field)) and not _is_empty(candidate.get(field)):
            existing[field] = _copy(candidate.get(field))
    return existing


def _panorama_item_key(item: dict) -> str:
    name_key = _normalize_name(item.get("name"))
    if name_key:
        return f"name:{name_key}"
    id_key = _normalize_name(item.get("id"))
    if id_key:
        return f"id:{id_key}"
    return f"uid:{_normalize_name(item.get('uid'))}"


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
        if self.mode == "combine":
            left = MergeInput(renumber_document_ids(left.document, "L"), False)
            right = MergeInput(renumber_document_ids(right.document, "R"), False)

        merged = self._merge_document(base, left, right)
        merged = migrate_document(merged)
        if self.mode == "combine":
            merged = renumber_document_ids(merged)
        merged, self.consistency_repairs = repair_document_consistency(merged)
        self.validation_issues = validate_document(merged)

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
        sources = [
            ("left", left_document.get("panorama", {})),
            ("right", right_document.get("panorama", {})),
            ("base", base_document.get("panorama", {})),
        ]
        if not any(isinstance(panorama, dict) and panorama for _, panorama in sources):
            return {}, {}

        maps: dict[str, dict[str, dict[str, str]]] = {
            "left": {"columns": {}, "lanes": {}},
            "right": {"columns": {}, "lanes": {}},
            "base": {"columns": {}, "lanes": {}},
        }

        def merge_axis(axis: str) -> list[dict]:
            by_key: dict[str, dict] = {}
            ordered: list[dict] = []
            for source_name, panorama in sources:
                for item in (panorama.get(axis, []) if isinstance(panorama, dict) else []):
                    if not isinstance(item, dict):
                        continue
                    key = _panorama_item_key(item)
                    if not key or key == "uid:":
                        continue
                    if key not in by_key:
                        by_key[key] = _copy(item)
                        ordered.append(by_key[key])
                    else:
                        _merge_panorama_item(by_key[key], item)
                    source_id = str(item.get("id", "")).strip()
                    target_id = str(by_key[key].get("id", "")).strip()
                    if source_id and target_id:
                        maps[source_name][axis][source_id] = target_id
            return ordered

        columns = merge_axis("columns")
        lanes = merge_axis("lanes")

        merged_cells: list[dict] = []
        cell_by_key: dict[tuple[str, str], dict] = {}
        for source_name, panorama in sources:
            if not isinstance(panorama, dict):
                continue
            column_map = maps[source_name]["columns"]
            lane_map = maps[source_name]["lanes"]
            for cell in panorama.get("cells", []):
                if not isinstance(cell, dict):
                    continue
                column_id = column_map.get(str(cell.get("columnId", "")).strip(), str(cell.get("columnId", "")).strip())
                lane_id = lane_map.get(str(cell.get("laneId", "")).strip(), str(cell.get("laneId", "")).strip())
                if not column_id or not lane_id:
                    continue
                key = (lane_id, column_id)
                normalized_cell = _copy(cell)
                normalized_cell["columnId"] = column_id
                normalized_cell["laneId"] = lane_id
                if key not in cell_by_key:
                    cell_by_key[key] = normalized_cell
                    merged_cells.append(normalized_cell)
                else:
                    _merge_panorama_item(cell_by_key[key], normalized_cell)

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
            column_id = str(stage.get("panoramaColumnId", "")).strip()
            lane_id = str(stage.get("panoramaLaneId", "")).strip()
            if column_id in column_map:
                stage["panoramaColumnId"] = column_map[column_id]
            if lane_id in lane_map:
                stage["panoramaLaneId"] = lane_map[lane_id]

        for role in result.get("roles", []):
            if not isinstance(role, dict):
                continue
            lane_id = str(role.get("panoramaLaneId", "") or role.get("businessDomainId", "")).strip()
            if lane_id in lane_map:
                if "panoramaLaneId" in role:
                    role["panoramaLaneId"] = lane_map[lane_id]
                if "businessDomainId" in role:
                    role["businessDomainId"] = lane_map[lane_id]

        panorama = result.get("panorama")
        if isinstance(panorama, dict):
            for cell in panorama.get("cells", []):
                if not isinstance(cell, dict):
                    continue
                column_id = str(cell.get("columnId", "")).strip()
                lane_id = str(cell.get("laneId", "")).strip()
                if column_id in column_map:
                    cell["columnId"] = column_map[column_id]
                if lane_id in lane_map:
                    cell["laneId"] = lane_map[lane_id]
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

        left_uid = left_value.get("uid") if isinstance(left_value, dict) else ""
        right_uid = right_value.get("uid") if isinstance(right_value, dict) else ""
        base_uid = base_value.get("uid") if isinstance(base_value, dict) else ""
        merged["uid"] = str(left_uid or right_uid or base_uid or uuid4().hex)

        if self.mode == "combine" and match_source == "name" and base_value is MISSING:
            if self._needs_object_conflict(item_type, left_value, right_value):
                return self._resolve_object_conflict(item_type, path, left_value, right_value)

        for field in descriptor.get("scalars", []):
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
        comparable_base = {key: value for key, value in base_item.items() if key != "uid"}
        comparable_candidate = {key: value for key, value in candidate_item.items() if key != "uid"}
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
    doc = migrate_document(document)
    repairs: list[dict] = []

    def add_repair(kind: str, path: str, action: str) -> None:
        repairs.append({"kind": kind, "path": path, "action": action})

    role_ids = {str(role.get("id", "")).strip() for role in doc.get("roles", [])}
    stage_ids = {str(stage.get("id", "")).strip() for stage in doc.get("stages", [])}
    process_ids = {str(process.get("id", "")).strip() for process in doc.get("processes", [])}
    entity_ids = {str(entity.get("id", "")).strip() for entity in doc.get("entities", [])}

    stage_links = []
    for link in doc.get("stageLinks", []):
        from_stage_id = str(link.get("fromStageId", "")).strip()
        to_stage_id = str(link.get("toStageId", "")).strip()
        if from_stage_id and to_stage_id and from_stage_id in stage_ids and to_stage_id in stage_ids:
            stage_links.append(link)
        else:
            add_repair("stage_link", f"stageLinks.{link.get('uid', '')}", "remove dangling stage link")
    doc["stageLinks"] = stage_links

    for stage in doc.get("stages", []):
        next_links = []
        stage_id = str(stage.get("id", "")).strip()
        stage_process_ids = {
            str(process.get("id", "")).strip()
            for process in doc.get("processes", [])
            if str(process.get("stageId", "")).strip() == stage_id
        }
        for link in stage.get("processLinks", []):
            from_process_id = str(link.get("fromProcessId", "")).strip()
            to_process_id = str(link.get("toProcessId", "")).strip()
            if (
                from_process_id
                and to_process_id
                and from_process_id in process_ids
                and to_process_id in process_ids
                and (not stage_process_ids or (from_process_id in stage_process_ids and to_process_id in stage_process_ids))
            ):
                next_links.append(link)
            else:
                add_repair("stage_process_link", f"stages.{stage_id}.processLinks.{link.get('uid', '')}", "remove dangling process link")
        stage["processLinks"] = next_links

    stage_flow_refs = []
    for ref in doc.get("stageFlowRefs", []):
        ref_id = str(ref.get("id", "")).strip()
        stage_id = str(ref.get("stageId", "")).strip()
        process_id = str(ref.get("processId", "")).strip()
        if stage_id in stage_ids and process_id in process_ids:
            stage_flow_refs.append(ref)
        else:
            add_repair("stage_flow_ref", f"stageFlowRefs.{ref_id}", "remove dangling stage flow ref")
    doc["stageFlowRefs"] = stage_flow_refs

    stage_flow_ref_by_id = {
        str(ref.get("id", "")).strip(): ref
        for ref in doc.get("stageFlowRefs", [])
        if str(ref.get("id", "")).strip()
    }
    stage_flow_links = []
    for link in doc.get("stageFlowLinks", []):
        link_id = str(link.get("id", "")).strip() or str(link.get("uid", "")).strip()
        from_ref_id = str(link.get("fromRefId", "")).strip()
        to_ref_id = str(link.get("toRefId", "")).strip()
        from_ref = stage_flow_ref_by_id.get(from_ref_id)
        to_ref = stage_flow_ref_by_id.get(to_ref_id)
        if not from_ref or not to_ref:
            add_repair("stage_flow_link", f"stageFlowLinks.{link_id}", "remove dangling stage flow link")
            continue
        from_stage_id = str(from_ref.get("stageId", "")).strip()
        to_stage_id = str(to_ref.get("stageId", "")).strip()
        if from_stage_id != to_stage_id:
            add_repair("stage_flow_link", f"stageFlowLinks.{link_id}", "remove cross-stage flow link")
            continue
        if link.get("stageId") != from_stage_id:
            link["stageId"] = from_stage_id
            add_repair("stage_flow_link", f"stageFlowLinks.{link_id}.stageId", "realign stage flow link owner")
        stage_flow_links.append(link)
    doc["stageFlowLinks"] = stage_flow_links

    relations = []
    for relation in doc.get("relations", []):
        relation_from = str(relation.get("from", "")).strip()
        relation_to = str(relation.get("to", "")).strip()
        if relation_from in entity_ids and relation_to in entity_ids:
            relations.append(relation)
        else:
            add_repair("relation", f"relations.{relation.get('uid', '')}", "remove dangling entity relation")
    doc["relations"] = relations

    for process in doc.get("processes", []):
        process_id = str(process.get("id", "")).strip()
        for node in process.get("nodes", []):
            node_id = str(node.get("id", "")).strip()
            next_role_ids = []
            for role_id in node.get("role_ids", []):
                normalized = str(role_id or "").strip()
                if normalized in role_ids:
                    next_role_ids.append(normalized)
                elif normalized:
                    add_repair("node_role", f"processes.{process_id}.nodes.{node_id}.role_ids", "remove dangling role reference")
            node["role_ids"] = next_role_ids
            node["roles"] = [role_id for role_id in node.get("roles", []) if str(role_id or "").strip() in role_ids]
            if str(node.get("role_id", "")).strip() and str(node.get("role_id", "")).strip() not in role_ids:
                node["role_id"] = ""
                node["role"] = ""
                add_repair("node_role", f"processes.{process_id}.nodes.{node_id}.role_id", "clear dangling role reference")

            entity_ops = []
            for entity_op in node.get("entity_ops", []):
                entity_id = str(entity_op.get("entity_id", "")).strip()
                if entity_id in entity_ids:
                    entity_ops.append(entity_op)
                elif entity_id:
                    add_repair("entity_op", f"processes.{process_id}.nodes.{node_id}.entity_ops", "remove dangling entity op")
            node["entity_ops"] = entity_ops

            for form in node.get("forms", []):
                form_id = str(form.get("id", "")).strip()
                if str(form.get("entity_id", "")).strip() and str(form.get("entity_id", "")).strip() not in entity_ids:
                    form["entity_id"] = ""
                    add_repair("form_entity", f"processes.{process_id}.nodes.{node_id}.forms.{form_id}.entity_id", "clear dangling form entity")
                for section in form.get("sections", []):
                    section_id = str(section.get("id", "")).strip()
                    if str(section.get("entity_id", "")).strip() and str(section.get("entity_id", "")).strip() not in entity_ids:
                        section["entity_id"] = ""
                        add_repair("form_entity", f"processes.{process_id}.nodes.{node_id}.forms.{form_id}.sections.{section_id}.entity_id", "clear dangling form section entity")

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
        applies_to = str(rule.get("applies_to", "")).strip()
        if applies_to and applies_to not in valid_applies_to:
            rule["applies_to"] = ""
            add_repair("rule_applies_to", f"rules.{rule.get('uid', '')}.applies_to", "clear dangling rule target")

    return doc, repairs


def validate_document(document: dict) -> list[dict]:
    doc = migrate_document(document)
    issues: list[dict] = []

    def add_duplicate_id_issues(items: list[dict], item_type: str, path_prefix: str, scope_label: str = "") -> None:
        seen: dict[str, dict] = {}
        for item in items or []:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id", "")).strip()
            if not item_id:
                continue
            if item_id in seen:
                suffix = f"（{scope_label}）" if scope_label else ""
                issues.append(
                    {
                        "level": "error",
                        "path": f"{path_prefix}.{item_id}.id",
                        "message": f"{collection_label(item_type)}业务ID重复{suffix}: {item_id}",
                    }
                )
            else:
                seen[item_id] = item

    role_ids = {role["id"] for role in doc.get("roles", [])}
    stage_ids = {stage["id"] for stage in doc.get("stages", [])}
    entity_ids = {entity["id"] for entity in doc.get("entities", [])}
    process_ids = {process["id"] for process in doc.get("processes", [])}
    stage_flow_refs = doc.get("stageFlowRefs", [])
    stage_flow_ref_ids = {str(ref.get("id", "")).strip() for ref in stage_flow_refs}
    stage_flow_ref_by_id = {
        str(ref.get("id", "")).strip(): ref
        for ref in stage_flow_refs
        if str(ref.get("id", "")).strip()
    }
    node_ids = {node["id"] for process in doc.get("processes", []) for node in process.get("nodes", [])}

    add_duplicate_id_issues(doc.get("roles", []), "role", "roles")
    add_duplicate_id_issues(doc.get("stages", []), "stage", "stages")
    add_duplicate_id_issues(doc.get("processes", []), "process", "processes")
    add_duplicate_id_issues(doc.get("entities", []), "entity", "entities")
    add_duplicate_id_issues(doc.get("rules", []), "rule", "rules")
    add_duplicate_id_issues(doc.get("businessComponents", []), "business_component", "businessComponents")
    add_duplicate_id_issues(doc.get("businessConstructs", []), "business_construct", "businessConstructs")
    add_duplicate_id_issues(doc.get("taskDefinitions", []), "task_definition", "taskDefinitions")
    for process in doc.get("processes", []):
        process_id = str(process.get("id", "")).strip()
        add_duplicate_id_issues(process.get("nodes", []), "node", f"processes.{process_id}.nodes", process_id)
        flow = process.get("flow") if isinstance(process.get("flow"), dict) else {}
        add_duplicate_id_issues(flow.get("nodes", []), "stage_flow_ref", f"processes.{process_id}.flow.nodes", process_id)
        add_duplicate_id_issues(flow.get("edges", []), "stage_flow_link", f"processes.{process_id}.flow.edges", process_id)

    process_stage_map = {
        process["id"]: str(process.get("stageId", "")).strip()
        for process in doc.get("processes", [])
    }
    stage_process_ref_map: dict[str, set[str]] = {}

    for process in doc.get("processes", []):
        stage_id = str(process.get("stageId", "")).strip()
        if stage_id and stage_id not in stage_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"processes.{process['id']}.stageId",
                    "message": f"流程 {process['id']} 引用了不存在的业务阶段 {stage_id}",
                }
            )

    for stage_flow_ref in stage_flow_refs:
        ref_id = str(stage_flow_ref.get("id", "")).strip() or str(stage_flow_ref.get("uid", "")).strip()
        stage_id = str(stage_flow_ref.get("stageId", "")).strip()
        process_id = str(stage_flow_ref.get("processId", "")).strip()
        if stage_id and stage_id not in stage_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowRefs.{ref_id}.stageId",
                    "message": f"阶段流程引用 {ref_id} 引用了不存在的业务阶段 {stage_id}",
                }
            )
        if process_id and process_id not in process_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowRefs.{ref_id}.processId",
                    "message": f"阶段流程引用 {ref_id} 引用了不存在的流程 {process_id}",
                }
            )
        if stage_id and process_id:
            stage_process_ref_map.setdefault(stage_id, set()).add(process_id)

    for stage in doc.get("stages", []):
        stage_member_processes = stage_process_ref_map.get(stage["id"], set())
        if not stage_member_processes:
            stage_member_processes = {
                process_id
                for process_id, owner_stage_id in process_stage_map.items()
                if owner_stage_id == stage["id"]
            }
        for link in stage.get("processLinks", []):
            from_process_id = str(link.get("fromProcessId", "")).strip()
            to_process_id = str(link.get("toProcessId", "")).strip()
            if from_process_id and from_process_id not in process_ids:
                issues.append(
                    {
                        "level": "error",
                        "path": f"stages.{stage['id']}.processLinks.{link.get('uid', '')}.fromProcessId",
                        "message": f"业务阶段 {stage['id']} 的流程连线引用了不存在的流程 {from_process_id}",
                    }
                )
            if to_process_id and to_process_id not in process_ids:
                issues.append(
                    {
                        "level": "error",
                        "path": f"stages.{stage['id']}.processLinks.{link.get('uid', '')}.toProcessId",
                        "message": f"业务阶段 {stage['id']} 的流程连线引用了不存在的流程 {to_process_id}",
                    }
                )
            if from_process_id and from_process_id not in stage_member_processes:
                issues.append(
                    {
                        "level": "error",
                        "path": f"stages.{stage['id']}.processLinks.{link.get('uid', '')}.fromProcessId",
                        "message": f"业务阶段 {stage['id']} 的流程连线引用了不属于该阶段的流程 {from_process_id}",
                    }
                )
            if to_process_id and to_process_id not in stage_member_processes:
                issues.append(
                    {
                        "level": "error",
                        "path": f"stages.{stage['id']}.processLinks.{link.get('uid', '')}.toProcessId",
                        "message": f"业务阶段 {stage['id']} 的流程连线引用了不属于该阶段的流程 {to_process_id}",
                    }
                )

    for stage_link in doc.get("stageLinks", []):
        from_stage_id = str(stage_link.get("fromStageId", "")).strip()
        to_stage_id = str(stage_link.get("toStageId", "")).strip()
        if from_stage_id and from_stage_id not in stage_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageLinks.{stage_link.get('uid', '')}.fromStageId",
                    "message": f"业务阶段连线引用了不存在的起点阶段 {from_stage_id}",
                }
            )
        if to_stage_id and to_stage_id not in stage_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageLinks.{stage_link.get('uid', '')}.toStageId",
                    "message": f"业务阶段连线引用了不存在的终点阶段 {to_stage_id}",
                }
            )

    for stage_flow_link in doc.get("stageFlowLinks", []):
        link_id = str(stage_flow_link.get("id", "")).strip() or str(stage_flow_link.get("uid", "")).strip()
        stage_id = str(stage_flow_link.get("stageId", "")).strip()
        from_ref_id = str(stage_flow_link.get("fromRefId", "")).strip()
        to_ref_id = str(stage_flow_link.get("toRefId", "")).strip()
        if stage_id and stage_id not in stage_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowLinks.{link_id}.stageId",
                    "message": f"阶段流程引用连线引用了不存在的业务阶段 {stage_id}",
                }
            )
        if from_ref_id and from_ref_id not in stage_flow_ref_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowLinks.{link_id}.fromRefId",
                    "message": f"阶段流程引用连线引用了不存在的起点引用 {from_ref_id}",
                }
            )
        if to_ref_id and to_ref_id not in stage_flow_ref_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowLinks.{link_id}.toRefId",
                    "message": f"阶段流程引用连线引用了不存在的终点引用 {to_ref_id}",
                }
            )
        from_ref = stage_flow_ref_by_id.get(from_ref_id)
        to_ref = stage_flow_ref_by_id.get(to_ref_id)
        if stage_id and from_ref and str(from_ref.get("stageId", "")).strip() != stage_id:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowLinks.{link_id}.fromRefId",
                    "message": f"阶段流程引用连线引用了不属于该阶段的起点引用 {from_ref_id}",
                }
            )
        if stage_id and to_ref and str(to_ref.get("stageId", "")).strip() != stage_id:
            issues.append(
                {
                    "level": "error",
                    "path": f"stageFlowLinks.{link_id}.toRefId",
                    "message": f"阶段流程引用连线引用了不属于该阶段的终点引用 {to_ref_id}",
                }
            )

    for process in doc.get("processes", []):
        for node in process.get("nodes", []):
            referenced_role_ids = []
            seen_role_ids = set()
            for role_id in node.get("role_ids", []):
                normalized_role_id = str(role_id or "").strip()
                if not normalized_role_id or normalized_role_id in seen_role_ids:
                    continue
                seen_role_ids.add(normalized_role_id)
                referenced_role_ids.append(normalized_role_id)
            legacy_role_id = str(node.get("role_id", "")).strip()
            if legacy_role_id and legacy_role_id not in seen_role_ids:
                referenced_role_ids.insert(0, legacy_role_id)
            for index, role_id in enumerate(referenced_role_ids):
                if role_id in role_ids:
                    continue
                issues.append(
                    {
                        "level": "error",
                        "path": f"processes.{process['id']}.nodes.{node['id']}.role_ids.{index}",
                        "message": f"任务 {node['id']} 引用了不存在的角色 {role_id}",
                    }
                )
            for entity_op in node.get("entity_ops", []):
                entity_id = str(entity_op.get("entity_id", "")).strip()
                if entity_id and entity_id not in entity_ids:
                    issues.append(
                        {
                            "level": "error",
                            "path": f"processes.{process['id']}.nodes.{node['id']}.entity_ops",
                            "message": f"任务 {node['id']} 引用了不存在的实体 {entity_id}",
                        }
                    )
            for form in node.get("forms", []):
                form_entity_id = str(form.get("entity_id", "")).strip()
                if form_entity_id and form_entity_id not in entity_ids:
                    issues.append(
                        {
                            "level": "error",
                            "path": f"processes.{process['id']}.nodes.{node['id']}.forms.{form.get('id', '')}.entity_id",
                            "message": f"表单 {form.get('id', '')} 引用了不存在的实体 {form_entity_id}",
                        }
                    )
                for section in form.get("sections", []):
                    section_entity_id = str(section.get("entity_id", "")).strip()
                    if section_entity_id and section_entity_id not in entity_ids:
                        issues.append(
                            {
                                "level": "error",
                                "path": f"processes.{process['id']}.nodes.{node['id']}.forms.{form.get('id', '')}.sections.{section.get('id', '')}.entity_id",
                                "message": f"表单分组 {section.get('id', '')} 引用了不存在的实体 {section_entity_id}",
                            }
                        )

    for relation in doc.get("relations", []):
        relation_from = str(relation.get("from", "")).strip()
        relation_to = str(relation.get("to", "")).strip()
        if relation_from and relation_from not in entity_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"relations.{relation.get('uid', '')}.from",
                    "message": f"关系引用了不存在的起点实体 {relation_from}",
                }
            )
        if relation_to and relation_to not in entity_ids:
            issues.append(
                {
                    "level": "error",
                    "path": f"relations.{relation.get('uid', '')}.to",
                    "message": f"关系引用了不存在的终点实体 {relation_to}",
                }
            )

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
        applies_to = str(rule.get("applies_to", "")).strip()
        if applies_to and applies_to not in valid_applies_to:
            issues.append(
                {
                    "level": "warning",
                    "path": f"rules.{rule.get('uid', '')}.applies_to",
                    "message": f"规则 {rule.get('name', '') or rule.get('id', '')} 的 applies_to 找不到对应对象 {applies_to}",
                }
            )

    return issues
