from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from blm_core.document import create_empty_document
from blm_core.storage import WorkspaceStorage
from tools.migrations.unify_workspace_uids import (
    apply_uid_alignment,
    build_uid_alignment_plan,
    unify_workspace_uids,
)


def make_document(title: str, *, role_uid: str, process_uid: str, node_uid: str, duplicate_constructs: bool = False) -> dict:
    document = create_empty_document(title)
    document["roles"] = [{"uid": role_uid, "name": "会员", "desc": "", "group": "", "subDomains": []}]
    process = document["processes"][0]
    process["uid"] = process_uid
    process["name"] = "国债充抵申请"
    process["nodes"] = [
        {
            "uid": node_uid,
            "name": "提交申请",
            "role_uid": role_uid,
            "role_uids": [role_uid],
            "role": "会员",
            "roles": ["会员"],
            "userSteps": [],
            "entity_ops": [],
            "orchestrationTasks": [],
            "businessRules": [],
            "forms": [],
        }
    ]
    document["businessConstructs"] = [
        {"uid": "construct-a", "name": "字典项", "note": "", "entityUids": [], "taskDefinitionUids": []}
    ]
    if duplicate_constructs:
        document["businessConstructs"].append(
            {"uid": "construct-b", "name": "字典项", "note": "", "entityUids": [], "taskDefinitionUids": []}
        )
    return document


class UidUnificationTests(unittest.TestCase):
    def test_plan_aligns_high_confidence_items_to_baseline(self):
        baseline = make_document("baseline", role_uid="role-base", process_uid="proc-base", node_uid="node-base")
        branch = make_document("branch", role_uid="role-branch", process_uid="proc-branch", node_uid="node-branch")

        plan = build_uid_alignment_plan(baseline, {"branch": branch})

        self.assertEqual(plan["replacementsByDocument"]["branch"]["role-branch"], "role-base")
        self.assertEqual(plan["replacementsByDocument"]["branch"]["proc-branch"], "proc-base")
        self.assertEqual(plan["replacementsByDocument"]["branch"]["node-branch"], "node-base")

    def test_apply_alignment_rewrites_uid_and_references_together(self):
        branch = make_document("branch", role_uid="role-branch", process_uid="proc-branch", node_uid="node-branch")

        aligned = apply_uid_alignment(
            branch,
            {
                "role-branch": "role-base",
                "proc-branch": "proc-base",
                "node-branch": "node-base",
            },
        )

        self.assertEqual(aligned["roles"][0]["uid"], "role-base")
        self.assertEqual(aligned["processes"][0]["uid"], "proc-base")
        self.assertEqual(aligned["processes"][0]["nodes"][0]["uid"], "node-base")
        self.assertEqual(aligned["processes"][0]["nodes"][0]["role_uid"], "role-base")
        self.assertEqual(aligned["processes"][0]["nodes"][0]["role_uids"], ["role-base"])

    def test_duplicate_semantic_key_is_skipped(self):
        baseline = make_document("baseline", role_uid="role-base", process_uid="proc-base", node_uid="node-base", duplicate_constructs=True)
        branch = make_document("branch", role_uid="role-branch", process_uid="proc-branch", node_uid="node-branch", duplicate_constructs=True)

        plan = build_uid_alignment_plan(baseline, {"branch": branch})

        self.assertFalse(any(item["key"] == "businessConstructs::字典项" for item in plan["aligned"]))
        self.assertTrue(
            any(item["key"] == "businessConstructs::字典项" and item["reason"] == "baseline-duplicate" for item in plan["skipped"])
        )

    def test_dry_run_does_not_write_workspace_document(self):
        baseline = make_document("baseline", role_uid="role-base", process_uid="proc-base", node_uid="node-base")
        branch = make_document("branch", role_uid="role-branch", process_uid="proc-branch", node_uid="node-branch")
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.save("baseline", baseline)
            storage.save("branch", branch)

            result = unify_workspace_uids(workspace, baseline="baseline", documents=["branch"], apply=False)
            manifest = json.loads((workspace / "branch" / "manifest.json").read_text("utf-8"))

        self.assertEqual(result["summary"]["replacementCount"], 3)
        self.assertEqual(manifest["roles"][0]["uid"], "role-branch")


if __name__ == "__main__":
    unittest.main()
