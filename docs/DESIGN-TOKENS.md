# Design Tokens — Versatile

> **Manuscript Mono v3.** A near-monochrome neutral foundation with a single cool
> slate-blue accent. All tokens are CSS custom properties defined in
> [`src/style.css`](../src/style.css) under `@layer base`, and consumed either
> directly (`var(--vers-*)`) or through the Tailwind semantic aliases in
> [`tailwind.config.js`](../tailwind.config.js).

Two themes are defined: the default **dark** theme on `:root`, and a warm
cream/paper **light** theme under `[data-theme='light']` (toggled by the
`useTheme` composable, persisted to `localStorage`, flash-prevented by an inline
script in `index.html`). A `@media (prefers-contrast: more)` block lifts the dim
text/border tiers for high-contrast users.

---

## Surfaces (backgrounds)

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--vers-bg-base` | `#121214` | `#f7f5f0` | Canvas / manuscript surface (darkest) |
| `--vers-bg-panel` | `#1a1a1d` | `#efede5` | Sidebar, header, side panels |
| `--vers-bg-canvas` | `#121214` | `#faf8f4` | Writing column |
| `--vers-bg-hover` | `#222226` | `#e6e3db` | Hover wells |
| `--vers-bg-elevated` | `#26262b` | `#ffffff` | Dropdowns, modals |

## Borders

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--vers-border-subtle` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.07)` | Hairline dividers |
| `--vers-border` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.12)` | Standard border |
| `--vers-border-focus` | `#6e8bb5` | `#6e8bb5` | Focus ring |

## Text

| Token | Dark | Light | Min contrast on bg-base | Usage |
|-------|------|-------|-------------------------|-------|
| `--vers-text-primary` | `#e6e6e2` | `#1c1c1a` | 14.95 / 15.66 | Body & headings |
| `--vers-text-secondary` | `#a2a29b` | `#5a5a55` | 7.29 / 6.36 | Secondary copy |
| `--vers-text-muted` | `#82827a` | `#70706a` | 4.83 / 4.57 (AA) | Hints, labels |
| `--vers-text-faint` | `#44443e` | `#bbbbb0` | decorative | **Never** body text |
| `--vers-text-on-accent` | `#ffffff` | `#ffffff` | — | Text on accent fills |

> Contrast ratios verified for WCAG 2.2 AA (≥ 4.5:1 for text). `text-faint` is
> decorative only (dividers, watermark-level hints) and is intentionally below the
> body-text threshold — do not use it for readable content. See M-2.3.

## Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--vers-accent-primary` | `#6e8bb5` | Cool slate-blue, used sparingly (5.37:1 on dark) |
| `--vers-accent-primary-rgb` | `110, 139, 181` | For `rgba()` composition |
| `--vers-accent-secondary` | `#4f6e96` (dark) / `#5a7a9e` (light) | Secondary accent |
| `--vers-glow-loading-rgb` | `110, 139, 181` | Loading glow |
| `--vers-accent-hover` | `rgb(var(--vers-accent-hover-rgb))` | Hover state of accent fills; composed from its `-rgb` twin |

## Semantic status (eval / feedback)

| Token | Dark | Light |
|-------|------|-------|
| `--vers-status-success` | `#6a9e7a` | `#4a8a5a` |
| `--vers-status-danger` | `#d07070` | `#c05050` |
| `--vers-status-warning` | `#d4a74a` | `#b89230` |
| `--vers-status-info` | `#5b8cb8` | `#42729c` (AA on light) |

## Graph & canvas (JS-assigned)

These are applied via inline styles in graph/canvas code and work in both themes.

- **Entity types:** `--vers-entity-character`, `--vers-entity-location`, `--vers-entity-plotThread`
- **Element cards:** `--vers-element-section|character|location|plotpoint|note`
- **Timeline status:** `--vers-status-open|in_progress|resolved|closed`
- **Graph edges:** `--vers-edge-appears_in|involved_in|located_at|intersects_with|features|connects_to|ally|enemy|family|romantic|mentor|rival|neutral`
- **Fallbacks:** `--vers-default-fallback|edge|other`

## Composition twins (`*-rgb`)

Every colour token that is ever used with an alpha has an `-rgb` twin holding the bare
channels, so translucency is written as `rgb(var(--vers-x-rgb) / 0.3)` instead of a second
hard-coded colour. Twins exist for: `--vers-bg-base|panel|canvas|hover|elevated-rgb`,
`--vers-text-primary-rgb`, `--vers-text-secondary-rgb`, `--vers-text-muted-rgb`,
`--vers-text-faint-rgb`, `--vers-text-on-accent-rgb`,
`--vers-accent-primary|secondary|hover-rgb`, `--vers-glow-loading-rgb`,
`--vers-entity-character|location-rgb`, and
`--vers-status-open|in_progress|resolved|closed|success|danger|warning|info-rgb`.
Add a twin whenever you add a colour that will be tinted; never write `rgba(110, 139, 181, ...)`
by hand.

