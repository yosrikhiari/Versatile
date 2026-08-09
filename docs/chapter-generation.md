# Chapter Generation

The **Chapter** tab in the Story Generator writes one chapter — 1 to 12 scenes —
through the same pipeline the Arc tab uses for a whole book, sized and judged for
a chapter instead.

## What it does

1. **Plan** — the director turns your synopsis, genre and tone into a
   scene-by-scene outline for one chapter.
2. **Review the plan** — edit scene titles, goals, characters and locations
   before a single word of prose is written. Nothing is generated until you
   confirm.
3. **Write** — scenes are written in order, streamed live into the editor. Each
   one is critiqued and, in auto mode, rewritten up to twice against that
   critique before it is accepted.
4. **Chapter gate** — once every scene is written, the chapter is judged as a
   whole (see below).
5. **Complete** — the prose, the continuity report and the chapter gate report.

Pause holds the run between scenes with everything in memory; continuing costs
nothing. Stop unwinds the run but keeps every scene already committed — pick it
back up from the "Unfinished chapter" card.

## Settings

| Setting | Meaning |
|---|---|
| **Chapter Word Target** | Total words for the chapter, split evenly across its scenes |
| **Scenes / chapter** | How many scenes the chapter is cut into (1–12) |
| **Genre / Tone / Synopsis** | Same as arc mode; the synopsis comes from the project's category and description |
| **One-click** | Write the whole chapter with no stops |
| **Pause per scene for review** | Approve, reject or re-request each scene as it lands |
| **Auto-evaluate scenes** | Run the critic inline and show its verdict |

The estimate under the scene stepper is measured on *your* machine once a run has
been timed there. Before that it is provisional.

## The chapter gate

Scene gates judge scenes in isolation, and three scenes can each pass while
adding up to a bad chapter. After the last scene is written, the chapter is
checked as a whole:

**Blocking** — the run did not deliver a chapter:

- a planned scene produced no prose, or committed empty prose
- a scene opens with a model refusal instead of prose
- more than 15% of the chapter is duplicate sentences (the model looped)
- metadata extraction failed on any scene, or never ran on any of them
- more than a third of the scenes still failed critique after retries
- the critic produced no usable verdict for any scene
- more than 30% of the scenes are degraded
- continuity issues the audit's own fix rounds could not resolve

**Advisory** — worth reading, never worth losing prose over:

- the chapter is short (under 85% of target) or long (over 130%)
- two scenes share more than a quarter of their sentences
- a scene does not cast the POV character the plan declared
- the weakest critique dimension across the chapter is below 7

**A blocking finding never discards prose.** Everything written is committed and
checkpointed either way; the report tells you precisely what the run could not
deliver. A short chapter additionally gets one bounded expansion round over its
two shortest scenes, then is measured once more.

Word counts are **unique** words — duplicate sentences are removed first. A model
stuck in a loop produces more words, not fewer, so a raw count would reward the
worst failure the gate can see.

## How it differs from Arc mode

- No volume or chapter-count steppers — chapter mode generates exactly one chapter.
- The run is budgeted as one chapter of N scenes. Arc mode's old "single chapter"
  shortcut budgeted for a *single scene* and truncated the plan to one, which is
  what this tab replaces.
- Continuation ("Continue drafting" / "Extend story") stays on the Arc tab: those
  are whole-manuscript operations.
- Each chapter run is its own checkpoint on the project. A chapter run and an arc
  run are alternatives, not concurrent peers.

## Continuity across chapters

Generating chapter N+1 does not start from nothing. Before planning, the run
rolls up the digests of everything already written, so the new chapter's brief
carries the previous chapters' events, the compressed story spine, and the fact
ledger the continuity auditor reads. Entities are scoped to the volume being
written plus anyone the new plan intends to cast.

## Expectations

Local generation on the reference machine runs at roughly 5 tokens/second. A
4-scene chapter at 1,200 words a scene is tens of minutes, not seconds. The
estimate in the form is the number to plan around, and the run resumes if it is
interrupted.
