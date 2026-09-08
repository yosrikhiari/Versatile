import { watch, toRaw, onUnmounted } from 'vue'

const GROUP_SAVE_DEBOUNCE_MS = 500
const PARENTS_SAVE_DEBOUNCE_MS = 500

/**
 * Debounced persistence for the story-graph canvas state.
 *
 * Extracted from StoryNetwork.vue: the two deep watchers (manual groups,
 * node parents) plus their timers are a self-contained unit — everything
 * else in the component renders or mutates, this only persists.
 *
 * Contract:
 * - saves are trailing-edge debounced per collection (drag ticks coalesce);
 * - nothing is written without a project id;
 * - pending writes flush on unmount so the last drag before navigating
 *   away is not lost (previously a sub-500ms unmount could drop it).
 *
 * @param manualGroups ref<Array> of group objects ({ id, ... })
 * @param nodeParents ref<Record<nodeId, groupId | null>>
 * @param getProjectId () => current project id or null
 * @param saveGroups (projectId, groups) => Promise | void
 * @param saveNodeParents (projectId, parents) => Promise | void
 */
export function useStoryGraphPersistence(
  manualGroups: any,
  nodeParents: any,
  getProjectId: () => string | null,
  saveGroups: (projectId: string, groups: any) => unknown,
  saveNodeParents: (projectId: string, parents: any) => unknown
) {
  let groupSaveTimer: any = null
  let nodeParentsSaveTimer: any = null

  function saveGroupsNow() {
    const projectId = getProjectId()
    if (!projectId) return
    groupSaveTimer = null
    saveGroups(projectId, toRaw(manualGroups.value))
  }

  function saveParentsNow() {
    const projectId = getProjectId()
    if (!projectId) return
    nodeParentsSaveTimer = null
    saveNodeParents(projectId, toRaw(nodeParents.value))
  }

  function scheduleGroups() {
    if (!getProjectId()) return
    clearTimeout(groupSaveTimer)
    groupSaveTimer = setTimeout(saveGroupsNow, GROUP_SAVE_DEBOUNCE_MS)
  }

  function scheduleParents() {
    if (!getProjectId()) return
    clearTimeout(nodeParentsSaveTimer)
    nodeParentsSaveTimer = setTimeout(saveParentsNow, PARENTS_SAVE_DEBOUNCE_MS)
  }

  watch(() => manualGroups.value, scheduleGroups, { deep: true })
  watch(() => nodeParents.value, scheduleParents, { deep: true })

  onUnmounted(() => {
    // Flush, don't drop: a navigation mid-drag still persists the canvas.
    if (groupSaveTimer) {
      clearTimeout(groupSaveTimer)
      saveGroupsNow()
    }
    if (nodeParentsSaveTimer) {
      clearTimeout(nodeParentsSaveTimer)
      saveParentsNow()
    }
  })

  return { scheduleGroups, scheduleParents }
}
