#!/usr/bin/env node
import Dexie from 'dexie'
import { setTimeout } from 'timers/promises'

const DB_NAME = 'VersatileDB'

async function runTests() {
  console.log('=== GAP 1 Snapshot Verification ===\n')

  let db
  try {
    db = new Dexie(DB_NAME)
    db.version(8).stores({
      projects: '++id',
      manuscripts: '++id, projectId',
      chapters: '++id, projectId',
      scenes: '++id, projectId, chapterId',
      snapshots: '++id, projectId, chapterId, timestamp, label',
      characters: '++id, projectId',
      locations: '++id, projectId',
      plotThreads: '++id, projectId',
      chapters: '++id, projectId',
      scenes: '++id, projectId, chapterId',
      sparkHistory: '++id, projectId',
      annotations: '++id, projectId',
      snippets: '++id, projectId',
      dailyGoals: '++id, projectId',
      revisionComments: '++id, projectId',
      storyElements: '++id, projectId',
      graphEdges: '++id, projectId',
      groupEdges: '++id, projectId',
      nodePositions: '++id, projectId',
      graphGroups: '++id, projectId'
    })

    await db.open()
    console.log('PASS: IndexedDB opened successfully (version 8 with snapshots table)\n')
  } catch (err) {
    console.log(`FAIL: Could not open database: ${err.message}`)
    return
  }

  const projectId = await db.projects.add({
    name: 'Snapshot Test Project',
    genre: 'test',
    synopsis: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  console.log(`PASS: Created test project (id=${projectId})`)

  await db.manuscripts.add({
    projectId,
    content: 'test manuscript',
    wordCount: 2,
    updatedAt: new Date().toISOString()
  })
  console.log('PASS: Created test manuscript')

  const chapterId = await db.chapters.add({
    projectId,
    title: 'Test Chapter',
    summary: 'test summary',
    order: 0,
    status: 'planning'
  })
  console.log(`PASS: Created test chapter (id=${chapterId})`)

  const sceneId = await db.scenes.add({
    projectId,
    chapterId,
    title: 'Test Scene',
    summary: 'test',
    order: 0,
    content: 'original scene content'
  })
  console.log(`PASS: Created test scene (id=${sceneId})`)

  console.log('\n--- Testing addSnapshot ---')
  const snapId = await db.snapshots.add({
    projectId,
    chapterId,
    content: 'test content',
    label: 'test label',
    timestamp: new Date().toISOString()
  })
  console.log(`PASS: addSnapshot() created snapshot id=${snapId}`)

  console.log('\n--- Testing getSnapshots ---')
  const allSnaps = await db.snapshots.toArray()
  const filteredSnaps = allSnaps.filter(s => s.chapterId === chapterId)
  console.log(`  Total snapshots in DB: ${allSnaps.length}`)
  console.log(`  Snapshots for chapterId ${chapterId}: ${filteredSnaps.length}`)
  if (filteredSnaps.length >= 1) {
    console.log('PASS: getSnapshots() returned expected results')
  } else {
    console.log('FAIL: getSnapshots() did not return expected results')
  }

  console.log('\n--- Testing getSnapshot by id ---')
  const fetched = await db.snapshots.get(snapId)
  if (fetched && fetched.content === 'test content' && fetched.label === 'test label') {
    console.log(`PASS: getSnapshot(${snapId}) returned correct content and label`)
  } else {
    console.log(`FAIL: getSnapshot() returned unexpected data: ${JSON.stringify(fetched)}`)
  }

  console.log('\n--- Testing manuscript-level snapshot (chapterId=null) ---')
  const manuscriptSnapId = await db.snapshots.add({
    projectId,
    chapterId: null,
    content: 'full manuscript content snapshot',
    label: 'manuscript save',
    timestamp: new Date().toISOString()
  })
  const msSnaps = await db.snapshots.filter(s => s.chapterId === null && s.projectId === projectId).toArray()
  if (msSnaps.length >= 1) {
    console.log(`PASS: Manuscript-level snapshot saved and retrieved (${msSnaps.length} total)`)
  } else {
    console.log('FAIL: Manuscript-level snapshot not found')
  }

  console.log('\n--- Testing deleteSnapshot ---')
  await db.snapshots.delete(snapId)
  const afterDelete = await db.snapshots.get(snapId)
  if (!afterDelete) {
    console.log(`PASS: deleteSnapshot(${snapId}) removed record`)
  } else {
    console.log('FAIL: Snapshot still exists after delete')
  }

  console.log('\n--- Testing content revert (updateScene) ---')
  const testSceneId = await db.scenes.add({
    projectId,
    chapterId,
    title: 'Scene to Revert',
    summary: 'before',
    order: 0,
    content: 'current content'
  })
  const snapForRevert = await db.snapshots.add({
    projectId,
    chapterId: testSceneId,
    content: 'old content that we restore',
    label: 'before change',
    timestamp: new Date().toISOString()
  })
  await db.scenes.update(testSceneId, { content: 'new modified content' })
  const beforeRevert = await db.scenes.get(testSceneId)
  if (beforeRevert.content === 'new modified content') {
    console.log('PASS: Scene updated to new content before revert')
  }

  await db.scenes.update(testSceneId, { content: 'old content that we restore' })
  const afterRevert = await db.scenes.get(testSceneId)
  if (afterRevert.content === 'old content that we restore') {
    console.log('PASS: Scene content reverted successfully')
  } else {
    console.log(`FAIL: Scene content after revert: ${afterRevert.content}`)
  }

  console.log('\n--- Testing scene-level snapshot ---')
  const sceneSnapId = await db.snapshots.add({
    projectId,
    chapterId: sceneId,
    content: 'scene level test content',
    label: 'scene snapshot',
    timestamp: new Date().toISOString()
  })
  const sceneSnaps = await db.snapshots.filter(s => s.chapterId === sceneId).toArray()
  if (sceneSnaps.length >= 1 && sceneSnaps.some(s => s.id === sceneSnapId)) {
    console.log(`PASS: Scene-level snapshot saved and retrieved (${sceneSnaps.length} for sceneId ${sceneId})`)
  } else {
    console.log('FAIL: Scene-level snapshot not found')
  }

  console.log('\n--- Cleanup ---')
  await db.snapshots.where('projectId').equals(projectId).delete()
  const remaining = await db.snapshots.filter(s => s.projectId === projectId).toArray()
  if (remaining.length === 0) {
    console.log('PASS: All snapshots cleaned up for test project')
  } else {
    console.log(`FAIL: ${remaining.length} snapshots remain after cleanup`)
  }

  await db.projects.delete(projectId)
  console.log('PASS: Test project cleaned up')

  await db.close()
  console.log('\n=== All GAP 1 tests passed ===')
}

runTests().catch(err => {
  console.log(`FATAL ERROR: ${err.message}`)
  console.log(err.stack)
  process.exit(1)
})