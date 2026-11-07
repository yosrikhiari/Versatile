import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from check_pilot_exports import check_rows, load_pack_scene_ids, main  # noqa: E402


DIMS = {k: "Fine" for k in ("continuity", "voice", "show_tell", "pacing", "emotional_goal")}


def row(scene_id, labeller="Rater A", **overrides):
    base = {
        "sceneId": scene_id,
        "overall": "Keep",
        "dims": dict(DIMS),
        "note": "",
        "labeller": labeller,
        "studyId": "gate-human-pilot-v1",
        "rubricVersion": "v1",
        "packHash": "abc123",
        "pass": "Pass 1",
    }
    base.update(overrides)
    return base


def rows(n=12, labeller="Rater A", **overrides):
    return [row(f"scene-{i + 1}", labeller=labeller, **overrides) for i in range(n)]


class CheckRowsTests(unittest.TestCase):
    def test_accepts_complete_valid_export(self):
        errors, meta, scene_ids = check_rows("a.json", rows())
        self.assertEqual(errors, [])
        self.assertEqual(meta["studyId"], "gate-human-pilot-v1")
        self.assertEqual(len(scene_ids), 12)

    def test_flags_wrong_count_missing_fields_and_duplicates(self):
        bad = rows(11)
        bad[0].pop("labeller")
        bad[1]["sceneId"] = bad[0]["sceneId"]
        errors, _, _ = check_rows("a.json", bad)
        text = "\n".join(errors)
        self.assertIn("expected 12 rows", text)
        self.assertIn("missing labeller", text)
        self.assertIn("duplicate sceneId", text)

    def test_flags_forbidden_fields(self):
        bad = rows()
        bad[0]["critic"] = {"score": 1}
        errors, _, _ = check_rows("a.json", bad)
        self.assertTrue(any("forbidden" in e for e in errors))


class MainTests(unittest.TestCase):
    def test_ok_pair_and_mismatch_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            with open(a, "w", encoding="utf-8") as f:
                json.dump(rows(labeller="Rater A"), f)
            with open(b, "w", encoding="utf-8") as f:
                json.dump(rows(labeller="Rater B"), f)
            self.assertEqual(main([a, b, "--json"]), 0)

            with open(b, "w", encoding="utf-8") as f:
                json.dump(rows(labeller="Rater B", studyId="other"), f)
            self.assertEqual(main([a, b]), 1)

    def test_pack_mismatch_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.json")
            b = os.path.join(tmp, "b.json")
            pack = os.path.join(tmp, "pack.json")
            with open(a, "w", encoding="utf-8") as f:
                json.dump(rows(labeller="Rater A"), f)
            with open(b, "w", encoding="utf-8") as f:
                json.dump(rows(labeller="Rater B"), f)
            with open(pack, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "studyId": "gate-human-pilot-v1",
                        "rubricVersion": "v1",
                        "scenes": [{"sceneId": f"different-{i}"} for i in range(12)],
                    },
                    f,
                )
            self.assertEqual(main([a, b, "--pack", pack]), 1)

    def test_load_pack_scene_ids(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(
                {
                    "studyId": "s",
                    "rubricVersion": "v1",
                    "scenes": [{"sceneId": "x"}, {"sceneId": "y"}],
                },
                f,
            )
            name = f.name
        try:
            ids, study, rubric = load_pack_scene_ids(name)
            self.assertEqual(ids, {"x", "y"})
            self.assertEqual((study, rubric), ("s", "v1"))
        finally:
            os.unlink(name)


if __name__ == "__main__":
    unittest.main()
