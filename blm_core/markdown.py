from __future__ import annotations

from blm_core.document import migrate_document


STEP_LABELS = {
    "Query": "查询",
    "Check": "校验",
    "Fill": "填写",
    "Select": "选择",
    "Compute": "计算",
    "Mutate": "变更",
}

ORCHESTRATION_TYPE_LABELS = {
    "Query": "\u67e5\u8be2",
    "Check": "\u6821\u9a8c",
    "Compute": "\u8ba1\u7b97",
    "Service": "\u670d\u52a1",
    "Mutate": "\u53d8\u66f4",
    "Custom": "\u81ea\u5b9a\u4e49",
}

QUERY_SOURCE_KIND_LABELS = {
    "Dictionary": "\u5b57\u5178",
    "Enum": "\u679a\u4e3e",
    "QueryService": "\u67e5\u8be2\u670d\u52a1",
    "Custom": "\u81ea\u5b9a\u4e49",
}

FIELD_LABELS = {
    "string": "字符",
    "number": "数值",
    "decimal": "金额",
    "date": "日期",
    "datetime": "日期时间",
    "boolean": "布尔",
    "enum": "枚举",
    "text": "长文本",
    "id": "标识ID",
}

FORM_FIELD_TYPE_LABELS = {
    "Text": "输入框",
    "Select": "下拉选择",
    "Date": "日期",
    "Number": "数字",
    "File": "附件",
    "Readonly": "只读展示",
    "Note": "说明文本",
}


def get_node_business_rules(node: dict) -> list[dict]:
    rules = node.get("businessRules", [])
    if not isinstance(rules, list):
        rules = []
    normalized = []
    for index, item in enumerate(rules, start=1):
        rule = item if isinstance(item, dict) else {"content": str(item or "")}
        name = str(rule.get("name", rule.get("title", f"规则{index}")) or "").strip()
        content = str(rule.get("content", rule.get("description", rule.get("note", ""))) or "").strip()
        if name or content:
            normalized.append({"name": name or "未命名规则", "content": content})
    legacy_note = str(node.get("rules_note", "") or "").strip()
    if not normalized and legacy_note:
        normalized.append({"name": "业务规则", "content": legacy_note})
    return normalized


def _format_prototype_summary(prototype_files: list[dict]) -> str:
    parts: list[str] = []
    for item in prototype_files:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        versions = item.get("versions", [])
        if not isinstance(versions, list):
            versions = []
        current_version_uid = str(item.get("versionUid", "")).strip()
        current_version = next(
            (
                version
                for version in versions
                if isinstance(version, dict) and str(version.get("uid", "")).strip() == current_version_uid
            ),
            versions[-1] if versions else None,
        )
        if versions:
            try:
                version_number = int((current_version or {}).get("number") or 1)
            except (AttributeError, TypeError, ValueError):
                version_number = 1
            parts.append(f"{name}（当前 v{version_number}，共{len(versions)}版）")
        else:
            parts.append(name)
    return "、".join(parts)


RULE_LABELS = {
    "StepRule": "步骤规则",
    "DataRule": "数据规则",
    "ComputeRule": "计算规则",
}

SECTION_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
RELATION_LABELS = {"1:1": "1对1", "1:N": "1对多", "N:N": "多对多"}

UNASSIGNED_STAGE_ID = "__unassigned__"
UNASSIGNED_STAGE_NAME = "未设置业务阶段"


def get_stage_flow_refs(document: dict) -> list[dict]:
    return [ref for ref in document.get("stageFlowRefs", []) if isinstance(ref, dict)]


def get_stage_flow_links(document: dict) -> list[dict]:
    return [link for link in document.get("stageFlowLinks", []) if isinstance(link, dict)]


def get_stage_items(document: dict) -> list[dict]:
    processes = document.get("processes", [])
    items = [stage for stage in document.get("stages", []) if isinstance(stage, dict)]
    referenced_process_ids = {
        str(ref.get("processId", "")).strip()
        for ref in get_stage_flow_refs(document)
        if str(ref.get("processId", "")).strip()
    }
    unassigned_processes = [
        process for process in processes
        if str(process.get("id", "")).strip() and str(process.get("id", "")).strip() not in referenced_process_ids
    ]
    if unassigned_processes:
        items.append(
            {
                "id": UNASSIGNED_STAGE_ID,
                "name": UNASSIGNED_STAGE_NAME,
                "subDomain": "",
                "pos": {"x": 0, "y": 0},
                "processLinks": [],
                "_virtual": True,
            }
        )
    return items


