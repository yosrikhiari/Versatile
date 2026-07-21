import { db } from './db-core'

export async function getWhatIfBranches(projectId) {
  return db.branches.where({ projectId }).filter((b) => b.name !== 'main').toArray()
}

export async function forkWithDivergence(projectId, sourceBranchId, dslPrompt) {
  const sourceBranch = await db.branches.get(sourceBranchId)
  if (!sourceBranch) throw new Error(`Source branch ${sourceBranchId} not found`)

  const timestamp = Date.now()
  const label = dslPrompt
    ? `what-if-${dslPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`
    : `what-if-${timestamp}`

  const newBranchId = await db.branches.add({
    projectId,
    name: label,
    sourceBranchId,
    description: dslPrompt ?? '',
    status: 'divergent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  const sourceSections = await db.sections.where({ projectId, branchId: sourceBranchId }).sortBy('order')
  const sourceSubsections = await db.subsections.where({ projectId, branchId: sourceBranchId }).toArray()

  const sectionIdMap = new Map()

  await db.transaction('rw', db.sections, db.subsections, async () => {
    for (const section of sourceSections) {
      const newSectionId = await db.sections.add({
        projectId,
        branchId: newBranchId,
        title: section.title,
        summary: section.summary,
        order: section.order,
        status: section.status,
        tags: section.tags,
        volumeId: section.volumeId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      sectionIdMap.set(section.id, newSectionId)
    }

    for (const sub of sourceSubsections) {
      const newSectionId = sectionIdMap.get(sub.sectionId)
      if (!newSectionId) continue

      await db.subsections.add({
        projectId,
        sectionId: newSectionId,
        branchId: newBranchId,
        title: sub.title,
        summary: sub.summary,
        order: sub.order,
        content: '',
        tags: sub.tags,
        contentStatus: 'divergent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
  })

  return db.branches.get(newBranchId)
}

export async function directDivergentSections(projectId, sourceBranchId, sectionIds) {
  const sourceBranch = await db.branches.get(sourceBranchId)
  if (!sourceBranch) throw new Error(`Source branch ${sourceBranchId} not found`)

  const newBranchId = await db.branches.add({
    projectId,
    name: `what-if-selected-${Date.now()}`,
    sourceBranchId,
    description: 'Selected sections divergence',
    status: 'divergent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  const sourceSections = await db.sections
    .where({ projectId, branchId: sourceBranchId })
    .filter((s) => sectionIds.includes(s.id))
    .sortBy('order')

  const allSourceSubsections = await db.subsections
    .where({ projectId, branchId: sourceBranchId })
    .filter((s) => sectionIds.includes(s.sectionId))
    .toArray()

  const sectionIdMap = new Map()

  await db.transaction('rw', db.sections, db.subsections, async () => {
    for (const section of sourceSections) {
      const newSectionId = await db.sections.add({
        projectId,
        branchId: newBranchId,
        title: section.title,
        summary: section.summary,
        order: section.order,
        status: section.status,
        tags: section.tags,
        volumeId: section.volumeId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      sectionIdMap.set(section.id, newSectionId)
    }

    for (const sub of allSourceSubsections) {
      const newSectionId = sectionIdMap.get(sub.sectionId)
      if (!newSectionId) continue

      await db.subsections.add({
        projectId,
        sectionId: newSectionId,
        branchId: newBranchId,
        title: sub.title,
        summary: sub.summary,
        order: sub.order,
        content: '',
        tags: sub.tags,
        contentStatus: 'divergent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
  })

  return db.branches.get(newBranchId)
}

export async function deleteWhatIfBranch(branchId) {
  const branch = await db.branches.get(branchId)
  if (!branch || branch.name === 'main') throw new Error('Cannot delete main branch')

  await db.transaction('rw', db.sections, db.subsections, db.branches, async () => {
    await db.subsections.where({ branchId }).delete()
    await db.sections.where({ branchId }).delete()
    await db.branches.delete(branchId)
  })
}

export async function acceptDivergence(branchId) {
  const branch = await db.branches.get(branchId)
  if (!branch) throw new Error(`Branch ${branchId} not found`)

  const sourceBranchId = branch.sourceBranchId
  if (!sourceBranchId) throw new Error('Cannot accept divergence on branch without source')

  const now = new Date().toISOString()

  await db.transaction('rw', db.sections, db.subsections, async () => {
    const divergentSections = await db.sections.where({ projectId: branch.projectId, branchId }).toArray()

    for (const section of divergentSections) {
      const existingSection = await db.sections
        .where({ projectId: branch.projectId, branchId: sourceBranchId, title: section.title })
        .first()

      if (existingSection) {
        await db.sections.update(existingSection.id, {
          summary: section.summary,
          status: section.status,
          updatedAt: now
        })
      }
    }

    const divergentSubs = await db.subsections.where({ branchId }).toArray()
    for (const sub of divergentSubs) {
      const existingSub = await db.subsections
        .where({ projectId: branch.projectId, branchId: sourceBranchId, sectionId: sub.sectionId, title: sub.title })
        .first()

      if (existingSub && sub.content) {
        await db.subsections.update(existingSub.id, {
          content: sub.content,
          contentStatus: 'generated',
          updatedAt: now
        })
      }
    }
  })
}
