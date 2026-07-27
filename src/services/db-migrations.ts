const DEV_MODE = false

export const MIGRATIONS = {
   11: async (trans: any) => {
    await trans.graphEdges.toCollection().modify((edge: any) => {
      if (edge.volumeId === undefined) edge.volumeId = null
    })
  },

  13: async (trans: any) => {
    const chapters = (await trans.chapters?.toArray()) ?? []
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

    const scenes = (await trans.scenes?.toArray()) ?? []
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

  26: async (trans: any) => {
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
        .filter((p: any) => !p.userId)
        .modify({ userId: testUser })
    }
  },

  31: async (trans: any) => {
    const now = new Date().toISOString()
    await trans.characters.toCollection().modify((c: any) => {
      if (!c.generationStatus) c.generationStatus = 'approved'
      if (!c.createdAt) c.createdAt = now
      if (!c.updatedAt) c.updatedAt = now
    })
    await trans.locations.toCollection().modify((l: any) => {
      if (!l.generationStatus) l.generationStatus = 'approved'
      if (!l.createdAt) l.createdAt = now
      if (!l.updatedAt) l.updatedAt = now
    })
    await trans.plotThreads.toCollection().modify((t: any) => {
      if (!t.generationStatus) t.generationStatus = 'approved'
      if (!t.createdAt) t.createdAt = now
      if (!t.updatedAt) t.updatedAt = now
    })
    await trans.subsections.toCollection().modify((s: any) => {
      if (!s.contentStatus) {
        s.contentStatus = s.content && String(s.content).trim() ? 'generated' : 'draft'
      }
    })
  },

  35: async (trans: any) => {
    await trans.branches.toCollection().modify((branch: any) => {
      if (branch.description === undefined) branch.description = ''
      if (branch.status === undefined) branch.status = 'active'
    })
  },

  38: async () => {
    // New table only — no data transform needed.
  },

  39: async (trans: any) => {
    // Migrate nodePositions.instances map into individual graphNodeInstances rows.
    // nodePositions table is dropped in v39 (not declared in v39 stores).
    const oldRecords = (await trans.nodePositions?.toArray()) ?? []
    for (const record of oldRecords) {
      if (record.instances) {
        const rows = Object.keys(record.instances).map((nodeId: any) => ({
          projectId: record.projectId,
          nodeId
        }))
        if (rows.length > 0) {
          await trans.graphNodeInstances.bulkAdd(rows)
        }
      }
    }
  },

  36: async (trans: any) => {
    const oldPositions = (await trans.nodePositions?.toArray()) ?? []
    for (const record of oldPositions) {
      if (record.positions) {
        const rows = Object.entries(record.positions).map(([nodeId, pos]: [string, any]) => ({
          projectId: record.projectId,
          nodeId,
          nodeType: nodeId.startsWith('char-')
            ? 'character'
            : nodeId.startsWith('loc-')
              ? 'location'
              : 'plotThread',
          x: pos.x ?? 0,
          y: pos.y ?? 0
        }))
        if (rows.length > 0) {
          await trans.graphNodePositions.bulkAdd(rows)
        }
      }
    }

    let oldGroups
    try {
      oldGroups = await trans.graphGroups.toArray()
    } catch {
      oldGroups = []
    }
    for (const record of oldGroups) {
      if (Array.isArray(record.groups)) {
        const rows = record.groups.map((g: any, i: any) => ({
          id: g.id || `group-migrated-${record.projectId}-${i}`,
          projectId: record.projectId,
          name: g.name || g.label || '',
          color: g.color || '#6e8bb5',
          x: g.x ?? 100,
          y: g.y ?? 100,
          width: g.width ?? 300,
          height: g.height ?? 200,
          groupOrder: i
        }))
        if (rows.length > 0) {
          await trans.graphGroupsV2.bulkAdd(rows)
        }
      }

      if (record.nodeParents) {
        const parentRows = Object.entries(record.nodeParents)
          .filter(([, groupId]: [string, any]) => groupId != null)
          .map(([nodeId, groupId]: [string, any]) => ({
            projectId: record.projectId,
            nodeId,
            nodeType: nodeId.startsWith('char-')
              ? 'character'
              : nodeId.startsWith('loc-')
                ? 'location'
                : 'plotThread',
            groupId: String(groupId)
          }))
        if (parentRows.length > 0) {
          await trans.graphNodeParents.bulkAdd(parentRows)
        }
      }
    }
  }
}
