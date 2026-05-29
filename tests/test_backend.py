import http.server
import io
import json
import base64
import shutil
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path

from blm_core.document import create_empty_document, migrate_document
from blm_core.markdown import MarkdownExporter
from blm_core.server import create_handler
from blm_core.storage import InvalidDocumentNameError, WorkspaceStorage
from tools.migrations.upgrade_workspace_documents import upgrade_workspace_documents


def package_dir(workspace: Path, name: str) -> Path:
    return workspace / name


def manifest_path(workspace: Path, name: str) -> Path:
    return package_dir(workspace, name) / "manifest.json"


def markdown_path(workspace: Path, name: str) -> Path:
    return package_dir(workspace, name) / f"{name}.md"


def attachment_root_path(workspace: Path, document_uid: str, document_name: str = "Loans") -> Path:
    preferred = workspace / document_name
    if preferred.exists():
        return preferred / "attachments"
    for package in workspace.iterdir():
        manifest = package / "manifest.json"
        if not manifest.is_file():
            continue
        payload = json.loads(manifest.read_text("utf-8"))
        if payload.get("meta", {}).get("document_uid") == document_uid:
            return package / "attachments"
    return preferred / "attachments"


def attachment_index_path(workspace: Path, document_uid: str, document_name: str = "Loans") -> Path:
    return attachment_root_path(workspace, document_uid, document_name) / "attachments.json"


def attachment_path(workspace: Path, document_uid: str, relative_path: str, document_name: str = "Loans") -> Path:
    return attachment_root_path(workspace, document_uid, document_name) / relative_path


def attachment_files(workspace: Path, document_uid: str, document_name: str = "Loans") -> list[Path]:
    root = attachment_root_path(workspace, document_uid, document_name)
    if not root.exists():
        return []
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.name != "attachments.json"
    )


def history_snapshot_dirs(workspace: Path, name: str) -> list[Path]:
    history_root = workspace / ".history" / name
    if not history_root.exists():
        return []
    return sorted(
        [path for path in history_root.iterdir() if path.is_dir()],
        key=lambda path: path.name,
    )


class CreateEmptyDocumentTests(unittest.TestCase):
    def test_create_empty_document_uses_name_for_title(self):
        document = create_empty_document("Inventory")

        self.assertEqual(document["meta"]["title"], "Inventory")
        self.assertEqual(document["meta"]["domain"], "")
        self.assertEqual(document["processes"][0]["id"], "P1")
        self.assertEqual(document["processes"][0]["flowGroup"], "")
        self.assertEqual(document["processes"][0]["stageId"], "")
        self.assertEqual(document["processes"][0]["stagePos"], {"x": 0, "y": 0})
        self.assertEqual(document["processes"][0]["prototypeFiles"], [])
        self.assertEqual(document["processes"][0]["nodes"], [])
        self.assertEqual(document["stages"], [])
        self.assertEqual(document["stageLinks"], [])
        self.assertEqual(document["stageFlowRefs"], [])
        self.assertEqual(document["stageFlowLinks"], [])
        self.assertEqual(document["entities"], [])


