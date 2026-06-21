// Re-export everything from modular db service files
export { db, deepPlain } from './db-core'
export { 
  createProject, 
  updateProject, 
  getProject, 
  getAllProjects, 
  getManuscript, 
  saveManuscript,
  updateProjectMeta
} from './db-projects'
export { 
  getCharacters, 
  addCharacter, 
  updateCharacter, 
  updateCharacterPortrait, 
  getCharacterPortrait,
  deleteCharacter,
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  getPlotThreads,
  addPlotThread,
  updatePlotThread,
  deletePlotThread,
  getCharacterRelationships,
  addCharacterRelationship,
  updateCharacterRelationship,
  deleteCharacterRelationship,
  deleteCharacterRelationshipsByCharacter
} from './db-entities'
export { 
  getChapters,
  addChapter,
  updateChapter,
  deleteChapter,
  getSections,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  getScenes,
  addScene,
  updateScene,
  deleteScene,
  reorderScenes,
  getChapterWordCounts,
  getSubsections,
  addSubsection,
  updateSubsection,
  deleteSubsection,
  reorderSubsections,
  getSectionWordCounts,
  getVolumes,
  addVolume,
  updateVolume,
  deleteVolume,
  assignChapterToVolume,
  removeChapterFromVolume
} from './db-structure'
export {
  getVolumeEntities,
  addEntityToVolume,
  removeEntityFromVolume,
  removeEntityFromAllVolumes,
  getEntityVolumes,
  getVolumeEntityCount,
  getVolumeEdgeCount,
  addVolumeEdge,
  updateVolumeEdgeVolume,
  getVolumeEdges
} from './db-volume-entities'
export {
  getSparkHistory,
  addSparkHistory,
  clearSparkHistory,
  getAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  clearAnnotations,
  getSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  incrementSnippetWord,
  getRevisionComments,
  addRevisionComment,
  updateRevisionComment,
  deleteRevisionComment
} from './db-writing'
export {
  getStoryElements,
  addStoryElement,
  updateStoryElement,
  deleteStoryElement,
  getGraphEdges,
  addGraphEdge,
  updateGraphEdge,
  deleteGraphEdge,
  clearAllGraphEdges,
  getNodePositions,
  saveNodePositions,
  getNodeInstances,
  saveNodeInstances,
  getGraphGroups,
  saveGraphGroups,
  getNodeParents,
  saveNodeParents,
  getGroupEdges,
  addGroupEdge,
  updateGroupEdge,
  deleteGroupEdge,
  deleteGraphEdgesByEntity,
  removeEntityFromNodeInstances,
  removeEntityFromNodePositions,
  removeEntityFromNodeParents
} from './db-graph'
export {
  getTodayDateString,
  getDailyGoal,
  setDailyGoal,
  updateDailyWordCount,
  getStreakData,
  getLastSessionData
} from './db-goals'
export {
  exportProject,
  importProject,
  exportToPDF
} from './db-export'
export {
  getSnapshots,
  addSnapshot,
  getSnapshot,
  deleteSnapshot,
  getSceneSnapshots
} from './db-snapshots'
export {
  getStoryDocument,
  getAllStoryDocuments,
  upsertStoryDocument,
  deleteStoryDocument,
  appendRejectedPattern
} from './db-story-documents'
export {
  saveSessionArchive,
  getSessionArchive,
  searchSessionArchive,
  saveStateSnapshot,
  getLatestStateSnapshot,
  getStateSnapshotHistory,
  saveAuthorProfile,
  getAuthorProfile,
  pruneSessionArchive
} from './db-archive'
export {
  getDialogueByProject,
  getDialogueBySpeaker,
  saveDialogueEntry,
  saveDialogueBatch,
  deleteDialogueByProject,
  updateSpeakerMapping,
  reindexSection
} from './db-dialogue'
