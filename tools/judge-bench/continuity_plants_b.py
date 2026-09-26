"""
Held-out set B for continuity (§32), written BEFORE any confirmer experiment
and never used to tune one. 14 planted contradictions and 6 hard negatives
(sentences that touch a story fact but agree with it), each added to the end
of the third paragraph of a scene both reviewers marked continuity-fine and
that set A (continuity_plants.py) did not use.

    python -X utf8 tools/judge-bench/continuity_plants_b.py build   # -> reports/live/plants-b/scenes.json
"""
import json
import os
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_plants import planted  # noqa: E402

# (scene, sentence, fact it contradicts or agrees with, contradicts?)
PLANTS_B = [
    ("salt-corpus-24", "Nesrin was glad she had never had to leave the caravan; its fires had kept her safe every night since.",
     "Nesrin leaves the safety of the caravan and ventures alone into the wilderness.", True),
    ("salt-corpus-17", "Nesrin's mule trotted beside her, sound and quick, as it had been since the day they set out.",
     "The mule is gravely injured and will require prolonged care.", True),
    ("pool-orchard-08", "Élodie had kept the orchard, as she had promised their mother she always would.",
     "Élodie has sold the orchard to a developer", True),
    ("salt-corpus-10", "Nesrin had never once set foot in the weigh station.",
     "Nesrin witnesses a merchant being cheated at the weigh station", True),
    ("graph-repair-run-04", "Nesrin weighed the heavy purse of coins she still had left after the tax-farmer's visit.",
     "She has spent her final coin to pay the tax-farmer", True),
    ("pool-orchard-05", "Samir had never seen any letter, sealed or otherwise, in the cider barn.",
     "Samir finds a sealed letter in the cider barn", True),
    ("salt-corpus-02", "Nesrin laid a stone on the fresh cairn that held Halim.",
     "Halim is alive and leading a caravan along the Salt Road", True),
    ("pool-orbit-07", "Petrov had kept the old transmitter silent and sealed; no one had touched it in years, least of all Adaeze.",
     "Adaeze has reactivated the old transmitter without authorization.", True),
    ("salt-corpus-18", "Nesrin was pleased the caravan had made record pace that week, never pausing once.",
     "The caravan’s pace halts, exposing vulnerabilities in their mission.", True),
    ("salt-corpus-13", "Nesrin had not seen a single soul on the road all day; no one had followed her.",
     "Nesrin notices two men shadowing her caravan throughout the day.", True),
    ("gate-off-run-04", "Nesrin looked at her clean hands and at her mules, sound and unhurt after the trip to the village.",
     "Nesrin’s hands are stained with blood, and her mules limp upon returning to the village.", True),
    ("graph-repair-run-05", "Nesrin paid her own way and owed Halim nothing at all.",
     "Halim holds Nesrin’s debt and dictates her trade routes", True),
    ("gate-on-run-05", "The market square had cheered Nesrin as its most honest trader; no one there had ever accused her of anything.",
     "She has been accused of smuggling fake goods in the market square", True),
    ("salt-corpus-29", "Nesrin had not been home since she first left, and her hometown knew nothing of what she had done.",
     "Nesrin returns to her hometown, where whispers of her actions spread silently.", True),
    # hard negatives: touch a fact, agree with it
    ("salt-corpus-12", "Nesrin remembered the merchant at the weigh station and the official's bored shrug.",
     "The official dismisses her complaint with apathy", False),
    ("pool-orbit-05", "Adaeze kept her ration card in her pocket; the new, smaller portions left her lightheaded.",
     "Oxygen rations have been reduced across the station.", False),
    ("salt-corpus-04", "Nesrin thought of the traveler who had died near the campsite, stiff by morning.",
     "A traveler dies overnight near the campsite, his body stiff and silent.", False),
    ("salt-corpus-02", "Halim's caravan would be far ahead of her by now.",
     "Halim is alive and leading a caravan along the Salt Road", False),
    ("pool-orchard-08", "Lucie still spoke of the orchard as if it would be theirs forever.",
     "Lucie has not been informed of the sale", False),
    ("salt-corpus-10", "Nesrin resolved again that the conspiracy would come to light, whatever it cost her.",
     "Nesrin resolves to expose the corruption despite knowing the risks", False),
]


def build():
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    out = []
    for i, (sid, sentence, fact, contra) in enumerate(PLANTS_B):
        assert any(fact[:25] in f for f in pool[sid]["facts"]), (sid, fact)
        s = dict(planted(pool[sid], sentence))
        s.update(id=f"b{i + 1:02d}-{'pos' if contra else 'neg'}-{sid}", order=i + 1,
                 plant={"sentence": sentence, "fact": fact, "contradicts": contra})
        out.append(s)
    os.makedirs("reports/live/plants-b", exist_ok=True)
    json.dump({"built": "2026-09-25", "scenes": out},
              open("reports/live/plants-b/scenes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(out), "scenes")


if __name__ == "__main__" and sys.argv[1:] == ["build"]:
    build()
