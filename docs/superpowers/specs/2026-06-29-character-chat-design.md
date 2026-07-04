# Character Chat — Design Spec

## Overview

Allow users to have streaming AI-powered conversations with their story characters. The AI embodies each character's voice, personality, and story context. Conversations can be saved to character notes or inserted directly into the manuscript.

---

## Entry Points

### 1. Story Bible (character card)
- Each `EntityCard` in the Characters tab gets a **Chat** button
- Opens `CharacterChatModal.vue` — a centered modal over the Story Bible
- Pre-selects the character whose card was clicked
- User can add/remove characters from the chat

### 2. Editor Toolbar
- A toggle button (💬 icon) in the editor toolbar
- Opens `CharacterChatPanel.vue` — a collapsible side panel (right side, same slot as Research/VoiceLab)
- Default: no character selected; user picks from a dropdown

Both use the same shared `<CharacterChatSession>` component for the conversation UI.

---

## UI Components

### `components/characterchat/CharacterChatSession.vue`
- **Character bar** (top): horizontal list of selected characters with avatars/names; "+" button to add more; "×" to remove
- **Message area** (scrollable, middle): bubbles — user messages right-aligned, character messages left-aligned with character name/color badge
- **Streaming**: character messages appear word-by-word as they arrive from `aiStream`; a blinking cursor indicates active generation
- **Input bar** (bottom): textarea with Enter to send; character limit indicator
- **Per-message actions** (hover on character messages):
  - 📝 **Save to notes** — appends message to the character's `notes` field in storyBibleStore
  - 📄 **Insert to manuscript** — inserts message text at the current editor cursor position (emits event, editor handles insertion)
- **States**: empty state (no character selected), loading, streaming, error (retry button)

### `components/characterchat/CharacterChatModal.vue`
- Thin wrapper: portal + overlay + close-on-escape
- Contains `<CharacterChatSession>` with `mode="modal"`

### `components/characterchat/CharacterChatPanel.vue`
- Thin wrapper: slide-in panel with resize handle
- Contains `<CharacterChatSession>` with `mode="panel"`
- Toggle visibility from `useEditorToolbar` state

---

## State Management

### New store: `characterChatStore.js` (Pinia)

```js
state: {
  sessions: Map<sessionId, ChatSession>  // in-memory; optional Dexie persistence
}

// ChatSession:
{
  id: string,
  characterIds: number[],
  messages: ChatMessage[],
  createdAt: number,
  updatedAt: number,
  projectId: number
}

// ChatMessage:
{
  id: string,
  role: 'user' | 'character',
  characterId?: number,      // null for user messages
  content: string,
  timestamp: number,
  savedToNotes: boolean,
  savedToManuscript: boolean
}
```

### Active session
- `characterChatStore.activeSessionId` — tracks which session is currently displayed
- `characterChatStore.startSession(characterIds)` — creates a new session
- `characterChatStore.addMessage(message)` — appends (streamed chunks build up)
- `characterChatStore.saveToNotes(messageId, characterId)` — persists message to character notes
- `characterChatStore.saveToManuscript(messageId)` — emits event for editor insertion

### Optional Dexie persistence (`db.js`)
- New table: `characterChats` — `id, projectId, characterIds[], messages[], createdAt, updatedAt`
- `sessionId` maps to Dexie primary key
- Auto-saves on session close; loaded on session reopen

---

## Context Building & Prompt Engineering

### System prompt template (built by `composables/useCharacterChat.js`)

```
You are roleplaying as one or more characters from the user's story.
Stay in character at all times. Never break the fourth wall.
Do not narrate actions or describe body language unless it would be
natural for the character to do so in speech.

If multiple characters are in the conversation, preface each response
with the character's name, like:

  {Name}: {dialogue}

---

### Character: {name}
Role: {role}
Voice: {voice}
Goal: {goal}
Traits: {traits}
Sample dialogue: {sampleDialogue}

Voice metrics:
- Vocabulary range: {vocabulary.uniqueWordRatio}
- Average sentence length: {sentenceStructure.averageSentenceLength}
- Dialogue ratio: {sentenceStructure.dialogueRatio}
- Pacing: {pacing.averageParagraphLength} words per paragraph

### Story Context
Current scene/chapter: {currentScene}
Character's recent events: {recentEvents}
Character's relationships: {relationships}
```

### Context assembly (`useCharacterChat.js`)
1. Load character data from `storyBibleStore.characters`
2. Load voice profile from `storyBibleStore.voiceProfile` (if extracted)
3. Load current scene/chapter context from `manuscriptStore` or `flowStore`
4. Look up character relationships from Dexie `characterRelationships`
5. Assemble and cache the system prompt per session
6. On each message, include the conversation history (last N messages to manage context)

### Streaming
- Uses existing `aiStream()` from `services/aiService.js`
- Streaming chunks are appended to the current `ChatMessage.content` as they arrive
- A `signal` (AbortController) allows cancelling mid-stream

---

## Save/Export Actions

### Save to character notes
- Appends a formatted entry to the character's `notes` field:
  ```
  [Chat — 2026-06-29]
  User: {user message}
  {Character}: {reply}
  ```
- Updates `storyBibleStore` → Dexie `characters` table
- Shows a brief toast confirmation

### Insert to manuscript
- Emits an event (`insert-to-manuscript`) with the message text
- The editor component listens and inserts at the current cursor position
- Supports inserting as plain text or wrapped in quotation marks for dialogue

---

## Implementation Plan

### Phase 1 — Core (composable + shared component)
1. Create `composables/useCharacterChat.js`
   - `buildCharacterContext(characters)`: assemble system prompt
   - `sendMessage(content, characterIds)`: stream response via `aiStream`
   - `cancelStream()`: abort mid-generation
   - `saveToCharacterNotes(messageId)`: persist to storyBibleStore
   - `insertToManuscript(messageId)`: emit event
2. Create `components/characterchat/CharacterChatSession.vue`
   - Character bar, message area, streaming display, input bar
   - Message actions (save/insert)
   - Empty, loading, streaming, error states
3. Create `stores/characterChatStore.js` (Pinia)

### Phase 2 — Entry points
4. Create `CharacterChatModal.vue` — modal wrapper
5. Add Chat button to `EntityCard.vue` in Story Bible
6. Create `CharacterChatPanel.vue` — panel wrapper
7. Add toggle button to editor toolbar
8. Wire open/close and character pre-selection

### Phase 3 — Persistence & polish
9. Add `characterChats` table to Dexie schema
10. Add session save/restore (auto-save on close, list of past sessions)
11. Add loading state for saved sessions
12. Handle edge cases: no AI provider configured, character deleted mid-chat, very long responses
