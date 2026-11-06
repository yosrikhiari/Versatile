import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from agreement import (  # noqa: E402
    AI_PROVENANCE_MARKERS,
    agreement_report,
    detect_provenance,
    load_label_map,
    normalize_dimension,
    normalize_overall,
    require_human_labels,
)


def labels(*rows):
    return {row["sceneId"]: row for row in rows}


class NormalizeTests(unittest.TestCase):
    def test_dimension_values_are_case_insensitive_and_unknown_values_are_unusable(self):
        self.assertEqual(normalize_dimension("Problem"), "problem")
        self.assertEqual(normalize_dimension(" fine "), "fine")
        self.assertEqual(normalize_dimension("UNSURE"), "unsure")
        self.assertIsNone(normalize_dimension("maybe"))
        self.assertIsNone(normalize_dimension(None))

    def test_overall_aliases_map_to_the_binary_keep_revise_decision(self):
        self.assertEqual(normalize_overall("Keep"), "keep")
        self.assertEqual(normalize_overall("pass"), "keep")
        self.assertEqual(normalize_overall("Revise"), "revise")
        self.assertEqual(normalize_overall("rewrite"), "revise")
        self.assertIsNone(normalize_overall("unknown"))


class AgreementTests(unittest.TestCase):
    def test_perfect_agreement_is_reported_as_kappa_one(self):
        a = labels(
            {"sceneId": "s1", "dims": {"continuity": "problem"}, "overall": "revise"},
            {"sceneId": "s2", "dims": {"continuity": "fine"}, "overall": "keep"},
        )
        b = labels(
            {"sceneId": "s1", "dims": {"continuity": "problem"}, "overall": "revise"},
            {"sceneId": "s2", "dims": {"continuity": "fine"}, "overall": "keep"},
        )
        report = agreement_report(a, b)
        self.assertEqual(report["overlap"], 2)
        self.assertEqual(report["dimensions"]["continuity"]["agree"], 2)
        self.assertEqual(report["dimensions"]["continuity"]["percentAgreement"], 100.0)
        self.assertEqual(report["dimensions"]["continuity"]["kappa"], 1.0)
        self.assertEqual(report["overall"]["kappa"], 1.0)

    def test_known_disagreement_gives_75_percent_and_kappa_half(self):
        a = labels(
            {"sceneId": "s1", "dims": {"continuity": "problem"}, "overall": "revise"},
            {"sceneId": "s2", "dims": {"continuity": "fine"}, "overall": "keep"},
            {"sceneId": "s3", "dims": {"continuity": "problem"}, "overall": "revise"},
            {"sceneId": "s4", "dims": {"continuity": "fine"}, "overall": "keep"},
        )
        b = labels(
            {"sceneId": "s1", "dims": {"continuity": "problem"}, "overall": "revise"},
            {"sceneId": "s2", "dims": {"continuity": "fine"}, "overall": "keep"},
            {"sceneId": "s3", "dims": {"continuity": "fine"}, "overall": "keep"},
            {"sceneId": "s4", "dims": {"continuity": "fine"}, "overall": "keep"},
        )
        report = agreement_report(a, b)
        continuity = report["dimensions"]["continuity"]
        self.assertEqual(continuity["n"], 4)
        self.assertEqual(continuity["agree"], 3)
        self.assertEqual(continuity["percentAgreement"], 75.0)
        self.assertEqual(continuity["kappa"], 0.5)
        self.assertEqual(
            continuity["disagreements"], [{"sceneId": "s3", "a": "problem", "b": "fine"}]
        )

    def test_unsure_and_missing_dimensions_are_counted_and_excluded_from_denominator(self):
        a = labels(
            {"sceneId": "s1", "dims": {"voice": "problem"}},
            {"sceneId": "s2", "dims": {"voice": "unsure"}},
            {"sceneId": "s3", "dims": {}},
        )
        b = labels(
            {"sceneId": "s1", "dims": {"voice": "problem"}},
            {"sceneId": "s2", "dims": {"voice": "fine"}},
            {"sceneId": "s3", "dims": {"voice": "fine"}},
        )
        voice = agreement_report(a, b)["dimensions"]["voice"]
        self.assertEqual(voice["n"], 1)
        self.assertEqual(voice["unsure"], {"a": 1, "b": 0})
        self.assertEqual(voice["missing"], {"a": 1, "b": 0})
        self.assertEqual(voice["agree"], 1)

    def test_scenes_labelled_by_only_one_rater_are_not_in_the_overlap(self):
        a = labels({"sceneId": "s1", "dims": {"pacing": "problem"}})
        b = labels({"sceneId": "s2", "dims": {"pacing": "problem"}})
        report = agreement_report(a, b)
        self.assertEqual(report["overlap"], 0)
        self.assertEqual(report["onlyA"], ["s1"])
        self.assertEqual(report["onlyB"], ["s2"])
        self.assertIsNone(report["dimensions"]["pacing"]["kappa"])

    def test_duplicate_scene_ids_are_rejected_instead_of_last_one_winning(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "labels.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(
                    [
                        {"sceneId": "s1", "dims": {}, "overall": "keep"},
                        {"sceneId": "s1", "dims": {}, "overall": "revise"},
                    ],
                    handle,
                )
            with self.assertRaises(ValueError):
                load_label_map(path)

    def test_report_is_json_serializable_when_a_dimension_has_no_pairs(self):
        a = labels({"sceneId": "s1", "dims": {"pacing": "unsure"}})
        b = labels({"sceneId": "s1", "dims": {"pacing": "fine"}})
        json.dumps(agreement_report(a, b), allow_nan=False)


class ProvenanceTests(unittest.TestCase):
    def test_claude_labellers_are_detected_as_ai_not_human(self):
        a = labels({"sceneId": "s1", "labeller": "claude-pass1-chunk1", "dims": {}})
        b = labels({"sceneId": "s1", "labeller": "Claude Pass 2", "dims": {}})
        report = agreement_report(a, b)
        self.assertFalse(report["provenance"]["isHuman"])
        self.assertIn("claude", AI_PROVENANCE_MARKERS)

    def test_missing_labeller_metadata_cannot_be_called_human(self):
        report = detect_provenance(labels({"sceneId": "s1", "dims": {}}))
        self.assertFalse(report["isHuman"])
        self.assertIn("unknown", report["note"])

    def test_require_human_refuses_ai_or_unverified_labels(self):
        ai = labels({"sceneId": "s1", "labeller": "claude-pass1", "dims": {}})
        with self.assertRaises(ValueError):
            require_human_labels(ai)
        human = labels({"sceneId": "s1", "labeller": "Ada Lovelace", "dims": {}})
        require_human_labels(human)


if __name__ == "__main__":
    unittest.main()
