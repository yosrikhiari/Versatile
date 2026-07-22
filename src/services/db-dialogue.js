import { toRaw } from 'vue'
import { db } from './db-core'

export async function getDialogueByProject(projectId) {
  try {
    const results = await db.dialogueIndex.where('projectId').equals(projectId).toArray()
    return results
  } catch (err) {
    console.error('[db-dialogue] getDialogueByProject error:', err)
    return []
  }
}

export async function getDialogueBySpeaker(projectId, speakerId) {
  try {
    const results = await db.dialogueIndex
      .where('[projectId+speakerId]')
      .equals([projectId, speakerId])
      .toArray()
    return results
  } catch (err) {
    console.error('[db-dialogue] getDialogueBySpeaker error:', err)
    return []
  }
}

export async function saveDialogueEntry(entry) {
  try {
    const plain = JSON.parse(JSON.stringify(toRaw(entry)))
    const id = await db.dialogueIndex.add(plain)
    return id
  } catch (err) {
    console.error('[db-dialogue] saveDialogueEntry error:', err)
    return null
  }
}

export async function saveDialogueBatch(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return []
  try {
    const plain = entries.map((e) => JSON.parse(JSON.stringify(toRaw(e))))
    const ids = await db.dialogueIndex.bulkAdd(plain, { allKeys: true })
    return ids
  } catch (err) {
    console.error('[db-dialogue] saveDialogueBatch error:', err)
    return []
  }
}

export async function deleteDialogueByProject(projectId) {
  try {
    await db.dialogueIndex.where('projectId').equals(projectId).delete()
  } catch (err) {
    console.error('[db-dialogue] deleteDialogueByProject error:', err)
  }
}

export async function updateSpeakerMapping(id, speakerId, confidence) {
  try {
    await db.dialogueIndex.update(id, {
      speakerId,
      confidence,
      needsReview: confidence < 0.8
    })
  } catch (err) {
    console.error('[db-dialogue] updateSpeakerMapping error:', err)
  }
}

export async function reindexSection(sectionId, projectId, dialogueEntries) {
  try {
    await db.dialogueIndex.where({ sectionId }).delete()

    if (dialogueEntries.length > 0) {
      const plain = dialogueEntries.map((e) => JSON.parse(JSON.stringify(toRaw(e))))
      await db.dialogueIndex.bulkAdd(plain)
    }
  } catch (err) {
    console.error('[db-dialogue] reindexSection error:', err)
  }
}
