# AGENTS.md

Fiction writing assistant. Vue 3 + Pinia + TipTap frontend, .NET 10 + PostgreSQL 16 backend, 5 AI providers.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), TypeScript, Pinia stores, TipTap 3 editor, Vite 8, Vitest 5
- **Backend**: .NET 10, PostgreSQL 16 (RLS), Redis, Entity Framework Core, SignalR
- **AI**: 5 providers (Ollama default, OpenAI, Anthropic, Gemini, Groq); Ollama runs a prose model and a separate `qwen3:8b` utility model
- **Storage**: IndexedDB via Dexie 4 (offline-first, schema v51), PostgreSQL (server)
- **Build/CI**: npm/vite for frontend, dotnet for backend

## Key Conventions

- **Stores** in `src/stores/` — Pinia with setup syntax (`defineStore('name', () => { ... })`), 20 of them
- **Composables** in `src/composables/` — reusable composition logic; the generation engine is under `composables/generation/` (writing strategies, context, commit, consistency, delegator, lifecycle)
- **Components** in `src/components/` — organized by domain (`storybible/`, `editor/`, etc.); panels are built from the `Base*` primitives in `components/ui/` (`BasePanelHeader`, `BaseSection`) — no ad-hoc cards or eyebrows
- **Tests** in `src/tests/unit/` — Vitest with `vi.useFakeTimers()` for debounce tests
- **API calls** go through services in `src/services/`
- **Debounce** any IndexedDB write or expensive computation triggered by rapid user input
- **Schema changes**: add a version to `db-schema.ts` with a comment, a handler in `db-migrations.ts` if data moves, and update `EXPECTED` in `dbSchema.test.js`; log it in `docs/database-schema-changelog.md`
- **Generation contract**: gates warn, never discard prose; a failed scene commits its best attempt as `review`; every degradation is counted in `runHealth`

## UI: the design system

Anything that renders goes through the design system. Read these before touching a `.vue` file:

- **`DESIGN.md`**: the visual system (colour, type, layout, elevation, shapes), the **panel grammar**, and the **primitives catalogue**: every `Base*` component in `src/components/ui/` with its props, slots, events and what it is for.
- **`docs/DESIGN-TOKENS.md`**: every `--vers-*` token in `src/style.css` with dark/light values, the `-rgb` composition twins, the Tailwind aliases, the fonts, and how to add a token.
- **Storybook** (`npm run storybook`, `UI/*`): every primitive has a story; Chromatic snapshots them on each push.
- **`docs/UX-ENHANCEMENTS.html`**: the agreed backlog of UI/UX improvements, each with a live demo. If you are asked to improve a screen, start there and cite the example number.

The rules, in order of how often they are broken:

