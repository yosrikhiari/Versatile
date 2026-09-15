---
name: Versatile
description: Fiction writing assistant
colors:
  primary: "#6e8bb5"
  primary-deep: "#4f6e96"
  bg-base-dark: "#121214"
  bg-panel-dark: "#1a1a1d"
  bg-elevated-dark: "#26262b"
  bg-base-light: "#f7f5f0"
  bg-panel-light: "#efede5"
  bg-elevated-light: "#ffffff"
  text-primary-dark: "#e6e6e2"
  text-secondary-dark: "#a2a29b"
  text-muted-dark: "#82827a"
  text-primary-light: "#1c1c1a"
  text-secondary-light: "#5a5a55"
  text-muted-light: "#70706a"
  text-on-accent: "#121214"
  border-subtle-dark: "rgba(255,255,255,0.07)"
  border-subtle-light: "rgba(0,0,0,0.07)"
  border-dark: "rgba(255,255,255,0.12)"
  border-light: "rgba(0,0,0,0.12)"
  status-open: "#6a9e7a"
  status-in-progress: "#6e8bb5"
  status-resolved: "#7d8a99"
  status-closed: "#5c5c56"
  status-success: "#6a9e7a"
  status-danger: "#d07070"
  status-warning: "#d4a74a"
  status-info: "#5b8cb8"
  entity-character: "#6e8bb5"
  entity-location: "#6a9e7a"
  entity-plotThread: "#d4a74a"
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
    fontFamily: "'Geist Variable', Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "0.06em"
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

**Creative North Star: "The Editorial Atelier"**

Versatile is a workshop for the craft of fiction — precise tools on a clean bench, the quiet focus of a well-organized creative space. The interface recedes so the writing takes center stage. Every element earns its place through utility; nothing is decorative for its own sake.

Dark by default with a warm charcoal foundation (never cold black), the system uses a single cool slate-blue accent sparingly — marking interactions, borders on focus, and entity relationships in the story graph. The light variant shifts to warm paper tones, preserving the same hierarchy and restraint.

The aesthetic is tool-like precision: tight spacing, minimal chrome, tonal depth through surface lightness rather than shadow. The manuscript editor sits directly on canvas with no card or container — the text *is* the surface. Panel chrome uses hairline borders for separation. Motion is fast and responsive (150–350ms range): enters decelerate on an exponential ease-out, exits dissolve faster than they arrive.

