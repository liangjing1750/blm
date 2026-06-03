from __future__ import annotations

import hashlib
import re
from copy import deepcopy
from uuid import uuid4

from blm_core.model_strategy import LEGACY_COLLECTION_RENAMES, LEGACY_FIELD_RENAMES


DEFAULT_PROCESS_NAME = "主流程"
DEFAULT_ROLE_NAME = "新角色"
DEFAULT_STAGE_NAME = "业务阶段"
SCHEMA_VERSION = 4

STEP_TYPE_ALIASES = {
    "validate": "Check",
    "check": "Check",
    "query": "Query",
    "fill": "Fill",
    "select": "Select",
    "calculate": "Compute",
    "compute": "Compute",
    "change": "Mutate",
    "mutate": "Mutate",
}

ORCHESTRATION_TYPE_ALIASES = {
    "query": "Query",
    "check": "Check",
    "compute": "Compute",
    "service": "Service",
    "mutate": "Mutate",
    "custom": "Custom",
}

QUERY_SOURCE_KIND_ALIASES = {
    "dictionary": "Dictionary",
    "dict": "Dictionary",
    "enum": "Enum",
    "queryservice": "QueryService",
    "query_service": "QueryService",
    "service": "QueryService",
    "custom": "Custom",
}

FIELD_TYPE_ALIASES = {
    "string": "string",
    "str": "string",
    "text": "text",
    "longtext": "text",
    "number": "number",
    "int": "number",
    "integer": "number",
    "decimal": "decimal",
    "float": "decimal",
    "date": "date",
    "datetime": "datetime",
    "timestamp": "datetime",
    "boolean": "boolean",
    "bool": "boolean",
    "enum": "enum",
    "id": "id",
}


def _new_uid() -> str:
    return uuid4().hex


def _deterministic_uid(prefix: str, *parts: object) -> str:
    payload = "|".join(str(part or "").strip() for part in parts)
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _deterministic_ui_uid(prefix: str, *parts: object) -> str:
    payload = "|".join(str(part or "").strip() for part in parts)
    value = 2166136261
    for char in payload:
        value ^= ord(char)
        value = (value * 16777619) & 0xFFFFFFFF
    return f"{prefix}-{value:08x}"


PANORAMA_COLUMN_UID_BY_NAME = {
    "会员客户": "participants",
    "品种参数": "parameters",
    "业务办理": "businessHandling",
    "风险监管": "riskSupervision",
}
PANORAMA_LANE_UID_BY_NAME = {
    "示例业务域1": "smart-platform-phase2",
    "示例业务域2": "receipt-system",
}


