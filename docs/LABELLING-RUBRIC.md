# Scene labelling rubric — v1 (frozen 2026-09-25)

The human-labelled test set for the quality gate (`docs/GENERATION-PIPELINE-ANALYSIS.md`
§27 plans it; the analysis has no §28, results start at §29). Every gate
number is to be reported against these labels, so **this rubric does not
change once labelling starts**. Criteria drift as a labeller reads
(arXiv 2404.12272); if a rule turns out wrong, finish the pass under v1, write
the change down, and start a v2 pass. Never edit v1 in place.

For each scene, answer each question **Problem / Fine / Unsure**, reading
only the scene, its brief and the facts listed with it. The gate's verdict
is never shown: label what you see, not what you expect the gate said.

> **Status 2026-11-06:** the human-reference pilot is still **blocked on
> humans**. Human labels remain **0**; the only 78-scene labels in the tree
> are two Claude reviewer passes. `tools/labelling/agreement.py
> --require-human` refuses those files when a human comparison is requested.
> See `docs/ETHICS-AND-LIMITATIONS.md` for the data-flow, consent and
> language limits, and do not cite the reviewer corpus as human validation.

## The five questions

| Dimension | Mark **Problem** when… | It is **not** a problem when… |
|---|---|---|
| **Continuity** | A sentence states something that cannot be true given the listed facts, or given something earlier in the same scene (a dead person acting, a debt denied, a place that moves). | The scene adds new information the facts don't mention, or differs in small details (a wound described differently). |
| **Voice** | The scene has 6 or more lines of dialogue, and most of them could be swapped between speakers without a reader noticing. | Fewer than 6 lines of dialogue: mark **N/A** by choosing Unsure and writing "n/a". |
| **Show vs tell** | Two or more passages *report* what happened or *name* a feeling ("she was afraid", "the exchange went badly") at a moment that matters, instead of letting you see or hear it. | Brief summary used for transitions, time jumps, or unimportant action. |
| **Pacing** | Two or more paragraphs could be deleted without losing anything the plot, a character or the tension needs. | Description that sets up something the scene uses later. |
| **Emotional goal** | After reading, you do *not* feel roughly the stated emotional goal, or feel it only because the text says so. | You feel it, even if it is quieter than you'd write it. |

Then one overall question: **Would you keep this scene as it is?** (Keep / Revise).

## How to decide quickly

- One reading, then answer. Do not reread to hunt for problems. The gate is
  meant to catch what a reader notices.
- **Unsure** is a real answer. Use it rather than guessing; it is excluded
  from agreement numbers, not counted as a pass.
- Write a short note only when it helps (e.g. "¶ 4 and 9 are filler",
  "names fear twice"). Notes are how disagreements with the gate get
  explained later.

## The second pass

A week after the first pass, re-label about 20 scenes (the page's
**Re-label pass**), without looking at your first answers. Agreement between
the two passes is the stand-in for a second human: it caps how well the gate
can be expected to agree with you.

## Addendum, 2026-09-25: who labels (the questions above are unchanged)

78 scenes turned out to be too much for one person. The labels now come from:

- **The human reference: 12 scenes**, three of the shortest from each story
  (`quick` in `scenes.json`). The re-label pass is 6 of them.
- **Independent model reviewers: all 78, twice.** Two separate passes by
  Claude reviewers apply this same rubric. They are never shown the gate's
  verdicts, and the second pass cannot see the first
  (`reports/live/labelling/claude-labels/`).

The 12 human labels decide how far the reviewers' labels can stand in for a
human: their agreement on those 12 is reported first. Every gate number
measured against reviewer labels is reported as that, never as "human
labels".

## Running the pilot in the app

Open **Review study** in the sidebar (or `/study`). The workspace is
local-only and blinded:

1. Import a frozen v1 pack as JSON. It must contain exactly 12 scenes and may
   carry only the scene text, title, brief and the facts the rubric allows.
   Packs containing critic, score or gate output are refused, so the rater
   cannot see the verdict.
2. Enter an anonymous participant code (for example `Rater A`) and pass label.
   AI/model names are refused because they would fail the
   `agreement.py --require-human` provenance check.
3. Read and accept the informed-consent screen before any scene is shown. The
   session records only the consent version and a timestamp — no name,
   signature or contact detail. A participant can stop at any time and delete
   the local session; exported copies must be deleted on request.
4. The workspace randomizes scene order per rater/pass, shows one scene at a
   time, and records Keep/Revise plus Problem/Fine/Unsure for all five
   dimensions. Unsure is a real answer. No score, critic note or other rater's
   answer is shown.
5. Export the finished session as JSON. The file keeps the study id, rubric
   version, pack hash, rater code and pass on every row. Optionally pre-flight
   with `tools/labelling/check_pilot_exports.py`, then run
   `tools/labelling/agreement.py --require-human` on two exported rater files.

The pack shape is:

```json
{
  "studyId": "gate-human-pilot-v1",
  "rubricVersion": "v1",
  "title": "Gate human-reference pilot",
  "scenes": [
    {
      "sceneId": "stable-scene-id",
      "sceneTitle": "Pilot scene 1",
      "brief": "What the scene is trying to do.",
      "facts": ["A fact the rubric permits the rater to use."],
      "text": "The plain-text scene."
    }
  ]
}
```

`scenes` must contain 12 entries. The app does not ship or invent a pack; the
facilitator supplies the frozen one. A session with no completed responses
contains no labels and is not evidence.

The repository can build the pack from the existing frozen labelling corpus
without copying any labels:

```bash
python tools/labelling/build_study_pack.py
# writes reports/live/labelling/human-review-pack.json
```

It selects the 12 ids in `quick` from `reports/live/labelling/scenes.json` and
copies only scene text, brief and facts. If the corpus is absent, the script
fails rather than inventing scenes.