class MigrateDocumentTests(unittest.TestCase):
    def test_migrate_document_converts_legacy_shapes_and_normalizes_values(self):
        legacy_document = {
            "meta": {"title": "Legacy", "bounded_context": "ignored"},
            "roles": ["仓库管理员"],
            "process": {
                "name": "Borrow",
                "subDomain": "仓储仓单管理",
                "trigger": "Reader request",
                "outcome": "Book borrowed",
                "tasks": [
                    {
                        "id": "T1",
                        "name": "Check reader",
                        "role": "仓库管理员",
                        "steps": [{"name": "Validate quota", "type": "Validate"}],
                        "entity_ops": [{"entity_id": "E1", "ops": ["R"]}],
                    }
                ],
            },
            "entities": [
                {
                    "id": "E1",
                    "name": "Reader",
                    "fields": [
                        {"name": "reader_id", "type": "String", "pk": True},
                        {"name": "borrow_count", "type": "Int"},
                    ],
                }
            ],
        }

        migrated = migrate_document(legacy_document)

        self.assertNotIn("process", migrated)
        self.assertNotIn("bounded_context", migrated["meta"])
        self.assertEqual(migrated["processes"][0]["id"], "P1")
        self.assertEqual(migrated["meta"]["schema_version"], 4)
        self.assertEqual(migrated["processes"][0]["flowGroup"], "")
        self.assertEqual(migrated["processes"][0]["stageId"], "")
        self.assertEqual(migrated["processes"][0]["stagePos"], {"x": 0, "y": 0})
        self.assertEqual(migrated["processes"][0]["nodes"][0]["userSteps"][0]["type"], "Check")
        self.assertEqual(migrated["processes"][0]["nodes"][0]["orchestrationTasks"], [])
        self.assertEqual(migrated["entities"][0]["fields"][0]["type"], "string")
        self.assertTrue(migrated["entities"][0]["fields"][0]["is_key"])
        self.assertFalse(migrated["entities"][0]["fields"][0]["is_status"])
        self.assertEqual(migrated["entities"][0]["fields"][1]["type"], "number")
        self.assertEqual(migrated["roles"][0]["name"], "仓库管理员")
        self.assertEqual(migrated["roles"][0]["group"], "仓库作业方")
        self.assertEqual(migrated["roles"][0]["subDomains"], ["仓储仓单管理"])
        self.assertNotIn("status", migrated["roles"][0])
        self.assertEqual(migrated["processes"][0]["nodes"][0]["role"], "仓库管理员")
        self.assertTrue(migrated["processes"][0]["nodes"][0]["role_id"])
        self.assertEqual(migrated["relations"], [])
        self.assertEqual(migrated["rules"], [])
        self.assertEqual(migrated["language"], [])
        self.assertEqual(migrated["stages"], [])
        self.assertEqual(migrated["stageLinks"], [])
        self.assertEqual(migrated["stageFlowRefs"], [])
        self.assertEqual(migrated["stageFlowLinks"], [])

    def test_migrate_document_promotes_string_roles_to_role_objects_and_links_tasks(self):
        document = {
            "meta": {"title": "示例平台"},
            "roles": ["会员", {"id": "R9", "name": "监管员"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "入库办理",
                    "subDomain": "仓储仓单管理",
                    "tasks": [
                        {"id": "T1", "name": "确认到货", "role": "会员"},
                        {"id": "T2", "name": "查库复核", "role_id": "R9"},
                    ],
                }
            ],
            "entities": [],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)

        self.assertEqual(len(migrated["roles"]), 2)
        self.assertEqual(migrated["roles"][0]["name"], "会员")
        self.assertEqual(migrated["roles"][0]["group"], "业务参与方")
        self.assertNotIn("status", migrated["roles"][0])
        self.assertEqual(migrated["roles"][1]["id"], "R9")
        self.assertNotIn("status", migrated["roles"][1])
        self.assertEqual(migrated["processes"][0]["nodes"][0]["role"], "会员")
        self.assertEqual(migrated["processes"][0]["nodes"][1]["role"], "监管员")
        self.assertEqual(migrated["processes"][0]["nodes"][1]["role_id"], "R9")

    def test_migrate_document_normalizes_process_flow_edges_and_gateways(self):
        document = {
            "meta": {"title": "Flow"},
            "roles": [{"id": "R1", "name": "申请人"}, {"id": "R2", "name": "系统"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "预约",
                    "nodes": [
                        {"id": "T1", "name": "提交", "role_id": "R1"},
                        {"id": "T2", "name": "审核", "role_id": "R1"},
                    ],
                    "flow": {
                        "orientation": "vertical",
                        "nodes": [
                            {"id": "G1", "kind": "gateway", "title": "是否完整", "role_id": "R2"},
                            {"id": "bad", "kind": "task"},
                        ],
                        "edges": [
                            {"from": "START", "to": "T1"},
                            {"from": "T1", "to": "G1", "label": "提交后"},
                            {"from": "G1", "to": "T2", "condition": "完整"},
                            {"from": "G1", "to": "END", "label": "驳回"},
                            {"from": "T2", "to": "END"},
                            {"from": "T2", "to": "T2", "label": "补正"},
                            {"from": "", "to": "", "label": "待配置"},
                            {"from": "missing", "to": "T2", "label": "无效"},
                        ],
                    },
                }
            ],
        }

        migrated = migrate_document(document)
        flow = migrated["processes"][0]["flow"]

        self.assertEqual(flow["orientation"], "vertical")
        self.assertTrue(flow["nodes"][0]["uid"])
        self.assertEqual(
            {key: flow["nodes"][0][key] for key in ["id", "kind", "title", "role_id", "gatewayType"]},
            {
                "id": "G1",
                "kind": "gateway",
                "title": "是否完整",
                "role_id": "R2",
                "gatewayType": "exclusive",
            },
        )
        self.assertTrue(all(edge["uid"] for edge in flow["edges"]))
        self.assertEqual(
            [(edge["from"], edge["to"], edge["label"], edge["condition"]) for edge in flow["edges"]],
            [
                ("START", "T1", "", ""),
                ("T1", "G1", "提交后", ""),
                ("G1", "T2", "", "完整"),
                ("G1", "END", "驳回", ""),
                ("T2", "END", "", ""),
                ("T2", "T2", "补正", ""),
                ("", "", "待配置", ""),
            ],
        )

    def test_migrate_document_normalizes_multi_role_nodes(self):
        document = {
            "meta": {"title": "Multi roles"},
            "roles": [
                {"id": "R1", "name": "Maker"},
                {"id": "R2", "name": "Checker"},
            ],
            "processes": [
                {
                    "id": "P1",
                    "name": "Joint review",
                    "subDomain": "Operations",
                    "nodes": [
                        {
                            "id": "T1",
                            "name": "Review task",
                            "role_ids": ["R1", "R2"],
                            "role": "Maker, Checker",
                        }
                    ],
                }
            ],
            "entities": [],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)
        node = migrated["processes"][0]["nodes"][0]

        self.assertEqual(node["role_ids"], ["R1", "R2"])
        self.assertEqual(node["roles"], ["Maker", "Checker"])
        self.assertEqual(node["role_id"], "R1")
        self.assertEqual(node["role"], "Maker、Checker")
        self.assertEqual(migrated["roles"][0]["subDomains"], ["Operations"])
        self.assertEqual(migrated["roles"][1]["subDomains"], ["Operations"])

    def test_migrate_document_adds_state_flow_defaults_for_entities(self):
        document = {
            "meta": {"title": "状态流转"},
            "roles": [{"id": "R1", "name": "审核员"}],
            "processes": [],
            "entities": [
                {
                    "id": "E1",
                    "name": "预约单",
                    "fields": [
                        {"name": "预约状态", "type": "enum", "is_status": True},
                        {"name": "备注", "type": "text"},
                    ],
                    "state_transitions": [
                        {"from": "草稿", "to": "待审核", "action": "提交"}
                    ],
                }
            ],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)

        status_field = migrated["entities"][0]["fields"][0]
        note_field = migrated["entities"][0]["fields"][1]
        transition = migrated["entities"][0]["state_transitions"][0]

        self.assertEqual(status_field["state_values"], "")
        self.assertTrue(status_field["is_status"])
        self.assertEqual(status_field["status_role"], "primary")
        self.assertEqual(note_field["state_values"], "")
        self.assertEqual(transition["from"], "草稿")
        self.assertEqual(transition["to"], "待审核")
        self.assertEqual(transition["action"], "提交")
        self.assertEqual(transition["note"], "")
        self.assertEqual(transition["field_name"], "预约状态")
        self.assertNotIn("role_id", transition)


    def test_migrate_document_normalizes_primary_and_secondary_status_fields(self):
        document = {
            "meta": {"title": "Status roles"},
            "roles": [],
            "processes": [],
            "entities": [
                {
                    "id": "E1",
                    "name": "Delivery",
                    "fields": [
                        {"name": "MainStatus", "type": "enum", "is_status": True},
                        {"name": "SyncStatus", "type": "enum", "status_role": "secondary"},
                        {"name": "NotifyStatus", "type": "enum", "status_role": "primary"},
                    ],
                    "state_transitions": [],
                }
            ],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)
        fields = migrated["entities"][0]["fields"]

        self.assertEqual(fields[0]["status_role"], "primary")
        self.assertTrue(fields[0]["is_status"])
        self.assertEqual(fields[1]["status_role"], "secondary")
        self.assertTrue(fields[1]["is_status"])
        self.assertEqual(fields[2]["status_role"], "secondary")
        self.assertTrue(fields[2]["is_status"])

    def test_migrate_document_infers_state_node_kinds_from_state_values(self):
        document = {
            "meta": {"title": "State nodes"},
            "roles": [],
            "processes": [],
            "entities": [
                {
                    "id": "E1",
                    "name": "Reservation",
                    "fields": [
                        {
                            "name": "Status",
                            "type": "enum",
                            "is_status": True,
                            "state_values": "Draft/Review/Done",
                        }
                    ],
                    "state_transitions": [],
                }
            ],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)
        state_nodes = migrated["entities"][0]["fields"][0]["state_nodes"]

        self.assertEqual(
            state_nodes,
            [
                {"name": "Draft", "kind": "initial"},
                {"name": "Review", "kind": "intermediate"},
                {"name": "Done", "kind": "terminal"},
            ],
        )

    def test_migrate_document_builds_stage_flow_refs_and_links_from_legacy_stage_membership(self):
        document = {
            "meta": {"title": "Stage refs"},
            "roles": [],
            "language": [],
            "stages": [
                {
                    "id": "S1",
                    "name": "入库阶段",
                    "subDomain": "仓储",
                    "processLinks": [
                        {"fromProcessId": "P1", "toProcessId": "P2"},
                    ],
                },
                {
                    "id": "S2",
                    "name": "在库阶段",
                    "subDomain": "仓储",
                    "processLinks": [],
                },
            ],
            "stageLinks": [{"fromStageId": "S1", "toStageId": "S2"}],
            "processes": [
                {"id": "P1", "name": "预约", "subDomain": "仓储", "stageId": "S1", "nodes": []},
                {"id": "P2", "name": "审核", "subDomain": "仓储", "stageId": "S1", "nodes": []},
                {"id": "P3", "name": "入库", "subDomain": "仓储", "stageId": "S2", "nodes": []},
            ],
            "entities": [],
            "relations": [],
            "rules": [],
        }

        migrated = migrate_document(document)

        refs = migrated["stageFlowRefs"]
        links = migrated["stageFlowLinks"]
        self.assertEqual(
            [(item["stageId"], item["processId"]) for item in refs],
            [("S1", "P1"), ("S1", "P2"), ("S2", "P3")],
        )
        self.assertEqual([item["order"] for item in refs], [1, 2, 1])
        self.assertTrue(all(item["id"] for item in refs))
        self.assertTrue(all(item["uid"] for item in refs))
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["stageId"], "S1")
        ref_map = {item["id"]: item for item in refs}
        self.assertEqual(ref_map[links[0]["fromRefId"]]["processId"], "P1")
        self.assertEqual(ref_map[links[0]["toRefId"]]["processId"], "P2")


