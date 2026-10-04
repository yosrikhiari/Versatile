// Computed-style snapshot of the main screens, for diffing a Tailwind upgrade.
//   node tools/style-snap/snap.mjs <label>   (dev server on :5175; BASE=http://localhost:PORT to change)
// Writes reports/tw-snap/<label>/<state>.json: { elementPath: { prop: value } }.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'

const label = process.argv[2] || 'run'
const BASE = process.env.BASE || 'http://localhost:5175'
const OUT = `reports/tw-snap/${label}`
mkdirSync(OUT, { recursive: true })

const PROPS = [
  'display', 'position', 'color', 'background-color', 'background-image',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-bottom-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-transform', 'text-decoration-line', 'opacity', 'gap', 'row-gap', 'column-gap',
  'width', 'height', 'cursor', 'transform', 'backdrop-filter', 'filter',
  'transition-property', 'transition-timing-function', 'z-index', 'overflow-x', 'overflow-y',
  'flex-shrink', 'flex-grow', 'align-items', 'justify-content', 'white-space', 'visibility',
  'fill', 'stroke', 'placeholder-color', 'translate', 'scale', 'rotate'
]

async function snap(page, state) {
  await page.waitForTimeout(900)
  const data = await page.evaluate((props) => {
    const pathOf = (el) => {
      const parts = []
      while (el && el.nodeType === 1 && el !== document.documentElement) {
        const tag = el.tagName.toLowerCase()
        let i = 1
        let s = el
        while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++
        parts.unshift(`${tag}:${i}`)
        el = el.parentElement
      }
      return parts.join('>')
    }
    const out = {}
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('script,style,noscript')) continue
      const cs = getComputedStyle(el)
      const row = {}
      for (const p of props) {
        if (p === 'placeholder-color') {
          if (el.matches('input,textarea')) row[p] = getComputedStyle(el, '::placeholder').color
          continue
        }
        row[p] = cs.getPropertyValue(p)
      }
      const r = el.getBoundingClientRect()
      row._rect = [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2).join(',')
      row._cls = (el.getAttribute('class') || '').slice(0, 200)
      out[pathOf(el)] = row
    }
    return out
  }, PROPS)
  writeFileSync(`${OUT}/${state}.json`, JSON.stringify(data))
  console.log(`${state}: ${Object.keys(data).length} elements`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
// Freeze motion so a mid-animation frame is not read as a difference.
await page.addInitScript(() => {
  const s = document.createElement('style')
  s.textContent =
    '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}'
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
})
const panelNav = () => page.locator('nav[aria-label="Panels"]')

await page.goto(`${BASE}/login`)
await page.waitForSelector('#login-username')
await snap(page, 'login')
await page.fill('#login-username', 'test')
await page.fill('#login-password', 'test123')
await page.click('button[type="submit"]')
await page.waitForURL(/\/workspace$/)
await snap(page, 'workspace-empty')

await page.getByRole('button', { name: 'Open the sample story' }).click()
await page.waitForURL(/\/editor\//)
await page.waitForSelector('.ProseMirror')
const editorUrl = page.url()
await snap(page, 'editor')

await panelNav().getByRole('button', { name: 'Generator' }).click()
await page.waitForSelector('[data-test="generator-modes"]')
await snap(page, 'generator-scene')
await page.locator('[data-test="generator-more"]').click()
await snap(page, 'generator-more-open')
await page.locator('[data-test="generator-more-brainstorm"]').click()
await snap(page, 'generator-ideate')

await panelNav().getByRole('button', { name: 'Chapters' }).click()
await snap(page, 'chapters')
await panelNav().getByRole('button', { name: 'Story Bible' }).click()
await snap(page, 'story-bible')
await panelNav().getByRole('button', { name: 'Consistency' }).click()
await snap(page, 'consistency')

await page.evaluate(() => localStorage.setItem('versatile-theme', 'dark'))
await page.goto(editorUrl)
await page.waitForSelector('.ProseMirror')
await snap(page, 'editor-dark')
await page.evaluate(() => localStorage.setItem('versatile-theme', 'light'))

await page.goto(`${BASE}/workspace`)
await page.getByRole('button', { name: 'New', exact: true }).waitFor()
await snap(page, 'workspace')
await page.getByRole('button', { name: 'New', exact: true }).click()
await page.getByLabel('Project name').waitFor()
await snap(page, 'new-project')

await browser.close()
