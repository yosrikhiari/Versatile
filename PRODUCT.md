# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Writers of fiction — from hobbyists exploring their first novel to experienced authors managing complex narrative projects. The tool serves anyone engaged in creative writing who needs planning, drafting, revision, and organizational support.

## Product Purpose

Versatile is a browser-based fiction writing environment that integrates a rich text editor with AI-powered tools for planning, drafting, revising, and managing narrative projects. It exists to give writers a single, focused workspace where creative flow is protected, story structure is visually manageable, and AI assistance is woven in without getting in the way. Success means writers spend more time in their manuscript and less time tooling around it.

## Positioning

An AI-native writing environment — deep, multi-agent AI pipelines (prompting, prose analysis, novel drafting with Director/Writer/Critic, entity generation, author voice profiling, context-aware retrieval) are built directly into the editor and planning tools, not added as a bolt-on. Works offline-first by default with local AI inference as the primary path and optional cloud sync.

## Operating Context

- Writers work in a browser tab, often for extended drafting sessions
- Flow Mode provides timed writing sprints with word count goals and idle detection
- Focus Mode strips UI chrome for distraction-free writing
- Auto-save to local IndexedDB via Dexie (no manual save needed)
- Optional sync to a .NET 10 + PostgreSQL server for multi-device access
- Five AI providers available: Ollama (default/local), OpenAI, Anthropic, Gemini, Groq
- Story planning tools: story bible (characters, locations, plot threads, relationships), chapter/scene/volume hierarchy, timeline view, story canvas, scene outline, visual graph network
- Export to PDF and EPUB

## Capabilities and Constraints

### Confirmed
- Rich text editing via TipTap (ProseMirror) with distraction-free interface
- Spark: AI prompts and outlines from user-provided ideas
- Polish: paragraph-level prose analysis (repetition, pacing, dialogue, show-don't-tell, etc.)
- Novel Pipeline: autonomous directed acyclic graph — bible → network → structure → spine → prose → consistency
- Director/Writer/Critic: multi-agent pipeline with streaming output and per-scene quality scoring
- Entity Generation: AI-assisted creation of characters, locations, and plot threads
- Embedding-Similarity Retrieval: context-aware text selection for stories exceeding 25 scenes
- Context Compaction: smart summarization to stay within AI token budgets
- Author Voice Learning: statistical voice profiling without LLM calls
- Story Bible: characters, locations, plot threads, relationships with visual graph (Vue Flow)
- Chapter & Scene Management: section/subsection hierarchy with drag-and-drop reordering
- Story Canvas: spatial storyboard
- Timeline View: chronological plot thread visualization
- Scene Outline: structured scene-by-scene breakdown
- Volume Management: organize chapters into volumes
- Export to PDF (jsPDF) and EPUB
- Session history archive with author model tracking
- Goal tracking (session and daily word counts)
- Offline-first persistence via Dexie IndexedDB (v33, ~40 tables)
- Cloud sync via .NET 10 + PostgreSQL (optional)
- Light and dark themes (both equally maintained)
- 115 test files (1193 tests) — Vitest
- Geist Variable UI font, IBM Plex Mono manuscript font, various serif fonts for feature modes

### Undecided
- Deployment / hosting model (static build vs. server-backed)
- Pricing model (if any)
- Multi-user or collaboration features
- Mobile native app vs. responsive web only

## Brand Commitments

- Product name: **Versatile**
- No existing logo, tagline, or visual identity assets beyond the in-code design system
- Voice: writer-supportive, focused, unpretentious

## Evidence on Hand

- README.md at project root — full feature catalog and architecture overview
- AGENTS.md — tech stack, conventions, performance rules, testing patterns
- 1193 passing unit tests (Vitest)
- End-to-end tests (Playwright)
- Storybook setup with accessibility addon (a11y)
- No published testimonials, case studies, or customer logos

## Product Principles

1. **Flow first** — Protect the writer's creative state. UI chrome recedes during writing, auto-save is invisible, and interruptions (even AI ones) serve the session, not distract from it.
2. **Local by default** — The primary data and AI path works offline. The cloud is optional, not required.
3. **AI as craft tool, not crutch** — AI features are transparent, controllable, and focused on the writer's intent. The writer remains the author; AI is an assistant that can be directed, accepted, or ignored.
4. **Structure without constraint** — Provide powerful planning and organization tools but never force a workflow. Writers can outline in detail or jump straight into prose.
5. **Depth before breadth** — Each feature is built to serve real writing needs, not to fill a checklist. Invest deeply in the writing, planning, and revision loop before expanding into adjacent concerns.

## Accessibility & Inclusion

- Both dark and light themes with WCAG AA-compliant contrast ratios for body and secondary text
- High-contrast mode via `prefers-contrast: more` media query
- Reduced motion support via `prefers-reduced-motion: reduce`
- `focus-visible` outlines on all interactive elements
- Touch-friendly target sizing (44×44px minimum) on coarse-pointer devices
- Screen reader support via proper ARIA roles and semantic HTML
- Storybook a11y addon for visual regression testing
