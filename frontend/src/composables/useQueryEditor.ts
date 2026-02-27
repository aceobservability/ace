import { ref } from 'vue'

interface QueryEditorHandle {
  setQuery: (query: string) => void
  execute: () => void
  getQuery: () => string
}

const currentEditor = ref<QueryEditorHandle | null>(null)

export function useQueryEditor() {
  function register(handle: QueryEditorHandle) {
    currentEditor.value = handle
  }

  function unregister() {
    currentEditor.value = null
  }

  function setQuery(query: string): boolean {
    if (!currentEditor.value) return false
    currentEditor.value.setQuery(query)
    return true
  }

  function execute(): boolean {
    if (!currentEditor.value) return false
    currentEditor.value.execute()
    return true
  }

  function getQuery(): string {
    return currentEditor.value?.getQuery() ?? ''
  }

  function hasEditor(): boolean {
    return currentEditor.value !== null
  }

  return {
    register,
    unregister,
    setQuery,
    execute,
    getQuery,
    hasEditor,
  }
}