def get_stage_process_refs(document: dict, stage_id: str) -> list[dict]:
    processes = [process for process in document.get("processes", []) if isinstance(process, dict)]
    refs = get_stage_flow_refs(document)
    if stage_id == UNASSIGNED_STAGE_ID:
        referenced_process_ids = {
            str(ref.get("processId", "")).strip()
            for ref in refs
            if str(ref.get("processId", "")).strip()
        }
        virtual_refs = []
        for index, process in enumerate(processes, start=1):
            process_id = str(process.get("id", "")).strip()
            if not process_id or process_id in referenced_process_ids:
                continue
            virtual_refs.append(
                {
                    "id": f"virtual-ref-{process_id}",
                    "stageId": UNASSIGNED_STAGE_ID,
                    "processId": process_id,
                    "order": index,
                    "virtual": True,
                }
            )
        return virtual_refs
    return sorted(
        [
            ref for ref in refs
            if str(ref.get("stageId", "")).strip() == str(stage_id or "").strip()
        ],
        key=lambda item: (int(item.get("order", 0) or 0), str(item.get("id", "")).strip()),
    )


def get_process_stage_refs(document: dict, process_id: str) -> list[dict]:
    target_process_id = str(process_id or "").strip()
    return sorted(
        [
            ref for ref in get_stage_flow_refs(document)
            if str(ref.get("processId", "")).strip() == target_process_id
        ],
        key=lambda item: (str(item.get("stageId", "")).strip(), int(item.get("order", 0) or 0), str(item.get("id", "")).strip()),
    )


def get_stage_processes(document: dict, stage_id: str) -> list[dict]:
    processes_by_id = {
        str(process.get("id", "")).strip(): process
        for process in document.get("processes", [])
        if isinstance(process, dict) and str(process.get("id", "")).strip()
    }
    return [
        processes_by_id[ref["processId"]]
        for ref in get_stage_process_refs(document, stage_id)
        if str(ref.get("processId", "")).strip() in processes_by_id
    ]


def build_stage_panorama_mermaid(document: dict) -> str | None:
    stages = get_stage_items(document)
    if not stages:
        return None
    lines = ["flowchart TD"]
    for stage in stages:
        stage_uid = str(stage.get("uid", "") or stage.get("id", ""))
        stage_name = str(stage.get("name", "") or stage_uid).replace('"', "'")
        lines.append(f'  {stage_uid}["{stage_name}"]')
    for stage_link in document.get("stageLinks", []):
        from_stage_id = str(stage_link.get("fromStageId", "")).strip()
        to_stage_id = str(stage_link.get("toStageId", "")).strip()
        if from_stage_id and to_stage_id:
            lines.append(f"  {from_stage_id} --> {to_stage_id}")
    return "\n".join(lines)


def build_stage_process_mermaid(document: dict, stage: dict) -> str | None:
    process_refs = get_stage_process_refs(document, stage.get("id", ""))
    if not process_refs:
        return None
    processes_by_id = {
        str(process.get("id", "")).strip(): process
        for process in document.get("processes", [])
        if isinstance(process, dict) and str(process.get("id", "")).strip()
    }
    stage_id = str(stage.get("id", "")).strip()
    lines = ["flowchart TD"]
    valid_ref_ids = set()
    for ref in process_refs:
        process = processes_by_id.get(str(ref.get("processId", "")).strip())
        if not process:
            continue
        ref_id = str(ref.get("id", "")).strip()
        if not ref_id:
            continue
        process_name = str(process.get("name", "") or process.get("id", "")).replace('"', "'")
        lines.append(f'  {ref_id}["{process_name}"]')
        valid_ref_ids.add(ref_id)
    for process_link in get_stage_flow_links(document):
        if str(process_link.get("stageId", "")).strip() != stage_id:
            continue
        from_ref_id = str(process_link.get("fromRefId", "")).strip()
        to_ref_id = str(process_link.get("toRefId", "")).strip()
        if from_ref_id in valid_ref_ids and to_ref_id in valid_ref_ids:
            lines.append(f"  {from_ref_id} --> {to_ref_id}")
    return "\n".join(lines)


