import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, resolve } from 'path'

const patterns = [
  {
    regex: /bg-accent text-white/g,
    desc: 'bg-accent text-white should be bg-accent text-accent-foreground'
  },
  {
    regex: /font-spark|font-flow|font-polish|font-revise|font-storybible/g,
    desc: 'retired display font class'
  }
]

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') files.push(...walk(full))
    } else if (extname(full) === '.vue') {
      files.push(full)
    }
  }
  return files
}

let exitCode = 0
const root = resolve(import.meta.dirname, '..')
const files = walk(join(root, 'src'))

for (const file of files) {
  const content = readFileSync(file, 'utf-8')
  for (const { regex, desc } of patterns) {
    let match
    while ((match = regex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length
      console.error(`${file}:${line}: ${desc} (found "${match[0]}")`)
      exitCode = 1
    }
  }
}

if (exitCode === 0) console.log('OK: No token violations')
process.exit(exitCode)
