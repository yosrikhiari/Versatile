# Scene labelling rubric — v1 (frozen 2026-09-25)

The human-labelled test set for the quality gate (analysis §27–§28). Every gate
number is to be reported against these labels, so **this rubric does not
change once labelling starts**. Criteria drift as a labeller reads
(arXiv 2404.12272); if a rule turns out wrong, finish the pass under v1, write
the change down, and start a v2 pass. Never edit v1 in place.

For each scene, answer each question **Problem / Fine / Unsure**, reading
only the scene, its brief and the facts listed with it. The gate's verdict
is never shown: label what you see, not what you expect the gate said.

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
