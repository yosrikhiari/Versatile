import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useManuscriptStore } from './manuscriptStore'
import { useCharacterChatStore } from './characterChatStore'

let nextId = 1

export const useBubbleStore = defineStore('bubble', () => {
  const bubbles = ref<any[]>([])
  let nextZIndex = 100
  const activeBubbleId = ref<any | null>(null)

  function resolveCharacterPortrait(character: any) {
    return character.portrait || ''
  }

  async function addBubbleFromCharacter(character: any, x: any, y: any, projectId: any) {
    // One bubble per character — re-dropping an existing character just moves it
    const existing = bubbles.value.find((b) => b.characterId === character.id)
    if (existing) {
      existing.x = Math.round(x)
      existing.y = Math.round(y)
      existing.zIndex = nextZIndex++
      await persistBubblePosition(existing.id, projectId)
      return existing.id
    }

    const portrait = resolveCharacterPortrait(character)
    const ms = useManuscriptStore()
    const data = {
      element_type: 'character-bubble',
      fields: {
        characterId: character.id,
        characterName: character.name,
        portrait,
        x: Math.round(x),
        y: Math.round(y),
        zIndex: nextZIndex++
      }
    }
    const elementId = await ms.addStoryElementData(projectId, data)

    // That write appended to `storyElements`, and EditorView watches its length
    // to mirror elements back into bubbles. That watcher can flush while this
    // await is pending, in which case it has already built the bubble for this
    // element — pushing here as well produced two bubbles from one drop.
    const alreadyAdded = bubbles.value.find(
      (b) => b.elementId === elementId || b.characterId === character.id
    )
    if (alreadyAdded) return alreadyAdded.id

    const id = nextId++
    bubbles.value.push({
      id,
      elementId,
      characterId: character.id,
      characterName: character.name,
      portrait,
      x: Math.round(x),
      y: Math.round(y),
      zIndex: data.fields.zIndex
    })
    return id
  }

  async function removeBubbleAndPersist(id: any) {
    const b = bubbles.value.find((b) => b.id === id)
    if (!b) return
    const ms = useManuscriptStore()
    if (b.elementId) {
      await ms.deleteStoryElementData(b.elementId)
    }
    const idx = bubbles.value.findIndex((b) => b.id === id)
    if (idx !== -1) bubbles.value.splice(idx, 1)
  }

  function removeBubble(id: any) {
    const idx = bubbles.value.findIndex((b) => b.id === id)
    if (idx !== -1) bubbles.value.splice(idx, 1)
  }

  function updatePosition(id: any, x: any, y: any) {
    const b = bubbles.value.find((b) => b.id === id)
    if (b) {
      b.x = x
      b.y = y
    }
  }

  async function persistBubblePosition(id: any, _projectId: any) {
    const b = bubbles.value.find((b) => b.id === id)
    if (!b || !b.elementId) return
    const ms = useManuscriptStore()
    await ms.updateStoryElementData(b.elementId, {
      fields: {
        characterId: b.characterId,
        characterName: b.characterName,
        portrait: b.portrait,
        x: Math.round(b.x),
        y: Math.round(b.y),
        zIndex: b.zIndex
      }
    })
  }

  function bringToFront(id: any) {
    const b = bubbles.value.find((b) => b.id === id)
    if (b) b.zIndex = nextZIndex++
  }

  function setActiveBubbleId(id: any) {
    activeBubbleId.value = id
  }

  function clearActiveBubbleId() {
    activeBubbleId.value = null
  }

  function loadBubblesFromManuscript(storyElements: any) {
    const bubbleElements = storyElements.filter((e: any) => e.element_type === 'character-bubble')
    const validElementIds = new Set(bubbleElements.map((e: any) => e.id))
    const existingElementIds = new Set(bubbles.value.map((b) => b.elementId))

    // Drop bubbles whose backing element is gone (e.g. project switch)
    bubbles.value = bubbles.value.filter((b) => validElementIds.has(b.elementId))

    // One bubble per character. Collapse any duplicate elements left behind by
    // earlier drops and delete the orphaned story elements from the DB.
    const seenCharacterIds = new Set(bubbles.value.map((b) => b.characterId))
    const orphanElementIds = []

    for (const el of bubbleElements) {
      if (existingElementIds.has(el.id)) continue
      const f = el.fields || {}
      if (seenCharacterIds.has(f.characterId)) {
        orphanElementIds.push(el.id)
        continue
      }
      seenCharacterIds.add(f.characterId)
      const z = f.zIndex || nextZIndex++
      if (z >= nextZIndex) nextZIndex = z + 1
      bubbles.value.push({
        id: nextId++,
        elementId: el.id,
        characterId: f.characterId,
        characterName: f.characterName,
        portrait: f.portrait || '',
        x: f.x || 0,
        y: f.y || 0,
        zIndex: z
      })
    }

    if (orphanElementIds.length) {
      const ms = useManuscriptStore()
      for (const id of orphanElementIds) {
        ms.deleteStoryElementData(id).catch(() => {})
      }
    }
  }

  async function findOrCreateChatSession(characterId: any, characterName: any, projectId: any) {
    const chatStore = useCharacterChatStore()
    const existing = Object.values(chatStore.sessions).find(
      (s) => s.characterIds.includes(characterId) && s.projectId === projectId
    )
    if (existing) {
      chatStore.setActiveSession(existing.id)
      return existing.id
    }
    return await chatStore.startSession([characterId], projectId, characterName)
  }

  return {
    bubbles,
    activeBubbleId,
    addBubbleFromCharacter,
    removeBubbleAndPersist,
    removeBubble,
    updatePosition,
    persistBubblePosition,
    bringToFront,
    setActiveBubbleId,
    clearActiveBubbleId,
    loadBubblesFromManuscript,
    findOrCreateChatSession
  }
})
