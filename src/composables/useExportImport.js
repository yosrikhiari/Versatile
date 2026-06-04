import { ref } from 'vue'
import { exportProject, importProject } from '../services/dbService'
import { exportManuscriptToPDF, exportToEpub } from '../services/exportService'
import { useProjectStore } from '../stores/projectStore'
import { useNotifications } from './useNotifications'

export function useExportImport() {
  const projectStore = useProjectStore()
  
  const importStatus = ref('')
  const showImportModal = ref(false)
  const exportProgress = ref(0)
  
  const { addToast } = useNotifications()

  function resetExportProgress() {
    exportProgress.value = 0
  }

  async function handleExport() {
    if (!projectStore.currentProjectId) return
    resetExportProgress()
    exportProgress.value = 10
     
    const data = await exportProject(projectStore.currentProjectId)
    exportProgress.value = 60
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectStore.currentProjectName || 'project'}.versatile.json`
    a.click()
    URL.revokeObjectURL(url)
    exportProgress.value = 100
    addToast('Project exported', 'success')
    setTimeout(() => resetExportProgress(), 2000)
  }

  async function handleExportPDF() {
    if (!projectStore.currentProjectId) return
    await exportManuscriptToPDF(projectStore.currentProjectId, projectStore.currentProjectName)
    addToast('PDF exported', 'success')
  }

  function handleExportEpub() {
    if (!projectStore.currentProjectId) return
    exportToEpub(projectStore.currentProjectId, projectStore.currentProjectName)
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.versatile'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        importStatus.value = 'Importing...'
        showImportModal.value = true
        
        const newProjectId = await importProject(data)
        await projectStore.loadProject(newProjectId)
        
        const sparkStore = useSparkStore ? (await import('../stores/sparkStore')).useSparkStore() : null
        const polishStore = usePolishStore ? (await import('../stores/polishStore')).usePolishStore() : null
        const storyBibleStore = useStoryBibleStore ? (await import('../stores/storyBibleStore')).useStoryBibleStore() : null
        const manuscriptStore = useManuscriptStore ? (await import('../stores/manuscriptStore')).useManuscriptStore() : null
        
        if (sparkStore) await sparkStore.loadHistory(newProjectId)
        if (polishStore) {
          await polishStore.loadAnnotations(newProjectId)
          await polishStore.loadSnippets(newProjectId)
        }
        if (storyBibleStore) await storyBibleStore.loadAll(newProjectId)
        if (sparkStore) sparkStore.setProjectId(newProjectId)
        
        importStatus.value = 'Import complete!'
        addToast('Project imported', 'success')
        setTimeout(() => {
          showImportModal.value = false
        }, 1500)
      } catch (err) {
        importStatus.value = 'Import failed: ' + err.message
      }
    }
    input.click()
  }

  return {
    importStatus,
    showImportModal,
    exportProgress,
    handleExport,
    handleExportPDF,
    handleExportEpub,
    handleImport
  }
}
