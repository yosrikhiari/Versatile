import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from pilot_report import DISCLAIMER, build_report, main, render_markdown  # noqa: E402

DIMS = {k: "Fine" for k in ("continuity", "voice", "show_tell", "pacing", "emotional_goal")}


def row(scene_id, labeller="Rater A", overall="Keep", dims=None, **overrides):
    base = {
        "sceneId": scene_id,
        "overall": overall,
        "dims": dict(DIMS if dims is None else dims),
        "note": "",
        "labeller": labeller,
        "studyId": "gate-human-pilot-v1",
        "rubricVersion": "v1",
        "packHash": "abc123",
        "pass": "Pass 1",
    }
    base.update(overrides)
    return base


def write(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f)


class PilotReportTests(unittest.TestCase):
    def test_report_includes_disclaimer_and_agreement(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            write(a, [row(f"s{i}", "Rater A") for i in range(12)])
            write(b, [row(f"s{i}", "Rater B") for i in range(12)])
            report = build_report(a, b)
            self.assertTrue(report["preflightOk"])
            self.assertEqual(report["agreement"]["overlap"], 12)
            self.assertEqual(report["agreement"]["overall"]["percentAgreement"], 100.0)
            md = render_markdown(report)
            self.assertIn("feasibility evidence only", md.lower())
            self.assertIn("not gate validation", md.lower())
            self.assertIn(DISCLAIMER, md)

    def test_preflight_catches_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            write(a, [row(f"s{i}", "Rater A") for i in range(12)])
            write(b, [row(f"t{i}", "Rater B") for i in range(12)])
            report = build_report(a, b)
            self.assertFalse(report["preflightOk"])
            self.assertTrue(report["preflightErrors"])

    def test_disagreements_are_rendered(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            dims_b = dict(DIMS)
            dims_b["continuity"] = "Problem"
            write(a, [row("s1", "Rater A", overall="Keep")])
            write(b, [row("s1", "Rater B", overall="Revise", dims=dims_b)])
            # build_report will flag count!=12, but agreement still computed
            report = build_report(a, b)
            md = render_markdown(report)
            self.assertIn("`s1`", md)
            self.assertIn("continuity", md)

    def test_main_writes_markdown_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            out = os.path.join(tmp, "report.md")
            outj = os.path.join(tmp, "report.json")
            write(a, [row(f"s{i}", "Rater A") for i in range(12)])
            write(b, [row(f"s{i}", "Rater B") for i in range(12)])
            self.assertEqual(main([a, b, "--out", out]), 0)
            self.assertTrue(os.path.exists(out))
            with open(out, encoding="utf-8") as f:
                self.assertIn("Human-review pilot feasibility report", f.read())
            self.assertEqual(main([a, b, "--json", "--out", outj]), 0)
            with open(outj, encoding="utf-8") as f:
                data = json.load(f)
            self.assertIn("disclaimer", data)


if __name__ == "__main__":
    unittest.main()
