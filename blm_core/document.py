from __future__ import annotations

import re
from copy import deepcopy
from uuid import uuid4


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


def _ensure_uid(item: dict) -> str:
    uid = str(item.get("uid", "")).strip()
    if not uid:
        uid = _new_uid()
        item["uid"] = uid
    return uid


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


def _next_seq_id(prefix: str, used_ids: set[str]) -> str:
    index = 1
    while f"{prefix}{index}" in used_ids:
        index += 1
    next_id = f"{prefix}{index}"
    used_ids.add(next_id)
    return next_id


def _normalize_positive_int(value, fallback: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = fallback
    return normalized if normalized > 0 else fallback


def _normalize_stage_flow_refs(stage_flow_refs: list[dict]) -> list[dict]:
    normalized_refs: list[dict] = []
    used_ids: set[str] = set()
    for ref_index, ref in enumerate(stage_flow_refs or [], start=1):
        if not isinstance(ref, dict):
            continue
        ref_id = str(ref.get("id", "")).strip()
        if not ref_id or ref_id in used_ids:
            ref_id = _next_seq_id("SFR", used_ids)
        else:
            used_ids.add(ref_id)
        normalized_refs.append(
            {
                "uid": str(ref.get("uid", "")).strip() or _new_uid(),
                "id": ref_id,
                "stageId": str(ref.get("stageId", ref.get("stage_id", ""))).strip(),
                "processId": str(ref.get("processId", ref.get("process_id", ""))).strip(),
                "order": _normalize_positive_int(ref.get("order"), ref_index),
                "pos": _normalize_graph_offset(ref.get("pos", {})),
            }
        )
    return normalized_refs


def _normalize_stage_flow_links(stage_flow_links: list[dict]) -> list[dict]:
    normalized_links: list[dict] = []
    used_ids: set[str] = set()
    for link_index, link in enumerate(stage_flow_links or [], start=1):
        if not isinstance(link, dict):
            continue
        link_id = str(link.get("id", "")).strip()
        if not link_id or link_id in used_ids:
            link_id = _next_seq_id("SFL", used_ids)
        else:
            used_ids.add(link_id)
        normalized_links.append(
            {
                "uid": str(link.get("uid", "")).strip() or _new_uid(),
                "id": link_id,
                "stageId": str(link.get("stageId", link.get("stage_id", ""))).strip(),
                "fromRefId": str(link.get("fromRefId", link.get("from_ref_id", ""))).strip(),
                "toRefId": str(link.get("toRefId", link.get("to_ref_id", ""))).strip(),
            }
        )
    return normalized_links


def _supplement_stage_flow_refs_from_legacy(stage_flow_refs: list[dict], processes: list[dict]) -> list[dict]:
    existing_pairs = {
        (str(ref.get("stageId", "")).strip(), str(ref.get("processId", "")).strip())
        for ref in stage_flow_refs
        if str(ref.get("stageId", "")).strip() and str(ref.get("processId", "")).strip()
    }
    used_ids = {str(ref.get("id", "")).strip() for ref in stage_flow_refs if str(ref.get("id", "")).strip()}
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
        process_id = str(process.get("id", "")).strip()
        if not stage_id or not process_id:
            continue
        pair = (stage_id, process_id)
        if pair in existing_pairs:
            continue
        stage_orders[stage_id] = stage_orders.get(stage_id, 0) + 1
        supplemented.append(
            {
                "uid": _new_uid(),
                "id": _next_seq_id("SFR", used_ids),
                "stageId": stage_id,
                "processId": process_id,
                "order": stage_orders[stage_id],
                "pos": _normalize_graph_offset(process.get("stagePos", {})),
            }
        )
        existing_pairs.add(pair)
    return supplemented


def _build_stage_flow_links_from_legacy(stages: list[dict], stage_flow_refs: list[dict]) -> list[dict]:
    refs_by_stage_process: dict[tuple[str, str], str] = {}
    used_ids: set[str] = set()
    generated: list[dict] = []
    for ref in stage_flow_refs:
        stage_id = str(ref.get("stageId", "")).strip()
        process_id = str(ref.get("processId", "")).strip()
        ref_id = str(ref.get("id", "")).strip()
        if not stage_id or not process_id or not ref_id:
            continue
        refs_by_stage_process.setdefault((stage_id, process_id), ref_id)

    for stage in stages or []:
        stage_id = str(stage.get("id", "")).strip()
        if not stage_id:
            continue
        for link in stage.get("processLinks", []):
            from_process_id = str(link.get("fromProcessId", "")).strip()
            to_process_id = str(link.get("toProcessId", "")).strip()
            from_ref_id = refs_by_stage_process.get((stage_id, from_process_id), "")
            to_ref_id = refs_by_stage_process.get((stage_id, to_process_id), "")
            if not from_ref_id or not to_ref_id:
                continue
            generated.append(
                {
                    "uid": _new_uid(),
                    "id": _next_seq_id("SFL", used_ids),
                    "stageId": stage_id,
                    "fromRefId": from_ref_id,
                    "toRefId": to_ref_id,
                }
            )
    return generated


def _normalize_stages(stages: list[dict], processes: list[dict]) -> None:
    normalized_stages: list[dict] = []
    for stage_index, stage in enumerate(stages, start=1):
        if not isinstance(stage, dict):
            continue
        _ensure_uid(stage)
        stage.setdefault("id", f"S{stage_index}")
        stage.setdefault("name", f"{DEFAULT_STAGE_NAME}{stage_index}")
        if not stage.get("subDomain"):
            stage_process = next(
                (
                    process
                    for process in processes
                    if str(process.get("stageId", "")).strip() == stage.get("id", "")
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


def _next_role_id(existing_roles: list[dict]) -> str:
    used = {normalize_role_name(role.get("id", "")) for role in existing_roles if isinstance(role, dict)}
    index = 1
    while f"R{index}" in used:
        index += 1
    return f"R{index}"


def _normalize_role(raw_role, existing_roles: list[dict]) -> dict | None:
    if isinstance(raw_role, dict):
        role_name = normalize_role_name(raw_role.get("name", ""))
        if not role_name:
            return None
        role_id = normalize_role_name(raw_role.get("id", "")) or _next_role_id(existing_roles)
        if any(existing.get("id") == role_id for existing in existing_roles):
            role_id = _next_role_id(existing_roles)
        role = {
            "uid": str(raw_role.get("uid", "")).strip() or _new_uid(),
            "id": role_id,
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
        "uid": _new_uid(),
        "id": _next_role_id(existing_roles),
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
    roles_by_id: dict[str, dict],
    roles_by_name: dict[str, dict],
    *,
    role_id: str = "",
    role_name: str = "",
) -> dict | None:
    normalized_id = normalize_role_name(role_id)
    normalized_name = normalize_role_name(role_name)

    if normalized_id and normalized_id in roles_by_id:
        role = roles_by_id[normalized_id]
        if normalized_name and role["name"] != normalized_name:
            roles_by_name.pop(role["name"], None)
            role["name"] = normalized_name
            roles_by_name[normalized_name] = role
        return role

    if normalized_name and normalized_name in roles_by_name:
        role = roles_by_name[normalized_name]
        if normalized_id:
            roles_by_id[normalized_id] = role
        return role

    if not normalized_name:
        return None

    role = _normalize_role({"id": normalized_id, "name": normalized_name}, roles)
    if not role:
        return None
    roles.append(role)
    roles_by_id[role["id"]] = role
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
        _ensure_uid(rule)
        rule.setdefault("name", "")
        rule.setdefault("type", "")
        rule.setdefault("applies_to", "")
        rule.setdefault("description", "")
        rule.setdefault("formula", "")


def _normalize_language(language: list[dict]) -> None:
    for item in language:
        _ensure_uid(item)
        item.setdefault("term", "")
        item.setdefault("definition", "")


def _normalize_relations(relations: list[dict]) -> None:
    for relation in relations:
        _ensure_uid(relation)
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
        _ensure_uid(rule)
        rule["id"] = str(rule.get("id", "")).strip() or f"BR{index}"
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
        _ensure_uid(entity)
        entity.setdefault("id", f"E{entity_index}")
        entity.setdefault("name", "")
        entity.setdefault("group", "")
        entity.setdefault("note", "")
        entity.setdefault("fields", [])
        entity.setdefault("state_transitions", [])

        primary_status_assigned = False
        for field in entity["fields"]:
            _ensure_uid(field)
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
        _ensure_uid(form)
        form["id"] = str(form.get("id") or f"F{form_index}").strip()
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
            _ensure_uid(section)
            section["id"] = str(section.get("id") or f"SEC{section_index}").strip()
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
                _ensure_uid(field)
                field["id"] = str(field.get("id") or f"FLD{field_index}").strip()
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
    roles_by_id = {role["id"]: role for role in roles}
    roles_by_name = {role["name"]: role for role in roles}

    for process_index, process in enumerate(processes, start=1):
        _ensure_uid(process)
        process.setdefault("id", f"P{process_index}")
        process.setdefault("name", DEFAULT_PROCESS_NAME if process_index == 1 else f"\u6d41\u7a0b{process_index}")
        process.setdefault("trigger", "")
        process.setdefault("outcome", "")
        process.setdefault("subDomain", "")
        process.setdefault("flowGroup", "")
        process["stageId"] = str(process.get("stageId", process.pop("stage_id", "")) or "").strip()
        process["stagePos"] = _normalize_graph_offset(process.get("stagePos", process.pop("stage_pos", {})))
        normalized_prototypes = []
        prototype_sources = process.get("prototypeFiles", [])
        if not isinstance(prototype_sources, list):
            prototype_sources = []
        for prototype_index, prototype in enumerate(prototype_sources, start=1):
            normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
            _ensure_uid(normalized)
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
            _ensure_uid(node)
            node.setdefault("id", f"T{node_index}")
            node.setdefault("name", "")
            node_roles: list[dict] = []
            seen_role_ids: set[str] = set()

            def push_node_role(role: dict | None) -> None:
                if not role or role["id"] in seen_role_ids:
                    return
                seen_role_ids.add(role["id"])
                node_roles.append(role)

            raw_role_ids = []
            if isinstance(node.get("role_ids"), list):
                raw_role_ids.extend(node.get("role_ids", []))
            else:
                raw_role_ids.extend(_parse_role_tokens(node.get("role_ids", "")))
            if node.get("role_id"):
                raw_role_ids.append(node.get("role_id", ""))

            for raw_role_id in raw_role_ids:
                push_node_role(
                    _ensure_role(
                        roles,
                        roles_by_id,
                        roles_by_name,
                        role_id=raw_role_id,
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
                        roles_by_id,
                        roles_by_name,
                        role_name=raw_role_name,
                    )
                )

            process_sub_domain = normalize_role_name(process.get("subDomain", ""))
            for node_role in node_roles:
                if process_sub_domain and process_sub_domain not in node_role["subDomains"]:
                    node_role["subDomains"].append(process_sub_domain)

            node["role_ids"] = [role["id"] for role in node_roles]
            node["roles"] = [role["name"] for role in node_roles]
            node["role_id"] = node["role_ids"][0] if node["role_ids"] else ""
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
                orchestration_task.setdefault("name", "")
                orchestration_task.setdefault("target", "")
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
        task_ids = {str(node.get("id", "")).strip() for node in process["nodes"] if str(node.get("id", "")).strip()}
        flow_nodes = []
        flow_node_ids = set()
        for flow_node_index, flow_node in enumerate(raw_flow.get("nodes", []), start=1):
            if not isinstance(flow_node, dict):
                continue
            if str(flow_node.get("kind", "")).strip() != "gateway":
                continue
            node_id = str(flow_node.get("id", "")).strip() or f"G{flow_node_index}"
            if not node_id or node_id in flow_node_ids or node_id in task_ids:
                continue
            flow_node_ids.add(node_id)
            normalized_flow_node = dict(flow_node)
            normalized_flow_node["id"] = node_id
            normalized_flow_node["kind"] = "gateway"
            normalized_flow_node["title"] = str(
                flow_node.get("title") or flow_node.get("name") or ""
            ).strip()
            normalized_flow_node["gatewayType"] = str(
                flow_node.get("gatewayType") or "exclusive"
            ).strip() or "exclusive"
            normalized_flow_node["role_id"] = str(
                flow_node.get("role_id") or flow_node.get("roleId") or ""
            ).strip()
            flow_nodes.append(normalized_flow_node)

        valid_flow_node_ids = task_ids | flow_node_ids

        def normalize_process_flow_endpoint(value: object, side: str) -> str:
            endpoint = str(value or "").strip()
            if side == "from" and endpoint == "START":
                return "START"
            if side == "to" and endpoint == "END":
                return "END"
            return endpoint

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
                or (source and source != "START" and source not in valid_flow_node_ids)
                or (target and target != "END" and target not in valid_flow_node_ids)
            ):
                continue
            edge_key = (source, target)
            if not is_draft_edge:
                if edge_key in seen_flow_edges:
                    continue
                seen_flow_edges.add(edge_key)
            normalized_edge = dict(edge)
            normalized_edge["id"] = str(edge.get("id") or f"E{edge_index}").strip()
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
    doc.setdefault("capabilityUnits", [])
    doc.setdefault("businessConstructs", [])
    doc.setdefault("taskDefinitions", [])

    normalized_roles: list[dict] = []
    roles_by_id: dict[str, dict] = {}
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
        roles_by_id[role["id"]] = role
        roles_by_name[role["name"]] = role
    doc["roles"] = normalized_roles

    _normalize_processes(doc["processes"], doc["roles"])
    _normalize_stages(doc["stages"], doc["processes"])
    doc["stageLinks"] = _normalize_stage_links(doc["stageLinks"])
    doc["stageFlowRefs"] = _supplement_stage_flow_refs_from_legacy(
        _normalize_stage_flow_refs(doc["stageFlowRefs"]),
        doc["processes"],
    )
    doc["stageFlowLinks"] = _normalize_stage_flow_links(doc["stageFlowLinks"])
    if not doc["stageFlowLinks"]:
        doc["stageFlowLinks"] = _build_stage_flow_links_from_legacy(doc["stages"], doc["stageFlowRefs"])
    _normalize_entities(doc["entities"])
    _normalize_relations(doc["relations"])
    _normalize_rules(doc["rules"])
    _normalize_language(doc["language"])

    doc["meta"] = meta
    return doc


def renumber_document_ids(document: dict | None) -> dict:
    doc = migrate_document(document)

    role_map: dict[str, str] = {}
    for index, role in enumerate(doc["roles"], start=1):
        old_id = str(role.get("id", "")).strip()
        new_id = f"R{index}"
        role["id"] = new_id
        if old_id:
            role_map[old_id] = new_id

    stage_map: dict[str, str] = {}
    for stage_index, stage in enumerate(doc["stages"], start=1):
        old_stage_id = str(stage.get("id", "")).strip()
        new_stage_id = f"S{stage_index}"
        stage["id"] = new_stage_id
        if old_stage_id:
            stage_map[old_stage_id] = new_stage_id

    process_map: dict[str, str] = {}
    stage_flow_ref_map: dict[str, str] = {}
    node_map: dict[str, str] = {}
    next_node_index = 1
    for process_index, process in enumerate(doc["processes"], start=1):
        old_process_id = str(process.get("id", "")).strip()
        new_process_id = f"P{process_index}"
        process["id"] = new_process_id
        if old_process_id:
            process_map[old_process_id] = new_process_id
        if process.get("stageId") in stage_map:
            process["stageId"] = stage_map[process["stageId"]]

        for node in process.get("nodes", []):
            old_node_id = str(node.get("id", "")).strip()
            new_node_id = f"T{next_node_index}"
            next_node_index += 1
            node["id"] = new_node_id
            if old_node_id:
                node_map[old_node_id] = new_node_id
            if node.get("role_id") in role_map:
                node["role_id"] = role_map[node["role_id"]]
            role_ids = []
            seen_role_ids: set[str] = set()
            for role_id in node.get("role_ids", []):
                normalized_role_id = role_map.get(role_id, role_id)
                if normalized_role_id and normalized_role_id not in seen_role_ids:
                    seen_role_ids.add(normalized_role_id)
                    role_ids.append(normalized_role_id)
            if node.get("role_id") and node["role_id"] not in seen_role_ids:
                role_ids.insert(0, node["role_id"])
            node["role_ids"] = role_ids
            node["roles"] = [
                role["name"]
                for role_id in role_ids
                for role in doc["roles"]
                if role["id"] == role_id
            ]
            node["role_id"] = role_ids[0] if role_ids else ""
            node["role"] = "、".join(node["roles"])

    for stage_flow_ref_index, stage_flow_ref in enumerate(doc.get("stageFlowRefs", []), start=1):
        old_ref_id = str(stage_flow_ref.get("id", "")).strip()
        new_ref_id = f"SFR{stage_flow_ref_index}"
        stage_flow_ref["id"] = new_ref_id
        if old_ref_id:
            stage_flow_ref_map[old_ref_id] = new_ref_id
        if stage_flow_ref.get("stageId") in stage_map:
            stage_flow_ref["stageId"] = stage_map[stage_flow_ref["stageId"]]
        if stage_flow_ref.get("processId") in process_map:
            stage_flow_ref["processId"] = process_map[stage_flow_ref["processId"]]

    entity_map: dict[str, str] = {}
    for entity_index, entity in enumerate(doc["entities"], start=1):
        old_entity_id = str(entity.get("id", "")).strip()
        new_entity_id = f"E{entity_index}"
        entity["id"] = new_entity_id
        if old_entity_id:
            entity_map[old_entity_id] = new_entity_id

    for process in doc["processes"]:
        for node in process.get("nodes", []):
            for entity_op in node.get("entity_ops", []):
                if entity_op.get("entity_id") in entity_map:
                    entity_op["entity_id"] = entity_map[entity_op["entity_id"]]
            for form in node.get("forms", []):
                if form.get("entity_id") in entity_map:
                    form["entity_id"] = entity_map[form["entity_id"]]
                for section in form.get("sections", []):
                    if section.get("entity_id") in entity_map:
                        section["entity_id"] = entity_map[section["entity_id"]]

    for capability in doc.get("capabilityUnits", []):
        if isinstance(capability.get("entityIds"), list):
            capability["entityIds"] = [entity_map.get(entity_id, entity_id) for entity_id in capability["entityIds"]]

    for construct in doc.get("businessConstructs", []):
        if isinstance(construct.get("entityIds"), list):
            construct["entityIds"] = [entity_map.get(entity_id, entity_id) for entity_id in construct["entityIds"]]

    for task_definition in doc.get("taskDefinitions", []):
        if isinstance(task_definition.get("entityIds"), list):
            task_definition["entityIds"] = [entity_map.get(entity_id, entity_id) for entity_id in task_definition["entityIds"]]

    for relation in doc["relations"]:
        if relation.get("from") in entity_map:
            relation["from"] = entity_map[relation["from"]]
        if relation.get("to") in entity_map:
            relation["to"] = entity_map[relation["to"]]

    for stage in doc["stages"]:
        for process_link in stage.get("processLinks", []):
            if process_link.get("fromProcessId") in process_map:
                process_link["fromProcessId"] = process_map[process_link["fromProcessId"]]
            if process_link.get("toProcessId") in process_map:
                process_link["toProcessId"] = process_map[process_link["toProcessId"]]

    for stage_link in doc.get("stageLinks", []):
        if stage_link.get("fromStageId") in stage_map:
            stage_link["fromStageId"] = stage_map[stage_link["fromStageId"]]
        if stage_link.get("toStageId") in stage_map:
            stage_link["toStageId"] = stage_map[stage_link["toStageId"]]

    for stage_flow_link_index, stage_flow_link in enumerate(doc.get("stageFlowLinks", []), start=1):
        stage_flow_link["id"] = f"SFL{stage_flow_link_index}"
        if stage_flow_link.get("stageId") in stage_map:
            stage_flow_link["stageId"] = stage_map[stage_flow_link["stageId"]]
        if stage_flow_link.get("fromRefId") in stage_flow_ref_map:
            stage_flow_link["fromRefId"] = stage_flow_ref_map[stage_flow_link["fromRefId"]]
        if stage_flow_link.get("toRefId") in stage_flow_ref_map:
            stage_flow_link["toRefId"] = stage_flow_ref_map[stage_flow_link["toRefId"]]

    id_map = {}
    id_map.update(role_map)
    id_map.update(stage_map)
    id_map.update(process_map)
    id_map.update(node_map)
    id_map.update(entity_map)
    for rule in doc["rules"]:
        applies_to = str(rule.get("applies_to", "")).strip()
        if applies_to in id_map:
            rule["applies_to"] = id_map[applies_to]

    return doc