**Key Characteristics:**
- Surfaces are solid, tonal, and separated by hairline borders (no glass-blur, no translucency)
- Dark mode is warm charcoal (#121214 base), light mode is warm cream (#f7f5f0 base)
- The accent (#6e8bb5) is used on ≤5% of any screen — its rarity is the point
- The manuscript editor is monospace, centered at 66ch max-width, directly on the canvas
- Touch targets meet 44×44px on touch devices without inflating desktop density

## Colors

A single cool slate-blue accent against a warm neutral monochrome foundation. Light theme inverts the neutral stack to warm paper tones while keeping the same accent and hierarchy.

### Primary
- **Slate Blue** (#6e8bb5 / rgba(110, 139, 181)): The only accent. Used for focus rings, selected states, accent backgrounds (at low opacity), entity-character graph nodes, and the ambient glow. Never used for body text or large surface fills.
- **Deep Slate** (#4f6e96): Hover/active depth variant of the primary accent.

### Neutral
- **Canvas Dark** (#121214): Deepest background — the manuscript surface, the app canvas. Text-on-accent against the primary.
- **Panel Dark** (#1a1a1d): Sidebar, headers, side panels, manuscript editor chrome.
- **Hover Dark** (#222226): Hover well for interactive list items and clickable rows.
- **Elevated Dark** (#26262b): Dropdowns, modals, context menus, popovers — surfaces that lift above the panel.
- **Canvas Light** (#f7f5f0): Light theme base — warm cream.
- **Panel Light** (#efede5): Light theme panels.
- **Elevated Light** (#ffffff): Light theme elevated surfaces.
- **Text Primary** (#e6e6e2 dark / #1c1c1a light): Body and heading text.
- **Text Secondary** (#a2a29b dark / #5a5a55 light): Labels, metadata, secondary navigation.
- **Text Muted** (#82827a dark / #70706a light): Placeholders, disabled text, hints. WCAG AA on both themes.
- **Text Faint** (#44443e): Decorative use only — dividers, icon fills. Never used for text.

### Semantic
- **Success** (#6a9e7a dark / #4a8a5a light): Positive feedback, passing checks.
- **Danger** (#d07070): Deletion, destructive actions, error states.
- **Warning** (#d4a74a): Caution states, amber markers.
- **Info** (#5b8cb8): Informational badges, help text.


### Plot Thread Lifecycle
A receding ramp rather than four unrelated hues — the further a thread is from needing attention, the further it sits from the accent and the closer to the panel.
- **Open** (#6a9e7a): Sage. Unresolved and live.
- **In Progress** (#6e8bb5): Slate. Being actively worked.
- **Resolved** (#7d8a99): Steel. Settled, still visible.
- **Closed** (#5c5c56): Deep stone. Recedes furthest.

### Graph Entity Colors
- **Character** (#6e8bb5): Matches the primary accent — character nodes/edges are the accent color.
- **Location** (#6a9e7a): Muted sage.
- **Plot Thread** (#d4a74a): Muted amber — stands out against the neutral background.

### Edges (Story Graph Relationships)
13 relationship types drawn from one desaturated on-brand family — slate, sage, amber, ochre, brick, steel, olive, stone, dusty rose. Relationship meaning is carried by the edge *label*; the color only needs to distinguish one dot from another in the entity sidebar. The graph itself renders all edges neutral, tinting only on hover.

### Story Canvas Element Colors
Canvas element cards reuse the entity palette so a character card and a character graph node read as the same thing: section (#7d8a99 steel), character (#6e8bb5 slate), location (#6a9e7a sage), plot point (#d4a74a amber), note (#a08d6f ochre).

### Named Rules
**The Rarity Rule.** The primary accent (#6e8bb5) appears on ≤5% of any given screen. It marks focus, selected states, key graph nodes, and the ambient glow — and nothing else. Overuse dilutes its signal.

**The On-Accent Rule.** The accent (#6e8bb5) is the same value in both themes, so text on it is always #121214 — 5.4:1. Never white or cream on the accent; both land near 3.3:1. Use `text-accent-foreground` / `.btn-primary`, never `text-white` or `var(--vers-bg-base)`.

**The Warm Base Rule.** Neutral dark values lean warm (charcoal, not blue-gray). Neutral light values lean warm (cream, not white). Pure grays are never used for backgrounds.

## Typography

**UI Font:** Geist Variable, Geist, Inter, system-ui, sans-serif
**Manuscript Font:** IBM Plex Mono, JetBrains Mono, monospace

**Character:** The UI is set in Geist — a clean, narrow grotesque that maximizes information density in panels and toolbars. The manuscript uses IBM Plex Mono for precise character alignment and a deliberate, typewriter-informed pacing. The pairing is utilitarian: the UI stays out of the way so the monospace prose reads as the voice.

### Hierarchy
- **UI** (Regular 400, 14px / 0.875rem, 1.5 line-height): All interface text — menus, buttons, labels, sidebar items, headers, metadata.
- **UI Small / Label** (Medium 500, 12px / 0.75rem, 1.25 line-height, 0.025em tracking): Button labels, badge text, tab labels, small metadata.
- **Micro-label** (`.label-micro` — Medium 500, 12px / 0.75rem, uppercase, 0.06em tracking): Names a control group without competing with the values inside it. Form field labels and panel section headers only. Same size as UI Small so it stays legible; the uppercase and wider tracking do the demotion instead of a smaller size.
- **Nav item** (Regular 400, 13px / 0.8125rem): Sidebar navigation rows and the sidebar account row. Sits between UI (14px) and UI Small (12px) so a long vertical list stays scannable without shrinking to label size.
- **Manuscript** (Regular 400, clamp(16px, 1rem + 0.4vw, 18px), 1.75 line-height): The editor body. Centered at 66ch max-width. Monospace for character-level alignment with the prose.
- **Faint** (#44443e dark): Decorative tiers only — never for readable text.

### Named Rules
**The Manuscript Separator Rule.** The manuscript is the only surface that uses monospace type. UI, navigation, metadata, and controls are always in Geist. The typographic shift marks the boundary between writing and tooling.

**The Micro-Label Rule.** `.label-micro` names a thing — a field, a group of controls, a panel section. It is never a decorative eyebrow above a heading. If removing it loses no information, it should not be there.

## Layout

The app occupies full viewport height with `overflow: hidden`. The shell is a fixed sidebar (navigation) plus a main content area that fills the remaining space. Panels slide in from left or right as overlays.

- **Manuscript editor**: Max-width 66ch, centered (auto margins), sits directly on the canvas with no container, card, or chrome.
- **Sidebar**: Fixed-width navigation column, full height.
- **Panels**: Slide-over panels for secondary content (story bible, scene graph, project settings). Enter from left/right on the shared `anim-slide-*` preset. Dismiss by closing or clicking outside.
- **Modals**: Centered, elevated surface with `glass-modal` styling. Backdrop is the panel color.
- **Density**: Tight — 4px and 8px spacing for compact toolbars and tree views. 16–24px for card and panel interiors. No generous whitespace for its own sake.
- **Touch**: On coarse-pointer devices, interactive controls expand to 44×44px minimum without altering the desktop grid.

## Elevation & Depth

The system uses **tonal layering** — depth is communicated through background lightness, not shadows. Surfaces are solid and separated by hairline borders.

- **Canvas** (darkest: #121214): The base layer — manuscript, app background.
- **Panel** (#1a1a1d): Sits on canvas, separated by 1px hairline border. Sidebar, editor chrome, side panels.
- **Elevated** (#26262b): Dropdowns, modals, context menus. Also uses hairline border + optional inset highlight (`liquid-glass` variant).
- **Modals** (#26262b + hairline border): Centered above all panels. No backdrop blur.

The `liquid-glass` class adds an inset highlight (`inset 0 1px 0 rgba(255,255,255,0.06)`) and a subtle drop shadow (`0 1px 3px rgba(0,0,0,0.3)`) to elevated interactive surfaces, giving them a faint physical edge without breaking the tonal system. On hover, the accent border-tint replaces the neutral hairline.

### Ambient Effect
An `ambient-glow` overlay casts two radial gradients from the accent color — one at the top edge (6% opacity) and one at the bottom (3% opacity) — creating a subtle atmospheric warmth. This is the only non-structural use of color in the system.

### Named Rules
**The No-Shadow Rule.** Elevation is communicated through tonal layer (background value), not shadow. The only shadows are the `liquid-glass` inset highlight (structural, not atmospheric) and drag-state lift (transient, not hierarchical).

## Shapes

Geometry is defined by soft, muted rounding — nothing aggressively pill-shaped except tags.

- **Inline marks** (dialogue highlight, search hit): 2px radius. Anything larger bulges on a single line of text.
- **Buttons, Inputs, Dropdowns**: 8px radius (`rounded-lg`). Consistent across all form controls.
- **Cards, Glass Panels**: 10px radius (`rounded-xl`) — slightly softer than controls to distinguish containers from interactive elements.
- **Chips, Pills, Status Badges**: Fully rounded (`rounded-full`, 9999px).
- **Modals**: 10px radius (`rounded-xl`), same as cards.
- **Editor**: Zero radius — the manuscript sits on the canvas with no container at all.
- **Borders**: Hairline (`1px solid`) with subtle opacity (`rgba(255,255,255,0.07)` dark / `rgba(0,0,0,0.07)` light). Focus borders use the accent at full opacity.
- **Focus-visible**: 2px solid accent, 2px offset. Applied globally via `*:focus-visible`.

### Named Rules
**The No-Pill Rule.** Buttons and inputs are rounded-lg (8px), not pill-shaped. Full rounding is reserved for status indicators, tags, and avatars only.

## Components

### Panel grammar (2026-09-14)
Every tool panel is built from the primitives in `src/components/ui/`, so the panels share one shape:
- **`BasePanelHeader`** — identity on the left, meta and actions on the right; the meta yields before the title when the row is tight.
- **`BaseSection`** — title / one-line description / content, separated by hairlines. No cards inside a panel; a card is reserved for an object the user acts on.
- **Eyebrow:** `.label-micro text-text-hint` is the only eyebrow style. A badge is a different thing.
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
- **Do** use the accent (#6e8bb5) sparingly — focus rings, selection states, graph character nodes, and the ambient glow. Never for body text or background fills.
- **Do** prefer tonal layering over shadows for depth. Use `--vers-bg-elevated` for dropdowns and modals, not box-shadow.
- **Do** keep the manuscript editor directly on the canvas — no card, no border, no container.
- **Do** use Geist for all interface text and IBM Plex Mono for manuscript/prose content. Never mix them.
- **Do** use the unified animation presets (`anim-fade-*`, `anim-scale-*`, `anim-slide-*`) for consistent motion. Enter: 220ms, leave: 150ms.
- **Do** respect `prefers-reduced-motion` — collapse all transition and animation durations to 0.01ms.

### Don't
- **Don't** use pure gray (#808080) backgrounds. All neutral values lean warm (charcoal in dark mode, cream in light mode).
- **Don't** use pill-shaped rounding on buttons or inputs. Full rounding is for chips, status badges, and avatars only.
- **Don't** add glass-blur, translucency, or frosted-glass effects. All surfaces are solid.
- **Don't** use shadows to indicate elevation. The tonal layer (background value) communicates depth. Shadows are transient — used only for drag states and liquid-glass inset.
- **Don't** use the accent on large surface areas. Its power is in scarcity.
- **Don't** add decorative elements that don't serve the writing workflow. If it doesn't help the author write, edit, or navigate, it doesn't belong.
- **Don't** invent new motion presets, and don't reach for overshoot or bounce easing. Use the `anim-*` presets: exponential ease-out on enters (220ms), a faster standard curve on exits (150ms).
