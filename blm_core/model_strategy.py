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
- which legacy collection names are normalized before strategy-based merge
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
    "role": {"scalars": ["name", "desc", "group"], "set_lists": ["subDomains"], "lists": {}},
    "language": {"scalars": ["term", "definition"], "lists": {}},
    "stage": {
        "scalars": ["name", "subDomain", "panoramaColumnUid", "panoramaLaneUid", "panoramaSlot", "panoramaPos", "pos"],
        "lists": {"processLinks": "process_link"},
    },
    "stage_link": {"scalars": ["fromStageUid", "toStageUid"], "lists": {}},
    "stage_flow_ref": {"scalars": ["stageUid", "processUid", "order", "pos"], "lists": {}},
    "stage_flow_link": {"scalars": ["stageUid", "fromRefUid", "toRefUid"], "lists": {}},
    "process": {
        "scalars": ["name", "subDomain", "flowGroup", "stageUid", "stagePos", "trigger", "outcome", "pos", "businessComponentUid", "businessConstructUid"],
        "set_lists": ["businessComponentUids", "businessConstructUids"],
        "objects": {"flow": "process_flow"},
        "lists": {"prototypeFiles": "prototype_file", "nodes": "node"},
    },
    "process_flow": {
        "scalars": ["version", "orientation", "layout"],
        "lists": {"nodes": "process_flow_node", "edges": "process_flow_edge"},
    },
    "process_flow_node": {"scalars": ["kind", "gatewayType", "title", "role_uid", "nodeUid", "x", "y"], "lists": {}},
    "process_flow_edge": {"scalars": ["from", "to", "label", "condition", "source", "target"], "lists": {}},
    "prototype_file": {
        "scalars": ["name", "versionUid", "content", "contentType", "uploadedAt"],
        "lists": {"versions": "prototype_version"},
    },
    "prototype_version": {"scalars": ["number", "name", "content", "contentType", "uploadedAt"], "lists": {}},
    "process_link": {"scalars": ["fromProcessUid", "toProcessUid"], "lists": {}},
    "node": {
        "scalars": ["name", "role_uid", "role", "repeatable", "rules_note", "taskDefinitionUid", "businessComponentUid", "constructUid", "businessConstructUid"],
        "set_lists": ["role_uids", "roles"],
        "lists": {
            "userSteps": "user_step",
            "entity_ops": "entity_op",
            "orchestrationTasks": "orchestration_task",
            "businessRules": "business_rule",
            "forms": "form",
        },
    },
    "user_step": {"scalars": ["name", "type", "note"], "lists": {}},
    "business_rule": {"scalars": ["name", "content"], "lists": {}},
    "orchestration_task": {
        "scalars": [
            "name",
            "type",
            "querySourceKind",
            "target",
            "note",
            "taskDefinitionUid",
            "constructUid",
            "businessConstructUid",
            "constructName",
            "businessComponentUid",
            "businessComponent",
        ],
        "lists": {},
    },
    "entity_op": {"scalars": ["entity_uid"], "set_lists": ["ops"], "lists": {}},
    "form": {"scalars": ["name", "purpose", "entity_uid"], "lists": {"sections": "form_section"}},
    "form_section": {"scalars": ["name", "note", "entity_uid"], "lists": {"fields": "form_field"}},
    "form_field": {"scalars": ["name", "type", "required", "entity_field", "note"], "lists": {}},
    "entity": {
        "scalars": ["name", "group", "note", "pos", "businessConstructUid"],
        "set_lists": ["businessConstructUids"],
        "lists": {"fields": "field", "state_transitions": "transition"},
    },
    "field": {
        "scalars": ["name", "type", "is_key", "is_status", "status_role", "state_values", "note"],
        "lists": {"state_nodes": "state_node"},
    },
    "state_node": {"scalars": ["name", "kind", "pos", "markerPos"], "lists": {}},
    "transition": {"scalars": ["from", "to", "action", "note", "field_name", "labelPos"], "lists": {}},
    "relation": {"scalars": ["from", "to", "type", "label"], "lists": {}},
    "rule": {"scalars": ["name", "type", "appliesToUid", "description", "formula"], "lists": {}},
    "business_component": {
        "scalars": ["name", "kind", "note"],
        "set_lists": ["constructUids", "taskDefinitionUids", "entityUids"],
        "lists": {},
    },
    "business_construct": {
        "scalars": ["name", "note", "businessComponentUid", "businessComponent"],
        "set_lists": ["taskDefinitionUids", "entityUids"],
        "lists": {},
    },
    "task_definition": {
        "scalars": [
            "name",
            "type",
            "querySourceKind",
            "target",
            "address",
            "parameters",
            "note",
            "businessComponentUid",
            "businessComponent",
            "constructUid",
            "constructName",
        ],
        "set_lists": ["entityUids"],
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


LEGACY_COLLECTION_RENAMES: dict[str, str] = {
    "capabilityUnits": "businessComponents",
}


LEGACY_FIELD_RENAMES: dict[str, str] = {
    "capabilityUnitId": "businessComponentId",
    "capabilityUnit": "businessComponent",
    "capabilityUnitIds": "businessComponentIds",
}


SEMANTIC_UNIQUE_IN_COMBINE = {"rule", "business_rule", "field"}

# uid 为随机生成（无确定性名称），只能用语义 key 匹配的类型
SEMANTIC_KEY_ONLY_TYPES = {"relation"}


RULE_APPLIES_TO_COLLECTIONS = (
    "roles",
    "stages",
    "processes",
    "entities",
    "businessComponents",
    "businessConstructs",
    "taskDefinitions",
)


# 位置字段在协作同步中作为普通标量参与合并和冲突检测
INTERNAL_SCALAR_FIELDS: set[str] = set()


# Each tuple describes one fallback semantic identity candidate. A tuple with
# several fields is joined as a scoped composite key.
SEMANTIC_KEY_FIELDS: dict[str, list[tuple[str, ...]]] = {
    "stage_flow_ref": [("stageUid", "processUid")],
    "stage_flow_link": [("stageUid", "fromRefUid", "toRefUid")],
    "role": [("name",), ("uid",)],
    "language": [("term",)],
    "process": [("name",), ("uid",)],
    "process_flow_node": [("uid",), ("nodeUid",), ("title",)],
    "process_flow_edge": [("uid",), ("from", "to", "label"), ("source", "target", "label")],
    "node": [("name",), ("uid",)],
    "user_step": [("name",)],
    "business_rule": [("name",), ("uid",)],
    "orchestration_task": [("taskDefinitionUid",), ("name",), ("target",)],
    "form": [("name",), ("uid",)],
    "form_section": [("name",), ("uid",)],
    "form_field": [("name",), ("uid",)],
    "prototype_file": [("name",), ("uid",)],
    "prototype_version": [("uid",), ("number",), ("name",)],
    "business_component": [("name",), ("uid",)],
    "business_construct": [("name",), ("uid",)],
    "task_definition": [("name",), ("target",), ("uid",)],
    "entity": [("name",), ("uid",)],
    "field": [("name",)],
    "state_node": [("name",)],
    "transition": [("field_name", "from", "to")],
    "relation": [("from", "to", "type", "label")],
    "rule": [("name",), ("uid",)],
    "entity_op": [("entity_uid",)],
    "process_link": [("fromProcessUid", "toProcessUid")],
}


def normalize_strategy_text(text: Any) -> str:
    return " ".join(str(text or "").strip().casefold().split())


def collection_label(item_type: str) -> str:
    return COLLECTION_LABELS.get(item_type, item_type)


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
    return normalize_strategy_text(item.get("uid"))
