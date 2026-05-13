from __future__ import annotations

from typing import Any


"""
BLM model strategy registry.

This file is the single backend entry point for model identity and merge rules.
When a model element is added or renamed, update this file first, then wire the
feature code to the strategy instead of hard-coding merge behavior elsewhere.

Rules expressed here:
- which collections are part of the document model
- which scalar fields should be compared for conflicts
- which list fields are set-like references
- which child lists are merged recursively
- which semantic fields identify the same business object when uid is missing
- which legacy field names migrate to the current model
- which internal ID prefix is used when the system has to create an id
"""


DOCUMENT_LISTS: dict[str, str] = {
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
    "businessComponents": "business_component",
    "businessConstructs": "business_construct",
    "taskDefinitions": "task_definition",
}


DESCRIPTORS: dict[str, dict[str, Any]] = {
    "document": {"scalars": [], "lists": DOCUMENT_LISTS},
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
            "businessComponentId",
            "businessComponent",
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
    "business_component": {
        "scalars": ["id", "name", "kind", "note"],
        "set_lists": ["constructIds", "taskDefinitionIds", "entityIds"],
        "lists": {},
    },
    "business_construct": {
        "scalars": ["id", "name", "note", "businessComponentId", "businessComponent"],
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
            "businessComponentId",
            "businessComponent",
            "constructId",
            "constructName",
        ],
        "set_lists": ["entityIds"],
        "lists": {},
    },
}


COLLECTION_LABELS: dict[str, str] = {
    "stage": "业务阶段",
    "stage_link": "业务阶段连线",
    "stage_flow_ref": "阶段流程引用",
    "stage_flow_link": "阶段流程引用连线",
    "process_link": "阶段内流程连线",
    "role": "角色",
    "language": "术语",
    "process": "流程",
    "node": "节点",
    "user_step": "用户操作步骤",
    "business_rule": "业务规则",
    "orchestration_task": "编排任务",
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
    "business_component": "业务组件",
    "business_construct": "业务构件",
    "task_definition": "任务定义",
}


ID_PREFIXES: dict[str, str] = {
    "role": "R",
    "stage": "S",
    "stage_flow_ref": "SFR",
    "stage_flow_link": "SFL",
    "process": "P",
    "node": "T",
    "flow_gateway": "B",
    "flow_edge": "L",
    "entity": "E",
    "business_component": "BCP",
    "business_construct": "BC",
    "task_definition": "TD",
}


LEGACY_COLLECTION_RENAMES: dict[str, str] = {
    "capabilityUnits": "businessComponents",
}


LEGACY_FIELD_RENAMES: dict[str, str] = {
    "capabilityUnitId": "businessComponentId",
    "capabilityUnit": "businessComponent",
    "capabilityUnitIds": "businessComponentIds",
}


SEMANTIC_UNIQUE_IN_COMBINE = {"rule", "business_rule"}


RULE_APPLIES_TO_COLLECTIONS = (
    "roles",
    "stages",
    "processes",
    "entities",
    "businessComponents",
    "businessConstructs",
    "taskDefinitions",
)


# Each tuple describes one fallback semantic identity candidate. A tuple with
# several fields is joined as a scoped composite key.
SEMANTIC_KEY_FIELDS: dict[str, list[tuple[str, ...]]] = {
    "stage_flow_ref": [("stageId", "processId", "id")],
    "stage_flow_link": [("stageId", "fromRefId", "toRefId")],
    "role": [("name",), ("id",)],
    "language": [("term",)],
    "process": [("name",), ("id",)],
    "node": [("name",), ("id",)],
    "user_step": [("name",)],
    "business_rule": [("name",), ("id",)],
    "orchestration_task": [("taskDefinitionId",), ("name",), ("target",)],
    "form": [("name",), ("id",)],
    "form_section": [("name",), ("id",)],
    "form_field": [("name",), ("id",)],
    "prototype_file": [("name",), ("uid",)],
    "prototype_version": [("uid",), ("number",), ("name",)],
    "business_component": [("name",), ("id",)],
    "business_construct": [("name",), ("id",)],
    "task_definition": [("name",), ("target",), ("id",)],
    "entity": [("name",), ("id",)],
    "field": [("name",)],
    "state_node": [("name",)],
    "transition": [("field_name", "from", "to")],
    "relation": [("from", "to", "type", "label")],
    "rule": [("name",), ("id",)],
    "entity_op": [("entity_id",)],
}


def normalize_strategy_text(text: Any) -> str:
    return " ".join(str(text or "").strip().casefold().split())


def collection_label(item_type: str) -> str:
    return COLLECTION_LABELS.get(item_type, item_type)


def id_prefix(item_type: str, fallback: str = "X") -> str:
    return ID_PREFIXES.get(item_type, fallback)


def semantic_key(item_type: str, item: dict) -> str:
    for fields in SEMANTIC_KEY_FIELDS.get(item_type, [("name",), ("id",)]):
        parts = [str(item.get(field, "")).strip() for field in fields]
        if len(parts) == 1:
            candidate = parts[0]
        else:
            candidate = "|".join(parts)
        normalized = normalize_strategy_text(candidate)
        if normalized:
            return normalized
    return normalize_strategy_text(item.get("id") or item.get("uid"))
