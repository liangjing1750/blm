from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from blm_core.document import _deterministic_ui_uid, canonical_document, create_empty_document, migrate_document
from blm_core.merge import analyze_merge, apply_merge, validate_document
from blm_core.model_strategy import (
    DESCRIPTORS,
    LEGACY_FIELD_RENAMES,
    semantic_key,
)
from blm_core.storage import DocumentFileStore, WorkspaceStorage


class DocumentIdentityTests(unittest.TestCase):
    def test_model_strategy_is_the_identity_and_merge_entry(self):
        self.assertEqual(DESCRIPTORS["document"]["lists"]["businessComponents"], "business_component")
        self.assertEqual(DESCRIPTORS["business_component"]["set_lists"], ["constructUids", "taskDefinitionUids", "entityUids"])
        self.assertEqual(LEGACY_FIELD_RENAMES["capabilityUnitId"], "businessComponentId")
        self.assertEqual(semantic_key("process", {"uid": "P1", "name": "入库预约申请"}), "入库预约申请")

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

    def test_migrate_document_unwraps_legacy_document_payload(self):
        document = migrate_document(
            {
                "document": {
                    "meta": {"title": "包装文档"},
                    "roles": [{"id": "R1", "name": "经办人"}],
                    "processes": [{"id": "P1", "name": "办理", "nodes": []}],
                    "entities": [],
                }
            }
        )

        self.assertEqual(document["meta"]["title"], "包装文档")
        self.assertEqual(document["roles"][0]["name"], "经办人")
        self.assertEqual(document["processes"][0]["name"], "办理")

    def test_canonical_document_maps_entity_business_construct_reference_to_uid(self):
        document = canonical_document(
            {
                "meta": {"title": "Legacy construct ref"},
                "businessConstructs": [
                    {"id": "BC1", "uid": "construct-uid-1", "name": "Application"},
                ],
                "entities": [
                    {"id": "E1", "uid": "entity-uid-1", "name": "Application Entity", "businessConstructId": "BC1"},
                ],
            }
        )

        self.assertEqual(document["entities"][0]["businessConstructUid"], "construct-uid-1")

    def test_canonical_document_maps_legacy_panorama_stage_references_to_uid(self):
        document = canonical_document(
            {
                "meta": {"title": "Legacy panorama"},
                "panorama": {
                    "columns": [{"id": "C1", "uid": "column-uid-1", "name": "业务办理"}],
                    "lanes": [{"id": "L1", "uid": "lane-uid-1", "name": "会员客户"}],
                    "cells": [{"columnId": "C1", "laneId": "L1", "status": "主责"}],
                },
                "stages": [
                    {"id": "S1", "uid": "stage-uid-1", "name": "申请", "panoramaColumnId": "C1", "panoramaLaneId": "L1"},
                ],
            }
        )

        self.assertEqual(document["panorama"]["cells"][0]["columnUid"], "businessHandling")
        self.assertEqual(document["panorama"]["cells"][0]["laneUid"], _deterministic_ui_uid("panorama-lane", "会员客户"))
        self.assertEqual(document["stages"][0]["panoramaColumnUid"], "businessHandling")
        self.assertEqual(document["stages"][0]["panoramaLaneUid"], _deterministic_ui_uid("panorama-lane", "会员客户"))
        self.assertNotIn("columnId", document["panorama"]["cells"][0])
        self.assertNotIn("panoramaColumnId", document["stages"][0])

    def test_canonical_document_filters_empty_stage_flow_references(self):
        document = canonical_document(
            {
                "meta": {"title": "Stage refs"},
                "stages": [{"uid": "stage-1", "name": "申请"}],
                "processes": [{"uid": "process-1", "name": "提交", "stageUid": "stage-1"}],
                "stageFlowRefs": [
                    {"uid": "empty-ref", "stageUid": "", "processUid": "", "order": 1},
                    {"uid": "valid-ref", "stageUid": "stage-1", "processUid": "process-1", "order": 2},
                ],
                "stageFlowLinks": [
                    {"uid": "empty-link", "stageUid": "", "fromRefUid": "", "toRefUid": ""},
                ],
            }
        )

        self.assertEqual([ref["uid"] for ref in document["stageFlowRefs"]], ["valid-ref"])
        self.assertEqual(document["stageFlowRefs"][0]["stageUid"], "stage-1")
        self.assertEqual(document["stageFlowRefs"][0]["processUid"], "process-1")
        self.assertEqual(document["stageFlowLinks"], [])

    def test_canonical_document_supplements_stage_flow_refs_from_process_stage_uid(self):
        document = canonical_document(
            {
                "meta": {"title": "Stage refs"},
                "stages": [{"uid": "stage-1", "name": "申请"}],
                "processes": [
                    {"uid": "process-1", "name": "提交", "stageUid": "stage-1", "stagePos": {"x": 12, "y": 34}},
                    {"uid": "process-2", "name": "复核", "stageUid": "stage-1"},
                ],
                "stageFlowRefs": [
                    {"uid": "dirty-ref", "stageUid": "", "processUid": "", "order": 9},
                ],
            }
        )

        self.assertEqual(len(document["stageFlowRefs"]), 2)
        self.assertEqual(
            [(ref["stageUid"], ref["processUid"]) for ref in document["stageFlowRefs"]],
            [("stage-1", "process-1"), ("stage-1", "process-2")],
        )
        self.assertEqual(document["stageFlowRefs"][0]["pos"], {"x": 12, "y": 34})

    def test_canonical_document_generates_stable_stage_flow_ref_uids(self):
        source = {
            "meta": {"title": "Stage refs"},
            "stages": [{"uid": "stage-1", "name": "申请"}],
            "processes": [
                {"uid": "process-1", "name": "提交", "stageUid": "stage-1"},
            ],
            "stageFlowRefs": [],
        }

        first = canonical_document(source)
        second = canonical_document(source)

        self.assertEqual(first["stageFlowRefs"], second["stageFlowRefs"])
        self.assertTrue(first["stageFlowRefs"][0]["uid"].startswith("stage-flow-ref-"))

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

    def test_workspace_package_manifest_does_not_persist_model_ids(self):
        document = create_empty_document("Uid Only")
        document["roles"].append({"uid": "role-1", "id": "R1", "name": "Operator", "desc": "", "group": "", "subDomains": []})
        document["entities"].append({"uid": "entity-1", "id": "E1", "name": "Application", "group": "", "note": "", "fields": [], "state_transitions": []})
        document["processes"][0]["nodes"].append(
            {
                "uid": "node-1",
                "id": "T1",
                "name": "Submit",
                "role_id": "R1",
                "role_ids": ["R1"],
                "roles": [],
                "entity_ops": [{"uid": "entity-op-1", "entity_id": "E1", "ops": ["R"]}],
                "userSteps": [],
                "orchestrationTasks": [],
                "businessRules": [],
                "forms": [],
            }
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            storage.save("Uid Only", document)
            manifest_path = Path(temp_dir) / "Uid Only" / "manifest.json"
            raw = manifest_path.read_text("utf-8")

            self.assertNotIn('"id": "R1"', raw)
            self.assertNotIn('"id": "E1"', raw)
            self.assertNotIn('"role_ids"', raw)
            self.assertNotIn('"role_id"', raw)
            self.assertNotIn('"entity_id"', raw)
            self.assertIn('"uid": "role-1"', raw)
            self.assertIn('"uid": "entity-1"', raw)
            self.assertIn('"role_uids"', raw)
            self.assertIn('"entity_uid"', raw)


class WorkspaceRevisionTests(unittest.TestCase):
    def test_save_with_revision_rebases_non_overlapping_stale_changes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            saved = storage.save_with_revision("Doc", create_empty_document("Doc"))
            base = deepcopy(saved["document"])

            remote = deepcopy(base)
            remote["entities"].append(
                {
                    "uid": "entity-remote",
                    "id": "E1",
                    "name": "订单",
                    "group": "",
                    "note": "",
                    "fields": [],
                    "state_transitions": [],
                }
            )
            remote_result = storage.save_with_revision(
                "Doc",
                remote,
                base_revision=base["meta"]["revision"],
                base_document=base,
                rebase=True,
            )
            self.assertTrue(remote_result["ok"])

            local = deepcopy(base)
            local["roles"].append(
                {
                    "uid": "role-local",
                    "id": "R1",
                    "name": "业务员",
                    "desc": "",
                    "group": "",
                    "subDomains": [],
                }
            )
            stale_result = storage.save_with_revision(
                "Doc",
                local,
                base_revision=base["meta"]["revision"],
                base_document=base,
                rebase=True,
            )

            self.assertTrue(stale_result["ok"])
            self.assertTrue(stale_result["rebased"])
            self.assertEqual(stale_result["document"]["meta"]["revision"], 3)
            self.assertEqual(len(stale_result["document"]["roles"]), 1)
            self.assertEqual(len(stale_result["document"]["entities"]), 1)

    def test_save_with_revision_returns_conflict_for_same_field_changes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            saved = storage.save_with_revision("Doc", create_empty_document("Doc"))
            base = deepcopy(saved["document"])

            remote = deepcopy(base)
            remote["meta"]["title"] = "远端标题"
            remote["meta"]["domain"] = "远端标题"
            storage.save_with_revision(
                "Doc",
                remote,
                base_revision=base["meta"]["revision"],
                base_document=base,
                rebase=True,
            )

            local = deepcopy(base)
            local["meta"]["title"] = "本地标题"
            local["meta"]["domain"] = "本地标题"
            conflict = storage.save_with_revision(
                "Doc",
                local,
                base_revision=base["meta"]["revision"],
                base_document=base,
                rebase=True,
            )

            self.assertFalse(conflict["ok"])
            self.assertEqual(conflict["error"], "revision_conflict")
            self.assertGreaterEqual(len(conflict["conflicts"]), 1)


class MergeEngineTests(unittest.TestCase):
    def test_combine_uses_model_uid_identity_for_copied_documents(self):
        left = create_empty_document("Copied")
        left["roles"] = [
            {"uid": "role-1", "id": "R1", "name": "Operator", "desc": "", "group": "Business", "subDomains": []}
        ]
        left["businessComponents"] = [
            {"uid": "component-1", "id": "BCP1", "name": "Apply", "kind": "core", "note": "", "constructIds": [], "taskDefinitionIds": [], "entityIds": []}
        ]
        left["entities"] = [
            {"uid": "entity-1", "id": "E1", "name": "Application", "group": "", "note": "", "fields": [], "state_transitions": []}
        ]
        right = deepcopy(left)
        right["meta"]["document_uid"] = "copied-document-uid"
        right["meta"]["title"] = "Copied - copy"
        right["meta"]["domain"] = "Copied - copy"

        analysis = analyze_merge("combine", left, right)

        self.assertEqual(analysis["conflicts"], [])
        self.assertEqual(analysis["validation_issues"], [])
        self.assertEqual(len(analysis["merged_document"]["roles"]), 1)
        self.assertEqual(len(analysis["merged_document"]["businessComponents"]), 1)
        self.assertEqual(len(analysis["merged_document"]["entities"]), 1)

    def test_combine_does_not_treat_internal_ids_as_user_conflicts(self):
        left = create_empty_document("Internal ids")
        left["roles"] = [
            {"uid": "role-1", "id": "R1", "name": "Operator", "desc": "", "group": "Business", "subDomains": []}
        ]
        right = deepcopy(left)
        right["roles"][0]["id"] = "R999"

        analysis = analyze_merge("combine", left, right)

        self.assertEqual(analysis["conflicts"], [])
        self.assertEqual(analysis["merged_document"]["roles"][0]["uid"], "role-1")
        self.assertNotIn("id", analysis["merged_document"]["roles"][0])

    def test_combine_does_not_treat_layout_positions_as_user_conflicts(self):
        left = create_empty_document("Layout")
        left["entities"] = [
            {"uid": "entity-1", "id": "E1", "name": "Application", "group": "", "note": "", "pos": {"x": 100, "y": 100}, "fields": [], "state_transitions": []}
        ]
        right = deepcopy(left)
        right["entities"][0]["pos"] = {"x": 300, "y": 220}

        analysis = analyze_merge("combine", left, right)

        self.assertEqual(analysis["conflicts"], [])
        self.assertEqual(analysis["merged_document"]["entities"][0]["pos"], {"x": 100, "y": 100})

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
        right["businessComponents"] = [{"uid": "cap-1", "id": "CU1", "name": "申请办理", "kind": "业务能力", "note": "", "entityIds": ["E1"]}]
        right["businessConstructs"] = [{"uid": "bc-1", "id": "BC1", "name": "申请构件", "businessComponentId": "CU1", "entityIds": ["E1"]}]
        right["taskDefinitions"] = [{"uid": "td-1", "id": "TD1", "name": "提交任务", "type": "Service", "target": "ApplyService.submit", "constructId": "BC1", "entityIds": ["E1"]}]
        right["processes"][0]["nodes"][0]["orchestrationTasks"] = [
            {"uid": "orch-1", "name": "提交任务", "type": "Service", "target": "ApplyService.submit", "note": "", "taskDefinitionId": "TD1", "constructId": "BC1"}
        ]

        analysis = analyze_merge("3way", left, right, base)

        self.assertEqual(analysis["conflicts"], [])
        merged = analysis["merged_document"]
        self.assertEqual(merged["processes"][0]["prototypeFiles"][0]["name"], "submit.html")
        self.assertEqual(merged["processes"][0]["nodes"][0]["forms"][0]["sections"][0]["entity_uid"], "entity-1")
        self.assertEqual(merged["businessComponents"][0]["uid"], "cap-1")
        self.assertEqual(merged["businessConstructs"][0]["uid"], "bc-1")
        self.assertEqual(merged["taskDefinitions"][0]["uid"], "td-1")
        self.assertEqual(merged["processes"][0]["nodes"][0]["orchestrationTasks"][0]["taskDefinitionUid"], "td-1")

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

    def test_two_way_combine_remaps_legacy_ids_to_uids_after_keep_both(self):
        left = create_empty_document("左")
        right = create_empty_document("右")
        left["entities"] = [
            {"uid": "entity-left", "id": "E1", "name": "申请单", "group": "", "note": "左", "fields": [], "state_transitions": []},
            {"uid": "entity-left-detail", "id": "E2", "name": "申请明细", "group": "", "note": "左", "fields": [], "state_transitions": []},
        ]
        left["relations"] = [{"uid": "relation-left", "from": "E1", "to": "E2", "type": "1:N", "label": "左侧关系"}]
        right["entities"] = [
            {"uid": "entity-right", "id": "E1", "name": "申请单", "group": "", "note": "右", "fields": [], "state_transitions": []},
            {"uid": "entity-right-detail", "id": "E2", "name": "申请明细", "group": "", "note": "右", "fields": [], "state_transitions": []},
        ]
        right["relations"] = [{"uid": "relation-right", "from": "E1", "to": "E2", "type": "1:N", "label": "右侧关系"}]

        analysis = analyze_merge("combine", left, right)
        resolutions = {conflict["id"]: {"choice": "keep_both"} for conflict in analysis["conflicts"]}
        result = apply_merge("combine", left, right, resolutions=resolutions)

        self.assertEqual(result["conflicts"], [])
        self.assertEqual(result["validation_issues"], [])
        self.assertEqual([entity["uid"] for entity in result["merged_document"]["entities"]], ["entity-left", "entity-left-detail", "entity-right", "entity-right-detail"])
        self.assertEqual(
            [(relation["from"], relation["to"]) for relation in result["merged_document"]["relations"]],
            [("entity-left", "entity-left-detail"), ("entity-right", "entity-right-detail")],
        )
        self.assertFalse(any(conflict["path"] in {"meta.title", "meta.domain"} for conflict in analysis["conflicts"]))

    def test_combine_repairs_internal_references_before_reporting_validation(self):
        left = create_empty_document("左")
        right = create_empty_document("右")
        for document in (left, right):
            document["roles"] = []
            document["stages"] = []
            document["stageLinks"] = []
            document["stageFlowRefs"] = []
            document["stageFlowLinks"] = []
            document["processes"] = []
            document["entities"] = []
            document["relations"] = []
            document["rules"] = []

        right["stages"] = [
            {"uid": "stage-a", "id": "S1", "name": "阶段一", "subDomain": "", "pos": {}, "processLinks": []},
            {"uid": "stage-b", "id": "S2", "name": "阶段二", "subDomain": "", "pos": {}, "processLinks": []},
        ]
        right["processes"] = [
            {"uid": "proc-a", "id": "P1", "name": "流程一", "stageId": "S2", "stagePos": {}, "prototypeFiles": [], "nodes": []},
            {"uid": "proc-b", "id": "P2", "name": "流程二", "stageId": "S2", "stagePos": {}, "prototypeFiles": [], "nodes": []},
        ]
        right["stageFlowRefs"] = [
            {"uid": "ref-a", "id": "SFR1", "stageId": "S2", "processId": "P1", "order": 1, "pos": {}},
            {"uid": "ref-b", "id": "SFR2", "stageId": "S2", "processId": "P2", "order": 2, "pos": {}},
        ]
        right["stageFlowLinks"] = [
            {"uid": "link-a", "id": "SFL1", "stageId": "S1", "fromRefId": "SFR1", "toRefId": "SFR2"},
        ]
        right["relations"] = [
            {"uid": "relation-stale", "from": "E404", "to": "E405", "type": "1:N", "label": "历史悬空关系"},
        ]

        analysis = analyze_merge("combine", left, right)
        merged = analysis["merged_document"]
        ref_by_uid = {ref["uid"]: ref for ref in merged["stageFlowRefs"]}
        link = merged["stageFlowLinks"][0]

        self.assertEqual(analysis["validation_issues"], [])
        self.assertGreaterEqual(analysis["summary"]["consistencyRepairCount"], 2)
        self.assertEqual(link["stageUid"], ref_by_uid[link["fromRefUid"]]["stageUid"])
        self.assertEqual(link["stageUid"], ref_by_uid[link["toRefUid"]]["stageUid"])
        self.assertEqual(merged["relations"], [])

    def test_combine_merges_panorama_axes_by_name_and_remaps_stage_references(self):
        left = create_empty_document("Left")
        right = create_empty_document("Right")
        for document in (left, right):
            document["roles"] = []
            document["stageLinks"] = []
            document["stageFlowRefs"] = []
            document["stageFlowLinks"] = []
            document["processes"] = []
            document["entities"] = []
            document["relations"] = []
            document["rules"] = []

        left["panorama"] = {
            "columns": [{"uid": "left-col", "id": "C1", "name": "Business Handling"}],
            "lanes": [{"uid": "left-lane", "id": "L1", "name": "Platform"}],
            "cells": [{"uid": "left-cell", "columnId": "C1", "laneId": "L1", "status": "Left"}],
        }
        right["panorama"] = {
            "columns": [{"uid": "right-col", "id": "businessHandling", "name": "Business Handling"}],
            "lanes": [{"uid": "right-lane", "id": "platform-lane", "name": "Platform"}],
            "cells": [{"uid": "right-cell", "columnId": "businessHandling", "laneId": "platform-lane", "text": "Right"}],
        }
        left["stages"] = [
            {"uid": "left-stage", "id": "S1", "name": "Left Stage", "panoramaColumnId": "C1", "panoramaLaneId": "L1", "processLinks": []}
        ]
        right["stages"] = [
            {
                "uid": "right-stage",
                "id": "S1",
                "name": "Right Stage",
                "panoramaColumnId": "businessHandling",
                "panoramaLaneId": "platform-lane",
                "processLinks": [],
            }
        ]

        analysis = analyze_merge("combine", left, right)
        merged = analysis["merged_document"]
        merged_column_uid = _deterministic_ui_uid("panorama-column", "Business Handling")
        merged_lane_uid = _deterministic_ui_uid("panorama-lane", "Platform")

        self.assertEqual([(column["uid"], column["name"]) for column in merged["panorama"]["columns"]], [(merged_column_uid, "Business Handling")])
        self.assertEqual([(lane["uid"], lane["name"]) for lane in merged["panorama"]["lanes"]], [(merged_lane_uid, "Platform")])
        self.assertEqual({stage["panoramaColumnUid"] for stage in merged["stages"]}, {merged_column_uid})
        self.assertEqual({stage["panoramaLaneUid"] for stage in merged["stages"]}, {merged_lane_uid})
        self.assertEqual(len(merged["panorama"]["cells"]), 1)

    def test_combine_remaps_uid_panorama_stage_and_cell_references(self):
        left = create_empty_document("Left")
        right = create_empty_document("Right")
        for document in (left, right):
            document["roles"] = []
            document["stageLinks"] = []
            document["stageFlowRefs"] = []
            document["stageFlowLinks"] = []
            document["processes"] = []
            document["entities"] = []
            document["relations"] = []
            document["rules"] = []

        left["panorama"] = {
            "columns": [{"uid": "left-col", "name": "业务办理"}],
            "lanes": [{"uid": "left-lane", "name": "会员客户"}],
            "cells": [{"uid": "left-cell", "columnUid": "left-col", "laneUid": "left-lane", "status": "左侧"}],
        }
        right["panorama"] = {
            "columns": [{"uid": "right-col", "name": "业务办理"}],
            "lanes": [{"uid": "right-lane", "name": "会员客户"}],
            "cells": [{"uid": "right-cell", "columnUid": "right-col", "laneUid": "right-lane", "text": "右侧"}],
        }
        left["stages"] = [
            {"uid": "left-stage", "name": "仓单申请", "panoramaColumnUid": "left-col", "panoramaLaneUid": "left-lane", "processLinks": []}
        ]
        right["stages"] = [
            {"uid": "right-stage", "name": "国债申请", "panoramaColumnUid": "right-col", "panoramaLaneUid": "right-lane", "processLinks": []}
        ]

        analysis = analyze_merge("combine", left, right)
        merged = analysis["merged_document"]

        self.assertEqual(analysis["validation_issues"], [])
        self.assertEqual(len(merged["panorama"]["columns"]), 1)
        self.assertEqual(len(merged["panorama"]["lanes"]), 1)
        merged_column_uid = merged["panorama"]["columns"][0]["uid"]
        merged_lane_uid = merged["panorama"]["lanes"][0]["uid"]
        self.assertEqual({stage["panoramaColumnUid"] for stage in merged["stages"]}, {merged_column_uid})
        self.assertEqual({stage["panoramaLaneUid"] for stage in merged["stages"]}, {merged_lane_uid})
        self.assertEqual({cell["columnUid"] for cell in merged["panorama"]["cells"]}, {merged_column_uid})
        self.assertEqual({cell["laneUid"] for cell in merged["panorama"]["cells"]}, {merged_lane_uid})

    def test_combine_remaps_panorama_references_with_alias_from_another_source(self):
        left = create_empty_document("Left")
        right = create_empty_document("Right")
        for document in (left, right):
            document["roles"] = []
            document["stages"] = []
            document["stageLinks"] = []
            document["stageFlowRefs"] = []
            document["stageFlowLinks"] = []
            document["processes"] = []
            document["entities"] = []
            document["relations"] = []
            document["rules"] = []

        left["panorama"] = {
            "columns": [{"uid": "business-handling-v2", "name": "业务办理"}],
            "lanes": [{"uid": "smart-platform-v2", "name": "交割智慧监管平台"}],
            "cells": [{"uid": "cell-left", "columnUid": "business-handling-v2", "laneUid": "smart-platform-v2"}],
        }
        right["panorama"] = {
            "columns": [{"uid": "business-handling", "name": "业务办理"}],
            "lanes": [{"uid": "smart-platform", "name": "交割智慧监管平台"}],
            "cells": [{"uid": "cell-right", "columnUid": "business-handling", "laneUid": "smart-platform"}],
        }

        analysis = analyze_merge("combine", left, right)
        merged = analysis["merged_document"]

        self.assertEqual(analysis["validation_issues"], [])
        self.assertEqual(len(merged["panorama"]["cells"]), 1)
        self.assertEqual(merged["panorama"]["cells"][0]["columnUid"], merged["panorama"]["columns"][0]["uid"])
        self.assertEqual(merged["panorama"]["cells"][0]["laneUid"], merged["panorama"]["lanes"][0]["uid"])

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

    def test_merge_preserves_user_defined_ids_and_process_flow(self):
        left = create_empty_document("流程左侧")
        right = deepcopy(left)
        left["processes"][0]["id"] = "P-RKYY"
        right["processes"][0]["id"] = "P-RKYY"
        left["processes"][0]["nodes"] = [
            {"uid": "node-a", "id": "T-SUBMIT", "name": "提交", "role_ids": [], "roles": [], "userSteps": [], "entity_ops": [], "orchestrationTasks": [], "businessRules": [], "forms": []},
            {"uid": "node-b", "id": "T-CHECK", "name": "校验", "role_ids": [], "roles": [], "userSteps": [], "entity_ops": [], "orchestrationTasks": [], "businessRules": [], "forms": []},
        ]
        right["processes"][0]["nodes"] = deepcopy(left["processes"][0]["nodes"])
        right["processes"][0]["flow"] = {
            "version": 2,
            "nodes": [{"uid": "branch-a", "id": "B-QUALIFY", "kind": "gateway", "title": ""}],
            "edges": [
                {"uid": "edge-a", "id": "L-START", "from": "START", "to": "T-SUBMIT", "label": ""},
                {"uid": "edge-b", "id": "L-CHECK", "from": "T-SUBMIT", "to": "B-QUALIFY", "label": ""},
                {"uid": "edge-c", "id": "L-YES", "from": "B-QUALIFY", "to": "T-CHECK", "label": "通过"},
                {"uid": "edge-d", "id": "L-END", "from": "T-CHECK", "to": "END", "label": ""},
            ],
        }

        analysis = analyze_merge("3way", left, right, left)

        merged_process = analysis["merged_document"]["processes"][0]
        self.assertNotIn("id", merged_process)
        self.assertEqual([node["uid"] for node in merged_process["nodes"]], ["node-a", "node-b"])
        self.assertNotIn("id", merged_process["flow"]["nodes"][0])
        self.assertNotIn("id", merged_process["flow"]["edges"][1])
        self.assertEqual(
            [(edge["from"], edge["to"]) for edge in merged_process["flow"]["edges"]],
            [("START", "node-a"), ("node-a", "branch-a"), ("branch-a", "node-b"), ("node-b", "END")],
        )
        self.assertEqual(analysis["validation_issues"], [])

    def test_validate_document_reports_duplicate_uids(self):
        document = create_empty_document("重复ID")
        document["processes"].append(deepcopy(document["processes"][0]))
        document["processes"][0]["nodes"] = [
            {"uid": "node-same", "name": "节点A", "role_uids": [], "roles": [], "userSteps": [], "entity_ops": [], "orchestrationTasks": [], "businessRules": [], "forms": []},
            {"uid": "node-same", "name": "节点B", "role_uids": [], "roles": [], "userSteps": [], "entity_ops": [], "orchestrationTasks": [], "businessRules": [], "forms": []},
        ]

        issues = validate_document(document)

        self.assertTrue(any(issue["path"] == f"processes.{document['processes'][0]['uid']}.uid" for issue in issues))
        self.assertTrue(any(issue["path"].endswith(".nodes.node-same.uid") for issue in issues))

    def test_validate_document_accepts_rules_applied_to_business_model_elements(self):
        document = create_empty_document("Rule applies to model elements")
        document["businessComponents"] = [
            {"uid": "component-1", "id": "BCP1", "name": "User Permission", "kind": "core", "note": ""},
        ]
        document["businessConstructs"] = [
            {
                "uid": "construct-1",
                "id": "BC1",
                "name": "Permission Grant",
                "note": "",
                "businessComponentId": "BCP1",
                "businessComponent": "User Permission",
            },
        ]
        document["taskDefinitions"] = [
            {
                "uid": "task-definition-1",
                "id": "TD1",
                "name": "Grant Permission",
                "type": "service",
                "target": "",
                "note": "",
                "businessComponentId": "BCP1",
                "businessComponent": "User Permission",
                "constructId": "BC1",
                "constructName": "Permission Grant",
            },
        ]
        document["rules"] = [
            {"uid": "rule-1", "id": "RULE1", "name": "Rule 1", "type": "check", "applies_to": "User Permission"},
            {"uid": "rule-2", "id": "RULE2", "name": "Rule 2", "type": "check", "applies_to": "BC1"},
            {"uid": "rule-3", "id": "RULE3", "name": "Rule 3", "type": "check", "applies_to": "Grant Permission"},
        ]

        issues = validate_document(document)

        self.assertFalse([issue for issue in issues if issue["path"].startswith("rules.")])

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

        self.assertTrue(any(issue["path"].endswith(".toRefUid") for issue in issues))


if __name__ == "__main__":
    unittest.main()
