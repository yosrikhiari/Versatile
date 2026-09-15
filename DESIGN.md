---
name: Versatile
description: Fiction writing assistant. Design system v4, Typescript (direction C of docs/DESIGN-DIRECTIONS.html)
colors:
  primary: "#1251cc"
  primary-deep: "#0a41ad"
  bg-base-dark: "#141414"
  bg-panel-dark: "#0d0d0d"
  bg-elevated-dark: "#1f1f1f"
  bg-base-light: "#f7f5f1"
  bg-panel-light: "#eeede8"
  bg-elevated-light: "#fefdfb"
  text-primary-dark: "#e1e1e1"
  text-secondary-dark: "#9e9e9e"
  text-muted-dark: "#838383"
  text-primary-light: "#121212"
  text-secondary-light: "#484845"
  text-muted-light: "#5c5b58"
  text-on-accent: "#ffffff"
  border-subtle-dark: "rgba(255,255,255,0.08)"
  border-subtle-light: "rgba(0,0,0,0.08)"
  border-dark: "rgba(255,255,255,0.14)"
  border-light: "rgba(0,0,0,0.14)"
  status-open: "#21763c"
  status-in-progress: "#1251cc"
  status-resolved: "#525864"
  status-closed: "#6a6966"
  status-success: "#21763c"
  status-danger: "#b32228"
  status-warning: "#ae6800"
  status-info: "#1251cc"
  entity-character: "#1251cc"
  entity-location: "#21763c"
  entity-plotThread: "#ae6800"
typography:
  ui:
    fontFamily: "'Geist Variable', Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  manuscript:
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace"
    fontSize: "clamp(16px, 1rem + 0.4vw, 18px)"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "'Geist Variable', Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.025em"
  label-micro:
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  display:
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace"
    fontWeight: 500
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  nav:
    fontFamily: "'Geist Variable', Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.25
  micro:
    fontFamily: "'Geist Variable', Geist, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-accent}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.lg}"
    typography: "{typography.ui}"
    fontWeight: "500"
  button-primary-hover:
    opacity: "0.9"
  button-primary-active:
    opacity: "0.8"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.ui}"
  button-elevated:
    backgroundColor: "{colors.bg-elevated-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.lg}"
    typography: "{typography.ui}"
  glass-panel:
    backgroundColor: "{colors.bg-elevated-dark}"
    rounded: "{rounded.lg}"
    borderColor: "{colors.border-subtle-dark}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.bg-elevated-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.ui}"
  nav-item:
    textColor: "{colors.text-secondary-dark}"
    typography: "{typography.ui}"
  card:
    backgroundColor: "{colors.bg-panel-dark}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
---

# Design System: Versatile

## Overview

**Creative North Star: "The Typescript"**

Versatile is a place to write fiction, and it looks like the thing writers have always written on: a typescript page. Bone paper by default, ink rules instead of shadows, corners barely rounded, and one signal colour, cobalt, that marks the caret, the active line in the margin, links and the primary action. Headings and labels are set in the same monospace as the manuscript, in small capitals with wide tracking: the wordmark's voice, used everywhere. Dark mode is charcoal paper under the same rules, not an inversion.

The interface is still a workbench, and everything the previous system got right stays: tight density, hairline separation, the panel grammar, no glass, no translucency. What changes is that the system now has **figure and ground**: the page is the page, the chrome is chrome, and the accent has work to do.

