const DEV_MODE = false

export const MIGRATIONS = {
  11: async (trans) => {
    await trans.graphEdges.toCollection().modify((edge) => {
      if (edge.volumeId === undefined) edge.volumeId = null
    })
  },

  13: async (trans) => {
    const chapters = await trans.chapters.toArray()
    for (const ch of chapters) {
      await trans.sections.add({
        ...ch,
        projectId: ch.projectId,
        title: ch.title,
        summary: ch.summary,
        order: ch.order,
        status: ch.status,
        tags: ch.tags,
        volumeId: ch.volumeId
      })
    }

    const scenes = await trans.scenes.toArray()
    for (const sc of scenes) {
      await trans.subsections.add({
        ...sc,
        projectId: sc.projectId,
        sectionId: sc.chapterId,
        title: sc.title,
        summary: sc.summary,
        order: sc.order,
        content: sc.content,
        tags: sc.tags
      })
    }
  },

  26: async (trans) => {
    if (!DEV_MODE) return
    const userCount = await trans.users.count()
    if (userCount === 0) {
      const testUser = await trans.users.add({
        username: 'test',
        passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae',
        displayName: 'Test User',
        createdAt: new Date().toISOString()
      })
      await trans.projects
        .toCollection()
        .filter((p) => !p.userId)
        .modify({ userId: testUser })
    }
  },

  31: async (trans) => {
    const now = new Date().toISOString()
    await trans.characters.toCollection().modify((c) => {
      if (!c.generationStatus) c.generationStatus = 'approved'
      if (!c.createdAt) c.createdAt = now
      if (!c.updatedAt) c.updatedAt = now
    })
    await trans.locations.toCollection().modify((l) => {
      if (!l.generationStatus) l.generationStatus = 'approved'
      if (!l.createdAt) l.createdAt = now
      if (!l.updatedAt) l.updatedAt = now
    })
    await trans.plotThreads.toCollection().modify((t) => {
      if (!t.generationStatus) t.generationStatus = 'approved'
      if (!t.createdAt) t.createdAt = now
      if (!t.updatedAt) t.updatedAt = now
    })
    await trans.subsections.toCollection().modify((s) => {
      if (!s.contentStatus) {
        s.contentStatus = s.content && String(s.content).trim() ? 'generated' : 'draft'
      }
    })
  },

  35: async (trans) => {
    await trans.branches.toCollection().modify((branch) => {
      if (branch.description === undefined) branch.description = ''
      if (branch.status === undefined) branch.status = 'active'
    })
  }
}
