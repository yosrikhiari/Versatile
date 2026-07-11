export function useVolumeHeal(ctx) {
  const { sync, onConfirmSync, projectId, volumeId } = ctx

  async function healStructuredBatch(structuredBatch) {
    if (!structuredBatch || structuredBatch.length === 0) {
      return { applied: 0, changes: [] }
    }

    const batchChanges = []
    for (const sr of structuredBatch) {
      if (sr.structured) {
        const sceneChanges = sync.discoverSync(sr.structured)
        batchChanges.push(...sceneChanges)
      }
    }

    if (batchChanges.length > 0) {
      await onConfirmSync({
        acceptedEntities: batchChanges,
        projectId,
        volumeId
      })
    }

    return { applied: structuredBatch.length, changes: batchChanges }
  }

  return {
    healStructuredBatch
  }
}
