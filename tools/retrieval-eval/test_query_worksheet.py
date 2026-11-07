import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from query_worksheet import build_worksheet, finalize_worksheet, main  # noqa: E402
from fact_retrieval import queries_from_rows  # noqa: E402


class BuildWorksheetTests(unittest.TestCase):
    def test_builds_unfilled_worksheet_with_scene_context(self):
        corpus = [
            {"index": 1, "chapter": 1, "title": "A", "draft": "alpha " * 40, "storyBible": "Ch1: finds the key"},
            {"index": 2, "chapter": 1, "title": "B", "draft": "beta " * 40, "storyBible": ""},
        ]
        ws = build_worksheet(corpus, book_id="book-a")
        self.assertEqual(ws["status"], "TEMPLATE_UNFILLED")
        self.assertFalse(ws["humanCheckedRelevance"])
        self.assertEqual(ws["bookId"], "book-a")
        self.assertEqual(len(ws["scenes"]), 2)
        self.assertEqual(ws["scenes"][0]["index"], 1)
        self.assertTrue(ws["queries"])
        q = ws["queries"][0]
        self.assertIn("__FILL__", json.dumps(q["relevant"]))
        self.assertFalse(q["humanChecked"])

    def test_unfilled_queries_fail_strict_validation(self):
        corpus = [{"index": 1, "chapter": 1, "draft": "x", "storyBible": "Ch1: fact"}]
        ws = build_worksheet(corpus, book_id="b")
        with self.assertRaises(ValueError):
            queries_from_rows(ws["queries"], 1)
        with self.assertRaises(ValueError):
            finalize_worksheet(ws)


class FinalizeWorksheetTests(unittest.TestCase):
    def test_finalize_accepts_human_filled_queries(self):
        corpus = [
            {"index": 1, "chapter": 1, "draft": "x", "storyBible": ""},
            {"index": 2, "chapter": 1, "draft": "y", "storyBible": ""},
        ]
        ws = build_worksheet(corpus, book_id="b")
        ws["queries"] = [
            {
                "id": "q1",
                "text": "who finds the key",
                "relevant": [0],
                "hard_negatives": [1],
                "kind": "fact",
                "humanChecked": True,
            }
        ]
        ws["humanCheckedRelevance"] = True
        ws["status"] = "HUMAN_CHECKED"
        rows = finalize_worksheet(ws)
        self.assertEqual(len(rows), 1)
        queries_from_rows(rows, 2)  # strict parser accepts

    def test_finalize_rejects_false_human_checked_claim(self):
        ws = {
            "status": "HUMAN_CHECKED",
            "humanCheckedRelevance": True,
            "scenes": [{"index": 1}],
            "queries": [{"id": "q1", "text": "x", "relevant": [0], "humanChecked": False}],
        }
        with self.assertRaises(ValueError):
            finalize_worksheet(ws)


class CliTests(unittest.TestCase):
    def test_cli_writes_template_and_finalizes(self):
        with tempfile.TemporaryDirectory() as tmp:
            corpus = os.path.join(tmp, "corpus.json")
            with open(corpus, "w", encoding="utf-8") as f:
                json.dump(
                    [{"index": 1, "chapter": 1, "draft": "a", "storyBible": "Ch1: fact"},
                     {"index": 2, "chapter": 1, "draft": "b", "storyBible": ""}],
                    f,
                )
            out = os.path.join(tmp, "worksheet.json")
            self.assertEqual(main(["scaffold", "--corpus", corpus, "--book-id", "b", "--out", out]), 0)
            with open(out, encoding="utf-8") as f:
                ws = json.load(f)
            self.assertEqual(ws["status"], "TEMPLATE_UNFILLED")

            # Fill it as a human would.
            ws["status"] = "HUMAN_CHECKED"
            ws["humanCheckedRelevance"] = True
            ws["queries"] = [{"id": "q1", "text": "fact", "relevant": [0], "hard_negatives": [1], "kind": "fact", "humanChecked": True}]
            filled = os.path.join(tmp, "filled.json")
            with open(filled, "w", encoding="utf-8") as f:
                json.dump(ws, f)
            qout = os.path.join(tmp, "queries.json")
            self.assertEqual(main(["finalize", "--worksheet", filled, "--out", qout]), 0)
            with open(qout, encoding="utf-8") as f:
                rows = json.load(f)
            queries_from_rows(rows, 2)


if __name__ == "__main__":
    unittest.main()