def get_role_name(role) -> str:
    if isinstance(role, dict):
        return str(role.get("name", "")).strip()
    return str(role or "").strip()


def get_role_desc(role) -> str:
    if isinstance(role, dict):
        return str(role.get("desc", "")).strip()
    return ""


def get_role_group(role) -> str:
    if isinstance(role, dict):
        return str(role.get("group", "")).strip()
    return ""


def get_role_subdomains(role) -> str:
    if isinstance(role, dict):
      return "、".join([str(value).strip() for value in role.get("subDomains", []) if str(value).strip()])
    return ""


def get_field_status_role(field: dict) -> str:
    raw = str(field.get("status_role", "")).strip().casefold()
    if raw in {"primary", "main", "master"}:
        return "primary"
    if raw in {"secondary", "sub", "child"}:
        return "secondary"
    return "primary" if field.get("is_status") else ""


def get_field_status_role_label(field: dict) -> str:
    role = get_field_status_role(field)
    if role == "primary":
        return "主状态"
    if role == "secondary":
        return "子状态"
    return ""


def is_status_field(field: dict) -> bool:
    return bool(get_field_status_role(field))


def get_entity_status_field(entity: dict) -> dict | None:
    primary_field = next(
        (field for field in entity.get("fields", []) if get_field_status_role(field) == "primary"),
        None,
    )
    if primary_field:
        return primary_field
    return next((field for field in entity.get("fields", []) if is_status_field(field)), None)


def get_entity_status_fields(entity: dict) -> list[dict]:
    return [field for field in entity.get("fields", []) if is_status_field(field)]


def get_entity_state_values(entity: dict) -> str:
    field = get_entity_status_field(entity)
    if not field:
        return ""
    explicit = str(field.get("state_values", "")).strip()
    if explicit:
        return explicit
    note = str(field.get("note", "")).strip()
    parts = [item.strip() for item in note.split("/") if item.strip()]
    if parts and all(len(item) <= 16 for item in parts):
        return "/".join(parts)
    return ""


def normalize_state_node_kind(kind: str) -> str:
    raw = str(kind or "").strip().casefold()
    if raw in {"initial", "start", "entry"}:
        return "initial"
    if raw in {"terminal", "end", "finish", "final"}:
        return "terminal"
    return "intermediate"


def get_state_node_kind_label(kind: str) -> str:
    normalized = normalize_state_node_kind(kind)
    if normalized == "initial":
        return "初始状态"
    if normalized == "terminal":
        return "结束状态"
    return "中间状态"


def get_field_state_nodes(field: dict) -> list[dict]:
    if not isinstance(field, dict):
        return []
    state_value_text = str(field.get("state_values", "")).strip()
    note_text = str(field.get("note", "")).strip()
    if not state_value_text:
        parts = [item.strip() for item in note_text.split("/") if item.strip()]
        if parts and all(len(item) <= 16 for item in parts):
            state_value_text = "/".join(parts)
    values = [item.strip() for item in state_value_text.split("/") if item.strip()]
    if not values:
        return []
    raw_nodes = field.get("state_nodes", [])
    existing_kinds = {
        str(item.get("name", "")).strip(): normalize_state_node_kind(item.get("kind", ""))
        for item in raw_nodes
        if isinstance(item, dict) and str(item.get("name", "")).strip()
    }
    return [
        {
            "name": state_name,
            "kind": existing_kinds.get(
                state_name,
                "initial" if index == 0 and len(values) > 1 else ("terminal" if index == len(values) - 1 and len(values) > 1 else "intermediate"),
            ),
        }
        for index, state_name in enumerate(values)
    ]


def get_field_state_node_summary(field: dict) -> str:
    return "；".join(
        f"{item['name']}={get_state_node_kind_label(item['kind'])}"
        for item in get_field_state_nodes(field)
    )


