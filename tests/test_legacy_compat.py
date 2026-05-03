import json
import tempfile
import unittest
from pathlib import Path

from blm_core.document import SCHEMA_VERSION
from blm_core.storage import DocumentFileStore


ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "legacy_docs"


class LegacyDocumentCompatibilityTests(unittest.TestCase):
    def test_legacy_fixture_documents_load_with_current_schema(self):
        store = DocumentFileStore()

        for fixture_path in sorted(FIXTURE_DIR.glob("*.json")):
            with self.subTest(fixture=fixture_path.name):
                document = store.load_path(fixture_path)

                self.assertTrue(document["meta"]["document_uid"])
                self.assertEqual(document["meta"]["schema_version"], SCHEMA_VERSION)
                self.assertIn("processes", document)
                self.assertNotIn("process", document)
                self.assertTrue(all(role.get("uid") for role in document.get("roles", [])))
                self.assertTrue(all(process.get("uid") for process in document.get("processes", [])))
                self.assertTrue(all("nodes" in process for process in document.get("processes", [])))
                self.assertTrue(all("flowGroup" in process for process in document.get("processes", [])))
                self.assertTrue(all(entity.get("uid") for entity in document.get("entities", [])))

    def test_legacy_fixture_documents_round_trip_after_save(self):
        store = DocumentFileStore()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            for fixture_path in sorted(FIXTURE_DIR.glob("*.json")):
                with self.subTest(fixture=fixture_path.name):
                    raw_document = json.loads(fixture_path.read_text("utf-8"))
                    output_path = output_dir / fixture_path.name

                    saved_document = store.save_path(output_path, raw_document)
                    reloaded_document = store.load_path(output_path)

                    self.assertEqual(reloaded_document["meta"]["title"], saved_document["meta"]["title"])
                    self.assertEqual(reloaded_document["meta"]["schema_version"], SCHEMA_VERSION)
                    self.assertTrue(reloaded_document["meta"]["document_uid"])
                    self.assertTrue(all("nodes" in process for process in reloaded_document.get("processes", [])))
                    self.assertTrue(output_path.exists())
                    self.assertTrue(output_path.with_suffix(".md").exists())


if __name__ == "__main__":
    unittest.main()
