from __future__ import annotations

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path

from blm_core.collab import CollaborationManager
from blm_core.storage import WorkspaceStorage


def build_full_scene_document(name: str) -> dict:
    """Build a compact document that touches every major BLM element family."""
    return {
        "meta": {"title": name, "domain": name, "author": "tester", "date": "2026-07-03"},
        "roles": [
            {"uid": "role-edit", "name": "仓库主管", "group": "业务参与方", "desc": "待修改"},
            {"uid": "role-delete", "name": "临时角色", "group": "业务参与方", "desc": "待删除"},
        ],
        "language": [
            {"uid": "term-edit", "term": "仓单", "definition": "待修改"},
            {"uid": "term-delete", "term": "临时术语", "definition": "待删除"},
        ],
        "panorama": {
            "columns": [
                {"uid": "col-edit", "name": "业务办理"},
                {"uid": "col-delete", "name": "临时价值流"},
            ],
            "lanes": [
                {"uid": "lane-edit", "name": "仓储平台"},
                {"uid": "lane-delete", "name": "临时业务域"},
            ],
            "cells": [
                {"uid": "cell-edit", "columnUid": "col-edit", "laneUid": "lane-edit", "status": "待修改"},
                {"uid": "cell-delete", "columnUid": "col-delete", "laneUid": "lane-delete", "status": "待删除"},
            ],
        },
        "stages": [
            {"uid": "stage-edit", "name": "入库监管", "panoramaColumnUid": "col-edit", "panoramaLaneUid": "lane-edit", "processLinks": []},
            {"uid": "stage-delete", "name": "临时阶段", "panoramaColumnUid": "col-delete", "panoramaLaneUid": "lane-delete", "processLinks": []},
        ],
        "processes": [
            {
                "uid": "proc-edit",
                "name": "线下查库",
                "stageUid": "stage-edit",
                "flowGroup": "查库",
                "trigger": "待修改",
                "outcome": "完成查库",
                "nodes": [
                    {"uid": "node-edit", "name": "提交查库申请", "role_uids": ["role-edit"], "userSteps": [], "businessRules": [], "forms": []},
                    {"uid": "node-delete", "name": "临时节点", "role_uids": ["role-edit"], "userSteps": [], "businessRules": [], "forms": []},
                ],
                "flow": {
                    "version": 2,
                    "nodes": [{"uid": "gateway-edit", "kind": "gateway", "title": "是否通过"}],
                    "edges": [
                        {"uid": "edge-edit", "from": "START", "to": "node-edit", "label": "待修改"},
                        {"uid": "edge-delete", "from": "node-edit", "to": "END", "label": "待删除"},
                    ],
                },
            },
            {"uid": "proc-delete", "name": "临时流程", "stageUid": "stage-delete", "nodes": [], "flow": {"version": 2, "nodes": [], "edges": []}},
        ],
        "stageFlowRefs": [
            {"uid": "ref-edit", "stageUid": "stage-edit", "processUid": "proc-edit", "order": 1, "pos": {"x": 0, "y": 0}},
            {"uid": "ref-delete", "stageUid": "stage-delete", "processUid": "proc-delete", "order": 1, "pos": {"x": 0, "y": 0}},
        ],
        "stageFlowLinks": [
            {"uid": "stage-link-edit", "stageUid": "stage-edit", "fromRefUid": "ref-edit", "toRefUid": "ref-edit", "label": "待修改"},
            {"uid": "stage-link-delete", "stageUid": "stage-delete", "fromRefUid": "ref-delete", "toRefUid": "ref-delete", "label": "待删除"},
        ],
        "businessComponents": [
            {"uid": "component-edit", "name": "仓储核心组件", "kind": "core", "note": "待修改", "constructUids": ["construct-edit"]},
            {"uid": "component-delete", "name": "临时组件", "kind": "generic", "note": "待删除"},
        ],
        "businessConstructs": [
            {"uid": "construct-edit", "name": "查库构件", "businessComponentUid": "component-edit", "note": "待修改"},
            {"uid": "construct-delete", "name": "临时构件", "businessComponentUid": "component-delete", "note": "待删除"},
        ],
        "entities": [
            {
                "uid": "entity-edit",
                "name": "查库申请",
                "businessConstructUid": "construct-edit",
                "group": "仓储",
                "fields": [
                    {"uid": "field-edit", "name": "申请编号", "type": "string", "note": "待修改"},
                    {"uid": "field-delete", "name": "临时字段", "type": "string", "note": "待删除"},
                ],
                "state_transitions": [
                    {"uid": "transition-edit", "from": "草稿", "to": "待审核", "action": "提交", "note": "待修改"},
                    {"uid": "transition-delete", "from": "临时", "to": "结束", "action": "删除", "note": "待删除"},
                ],
            },
            {"uid": "entity-delete", "name": "临时实体", "fields": [], "state_transitions": []},
        ],
        "relations": [
            {"uid": "relation-edit", "from": "entity-edit", "to": "entity-delete", "type": "1:N", "label": "待修改"},
            {"uid": "relation-delete", "from": "entity-delete", "to": "entity-edit", "type": "N:1", "label": "待删除"},
        ],
        "taskDefinitions": [
            {"uid": "taskdef-edit", "name": "提交查库任务", "type": "Service", "constructUid": "construct-edit", "note": "待修改"},
            {"uid": "taskdef-delete", "name": "临时任务", "type": "Query", "constructUid": "construct-delete", "note": "待删除"},
        ],
        "serviceGroups": [
            {"uid": "service-group-edit", "name": "查库应用服务组", "note": "待修改"},
            {"uid": "service-group-delete", "name": "临时服务组", "note": "待删除"},
        ],
        "services": [
            {"uid": "service-edit", "name": "提交查库申请接口", "serviceGroupUid": "service-group-edit", "method": "POST", "path": "/check/submit", "desc": "待修改"},
            {"uid": "service-delete", "name": "临时接口", "serviceGroupUid": "service-group-delete", "method": "GET", "path": "/tmp", "desc": "待删除"},
        ],
        "rules": [
            {"uid": "rule-edit", "name": "查库规则", "type": "check", "description": "待修改", "applies_to": "proc-edit"},
            {"uid": "rule-delete", "name": "临时规则", "type": "check", "description": "待删除", "applies_to": "proc-delete"},
        ],
    }