def _normalize_name_key(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _semantic_panorama_uid(prefix: str, name: object, index: int, used: set[str], known: dict[str, str]) -> str:
    name_key = _normalize_name_key(name)
    base = known.get(name_key) or (
        _deterministic_ui_uid(prefix, name_key)
        if name_key
        else f"{prefix}-unnamed-{index}"
    )
    uid = base
    suffix = 2
    while uid in used:
        uid = f"{base}-{suffix}"
        suffix += 1
    used.add(uid)
    return uid


def _ensure_uid(item: dict, *, prefix: str = "item") -> str:
    uid = str(item.get("uid", "")).strip()
    if not uid:
        name = str(item.get("name", "")).strip()
        uid = _deterministic_ui_uid(prefix, name) if name else _new_uid()
        item["uid"] = uid
    return uid



def canonicalize_model_references(document: dict | None) -> dict:
    doc = deepcopy(document or {})

    def normalize_panorama_axis(
        panorama: dict,
        axis: str,
        prefix: str,
        known: dict[str, str],
        fallback_label: str,
    ) -> dict[str, str]:
        items = panorama.get(axis, []) if isinstance(panorama.get(axis), list) else []
        used: set[str] = set()
        mapping: dict[str, str] = {}
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            has_name = "name" in item
            name = str(item.get("name", "")).strip() if has_name else f"{fallback_label}{index}"
            existing_uid = str(item.get("uid", "")).strip()
            next_uid = existing_uid or _semantic_panorama_uid(prefix, name, index, used, known)
            if next_uid in used:
                next_uid = _semantic_panorama_uid(prefix, name, index, used, known)
            else:
                used.add(next_uid)
            for source_field in ("uid", "id", "key"):
                source_ref = str(item.get(source_field, "")).strip()
                if source_ref:
                    mapping[source_ref] = next_uid
            mapping[next_uid] = next_uid
            item["uid"] = next_uid
            item["name"] = name
        return mapping

    def uid_map(items: list[dict] | None) -> dict[str, str]:
        result: dict[str, str] = {}
        for item in items or []:
            if not isinstance(item, dict):
                continue
            uid = str(item.get("uid", "")).strip()
            if uid:
                result[uid] = uid
                legacy_id = str(item.get("id", "")).strip()
                if legacy_id:
                    result[legacy_id] = uid
        return result

    def mapped(value: object, mapping: dict[str, str]) -> str:
        text = str(value or "").strip()
        return mapping.get(text, text)

    def mapped_list(values: object, mapping: dict[str, str]) -> list[str]:
        if not isinstance(values, list):
            return []
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = mapped(value, mapping)
            if normalized and normalized not in seen:
                seen.add(normalized)
                result.append(normalized)
        return result

    panorama = doc.get("panorama") if isinstance(doc.get("panorama"), dict) else {}
    if isinstance(panorama, dict):
        column_map = normalize_panorama_axis(
            panorama,
            "columns",
            "panorama-column",
            PANORAMA_COLUMN_UID_BY_NAME,
            "价值流",
        )
        lane_map = normalize_panorama_axis(
            panorama,
            "lanes",
            "panorama-lane",
            PANORAMA_LANE_UID_BY_NAME,
            "业务域",
        )
    else:
        column_map = {}
        lane_map = {}
    column_map.update(uid_map(panorama.get("columns", []) if isinstance(panorama, dict) else []))
    lane_map.update(uid_map(panorama.get("lanes", []) if isinstance(panorama, dict) else []))
    role_map = uid_map(doc.get("roles", []))
    stage_map = uid_map(doc.get("stages", []))
    process_map = uid_map(doc.get("processes", []))
    entity_map = uid_map(doc.get("entities", []))
    component_map = uid_map(doc.get("businessComponents", []))
    construct_map = uid_map(doc.get("businessConstructs", []))
    task_definition_map = uid_map(doc.get("taskDefinitions", []))
    stage_ref_map = uid_map(doc.get("stageFlowRefs", []))

    if isinstance(panorama, dict):
        for cell in panorama.get("cells", []) if isinstance(panorama.get("cells"), list) else []:
            if not isinstance(cell, dict):
                continue
            cell["columnUid"] = mapped(cell.get("columnUid") or cell.get("columnId"), column_map)
            cell["laneUid"] = mapped(cell.get("laneUid") or cell.get("laneId"), lane_map)
            cell["uid"] = _deterministic_uid("panorama-cell", cell["laneUid"], cell["columnUid"])
            cell.pop("columnId", None)
            cell.pop("laneId", None)

    for stage in doc.get("stages", []):
        if not isinstance(stage, dict):
            continue
        stage["panoramaColumnUid"] = mapped(stage.get("panoramaColumnUid") or stage.get("panoramaColumnId"), column_map)
        stage["panoramaLaneUid"] = mapped(stage.get("panoramaLaneUid") or stage.get("panoramaLaneId"), lane_map)
        stage.pop("panoramaColumnId", None)
        stage.pop("panoramaLaneId", None)
        for link in stage.get("processLinks", []) if isinstance(stage.get("processLinks"), list) else []:
            if not isinstance(link, dict):
                continue
            link["fromProcessId"] = mapped(link.get("fromProcessUid") or link.get("fromProcessId"), process_map)
            link["toProcessId"] = mapped(link.get("toProcessUid") or link.get("toProcessId"), process_map)

    for link in doc.get("stageLinks", []):
        if not isinstance(link, dict):
            continue
        link["fromStageId"] = mapped(link.get("fromStageUid") or link.get("fromStageId"), stage_map)
        link["toStageId"] = mapped(link.get("toStageUid") or link.get("toStageId"), stage_map)

    for ref in doc.get("stageFlowRefs", []):
        if not isinstance(ref, dict):
            continue
        ref["stageId"] = mapped(ref.get("stageUid") or ref.get("stageId"), stage_map)
        ref["processId"] = mapped(ref.get("processUid") or ref.get("processId"), process_map)

    ref_rewrite: dict[str, str] = {}
    seen_stage_process_refs: set[tuple[str, str]] = set()
    deduped_stage_refs: list[dict] = []
    for ref in doc.get("stageFlowRefs", []) if isinstance(doc.get("stageFlowRefs"), list) else []:
        if not isinstance(ref, dict):
            continue
        stage_id = str(ref.get("stageId", "")).strip()
        process_id = str(ref.get("processId", "")).strip()
        ref_uid = str(ref.get("uid", "")).strip()
        if not stage_id or not process_id or not ref_uid:
            continue
        pair = (stage_id, process_id)
        if pair in seen_stage_process_refs:
            kept_uid = next(
                (
                    str(item.get("uid", "")).strip()
                    for item in deduped_stage_refs
                    if str(item.get("stageId", "")).strip() == stage_id
                    and str(item.get("processId", "")).strip() == process_id
                ),
                "",
            )
            if kept_uid:
                ref_rewrite[ref_uid] = kept_uid
            continue
        seen_stage_process_refs.add(pair)
        deduped_stage_refs.append(ref)
        ref_rewrite[ref_uid] = ref_uid
    if isinstance(doc.get("stageFlowRefs"), list):
        doc["stageFlowRefs"] = deduped_stage_refs

    for link in doc.get("stageFlowLinks", []):
        if not isinstance(link, dict):
            continue
        link["stageId"] = mapped(link.get("stageUid") or link.get("stageId"), stage_map)
        link["fromRefId"] = ref_rewrite.get(mapped(link.get("fromRefUid") or link.get("fromRefId"), stage_ref_map), mapped(link.get("fromRefUid") or link.get("fromRefId"), stage_ref_map))
        link["toRefId"] = ref_rewrite.get(mapped(link.get("toRefUid") or link.get("toRefId"), stage_ref_map), mapped(link.get("toRefUid") or link.get("toRefId"), stage_ref_map))

    for process in doc.get("processes", []):
        if not isinstance(process, dict):
            continue
        process["stageId"] = mapped(process.get("stageUid") or process.get("stageId"), stage_map)
        process["businessComponentIds"] = mapped_list(process.get("businessComponentUids") or process.get("businessComponentIds"), component_map)
        process["businessConstructIds"] = mapped_list(process.get("businessConstructUids") or process.get("businessConstructIds"), construct_map)
        process["businessComponentId"] = mapped(process.get("businessComponentUid") or process.get("businessComponentId"), component_map)
        process["businessConstructId"] = mapped(process.get("businessConstructUid") or process.get("businessConstructId"), construct_map)

        node_map = uid_map(process.get("nodes", []))
        flow = process.get("flow") if isinstance(process.get("flow"), dict) else {}
        gateway_map = uid_map(flow.get("nodes", []) if isinstance(flow.get("nodes"), list) else [])
        flow_node_map = {**node_map, **gateway_map}
        for gateway in flow.get("nodes", []) if isinstance(flow.get("nodes"), list) else []:
            if isinstance(gateway, dict):
                gateway["role_id"] = mapped(gateway.get("role_uid") or gateway.get("role_id"), role_map)
        for edge in flow.get("edges", []) if isinstance(flow.get("edges"), list) else []:
            if not isinstance(edge, dict):
                continue
            if edge.get("from") not in {"START", "END"}:
                edge["from"] = mapped(edge.get("from"), flow_node_map)
            if edge.get("to") not in {"START", "END"}:
                edge["to"] = mapped(edge.get("to"), flow_node_map)

        for node in process.get("nodes", []) if isinstance(process.get("nodes"), list) else []:
            if not isinstance(node, dict):
                continue
            node["role_id"] = mapped(node.get("role_uid") or node.get("role_id"), role_map)
            node["role_ids"] = mapped_list(node.get("role_uids") or node.get("role_ids"), role_map)
            node["taskDefinitionId"] = mapped(node.get("taskDefinitionUid") or node.get("taskDefinitionId"), task_definition_map)
            node["businessComponentId"] = mapped(node.get("businessComponentUid") or node.get("businessComponentId"), component_map)
            node["constructId"] = mapped(node.get("constructUid") or node.get("constructId"), construct_map)
            node["businessConstructId"] = mapped(node.get("businessConstructUid") or node.get("businessConstructId"), construct_map)
            for entity_op in node.get("entity_ops", []) if isinstance(node.get("entity_ops"), list) else []:
                if isinstance(entity_op, dict):
                    entity_op["entity_id"] = mapped(entity_op.get("entity_uid") or entity_op.get("entity_id"), entity_map)
            for task in node.get("orchestrationTasks", []) if isinstance(node.get("orchestrationTasks"), list) else []:
                if not isinstance(task, dict):
                    continue
                task["taskDefinitionId"] = mapped(task.get("taskDefinitionUid") or task.get("taskDefinitionId"), task_definition_map)
                task["businessComponentId"] = mapped(task.get("businessComponentUid") or task.get("businessComponentId"), component_map)
                task["constructId"] = mapped(task.get("constructUid") or task.get("constructId"), construct_map)
                task["businessConstructId"] = mapped(task.get("businessConstructUid") or task.get("businessConstructId"), construct_map)
            for form in node.get("forms", []) if isinstance(node.get("forms"), list) else []:
                if not isinstance(form, dict):
                    continue
                form["entity_id"] = mapped(form.get("entity_uid") or form.get("entity_id"), entity_map)
                for section in form.get("sections", []) if isinstance(form.get("sections"), list) else []:
                    if isinstance(section, dict):
                        section["entity_id"] = mapped(section.get("entity_uid") or section.get("entity_id"), entity_map)

    for relation in doc.get("relations", []):
        if not isinstance(relation, dict):
            continue
        relation["from"] = mapped(relation.get("from"), entity_map)
        relation["to"] = mapped(relation.get("to"), entity_map)

    for entity in doc.get("entities", []):
        if not isinstance(entity, dict):
            continue
        entity["businessConstructId"] = mapped(entity.get("businessConstructUid") or entity.get("businessConstructId"), construct_map)
        entity["businessConstructIds"] = mapped_list(entity.get("businessConstructUids") or entity.get("businessConstructIds"), construct_map)

    for component in doc.get("businessComponents", []):
        if not isinstance(component, dict):
            continue
        component["constructIds"] = mapped_list(component.get("constructUids") or component.get("constructIds"), construct_map)
        component["taskDefinitionIds"] = mapped_list(component.get("taskDefinitionUids") or component.get("taskDefinitionIds"), task_definition_map)
        component["entityIds"] = mapped_list(component.get("entityUids") or component.get("entityIds"), entity_map)
        component["relatedProcessIds"] = mapped_list(component.get("relatedProcessUids") or component.get("relatedProcessIds"), process_map)

    for construct in doc.get("businessConstructs", []):
        if not isinstance(construct, dict):
            continue
        construct["businessComponentId"] = mapped(construct.get("businessComponentUid") or construct.get("businessComponentId"), component_map)
        construct["taskDefinitionIds"] = mapped_list(construct.get("taskDefinitionUids") or construct.get("taskDefinitionIds"), task_definition_map)
        construct["entityIds"] = mapped_list(construct.get("entityUids") or construct.get("entityIds"), entity_map)
        construct["relatedProcessIds"] = mapped_list(construct.get("relatedProcessUids") or construct.get("relatedProcessIds"), process_map)

    for task_definition in doc.get("taskDefinitions", []):
        if not isinstance(task_definition, dict):
            continue
        task_definition["businessComponentId"] = mapped(task_definition.get("businessComponentUid") or task_definition.get("businessComponentId"), component_map)
        task_definition["constructId"] = mapped(task_definition.get("constructUid") or task_definition.get("constructId"), construct_map)
        task_definition["entityIds"] = mapped_list(task_definition.get("entityUids") or task_definition.get("entityIds"), entity_map)
        task_definition["processIds"] = mapped_list(task_definition.get("processUids") or task_definition.get("processIds"), process_map)

    valid_rule_targets = {}
    for collection in ("roles", "stages", "processes", "entities", "businessComponents", "businessConstructs", "taskDefinitions", "rules"):
        valid_rule_targets.update(uid_map(doc.get(collection, [])))
    for process in doc.get("processes", []):
        valid_rule_targets.update(uid_map(process.get("nodes", []) if isinstance(process, dict) else []))
    for rule in doc.get("rules", []):
        if isinstance(rule, dict):
            rule["applies_to"] = mapped(rule.get("appliesToUid") or rule.get("applies_to"), valid_rule_targets)

    return doc


def rename_reference_fields_to_uid(value):
    if isinstance(value, list):
        return [rename_reference_fields_to_uid(item) for item in value]
    if not isinstance(value, dict):
        return value
    field_renames = {
        "columnId": "columnUid",
        "laneId": "laneUid",
        "panoramaColumnId": "panoramaColumnUid",
        "panoramaLaneId": "panoramaLaneUid",
        "fromProcessId": "fromProcessUid",
        "toProcessId": "toProcessUid",
        "fromStageId": "fromStageUid",
        "toStageId": "toStageUid",
        "stageId": "stageUid",
        "processId": "processUid",
        "fromRefId": "fromRefUid",
        "toRefId": "toRefUid",
        "businessComponentId": "businessComponentUid",
        "businessComponentIds": "businessComponentUids",
        "businessConstructId": "businessConstructUid",
        "businessConstructIds": "businessConstructUids",
        "relatedProcessIds": "relatedProcessUids",
        "processIds": "processUids",
        "constructId": "constructUid",
        "constructIds": "constructUids",
        "taskDefinitionId": "taskDefinitionUid",
        "taskDefinitionIds": "taskDefinitionUids",
        "entityId": "entityUid",
        "entityIds": "entityUids",
        "entity_id": "entity_uid",
        "role_id": "role_uid",
        "role_ids": "role_uids",
        "applies_to": "appliesToUid",
    }
    result = {}
    for key, child in value.items():
        next_key = field_renames.get(key, key)
        if next_key == key:
            if key.endswith("Ids"):
                next_key = f"{key[:-3]}Uids"
            elif key.endswith("Id"):
                next_key = f"{key[:-2]}Uid"
            elif key.endswith("_ids"):
                next_key = f"{key[:-4]}_uids"
            elif key.endswith("_id"):
                next_key = f"{key[:-3]}_uid"
        result[next_key] = rename_reference_fields_to_uid(child)
    return result


def strip_legacy_element_ids(value):
    if isinstance(value, list):
        return [strip_legacy_element_ids(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    has_uid = bool(str(value.get("uid", "")).strip())
    for key, child in value.items():
        if has_uid and key == "id":
            continue
        result[key] = strip_legacy_element_ids(child)
    return result


def canonical_document(document: dict | None) -> dict:
    return strip_legacy_element_ids(rename_reference_fields_to_uid(canonicalize_model_references(migrate_document(document))))


def _normalize_text_list(values: list[str] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = normalize_role_name(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _normalize_graph_offset(value) -> dict:
    if not isinstance(value, dict):
        return {"x": 0, "y": 0}
    try:
        x = int(round(float(value.get("x", 0) or 0)))
    except (TypeError, ValueError):
        x = 0
    try:
        y = int(round(float(value.get("y", 0) or 0)))
    except (TypeError, ValueError):
        y = 0
    return {"x": x, "y": y}


def _normalize_optional_graph_offset(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        x = int(round(float(value.get("x", 0))))
        y = int(round(float(value.get("y", 0))))
    except (TypeError, ValueError):
        return None
    return {"x": x, "y": y}


def _normalize_stage_process_links(process_links: list[dict]) -> list[dict]:
    normalized_links: list[dict] = []
    for link in process_links or []:
        if not isinstance(link, dict):
            continue
        normalized_links.append(
            {
                "uid": str(link.get("uid", "")).strip() or _new_uid(),
                "fromProcessId": str(link.get("fromProcessId", "")).strip(),
                "toProcessId": str(link.get("toProcessId", "")).strip(),
            }
        )
    return normalized_links


def _normalize_stage_links(stage_links: list[dict]) -> list[dict]:
    normalized_links: list[dict] = []
    for link in stage_links or []:
        if not isinstance(link, dict):
            continue
        normalized_links.append(
            {
                "uid": str(link.get("uid", "")).strip() or _new_uid(),
                "fromStageId": str(link.get("fromStageId", "")).strip(),
                "toStageId": str(link.get("toStageId", "")).strip(),
            }
        )
    return normalized_links



def _normalize_positive_int(value, fallback: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = fallback
    return normalized if normalized > 0 else fallback


def _normalize_stage_flow_refs(stage_flow_refs: list[dict]) -> list[dict]:
    normalized_refs: list[dict] = []
    used_uids: set[str] = set()
    for ref_index, ref in enumerate(stage_flow_refs or [], start=1):
        if not isinstance(ref, dict):
            continue
        stage_id = str(ref.get("stageId") or ref.get("stageUid") or ref.get("stage_id", "")).strip()
        process_id = str(ref.get("processId") or ref.get("processUid") or ref.get("process_id", "")).strip()
        if not stage_id or not process_id:
            continue
        ref_uid = str(ref.get("uid", "")).strip() or _deterministic_uid("stage-flow-ref", stage_id, process_id)
        if ref_uid in used_uids:
            continue
        used_uids.add(ref_uid)
        normalized_refs.append(
            {
                "uid": ref_uid,
                **({"id": str(ref.get("id", "")).strip()} if str(ref.get("id", "")).strip() else {}),
                "stageId": stage_id,
                "processId": process_id,
                "order": _normalize_positive_int(ref.get("order"), ref_index),
                "pos": _normalize_graph_offset(ref.get("pos", {})),
            }
        )
    return normalized_refs


def _normalize_stage_flow_links(stage_flow_links: list[dict]) -> list[dict]:
    normalized_links: list[dict] = []
    used_uids: set[str] = set()
    for link_index, link in enumerate(stage_flow_links or [], start=1):
        if not isinstance(link, dict):
            continue
        stage_id = str(link.get("stageId") or link.get("stageUid") or link.get("stage_id", "")).strip()
        from_ref_id = str(link.get("fromRefId") or link.get("fromRefUid") or link.get("from_ref_id", "")).strip()
        to_ref_id = str(link.get("toRefId") or link.get("toRefUid") or link.get("to_ref_id", "")).strip()
        if not stage_id or not from_ref_id or not to_ref_id:
            continue
        link_uid = str(link.get("uid", "")).strip() or _new_uid()
        if link_uid in used_uids:
            continue
        used_uids.add(link_uid)
        normalized_links.append(
            {
                "uid": link_uid,
                "stageId": stage_id,
                "fromRefId": from_ref_id,
                "toRefId": to_ref_id,
            }
        )
    return normalized_links


def _pop_legacy_business_component_fields(item: dict) -> None:
    for legacy_field, current_field in LEGACY_FIELD_RENAMES.items():
        if current_field not in item and legacy_field in item:
            item[current_field] = item.pop(legacy_field)
        else:
            item.pop(legacy_field, None)


def _rename_legacy_business_component_keys(value) -> None:
    if isinstance(value, list):
        for item in value:
            _rename_legacy_business_component_keys(item)
        return
    if not isinstance(value, dict):
        return

    for legacy_field, current_field in LEGACY_COLLECTION_RENAMES.items():
        if current_field not in value and legacy_field in value:
            value[current_field] = value.pop(legacy_field)
        else:
            value.pop(legacy_field, None)
    _pop_legacy_business_component_fields(value)
    for item in list(value.values()):
        _rename_legacy_business_component_keys(item)


def _supplement_stage_flow_refs_from_legacy(stage_flow_refs: list[dict], processes: list[dict]) -> list[dict]:
    existing_pairs = {
        (str(ref.get("stageId", "")).strip(), str(ref.get("processId", "")).strip())
        for ref in stage_flow_refs
        if str(ref.get("stageId", "")).strip() and str(ref.get("processId", "")).strip()
    }
    used_uids = {str(ref.get("uid", "")).strip() for ref in stage_flow_refs if str(ref.get("uid", "")).strip()}
    stage_orders: dict[str, int] = {}
    for ref in stage_flow_refs:
        stage_id = str(ref.get("stageId", "")).strip()
        if not stage_id:
            continue
        stage_orders[stage_id] = max(
            stage_orders.get(stage_id, 0),
            _normalize_positive_int(ref.get("order"), stage_orders.get(stage_id, 0) + 1),
        )

    supplemented = list(stage_flow_refs)
    for process in processes or []:
        stage_id = str(process.get("stageId", "")).strip()
        process_uid = str(process.get("uid", "")).strip()
        if not stage_id or not process_uid:
            continue
        process_aliases = {process_uid}
        legacy_process_id = str(process.get("id", "")).strip()
        if legacy_process_id:
            process_aliases.add(legacy_process_id)
        if any((stage_id, process_alias) in existing_pairs for process_alias in process_aliases):
            continue
        pair = (stage_id, process_uid)
        stage_orders[stage_id] = stage_orders.get(stage_id, 0) + 1
        supplemented.append(
            {
                "uid": _deterministic_uid("stage-flow-ref", stage_id, process_uid),
                "stageId": stage_id,
                "processId": process_uid,
                "order": stage_orders[stage_id],
                "pos": _normalize_graph_offset(process.get("stagePos", {})),
            }
        )
        existing_pairs.add(pair)
    return supplemented


def _build_stage_flow_links_from_legacy(stages: list[dict], stage_flow_refs: list[dict]) -> list[dict]:
    refs_by_stage_process: dict[tuple[str, str], str] = {}
    generated: list[dict] = []
    for ref in stage_flow_refs:
        stage_id = str(ref.get("stageId", "")).strip()
        process_id = str(ref.get("processId", "")).strip()
        ref_uid = str(ref.get("uid", "")).strip()
        if not stage_id or not process_id or not ref_uid:
            continue
        refs_by_stage_process.setdefault((stage_id, process_id), ref_uid)

    for stage in stages or []:
        stage_id = str(stage.get("uid", "")).strip()
        if not stage_id:
            continue
        for link in stage.get("processLinks", []):
            from_process_id = str(link.get("fromProcessId", "")).strip()
            to_process_id = str(link.get("toProcessId", "")).strip()
            from_ref_uid = refs_by_stage_process.get((stage_id, from_process_id), "")
            to_ref_uid = refs_by_stage_process.get((stage_id, to_process_id), "")
            if not from_ref_uid or not to_ref_uid:
                continue
            generated.append(
                {
                    "uid": _new_uid(),
                    "stageId": stage_id,
                    "fromRefId": from_ref_uid,
                    "toRefId": to_ref_uid,
                }
            )
    return generated


def _normalize_stages(stages: list[dict], processes: list[dict]) -> None:
    normalized_stages: list[dict] = []
    for stage_index, stage in enumerate(stages, start=1):
        if not isinstance(stage, dict):
            continue
        _ensure_uid(stage, prefix="stage")
        # uid already set by _ensure_uid
        stage.setdefault("name", f"{DEFAULT_STAGE_NAME}{stage_index}")
        if not stage.get("subDomain"):
            stage_process = next(
                (
                    process
                    for process in processes
                    if str(process.get("stageId", "")).strip() == stage.get("uid", "")
                    and str(process.get("subDomain", "")).strip()
                ),
                None,
            )
            stage["subDomain"] = str((stage_process or {}).get("subDomain", "")).strip()
        else:
            stage["subDomain"] = str(stage.get("subDomain", "")).strip()
        stage["pos"] = _normalize_graph_offset(stage.get("pos", {}))
        stage["processLinks"] = _normalize_stage_process_links(stage.get("processLinks", []))
        normalized_stages.append(stage)
    stages[:] = normalized_stages


def _parse_role_tokens(value) -> list[str]:
    if isinstance(value, list):
        sources = value
    else:
        sources = re.split(r"[，,、;；/\n]+", str(value or ""))
    return _normalize_text_list(sources)


def create_empty_document(name: str) -> dict:
    return migrate_document(
        {
            "meta": {"title": name, "domain": "", "author": "", "date": ""},
            "roles": [],
            "language": [],
            "stages": [],
            "stageLinks": [],
            "stageFlowRefs": [],
            "stageFlowLinks": [],
            "processes": [
                {
                    "id": "P1",
                    "name": DEFAULT_PROCESS_NAME,
                    "subDomain": "",
                    "flowGroup": "",
                    "stageId": "",
                    "stagePos": {"x": 0, "y": 0},
                    "trigger": "",
                    "outcome": "",
                    "prototypeFiles": [],
                    "nodes": [],
                }
            ],
            "entities": [],
            "relations": [],
            "rules": [],
        }
    )


def normalize_step_type(step_type: str) -> str:
    if not step_type:
        return ""
    return STEP_TYPE_ALIASES.get(step_type.strip().casefold(), step_type)


def normalize_orchestration_type(task_type: str) -> str:
    if not task_type:
        return "Custom"
    return ORCHESTRATION_TYPE_ALIASES.get(task_type.strip().casefold(), task_type)


def normalize_query_source_kind(kind: str) -> str:
    if not kind:
        return ""
    return QUERY_SOURCE_KIND_ALIASES.get(kind.strip().casefold(), kind)


def normalize_task_parameters(value) -> dict:
    raw = value if isinstance(value, dict) else {}

    def normalize_list(items) -> list[dict]:
        if not isinstance(items, list):
            return []
        normalized: list[dict] = []
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            param = dict(item)
            _ensure_uid(param, prefix="param")
            param["name"] = str(param.get("name", "")).strip()
            param["type"] = str(param.get("type", "")).strip()
            param["required"] = bool(param.get("required", False))
            param["description"] = str(param.get("description", param.get("note", ""))).strip()
            param["example"] = str(param.get("example", "")).strip()
            if not param["name"] and not param["type"] and not param["description"] and not param["example"]:
                param["name"] = f"参数{index}"
            normalized.append(param)
        return normalized

    return {
        "inputs": normalize_list(raw.get("inputs")),
        "outputs": normalize_list(raw.get("outputs")),
    }


def normalize_field_type(field_type: str) -> str:
    if not field_type:
        return "string"
    return FIELD_TYPE_ALIASES.get(field_type.strip().casefold(), field_type.casefold())


def normalize_status_role(status_role: str, fallback_is_status: bool = False) -> str:
    raw = str(status_role or "").strip().casefold()
    if raw in {"primary", "main", "master"}:
        return "primary"
    if raw in {"secondary", "sub", "child"}:
        return "secondary"
    return "primary" if fallback_is_status else ""


def normalize_state_node_kind(kind: str) -> str:
    raw = str(kind or "").strip().casefold()
    if raw in {"initial", "start", "entry"}:
        return "initial"
    if raw in {"terminal", "end", "finish", "final"}:
        return "terminal"
    return "intermediate"


def _normalize_slash_list(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split("/") if item.strip()]


def _get_field_state_values(field: dict) -> list[str]:
    explicit = str(field.get("state_values", "")).strip()
    if explicit:
        return _normalize_slash_list(explicit)
    note = str(field.get("note", "")).strip()
    parts = _normalize_slash_list(note)
    if parts and all(len(item) <= 16 for item in parts):
        return parts
    return []


def _infer_default_state_node_kind(index: int, total: int) -> str:
    if total <= 1:
        return "intermediate"
    if index == 0:
        return "initial"
    if index == total - 1:
        return "terminal"
    return "intermediate"


def _normalize_state_nodes(raw_nodes: list[dict], state_values: list[str]) -> list[dict]:
    existing_nodes: dict[str, dict] = {}
    for item in raw_nodes or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        existing_nodes[name] = item
    normalized_nodes: list[dict] = []
    for index, state_name in enumerate(state_values):
        existing = existing_nodes.get(state_name, {})
        node = {
            "name": state_name,
            "kind": normalize_state_node_kind(existing.get("kind", ""))
            if "kind" in existing
            else _infer_default_state_node_kind(index, len(state_values)),
        }
        pos = _normalize_optional_graph_offset(existing.get("pos"))
        marker_pos = _normalize_optional_graph_offset(existing.get("markerPos"))
        if pos is not None:
            node["pos"] = pos
        if marker_pos is not None:
            node["markerPos"] = marker_pos
        normalized_nodes.append(node)
    return normalized_nodes


def normalize_role_name(role_name: str) -> str:
    return str(role_name or "").strip()


def infer_role_group(role_name: str, tags: list[str] | None = None) -> str:
    normalized_name = normalize_role_name(role_name)
    if "系统" in normalized_name or "自动化" in normalized_name:
        return "系统角色"
    if "仓库" in normalized_name or "现场" in normalized_name or "作业" in normalized_name:
        return "仓库作业方"
    if (
        "平台管理员" in normalized_name
        or "超级账号" in normalized_name
        or "平台管理" in normalized_name
        or "账号管理" in normalized_name
        or "运维" in normalized_name
    ):
        return "平台与运维方"
    if (
        "交易部" in normalized_name
        or "机构" in normalized_name
        or "品种负责人" in normalized_name
        or "监管" in normalized_name
        or "审核" in normalized_name
    ):
        return "监管与审核方"
    if not normalized_name:
        return "待分类角色"
    return "业务参与方"




def _normalize_role(raw_role, existing_roles: list[dict]) -> dict | None:
    if isinstance(raw_role, dict):
        role_name = normalize_role_name(raw_role.get("name", ""))
        if not role_name:
            return None
        role_uid = str(raw_role.get("uid", "")).strip() or _deterministic_uid("role", role_name)
        # ensure uid uniqueness within existing roles
        if any(existing.get("uid") == role_uid for existing in existing_roles):
            role_uid = _deterministic_uid("role", role_name, str(len(existing_roles)))
        role = {
            "uid": role_uid,
            "name": role_name,
            "desc": normalize_role_name(raw_role.get("desc", "")),
            "group": normalize_role_name(raw_role.get("group", "")) or infer_role_group(
                role_name, raw_role.get("tags", [])
            ),
            "subDomains": _normalize_text_list(raw_role.get("subDomains", [])),
        }
        return role

    role_name = normalize_role_name(raw_role)
    if not role_name:
        return None
    return {
        "uid": _deterministic_uid("role", role_name),
        "name": role_name,
        "desc": "",
        "group": infer_role_group(role_name, []),
        "subDomains": [],
    }


def _merge_role(target: dict, source: dict) -> dict:
    if not target.get("desc") and source.get("desc"):
        target["desc"] = source["desc"]
    if not target.get("group") and source.get("group"):
        target["group"] = source["group"]
    target["subDomains"] = _normalize_text_list([*target.get("subDomains", []), *source.get("subDomains", [])])
    return target


def _ensure_role(
    roles: list[dict],
    roles_by_uid: dict[str, dict],
    roles_by_name: dict[str, dict],
    *,
    role_uid: str = "",
    role_name: str = "",
) -> dict | None:
    normalized_uid = str(role_uid or "").strip()
    normalized_name = normalize_role_name(role_name)

    if normalized_uid and normalized_uid in roles_by_uid:
        role = roles_by_uid[normalized_uid]
        if normalized_name and role["name"] != normalized_name:
            roles_by_name.pop(role["name"], None)
            role["name"] = normalized_name
            roles_by_name[normalized_name] = role
        return role

    if normalized_name and normalized_name in roles_by_name:
        role = roles_by_name[normalized_name]
        if normalized_uid:
            roles_by_uid[normalized_uid] = role
        return role

    if not normalized_name:
        return None

    role = _normalize_role({"uid": normalized_uid, "name": normalized_name}, roles)
    if not role:
        return None
    roles.append(role)
    roles_by_uid[role["uid"]] = role
    roles_by_name[role["name"]] = role
    return role


def _normalize_meta(meta: dict) -> dict:
    meta.setdefault("title", "")
    meta.setdefault("domain", "")
    meta.setdefault("author", "")
    meta.setdefault("date", "")
    meta["document_uid"] = str(meta.get("document_uid", "")).strip() or _new_uid()
    meta["schema_version"] = SCHEMA_VERSION
    meta.pop("bounded_context", None)
    return meta


def _normalize_uploaded_at(uploaded_at: str) -> str:
    return str(uploaded_at or "").strip()


def _normalize_prototype_versions(prototype: dict, prototype_index: int) -> tuple[list[dict], dict]:
    normalized_name = str(prototype.get("name", "")).strip() or f"原型{prototype_index}.html"
    version_sources = prototype.get("versions", [])
    if not isinstance(version_sources, list) or not version_sources:
        version_sources = [
            {
                "uid": str(prototype.get("versionUid", "")).strip() or str(prototype.get("currentVersionUid", "")).strip(),
                "number": 1,
                "name": normalized_name,
                "content": str(prototype.get("content", "")),
                "contentType": str(prototype.get("contentType", "text/html")).strip() or "text/html",
                "contentEncoding": str(prototype.get("contentEncoding", "")).strip(),
                "uploadToken": str(prototype.get("uploadToken", "")).strip(),
                "localUrl": str(prototype.get("localUrl", "")).strip(),
                "size": int(prototype.get("size") or 0),
                "uploadedAt": _normalize_uploaded_at(prototype.get("uploadedAt", "")),
            }
        ]

    normalized_versions: list[dict] = []
    for version_index, version in enumerate(version_sources, start=1):
        raw_version = version if isinstance(version, dict) else {"name": normalized_name, "content": str(version or "")}
        version_name = str(raw_version.get("name", "")).strip() or normalized_name
        try:
            version_number = int(raw_version.get("number") or version_index)
        except (TypeError, ValueError):
            version_number = version_index
        if version_number < 1:
            version_number = version_index
        normalized_versions.append(
            {
                "uid": str(raw_version.get("uid", "")).strip() or _new_uid(),
                "number": version_number,
                "name": version_name,
                "content": str(raw_version.get("content", "")),
                "contentType": str(raw_version.get("contentType", "text/html")).strip() or "text/html",
                "contentEncoding": str(raw_version.get("contentEncoding", "")).strip(),
                "uploadToken": str(raw_version.get("uploadToken", "")).strip(),
                "localUrl": str(raw_version.get("localUrl", "")).strip(),
                "size": int(raw_version.get("size") or 0),
                "uploadedAt": _normalize_uploaded_at(raw_version.get("uploadedAt", "")),
            }
        )

    normalized_versions.sort(key=lambda item: (item["number"], item["uid"]))
    for version_index, version in enumerate(normalized_versions, start=1):
        version["number"] = version_index

    version_uid = (
        str(prototype.get("versionUid", "")).strip()
        or str(prototype.get("currentVersionUid", "")).strip()
        or normalized_versions[-1]["uid"]
    )
    current_version = next((item for item in normalized_versions if item["uid"] == version_uid), normalized_versions[-1])
    return normalized_versions, current_version


def _normalize_rules(rules: list[dict]) -> None:
    for rule in rules:
        _ensure_uid(rule, prefix="rule")
        rule.setdefault("name", "")
        rule.setdefault("type", "")
        rule.setdefault("applies_to", "")
        rule.setdefault("description", "")
        rule.setdefault("formula", "")


def _normalize_language(language: list[dict]) -> None:
    for item in language:
        _ensure_uid(item, prefix="item")
        item.setdefault("term", "")
        item.setdefault("definition", "")


def _normalize_relations(relations: list[dict]) -> None:
    for relation in relations:
        _ensure_uid(relation, prefix="relation")
        relation.setdefault("from", "")
        relation.setdefault("to", "")
        relation.setdefault("type", "")
        relation.setdefault("label", "")


def _format_business_rules_text(rules: list[dict]) -> str:
    lines = []
    for rule in rules:
        name = str(rule.get("name", "")).strip()
        content = str(rule.get("content", "")).strip()
        if not name and not content:
            continue
        if not name:
            lines.append(content)
        elif not content:
            lines.append(name)
        else:
            lines.append(f"{name}：{content}")
    return "\n".join(lines)


def _normalize_node_business_rules(node: dict) -> None:
    has_explicit_rules = "businessRules" in node or "business_rules" in node
    raw_rules = node.get("businessRules", node.pop("business_rules", []))
    if not isinstance(raw_rules, list):
        raw_rules = []
    rules = []
    for index, raw_rule in enumerate(raw_rules, start=1):
        rule = raw_rule if isinstance(raw_rule, dict) else {"content": str(raw_rule or "").strip()}
        _ensure_uid(rule, prefix="rule")
        # uid already set
        rule["name"] = str(rule.get("name", rule.get("title", f"规则{index}")) or "").strip()
        rule["content"] = str(
            rule.get("content", rule.get("description", rule.get("note", ""))) or ""
        ).strip()
        rules.append(rule)

    legacy_note = str(node.get("rules_note", "") or "").strip()
    if not rules and legacy_note and not has_explicit_rules:
        rules.append(
            {
                "uid": _new_uid(),
                "id": "BR1",
                "name": "业务规则",
                "content": legacy_note,
            }
        )

    node["businessRules"] = rules
    node["rules_note"] = _format_business_rules_text(rules) or legacy_note


def _normalize_entities(entities: list[dict]) -> None:
    for entity_index, entity in enumerate(entities, start=1):
        _ensure_uid(entity, prefix="entity")
        # uid already set by _ensure_uid
        entity.setdefault("name", "")
        entity.setdefault("group", "")
        entity.setdefault("note", "")
        entity.setdefault("fields", [])
        entity.setdefault("state_transitions", [])

        primary_status_assigned = False
        for field in entity["fields"]:
            _ensure_uid(field, prefix="field")
            is_key = bool(field.pop("pk", field.get("is_key", False)))
            legacy_is_status = bool(field.pop("status", field.get("is_status", False)))
            status_role = normalize_status_role(
                field.pop("statusRole", field.get("status_role", "")),
                legacy_is_status,
            )
            if status_role == "primary":
                if primary_status_assigned:
                    status_role = "secondary"
                else:
                    primary_status_assigned = True
            field.setdefault("name", "")
            field.setdefault("note", "")
            field["type"] = normalize_field_type(field.get("type", "string"))
            field["is_key"] = is_key
            field["status_role"] = status_role
            field["is_status"] = bool(status_role)
            field.setdefault("state_values", "")
            field["state_nodes"] = _normalize_state_nodes(
                field.pop("stateNodes", field.get("state_nodes", [])),
                _get_field_state_values(field),
            )

        normalized_transitions = []
        status_fields = [field.get("name", "") for field in entity["fields"] if field.get("is_status")]
        primary_status_fields = [
            field.get("name", "")
            for field in entity["fields"]
            if field.get("status_role") == "primary"
        ]
        default_field_name = (
            primary_status_fields[0]
            if primary_status_fields
            else (status_fields[0] if len(status_fields) == 1 else "")
        )
        for transition in entity["state_transitions"]:
            transition_uid = str(transition.get("uid", "")).strip() or _new_uid()
            normalized_transition = {
                "uid": transition_uid,
                "from": str(transition.get("from", "")).strip(),
                "to": str(transition.get("to", "")).strip(),
                "action": str(transition.get("action", "")).strip(),
                "note": str(transition.get("note", "")).strip(),
                "field_name": str(transition.get("field_name", default_field_name)).strip(),
            }
            label_pos = _normalize_optional_graph_offset(transition.get("labelPos"))
            if label_pos is not None:
                normalized_transition["labelPos"] = label_pos
            normalized_transitions.append(normalized_transition)
        entity["state_transitions"] = normalized_transitions


def _normalize_node_forms(node: dict) -> None:
    forms = node.get("forms", [])
    if not isinstance(forms, list):
        forms = []
    normalized_forms: list[dict] = []
    for form_index, raw_form in enumerate(forms, start=1):
        if not isinstance(raw_form, dict):
            continue
        form = raw_form
        _ensure_uid(form, prefix="form")
        # uid already set by _ensure_uid
        form["name"] = str(form.get("name", "")).strip()
        form["purpose"] = str(form.get("purpose", "")).strip()
        legacy_entity_id = str(form.get("entity_id") or form.get("entityId") or "").strip()
        form["entity_id"] = legacy_entity_id
        sections = form.get("sections", [])
        if not isinstance(sections, list):
            sections = []
        if not sections:
            sections = [{"id": "SEC1", "name": "基本信息", "note": "", "entity_id": legacy_entity_id, "fields": []}]
        normalized_sections: list[dict] = []
        for section_index, raw_section in enumerate(sections, start=1):
            if not isinstance(raw_section, dict):
                continue
            section = raw_section
            _ensure_uid(section, prefix="section")
            # uid already set by _ensure_uid
            section["name"] = str(section.get("name", "")).strip()
            section["note"] = str(section.get("note", "")).strip()
            section["entity_id"] = str(
                section.get("entity_id") or section.get("entityId") or legacy_entity_id
            ).strip()
            fields = section.get("fields", [])
            if not isinstance(fields, list):
                fields = []
            normalized_fields: list[dict] = []
            for field_index, raw_field in enumerate(fields, start=1):
                if not isinstance(raw_field, dict):
                    continue
                field = raw_field
                _ensure_uid(field, prefix="field")
                # uid already set by _ensure_uid
                field["name"] = str(field.get("name", "")).strip()
                field["type"] = str(field.get("type", "Text") or "Text").strip()
                field["required"] = bool(field.get("required"))
                field["entity_field"] = str(field.get("entity_field") or field.get("entityField") or "").strip()
                field["note"] = str(field.get("note", "")).strip()
                normalized_fields.append(field)
            section["fields"] = normalized_fields
            normalized_sections.append(section)
        form["sections"] = normalized_sections
        normalized_forms.append(form)
    node["forms"] = normalized_forms


def _normalize_processes(processes: list[dict], roles: list[dict]) -> None:
    roles_by_uid = {role["uid"]: role for role in roles}
    roles_by_name = {role["name"]: role for role in roles}

    for process_index, process in enumerate(processes, start=1):
        _ensure_uid(process, prefix="process")
        _pop_legacy_business_component_fields(process)
        process.setdefault("name", DEFAULT_PROCESS_NAME if process_index == 1 else f"\u6d41\u7a0b{process_index}")
        process.setdefault("trigger", "")
        process.setdefault("outcome", "")
        process.setdefault("subDomain", "")
        process.setdefault("flowGroup", "")
        process["stageId"] = str(process.get("stageId") or process.get("stageUid") or process.pop("stage_id", "") or "").strip()
        process["stagePos"] = _normalize_graph_offset(process.get("stagePos", process.pop("stage_pos", {})))
        normalized_prototypes = []
        prototype_sources = process.get("prototypeFiles", [])
        if not isinstance(prototype_sources, list):
            prototype_sources = []
        for prototype_index, prototype in enumerate(prototype_sources, start=1):
            normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
            _ensure_uid(normalized, prefix="proto")
            normalized_versions, current_version = _normalize_prototype_versions(normalized, prototype_index)
            normalized_prototypes.append(
                {
                    "uid": normalized["uid"],
                    "name": str(normalized.get("name", "")).strip() or current_version["name"],
                    "versionUid": current_version["uid"],
                    "content": current_version["content"],
                    "contentType": current_version["contentType"],
                    "contentEncoding": current_version["contentEncoding"],
                    "size": current_version["size"],
                    "uploadedAt": current_version["uploadedAt"],
                    "versions": normalized_versions,
                }
            )
        process["prototypeFiles"] = normalized_prototypes
        legacy_nodes = process.pop("tasks", None)
        if "nodes" not in process:
            process["nodes"] = legacy_nodes or []
        elif isinstance(legacy_nodes, list) and legacy_nodes:
            process["nodes"].extend(legacy_nodes)

        for node_index, node in enumerate(process["nodes"], start=1):
            _ensure_uid(node, prefix="node")
            _pop_legacy_business_component_fields(node)
            node.setdefault("name", "")
            node_roles: list[dict] = []
            seen_role_uids: set[str] = set()

            def push_node_role(role: dict | None) -> None:
                if not role or role["uid"] in seen_role_uids:
                    return
                seen_role_uids.add(role["uid"])
                node_roles.append(role)

            raw_role_uids = []
            if node.get("role_uid"):
                raw_role_uids.append(node.get("role_uid", ""))
            if isinstance(node.get("role_uids"), list):
                raw_role_uids.extend(node.get("role_uids", []))
            if isinstance(node.get("role_ids"), list):
                raw_role_uids.extend(node.get("role_ids", []))

            for raw_role_uid in raw_role_uids:
                push_node_role(
                    _ensure_role(
                        roles,
                        roles_by_uid,
                        roles_by_name,
                        role_uid=raw_role_uid,
                    )
                )

            raw_role_names = []
            if isinstance(node.get("roles"), list):
                raw_role_names.extend(node.get("roles", []))
            else:
                raw_role_names.extend(_parse_role_tokens(node.get("roles", "")))
            raw_role_names.extend(_parse_role_tokens(node.get("role", "")))

            for raw_role_name in raw_role_names:
                push_node_role(
                    _ensure_role(
                        roles,
                        roles_by_uid,
                        roles_by_name,
                        role_name=raw_role_name,
                    )
                )

            process_sub_domain = normalize_role_name(process.get("subDomain", ""))
            for node_role in node_roles:
                if process_sub_domain and process_sub_domain not in node_role["subDomains"]:
                    node_role["subDomains"].append(process_sub_domain)

            node["role_uids"] = [role["uid"] for role in node_roles]
            node["roles"] = [role["name"] for role in node_roles]
            node["role_uid"] = node["role_uids"][0] if node["role_uids"] else ""
            node["role"] = "、".join(node["roles"])
            node.setdefault("repeatable", False)
            legacy_steps = node.pop("steps", None)
            if "userSteps" not in node:
                node["userSteps"] = legacy_steps or []
            elif isinstance(legacy_steps, list) and legacy_steps:
                node["userSteps"].extend(legacy_steps)
            node.setdefault("entity_ops", [])
            node.setdefault("rules_note", "")
            _normalize_node_business_rules(node)
            node.setdefault("orchestrationTasks", [])
            _normalize_node_forms(node)

            for step in node["userSteps"]:
                _ensure_uid(step)
                step.setdefault("name", "")
                step.setdefault("note", "")
                step["type"] = normalize_step_type(step.get("type", ""))

            for entity_op in node["entity_ops"]:
                _ensure_uid(entity_op)
                entity_op.setdefault("entity_id", "")
                entity_op["ops"] = list(entity_op.get("ops", []))

            for orchestration_task in node["orchestrationTasks"]:
                _ensure_uid(orchestration_task)
                _pop_legacy_business_component_fields(orchestration_task)
                orchestration_task.setdefault("name", "")
                orchestration_task.setdefault("target", "")
                orchestration_task["address"] = str(orchestration_task.get("address", "")).strip()
                orchestration_task["parameters"] = normalize_task_parameters(orchestration_task.get("parameters"))
                orchestration_task.setdefault("note", "")
                orchestration_task["type"] = normalize_orchestration_type(
                    orchestration_task.get("type", "Custom")
                )
                query_source_kind = normalize_query_source_kind(
                    orchestration_task.get("querySourceKind", "")
                )
                orchestration_task["querySourceKind"] = (
                    query_source_kind if orchestration_task["type"] == "Query" else ""
                )

        raw_flow = process.get("flow")
        if not isinstance(raw_flow, dict):
            raw_flow = {}
        task_uids = {str(node.get("uid", "")).strip() for node in process["nodes"] if str(node.get("uid", "")).strip()}
        flow_ref_map = {
            str(node.get("uid", "")).strip(): str(node.get("uid", "")).strip()
            for node in process["nodes"]
            if str(node.get("uid", "")).strip()
        }
        for node in process["nodes"]:
            node_uid = str(node.get("uid", "")).strip()
            legacy_node_id = str(node.get("id", "")).strip()
            if node_uid and legacy_node_id:
                flow_ref_map[legacy_node_id] = node_uid
        flow_nodes = []
        flow_node_uids = set()
        for flow_node_index, flow_node in enumerate(raw_flow.get("nodes", []), start=1):
            if not isinstance(flow_node, dict):
                continue
            if str(flow_node.get("kind", "")).strip() != "gateway":
                continue
            _ensure_uid(flow_node)
            node_uid = str(flow_node.get("uid", "")).strip()
            if not node_uid or node_uid in flow_node_uids or node_uid in task_uids:
                continue
            flow_node_uids.add(node_uid)
            normalized_flow_node = dict(flow_node)
            normalized_flow_node["kind"] = "gateway"
            normalized_flow_node["title"] = str(
                flow_node.get("title") or flow_node.get("name") or ""
            ).strip()
            normalized_flow_node["gatewayType"] = str(
                flow_node.get("gatewayType") or "exclusive"
            ).strip() or "exclusive"
            normalized_flow_node["role_uid"] = str(
                flow_node.get("role_uid") or flow_node.get("role_id") or flow_node.get("roleId") or ""
            ).strip()
            legacy_flow_node_id = str(flow_node.get("id", "")).strip()
            if legacy_flow_node_id:
                flow_ref_map[legacy_flow_node_id] = node_uid
            flow_nodes.append(normalized_flow_node)

        valid_flow_node_uids = task_uids | flow_node_uids

        def normalize_process_flow_endpoint(value: object, side: str) -> str:
            endpoint = str(value or "").strip()
            if side == "from" and endpoint == "START":
                return "START"
            if side == "to" and endpoint == "END":
                return "END"
            return flow_ref_map.get(endpoint, endpoint)

        flow_edges = []
        seen_flow_edges = set()
        for edge_index, edge in enumerate(raw_flow.get("edges", []), start=1):
            if not isinstance(edge, dict):
                continue
            source = normalize_process_flow_endpoint(edge.get("from") or edge.get("source"), "from")
            target = normalize_process_flow_endpoint(edge.get("to") or edge.get("target"), "to")
            is_draft_edge = not source or not target
            if (
                target == "START"
                or source == "END"
                or (source and source != "START" and source not in valid_flow_node_uids)
                or (target and target != "END" and target not in valid_flow_node_uids)
            ):
                continue
            edge_key = (source, target)
            if not is_draft_edge:
                if edge_key in seen_flow_edges:
                    continue
                seen_flow_edges.add(edge_key)
            normalized_edge = dict(edge)
            _ensure_uid(normalized_edge)
            # uid already set by _ensure_uid at caller or from input
            normalized_edge["from"] = source
            normalized_edge["to"] = target
            normalized_edge["label"] = str(edge.get("label") or edge.get("name") or "").strip()
            normalized_edge["condition"] = str(edge.get("condition") or "").strip()
            flow_edges.append(normalized_edge)

        process["flow"] = {
            "version": int(raw_flow.get("version") or 2),
            "orientation": "vertical" if raw_flow.get("orientation") == "vertical" else "horizontal",
            "nodes": flow_nodes,
            "edges": flow_edges,
            "layout": {
                "swimlane": {
                    "laneOrder": [],
                    "items": {},
                    "labels": {},
                }
            },
        }
        raw_layout = raw_flow.get("layout")
        raw_swimlane = raw_layout.get("swimlane") if isinstance(raw_layout, dict) else None
        if isinstance(raw_swimlane, dict):
            process["flow"]["layout"]["swimlane"]["laneOrder"] = [
                str(item).strip()
                for item in raw_swimlane.get("laneOrder", [])
                if str(item).strip()
            ] if isinstance(raw_swimlane.get("laneOrder"), list) else []

            def normalize_offset_map(value: object) -> dict:
                if not isinstance(value, dict):
                    return {}
                normalized_offsets = {}
                for key, offset in value.items():
                    if not isinstance(offset, dict) or not str(key).strip():
                        continue
                    try:
                        dx = round(float(offset.get("dx", 0) or 0))
                        dy = round(float(offset.get("dy", 0) or 0))
                    except (TypeError, ValueError):
                        continue
                    normalized_offsets[str(key)] = {"dx": dx, "dy": dy}
                return normalized_offsets

            process["flow"]["layout"]["swimlane"]["items"] = normalize_offset_map(raw_swimlane.get("items"))
            process["flow"]["layout"]["swimlane"]["labels"] = normalize_offset_map(raw_swimlane.get("labels"))



def migrate_document(document: dict | None) -> dict:
    doc = deepcopy(document or {})
    if (
        isinstance(doc.get("document"), dict)
        and not any(key in doc for key in ("roles", "stages", "processes", "entities", "businessComponents"))
    ):
        doc = deepcopy(doc["document"])
    _rename_legacy_business_component_keys(doc)
    meta = _normalize_meta(doc.setdefault("meta", {}))

    if "process" in doc and "processes" not in doc:
        legacy_process = doc.pop("process") or {}
        doc["processes"] = [
            {
                "id": "P1",
                "name": legacy_process.get("name", DEFAULT_PROCESS_NAME),
                "subDomain": legacy_process.get("subDomain", ""),
                "flowGroup": legacy_process.get("flowGroup", ""),
                "stageId": legacy_process.get("stageId", ""),
                "stagePos": legacy_process.get("stagePos", {}),
                "trigger": legacy_process.get("trigger", ""),
                "outcome": legacy_process.get("outcome", ""),
                "prototypeFiles": legacy_process.get("prototypeFiles", []),
                "nodes": legacy_process.get("nodes", legacy_process.get("tasks", [])),
            }
        ]

    doc.setdefault("roles", [])
    doc.setdefault("language", [])
    doc.setdefault("stages", [])
    doc.setdefault("stageLinks", [])
    doc.setdefault("stageFlowRefs", [])
    doc.setdefault("stageFlowLinks", [])
    doc.setdefault("processes", [])
    doc.setdefault("entities", [])
    doc.setdefault("relations", [])
    doc.setdefault("rules", [])
    for legacy_field, current_field in LEGACY_COLLECTION_RENAMES.items():
        if current_field not in doc and legacy_field in doc:
            doc[current_field] = doc.pop(legacy_field)
        else:
            doc.pop(legacy_field, None)
    doc.setdefault("businessComponents", [])
    doc.setdefault("businessConstructs", [])
    doc.setdefault("taskDefinitions", [])

    normalized_roles: list[dict] = []
    roles_by_uid: dict[str, dict] = {}
    roles_by_name: dict[str, dict] = {}
    for raw_role in doc["roles"]:
        role = _normalize_role(raw_role, normalized_roles)
        if not role:
            continue
        existing_role = roles_by_name.get(role["name"])
        if existing_role:
            _merge_role(existing_role, role)
            continue
        normalized_roles.append(role)
        roles_by_uid[role["uid"]] = role
        roles_by_name[role["name"]] = role
    doc["roles"] = normalized_roles

    _normalize_processes(doc["processes"], doc["roles"])
    _normalize_stages(doc["stages"], doc["processes"])
    doc["stageLinks"] = _normalize_stage_links(doc["stageLinks"])
    doc["stageFlowRefs"] = _normalize_stage_flow_refs(doc["stageFlowRefs"])
    doc["stageFlowLinks"] = _normalize_stage_flow_links(doc["stageFlowLinks"])
    _normalize_entities(doc["entities"])
    _normalize_relations(doc["relations"])
    _normalize_rules(doc["rules"])
    _normalize_language(doc["language"])

    for component_index, component in enumerate(doc.get("businessComponents", []), start=1):
        if not isinstance(component, dict):
            continue
        _ensure_uid(component)
        component["name"] = str(component.get("name") or f"业务组件{component_index}").strip()
        component["kind"] = str(component.get("kind", "")).strip()
        component["note"] = str(component.get("note", "")).strip()
        for field in ("constructIds", "taskDefinitionIds", "entityIds"):
            component[field] = list(component.get(field, [])) if isinstance(component.get(field), list) else []

    for construct_index, construct in enumerate(doc.get("businessConstructs", []), start=1):
        if not isinstance(construct, dict):
            continue
        _ensure_uid(construct)
        _pop_legacy_business_component_fields(construct)
        construct["name"] = str(construct.get("name") or f"业务构件{construct_index}").strip()
        construct["note"] = str(construct.get("note", "")).strip()
        construct["businessComponentId"] = str(construct.get("businessComponentId", "")).strip()
        construct["businessComponent"] = str(construct.get("businessComponent", "")).strip()
        for field in ("taskDefinitionIds", "entityIds"):
            construct[field] = list(construct.get(field, [])) if isinstance(construct.get(field), list) else []

    for task_index, task_definition in enumerate(doc.get("taskDefinitions", []), start=1):
        if not isinstance(task_definition, dict):
            continue
        _ensure_uid(task_definition)
        _pop_legacy_business_component_fields(task_definition)
        task_definition["name"] = str(task_definition.get("name") or f"任务定义{task_index}").strip()
        task_definition["type"] = normalize_orchestration_type(task_definition.get("type", "Custom"))
        query_source_kind = normalize_query_source_kind(task_definition.get("querySourceKind", ""))
        task_definition["querySourceKind"] = query_source_kind if task_definition["type"] == "Query" else ""
        task_definition["target"] = str(task_definition.get("target", "")).strip()
        task_definition["address"] = str(task_definition.get("address", "")).strip()
        task_definition["parameters"] = normalize_task_parameters(task_definition.get("parameters"))
        task_definition["note"] = str(task_definition.get("note", "")).strip()
        task_definition["businessComponentId"] = str(task_definition.get("businessComponentId", "")).strip()
        task_definition["businessComponent"] = str(task_definition.get("businessComponent", "")).strip()
        task_definition["constructId"] = str(task_definition.get("constructId", "")).strip()
        task_definition["constructName"] = str(task_definition.get("constructName", "")).strip()
        task_definition["entityIds"] = list(task_definition.get("entityIds", [])) if isinstance(task_definition.get("entityIds"), list) else []

    doc["meta"] = meta
    return doc
