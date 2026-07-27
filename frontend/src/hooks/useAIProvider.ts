import { useEffect } from 'react'
import { useOrganization } from '@/hooks/useOrganization'
import { useAIProviderStore } from '@/stores/aiProviderStore'

export type { AIModel } from '@/stores/aiProviderStore'
export type {
  ChatRequestMessage,
  ToolCall,
  ToolDefinition,
} from '@/api/aiChat'

/**
 * Provider/model selection for the current org.
 * Chat transcripts are owned by CopilotChatSession — not this hook.
 */
export function useAIProvider() {
  const { currentOrgId } = useOrganization()

  const providers = useAIProviderStore(state => state.providers)
  const selectedProviderId = useAIProviderStore(state => state.selectedProviderId)
  const models = useAIProviderStore(state => state.models)
  const selectedModel = useAIProviderStore(state => state.selectedModel)
  const isLoading = useAIProviderStore(state => state.isLoading)
  const error = useAIProviderStore(state => state.error)
  const resetForOrg = useAIProviderStore(state => state.resetForOrg)
  const fetchProvidersAction = useAIProviderStore(state => state.fetchProviders)
  const fetchModelsAction = useAIProviderStore(state => state.fetchModels)
  const setSelectedModel = useAIProviderStore(state => state.setSelectedModel)
  const setSelectedProviderId = useAIProviderStore(state => state.setSelectedProviderId)

  useEffect(() => {
    resetForOrg(currentOrgId)
  }, [currentOrgId, resetForOrg])

  return {
    providers,
    selectedProviderId,
    models,
    selectedModel,
    isLoading,
    error,
    fetchProviders: () => fetchProvidersAction(currentOrgId),
    fetchModels: (providerId?: string) => fetchModelsAction(currentOrgId, providerId),
    setSelectedModel,
    setSelectedProviderId,
  }
}