1. **Compose the primitives; never restyle them.** A panel is `BasePanelHeader` + `BaseSection`s; controls are `BaseButton`, `BaseChip`, `BaseField`, `BaseSegmented`, `BaseSwitch`, `BaseCheckbox`, `BaseRadio`, `BaseStepper`, `BasePopover`, `BaseAlert`, `BaseStatusDot`, `BaseSpinner`. No ad-hoc cards, eyebrows or buttons. If a primitive is missing, add it to `src/components/ui/` **with a story** and a row in the catalogue.
2. **Colours are tokens.** `--vers-*` via the Tailwind aliases (`bg-bg-panel`, `text-text-hint`, `border-border-subtle`, `text-accent`, `text-danger`...) or `var(--vers-*)` for JS-assigned colour. No hex literal in a component: `npm run policy` ratchets the count per file and it may only go down. Translucency is `rgb(var(--vers-x-rgb) / 0.3)`, never a second hex.
3. **One accent, scarce.** Accent for focus, selection, the one primary action, graph character nodes. Status colours are an icon tint or a word, never a button fill.
4. **Every async surface has four states**: skeleton (`Skeleton` variants), live, empty (`EmptyState` with an action that leads somewhere), error. A dead-end empty state is a bug (see `docs/UX-AUDIT.md` #8).
5. **Copy is sentence case**; the structure vocabulary comes from `structureTerms` on the project store (Chapters/Scenes for a novel), never hard-coded "Sections".
6. **Tailwind 3.4 has no `/8`, `/12`, `/35` opacity steps**; those classes emit nothing. Use `/10`, `/30`.
7. **Motion** uses the `anim-*` presets and respects `prefers-reduced-motion`; focus uses the global `*:focus-visible` ring, never `outline: none`.
8. **Document the change where it lives**: a new token in `docs/DESIGN-TOKENS.md`, a new primitive in the catalogue, a UX finding in `docs/UX-AUDIT.md`.

Run `npm run policy` before you finish: it checks that every token is documented, every primitive has a story, hex literals did not grow, and the agent files still point here. `AGENT.md` is the longer setup guide (scripts, project structure, data model, pipeline, pitfalls); this file is the contract.

## Performance Rules

- Word count → debounce (300ms) via `wordCountTimer`
- IndexedDB writes → debounce (500ms) via per-field timers
- Lookups in render loops (`getEdgeOpacity`, `getStroke`) → use pre-computed `Map` objects, not `Array.find()`
- Independent DB queries → `Promise.all` not serial `await`
- Computed from large reactive arrays → direct property mutation, not spread re-creation
- Only add dependencies that actually change the result to `watch()` / `computed()`
- History tables are append-only: read "latest N" through a reverse index cursor over `[projectId+timestamp]`, never `toArray()` then sort

## Testing

- `npm run test:run` — Vitest suite (≈3,060 tests, ~2 min)
- `npm run typecheck` — `tsc --noEmit`, zero errors
- `npm run lint` — ESLint
- `npm run lint:tokens` and `npm run policy` — the executable design-system and repo policies (both run in the CI `lint` job)
- `npm run build` — Vite production build
- `dotnet test backend/Versatile.slnx` — backend suite
- New features add tests; debounce tests use `vi.useFakeTimers()`
- **Both suites are green. A failing test is a regression — never pre-existing.**
  Suites that call `vi.resetModules()` must drain their module's async work
  before the test ends: a new module registry does not stop the old instance,
  and a stray timer firing inside a later test fails whichever test it lands on.
- Real-model runs are not tests: `tools/generate-sample.mjs` (one chapter) and
  `vitest.live.config.js` (a whole book, headless). Mocked tests have missed
  silent overflow and JSON-envelope defects before — a pipeline change that
  touches prompts or provider options wants one real run. See `TESTING.md`.

## Architecture Notes

- Offline-first: Dexie.js writes are batched and debounced; sync happens in background
- Story graph uses Canvas/SVG with cached edge lookups for performance
- Scene evaluations stored in reactive `Map` by scene ID
- Tool panels dock to the right of a canvas-dominant shell; the sidebar and Ctrl+K palette share one definition
- Docs that stay current: `README.md`, `ARCHITECTURE.md`, `API.md`, `TESTING.md`, `CHANGELOG.md`, `docs/GENERATION-PIPELINE-ANALYSIS.md`, `docs/UX-AUDIT.md`, `docs/PERF-AUDIT.md`, `docs/database-schema-changelog.md`, `docs/sync-status.md`; `planning/` is a local, gitignored workbook (`planning/README.md` is the index)

## Which tool reads what

This file is the one agent instruction file with content. Every other agent file is a pointer to it, so the rules cannot fork per tool; `npm run policy` fails if a pointer stops pointing here.

| Tool | Reads | Notes |
|---|---|---|
| OpenCode | `AGENTS.md` (native), `opencode.json` → `instructions` | listed in the config too, so a global OpenCode config cannot shadow it |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | an import, not a copy; `.claude/` holds settings and skills only |
| Codex CLI / Copilot coding agent | `AGENTS.md` (native) | `.codex/hooks.json` is hooks, not rules |
| Cursor | `.cursor/rules/agents.mdc` (`alwaysApply`) | newer Cursor also reads `AGENTS.md` directly |
| GitHub Copilot (IDE chat) | `.github/copilot-instructions.md` | |
| Gemini CLI | `GEMINI.md` | |
| Anything else | point it at `AGENTS.md` | add a row here and the path to `scripts/policy.mjs` |
