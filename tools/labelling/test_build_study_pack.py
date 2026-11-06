import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from build_study_pack import build_pack  # noqa: E402


def corpus(count=12):
    ids = [f"scene-{i}" for i in range(1, count + 1)]
    return {
        "quick": ids,
        "scenes": [
            {
                "id": scene_id,
                "source": "pool",
                "prose": f"Prose for {scene_id}.",
                "brief": {
                    "title": f"Title {scene_id}",
                    "whatChanges": "Something changes.",
                    "emotionalGoal": "Unease.",
                    "characters": ["Nesrin"],
                    "location": "The road",
                },
                "facts": ["A permitted fact."],
            }
            for scene_id in ids
        ],
    }


class BuildStudyPackTests(unittest.TestCase):
    def test_builds_twelve_scenes_without_labels_or_critic_output(self):
        pack = build_pack(corpus())
        self.assertEqual(len(pack["scenes"]), 12)
        self.assertEqual(pack["rubricVersion"], "v1")
        scene = pack["scenes"][0]
        self.assertEqual(scene["sceneId"], "scene-1")
        self.assertIn("What changes:", scene["brief"])
        self.assertIn("A permitted fact.", scene["facts"])
        self.assertNotIn("dims", scene)
        self.assertNotIn("critique", scene)
        self.assertNotIn("score", scene)

    def test_requires_exactly_twelve_unique_scenes_with_prose(self):
        bad = corpus()
        bad["quick"] = bad["quick"][:11]
        with self.assertRaises(ValueError):
            build_pack(bad)

        duplicate = corpus()
        duplicate["quick"][1] = duplicate["quick"][0]
        with self.assertRaises(ValueError):
            build_pack(duplicate)

        missing = corpus()
        missing["scenes"] = missing["scenes"][:-1]
        with self.assertRaises(ValueError):
            build_pack(missing)

        empty = corpus()
        empty["scenes"][0]["prose"] = " "
        with self.assertRaises(ValueError):
            build_pack(empty)


if __name__ == "__main__":
    unittest.main()
