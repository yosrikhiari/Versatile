import json, sys
d = json.load(open(sys.argv[1]))
rows = d["rows"]
key = {(r["scene"], r["defect"], r["dim"]): r for r in rows}
scenes = sorted({r["scene"] for r in rows})
print("minutes", d["minutes"], "calls", len(rows))


def auc(pos, neg):
    # P(defect score < control score), ties count half
    n = 0
    for p in pos:
        for q in neg:
            n += 1 if p < q else 0.5 if p == q else 0
    return n / (len(pos) * len(neg))


print("\nper target dimension: control vs defect on the TARGET dim")
allpos = {"score": [], "ev": []}
allneg = {"score": [], "ev": []}
for defect, dim in [("voice_flatten", "voice"), ("told_not_shown", "show_tell"), ("padding", "pacing"), ("contradiction", "continuity")]:
    for m in ["score", "ev"]:
        pos = [key[(s, defect, dim)][m] for s in scenes]
        neg = [key[(s, "control", dim)][m] for s in scenes]
        allpos[m] += pos; allneg[m] += neg
        paired = sum(p - q for p, q in zip(pos, neg)) / len(pos)
        print(f"  {defect:15s} {dim:10s} {m:5s} ctrl={[round(x,2) for x in neg]} defect={[round(x,2) for x in pos]} mean diff={paired:+.2f} AUC={auc(pos,neg):.2f}")
for m in ["score", "ev"]:
    print(f"POOLED {m}: AUC={auc(allpos[m], allneg[m]):.3f}")

print("\nclean-prose false fails (any dim below threshold) — integer<7 vs EV<t")
ctrl = [r for r in rows if r["defect"] == "control"]
for s in scenes:
    c = [r for r in ctrl if r["scene"] == s]
    print(s, {r["dim"]: (r["score"], round(r["ev"], 2)) for r in c})


def gate(scene, defect, m, t):
    return all(key[(scene, defect, dim)][m] >= t for dim in ["continuity", "voice", "emotional_goal", "show_tell", "pacing"])


print("\nscene-level gate (weakest dimension), pass counts out of 4:")
for m, ts in [("score", [7]), ("ev", [6.5, 6.8, 6.9, 7.0])]:
    for t in ts:
        res = {df: sum(gate(s, df, m, t) for s in scenes) for df in ["control", "voice_flatten", "told_not_shown", "padding", "contradiction"]}
        print(f"  {m}>={t}: {res}")

print("\nwhere the weakest dim landed per defect (EV):")
for df in ["voice_flatten", "told_not_shown", "padding", "contradiction"]:
    out = []
    for s in scenes:
        rs = {r["dim"]: r["ev"] for r in rows if r["scene"] == s and r["defect"] == df}
        out.append(min(rs, key=rs.get))
    print(" ", df, out)