class MarkdownExporterTests(unittest.TestCase):
    def test_export_includes_process_mermaid_and_entity_tables(self):
        document = {
            "meta": {
                "title": "Library",
                "domain": "Library Domain",
                "author": "LJ",
                "date": "2026-04",
            },
            "roles": [{"id": "R1", "name": "Reader"}],
            "language": [{"term": "Borrow", "definition": "Borrow a book"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "Borrow",
                    "subDomain": "Circulation",
                    "flowGroup": "Borrow Management",
                    "trigger": "Reader wants a book",
                    "outcome": "Loan created",
                    "prototypeFiles": [
                        {"name": "borrow-form.html", "content": "<html><body>Borrow</body></html>"},
                        {"name": "quota-check.html", "content": "<html><body>Quota</body></html>"},
                    ],
                    "tasks": [
                        {
                            "id": "T1",
                            "name": "Check reader",
                            "role_id": "R1",
                            "steps": [{"name": "Read quota", "type": "Query", "note": ""}],
                            "orchestrationTasks": [
                                {
                                    "name": "Query reader quota",
                                    "type": "Query",
                                    "querySourceKind": "QueryService",
                                    "target": "ReaderQuotaService",
                                    "note": "Load current quota before submit",
                                }
                            ],
                            "entity_ops": [{"entity_id": "E1", "ops": ["R", "U"]}],
                            "rules_note": "Reader must be active",
                        }
                    ],
                }
            ],
            "entities": [
                {
                    "id": "E1",
                    "name": "Reader",
                    "group": "People",
                    "fields": [
                        {
                            "name": "reader_id",
                            "type": "id",
                            "is_key": True,
                            "is_status": False,
                            "state_values": "",
                            "note": "",
                        },
                        {
                            "name": "reader_status",
                            "type": "enum",
                            "is_key": False,
                            "is_status": True,
                            "state_values": "Draft/Active/Archived",
                            "note": "主状态字段",
                        },
                    ],
                    "state_transitions": [
                        {
                            "from": "Draft",
                            "to": "Active",
                            "action": "Activate",
                            "note": "Reader must be approved",
                        }
                    ],
                }
            ],
            "relations": [],
            "rules": [],
        }

        markdown = MarkdownExporter().export(document)

        self.assertIn("# Library", markdown)
        self.assertIn("P1: Borrow", markdown)
        self.assertIn("分类标签", markdown)
        self.assertIn("Borrow Management", markdown)
        self.assertIn("borrow-form.html", markdown)
        self.assertIn("quota-check.html", markdown)
        self.assertIn("```mermaid", markdown)
        self.assertIn("T1", markdown)
        self.assertIn("Reader", markdown)
        self.assertIn("业务参与方", markdown)
        self.assertIn("用户操作步骤", markdown)
        self.assertIn("编排任务", markdown)
        self.assertIn("Query reader quota", markdown)
        self.assertIn("reader_id", markdown)
        self.assertIn("reader_status", markdown)
        self.assertIn("字段规则", markdown)
        self.assertIn("Draft/Active/Archived", markdown)
        self.assertIn("节点属性：Draft=初始状态；Active=中间状态；Archived=结束状态", markdown)
        self.assertIn("状态流转", markdown)
        self.assertIn("| 来源状态 | 目标状态 | 备注说明 |", markdown)
        self.assertNotIn("| 来源状态 | 目标状态 | 触发动作 | 说明 |", markdown)
        self.assertIn("Reader must be approved", markdown)

    def test_export_includes_structured_business_rules(self):
        document = migrate_document(
            {
                "meta": {"title": "Rules"},
                "roles": [],
                "language": [],
                "processes": [
                    {
                        "id": "P1",
                        "name": "登录",
                        "nodes": [
                            {
                                "id": "T1",
                                "name": "统一登录",
                                "businessRules": [
                                    {"name": "前置条件", "content": "目标用户拥有账号"},
                                    {"name": "输出", "content": "记录登录日志\n展示资源列表"},
                                ],
                            }
                        ],
                    }
                ],
                "entities": [],
                "relations": [],
                "rules": [],
            }
        )

        markdown = MarkdownExporter().export(document)

        self.assertIn("##### 业务规则", markdown)
        self.assertIn("**前置条件**", markdown)
        self.assertIn("目标用户拥有账号", markdown)
        self.assertIn("展示资源列表", markdown)

    def test_export_uses_stage_flow_refs_for_stage_and_process_views(self):
        document = {
            "meta": {
                "title": "Delivery",
                "domain": "Delivery",
                "author": "LJ",
                "date": "2026-04-24",
            },
            "roles": [],
            "language": [],
            "stages": [
                {"id": "S1", "name": "预约阶段", "subDomain": "示例", "pos": {"x": 0, "y": 0}, "processLinks": []},
                {"id": "S2", "name": "办理阶段", "subDomain": "示例", "pos": {"x": 0, "y": 0}, "processLinks": []},
            ],
            "stageLinks": [
                {"fromStageId": "S1", "toStageId": "S2"},
            ],
            "stageFlowRefs": [
                {"id": "SFR1", "stageId": "S1", "processId": "P1", "order": 1, "pos": {"x": 0, "y": 0}},
                {"id": "SFR2", "stageId": "S1", "processId": "P2", "order": 2, "pos": {"x": 0, "y": 0}},
                {"id": "SFR3", "stageId": "S2", "processId": "P2", "order": 1, "pos": {"x": 0, "y": 0}},
            ],
            "stageFlowLinks": [
                {"id": "SFL1", "stageId": "S1", "fromRefId": "SFR1", "toRefId": "SFR2"},
            ],
            "processes": [
                {
                    "id": "P1",
                    "name": "预约录入",
                    "subDomain": "示例",
                    "flowGroup": "预约组",
                    "trigger": "",
                    "outcome": "",
                    "nodes": [],
                },
                {
                    "id": "P2",
                    "name": "资料审核",
                    "subDomain": "示例",
                    "flowGroup": "审核组",
                    "trigger": "",
                    "outcome": "",
                    "nodes": [],
                },
            ],
            "entities": [],
            "relations": [],
            "rules": [],
        }

        markdown = MarkdownExporter().export(document)
        self.assertIn("\u4e1a\u52a1\u9636\u6bb5", markdown)
        self.assertIn("### 阶段视图: \u9884\u7ea6\u9636\u6bb5", markdown)
        self.assertIn("### 阶段视图: \u529e\u7406\u9636\u6bb5", markdown)
        self.assertIn("SFR1[\"\u9884\u7ea6\u5f55\u5165\"]", markdown)
        self.assertIn("SFR2[\"\u8d44\u6599\u5ba1\u6838\"]", markdown)
        self.assertIn("SFR1 --> SFR2", markdown)
        self.assertIn("**\u4e1a\u52a1\u9636\u6bb5**: \u9884\u7ea6\u9636\u6bb5\u3001\u529e\u7406\u9636\u6bb5", markdown)
        self.assertIn("**业务阶段**: 预约阶段、办理阶段", markdown)
        self.assertIn("**分类标签**: 审核组", markdown)