## Heat scale (writing heatmap)

Five steps for the workspace's writing heatmap (`WritingHeatmap.vue`), from "no words" to
"most words that month". Step 0 is a translucent well so it reads on either theme.

| Token | Dark | Light |
|-------|------|-------|
| `--vers-heat-0` | `rgba(255,255,255,0.045)` | `rgba(0,0,0,0.05)` |
| `--vers-heat-1` | `#3a4c62` | `#98afcc` |
| `--vers-heat-2` | `#4e6683` | `#7c97bd` |
| `--vers-heat-3` | `#6280a3` | `#6180a7` |
| `--vers-heat-4` | `#7799c4` | `#476690` |

---

## Tailwind aliases

`tailwind.config.js` maps the tokens to utility-class colors. Prefer these in
markup; drop to `var(--vers-*)` only for JS-assigned or non-color use.

| Tailwind class | Token |
|----------------|-------|
| `bg-primary` | `--vers-bg-base` |
| `bg-secondary` | `--vers-bg-panel` |
| `bg-tertiary` | `--vers-bg-canvas` |
| `surface-hover` | `--vers-bg-hover` |
| `border-subtle` | `--vers-border-subtle` |
| `text-primary` | `--vers-text-primary` |
| `text-secondary` | `--vers-text-secondary` |
| `text-hint` | `--vers-text-muted` |
| `accent` | `--vers-accent-primary` |
| `danger` / `success` / `warning` | `--vers-status-*` |

## Typography (font families)

Defined in `tailwind.config.js` (`fontFamily`). Loaded non-blocking via
`<link>` in `index.html` (M-5.2).

| Class | Stack | Role |
|-------|-------|------|
| `font-ui` | Geist Variable | UI chrome: every label, button, panel |
| `font-mono` | Geist Mono | Code / numerics in the UI |
| *(none: `.manuscript` rules in `style.css`)* | IBM Plex Mono | The manuscript editor. Not a Tailwind class: the editor is styled directly so its typography cannot be overridden by a utility |
| `font-body` | Crimson Pro | Legacy alias; not the manuscript font |
| `font-storybible` | Merriweather | Story bible |

**Retired** (0 usages in `src/`, forbidden by `npm run lint:tokens`, still defined in
`tailwind.config.js` until removed): `font-spark`, `font-flow`, `font-polish`, `font-revise`,
`font-display`. Do not reintroduce a per-mode display font; the modes differ by tooling,
not by typeface.

## Motion

Durations & easings are centralized in the `useAnimations` composable
([`src/composables/useAnimations.ts`](../src/composables/useAnimations.ts)) and
mirrored as Tailwind `transitionDuration` / `transitionTimingFunction` entries.
Named `<Transition>` presets: `anim-fade`, `anim-fade-up`, `anim-fade-down`,
`anim-scale`, `anim-slide-left`, `anim-slide-right` — all reduced-motion aware.

---

## Components that consume the tokens

Panels are assembled from `src/components/ui/` — `BasePanelHeader`, `BaseSection`,
`BaseButton`, `BaseChip`, `BaseField`, `BasePopover`, `BaseSegmented`, `BaseStepper`,
`BaseSwitch`, `BaseTab`, `BaseAlert`, `BaseSpinner`, `BaseStatusDot`, `BaseCheckbox`,
`BaseRadio`. They are the only place a token should be turned into a panel-level
pattern; a feature component composes them rather than restyling. The panel grammar
and the **primitives catalogue** (every prop, slot and event, with the story that shows it)
are in `DESIGN.md` → Components. Every primitive has a story (`npm run storybook`,
`UI/*`); Chromatic snapshots them on every push, and `npm run policy` fails if a
`Base*.vue` is added without one.

Note: Tailwind 3.4's opacity modifier scale does not include `/8`, `/12` or `/35`;
those classes compile to nothing. Use `/10` and `/30`.

## Adding or changing a token

1. Add the property to **both** `:root` and `[data-theme='light']` in `src/style.css`.
2. If it is a text/background color, verify **≥ 4.5:1** contrast (see M-2.3) in both themes.
3. Expose a Tailwind alias in `tailwind.config.js` if it will be used in markup.
4. Add the `-rgb` twin if the colour will ever be tinted.
5. Update this document: `npm run policy` fails the build if a `--vers-*` token in
   `style.css` is missing from it.
