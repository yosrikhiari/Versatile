# Design Tokens — Versatile

> **Typescript v4** (direction C of [`DESIGN-DIRECTIONS.html`](DESIGN-DIRECTIONS.html)).
> Bone paper by default, charcoal in dark, ink rules instead of shadows, one cool
> signal colour (cobalt). All tokens are CSS custom properties defined in
> [`src/style.css`](../src/style.css) under `@layer base`, and consumed either
> directly (`var(--vers-*)`) or through the Tailwind semantic aliases in
> [`tailwind.config.js`](../tailwind.config.js). Values were generated from OKLCH
> and AA-checked by the script that produced them (`scripts/` is not involved at
> runtime; the checks are recorded here).

Two themes are defined: the default **light** theme on `:root`, and the charcoal
**dark** theme under `[data-theme='dark']` (toggled by the `useTheme` composable,
persisted to `localStorage`, flash-prevented by an inline script in `index.html`).
A `@media (prefers-contrast: more)` block lifts the dim text/border tiers for
high-contrast users.

---

## Surfaces (backgrounds)

| Token | Light | Dark | Usage |
| `--vers-bg-base` | `#f7f5f1` | `#141414` | The page: manuscript surface and app canvas |
| `--vers-bg-panel` | `#eeede8` | `#0d0d0d` | Sidebar, header, docked panels (one step down from the page) |
| `--vers-bg-canvas` | `#f7f5f1` | `#141414` | Writing column = the page |
| `--vers-bg-hover` | `#e5e3de` | `#1d1d1d` | Hover wells |
| `--vers-bg-elevated` | `#fefdfb` | `#1f1f1f` | Dropdowns, modals, inputs |

## Borders

| Token | Light | Dark | Usage |
| `--vers-border-subtle` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Hairline dividers |
| `--vers-border` | `rgba(0,0,0,0.14)` | `rgba(255,255,255,0.14)` | Standard border: inputs, chips, list edges |
| `--vers-border-strong` | `= text-primary` | `= text-primary` | **Ink rule**: modals, the continue card, the manuscript margin. Structure without shadows |
| `--vers-border-focus` | `#1251cc` | `#83b0ff` | Focus ring (= accent) |

## Text

| Token | Light | Dark | Contrast on bg-base (light / dark) | Usage |
| `--vers-text-primary` | `#121212` | `#e1e1e1` | 17.2 / 14.1 | Body & headings; also the ink rule |
| `--vers-text-secondary` | `#484845` | `#9e9e9e` | 8.4 / 6.9 | Secondary copy |
| `--vers-text-muted` | `#5c5b58` | `#838383` | 6.2 / 4.9 (AA) | Hints, labels |
| `--vers-text-faint` | `#b8b7b4` | `#3d3d3d` | decorative | **Never** body text |
| `--vers-text-on-accent` | `#ffffff` | `#040915` | 6.8 / 9.1 | Text on accent fills (white on light cobalt, near-black on dark cobalt) |

> Contrast ratios verified for WCAG 2.2 AA (≥ 4.5:1 for text). `text-faint` is
> decorative only (dividers, watermark-level hints) and is intentionally below the
> body-text threshold — do not use it for readable content. See M-2.3.

## Accent

| Token | Value | Usage |
| `--vers-accent-primary` | `#1251cc` light / `#83b0ff` dark | Cobalt, the one signal colour: caret, active line, links, primary action (6.3:1 / 8.4:1 on bg-base, so it works as text) |
| `--vers-accent-primary-rgb` | `18, 81, 204` / `131, 176, 255` | For `rgba()` composition |
| `--vers-accent-secondary` | `#0a41ad` / `#6b97e8` | Pressed / deep variant |
| `--vers-accent-hover` | `#0a41ad` / `#99c4ff` | Hover of accent fills (darkens on light, lifts on dark) |
| `--vers-glow-loading-rgb` | `= accent rgb` | Loading glow |

## Semantic status (eval / feedback)

| Token | Light | Dark |
| `--vers-status-success` | `#21763c` | `#6fc082` |
| `--vers-status-danger` | `#b32228` | `#f97770` |
| `--vers-status-warning` | `#ae6800` | `#e9b452` |
| `--vers-status-info` | `#1251cc` (= accent) | `#83b0ff` (= accent) |

## Graph & canvas (JS-assigned)

These are applied via inline styles in graph/canvas code and work in both themes. Character and `appears_in` follow the accent (cobalt); location is green, plot thread amber; the remaining edge and element colours keep the desaturated family.

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
| `--vers-heat-0` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.05)` |
| `--vers-heat-1` | `#bcd2f9` | `#273857` |
| `--vers-heat-2` | `#8eb1f1` | `#385790` |
| `--vers-heat-3` | `#5889e6` | `#547ecd` |
| `--vers-heat-4` | `#1957d2` | `#83b0ff` |

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
`<link>` in `index.html` (M-5.2). Two voices: **Plex Mono names, Geist explains.**

| Class | Stack | Role |
|-------|-------|------|
| `font-ui` | Geist Variable | Running UI copy: descriptions, rows, buttons, hints |
| `font-mono` / `font-display` / `font-manuscript` | IBM Plex Mono | The manuscript, every count/id/time, and the display voice |
| `.type-display` (style.css) | IBM Plex Mono 500, uppercase, .14 em | Panel and section titles, empty-state titles, the workspace heading, modal titles |
| `.label-micro` (style.css) | IBM Plex Mono 500, 11 px, uppercase, .14 em | Field labels |
| `font-body` | Crimson Pro | Legacy alias; unused by the system |
| `font-storybible` | Merriweather | Story bible |

**Retired** (0 usages in `src/`, forbidden by `npm run lint:tokens`, still defined in
`tailwind.config.js` until removed): `font-spark`, `font-flow`, `font-polish`, `font-revise`.
`font-display` now points at Plex Mono and is live again.

## Shape & depth

`tailwind.config.js` collapses the radius scale so no component changes: `rounded`/`sm`/`md` = 2 px,
`lg`/`xl` = 3 px, `2xl`/`3xl` = 4 px, `full` stays round (status dots, avatars). The
`shadow-warm-sm/md` utilities compile to a 1 px `--vers-border` rule and `shadow-warm-lg/xl` to a
1.5 px `--vers-border-strong` rule: **depth is a rule, never a shadow.**

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
