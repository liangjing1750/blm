import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"


class DocumentationTests(unittest.TestCase):
    def test_required_docs_exist(self):
        self.assertTrue((DOCS_DIR / "BLM设计文档.md").exists())
        self.assertTrue((DOCS_DIR / "BLM测试用例.md").exists())
        self.assertTrue((DOCS_DIR / "BLM用户手册.md").exists())

    def test_design_doc_covers_current_architecture(self):
        content = (DOCS_DIR / "BLM设计文档.md").read_text("utf-8")
        self.assertIn("# BLM 设计文档", content)
        self.assertIn("前后端通过 HTTP 通信", content)
        self.assertIn("身份设计", content)
        self.assertIn("合并策略", content)
        self.assertIn("集中体现在 `blm_core/model_strategy.py`", content)
        self.assertIn("revision 乐观锁", content)
        self.assertIn("流程图模型", content)
        self.assertIn("业务组件模型", content)
        self.assertIn("历史快照", content)
        self.assertIn("使用手册", content)
        self.assertIn("screenshots/06_workspace_editor.png", content)
        self.assertIn("screenshots/07_merge_dialog.png", content)
        self.assertIn("screenshots/09_manual_tab.png", content)

    def test_test_case_doc_covers_core_regressions(self):
        content = (DOCS_DIR / "BLM测试用例.md").read_text("utf-8")
        self.assertIn("# BLM测试用例", content)
        self.assertIn("打开文档", content)
        self.assertIn("确认合并", content)
        self.assertIn("使用手册入口", content)
        self.assertIn("回收站恢复", content)
        self.assertIn("未保存修改保护", content)
        self.assertIn("节点", content)
        self.assertIn("分类标签", content)
        self.assertIn("当前服务版本过旧", content)
        self.assertIn("不再显示“业务域 / 流程 / 数据 / 预览”页签", content)
        self.assertIn("screenshots/07_merge_dialog.png", content)
        self.assertIn("screenshots/09_manual_tab.png", content)

    def test_user_manual_covers_main_user_actions(self):
        content = (DOCS_DIR / "BLM用户手册.md").read_text("utf-8")
        self.assertIn("# BLM用户手册", content)
        self.assertIn("新建文档", content)
        self.assertIn("打开文档", content)
        self.assertIn("复制文档", content)
        self.assertIn("合并文档", content)
        self.assertIn("使用手册入口", content)
        self.assertIn("业务流程 / 业务组件", content)
        self.assertIn("表单片段", content)
        self.assertIn("编排任务", content)
        self.assertIn("重启 BLM 服务", content)
        self.assertIn("回收站", content)
        self.assertIn("不显示“业务域 / 流程 / 数据 / 预览”", content)
        self.assertIn("screenshots/05_open_dialog.png", content)
        self.assertIn("screenshots/08_merge_result.png", content)
        self.assertIn("screenshots/09_manual_tab.png", content)

    def test_required_doc_screenshots_exist(self):
        for screenshot_name in [
            "05_open_dialog.png",
            "06_workspace_editor.png",
            "07_merge_dialog.png",
            "08_merge_result.png",
            "09_manual_tab.png",
        ]:
            self.assertTrue((DOCS_DIR / "screenshots" / screenshot_name).exists(), screenshot_name)


if __name__ == "__main__":
    unittest.main()
