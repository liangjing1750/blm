from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any
from uuid import uuid4

from blm_core.document import SCHEMA_VERSION, migrate_document


MISSING = object()
VERSION_SUFFIX_RE = re.compile(r"(?:[-_\s]?v\d+|[-_\s]?版本\d+)$", re.IGNORECASE)
TRAILING_SEPARATOR_RE = re.compile(r"[-_\s]+$")
SEMANTIC_UNIQUE_IN_COMBINE = {"rule", "business_rule"}

DESCRIPTORS: dict[str, dict[str, Any]] = {
    "document": {
        "scalars": [],
        "lists": {
            "roles": "role",
            "language": "language",
            "stages": "stage",
            "stageLinks": "stage_link",
            "stageFlowRefs": "stage_flow_ref",
            "stageFlowLinks": "stage_flow_link",
            "processes": "process",
            "entities": "entity",
            "relations": "relation",
            "rules": "rule",
            "capabilityUnits": "capability_unit",
            "businessConstructs": "business_construct",
            "taskDefinitions": "task_definition",
        },
    },
    "meta": {"scalars": ["title", "domain", "author", "date"], "lists": {}},
    "role": {"scalars": ["id", "name", "desc", "group"], "set_lists": ["subDomains"], "lists": {}},
    "language": {"scalars": ["term", "definition"], "lists": {}},
    "stage": {
        "scalars": ["id", "name", "subDomain", "pos"],
        "lists": {"processLinks": "process_link"},
    },
    "stage_link": {"scalars": ["fromStageId", "toStageId"], "lists": {}},
    "stage_flow_ref": {"scalars": ["id", "stageId", "processId", "order", "pos"], "lists": {}},
    "stage_flow_link": {"scalars": ["id", "stageId", "fromRefId", "toRefId"], "lists": {}},
    "process": {
        "scalars": ["id", "name", "subDomain", "flowGroup", "stageId", "stagePos", "trigger", "outcome", "pos", "flow"],
        "lists": {"prototypeFiles": "prototype_file", "nodes": "node"},
    },
    "prototype_file": {
        "scalars": ["name", "versionUid", "content", "contentType", "uploadedAt"],
        "lists": {"versions": "prototype_version"},
    },
    "prototype_version": {"scalars": ["number", "name", "content", "contentType", "uploadedAt"], "lists": {}},
    "process_link": {"scalars": ["fromProcessId", "toProcessId"], "lists": {}},
    "node": {
        "scalars": ["id", "name", "role_id", "role", "repeatable", "rules_note"],
        "set_lists": ["role_ids", "roles"],
        "lists": {
            "userSteps": "user_step",
            "entity_ops": "entity_op",
            "orchestrationTasks": "orchestration_task",
            "businessRules": "business_rule",
            "forms": "form",
        },
    },
    "user_step": {"scalars": ["name", "type", "note"], "lists": {}},
    "business_rule": {"scalars": ["id", "name", "content"], "lists": {}},
    "orchestration_task": {
        "scalars": [
            "name",
            "type",
            "querySourceKind",
            "target",
            "note",
            "taskDefinitionId",
            "constructId",
            "businessConstructId",
            "constructName",
            "capabilityUnitId",
            "capabilityUnit",
        ],
        "lists": {},
    },
    "entity_op": {"scalars": ["entity_id"], "set_lists": ["ops"], "lists": {}},
    "form": {"scalars": ["id", "name", "purpose", "entity_id"], "lists": {"sections": "form_section"}},
    "form_section": {"scalars": ["id", "name", "note", "entity_id"], "lists": {"fields": "form_field"}},
    "form_field": {"scalars": ["id", "name", "type", "required", "entity_field", "note"], "lists": {}},
    "entity": {
        "scalars": ["id", "name", "group", "note", "pos", "businessConstructId"],
        "set_lists": ["businessConstructIds"],
        "lists": {"fields": "field", "state_transitions": "transition"},
    },
    "field": {
        "scalars": ["name", "type", "is_key", "is_status", "status_role", "state_values", "note"],
        "lists": {"state_nodes": "state_node"},
    },
    "state_node": {"scalars": ["name", "kind", "pos", "markerPos"], "lists": {}},
    "transition": {"scalars": ["from", "to", "action", "note", "field_name", "labelPos"], "lists": {}},
    "relation": {"scalars": ["from", "to", "type", "label"], "lists": {}},
    "rule": {"scalars": ["id", "name", "type", "applies_to", "description", "formula"], "lists": {}},
    "capability_unit": {
        "scalars": ["id", "name", "kind", "note"],
        "set_lists": ["constructIds", "taskDefinitionIds", "entityIds"],
        "lists": {},
    },
    "business_construct": {
        "scalars": ["id", "name", "note", "capabilityUnitId", "capabilityUnit"],
        "set_lists": ["taskDefinitionIds", "entityIds"],
        "lists": {},
    },
    "task_definition": {
        "scalars": [
            "id",
            "name",
            "type",
            "querySourceKind",
            "target",
            "note",
            "capabilityUnitId",
            "capabilityUnit",
            "constructId",
            "constructName",
        ],
        "set_lists": ["entityIds"],
        "lists": {},
    },
}


def _normalize_name(text: Any) -> str:
    return " ".join(str(text or "").strip().casefold().split())


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


