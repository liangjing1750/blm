from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from blm_core.document import create_empty_document, migrate_document
from blm_core.merge import analyze_merge, apply_merge, validate_document
from blm_core.storage import DocumentFileStore


class DocumentIdentityTests(unittest.TestCase):
    def test_migrate_document_assigns_hidden_document_and_node_uids(self):
        document = migrate_document(
            {
                "meta": {"title": "Legacy"},
                "roles": [{"name": "审核员"}],
                "language": [{"term": "出库", "definition": "发货"}],
                "processes": [
                    {
                        "id": "P1",
                        "name": "出库流程",
                        "tasks": [
                            {
                                "id": "T1",
                                "name": "审核出库",
                                "role": "审核员",
                                "steps": [{"name": "检查仓单", "type": "Check"}],
                                "entity_ops": [{"entity_id": "E1", "ops": ["R"]}],
                            }
                        ],
                    }
                ],
                "entities": [
                    {
                        "id": "E1",
                        "name": "出库单",
                        "fields": [{"name": "单号", "type": "string"}],
                        "state_transitions": [{"from": "草稿", "to": "已审核", "action": "审核"}],
                    }
                ],
                "relations": [{"from": "E1", "to": "E1", "type": "1:1", "label": "关联"}],
                "rules": [{"name": "必须审核", "description": "出库前必须审核"}],
            }
        )

        self.assertTrue(document["meta"]["document_uid"])
        self.assertEqual(document["meta"]["schema_version"], 4)
        self.assertTrue(document["roles"][0]["uid"])
        self.assertTrue(document["language"][0]["uid"])
        self.assertTrue(document["processes"][0]["uid"])
        self.assertEqual(document["processes"][0]["flowGroup"], "")
        self.assertEqual(document["processes"][0]["stageId"], "")
        self.assertEqual(document["processes"][0]["stagePos"], {"x": 0, "y": 0})
        self.assertTrue(document["processes"][0]["nodes"][0]["uid"])
        self.assertTrue(document["processes"][0]["nodes"][0]["userSteps"][0]["uid"])
        self.assertTrue(document["processes"][0]["nodes"][0]["entity_ops"][0]["uid"])
        self.assertEqual(document["processes"][0]["nodes"][0]["orchestrationTasks"], [])
        self.assertEqual(document["stages"], [])
        self.assertEqual(document["stageLinks"], [])
        self.assertTrue(document["entities"][0]["uid"])
        self.assertTrue(document["entities"][0]["fields"][0]["uid"])
        self.assertTrue(document["entities"][0]["state_transitions"][0]["uid"])
        self.assertTrue(document["relations"][0]["uid"])
        self.assertTrue(document["rules"][0]["uid"])

    def test_migrate_document_normalizes_node_business_rules(self):
        document = migrate_document(
            {
                "meta": {"title": "Rules"},
                "roles": [],
                "language": [],
                "processes": [
                    {
                        "id": "P1",
                        "name": "登录流程",
                        "nodes": [
                            {
                                "id": "T1",
                                "name": "统一登录",
                                "businessRules": [
                                    {"name": "前置条件", "content": "目标用户拥有账号"},
                                    {"name": "输出", "content": "资源列表展示正确"},
                                ],
                            },
                            {"id": "T2", "name": "兼容旧规则", "rules_note": "账号或密码错误时提示统一错误"},
                        ],
                    }
                ],
                "entities": [],
                "relations": [],
                "rules": [],
            }
        )

        first_node = document["processes"][0]["nodes"][0]
        second_node = document["processes"][0]["nodes"][1]
        self.assertTrue(first_node["businessRules"][0]["uid"])
        self.assertEqual(first_node["businessRules"][0]["name"], "前置条件")
        self.assertIn("输出：资源列表展示正确", first_node["rules_note"])
        self.assertEqual(second_node["businessRules"][0]["name"], "业务规则")
        self.assertEqual(second_node["businessRules"][0]["content"], "账号或密码错误时提示统一错误")


class DocumentFileStoreTests(unittest.TestCase):
    def test_load_and_save_path_round_trip(self):
        store = DocumentFileStore()
        document = create_empty_document("Portable")

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "portable.json"
            store.save_path(path, document)

            loaded = store.load_path(path)
            self.assertEqual(loaded["meta"]["title"], "Portable")
            self.assertTrue(path.exists())
            self.assertTrue(path.with_suffix(".md").exists())


