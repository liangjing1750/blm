import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from blm_core.document import canonical_document
from blm_core.markdown import MarkdownExporter


def stable_uid(prefix: str, name: str) -> str:
    return f"{prefix}-{uuid.uuid5(uuid.NAMESPACE_URL, 'blm:warehouse-inspection:' + name).hex[:8]}"


def field(fid, name, typ="string", key=False, status=False, values="", note=""):
    nodes = []
    if values:
        for index, value in enumerate([part.strip() for part in values.split("、") if part.strip()]):
            nodes.append({"name": value, "kind": "initial" if index == 0 else "intermediate"})
    return {
        "uid": fid,
        "name": name,
        "type": typ,
        "is_key": key,
        "is_status": status,
        "status_role": "",
        "state_values": values,
        "state_nodes": nodes,
        "note": note,
    }


def main():
    base = Path(r"C:\Users\Administrator\Desktop\project\blm_old\workspace")
    workspace = max(
        [path for path in base.iterdir() if (path / "manifest" / "manifest.json").exists()],
        key=lambda path: (path / "manifest" / "manifest.json").stat().st_mtime,
    )
    manifest_dir = workspace / "manifest"
    manifest_path = manifest_dir / "manifest.json"
    markdown_path = next(manifest_dir.glob("*.md"))

    backup_dir = workspace / "history" / ("manual-backup-before-wi-v593-utf8-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, backup_dir / "manifest.json")
    shutil.copy2(markdown_path, backup_dir / markdown_path.name)

    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key in ["entities", "businessComponents", "businessConstructs", "taskDefinitions", "relations", "rules", "processes"]:
        document.setdefault(key, [])
        if document[key] is None:
            document[key] = []

    component_uid = "item-f6997fd4"
    component_name = "仓库查库监管【内置领域服务】"
    component = next((item for item in document["businessComponents"] if item.get("uid") == component_uid or item.get("name") == component_name), None)
    if component is None:
        component = {
            "uid": component_uid,
            "name": component_name,
            "kind": "core",
            "note": "",
            "entityUids": [],
            "taskDefinitionUids": [],
            "constructUids": [],
            "relatedProcessUids": [],
        }
        document["businessComponents"].append(component)
    component.update(
        {
            "name": component_name,
            "kind": component.get("kind") or "core",
            "note": "负责仓库查库监管的模板、线上查库、第三方按品种任务、按仓库查库记录、结果确认、查阅和统计查询。目标模式中按品种查库任务与按仓库查库记录拆分建模。",
        }
    )

    construct_defs = [
        ("construct-wi-template", "查库模板管理", "维护查库模板及模板明细。"),
        ("construct-wi-online", "线上查库管理", "记录线上查库过程、摄像头状态、仓单明细和异常转线下来源。"),
        ("construct-wi-variety-task", "按品种查库任务管理", "第三方查库专用的上层任务，负责发布、承接、额度扣减和派生按仓库记录。"),
        ("construct-wi-warehouse-record", "按仓库查库记录管理", "承载一次具体仓库检查，来源为交易所直接创建或按品种任务派生。"),
        ("construct-wi-result-confirm", "查库结果与确认", "管理检查结果明细、仓库确认、查阅和监管函关联。"),
        ("construct-wi-statistics", "查库统计查询", "按主体、范围、品种、仓库、单位、状态和结论聚合查库数据。"),
    ]
    constructs = {}
    for uid, name, note in construct_defs:
        construct = next((item for item in document["businessConstructs"] if item.get("uid") == uid or item.get("name") == name), None)
        if construct is None:
            construct = {
                "uid": uid,
                "name": name,
                "note": "",
                "businessComponentUid": component_uid,
                "businessComponent": component_name,
                "entityUids": [],
                "taskDefinitionUids": [],
                "relatedProcessUids": [],
            }
            document["businessConstructs"].append(construct)
        construct.update({"name": name, "note": note, "businessComponentUid": component_uid, "businessComponent": component_name})
        constructs[name] = construct
        if uid not in component.setdefault("constructUids", []):
            component["constructUids"].append(uid)

    legacy_construct = next((item for item in document["businessConstructs"] if item.get("uid") == "item-c4c67d99" or item.get("name") == "仓库查库构件"), None)
    if legacy_construct:
        legacy_construct["businessComponentUid"] = component_uid
        legacy_construct["businessComponent"] = component_name
        legacy_construct["note"] = (legacy_construct.get("note") or "") + "\n目标模式补充：该构件保留为历史总构件，具体职责拆分到多个仓库查库监管构件。"

    def ensure_entity(eid, name, construct_name, fields, note):
        construct = constructs[construct_name]
        entity = next((item for item in document["entities"] if item.get("uid") == eid or item.get("name") == name), None)
        if entity is None:
            entity = {
                "uid": eid,
                "name": name,
                "group": "仓库查库监管",
                "note": note,
                "pos": {"x": 0, "y": 0},
                "businessConstructUid": construct["uid"],
                "businessConstructUids": [construct["uid"]],
                "fields": [],
                "state_transitions": [],
            }
            document["entities"].append(entity)
        entity.update(
            {
                "name": name,
                "group": "仓库查库监管",
                "note": note,
                "businessConstructUid": construct["uid"],
                "businessConstructUids": [construct["uid"]],
            }
        )
        by_uid = {item.get("uid"): item for item in entity.setdefault("fields", [])}
        by_name = {item.get("name"): item for item in entity.setdefault("fields", []) if item.get("name")}
        for next_field in fields:
            target = by_uid.get(next_field["uid"]) or by_name.get(next_field["name"])
            if target:
                target.update(next_field)
            else:
                entity["fields"].append(next_field)
        if entity["uid"] not in construct.setdefault("entityUids", []):
            construct["entityUids"].append(entity["uid"])
        if entity["uid"] not in component.setdefault("entityUids", []):
            component["entityUids"].append(entity["uid"])
        return entity

    ensure_entity(
        "entity-6c8beecb",
        "仓库查库模板",
        "查库模板管理",
        [
            field("wi-template-id", "模板ID", "id", True, note="后端生成"),
            field("wi-template-variety", "品种", note="格式为“品种代码 品种简称”"),
            field("wi-template-inspection-type", "检查类型", "enum", values="全面检查、日常检查、专项检查"),
            field("wi-template-name", "模板名称", note="同一品种和检查类型下模板名称不重复，最多50个字符"),
            field("wi-template-status", "模板状态", "enum", status=True, values="启用、禁用"),
            field("wi-template-created-by", "创建人"),
            field("wi-template-created-at", "创建时间", "datetime"),
            field("wi-template-updated-at", "更新时间", "datetime"),
        ],
        "定义查库模板头信息，模板明细由“查库模板明细”承载。",
    )

    entity_specs = [
        (
            "entity-wi-template-detail",
            "查库模板明细",
            "查库模板管理",
            "模板检查项结构。",
            [
                field("wi-td-id", "明细ID", "id", True),
                field("wi-td-template-id", "模板ID", "id"),
                field("wi-td-category", "检查类别"),
                field("wi-td-content", "检查内容"),
                field("wi-td-subcontent", "子内容"),
                field("wi-td-control-type", "控件类型", "enum", values="单选、多选、文本、无"),
                field("wi-td-options", "选项值", "text"),
                field("wi-td-need-attachment", "是否需要附件", "boolean"),
                field("wi-td-need-remark", "是否需要备注", "boolean"),
                field("wi-td-sort", "排序号", "number"),
            ],
        ),
        (
            "entity-wi-online-record",
            "线上查库记录",
            "线上查库管理",
            "记录线上查库主信息和异常转线下来源。",
            [
                field("wi-online-id", "线上查库记录ID", "id", True),
                field("wi-online-variety", "品种"),
                field("wi-online-warehouse", "交割仓库"),
                field("wi-online-time", "检查时间", "datetime"),
                field("wi-online-inspectors", "检查人员"),
                field("wi-online-camera-total", "摄像头总数量", "number"),
                field("wi-online-camera-offline", "摄像头掉线数量", "number"),
                field("wi-online-warrant-count", "仓单笔数", "number"),
                field("wi-online-warrant-weight", "仓单总重量", "decimal"),
                field("wi-online-conclusion", "线上查库结论", "enum", status=True, values="暂未发现异常、可能存在异常"),
                field("wi-online-remark", "备注", "text"),
                field("wi-online-offline-id", "转线下查库记录ID", "id"),
            ],
        ),
        (
            "entity-wi-online-warrant-detail",
            "线上查库仓单明细",
            "线上查库管理",
            "线上查库时按仓房、垛位和仓单记录视频查库明细。",
            [
                field("wi-owd-id", "明细ID", "id", True),
                field("wi-owd-online-id", "线上查库记录ID", "id"),
                field("wi-owd-warehouse-room", "仓房号"),
                field("wi-owd-stack", "垛位/油罐号"),
                field("wi-owd-variety", "品种"),
                field("wi-owd-warrant-no", "仓单编号"),
                field("wi-owd-batch-no", "批号", note="棉花品种显示"),
                field("wi-owd-quantity", "数量", "decimal"),
                field("wi-owd-video-link", "视频查库入口"),
            ],
        ),
        (
            "entity-wi-variety-task",
            "按品种查库任务",
            "按品种查库任务管理",
            "第三方查库专用上层任务，控制承接、额度和派生记录。",
            [
                field("wi-vt-id", "按品种查库任务ID", "id", True),
                field("wi-vt-subject", "查库主体", "enum", values="第三方"),
                field("wi-vt-unit-id", "检查单位ID", "id"),
                field("wi-vt-unit-name", "检查单位名称"),
                field("wi-vt-variety", "品种"),
                field("wi-vt-inspection-type", "检查类型", "enum", values="全面检查、日常检查、专项检查"),
                field("wi-vt-start", "检查开始时间", "datetime"),
                field("wi-vt-end", "检查结束时间", "datetime"),
                field("wi-vt-max-count", "最高查库次数", "number"),
                field("wi-vt-used-count", "已查库次数", "number"),
                field("wi-vt-remaining-count", "剩余待查次数", "number"),
                field("wi-vt-status", "任务状态", "enum", status=True, values="未发布、待承接、待检查、已完成"),
                field("wi-vt-claim-status", "承接状态", "enum", values="待承接、已承接"),
                field("wi-vt-claimed-by", "承接单位名称"),
                field("wi-vt-claimed-at", "承接时间", "datetime"),
                field("wi-vt-remark", "备注", "text"),
            ],
        ),
        (
            "entity-wi-warehouse-record",
            "按仓库查库记录",
            "按仓库查库记录管理",
            "一次具体仓库检查，来源为交易所直接创建或按品种任务派生。",
            [
                field("wi-wr-id", "按仓库查库记录ID", "id", True),
                field("wi-wr-source-type", "来源类型", "enum", values="交易所直接创建、按品种任务派生"),
                field("wi-wr-source-variety-task-id", "来源按品种查库任务ID", "id"),
                field("wi-wr-subject", "查库主体", "enum", values="交易所、第三方"),
                field("wi-wr-unit-name", "检查单位名称"),
                field("wi-wr-variety", "品种"),
                field("wi-wr-warehouse-id", "交割仓库ID", "id"),
                field("wi-wr-warehouse-name", "交割仓库名称"),
                field("wi-wr-start", "检查开始时间", "datetime"),
                field("wi-wr-end", "检查结束时间", "datetime"),
                field("wi-wr-inspectors", "检查人员"),
                field("wi-wr-inspection-type", "检查类型", "enum", values="全面检查、日常检查、专项检查"),
                field("wi-wr-template-id", "查库模板ID", "id"),
                field("wi-wr-status", "记录状态", "enum", status=True, values="未发布、待检查、待仓库确认、待查阅、检查完成"),
                field("wi-wr-conclusion", "查库结论", "enum", values="符合要求、不符合要求"),
                field("wi-wr-remark", "备注", "text"),
            ],
        ),
        (
            "entity-wi-result-detail",
            "查库结果明细",
            "查库结果与确认",
            "按模板明细保存检查结果、附件和备注快照。",
            [
                field("wi-rd-id", "结果明细ID", "id", True),
                field("wi-rd-record-id", "按仓库查库记录ID", "id"),
                field("wi-rd-template-detail-id", "模板明细ID", "id"),
                field("wi-rd-category", "检查类别快照"),
                field("wi-rd-content", "检查内容快照"),
                field("wi-rd-subcontent", "子内容快照"),
                field("wi-rd-result", "检查结果", "text"),
                field("wi-rd-attachment-ids", "附件ID列表", "text"),
                field("wi-rd-remark", "备注", "text"),
            ],
        ),
        (
            "entity-wi-claim-record",
            "查库任务承接记录",
            "按品种查库任务管理",
            "记录第三方对按品种查库任务的承接动作。",
            [
                field("wi-cr-id", "承接记录ID", "id", True),
                field("wi-cr-task-id", "按品种查库任务ID", "id"),
                field("wi-cr-unit-id", "承接单位ID", "id"),
                field("wi-cr-unit-name", "承接单位名称"),
                field("wi-cr-claimed-at", "承接时间", "datetime"),
                field("wi-cr-status", "承接结果", "enum", status=True, values="承接成功"),
                field("wi-cr-remark", "备注", "text"),
            ],
        ),
        (
            "entity-wi-confirm-record",
            "仓库确认记录",
            "查库结果与确认",
            "记录仓库确认动作、附件和确认时间。",
            [
                field("wi-cf-id", "仓库确认记录ID", "id", True),
                field("wi-cf-record-id", "按仓库查库记录ID", "id"),
                field("wi-cf-warehouse-id", "仓库ID", "id"),
                field("wi-cf-confirmed-by", "确认人"),
                field("wi-cf-confirmed-at", "确认时间", "datetime"),
                field("wi-cf-attachment-ids", "确认附件ID列表", "text"),
                field("wi-cf-note", "确认说明", "text"),
            ],
        ),
        (
            "entity-wi-supervision-link",
            "监管函关联记录",
            "查库结果与确认",
            "记录查库记录与外部监管函的关联关系。",
            [
                field("wi-sl-id", "监管函关联ID", "id", True),
                field("wi-sl-record-id", "按仓库查库记录ID", "id"),
                field("wi-sl-related", "是否关联监管函", "boolean"),
                field("wi-sl-letter-id", "监管函ID", "id"),
                field("wi-sl-letter-no", "监管函编号"),
                field("wi-sl-letter-name", "监管函名称"),
                field("wi-sl-linked-by", "关联人"),
                field("wi-sl-linked-at", "关联时间", "datetime"),
            ],
        ),
        (
            "entity-wi-stat-view",
            "查库统计视图",
            "查库统计查询",
            "面向查询和统计的只读视图。",
            [
                field("wi-sv-id", "统计行ID", "id", True),
                field("wi-sv-method", "查库方式", "enum", values="线上查库、线下查库"),
                field("wi-sv-subject", "查库主体", "enum", values="交易所、第三方"),
                field("wi-sv-range", "查库范围", "enum", values="按仓库查库、按品种查库"),
                field("wi-sv-variety", "品种"),
                field("wi-sv-warehouse", "交割仓库"),
                field("wi-sv-unit", "检查单位"),
                field("wi-sv-status", "状态"),
                field("wi-sv-conclusion", "查库结论"),
                field("wi-sv-count", "数量", "number"),
            ],
        ),
    ]
    for eid, name, construct_name, note, fields in entity_specs:
        ensure_entity(eid, name, construct_name, fields, note)

    process_uids = {
        "template": ["process-a3b2491e", "process-1782723511393-3cc347c1", "process-1782724328031-cb5f74a5", "process-1782724755640-f6c430f8", "process-1782724990001-05d9556d", "process-1782788597094-64a3b372"],
        "online": ["process-c2f72f48", "process-1782464061306-2a6a60a7"],
        "offline": ["process-1782800358597-d7f73c94", "process-1782892033238-b02b74c6", "process-1782894733013-475e91ed", "process-1782898404353-f889bf90", "process-1782901413120-bdaa7d0f", "process-1782952775474-22620f9a", "process-aba9289d"],
        "stats": ["process-1d02e8f9"],
    }
    construct_processes = {
        "查库模板管理": process_uids["template"],
        "线上查库管理": process_uids["online"],
        "按品种查库任务管理": ["process-1782800358597-d7f73c94", "process-aba9289d"],
        "按仓库查库记录管理": process_uids["offline"],
        "查库结果与确认": process_uids["offline"],
        "查库统计查询": process_uids["stats"],
    }
    for construct_name, uids in construct_processes.items():
        construct = constructs[construct_name]
        for process_uid in uids:
            if process_uid not in construct.setdefault("relatedProcessUids", []):
                construct["relatedProcessUids"].append(process_uid)
            if process_uid not in component.setdefault("relatedProcessUids", []):
                component["relatedProcessUids"].append(process_uid)

    def ensure_relation(rid, source, target, relation_type="1:N", label=""):
        relation = next(
            (
                item
                for item in document["relations"]
                if item.get("uid") == rid or (item.get("from") == source and item.get("to") == target and item.get("type") == relation_type)
            ),
            None,
        )
        if relation is None:
            relation = {"uid": rid}
            document["relations"].append(relation)
        relation.update({"from": source, "to": target, "type": relation_type, "label": label})

    ensure_relation("rel-wi-template-detail", "entity-6c8beecb", "entity-wi-template-detail", label="模板包含明细")
    ensure_relation("rel-wi-online-detail", "entity-wi-online-record", "entity-wi-online-warrant-detail", label="线上查库包含仓单明细")
    ensure_relation("rel-wi-variety-warehouse", "entity-wi-variety-task", "entity-wi-warehouse-record", label="按品种任务派生按仓库记录")
    ensure_relation("rel-wi-warehouse-result", "entity-wi-warehouse-record", "entity-wi-result-detail", label="按仓库记录包含检查结果明细")
    ensure_relation("rel-wi-variety-claim", "entity-wi-variety-task", "entity-wi-claim-record", label="按品种任务产生承接记录")
    ensure_relation("rel-wi-warehouse-confirm", "entity-wi-warehouse-record", "entity-wi-confirm-record", label="按仓库记录产生仓库确认")
    ensure_relation("rel-wi-warehouse-supervision", "entity-wi-warehouse-record", "entity-wi-supervision-link", label="按仓库记录关联监管函")

    def ensure_task(tid, name, construct_name, entity_ids, process_ids, note, inputs, outputs):
        construct = constructs[construct_name]
        task = next((item for item in document["taskDefinitions"] if item.get("uid") == tid or item.get("name") == name), None)
        if task is None:
            task = {"uid": tid}
            document["taskDefinitions"].append(task)
        task.update(
            {
                "name": name,
                "type": "Service",
                "querySourceKind": "",
                "target": "",
                "address": "",
                "parameters": {
                    "inputs": [{"name": item, "type": "string", "required": False, "note": ""} for item in inputs],
                    "outputs": [{"name": item, "type": "string", "required": False, "note": ""} for item in outputs],
                },
                "note": note,
                "businessComponentUid": component_uid,
                "businessComponent": component_name,
                "constructUid": construct["uid"],
                "constructName": construct_name,
                "entityUids": entity_ids,
                "processUids": process_ids,
            }
        )
        if tid not in construct.setdefault("taskDefinitionUids", []):
            construct["taskDefinitionUids"].append(tid)
        if tid not in component.setdefault("taskDefinitionUids", []):
            component["taskDefinitionUids"].append(tid)

    task_specs = [
        ("td-wi-create-template", "创建查库模板", "查库模板管理", ["entity-6c8beecb", "entity-wi-template-detail"], process_uids["template"], "保存查库模板头和明细，校验同品种同检查类型下模板名称不重复。", ["品种", "检查类型", "模板名称", "模板明细"], ["查库模板", "操作记录"]),
        ("td-wi-update-template", "修改查库模板", "查库模板管理", ["entity-6c8beecb", "entity-wi-template-detail"], process_uids["template"], "修改查库模板，不影响已生成查库记录的历史快照。", ["模板ID", "模板信息", "模板明细"], ["查库模板", "操作记录"]),
        ("td-wi-toggle-template", "启用禁用查库模板", "查库模板管理", ["entity-6c8beecb"], process_uids["template"], "启用或禁用模板，禁用模板不再用于新查库记录。", ["模板ID", "目标状态"], ["模板状态", "操作记录"]),
        ("td-wi-copy-template", "复制查库模板", "查库模板管理", ["entity-6c8beecb", "entity-wi-template-detail"], process_uids["template"], "复制模板头和明细并生成新模板ID。", ["来源模板ID", "新模板名称"], ["新查库模板", "操作记录"]),
        ("td-wi-delete-template", "删除查库模板", "查库模板管理", ["entity-6c8beecb"], process_uids["template"], "删除未被使用的模板；已被历史记录引用的模板不建议物理删除。", ["模板ID"], ["删除结果", "操作记录"]),
        ("td-wi-query-template", "查询查库模板", "查库模板管理", ["entity-6c8beecb", "entity-wi-template-detail"], process_uids["template"], "按品种、模板名称和状态查询模板列表及详情。", ["查询条件"], ["模板列表", "模板详情"]),
        ("td-wi-create-online", "新增线上查库", "线上查库管理", ["entity-wi-online-record", "entity-wi-online-warrant-detail"], process_uids["online"], "保存线上查库记录、摄像头状态、仓单明细和线上结论。", ["品种", "交割仓库", "摄像头状态", "仓单明细", "查库结论"], ["线上查库记录", "操作记录"]),
        ("td-wi-query-online", "查询线上查库", "线上查库管理", ["entity-wi-online-record", "entity-wi-online-warrant-detail"], process_uids["online"], "查询线上查库列表和详情。", ["查询条件"], ["线上查库列表", "线上查库详情"]),
        ("td-wi-convert-online-offline", "转为线下查库", "线上查库管理", ["entity-wi-online-record", "entity-wi-warehouse-record"], ["process-c2f72f48"], "线上结论为可能存在异常时，手动生成线下按仓库查库记录并保留来源引用。", ["线上查库记录ID", "线下查库参数"], ["按仓库查库记录", "来源引用"]),
        ("td-wi-create-variety-task", "创建按品种查库任务", "按品种查库任务管理", ["entity-wi-variety-task"], ["process-1782800358597-d7f73c94"], "第三方查库专用，保存品种、检查类型、检查时间和最高查库次数。", ["品种", "检查类型", "检查时间", "最高查库次数"], ["按品种查库任务", "操作记录"]),
        ("td-wi-publish-variety-task", "发布按品种查库任务", "按品种查库任务管理", ["entity-wi-variety-task"], ["process-1782800358597-d7f73c94"], "发布按品种任务；未指定承接单位时进入待承接。", ["按品种查库任务ID"], ["任务状态", "操作记录"]),
        ("td-wi-claim-variety-task", "承接按品种查库任务", "按品种查库任务管理", ["entity-wi-variety-task", "entity-wi-claim-record"], ["process-1782800358597-d7f73c94", "process-aba9289d"], "第三方首个承接成功后锁定检查单位，任务进入待检查。", ["任务ID", "承接单位", "备注"], ["承接记录", "任务状态"]),
        ("td-wi-create-warehouse-record", "生成按仓库查库记录", "按仓库查库记录管理", ["entity-wi-variety-task", "entity-wi-warehouse-record"], ["process-1782800358597-d7f73c94"], "交易所直接创建或第三方从按品种任务派生按仓库记录；派生时校验并扣减剩余次数。", ["来源类型", "品种", "交割仓库", "检查时间", "检查人员"], ["按仓库查库记录", "次数扣减结果"]),
        ("td-wi-update-warehouse-record", "修改按仓库查库记录", "按仓库查库记录管理", ["entity-wi-warehouse-record"], ["process-1782892033238-b02b74c6"], "修改未发布或待检查的交易所直接创建记录。", ["记录ID", "修改内容"], ["按仓库查库记录", "操作记录"]),
        ("td-wi-delete-warehouse-record", "删除按仓库查库记录", "按仓库查库记录管理", ["entity-wi-warehouse-record"], ["process-1782894733013-475e91ed"], "删除未发布或尚未上报的交易所直接创建记录；按品种派生记录不返还次数。", ["记录ID"], ["删除结果", "操作记录"]),
        ("td-wi-report-result", "上报查库结果", "查库结果与确认", ["entity-wi-warehouse-record", "entity-wi-result-detail"], ["process-1782800358597-d7f73c94"], "按模板明细保存检查结果、附件、备注和总查库结论；上报后统一进入待仓库确认。", ["记录ID", "结果明细", "查库结论"], ["结果明细", "记录状态"]),
        ("td-wi-confirm-warehouse", "仓库确认查库结果", "查库结果与确认", ["entity-wi-warehouse-record", "entity-wi-confirm-record"], ["process-1782800358597-d7f73c94", "process-1782952775474-22620f9a"], "仓库上传确认附件并确认结果；交易所直接记录完成，第三方派生记录进入待查阅。", ["记录ID", "确认附件", "确认说明"], ["仓库确认记录", "记录状态"]),
        ("td-wi-read-result", "查阅查库结果", "查库结果与确认", ["entity-wi-warehouse-record", "entity-wi-supervision-link"], ["process-1782800358597-d7f73c94", "process-1782898404353-f889bf90"], "品种负责人查阅第三方查库结果，可关联外部监管函，查阅后检查完成。", ["记录ID", "是否关联监管函", "监管函ID"], ["监管函关联记录", "记录状态"]),
        ("td-wi-query-claim", "查询查库任务承接情况", "按品种查库任务管理", ["entity-wi-variety-task", "entity-wi-claim-record"], ["process-aba9289d"], "查询按品种任务发布、承接单位、承接状态和承接时间。", ["查询条件"], ["承接情况列表"]),
        ("td-wi-query-statistics", "查询查库统计", "查库统计查询", ["entity-wi-stat-view"], ["process-1d02e8f9"], "按查库方式、主体、范围、品种、仓库、单位、状态和结论进行基础统计。", ["统计条件"], ["统计结果"]),
    ]
    for spec in task_specs:
        ensure_task(*spec)

    rule_specs = [
        ("rule-wi-source-boundary", "按仓库记录来源边界", "按仓库查库记录仅允许“交易所直接创建”和“按品种任务派生”两类来源；第三方不能脱离按品种任务独立创建按仓库记录。"),
        ("rule-wi-variety-only-third-party", "按品种查库场景边界", "按品种查库只用于第三方查库场景，不建模交易所按品种查库。"),
        ("rule-wi-count-deduction", "按品种查库次数扣减", "第三方在按品种任务下生成按仓库记录时立即扣减剩余待查次数；同一仓库可重复选择，每次都占用一次；次数不返还。"),
        ("rule-wi-variety-complete", "按品种任务完成", "按品种任务剩余待查次数扣减到0时自动完成；检查时间到期由后续定时任务处理，本阶段不展开。"),
        ("rule-wi-claim-lock", "竞争承接锁定", "按品种任务发布后第三方可竞争承接；首个承接成功后锁定检查单位，其他单位不能再承接。"),
        ("rule-wi-confirm-required", "统一仓库确认", "任何按仓库查库记录上报后都必须进入待仓库确认，不允许绕过仓库确认。"),
        ("rule-wi-after-confirm", "仓库确认后流转", "仓库确认后，交易所直接创建的按仓库记录检查完成；第三方派生的按仓库记录进入待查阅。"),
        ("rule-wi-read-supervision", "查阅与监管函关联", "品种负责人查阅第三方查库结果时可关联外部监管函；本流程只保存关联关系，不创建监管函。"),
        ("rule-wi-template-snapshot", "模板快照保护", "查库结果明细保存模板明细快照，模板后续修改不影响历史查库报告。"),
        ("rule-wi-mvp-exception", "MVP异常边界", "第一阶段只建正常闭环，不处理额度返还、超时释放、拒绝承接、复杂抢单仲裁和长期未上报补偿。"),
    ]
    related_process_uids = process_uids["template"] + process_uids["online"] + process_uids["offline"] + process_uids["stats"]
    for rid, name, content in rule_specs:
        rule = next((item for item in document["rules"] if item.get("uid") == rid or item.get("name") == name), None)
        if rule is None:
            rule = {"uid": rid}
            document["rules"].append(rule)
        rule.update({"name": name, "type": "BusinessRule", "content": content, "relatedProcessUids": related_process_uids})

    process_constructs = {}
    for construct_name, uids in construct_processes.items():
        for process_uid in uids:
            process_constructs.setdefault(process_uid, []).append(constructs[construct_name]["uid"])

    process_task_by_name = {
        "新增查库模板": "td-wi-create-template",
        "修改查库模板": "td-wi-update-template",
        "启用/禁用查库模板": "td-wi-toggle-template",
        "复制查库模板": "td-wi-copy-template",
        "删除查库模板": "td-wi-delete-template",
        "查看查库模板": "td-wi-query-template",
        "新增线上查库": "td-wi-create-online",
        "查看线上查库": "td-wi-query-online",
        "查库统计": "td-wi-query-statistics",
        "查看线下查库任务承接情况": "td-wi-query-claim",
        "交易所修改线下查库": "td-wi-update-warehouse-record",
        "交易所删除线下查库": "td-wi-delete-warehouse-record",
        "交易所查看线下查库": "td-wi-read-result",
        "第三方查看线下查库": "td-wi-read-result",
        "仓库查看线下查库": "td-wi-confirm-warehouse",
    }
    node_task_by_name = {
        "新增线下查库": "td-wi-create-warehouse-record",
        "发布线下查库": "td-wi-publish-variety-task",
        "承接查库任务": "td-wi-claim-variety-task",
        "上报查库结果": "td-wi-report-result",
        "确认查库结果": "td-wi-confirm-warehouse",
        "查阅查库结果": "td-wi-read-result",
        "查看线下查库任务承接情况": "td-wi-query-claim",
    }
    task_by_uid = {item["uid"]: item for item in document["taskDefinitions"] if item.get("uid")}
    entity_by_uid = {item["uid"]: item for item in document["entities"] if item.get("uid")}

    for process in document["processes"]:
        if process.get("stageUid") != "stage-1782348956301-d69e2df5":
            continue
        process["businessComponentUid"] = component_uid
        process["businessComponentUids"] = [component_uid]
        construct_uids = list(dict.fromkeys(process_constructs.get(process.get("uid"), ["construct-wi-warehouse-record"])))
        process["businessConstructUids"] = construct_uids
        process["businessConstructUid"] = construct_uids[0]
        process_task_uid = process_task_by_name.get(process.get("name"))
        for node in process.get("nodes", []):
            task_uid = node_task_by_name.get(node.get("name")) or process_task_uid
            if not task_uid:
                continue
            task_definition = task_by_uid[task_uid]
            node["taskDefinitionUid"] = task_uid
            node["businessComponentUid"] = component_uid
            node["businessConstructUid"] = task_definition.get("constructUid")
            node["constructUid"] = task_definition.get("constructUid")
            entity_ids = task_definition.get("entityUids", [])
            node["entity_ops"] = [
                {
                    "entityUid": entity_id,
                    "entityName": entity_by_uid.get(entity_id, {}).get("name", entity_id),
                    "ops": ["读"] if "查询" in task_definition.get("name", "") else ["读", "写"],
                }
                for entity_id in entity_ids
            ]
            rules = node.setdefault("businessRules", [])
            if not any(isinstance(rule, dict) and rule.get("uid") == "rule-node-wi-target-mode" for rule in rules):
                rules.append(
                    {
                        "uid": "rule-node-wi-target-mode",
                        "name": "目标模式边界",
                        "content": "按目标模式建模：按品种查库任务与按仓库查库记录拆分；第三方只能从已承接的按品种任务派生按仓库记录；任何按仓库记录上报后必须经过仓库确认。",
                    }
                )
        if process.get("uid") == "process-1d02e8f9" and not process.get("nodes"):
            process["nodes"] = [
                {
                    "uid": "node-wi-statistics",
                    "name": "查询查库统计",
                    "role_uid": "role-9fb99263beb7ace9",
                    "role": "品种负责人",
                    "role_uids": ["role-9fb99263beb7ace9"],
                    "roles": ["品种负责人"],
                    "repeatable": False,
                    "rules_note": "按查库方式、主体、范围、品种、仓库、检查单位、状态和结论进行基础统计。",
                    "taskDefinitionUid": "td-wi-query-statistics",
                    "businessComponentUid": component_uid,
                    "constructUid": "construct-wi-statistics",
                    "businessConstructUid": "construct-wi-statistics",
                    "entity_ops": [{"entityUid": "entity-wi-stat-view", "entityName": "查库统计视图", "ops": ["读"]}],
                    "orchestrationTasks": [],
                    "businessRules": [{"uid": "rule-node-wi-statistics", "name": "统计口径", "content": "MVP先提供基础统计维度，不展开复杂指标口径。"}],
                    "forms": [],
                }
            ]

    meta = document.setdefault("meta", {})
    meta["revision"] = int(meta.get("revision") or 0) + 1
    meta["version_label"] = "v593"
    meta["version_id"] = "warehouse-inspection-target-v593"
    meta["updated_at"] = "2026-07-03T01:00:00+08:00"
    meta["tags"] = "正式版, 仓库查库监管目标模式v593"

    saved = canonical_document(document)
    manifest_path.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path.write_text(MarkdownExporter().export(saved), encoding="utf-8")

    print(json.dumps({
        "workspace": str(workspace),
        "backup": str(backup_dir),
        "counts": {key: len(saved.get(key, []) or []) for key in ["entities", "businessConstructs", "businessComponents", "taskDefinitions", "relations", "rules", "processes"]},
        "meta": saved.get("meta", {}),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