**Key Characteristics:**
- Light by default: bone paper (#f7f5f1); dark is charcoal (#141414) under `[data-theme='dark']`
- Depth is a rule, never a shadow: hairlines for separation, an **ink rule** (`--vers-border-strong`) for structure
- One accent, cobalt (#1251cc light / #83b0ff dark), on ≤ 5 % of any screen but always on something *live*: the caret, the active nav line, the goal, links
- Display type is the manuscript's own monospace in tracked small caps (`.type-display`, `.label-micro`); UI copy stays in Geist
- The manuscript has a ruled left margin and a cobalt caret; corners are 2–3 px everywhere except status dots and avatars

## Colors

A cool, saturated signal colour on a near-neutral bone/charcoal foundation. Both themes are authored as RGB triplets in `src/style.css` (see `docs/DESIGN-TOKENS.md`); every value below was checked for WCAG AA where it is used as text.

### Primary
- **Cobalt** (#1251cc light / #83b0ff dark): the only accent. Caret, active nav marker, links, focus ring, the primary button, "in progress", character nodes. 6.3:1 on bone, 8.4:1 on charcoal, so it can be *text*, not only a fill.
- **Deep Cobalt** (#0a41ad / #6b97e8): hover and pressed depth.

### Neutral
- **Paper** (#f7f5f1 light / #141414 dark): the page and the app canvas. The manuscript sits on it directly.
- **Panel** (#eeede8 / #0d0d0d): sidebar, header, docked panels; one step down from the page so the page is the brightest surface in light and the panel recedes in dark.
- **Hover** (#e5e3de / #1d1d1d): hover wells.
- **Elevated** (#fefdfb / #1f1f1f): dropdowns, modals, inputs; always with a hairline or an ink rule.
- **Text Primary** (#121212 / #e1e1e1), **Secondary** (#484845 / #9e9e9e), **Muted** (#5c5b58 / #838383): all AA on paper. **Faint** (#b8b7b4 / #3d3d3d) is decorative only.
- **Rules**: hairline `rgba(0,0,0,.08)` / `rgba(255,255,255,.08)`; standard `.14`; **ink rule** = text-primary, 1.5–2 px, for the manuscript margin, modals and cards that must read as objects.

### Semantic
- **Success** (#21763c / #6fc082) · **Danger** (#b32228 / #f97770) · **Warning** (#ae6800 / #e9b452) · **Info** = the accent.

### Plot Thread Lifecycle
- **Open** (#21763c) green · **In Progress** (#1251cc) cobalt · **Resolved** (#525864) steel · **Closed** (#6a6966) stone. The shape of the `BaseStatusDot` carries the meaning; colour only reinforces it.

### Graph Entity Colors
- **Character** (#1251cc): the accent. **Location** (#21763c): green. **Plot Thread** (#ae6800): amber. Edge and canvas-element colours keep the desaturated family in `style.css`; `appears_in` and the character card follow the accent.

### Named Rules
**The Signal Rule.** Cobalt marks what is live or actionable: the caret, the active line, the primary action, a link, progress. It never fills a surface and never decorates. If it is on more than 5 % of the screen, something is wrong.

**The Ink Rule.** Structure is drawn, not cast. A modal, a continue card, the manuscript margin: 1.5–2 px of `--vers-border-strong`. No `box-shadow` communicates hierarchy; the `shadow-warm-*` utilities now compile to rules so old call-sites need no change.

**The Paper Rule.** Light is the default and the reference: design on bone, then check charcoal. Neutrals are near-zero chroma with a faint warm cast (hue 90) on light only.

## Typography

**UI Font:** Geist Variable, Geist, system-ui, sans-serif
**Manuscript & Display Font:** IBM Plex Mono, JetBrains Mono, monospace

**Character:** the manuscript's monospace is also the system's display voice. Titles, panel headers, section headings, the workspace heading and every field label are Plex Mono, medium, uppercase, tracked at .14 em, at 11–16 px. Running UI copy (descriptions, rows, buttons, hints) stays in Geist so the page never reads as a terminal: mono names things, Geist explains them.

### Hierarchy
- **Display** (`.type-display`: Plex Mono 500, uppercase, .14 em): panel titles (`BasePanelHeader`, 11 px), section titles (`BaseSection`, 11 px), empty-state titles (12 px), the workspace heading and modal titles (14–16 px), the wordmark (24 px, .3 em).
- **Micro-label** (`.label-micro`: Plex Mono 500, 11 px, uppercase, .14 em): field labels. Names a thing; never a decorative eyebrow.
- **UI** (Geist 400, 14 px, 1.5): interface copy. **UI Small** (Geist 500, 12 px): button labels, badges, meta. **Nav item** (Geist 400, 13 px).
- **Manuscript** (Plex Mono 400, clamp(16–18 px), 1.75, 66ch, ruled left margin, cobalt caret).
- **Mono values** (`font-mono` = Plex Mono): counts, ids, times.

### Named Rules
**The Two-Voice Rule.** Plex Mono in caps names; Geist in sentence case explains. A heading is never Geist bold; body copy is never mono. Enforced: `npm run policy` (type-voice) fails on any `<h1>`-`<h4>` with `font-semibold`/`font-bold` and no `.type-display`.

**The Tracking Rule.** Tracked caps below 11 px are illegible; `.label-micro` and `.type-display` never go smaller, and they never carry more than a few words.

## Layout

The app occupies full viewport height with `overflow: hidden`. The shell is a fixed sidebar plus a main area; tool panels dock to the right, capped at `calc(100vw - 32rem)` so the manuscript never collapses.

- **Manuscript editor**: max-width 66ch, centered, on the page directly, with a 2 px ink rule on its left edge and 1.5 rem of margin, like a typescript.
- **Sidebar**: fixed-width, panel surface; the active item is marked by a cobalt `>` in the margin and cobalt text, no fill (collapsed rail keeps a tint).
- **Panels**: `BasePanelHeader` + `BaseSection`s, hairline-separated.
- **Modals**: elevated surface, 2 px corners, an ink rule instead of a shadow.
- **Density**: unchanged, tight. **Touch**: 44×44 on coarse pointers.

## Elevation & Depth

**Rules, not shadows.** Three surfaces (paper, panel, elevated) plus two rule weights:
- **Hairline** (`--vers-border-subtle`, 8 %): separation inside a panel.
- **Standard** (`--vers-border`, 14 %): inputs, chips, list edges.
- **Ink rule** (`--vers-border-strong` = text-primary): modals, the continue card, the manuscript margin, anything that must read as a placed object.

`shadow-warm-sm/md` compile to a 1 px standard rule and `shadow-warm-lg/xl` to a 1.5 px ink rule, so existing components keep working. `liquid-glass` is a standard rule that turns cobalt on hover. The only true shadow left is the transient drag lift.

### Named Rules
**The No-Shadow Rule.** Unchanged in spirit, stricter in letter: nothing at rest casts a shadow.

## Shapes

Squared, like a typed page: nothing bulges.
- **Everything** (buttons, inputs, chips, cards, modals): 2 px (`rounded`, `rounded-sm`, `rounded-md`) or 3 px (`rounded-lg`, `rounded-xl`); the Tailwind radius scale is collapsed so existing classes need no change.
- **Fully round** (`rounded-full`): status dots, avatars, the pulse dot. Chips are **not** round any more (`BaseChip` uses `rounded-sm` and `font-mono`).
- **Editor**: zero radius, ruled margin.
- **Focus-visible**: 2 px solid cobalt, 2 px offset, global.

### Named Rules
**The Square Rule.** If it has a corner, it is 2–3 px. Full rounding means "this is a dot or a face", nothing else. Enforced: `npm run policy` (shape-ratchet) counts `rounded-full` on anything that is not a dot or an avatar, `shadow-sm..2xl`, resting inline `box-shadow`s and hard-coded radii over 4 px; the baseline is zero and may not grow.

## Components

### Panel grammar (2026-09-14)
Every tool panel is built from the primitives in `src/components/ui/`, so the panels share one shape:
- **`BasePanelHeader`** — identity on the left, meta and actions on the right; the meta yields before the title when the row is tight.
- **`BaseSection`** — title / one-line description / content, separated by hairlines. No cards inside a panel; a card is reserved for an object the user acts on.
- **Titles:** `BasePanelHeader` and `BaseSection` titles are `.type-display` (Plex Mono caps, 11 px). **Field labels** are `.label-micro`. A badge is a different thing.
- **One accent.** Success / warning / danger appear as an icon tint or a word, never as button fills.
- **Copy:** modal and heading copy is sentence case.
- **Layout:** a docked panel is capped at `calc(100vw - 32rem)` so the manuscript never collapses to a few words wide.
- Tailwind 3.4 has no `/8`, `/12` or `/35` opacity steps — those classes emit no CSS. Use `/10`, `/30`.

### Primitives catalogue (`src/components/ui/`)

Every primitive, its API, and the Storybook story (`npm run storybook`, `UI/...`) that shows it. Compose these; do not restyle them from a feature component. Policy: a `Base*.vue` without a story fails `npm run policy`.

| Primitive | Props | Slots / events | Use it for |
|---|---|---|---|
| `BasePanelHeader` | `title`* · `icon` · `meta` · `collapsible` · `collapsed` · `closable` | `#actions` · `toggle-collapse` · `close` | the top row of every tool panel; meta yields before the title when tight |
| `BaseSection` | `title`* · `description` · `meta` · `first` · `dense` | default · `#actions` | title / one-line description / content, hairline-separated; no cards inside a panel |
| `BaseButton` | `variant` primary·secondary·ghost·danger·accent-ghost·elevated·outline · `size` sm·md·lg · `icon` · `iconPosition` · `disabled` · `loading` | default | one primary per view; ghost for toolbar/inline; elevated for secondary actions in panels |
| `BaseChip` | `variant` default·filter·removable · `active` · `size` sm·md · `color` accent·success·danger·warning·info·neutral · `disabled` | default · `click` · `remove` | filters (`filter` + `active`), tags (`removable`), facts (`default`) |
| `BaseTab` | `variant` underline·pill·segment · `active` · `disabled` · `size` sm·md | default | tab strips inside a panel |
| `BaseSegmented` | `modelValue` · `options[{value,label,icon?,disabled?}]`* · `size` sm·md · `block` · `ariaLabel` · `disabled` | `update:modelValue` | one-of-N mode choice; arrow keys move between enabled options (`role="radio"`) |
| `BaseField` | `modelValue` · `label` · `type` · `placeholder` · `icon` · `suffix` · `hint` · `error` · `disabled` · `required` · `rows` | `update:modelValue` | text, number, password, search; `rows` makes it a textarea; `error` replaces `hint` and turns the border danger |
| `BaseStepper` | `modelValue` · `min` · `max` · `step` · `label` · `suffix` · `size` sm·md · `disabled` | `update:modelValue` | bounded numeric input with -/+; typed values clamp on blur |
| `BaseSwitch` | `modelValue` · `label` · `description` · `size` sm·md · `disabled` | default · `update:modelValue` | on/off settings with an optional one-line description |
| `BaseCheckbox` | `modelValue` boolean or array · `value` · `label` · `description` · `disabled` · `indeterminate` | default · `update:modelValue` | single boolean, or a group bound to one array with `value` |
| `BaseRadio` | `modelValue` · `value`* · `name`* · `label` · `description` · `disabled` | default · `update:modelValue` | mutually exclusive options that need descriptions (else use `BaseSegmented`) |
| `BasePopover` | `placement` top·bottom·right·left · `align` start·end · `offset` · `width` · `label` · `triggerClass` | `#trigger{open,toggle}` · default `{close}` · `open` · `close` | menus and small forms anchored to a trigger; clamps to the viewport, closes on Escape and outside click |
| `BaseAlert` | `variant` info·success·warning·danger · `title` · `icon` · `dismissible` · `flush` | default · `#actions` · `dismiss` | in-panel notices; `danger` has `role="alert"`, the rest `role="status"` |
| `BaseStatusDot` | `color` (a token) · `label` · `shape` solid·dashed·ring·half·target·check · `size` sm·md · `pill` | default | plot-thread lifecycle and any status glyph; the shape carries meaning so colour is never the only cue |
| `BaseSpinner` | `size` sm·md·lg · `label` | none | inline loading with an accessible label |

Shared, non-panel components with stories: `EmptyState` (icon · title · description · `actionLabel`), `Skeleton` (`variant` line·text·circle·card·list·panel), `Modal`, `NotificationHost` / `ActivityToast` (a toast with an `action` never auto-dismisses), `AppTooltip`, `BaseIcon`, `TagInput`, `VirtualScrollList`.

### Buttons
- **Shape:** Gently rounded corners (8px / rounded-lg). Minimal internal padding.
- **Primary:** Accent background (#6e8bb5) with canvas-dark text (#121214), weight 500. On hover: opacity 0.9 + subtle accent glow shadow. On active: opacity 0.8 + scale(0.98).
- **Ghost:** Transparent background, primary text color. On hover: scale(1.02). On active: scale(0.98). For toolbar and inline controls.
- **Elevated:** Elevated surface background (#26262b), primary text. On hover: lift 1px + accent border tint + shadow. For secondary actions in panels.
- **Transitions:** All variants: 150ms duration, `ease-out` timing.

### Glass Surfaces
- **Glass** (panel-level, `.glass`): Panel background with hairline bottom border. Used for headers, toolbars, and section dividers.
- **Glass Panel** (surface-level, `.glass-panel`): Elevated background with full hairline border. For card-like containers and popovers.
- **Glass Modal** (modal-level, `.glass-modal`): Same as glass-panel. Elevated background, full hairline border. For dialogs and overlays.
- **Liquid Glass** (interactive elevated, `.liquid-glass`): Elevated background + hairline border + inset highlight + drop shadow. On hover, border shifts toward the accent. For interactive cards and dropdown triggers.

> **Usage:** Glass classes are self-contained — they set the correct hairline border at 7% opacity. Do **not** append `border-b`, `border-t`, or other border utility classes to a glass element, as they override the intended opacity.

### Inputs & Fields
- **Shape:** Gently rounded corners (8px / rounded-lg).
- **Style:** Elevated surface background (#26262b dark / #ffffff light), primary text.
- **Focus:** The global `*:focus-visible` rule applies — 2px solid accent outline with 2px offset. No inner glow or border shift.
- **Disabled / Error:** Uses muted text color. Error fields additionally use `--vers-status-danger` via component-level styling.

### Cards / Containers
- **Corner Style:** Soft rounding (10px / rounded-xl).
- **Background:** Panel background (#1a1a1d dark / #efede5 light).
- **Elevation strategy:** Tonal — cards sit at the panel layer, separated from canvas by background alone. No shadow.
- **Internal Padding:** 24px (spacing.lg).
- **Border:** Hairline border-subtle on hover or selection; borderless at rest.

### Navigation
- **Style:** Fixed sidebar, full height, panel background. Vertical list of items with secondary text color.
- **States:** Default — secondary text. Hover — hover background well (#222226). Active / selected — accent treatment (background tint or text shift to primary).
- **Typography:** UI font (Geist), 14px, regular weight.

### Manuscript Editor (Signature Component)
- **Typography:** IBM Plex Mono, clamp(16–18px), 1.75 line-height.
- **Layout:** Max-width 66ch, centered with auto margins, no container or card — sits directly on the canvas.
- **Placeholder:** Muted text, italic styled.
- **Selection:** Accent at 25% opacity.
- **Scrollbar:** Hidden (maintaining scroll functionality without visible chrome).

### Drag & Drop
- **Ghost placeholder:** 60% opacity, accent dashed border, accent tinted background. Children hidden.
- **Drag state:** 95% opacity, scale(1.02) rotate(-0.4deg), elevated shadow (12px 40px). Grabbing cursor.
- **Drop target:** Accent dashed outline, accent tinted well background. Animated transition.

## Do's and Don'ts

### Do
- **Do** use cobalt (#1251cc) on live things: caret, active line, links, primary action, goal. Never as a fill or a decoration.
- **Do** draw depth with rules: hairline inside panels, `--vers-border-strong` around objects. Never box-shadow at rest.
- **Do** keep the manuscript on the page: no card, no container; a ruled left margin and a cobalt caret are its only chrome.
- **Do** name things in Plex Mono caps (`.type-display`, `.label-micro`) and explain them in Geist sentence case. Never a Geist bold heading, never mono body copy.
- **Do** use the unified animation presets (`anim-fade-*`, `anim-scale-*`, `anim-slide-*`) for consistent motion. Enter: 220ms, leave: 150ms.
- **Do** respect `prefers-reduced-motion` — collapse all transition and animation durations to 0.01ms.

### Don't
- **Don't** add chroma to neutrals: bone and charcoal are near-zero chroma; the only colour is the signal colour and the status set.
- **Don't** round anything past 3 px except status dots and avatars. Chips are squared.
- **Don't** add glass-blur, translucency, or frosted-glass effects. All surfaces are solid.
- **Don't** use shadows to indicate elevation. Rules do that. The only shadow is the transient drag lift.
- **Don't** put cobalt on a surface. Its power is that it only ever marks something live.
- **Don't** add decorative elements that don't serve the writing workflow. If it doesn't help the author write, edit, or navigate, it doesn't belong.
- **Don't** invent new motion presets, and don't reach for overshoot or bounce easing. Use the `anim-*` presets: exponential ease-out on enters (220ms), a faster standard curve on exits (150ms).
