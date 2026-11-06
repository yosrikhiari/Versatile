"""
Build the frozen human-review study pack from the labelling scene corpus.

This packages scene text, brief and permitted facts only. It does not copy
labels, critic verdicts, gate output or scores, because the review workspace
must stay blinded.

    python tools/labelling/build_study_pack.py
    python tools/labelling/build_study_pack.py --scenes path/to/scenes.json \
        --out reports/live/labelling/human-review-pack.json
"""
import argparse
import json
import os

DEFAULT_SCENES = "reports/live/labelling/scenes.json"
DEFAULT_OUT = "reports/live/labelling/human-review-pack.json"
STUDY_ID = "gate-human-pilot-v1"
TITLE = "Gate human-reference pilot"
SCENE_COUNT = 12


def describe_brief(brief):
    """One readable paragraph; the rubric permits the scene brief."""
    if not isinstance(brief, dict):
        return ""
    parts = []
    if brief.get("whatChanges"):
        parts.append(f"What changes: {brief['whatChanges']}")
    if brief.get("emotionalGoal"):
        parts.append(f"Emotional goal: {brief['emotionalGoal']}")
    if brief.get("characters"):
        parts.append("Characters: " + ", ".join(str(c) for c in brief["characters"]))
    if brief.get("location"):
        parts.append(f"Location: {brief['location']}")
    return " ".join(parts)


def build_pack(data, study_id=STUDY_ID, title=TITLE):
    if not isinstance(data, dict):
        raise ValueError("scenes file must be a JSON object")
    quick = data.get("quick")
    scenes = data.get("scenes")
    if not isinstance(quick, list) or len(quick) != SCENE_COUNT:
        raise ValueError(f"scenes file must name exactly {SCENE_COUNT} quick scene ids")
    if not isinstance(scenes, list):
        raise ValueError("scenes file has no scenes list")

    by_id = {scene.get("id"): scene for scene in scenes if isinstance(scene, dict)}
    missing = [scene_id for scene_id in quick if scene_id not in by_id]
    if missing:
        raise ValueError(f"missing scene content for: {', '.join(missing)}")
    if len(set(quick)) != SCENE_COUNT:
        raise ValueError("quick scene ids must be unique")

    out = []
    for index, scene_id in enumerate(quick, start=1):
        scene = by_id[scene_id]
        prose = scene.get("prose")
        if not isinstance(prose, str) or not prose.strip():
            raise ValueError(f"scene {scene_id} has no prose")
        facts = [
            str(fact).strip()
            for fact in scene.get("facts", [])
            if isinstance(fact, str) and fact.strip()
        ]
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        out.append(
            {
                "sceneId": scene_id,
                "sceneTitle": brief.get("title") or f"Pilot scene {index}",
                "text": prose,
                "brief": describe_brief(brief),
                "facts": facts,
                "source": scene.get("source") or "",
            }
        )

    return {
        "studyId": study_id,
        "rubricVersion": "v1",
        "title": title,
        "description": (
            "Frozen 12-scene human-reference pilot. Scene text, brief and facts only; "
            "no labels, critic or gate output."
        ),
        "scenes": out,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the frozen human-review pack")
    parser.add_argument("--scenes", default=DEFAULT_SCENES)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--study-id", default=STUDY_ID)
    parser.add_argument("--title", default=TITLE)
    args = parser.parse_args(argv)

    with open(args.scenes, encoding="utf-8") as handle:
        data = json.load(handle)
    pack = build_pack(data, study_id=args.study_id, title=args.title)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(pack, handle, ensure_ascii=False, indent=1)
    print(f"wrote {args.out} ({len(pack['scenes'])} scenes, no labels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