class MergeEngineTests(unittest.TestCase):
    def test_three_way_merge_auto_merges_non_overlapping_changes(self):
        base = create_empty_document("Supply")
        left = deepcopy(base)
        right = deepcopy(base)

        left["roles"].append(
            {
                "uid": "role-left",
                "id": "R1",
                "name": "仓库主管",
                "desc": "负责出库审核",
                "group": "业务参与方",
                "subDomains": ["仓储"],
            }
        )
        right["entities"].append(
            {
                "uid": "entity-right",
                "id": "E1",
                "name": "出库单",
                "group": "仓储",
                "note": "",
                "fields": [{"uid": "field-right", "name": "单号", "type": "string", "is_key": True, "is_status": False, "state_values": "", "note": ""}],
                "state_transitions": [],
            }
        )

        analysis = analyze_merge("3way", left, right, base)

        self.assertEqual(analysis["conflicts"], [])
        self.assertEqual(len(analysis["merged_document"]["roles"]), 1)
        self.assertEqual(len(analysis["merged_document"]["entities"]), 1)
        self.assertEqual(analysis["validation_issues"], [])

    def test_two_way_combine_reports_same_name_conflict_for_legacy_documents(self):
        left = {
            "meta": {"title": "A"},
            "roles": [],
            "language": [],
            "processes": [{"id": "P1", "name": "订单处理", "trigger": "下单", "outcome": "待审核", "tasks": []}],
            "entities": [],
            "relations": [],
            "rules": [],
        }
        right = {
            "meta": {"title": "B"},
            "roles": [],
            "language": [],
            "processes": [{"id": "P1", "name": "订单处理", "trigger": "导入订单", "outcome": "已同步", "tasks": []}],
            "entities": [],
            "relations": [],
            "rules": [],
        }

        analysis = analyze_merge("combine", left, right)

        self.assertTrue(any(conflict["kind"] == "duplicate_object" for conflict in analysis["conflicts"]))

    def test_two_way_combine_uses_consistent_name_for_version_documents(self):
        left = create_empty_document("示例平台-v1")
        right = create_empty_document("示例平台-v2")
        left["meta"]["domain"] = "示例平台-v1"
        right["meta"]["domain"] = "示例平台-v2"

        analysis = analyze_merge("combine", left, right)

        self.assertEqual(analysis["suggested_name"], "示例平台-合并")
        self.assertEqual(analysis["merged_document"]["meta"]["title"], "示例平台-合并")
        self.assertEqual(analysis["merged_document"]["meta"]["domain"], "示例平台-合并")
        self.assertFalse(any(conflict["path"] in {"meta.title", "meta.domain"} for conflict in analysis["conflicts"]))

    def test_apply_merge_resolves_same_field_conflict(self):
        base = create_empty_document("Billing")
        base["roles"].append(
            {
                "uid": "role-1",
                "id": "R1",
                "name": "财务",
                "desc": "",
                "group": "业务参与方",
                "subDomains": [],
            }
        )
        left = deepcopy(base)
        right = deepcopy(base)
        left["roles"][0]["desc"] = "负责结算"
        right["roles"][0]["desc"] = "负责对账"

        analysis = analyze_merge("3way", left, right, base)
        self.assertEqual(len(analysis["conflicts"]), 1)

        result = apply_merge(
            "3way",
            left,
            right,
            base_document=base,
            resolutions={analysis["conflicts"][0]["id"]: {"choice": "right"}},
        )

        self.assertEqual(result["conflicts"], [])
        self.assertEqual(result["merged_document"]["roles"][0]["desc"], "负责对账")

    def test_validate_document_rejects_stage_flow_link_that_points_to_ref_from_other_stage(self):
        document = create_empty_document("Stage refs")
        document["stages"] = [
            {"id": "S1", "name": "阶段一", "subDomain": "仓储", "pos": {"x": 0, "y": 0}, "processLinks": []},
            {"id": "S2", "name": "阶段二", "subDomain": "仓储", "pos": {"x": 0, "y": 0}, "processLinks": []},
        ]
        document["processes"] = [
            {"id": "P1", "name": "流程一", "subDomain": "仓储", "flowGroup": "", "stageId": "S1", "stagePos": {"x": 0, "y": 0}, "trigger": "", "outcome": "", "prototypeFiles": [], "nodes": []},
            {"id": "P2", "name": "流程二", "subDomain": "仓储", "flowGroup": "", "stageId": "S2", "stagePos": {"x": 0, "y": 0}, "trigger": "", "outcome": "", "prototypeFiles": [], "nodes": []},
        ]
        document["stageFlowRefs"] = [
            {"id": "SFR1", "stageId": "S1", "processId": "P1", "order": 1, "pos": {"x": 0, "y": 0}},
            {"id": "SFR2", "stageId": "S2", "processId": "P2", "order": 1, "pos": {"x": 0, "y": 0}},
        ]
        document["stageFlowLinks"] = [
            {"id": "SFL1", "stageId": "S1", "fromRefId": "SFR1", "toRefId": "SFR2"},
        ]

        issues = validate_document(document)

        self.assertTrue(any("不属于该阶段" in issue["message"] for issue in issues))


if __name__ == "__main__":
    unittest.main()