class WorkspaceStorageTests(unittest.TestCase):
    def test_save_load_and_list_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)

            self.assertEqual(storage.list_documents(), ["Loans"])
            loaded = storage.load("Loans")
            self.assertEqual(loaded["meta"]["title"], "Loans")
            self.assertTrue(manifest_path(workspace, "Loans").exists())
            self.assertTrue(markdown_path(workspace, "Loans").exists())

    def test_list_document_summaries_exposes_space_and_tags(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["meta"]["space"] = "交割业务"
            document["meta"]["tags"] = "担保品，WPF"
            document["meta"]["author"] = "Tester"

            storage.save("Loans", document)

            summaries = storage.list_document_summaries()
            self.assertEqual(len(summaries), 1)
            self.assertEqual(summaries[0]["name"], "Loans")
            self.assertEqual(summaries[0]["space"], "交割业务")
            self.assertEqual(summaries[0]["tags"], ["担保品", "WPF"])
            self.assertEqual(summaries[0]["author"], "Tester")

    def test_save_stores_process_prototypes_as_package_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                },
                {
                    "uid": "proto-b",
                    "name": "quota-check.html",
                    "content": "<html><body>quota</body></html>",
                    "contentType": "text/html",
                },
            ]

            saved_document = storage.save("Loans", document)
            self.assertEqual(saved_document["processes"][0]["prototypeFiles"][0].get("content", ""), "")
            self.assertEqual(saved_document["processes"][0]["prototypeFiles"][0]["versions"][0].get("content", ""), "")

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entries = manifest["processes"][0]["prototypeFiles"]
            self.assertEqual(len(prototype_entries), 2)
            self.assertNotIn("content", prototype_entries[0])
            self.assertNotIn("name", prototype_entries[0])
            self.assertIn("uid", prototype_entries[0])
            self.assertIn("versionUid", prototype_entries[0])
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            self.assertEqual(len(attachment_index["attachments"]), 2)
            first_attachment = attachment_index["attachments"][0]
            self.assertEqual(first_attachment["name"], "borrow-form.html")
            self.assertEqual(first_attachment["ownerType"], "process")
            self.assertEqual(first_attachment["ownerId"], document["processes"][0]["id"])
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    first_attachment["versions"][0]["path"],
                ).exists()
            )
            self.assertRegex(
                first_attachment["versions"][0]["path"],
                r"^processes/[^/]+/[^/]+/v1__borrow-form\.html$",
            )

            loaded = storage.load("Loans")
            self.assertEqual(loaded["processes"][0]["prototypeFiles"][0].get("content", ""), "")
            self.assertEqual(loaded["processes"][0]["prototypeFiles"][0]["versions"][0].get("content", ""), "")
            filename, content_type, payload = storage.load_attachment_payload(
                "Loans",
                first_attachment["uid"],
                first_attachment["versions"][0]["uid"],
            )
            self.assertEqual(filename, "borrow-form.html")
            self.assertEqual(content_type, "text/html")
            self.assertEqual(payload.decode("utf-8"), "<html><body>borrow</body></html>")
            self.assertEqual(loaded["processes"][0]["prototypeFiles"][0]["versions"][0]["number"], 1)
            self.assertTrue(loaded["processes"][0]["prototypeFiles"][0]["versions"][0]["uploadedAt"])

    def test_save_stores_binary_process_attachments(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            png_payload = b"\x89PNG\r\n\x1a\n\x00\x00binary-image"
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "wireframe.png",
                    "content": base64.b64encode(png_payload).decode("ascii"),
                    "contentEncoding": "base64",
                    "contentType": "image/png",
                    "size": len(png_payload),
                }
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            attachment_version = attachment_index["attachments"][0]["versions"][0]
            self.assertRegex(
                attachment_version["path"],
                r"^processes/[^/]+/[^/]+/v1__wireframe\.png$",
            )
            stored_payload = attachment_path(
                workspace,
                manifest["meta"]["document_uid"],
                attachment_version["path"],
            ).read_bytes()
            self.assertEqual(stored_payload, png_payload)
            self.assertEqual(attachment_version["contentType"], "image/png")
            self.assertEqual(attachment_version["contentEncoding"], "base64")
            self.assertEqual(attachment_version["size"], len(png_payload))

            loaded_attachment = storage.load("Loans")["processes"][0]["prototypeFiles"][0]
            self.assertEqual(loaded_attachment["contentEncoding"], "base64")
            self.assertEqual(loaded_attachment.get("content", ""), "")
            self.assertEqual(loaded_attachment["versions"][0].get("content", ""), "")
            self.assertEqual(loaded_attachment["size"], len(png_payload))
            filename, content_type, payload = storage.load_attachment_payload(
                "Loans",
                attachment_index["attachments"][0]["uid"],
                attachment_version["uid"],
            )
            self.assertEqual(filename, "wireframe.png")
            self.assertEqual(content_type, "image/png")
            self.assertEqual(payload, png_payload)

    def test_build_export_bundle_outputs_zip_package_with_prototypes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]
            storage.save("Loans", document)

            filename, payload = storage.build_export_bundle("Loans")

            self.assertEqual(filename, "Loans.zip")
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                names = sorted(archive.namelist())
                self.assertIn("Loans/manifest.json", names)
                self.assertIn("Loans/Loans.md", names)
                self.assertIn("Loans/attachments/attachments.json", names)
                manifest = json.loads(archive.read("Loans/manifest.json").decode("utf-8"))
                prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
                self.assertNotIn("content", prototype_entry)
                self.assertEqual(prototype_entry["uid"], "proto-a")
                self.assertTrue(prototype_entry["versionUid"])
                attachment_index = json.loads(archive.read("Loans/attachments/attachments.json").decode("utf-8"))
                attachment_entry = attachment_index["attachments"][0]
                self.assertEqual(attachment_entry["name"], "borrow-form.html")
                self.assertEqual(attachment_entry["ownerType"], "process")
                self.assertEqual(attachment_entry["ownerId"], document["processes"][0]["id"])
                self.assertRegex(
                    attachment_entry["versions"][0]["path"],
                    r"^attachments/processes/[^/]+/[^/]+/v1__borrow-form\.html$",
                )
                self.assertIn(f"Loans/{attachment_entry['versions'][0]['path']}", names)
                self.assertEqual(
                    archive.read(f"Loans/{attachment_entry['versions'][0]['path']}").decode("utf-8"),
                    "<html><body>borrow</body></html>",
                )

    def test_build_export_bundle_preserves_binary_process_attachments(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            document = create_empty_document("Loans")
            pdf_payload = b"%PDF-1.4\nbinary-pdf\n%%EOF"
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "rules.pdf",
                    "content": base64.b64encode(pdf_payload).decode("ascii"),
                    "contentEncoding": "base64",
                    "contentType": "application/pdf",
                    "size": len(pdf_payload),
                }
            ]
            storage.save("Loans", document)

            _, payload = storage.build_export_bundle("Loans")

            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                attachment_index = json.loads(archive.read("Loans/attachments/attachments.json").decode("utf-8"))
                attachment_version = attachment_index["attachments"][0]["versions"][0]
                self.assertEqual(attachment_version["contentEncoding"], "base64")
                self.assertEqual(attachment_version["size"], len(pdf_payload))
                self.assertEqual(
                    archive.read(f"Loans/{attachment_version['path']}"),
                    pdf_payload,
                )

    def test_save_stores_attachment_versions_and_current_version_ref(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "versionUid": "proto-a-v2",
                    "versions": [
                        {
                            "uid": "proto-a-v1",
                            "number": 1,
                            "name": "borrow-form.html",
                            "content": "<html><body>v1</body></html>",
                            "contentType": "text/html",
                            "uploadedAt": "2026-04-23 10:00:00",
                        },
                        {
                            "uid": "proto-a-v2",
                            "number": 2,
                            "name": "borrow-form.html",
                            "content": "<html><body>v2</body></html>",
                            "contentType": "text/html",
                            "uploadedAt": "2026-04-23 10:05:00",
                        },
                    ],
                },
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entries = manifest["processes"][0]["prototypeFiles"]
            self.assertEqual(len(prototype_entries), 1)
            self.assertEqual(prototype_entries[0]["uid"], "proto-a")
            self.assertEqual(prototype_entries[0]["versionUid"], "proto-a-v2")
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            attachment_versions = attachment_index["attachments"][0]["versions"]
            self.assertEqual(
                [version["uid"] for version in attachment_versions],
                ["proto-a-v1", "proto-a-v2"],
            )
            self.assertEqual(
                [path.name for path in attachment_files(workspace, manifest["meta"]["document_uid"])],
                ["v1__borrow-form.html", "v2__borrow-form.html"],
            )

    def _legacy_save_preserves_unicode_attachment_filename(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "示例查询（客户、机构）.html",
                    "content": "<html><body>unicode</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
            self.assertEqual(prototype_entry["attachmentKey"], "示例查询（客户、机构）.html")
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    prototype_entry["attachmentKey"],
                ).exists()
            )

    def test_save_preserves_unicode_attachment_filename_v2(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "示例查询（客户、机构）.html",
                    "content": "<html><body>unicode</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            version_path = attachment_index["attachments"][0]["versions"][0]["path"]
            self.assertEqual(prototype_entry["uid"], "proto-a")
            self.assertTrue(version_path.endswith("示例查询（客户、机构）.html"))
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    version_path,
                ).exists()
            )

    def test_history_versions_reuse_single_attachment_file_when_prototype_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            current_manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            history_manifest = json.loads(
                (history_snapshot_dirs(workspace, "Loans")[0] / "manifest.json").read_text("utf-8")
            )
            current_ref = current_manifest["processes"][0]["prototypeFiles"][0]
            history_ref = history_manifest["processes"][0]["prototypeFiles"][0]

            self.assertEqual(current_ref, history_ref)
            saved_files = attachment_files(workspace, current_manifest["meta"]["document_uid"])
            self.assertEqual(len(saved_files), 1)
            self.assertEqual(saved_files[0].name, "v1__borrow-form.html")

    def test_concurrent_saves_do_not_corrupt_document_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            payload = base64.b64encode(b"concurrent attachment").decode("ascii")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "flow.txt",
                    "content": payload,
                    "contentEncoding": "base64",
                    "contentType": "text/plain",
                    "size": 21,
                    "versions": [
                        {
                            "uid": "attach-a-v1",
                            "number": 1,
                            "name": "flow.txt",
                            "content": payload,
                            "contentEncoding": "base64",
                            "contentType": "text/plain",
                            "size": 21,
                        }
                    ],
                    "versionUid": "attach-a-v1",
                }
            ]

            storage.save("Loans", document)
            first = deepcopy(document)
            second = deepcopy(document)
            first["meta"]["title"] = "Loans first"
            second["meta"]["title"] = "Loans second"

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda doc: storage.save("Loans", doc), [first, second]))

            self.assertEqual(len(results), 2)
            loaded = storage.load("Loans")
            self.assertIn(loaded["meta"]["title"], {"Loans first", "Loans second"})
            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            version_path = attachment_index["attachments"][0]["versions"][0]["path"]
            self.assertTrue(attachment_path(workspace, manifest["meta"]["document_uid"], version_path).exists())

    def test_migrate_workspace_layout_converts_legacy_documents_history_and_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            legacy_document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "legacy.html",
                    "content": "<html><body>legacy</body></html>",
                    "contentType": "text/html",
                }
            ]
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / "Legacy.md").write_text("# Legacy\n", "utf-8")
            history_dir = workspace / ".history" / "Legacy"
            history_dir.mkdir(parents=True, exist_ok=True)
            (history_dir / "20260423-120000-000001.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (history_dir / "20260423-120000-000001.md").write_text("# Legacy\n", "utf-8")
            (workspace / ".trash" / "Legacy-20260423-120100-000001.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / ".trash" / "Legacy-20260423-120100-000001.md").write_text("# Legacy\n", "utf-8")

            result = storage.migrate_workspace_layout()

            self.assertEqual(result, {"documents": 1, "history": 1, "trash": 1})
            self.assertTrue(manifest_path(workspace, "Legacy").exists())
            self.assertFalse((workspace / "Legacy.json").exists())
            migrated_manifest = json.loads(manifest_path(workspace, "Legacy").read_text("utf-8"))
            migrated_index = json.loads(
                attachment_index_path(workspace, migrated_manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            migrated_path = migrated_index["attachments"][0]["versions"][0]["path"]
            self.assertTrue(attachment_path(workspace, migrated_manifest["meta"]["document_uid"], migrated_path).exists())
            self.assertTrue((workspace / ".history" / "Legacy" / "20260423-120000-000001" / "manifest.json").exists())
            self.assertFalse((history_dir / "20260423-120000-000001.json").exists())
            self.assertTrue((workspace / ".trash" / "Legacy-20260423-120100-000001" / "manifest.json").exists())
            self.assertFalse((workspace / ".trash" / "Legacy-20260423-120100-000001.json").exists())

    def test_rejects_unsafe_document_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))

            with self.assertRaises(InvalidDocumentNameError):
                storage.save("../secret", create_empty_document("secret"))

            with self.assertRaises(InvalidDocumentNameError):
                storage.load("nested/path")

    def test_save_existing_document_creates_history_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            snapshots = history_snapshot_dirs(workspace, "Loans")

            self.assertEqual(len(snapshots), 1)
            self.assertTrue((snapshots[0] / "Loans.md").exists())
            snapshot_document = json.loads((snapshots[0] / "manifest.json").read_text("utf-8"))
            self.assertEqual(snapshot_document["meta"]["title"], "Loans")
            self.assertEqual(storage.load("Loans")["meta"]["title"], "Loans v2")

    def test_history_snapshot_label_uses_friendly_time_when_message_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document, save_message="")

            history_entries = storage.list_history("Loans")

            self.assertEqual(len(history_entries), 1)
            self.assertEqual(history_entries[0]["message"], "")
            for marker in ["年", "月", "日", "时", "分", "秒"]:
                self.assertIn(marker, history_entries[0]["label"])
            self.assertEqual(history_entries[0]["label"], history_entries[0]["timestamp_label"])

    def test_history_snapshot_label_includes_optional_save_message(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document, save_message="补充流程说明")

            history_entries = storage.list_history("Loans")
            snapshot_meta = json.loads((history_snapshot_dirs(workspace, "Loans")[0] / "snapshot.json").read_text("utf-8"))

            self.assertEqual(len(history_entries), 1)
            self.assertEqual(history_entries[0]["message"], "补充流程说明")
            self.assertEqual(snapshot_meta["message"], "补充流程说明")
            self.assertEqual(history_entries[0]["label"], f"补充流程说明（{history_entries[0]['timestamp_label']}）")

    def test_revision_save_snapshots_loaded_base_document_with_stable_uids(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_dir = workspace / "Legacy"
            legacy_dir.mkdir()
            (legacy_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "meta": {"title": "Legacy", "author": "old", "revision": 0},
                        "businessAreas": [{"name": "会员客户"}],
                        "valueStreams": [{"name": "业务办理"}],
                        "processes": [{"name": "申请提交", "nodes": [{"name": "填写申请"}]}],
                        "entities": [{"name": "申请单", "fields": [{"name": "编号"}]}],
                    },
                    ensure_ascii=False,
                ),
                "utf-8",
            )
            base_document = storage.load("Legacy")
            edited_document = deepcopy(base_document)
            edited_document["meta"]["author"] = "new"

            storage.save_with_revision(
                "Legacy",
                edited_document,
                base_revision=base_document["meta"]["revision"],
                base_document=base_document,
                rebase=True,
            )

            history_entries = storage.list_history("Legacy")
            history_document = storage.load_history("Legacy", history_entries[0]["id"])

            self.assertEqual(history_document["meta"]["author"], "old")
            self.assertEqual(storage.load("Legacy")["meta"]["author"], "new")
            self.assertEqual(history_document["processes"][0]["uid"], base_document["processes"][0]["uid"])
            self.assertEqual(history_document["processes"][0]["nodes"][0]["uid"], base_document["processes"][0]["nodes"][0]["uid"])
            self.assertEqual(history_document["entities"][0]["uid"], base_document["entities"][0]["uid"])
            self.assertEqual(history_document["entities"][0]["fields"][0]["uid"], base_document["entities"][0]["fields"][0]["uid"])

    def test_upgrade_workspace_documents_cleans_dirty_stage_flow_history_snapshots(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Guarantee")
            document["stages"] = [{"uid": "stage-1", "name": "申请"}]
            document["processes"] = [
                {"uid": "process-1", "name": "提交", "stageUid": "stage-1", "nodes": []},
                {"uid": "process-2", "name": "复核", "stageUid": "stage-1", "nodes": []},
            ]
            storage._write_package_dir(workspace / "Guarantee", "Guarantee", document)
            snapshot_dir = workspace / ".history" / "Guarantee" / "20260514-120000-000001"
            dirty_history = deepcopy(document)
            dirty_history["meta"]["author"] = "old"
            dirty_history["stageFlowRefs"] = [
                {"uid": "dirty-ref", "stageUid": "", "processUid": "", "order": 1},
            ]
            dirty_history["stageFlowLinks"] = [
                {"uid": "dirty-link", "stageUid": "", "fromRefUid": "", "toRefUid": ""},
            ]
            snapshot_dir.mkdir(parents=True)
            (snapshot_dir / "manifest.json").write_text(json.dumps(dirty_history, ensure_ascii=False, indent=2), "utf-8")
            (snapshot_dir / "Guarantee.md").write_text("# Guarantee\n", "utf-8")

            result = upgrade_workspace_documents(workspace, documents=["Guarantee"])

            current_manifest = json.loads((workspace / "Guarantee" / "manifest.json").read_text("utf-8"))
            history_manifest = json.loads((snapshot_dir / "manifest.json").read_text("utf-8"))
            self.assertEqual(result["documents"][0]["dirtyStageFlowAfter"], {"stageFlowRefs": 0, "stageFlowLinks": 0})
            self.assertEqual(result["documents"][0]["historySnapshots"][0]["dirtyStageFlowAfter"], {"stageFlowRefs": 0, "stageFlowLinks": 0})
            self.assertEqual(
                [(ref["stageUid"], ref["processUid"]) for ref in current_manifest["stageFlowRefs"]],
                [("stage-1", "process-1"), ("stage-1", "process-2")],
            )
            self.assertEqual(
                [(ref["stageUid"], ref["processUid"]) for ref in history_manifest["stageFlowRefs"]],
                [("stage-1", "process-1"), ("stage-1", "process-2")],
            )
            self.assertEqual(history_manifest["stageFlowLinks"], [])

    def test_history_snapshot_keeps_attachment_metadata_without_binary_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            staged = storage.stage_attachment_upload("large.bin", "application/octet-stream", b"x" * 1024)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "large.bin",
                    "contentType": "application/octet-stream",
                    "versions": [
                        {
                            "uid": "attach-a-v1",
                            "number": 1,
                            "name": "large.bin",
                            "contentType": "application/octet-stream",
                            "uploadToken": staged["token"],
                        }
                    ],
                }
            ]
            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"

            storage.save("Loans", document)

            snapshot = history_snapshot_dirs(workspace, "Loans")[0]
            self.assertTrue((snapshot / "attachments" / "attachments.json").is_file())
            snapshot_files = [
                path
                for path in snapshot.rglob("*")
                if path.is_file() and path.name != "manifest.json" and path.name != "Loans.md" and path.name != "attachments.json"
            ]
            self.assertEqual(snapshot_files, [])

    def test_existing_attachment_file_is_not_rewritten_on_metadata_save(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            staged = storage.stage_attachment_upload("large.bin", "application/octet-stream", b"x" * 1024)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "large.bin",
                    "contentType": "application/octet-stream",
                    "versions": [
                        {
                            "uid": "attach-a-v1",
                            "number": 1,
                            "name": "large.bin",
                            "contentType": "application/octet-stream",
                            "uploadToken": staged["token"],
                        }
                    ],
                }
            ]
            saved = storage.save("Loans", document)
            attachment_version = saved["processes"][0]["prototypeFiles"][0]["versions"][0]
            document_uid = saved["meta"]["document_uid"]
            stored_path = attachment_path(workspace, document_uid, storage._load_attachment_index(document_uid, package_dir(workspace, "Loans"))["attach-a"]["versions"][0]["path"])
            before_stat = stored_path.stat()
            document["meta"]["author"] = "metadata only"
            document["processes"][0]["prototypeFiles"] = [attachment_version | {"uid": "attach-a", "versionUid": "attach-a-v1"}]

            storage.save("Loans", document)

            after_stat = stored_path.stat()
            self.assertEqual(after_stat.st_mtime_ns, before_stat.st_mtime_ns)
            self.assertEqual(after_stat.st_size, before_stat.st_size)

    def test_delete_moves_document_to_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.save("Loans", create_empty_document("Loans"))

            storage.delete("Loans")

            self.assertFalse(manifest_path(workspace, "Loans").exists())
            self.assertFalse(markdown_path(workspace, "Loans").exists())
            trash_dirs = sorted(path for path in (workspace / ".trash").glob("Loans-*") if path.is_dir())
            self.assertEqual(len(trash_dirs), 1)
            self.assertTrue((trash_dirs[0] / "manifest.json").exists())
            self.assertTrue((trash_dirs[0] / "Loans.md").exists())

    def test_save_consumes_staged_attachment_upload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            staged = storage.stage_attachment_upload("large.doc", "application/msword", b"large-doc-payload")
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "attach-a",
                    "name": "large.doc",
                    "contentType": "application/msword",
                    "versions": [
                        {
                            "uid": "attach-a-v1",
                            "number": 1,
                            "name": "large.doc",
                            "contentType": "application/msword",
                            "uploadToken": staged["token"],
                        }
                    ],
                }
            ]

            saved_document = storage.save("Loans", document)

            attachment = saved_document["processes"][0]["prototypeFiles"][0]
            self.assertEqual(attachment["size"], len(b"large-doc-payload"))
            self.assertEqual(storage.load_attachment_payload("Loans", "attach-a", "attach-a-v1")[2], b"large-doc-payload")
            self.assertFalse((workspace / ".uploads" / f"{staged['token']}.bin").exists())
            self.assertFalse((workspace / ".uploads" / f"{staged['token']}.json").exists())

    def test_save_uses_hidden_tmp_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)

            storage.save("Loans", create_empty_document("Loans"))

            self.assertTrue((workspace / ".tmp").is_dir())
            self.assertFalse(any(path.name.startswith(".Loans.tmp-") for path in workspace.iterdir()))

    def test_history_keeps_recent_snapshots_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.history_limit = 3
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            for version in range(1, 6):
                document["meta"]["title"] = f"Loans v{version}"
                storage.save("Loans", document)

            snapshots = history_snapshot_dirs(workspace, "Loans")

            self.assertEqual(len(snapshots), 3)
            self.assertEqual(
                [json.loads((path / "manifest.json").read_text("utf-8"))["meta"]["title"] for path in snapshots],
                ["Loans v2", "Loans v3", "Loans v4"],
            )

    def test_list_and_restore_history_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            history_entries = storage.list_history("Loans")
            self.assertEqual(len(history_entries), 1)

            restored = storage.restore_history("Loans", history_entries[0]["id"])
            self.assertEqual(restored["meta"]["title"], "Loans")
            self.assertEqual(storage.load("Loans")["meta"]["title"], "Loans")

    def test_list_and_restore_trash_entry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.save("Loans", create_empty_document("Loans"))
            storage.delete("Loans")

            trash_entries = storage.list_trash()
            self.assertEqual(len(trash_entries), 1)
            restored_name, restored_document = storage.restore_trash(trash_entries[0]["id"])

            self.assertEqual(restored_name, "Loans")
            self.assertEqual(restored_document["meta"]["title"], "Loans")
            self.assertTrue(manifest_path(workspace, "Loans").exists())
            self.assertEqual(storage.list_trash(), [])

    def test_list_trash_returns_empty_when_trash_dir_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            shutil.rmtree(workspace / ".trash", ignore_errors=True)
            self.assertEqual(storage.list_trash(), [])

    def test_rename_moves_old_workspace_document_to_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("示例平台-合并")
            document["meta"]["domain"] = "示例平台"
            document["meta"]["title"] = "示例平台"
            storage.save("示例平台-合并", create_empty_document("示例平台-合并"))

            renamed_name, renamed_document = storage.rename(
                "示例平台-合并",
                "示例平台",
                document,
            )

            self.assertEqual(renamed_name, "示例平台")
            self.assertEqual(renamed_document["meta"]["title"], "示例平台")
            self.assertEqual(renamed_document["meta"]["domain"], "示例平台")
            self.assertFalse(manifest_path(workspace, "示例平台-合并").exists())
            self.assertTrue(manifest_path(workspace, "示例平台").exists())
            self.assertTrue(any(entry["doc_name"] == "示例平台-合并" for entry in storage.list_trash()))

    def test_rename_can_overwrite_existing_document_when_explicitly_allowed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            source = create_empty_document("示例平台-合并")
            source["meta"]["domain"] = "示例平台"
            source["meta"]["title"] = "示例平台"
            target = create_empty_document("示例平台")
            target["meta"]["author"] = "legacy"

            storage.save("示例平台-合并", source)
            storage.save("示例平台", target)

            renamed_name, renamed_document = storage.rename(
                "示例平台-合并",
                "示例平台",
                source,
                overwrite=True,
            )

            self.assertEqual(renamed_name, "示例平台")
            self.assertEqual(renamed_document["meta"]["title"], "示例平台")
            self.assertFalse(manifest_path(workspace, "示例平台-合并").exists())
            self.assertEqual(storage.load("示例平台")["meta"]["title"], "示例平台")
            history_entries = storage.list_history("示例平台")
            self.assertEqual(len(history_entries), 1)
            history_snapshot = storage.restore_history("示例平台", history_entries[0]["id"])
            self.assertEqual(history_snapshot["meta"]["author"], "legacy")

    def test_save_upgrades_legacy_workspace_document_to_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / "Legacy.md").write_text("# Legacy\n", "utf-8")

            storage.save("Legacy", legacy_document)

            self.assertFalse((workspace / "Legacy.json").exists())
            self.assertFalse((workspace / "Legacy.md").exists())
            self.assertTrue(manifest_path(workspace, "Legacy").exists())
            self.assertTrue(markdown_path(workspace, "Legacy").exists())

    def test_list_documents_and_load_support_legacy_workspace_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )

            self.assertEqual(storage.list_documents(), ["Legacy"])
            self.assertEqual(storage.load("Legacy")["meta"]["title"], "Legacy")


