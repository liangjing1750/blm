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

    def test_migrate_document_preserves_state_layout_and_section_entity_binding(self):
        document = migrate_document(
            {
                "meta": {"title": "Layout"},
                "roles": [],
                "language": [],
                "processes": [
                    {
                        "id": "P1",
                        "name": "流程",
                        "nodes": [
                            {
                                "id": "T1",
                                "name": "办理",
                                "forms": [
                                    {
                                        "id": "F1",
                                        "name": "综合表单",
                                        "entity_id": "E1",
                                        "sections": [
                                            {
                                                "id": "SEC1",
                                                "name": "主体",
                                                "entity_id": "E2",
                                                "fields": [{"id": "FLD1", "name": "名称", "entity_field": "名称"}],
                                            }
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ],
                "entities": [
                    {
                        "id": "E1",
                        "name": "单据",
                        "fields": [
                            {
                                "name": "状态",
                                "type": "string",
                                "is_status": True,
                                "status_role": "primary",
                                "state_values": "草稿/完成",
                                "state_nodes": [
                                    {"name": "草稿", "kind": "initial", "pos": {"x": 42, "y": 56}, "markerPos": {"x": 60, "y": 24}},
                                    {"name": "完成", "kind": "terminal", "pos": {"x": 80, "y": 140}, "markerPos": {"x": 110, "y": 196}},
                                ],
                            }
                        ],
                        "state_transitions": [{"from": "草稿", "to": "完成", "note": "submit / approve", "labelPos": {"x": 140, "y": 112}}],
                    },
                    {"id": "E2", "name": "主体", "fields": [{"name": "名称", "type": "string"}]},
                ],
                "relations": [],
                "rules": [],
            }
        )

        state_nodes = document["entities"][0]["fields"][0]["state_nodes"]
        self.assertEqual(state_nodes[0]["pos"], {"x": 42, "y": 56})
        self.assertEqual(state_nodes[0]["markerPos"], {"x": 60, "y": 24})
        self.assertEqual(state_nodes[1]["markerPos"], {"x": 110, "y": 196})
        self.assertEqual(document["entities"][0]["state_transitions"][0]["labelPos"], {"x": 140, "y": 112})
        section = document["processes"][0]["nodes"][0]["forms"][0]["sections"][0]
        self.assertEqual(section["entity_id"], "E2")
        self.assertEqual(section["fields"][0]["entity_field"], "名称")


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

    def test_three_way_merge_keeps_latest_metadata_forms_and_prototypes(self):
        base = create_empty_document("Metadata")
        base["entities"].append(
            {
                "uid": "entity-1",
                "id": "E1",
                "name": "申请单",
                "group": "",
                "note": "",
                "fields": [{"uid": "field-1", "name": "状态", "type": "string", "is_key": False, "is_status": False, "state_values": "", "note": ""}],
                "state_transitions": [],
            }
        )
        base["processes"][0]["nodes"].append(
            {
                "uid": "node-1",
                "id": "T1",
                "name": "提交申请",
                "role_id": "",
                "role": "",
                "role_ids": [],
                "roles": [],
                "repeatable": False,
                "userSteps": [],
                "entity_ops": [],
                "orchestrationTasks": [],
                "businessRules": [],
                "forms": [],
            }
        )
        left = deepcopy(base)
        right = deepcopy(base)
        left["processes"][0]["prototypeFiles"] = [
            {
                "uid": "proto-1",
                "name": "submit.html",
                "versionUid": "proto-1-v1",
                "content": "<main>submit</main>",
                "contentType": "text/html",
                "uploadedAt": "2026-05-08",
                "versions": [
                    {
                        "uid": "proto-1-v1",
                        "number": 1,
                        "name": "submit.html",
                        "content": "<main>submit</main>",
                        "contentType": "text/html",
                        "uploadedAt": "2026-05-08",
                    }
                ],
            }
        ]
        left["processes"][0]["nodes"][0]["forms"] = [
            {
                "uid": "form-1",
                "id": "F1",
                "name": "申请表",
                "purpose": "新增",
                "entity_id": "",
                "sections": [
                    {
                        "uid": "section-1",
                        "id": "SEC1",
                        "name": "申请信息",
                        "note": "",
                        "entity_id": "E1",
                        "fields": [
                            {"uid": "form-field-1", "id": "FLD1", "name": "状态", "type": "Text", "required": True, "entity_field": "状态", "note": "mixed EN note"}
                        ],
                    }
                ],
            }
        ]
        right["capabilityUnits"] = [{"uid": "cap-1", "id": "CU1", "name": "申请办理", "kind": "业务能力", "note": "", "entityIds": ["E1"]}]
        right["businessConstructs"] = [{"uid": "bc-1", "id": "BC1", "name": "申请构件", "capabilityUnitId": "CU1", "entityIds": ["E1"]}]
        right["taskDefinitions"] = [{"uid": "td-1", "id": "TD1", "name": "提交任务", "type": "Service", "target": "ApplyService.submit", "constructId": "BC1", "entityIds": ["E1"]}]
        right["processes"][0]["nodes"][0]["orchestrationTasks"] = [
            {"uid": "orch-1", "name": "提交任务", "type": "Service", "target": "ApplyService.submit", "note": "", "taskDefinitionId": "TD1", "constructId": "BC1"}
        ]

        analysis = analyze_merge("3way", left, right, base)

        self.assertEqual(analysis["conflicts"], [])
        merged = analysis["merged_document"]
        self.assertEqual(merged["processes"][0]["prototypeFiles"][0]["name"], "submit.html")
        self.assertEqual(merged["processes"][0]["nodes"][0]["forms"][0]["sections"][0]["entity_id"], "E1")
        self.assertEqual(merged["capabilityUnits"][0]["id"], "CU1")
        self.assertEqual(merged["businessConstructs"][0]["id"], "BC1")
        self.assertEqual(merged["taskDefinitions"][0]["id"], "TD1")
        self.assertEqual(merged["processes"][0]["nodes"][0]["orchestrationTasks"][0]["taskDefinitionId"], "TD1")

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

    def test_combine_reports_same_name_rule_conflict_even_with_distinct_uids(self):
        left = create_empty_document("规则左侧")
        right = create_empty_document("规则右侧")
        left["processes"][0]["id"] = "P1"
        right["processes"][0]["id"] = "P1"
        left["rules"] = [
            {
                "uid": "left-rule-uid",
                "id": "RULE1",
                "name": "校验规则",
                "type": "Check",
                "applies_to": "P1",
                "description": "左侧口径",
                "formula": "amount > 0",
            }
        ]
        right["rules"] = [
            {
                "uid": "right-rule-uid",
                "id": "RULE1",
                "name": "校验规则",
                "type": "Check",
                "applies_to": "P1",
                "description": "右侧口径",
                "formula": "amount >= 1",
            }
        ]

        analysis = analyze_merge("combine", left, right)

        rule_conflicts = [
            conflict
            for conflict in analysis["conflicts"]
            if conflict["item_type"] == "rule" and conflict["kind"] == "duplicate_object"
        ]
        self.assertEqual(len(rule_conflicts), 1)
        self.assertEqual(rule_conflicts[0]["resolution_options"], ["left", "right", "keep_both"])

        result = apply_merge(
            "combine",
            left,
            right,
            resolutions={rule_conflicts[0]["id"]: {"choice": "keep_both"}},
        )

        self.assertEqual(result["conflicts"], [])
        self.assertEqual(len(result["merged_document"]["rules"]), 2)

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
