import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEvalStore = defineStore('eval', () => {
  const results = ref<any[]>([])

  function addResult(entry: any) {
    results.value.push(entry)
  }

  function setResults(entries: any[]) {
    results.value = entries
  }

  function clearResults() {
    results.value = []
  }

  return { results, addResult, setResults, clearResults }
})
