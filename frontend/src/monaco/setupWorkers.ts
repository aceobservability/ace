import editorWorker from 'monaco-editor/editor/editor.worker?worker'

type MonacoEnvironmentWithWorker = {
  MonacoEnvironment?: {
    getWorker: () => Worker
  }
}

const globalScope = globalThis as typeof globalThis & MonacoEnvironmentWithWorker

if (typeof Worker !== 'undefined') {
  globalScope.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
  }
}