def _collection_label(item_type: str) -> str:
    return {
        "stage": "业务阶段",
        "stage_link": "业务阶段连线",
        "stage_flow_ref": "阶段流程引用",
        "stage_flow_link": "阶段流程引用连线",
        "process_link": "阶段内流程连线",
        "role": "角色",
        "language": "术语",
        "process": "流程",
        "node": "\u8282\u70b9",
        "user_step": "\u7528\u6237\u64cd\u4f5c\u6b65\u9aa4",
        "business_rule": "业务规则",
        "orchestration_task": "\u7f16\u6392\u4efb\u52a1",
        "entity": "实体",
        "field": "字段",
        "transition": "状态流转",
        "relation": "关系",
        "rule": "规则",
        "entity_op": "实体操作",
        "form": "表单",
        "form_section": "表单分组",
        "form_field": "表单字段",
        "prototype_file": "流程原型",
        "prototype_version": "原型版本",
        "capability_unit": "能力单元",
        "business_construct": "业务构件",
        "task_definition": "任务定义",
    }.get(item_type, item_type)


def _name_key(item_type: str, item: dict) -> str:
    if item_type == "stage_flow_ref":
        primary = "|".join(
            [
                str(item.get("stageId", "")).strip(),
                str(item.get("processId", "")).strip(),
                str(item.get("id", "")).strip(),
            ]
        )
    elif item_type == "stage_flow_link":
        primary = "|".join(
            [
                str(item.get("stageId", "")).strip(),
                str(item.get("fromRefId", "")).strip(),
                str(item.get("toRefId", "")).strip(),
            ]
        )
    elif item_type == "role":
        primary = item.get("name") or item.get("id")
    elif item_type == "language":
        primary = item.get("term")
    elif item_type == "process":
        primary = item.get("name") or item.get("id")
    elif item_type == "node":
        primary = item.get("name") or item.get("id")
    elif item_type == "user_step":
        primary = item.get("name")
    elif item_type == "business_rule":
        primary = item.get("name") or item.get("id")
    elif item_type == "orchestration_task":
        primary = item.get("taskDefinitionId") or item.get("name") or item.get("target")
    elif item_type == "form":
        primary = item.get("name") or item.get("id")
    elif item_type == "form_section":
        primary = item.get("name") or item.get("id")
    elif item_type == "form_field":
        primary = item.get("name") or item.get("id")
    elif item_type == "prototype_file":
        primary = item.get("name") or item.get("uid")
    elif item_type == "prototype_version":
        primary = item.get("uid") or item.get("number") or item.get("name")
    elif item_type == "capability_unit":
        primary = item.get("id") or item.get("name")
    elif item_type == "business_construct":
        primary = item.get("id") or item.get("name")
    elif item_type == "task_definition":
        primary = item.get("id") or item.get("name") or item.get("target")
    elif item_type == "entity":
        primary = item.get("name") or item.get("id")
    elif item_type == "field":
        primary = item.get("name")
    elif item_type == "state_node":
        primary = item.get("name")
    elif item_type == "transition":
        primary = "|".join(
            [
                str(item.get("field_name", "")).strip(),
                str(item.get("from", "")).strip(),
                str(item.get("to", "")).strip(),
            ]
        )
    elif item_type == "relation":
        primary = "|".join(
            [
                str(item.get("from", "")).strip(),
                str(item.get("to", "")).strip(),
                str(item.get("type", "")).strip(),
                str(item.get("label", "")).strip(),
            ]
        )
    elif item_type == "rule":
        primary = item.get("name") or item.get("id")
    elif item_type == "entity_op":
        primary = item.get("entity_id")
    else:
        primary = item.get("name") or item.get("id")
    normalized = _normalize_name(primary)
    if normalized:
        return normalized
    return _normalize_name(item.get("id") or item.get("uid"))


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
        self.auto_merged_count = 0
        self.suggested_name = ""

    def analyze(self, left_raw: dict, right_raw: dict, base_raw: dict | None = None) -> dict:
        left = MergeInput(*_prepare_input(left_raw))
        right = MergeInput(*_prepare_input(right_raw))
        base = MergeInput(*_prepare_input(base_raw)) if base_raw is not None else None

        merged = self._merge_document(base, left, right)
        merged = migrate_document(merged)
        self.validation_issues = validate_document(merged)

        return {
            "mode": self.mode,
            "suggested_name": self.suggested_name,
            "summary": {
                "autoMergedCount": self.auto_merged_count,
                "conflictCount": len(self.conflicts),
                "validationIssueCount": len(self.validation_issues),
            },
            "conflicts": self.conflicts,
            "validation_issues": self.validation_issues,
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

        merged = {"meta": merged_meta}
        for field, item_type in DESCRIPTORS["document"]["lists"].items():
            merged[field] = self._merge_list(
                item_type,
                [field],
                getattr(base, "document", {}).get(field, []) if base else [],
                left.document.get(field, []),
                right.document.get(field, []),
                base_trust=base.trust_identity if base else False,
                left_trust=left.trust_identity,
                right_trust=right.trust_identity,
            )
        return merged

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
                "label": f"{_collection_label(item_type)}存在同名不同义冲突",
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
                "label": f"{_collection_label(item_type)}同名但内容不同",
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
                "label": f"{_collection_label(item_type)}出现删改冲突",
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
        semantic_key = _name_key(item_type, item)
        if self.mode == "combine" and item_type in SEMANTIC_UNIQUE_IN_COMBINE and semantic_key:
            return ("name", semantic_key)
        if trust_identity and uid:
            return ("uid", uid)
        return ("name", semantic_key)

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
                        "message": f"{_collection_label(item_type)}业务ID重复{suffix}: {item_id}",
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
    add_duplicate_id_issues(doc.get("capabilityUnits", []), "capability_unit", "capabilityUnits")
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

    valid_applies_to = role_ids | stage_ids | entity_ids | process_ids | node_ids
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
