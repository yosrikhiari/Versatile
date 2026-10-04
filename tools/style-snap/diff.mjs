// node tools/style-snap/diff.mjs <a> <b> [--examples N]   (reads reports/tw-snap/<a> and <b>)
// Compares two snapshot runs state by state, element by element.
import { readFileSync, readdirSync, writeFileSync } from 'fs'

const [a, b] = process.argv.slice(2)
const N = Number(process.argv[process.argv.indexOf('--examples') + 1]) || 4
const dirA = `reports/tw-snap/${a}`
const dirB = `reports/tw-snap/${b}`
const byProp = {}
const report = []
let missing = 0
for (const file of readdirSync(dirA).filter((f) => f.endsWith('.json'))) {
  const A = JSON.parse(readFileSync(`${dirA}/${file}`, 'utf8'))
  let B
  try {
    B = JSON.parse(readFileSync(`${dirB}/${file}`, 'utf8'))
  } catch {
    report.push(`${file}: missing in ${b}`)
    continue
  }
  const onlyA = Object.keys(A).filter((k) => !(k in B))
  const onlyB = Object.keys(B).filter((k) => !(k in A))
  missing += onlyA.length + onlyB.length
  if (onlyA.length || onlyB.length)
    report.push(`${file}: ${onlyA.length} elements only in ${a}, ${onlyB.length} only in ${b}`)
  for (const key of Object.keys(A)) {
    if (!(key in B)) continue
    for (const p of Object.keys(A[key])) {
      if (p === '_cls') continue
      if (p === 'transform' || p === 'translate') continue // compared through _rect
      if (A[key][p] !== B[key][p]) {
        const bucket = (byProp[p] ??= { n: 0, ex: [] })
        bucket.n++
        if (bucket.ex.length < N)
          bucket.ex.push(`${file} ${A[key]._cls.slice(0, 90)} :: ${A[key][p]} -> ${B[key][p]}`)
      }
    }
  }
}
const lines = [...report, `structural differences: ${missing}`]
for (const [p, v] of Object.entries(byProp).sort((x, y) => y[1].n - x[1].n)) {
  lines.push(`\n${p}: ${v.n}`)
  for (const e of v.ex) lines.push(`   ${e}`)
}
writeFileSync(`reports/tw-snap/diff-${a}-${b}.txt`, lines.join('\n'))
console.log(lines.join('\n'))