class FullSceneCollaborationTests(unittest.TestCase):
    def test_full_scene_concurrent_create_update_delete_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = build_full_scene_document("FullScene")
            storage.save("FullScene", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit(index: int, mutate) -> dict:
                local = deepcopy(base)
                mutate(local)
                return manager.apply_http_snapshot(
                    "FullScene",
                    {"id": f"user-{index}", "name": f"用户{index}", "sessionId": f"session-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def add_everything(doc: dict) -> None:
                doc["roles"].append({"uid": "role-add", "name": "新增角色", "group": "业务参与方"})
                doc["language"].append({"uid": "term-add", "term": "新增术语", "definition": "新增"})
                doc["panorama"]["columns"].append({"uid": "col-add", "name": "新增价值流"})
                doc["panorama"]["lanes"].append({"uid": "lane-add", "name": "新增业务域"})
                doc["panorama"]["cells"].append({"uid": "cell-add", "columnUid": "col-add", "laneUid": "lane-add", "status": "新增"})
                doc["stages"].append({"uid": "stage-add", "name": "新增阶段", "panoramaColumnUid": "col-add", "panoramaLaneUid": "lane-add", "processLinks": []})
                doc["processes"].append({"uid": "proc-add", "name": "新增流程", "stageUid": "stage-add", "nodes": [], "flow": {"version": 2, "nodes": [], "edges": []}})
                doc["stageFlowRefs"].append({"uid": "ref-add", "stageUid": "stage-add", "processUid": "proc-add", "order": 1})
                doc["businessComponents"].append({"uid": "component-add", "name": "新增组件", "kind": "generic"})
                doc["businessConstructs"].append({"uid": "construct-add", "name": "新增构件", "businessComponentUid": "component-add"})
                doc["entities"].append({"uid": "entity-add", "name": "新增实体", "fields": [], "state_transitions": []})
                doc["relations"].append({"uid": "relation-add", "from": "entity-edit", "to": "entity-add", "type": "1:N", "label": "新增"})
                doc["taskDefinitions"].append({"uid": "taskdef-add", "name": "新增任务", "constructUid": "construct-add"})
                doc["serviceGroups"].append({"uid": "service-group-add", "name": "新增服务组"})
                doc["services"].append({"uid": "service-add", "name": "新增接口", "serviceGroupUid": "service-group-add", "method": "POST", "path": "/add"})
                doc["rules"].append({"uid": "rule-add", "name": "新增规则", "applies_to": "proc-add"})

            def update_everything(doc: dict) -> None:
                doc["roles"][0]["desc"] = "已修改角色"
                doc["language"][0]["definition"] = "已修改术语"
                doc["panorama"]["columns"][0]["name"] = "已修改价值流"
                doc["panorama"]["lanes"][0]["name"] = "已修改业务域"
                doc["panorama"]["cells"][0]["status"] = "已修改单元格"
                doc["stages"][0]["name"] = "已修改阶段"
                doc["processes"][0]["trigger"] = "已修改触发"
                doc["processes"][0]["nodes"][0]["name"] = "已修改节点"
                doc["processes"][0]["flow"]["nodes"][0]["title"] = "已修改网关"
                doc["processes"][0]["flow"]["edges"][0]["label"] = "已修改连线"
                doc["stageFlowRefs"][0]["pos"] = {"x": 24, "y": 12}
                doc["stageFlowLinks"][0]["label"] = "已修改阶段连线"
                doc["businessComponents"][0]["note"] = "已修改组件"
                doc["businessConstructs"][0]["note"] = "已修改构件"
                doc["entities"][0]["name"] = "已修改实体"
                doc["entities"][0]["fields"][0]["note"] = "已修改字段"
                doc["entities"][0]["state_transitions"][0]["note"] = "已修改状态"
                doc["relations"][0]["label"] = "已修改关系"
                doc["taskDefinitions"][0]["note"] = "已修改任务"
                doc["serviceGroups"][0]["note"] = "已修改服务组"
                doc["services"][0]["desc"] = "已修改接口"
                doc["rules"][0]["description"] = "已修改规则"

            def delete_everything(doc: dict) -> None:
                for key in ("roles", "language", "stages", "processes", "stageFlowRefs", "stageFlowLinks",
                            "businessComponents", "businessConstructs", "entities", "relations",
                            "taskDefinitions", "serviceGroups", "services", "rules"):
                    doc[key] = [item for item in doc[key] if not str(item.get("uid", "")).endswith("-delete")]
                for key in ("columns", "lanes", "cells"):
                    doc["panorama"][key] = [item for item in doc["panorama"][key] if not str(item.get("uid", "")).endswith("-delete")]
                doc["processes"][0]["nodes"] = [item for item in doc["processes"][0]["nodes"] if item["uid"] != "node-delete"]
                doc["processes"][0]["flow"]["edges"] = [item for item in doc["processes"][0]["flow"]["edges"] if item["uid"] != "edge-delete"]
                doc["entities"][0]["fields"] = [item for item in doc["entities"][0]["fields"] if item["uid"] != "field-delete"]
                doc["entities"][0]["state_transitions"] = [item for item in doc["entities"][0]["state_transitions"] if item["uid"] != "transition-delete"]

            with ThreadPoolExecutor(max_workers=3) as executor:
                results = list(executor.map(lambda args: submit(*args), [
                    (1, add_everything),
                    (2, update_everything),
                    (3, delete_everything),
                ]))

            self.assertEqual(sorted(result["seq"] for result in results), [1, 2, 3])
            final = storage.load("FullScene")

            def uids(key: str) -> set[str]:
                values = final.get(key)
                if values is None and key == "terms":
                    values = final.get("language", [])
                return {item["uid"] for item in values or []}

            for key, added in {
                "roles": "role-add",
                "language": "term-add",
                "stages": "stage-add",
                "processes": "proc-add",
                "stageFlowRefs": "ref-add",
                "businessComponents": "component-add",
                "businessConstructs": "construct-add",
                "entities": "entity-add",
                "relations": "relation-add",
                "taskDefinitions": "taskdef-add",
                "serviceGroups": "service-group-add",
                "services": "service-add",
                "rules": "rule-add",
            }.items():
                self.assertIn(added, uids(key), key)
                self.assertFalse(any(uid.endswith("-delete") for uid in uids(key)), key)

            self.assertEqual(final["roles"][0]["desc"], "已修改角色")
            self.assertEqual(final["language"][0]["definition"], "已修改术语")
            self.assertEqual(final["stages"][0]["name"], "已修改阶段")
            self.assertEqual(final["processes"][0]["nodes"][0]["name"], "已修改节点")
            self.assertEqual(final["entities"][0]["fields"][0]["note"], "已修改字段")
            self.assertEqual(final["services"][0]["desc"], "已修改接口")


if __name__ == "__main__":
    unittest.main()
