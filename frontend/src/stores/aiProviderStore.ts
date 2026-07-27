import { create } from 'zustand'
import {
  listAIModels,
  listAIProviders,
  type AIProviderInfo,
} from '@/api/aiProviders'

export type AIModel = {
  id: string
  name: string
  vendor: string
  category: string
  provider_id?: string
  provider_name?: string
}

type AIProviderState = {
  providers: AIProviderInfo[]
  selectedProviderId: string
  models: AIModel[]
  selectedModel: string
  isLoading: boolean
  error: string | null
  orgId: string | null

  resetForOrg: (orgId: string | null) => void
  fetchProviders: (orgId: string | null) => Promise<void>
  fetchModels: (orgId: string | null, providerId?: string) => Promise<void>
  setSelectedModel: (modelId: string) => void
  setSelectedProviderId: (providerId: string) => void
}

function pickDefaultModel(models: AIModel[], current: string): string {
  if (models.length === 0) return ''
  if (current && models.some(model => model.id === current)) return current
  return models[0]!.id
}

function pickDefaultProvider(providers: AIProviderInfo[], current: string): string {
  if (providers.length === 0) return ''
  if (current && providers.some(provider => provider.id === current)) return current
  return providers[0]!.id
}

export const useAIProviderStore = create<AIProviderState>((set, get) => ({
  providers: [],
  selectedProviderId: '',
  models: [],
  selectedModel: '',
  isLoading: false,
  error: null,
  orgId: null,

  resetForOrg(orgId) {
    if (get().orgId === orgId) return
    set({
      providers: [],
      selectedProviderId: '',
      models: [],
      selectedModel: '',
      error: null,
      orgId,
    })
  },

  async fetchProviders(orgId) {
    set({ error: null })
    if (!orgId) return

    try {
      const providers = await listAIProviders(orgId)
      const selectedProviderId = pickDefaultProvider(providers, get().selectedProviderId)
      set({ providers, selectedProviderId })
    } catch (cause) {
      set({
        error: cause instanceof Error ? cause.message : 'Failed to fetch providers',
      })
    }
  },

  async fetchModels(orgId, providerId) {
    if (!orgId) return

    try {
      const models = (await listAIModels(orgId, providerId)) as AIModel[]
      const selectedModel = pickDefaultModel(models, get().selectedModel)
      set({ models, selectedModel })
    } catch {
      // model list is best-effort for generation UX
    }
  },

  setSelectedModel(modelId) {
    set({ selectedModel: modelId })
  },

  setSelectedProviderId(providerId) {
    set({ selectedProviderId: providerId })
  },
}))
