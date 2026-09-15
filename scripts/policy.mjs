/**
 * Executable policies: the rules in AGENTS.md / DESIGN.md that can be checked mechanically.
 * Runs in the CI `lint` job and locally as `npm run policy`. Each check names the rule it
 * enforces; a rule that cannot be checked here lives in the doc with the word "review".
 *
 *   1. Every --vers-* token in src/style.css is documented in docs/DESIGN-TOKENS.md.
 *   2. Every src/components/ui/Base*.vue has a Base*.stories.js (Storybook + Chromatic).
 *   3. Hex colour literals in src/components/**.vue never grow (ratchet against
 *      scripts/policy-hex-baseline.json); a new component starts at zero.
 *   3b. Headings (h1-h4) are .type-display, never Geist bold (Typescript type voice).
 *   3c. Pills, resting shadows and hard-coded radii ratchet against scripts/policy-shape-baseline.json.
 *   3d. `any` in src/**.ts and .vue never grows per file (ratchet against scripts/policy-any-baseline.json).
 *   4. AGENTS.md is the one agent instruction file; every per-tool file points at it.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf-8')
const failures = []
const fail = (rule, msg) => failures.push(`[${rule}] ${msg}`)

function walk(dir, ext) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') out.push(...walk(full, ext))
    } else if (full.endsWith(ext)) out.push(full)
  }
  return out
}

// ---- 1. tokens documented -------------------------------------------------------------
{
  const css = read('src/style.css')
  const doc = read('docs/DESIGN-TOKENS.md')
  const defined = [
    ...new Set([...css.matchAll(/(--vers-[a-z0-9_-]+)\s*:/g)].map((m) => m[1]))
  ].sort()
  const covered = new Set([...doc.matchAll(/--vers-[a-z0-9_-]+/g)].map((m) => m[0]))
  // the doc may list families in shorthand: `--vers-edge-ally|enemy|family` or
  // `--vers-status-open|in_progress-rgb`; expand those into every member.
  for (const m of doc.matchAll(/`(--vers-[a-z0-9_-]+?)-([a-z0-9_]+(?:\|[a-z0-9_]+)+)(-rgb)?`/g)) {
    for (const part of m[2].split('|')) covered.add(`${m[1]}-${part}${m[3] ?? ''}`)
  }
  const missing = defined.filter((t) => !covered.has(t))
  if (missing.length)
    fail(
      'tokens-documented',
      `defined in src/style.css but absent from docs/DESIGN-TOKENS.md: ${missing.join(', ')}`
    )
  if (defined.length < 40)
    fail(
      'tokens-documented',
      `only ${defined.length} tokens found; the scan is broken, not the stylesheet`
    )
}

// ---- 2. primitives have stories --------------------------------------------------------
{
  const dir = join(root, 'src/components/ui')
  const primitives = readdirSync(dir).filter((f) => /^Base[A-Za-z]+\.vue$/.test(f))
  const missing = primitives.filter(
    (f) => !existsSync(join(dir, f.replace(/\.vue$/, '.stories.js')))
  )
  if (missing.length)
    fail(
      'primitives-have-stories',
      `no story for: ${missing.join(', ')} (add src/components/ui/<Name>.stories.js)`
    )
  if (primitives.length < 10)
    fail(
      'primitives-have-stories',
      `only ${primitives.length} primitives found; the scan is broken`
    )
}

// ---- 3. hex ratchet ------------------------------------------------------------------
{
  const baselinePath = join(root, 'scripts/policy-hex-baseline.json')
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf-8')) : {}
  const counts = {}
  for (const file of walk(join(root, 'src/components'), '.vue')) {
    const n = (readFileSync(file, 'utf-8').match(/#[0-9a-fA-F]{6}\b/g) || []).length
    if (n) counts[relative(root, file).replace(/\\/g, '/')] = n
  }
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0
    if (n > allowed)
      fail(
        'hex-ratchet',
        `${file}: ${n} hex colour literal(s), baseline allows ${allowed}. Use a --vers-* token (docs/DESIGN-TOKENS.md).`
      )
  }
  const tightened = Object.entries(baseline).filter(([f, n]) => (counts[f] ?? 0) < n)
  if (
    process.argv.includes('--update-baseline') &&
    (tightened.length || !existsSync(baselinePath))
  ) {
    writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n')
    console.log(`hex baseline tightened for ${tightened.length} file(s)`)
  } else if (tightened.length) {
    console.log(
      `note: ${tightened.length} file(s) now below their hex baseline; run "npm run policy -- --update-baseline" to lock the gain in`
    )
  }
}

// ---- 3b. Typescript type voice: headings are .type-display, never Geist bold ------------
{
  const bad = []
  const re = /<h[1-4]\b[^>]*\bclass="([^"]*)"/g
  for (const file of walk(join(root, 'src/components'), '.vue').concat(
    walk(join(root, 'src/views'), '.vue')
  )) {
    const src = readFileSync(file, 'utf-8')
    for (const m of src.matchAll(re)) {
      if (/\bfont-(semibold|bold)\b/.test(m[1]) && !/\btype-display\b/.test(m[1]))
        bad.push(
          relative(root, file).replace(/\\/g, '/') + ': <h class="' + m[1].slice(0, 60) + '"'
        )
    }
  }
  if (bad.length)
    fail(
      'type-voice',
      'headings set in Geist bold instead of .type-display (DESIGN.md, Typography):\n  ' +
        bad.join('\n  ')
    )
}

// ---- 3c. Typescript shape & depth ratchet: pills, resting shadows, hard radii may only fall
{
  const baselinePath = join(root, 'scripts/policy-shape-baseline.json')
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf-8')) : {}
  // a dot or an avatar may stay round: equal small width/height, an image, or an initials badge
  const dot =
    /\b(?:w-(1|1\.5|2|2\.5|3|5|6|8)\b[^\n]*\bh-\1\b|h-(1|1\.5|2|2\.5|3|5|6|8)\b[^\n]*\bw-\2\b)|object-cover|place-items-center/
  const counts = {}
  for (const file of walk(join(root, 'src'), '.vue')) {
    const base = file.split(/[\\/]/).pop()
    if (base === 'BaseChip.vue' || base === 'BaseStatusDot.vue') continue
    let n = 0
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      if (line.includes('rounded-full') && !dot.test(line)) n++
      if (/\bshadow-(sm|md|lg|xl|2xl)\b/.test(line)) n++
      if (/box-shadow:\s*0\s+\d/.test(line) && !/var\(--vers-border/.test(line)) n++
      if (/border-radius:\s*(6|8|10|12|14|16|20|24)px/.test(line)) n++
    }
    if (n) counts[relative(root, file).replace(/\\/g, '/')] = n
  }
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0
    if (n > allowed)
      fail(
        'shape-ratchet',
        `${file}: ${n} pill/shadow/radius escape(s), baseline allows ${allowed}. Corners are 2-3 px, depth is a rule (DESIGN.md: Shapes, Elevation).`
      )
  }
  const tightened = Object.entries(baseline).filter(([f, n]) => (counts[f] ?? 0) < n)
  if (
    process.argv.includes('--update-baseline') &&
    (tightened.length || !existsSync(baselinePath))
  ) {
    writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n')
    console.log(`shape baseline written (${Object.keys(counts).length} file(s) with escapes)`)
  } else if (tightened.length) {
    console.log(
      `note: ${tightened.length} file(s) now below their shape baseline; run "npm run policy -- --update-baseline" to lock the gain in`
    )
  }
}

// ---- 3d. any ratchet: the type debt may only fall -----------------------------------------
{
  const baselinePath = join(root, 'scripts/policy-any-baseline.json')
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf-8')) : {}
  const counts = {}
  const files = walk(join(root, 'src'), '.ts').concat(walk(join(root, 'src'), '.vue'))
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/')
    if (rel.startsWith('src/tests/') || rel.endsWith('.d.ts')) continue
    const n = (readFileSync(file, 'utf-8').match(/(?::\s*any\b|\bas any\b|<any>)/g) || []).length
    if (n) counts[rel] = n
  }
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0
    if (n > allowed)
      fail(
        'any-ratchet',
        `${file}: ${n} \`any\`(s), baseline allows ${allowed}. Type it (generation payloads live in src/composables/generation/types.ts).`
      )
  }
  const tightened = Object.entries(baseline).filter(([f, n]) => (counts[f] ?? 0) < n)
  if (
    process.argv.includes('--update-baseline') &&
    (tightened.length || !existsSync(baselinePath))
  ) {
    const fresh = !existsSync(baselinePath)
    writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n')
    console.log(
      `any baseline ${fresh ? 'written' : 'tightened'} for ${fresh ? Object.keys(counts).length : tightened.length} file(s)`
    )
  } else if (tightened.length) {
    console.log(
      `note: ${tightened.length} file(s) now below their any baseline; run "npm run policy -- --update-baseline" to lock the gain in`
    )
  }
}

// ---- 4. agent files point at AGENTS.md -------------------------------------------------
{
  const agents = read('AGENTS.md')
  for (const must of ['DESIGN.md', 'docs/DESIGN-TOKENS.md', 'npm run policy', 'AGENT.md'])
    if (!agents.includes(must)) fail('agent-files', `AGENTS.md no longer mentions ${must}`)
  for (const rel of [
    'CLAUDE.md',
    'GEMINI.md',
    'opencode.json',
    '.cursor/rules/agents.mdc',
    '.github/copilot-instructions.md'
  ]) {
    if (!existsSync(join(root, rel))) fail('agent-files', `${rel} is missing`)
    else if (!read(rel).includes('AGENTS.md'))
      fail('agent-files', `${rel} does not point at AGENTS.md`)
  }
  if (existsSync(join(root, 'CLAUDE.md')) && /^## /m.test(read('CLAUDE.md')))
    fail(
      'agent-files',
      'CLAUDE.md has its own sections; it must stay a pointer (@AGENTS.md), not a second rule file'
    )
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`\n${failures.length} policy failure(s)`)
  process.exit(1)
}
console.log('OK: all policies hold')
