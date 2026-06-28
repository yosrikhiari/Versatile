import { onMounted, onUnmounted } from 'vue'

export function useKeyboardShortcuts(shortcuts) {
  function handleKeydown(e) {
    const target = e.target
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.ProseMirror')
    
    if (isInput) {
      if (e.key === 'Escape') {
        if (shortcuts.onSearchClose) {
          shortcuts.onSearchClose()
        } else {
          target.blur()
        }
      }
      return
    }

    if (e.key === '?' && shortcuts.onToggleShortcuts) {
      shortcuts.onToggleShortcuts()
      return
    }
    
    if (e.key === 'f' && (e.ctrlKey || e.metaKey) && shortcuts.onExport) {
      e.preventDefault()
      shortcuts.onExport()
      return
    }
    
    if (e.key === 'i' && (e.ctrlKey || e.metaKey) && shortcuts.onImport) {
      e.preventDefault()
      shortcuts.onImport()
      return
    }
    
    if (e.key === 's' && (e.ctrlKey || e.metaKey) && shortcuts.onSave) {
      e.preventDefault()
      shortcuts.onSave()
      return
    }
    
    if (e.key === 'F' && (e.ctrlKey || e.metaKey) && e.shiftKey && shortcuts.onToggleFocusMode) {
      e.preventDefault()
      shortcuts.onToggleFocusMode()
      return
    }
    
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && shortcuts.onToggleFlow) {
      if (shortcuts.timerIsRunning) {
        shortcuts.onToggleFlow(false)
      } else {
        shortcuts.onToggleFlow(true)
      }
      return
    }

    const numberActions = {
      '1': shortcuts.onToggleSpark,
      '2': shortcuts.onTogglePolish,
      '3': shortcuts.onToggleStoryBible,
      '4': shortcuts.onToggleRevise,
      '5': shortcuts.onToggleCanvas,
      '6': shortcuts.onToggleOutline,
      '7': shortcuts.onToggleSections,
      '8': shortcuts.onToggleNetwork,
      '9': shortcuts.onToggleArchive
    }
    
    if (numberActions[e.key] && shortcuts.appShell) {
      numberActions[e.key]()
      return
    }

    if (e.key === 'g' && !e.ctrlKey && !e.metaKey && shortcuts.onToggleStoryGenerator) {
      shortcuts.onToggleStoryGenerator()
      return
    }

    if (e.key === 't' && !e.ctrlKey && !e.metaKey && shortcuts.onToggleTimeline) {
      shortcuts.onToggleTimeline()
      return
    }

    if (e.key === 'Escape' && shortcuts.onCloseModal) {
      shortcuts.onCloseModal()
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
