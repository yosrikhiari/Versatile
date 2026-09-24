# Judge probes (docs §19)

Direct-to-Ollama probes behind the focused gate's input-isolation change. They share
the 4 scenes × 5 variants of `gateSensitivity.live.js` (ported to Python in
`geval_probe_lib.py`). Each takes one argument: a working directory holding the
previous stage's JSON (the committed runs are in `reports/live/judge-probes/`).

    python tools/geval-probe.py <dir>/geval.json              # stage 1: focused scores + logprob expected score
    python tools/judge-probes/verify_probe.py <dir>            # stage 2: failing dims must quote a passage
    python tools/judge-probes/classify_probe.py <dir>          # stage 3: which aspect does each passage fail
    python tools/judge-probes/isolate_probe.py <dir>           # input isolation: voice from dialogue, pacing per paragraph

The scripts import `geval_probe_lib.py` / `verify_lib.py` from `<dir>`, so copy those two
files there first. Run from the repo root (they read `reports/live/critic-rank-agreement/corpus.json`).
