import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from blm_core.feedback import FeedbackStore


class FeedbackStoreTests(unittest.TestCase):
    def test_concurrent_adds_keep_every_feedback_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))

            def add_item(index: int):
                return store.apply(
                    {
                        "action": "add",
                        "data": {
                            "uid": f"fb-{index}",
                            "category": "体验改进",
                            "title": f"反馈 {index}",
                            "description": "并发提交",
                        },
                        "user": {"name": f"用户{index}"},
                    }
                )

            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(add_item, range(32)))

            document = store.load()
            self.assertEqual(len(document["items"]), 32)
            self.assertEqual(
                {item["uid"] for item in document["items"]},
                {f"fb-{index}" for index in range(32)},
            )

    def test_reply_updates_feedback_by_uid(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))
            store.apply(
                {
                    "action": "add",
                    "data": {"uid": "fb-one", "category": "严重问题", "title": "打不开"},
                    "user": {"name": "提交人"},
                }
            )

            document = store.apply(
                {
                    "action": "reply",
                    "uid": "fb-one",
                    "data": {"status": "已解决", "reply": "已修复。"},
                    "user": {"name": "处理人"},
                }
            )

            self.assertEqual(document["items"][0]["status"], "已解决")
            self.assertEqual(document["items"][0]["reply"], "已修复。")
            self.assertEqual(document["items"][0]["repliedBy"], "处理人")

    def test_messages_can_be_appended_and_edited(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))
            store.apply(
                {
                    "action": "add",
                    "data": {"uid": "fb-thread", "category": "需求功能", "title": "需要讨论", "description": "首楼"},
                    "user": {"name": "甲"},
                }
            )
            document = store.apply(
                {
                    "action": "message",
                    "uid": "fb-thread",
                    "data": {"content": "补充说明"},
                    "user": {"name": "乙"},
                }
            )
            message_uid = document["items"][0]["messages"][1]["uid"]

            document = store.apply(
                {
                    "action": "editMessage",
                    "uid": "fb-thread",
                    "messageUid": message_uid,
                    "data": {"content": "补充说明已修改"},
                    "user": {"name": "乙"},
                }
            )

            self.assertEqual(len(document["items"][0]["messages"]), 2)
            self.assertEqual(document["items"][0]["messages"][0]["floor"], 1)
            self.assertEqual(document["items"][0]["messages"][1]["floor"], 2)
            self.assertEqual(document["items"][0]["messages"][1]["content"], "补充说明已修改")
            self.assertTrue(document["items"][0]["messages"][1]["updatedAt"])

    def test_category_and_status_can_be_updated_without_losing_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))
            store.apply(
                {
                    "action": "add",
                    "data": {"uid": "fb-meta", "category": "体验改进", "title": "分类调整", "description": "原始内容"},
                    "user": {"name": "甲"},
                }
            )
            document = store.apply(
                {
                    "action": "update",
                    "uid": "fb-meta",
                    "data": {"category": "严重问题", "status": "处理中", "description": "修改后的详细描述"},
                }
            )

            self.assertEqual(document["items"][0]["category"], "严重问题")
            self.assertEqual(document["items"][0]["status"], "处理中")
            self.assertEqual(document["items"][0]["description"], "修改后的详细描述")
            self.assertEqual(document["items"][0]["messages"][0]["content"], "原始内容")

    def test_requirement_category_is_supported(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))
            document = store.apply(
                {
                    "action": "add",
                    "data": {"uid": "fb-requirement", "category": "需求功能", "title": "新增报表"},
                    "user": {"name": "甲"},
                }
            )

            self.assertEqual(document["items"][0]["category"], "需求功能")

    def test_legacy_categories_are_mapped_to_new_categories(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FeedbackStore(Path(tmp))
            document = store.apply(
                {
                    "action": "add",
                    "data": {"uid": "fb-legacy", "category": "缺陷", "title": "历史缺陷"},
                    "user": {"name": "甲"},
                }
            )

            self.assertEqual(document["items"][0]["category"], "轻微缺陷")


if __name__ == "__main__":
    unittest.main()