class MergeApiTests(unittest.TestCase):
    def test_document_normalize_returns_migrated_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "document": {
                        "meta": {"title": "Local"},
                        "roles": [{"name": "审核员"}],
                        "processes": [],
                        "entities": [],
                        "relations": [],
                        "rules": [],
                        "language": [],
                    }
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/document/normalize",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertTrue(result["document"]["meta"]["document_uid"])
        self.assertEqual(result["document"]["meta"]["schema_version"], 4)
        self.assertTrue(result["document"]["roles"][0]["uid"])
        self.assertEqual(result["document"]["processes"], [])
        self.assertEqual(result["document"]["stageFlowRefs"], [])
        self.assertEqual(result["document"]["stageFlowLinks"], [])

    def test_merge_analyze_accepts_inline_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            left = create_empty_document("Supply")
            left["roles"].append(
                {
                    "id": "R1",
                    "name": "仓库主管",
                    "desc": "",
                    "group": "业务参与方",
                    "subDomains": ["仓储"],
                }
            )
            right = create_empty_document("Supply")
            right["entities"].append(
                {
                    "id": "E1",
                    "name": "出库单",
                    "group": "仓储",
                    "note": "",
                    "fields": [{"name": "单号", "type": "string", "is_key": True, "is_status": False}],
                    "state_transitions": [],
                }
            )

            payload = json.dumps(
                {
                    "mode": "combine",
                    "left_document": left,
                    "right_document": right,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/merge/analyze",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["conflicts"], [])
        self.assertEqual(len(result["merged_document"]["roles"]), 1)
        self.assertEqual(len(result["merged_document"]["entities"]), 1)

    def test_rename_api_keeps_workspace_name_aligned_with_domain(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("示例平台-合并", create_empty_document("示例平台-合并"))
            document = storage.load("示例平台-合并")
            document["meta"]["domain"] = "示例平台"
            document["meta"]["title"] = "示例平台"

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "old_name": "示例平台-合并",
                    "new_name": "示例平台",
                    "document": document,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/rename",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "示例平台")
        self.assertEqual(result["document"]["meta"]["title"], "示例平台")
        self.assertEqual(result["document"]["meta"]["domain"], "示例平台")

    def test_copy_api_duplicates_package_without_rewriting_model_uids(self):
        def uid_map(value, path=""):
            result = {}
            if isinstance(value, list):
                for index, item in enumerate(value):
                    result.update(uid_map(item, f"{path}[{index}]"))
                return result
            if isinstance(value, dict):
                for key, child in value.items():
                    child_path = f"{path}.{key}" if path else key
                    if key in {"uid", "versionUid"}:
                        result[child_path] = str(child or "")
                    result.update(uid_map(child, child_path))
            return result

        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            document = create_empty_document("Source")
            document["roles"] = [{"uid": "role-u1", "id": "R1", "name": "Role"}]
            document["stages"] = [{"uid": "stage-u1", "id": "S1", "name": "Stage"}]
            document["processes"] = [
                {
                    "uid": "proc-u1",
                    "id": "P1",
                    "name": "Process",
                    "stageId": "S1",
                    "prototypeFiles": [
                        {
                            "uid": "attach-u1",
                            "name": "test.txt",
                            "versionUid": "attach-u1-v1",
                            "versions": [
                                {
                                    "uid": "attach-u1-v1",
                                    "number": 1,
                                    "name": "test.txt",
                                    "content": "hello",
                                    "contentType": "text/plain",
                                }
                            ],
                        }
                    ],
                    "nodes": [
                        {
                            "uid": "node-u1",
                            "id": "T1",
                            "name": "Node",
                            "userSteps": [{"uid": "step-u1", "id": "U1", "action": "Do"}],
                            "businessRules": [{"uid": "rule-u1", "id": "BR1", "name": "Rule", "content": ""}],
                        }
                    ],
                    "flow": {"nodes": [], "edges": [{"uid": "edge-u1", "id": "E1", "from": "START", "to": "T1"}]},
                }
            ]
            storage.save("Source", document)

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps({"source_name": "Source", "target_name": "Copy"}, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/copy",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

            source = storage.load("Source")
            copied = storage.load("Copy")
            attachment = copied["processes"][0]["prototypeFiles"][0]
            filename, content_type, attachment_payload = storage.load_attachment_payload(
                "Copy",
                attachment["uid"],
                attachment["versionUid"],
            )
            has_target_markdown = (workspace_dir / "Copy" / "Copy.md").is_file()
            has_stale_markdown = (workspace_dir / "Copy" / "Source.md").exists()

        self.assertTrue(result["ok"])
        self.assertEqual(copied["meta"]["title"], "Copy")
        self.assertEqual(copied["meta"]["domain"], "Copy")
        self.assertNotEqual(copied["meta"]["document_uid"], source["meta"]["document_uid"])
        self.assertEqual(uid_map(source), uid_map(copied))
        self.assertTrue(has_target_markdown)
        self.assertFalse(has_stale_markdown)
        self.assertEqual(filename, "test.txt")
        self.assertEqual(content_type, "text/plain")
        self.assertEqual(attachment_payload, b"hello")

    def test_rename_api_can_overwrite_existing_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("示例平台-合并", create_empty_document("示例平台-合并"))
            existing = create_empty_document("示例平台")
            existing["meta"]["author"] = "existing"
            storage.save("示例平台", existing)

            document = storage.load("示例平台-合并")
            document["meta"]["domain"] = "示例平台"
            document["meta"]["title"] = "示例平台"

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "old_name": "示例平台-合并",
                    "new_name": "示例平台",
                    "document": document,
                    "overwrite": True,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/rename",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "示例平台")
        self.assertEqual(result["document"]["meta"]["title"], "示例平台")


class RecoveryApiTests(unittest.TestCase):
    def test_history_api_lists_snapshots(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            document = create_empty_document("Loans")
            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/history/Loans"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["doc_name"], "Loans")

    def test_trash_restore_api_restores_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("Loans", create_empty_document("Loans"))
            storage.delete("Loans")
            trash_entry = storage.list_trash()[0]["id"]

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps({"entry_id": trash_entry}).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/trash/restore",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "Loans")
        self.assertEqual(result["document"]["meta"]["title"], "Loans")


class ExportApiTests(unittest.TestCase):
    def test_export_bundle_api_returns_zip_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]
            storage.save("Loans", document)

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/export-bundle/Loans"
                ) as response:
                    payload = response.read()
                    content_type = response.headers.get("Content-Type")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(content_type, "application/zip")
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = sorted(archive.namelist())
            self.assertIn("Loans/manifest.json", names)
            self.assertIn("Loans/Loans.md", names)
            self.assertIn("Loans/attachments/attachments.json", names)
            manifest = json.loads(archive.read("Loans/manifest.json").decode("utf-8"))
            prototype = manifest["processes"][0]["prototypeFiles"][0]
            self.assertEqual(prototype["uid"], "proto-a")
            self.assertTrue(prototype["versionUid"])
            attachment_index = json.loads(archive.read("Loans/attachments/attachments.json").decode("utf-8"))
            version_path = attachment_index["attachments"][0]["versions"][0]["path"]
            self.assertRegex(version_path, r"^attachments/processes/[^/]+/[^/]+/v1__borrow-form\.html$")
            self.assertIn(f"Loans/{version_path}", names)
            self.assertEqual(
                archive.read(f"Loans/{version_path}").decode("utf-8"),
                "<html><body>borrow</body></html>",
            )

    def test_export_bundle_api_supports_non_ascii_download_filename(self):
        document_name = "\u4ea4\u5272\u667a\u6167\u76d1\u7ba1\u5e73\u53f0v2"
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save(document_name, create_empty_document(document_name))

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                url_name = urllib.parse.quote(document_name)
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/export-bundle/{url_name}"
                ) as response:
                    payload = response.read()
                    disposition = response.headers.get("Content-Disposition")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertGreater(len(payload), 0)
        self.assertIn('filename="________v2.zip"', disposition)
        self.assertIn("filename*=UTF-8''%E4%BA%A4%E5%89%B2", disposition)


class DocsApiTests(unittest.TestCase):
    def test_runtime_api_exposes_docs_capability(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/runtime"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(result["api_version"], 2)
        self.assertTrue(result["supports_docs"])
        self.assertTrue(result["supports_copy"])
        self.assertEqual(result["mode"], "browser")

    def test_docs_api_lists_builtin_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(
            [item["id"] for item in result],
            ["user-manual", "design", "modeling-thinking"],
        )
        self.assertTrue(all(item["title"] for item in result))

    def test_docs_api_returns_markdown_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs/user-manual"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(result["id"], "user-manual")
        self.assertEqual(result["title"], "用户手册")
        self.assertIn("screenshots/05_open_dialog.png", result["content"])

    def test_docs_asset_api_returns_screenshot_binary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs/assets/screenshots/05_open_dialog.png"
                ) as response:
                    body = response.read()
                    content_type = response.headers.get_content_type()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(content_type, "image/png")
        self.assertGreater(len(body), 0)


if __name__ == "__main__":
    unittest.main()
