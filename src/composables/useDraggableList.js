import { ref } from 'vue'

export const DRAG_OPTIONS = {
  animation: 150,
  ghostClass: 'ghost',
  dragClass: 'drag'
}

export function useDraggableList(onReorder = null) {
  const isDragging = ref(false)

  function startDrag() {
    isDragging.value = true
  }

  function endDrag() {
    isDragging.value = false
  }

  function handleReorder(list, callback) {
    if (callback) {
      callback(list)
    }
    if (onReorder) {
      onReorder(list)
    }
  }

  function getDragOptions(group) {
    return {
      ...DRAG_OPTIONS,
      group
    }
  }

  function getCloneDragOptions() {
    return {
      ...DRAG_OPTIONS,
      group: { name: 'clone', pull: 'clone', put: false }
    }
  }

  return {
    isDragging,
    startDrag,
    endDrag,
    handleReorder,
    getDragOptions,
    getCloneDragOptions,
    DRAG_OPTIONS
  }
}