def get_field_rule_text(field: dict) -> str:
    note_text = str(field.get("note", "")).strip()
    if not is_status_field(field):
        return note_text
    state_value_text = str(field.get("state_values", "")).strip()
    if not state_value_text:
        parts = [item.strip() for item in note_text.split("/") if item.strip()]
        if parts and all(len(item) <= 16 for item in parts):
            state_value_text = "/".join(parts)
    inferred_text = "/".join([item.strip() for item in note_text.split("/") if item.strip()])
    note_only = note_text if note_text and note_text != state_value_text and inferred_text != state_value_text else ""
    node_summary = get_field_state_node_summary(field)
    summary_text = f"节点属性：{node_summary}" if node_summary else ""
    parts = [item for item in (state_value_text, summary_text, note_only) if item]
    if parts:
        return "；".join(parts)
    return note_text or state_value_text


class MarkdownExporter:
    def export(self, document: dict) -> str:
        doc = migrate_document(document)
        lines: list[str] = []
        meta = doc.get("meta", {})
        section_index = 0

        def next_section_number() -> str:
            nonlocal section_index
            if section_index < len(SECTION_NUMBERS):
                result = SECTION_NUMBERS[section_index]
            else:
                result = str(section_index + 1)
            section_index += 1
            return result

        def line(value: str = "") -> None:
            lines.append(value)

        def separator() -> None:
            lines.extend(["---", ""])

        line(f"# {meta.get('title') or '未命名'}")
        line()
        meta_parts = [
            ("业务域", meta.get("domain", "")),
            ("作者", meta.get("author", "")),
            ("日期", meta.get("date", "")),
        ]
        rendered_meta = [f"**{key}**: {value}" for key, value in meta_parts if value]
        if rendered_meta:
            line(" | ".join(rendered_meta))
            line()
        separator()

        roles = doc.get("roles", [])
        if roles:
            line(f"## {next_section_number()}、角色")
            line()
            line("| 角色 | 分组 | 说明 | 所属业务组件 |")
            line("|------|------|------|--------------|")
            for role in roles:
                line(
                    f"| {get_role_name(role)} | {get_role_group(role)} | {get_role_desc(role)} | {get_role_subdomains(role)} |"
                )
            line()
            separator()

        language = doc.get("language", [])
        if language:
            line(f"## {next_section_number()}、统一语言")
            line()
            line("| 术语 | 定义 |")
            line("|------|------|")
            for item in language:
                line(f"| {item.get('term', '')} | {item.get('definition', '')} |")
            line()
            separator()

        business_constructs = doc.get("businessConstructs", [])
        if business_constructs:
            line(f"## {next_section_number()}、业务构件与任务定义")
            line()
            self._render_business_constructs(line, doc, business_constructs)
            separator()

        stage_items = get_stage_items(doc)
        if stage_items:
            line(f"## {next_section_number()}、全景与阶段视图")
            line()
            line("### 全景视图")
            line()
            panorama_code = build_stage_panorama_mermaid(doc)
            if panorama_code:
                line("```mermaid")
                for code_line in panorama_code.split("\n"):
                    line(code_line)
                line("```")
                line()
            for stage in stage_items:
                self._render_stage(line, doc, stage)
            separator()

        processes = doc.get("processes", [])
        entities_by_id = {str(entity.get("uid", "") or entity.get("id", "")): entity for entity in doc.get("entities", [])}
        line(f"## {next_section_number()}、流程视图")
        line()
        for process in processes:
            self._render_process(line, doc, process, entities_by_id)
        separator()

        entities = doc.get("entities", [])
        relations = doc.get("relations", [])
        if entities:
            line(f"## {next_section_number()}、数据建模")
            line()
            self._render_entity_mermaid(line, entities, relations)
            line()
            for entity in entities:
                line(f"### 实体：{entity.get('name', '')}")
                line()
                fields = entity.get("fields", [])
                if fields:
                    line("| 字段 | 类型 | 主键 | 状态字段 | 字段规则 |")
                    line("|------|------|------|---------|---------|")
                    for field in fields:
                        field_type = FIELD_LABELS.get(field.get("type", ""), field.get("type", ""))
                        is_key = "✓" if field.get("is_key") else ""
                        is_status = get_field_status_role_label(field)
                        line(
                            f"| {field.get('name', '')} | {field_type} | {is_key} | {is_status} | {get_field_rule_text(field)} |"
                        )
                    line()
                state_transitions = entity.get("state_transitions", [])
                if state_transitions:
                    status_field = get_entity_status_field(entity)
                    line("#### 状态流转")
                    line()
                    if status_field:
                        line(
                            f"**主状态字段**: {status_field.get('name', '')}（状态列表：{get_entity_state_values(entity) or '—'}）"
                        )
                        line()
                    line("| 来源状态 | 目标状态 | 备注说明 |")
                    line("|----------|----------|----------|")
                    for transition in state_transitions:
                        line(
                            f"| {transition.get('from', '')} | {transition.get('to', '')} | {transition.get('note') or transition.get('action', '')} |"
                        )
                    line()
            separator()

        rules = doc.get("rules", [])
        if rules:
            line(f"## {next_section_number()}、规则建模")
            line()
            line("| 规则名 | 类型 | 绑定对象 | 描述 | 公式 |")
            line("|--------|------|---------|------|------|")
            for rule in rules:
                rule_type = RULE_LABELS.get(rule.get("type", ""), rule.get("type", ""))
                line(
                    f"| {rule.get('name', '')} | {rule_type} | {rule.get('applies_to', '')} | {rule.get('description', '')} | {rule.get('formula', '')} |"
                )
            line()

        return "\n".join(lines)

    def _render_business_constructs(self, line, document: dict, constructs: list[dict]) -> None:
        entities_by_id = {str(entity.get("uid", "") or entity.get("id", "")): entity for entity in document.get("entities", [])}
        stages_by_id = {str(stage.get("uid", "") or stage.get("id", "")): stage for stage in get_stage_items(document)}
        processes_by_id = {str(process.get("uid", "") or process.get("id", "")): process for process in document.get("processes", [])}
        tasks_by_id = {str(task.get("uid", "") or task.get("id", "")): task for task in document.get("taskDefinitions", [])}

        line("| 业务系统 | 业务组件 | 业务构件 | 实体 | 任务定义 | 关联阶段/流程 |")
        line("|----------|----------|----------|------|----------|----------------|")
        for construct in constructs:
            entity_names = [
                entities_by_id.get(entity_id, {}).get("name", entity_id)
                for entity_id in construct.get("entityIds", [])
            ]
            task_names = [
                tasks_by_id.get(task_id, {}).get("name", task_id)
                for task_id in construct.get("taskDefinitionIds", [])
            ]
            stage_names = [
                stages_by_id.get(stage_id, {}).get("name", stage_id)
                for stage_id in construct.get("stageIds", [])
            ]
            process_names = [
                processes_by_id.get(process_id, {}).get("name", process_id)
                for process_id in construct.get("relatedProcessIds", [])
            ]
            task_summary = "、".join(task_names[:12])
            if len(task_names) > 12:
                task_summary += f" 等 {len(task_names)} 项"
            process_summary = "、".join(process_names[:6])
            if len(process_names) > 6:
                process_summary += f" 等 {len(process_names)} 个流程"
            stage_process_text = "；".join(
                value
                for value in [
                    "阶段：" + "、".join(stage_names[:4]) + (f" 等 {len(stage_names)} 个阶段" if len(stage_names) > 4 else ""),
                    "流程：" + process_summary if process_summary else "",
                ]
                if value
            )
            line(
                f"| {construct.get('businessDomain', '')} | {construct.get('businessComponent', '')} | "
                f"{construct.get('name', '')} | {'、'.join(entity_names) or '—'} | {task_summary or '—'} | "
                f"{stage_process_text or '—'} |"
            )
        line()

    def _render_stage(self, line, document: dict, stage: dict) -> None:
        stage_processes = get_stage_processes(document, stage.get("id", ""))
        line(f"### 阶段视图: {stage.get('name', '') or stage.get('id', 'S')}")
        line()
        stage_meta = []
        if stage.get("subDomain"):
            stage_meta.append(f"**所属业务域**: {stage.get('subDomain', '')}")
        if stage_processes:
            process_names = "、".join(
                f"{process.get('id', '')} {process.get('name', '')}".strip()
                for process in stage_processes
            )
            stage_meta.append(f"**包含流程**: {process_names}")
        if stage_meta:
            for item in stage_meta:
                line(item)
            line()

        stage_code = build_stage_process_mermaid(document, stage)
        if stage_code:
            line("```mermaid")
            for code_line in stage_code.split("\n"):
                line(code_line)
            line("```")
            line()

    def _render_process(self, line, document: dict, process: dict, entities_by_id: dict) -> None:
        nodes = process.get("nodes", [])
        line(f"### {process.get('id', 'P')}: {process.get('name', '')}")
        line()
        process_meta = []
        stage_names = []
        for ref in get_process_stage_refs(document, process.get("id", "")):
            ref_stage_id = str(ref.get("stageId", "")).strip()
            if not ref_stage_id:
                continue
            stage_name = next(
                (
                    str(stage.get("name", "")).strip() or ref_stage_id
                    for stage in get_stage_items(document)
                    if str(stage.get("id", "")).strip() == ref_stage_id
                ),
                ref_stage_id,
            )
            if stage_name and stage_name not in stage_names:
                stage_names.append(stage_name)
        if stage_names:
            process_meta.append(f"**业务阶段**: {'、'.join(stage_names)}")
            process_meta.append(f"**业务组件**: {process.get('subDomain', '')}")
        if process.get("flowGroup"):
            process_meta.append(f"**分类标签**: {process.get('flowGroup', '')}")
        if process.get("trigger") or process.get("outcome"):
            trigger = process.get("trigger") or "—"
            outcome = process.get("outcome") or "—"
            process_meta.append(
                f"**\u89e6\u53d1**: {trigger}  \u2192  **\u9884\u671f\u7ed3\u679c**: {outcome}"
            )
        prototype_files = process.get("prototypeFiles", [])
        if prototype_files:
            prototype_names = _format_prototype_summary(prototype_files)
            if prototype_names:
                process_meta.append(f"**\u6d41\u7a0b\u539f\u578b/\u9644\u4ef6**: {prototype_names}")
        if process_meta:
            for item in process_meta:
                line(item)
            line()

        if nodes:
            line("```mermaid")
            line("flowchart LR")
            line("  Start([\u5f00\u59cb])")
            for node in nodes:
                node_uid = str(node.get("uid", "") or node.get("id", ""))
                node_name = node.get("name", "").replace('"', "'")
                role = node.get("role", "")
                label = f"{node_name}\\n({role})" if role else node_name
                line(f'  {node_uid}["{label}"]')
            line("  End([\u7ed3\u675f])")
            line("  " + " --> ".join(["Start"] + [str(node.get("uid", "") or node.get("id", "")) for node in nodes] + ["End"]))
            line("```")
            line()

            for node in nodes:
                node_uid = str(node.get("uid", "") or node.get("id", ""))
                line(f"#### {node_uid}. {node.get('name', '')}\uff08\u89d2\u8272\uff1a{node.get('role', '')}\uff09")
                line()
                if node.get("repeatable"):
                    line("> \u21ba \u53ef\u91cd\u590d\u8282\u70b9")
                    line()

                user_steps = node.get("userSteps", [])
                if user_steps:
                    line("##### \u7528\u6237\u64cd\u4f5c\u6b65\u9aa4")
                    line()
                    line("| # | \u7528\u6237\u64cd\u4f5c\u6b65\u9aa4 | \u7c7b\u578b | \u6761\u4ef6/\u5907\u6ce8 |")
                    line("|---|--------------|------|-----------|")
                    for index, step in enumerate(user_steps, start=1):
                        step_type = STEP_LABELS.get(step.get("type", ""), step.get("type", ""))
                        line(
                            f"| {index} | {step.get('name', '')} | {step_type} | {step.get('note', '')} |"
                        )
                    line()

                orchestration_tasks = node.get("orchestrationTasks", [])
                if orchestration_tasks:
                    line("##### \u7f16\u6392\u4efb\u52a1")
                    line()
                    line("| # | \u7f16\u6392\u4efb\u52a1 | \u7c7b\u578b | \u67e5\u8be2\u6765\u6e90 | \u76ee\u6807 | \u5907\u6ce8 |")
                    line("|---|----------|------|----------|------|------|")
                    for index, task in enumerate(orchestration_tasks, start=1):
                        task_type = ORCHESTRATION_TYPE_LABELS.get(task.get("type", ""), task.get("type", ""))
                        query_source_kind = QUERY_SOURCE_KIND_LABELS.get(
                            task.get("querySourceKind", ""), task.get("querySourceKind", "")
                        )
                        line(
                            f"| {index} | {task.get('name', '')} | {task_type} | {query_source_kind} | {task.get('target', '')} | {task.get('note', '')} |"
                        )
                    line()

                entity_ops = node.get("entity_ops", [])
                if entity_ops:
                    rendered_ops = []
                    for entity_op in entity_ops:
                        entity = entities_by_id.get(entity_op.get("entity_id", ""), {})
                        entity_name = entity.get("name") or entity_op.get("entity_id", "")
                        ops = ",".join(entity_op.get("ops", []))
                        rendered_ops.append(f"{entity_name}\uff08{ops}\uff09")
                    line(f"**\u6d89\u53ca\u5b9e\u4f53**: {', '.join(rendered_ops)}")
                    line()

                forms = node.get("forms", [])
                if forms:
                    self._render_node_forms(line, forms, entities_by_id)

                business_rules = get_node_business_rules(node)
                if business_rules:
                    self._render_node_business_rules(line, business_rules)
        line()

    def _render_node_business_rules(self, line, business_rules: list[dict]) -> None:
        line("##### 业务规则")
        line()
        for rule in business_rules:
            line(f"- **{rule.get('name') or '未命名规则'}**")
            content_lines = [
                item.strip()
                for item in str(rule.get("content", "") or "").splitlines()
                if item.strip()
            ]
            for item in content_lines:
                line(f"  {item}")
            if not content_lines:
                line("  ")
        line()

    def _render_node_forms(self, line, forms: list[dict], entities_by_id: dict) -> None:
        line("##### 表单模型")
        line()
        for form in forms:
            if not isinstance(form, dict):
                continue
            entity_ids = []
            for section in form.get("sections", []) or []:
                if not isinstance(section, dict):
                    continue
                entity_id = str(section.get("entity_id") or section.get("entityId") or "").strip()
                if entity_id and entity_id not in entity_ids:
                    entity_ids.append(entity_id)
            legacy_entity_id = str(form.get("entity_id") or form.get("entityId") or "").strip()
            if not entity_ids and legacy_entity_id:
                entity_ids.append(legacy_entity_id)
            entity_name = "、".join(
                entities_by_id.get(entity_id, {}).get("name") or entity_id
                for entity_id in entity_ids
            ) or "不绑定实体"
            purpose = str(form.get("purpose", "")).strip()
            line(f"- {form.get('name') or '未命名表单'}；关联实体：{entity_name}" + (f"；用途：{purpose}" if purpose else ""))
            for section in form.get("sections", []) or []:
                if not isinstance(section, dict):
                    continue
                section_note = str(section.get("note", "")).strip()
                section_entity_id = str(section.get("entity_id") or section.get("entityId") or legacy_entity_id).strip()
                section_entity_name = entities_by_id.get(section_entity_id, {}).get("name") or section_entity_id or "不绑定实体"
                line(
                    f"  - 分组：{section.get('name') or '未命名分组'}；绑定实体：{section_entity_name}"
                    + (f"；{section_note}" if section_note else "")
                )
                for field in section.get("fields", []) or []:
                    if not isinstance(field, dict):
                        continue
                    field_type = FORM_FIELD_TYPE_LABELS.get(field.get("type", ""), field.get("type", ""))
                    required = " / 必填" if field.get("required") else ""
                    entity_field = str(field.get("entity_field") or field.get("entityField") or "").strip()
                    mapped = f" / 映射：{entity_field}" if entity_field else ""
                    note = str(field.get("note", "")).strip()
                    note_text = f" / {note}" if note else ""
                    line(f"    - {field.get('name') or '未命名字段'} / {field_type}{required}{mapped}{note_text}")
        line()

    def _render_entity_mermaid(self, line, entities: list[dict], relations: list[dict]) -> None:
        line("```mermaid")
        line("flowchart LR")
        for entity in entities:
            entity_uid = str(entity.get("uid", "") or entity.get("id", ""))
            name = entity.get("name", "").replace('"', "'") or entity_uid
            line(f'  {entity_uid}["{name}"]')
        for relation in relations:
            relation_type = RELATION_LABELS.get(relation.get("type", ""), relation.get("type", ""))
            if relation.get("label"):
                relation_type += f"\\n{relation['label']}"
            line(f'  {relation.get("from", "")} -- "{relation_type}" --> {relation.get("to", "")}')
        line("```")
