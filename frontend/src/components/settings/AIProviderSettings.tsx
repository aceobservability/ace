import {
  Check,
  Loader2,
  MoreVertical,
  Plus,
  Settings2,
  TestTube2,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  type AIProviderInfo,
  type CreateProviderRequest,
  createAIProvider,
  deleteAIProvider,
  listAIModels,
  listAIProviders,
  testAIProvider,
  type UpdateProviderRequest,
  updateAIProvider,
} from '@/api/aiProviders'

type AIProviderSettingsProps = {
  orgId: string
  isAdmin: boolean
  onProviderCount?: (count: number) => void
}

const URL_HINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  custom: '',
}

function truncateUrl(url: string | undefined, max = 40): string {
  if (!url) return ''
  if (url.length <= max) return url
  return `${url.slice(0, max)}...`
}

export function AIProviderSettings({
  orgId,
  isAdmin,
  onProviderCount,
}: AIProviderSettingsProps) {
  const [providers, setProviders] = useState<AIProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({})

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formType, setFormType] = useState('openai')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [formRateLimitPerUser, setFormRateLimitPerUser] = useState(0)
  const [formRateLimitWindowSeconds, setFormRateLimitWindowSeconds] = useState(3600)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    success: boolean
    models_count?: number
    error?: string
  } | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<AIProviderInfo | null>(null)

  const loadProviders = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const list = await listAIProviders(orgId)
      setProviders(list)
      onProviderCount?.(list.length)

      const counts: Record<string, number> = {}
      await Promise.all(
        list.map(async p => {
          try {
            const models = await listAIModels(orgId, p.id)
            counts[p.id] = models.length
          } catch {
            // Fall back to models_override count.
          }
        }),
      )
      setModelCounts(counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }, [orgId, onProviderCount])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  function modelCount(provider: AIProviderInfo): number {
    return modelCounts[provider.id] ?? provider.models_override?.length ?? 0
  }

  function openAddForm() {
    setEditingId(null)
    setFormType('openai')
    setFormDisplayName('')
    setFormBaseUrl(URL_HINTS.openai)
    setFormApiKey('')
    setFormEnabled(true)
    setFormRateLimitPerUser(0)
    setFormRateLimitWindowSeconds(3600)
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(provider: AIProviderInfo) {
    setEditingId(provider.id)
    setFormType(provider.provider_type)
    setFormDisplayName(provider.display_name)
    setFormBaseUrl(provider.base_url)
    setFormApiKey('')
    setFormEnabled(provider.enabled)
    setFormRateLimitPerUser(provider.rate_limit_per_user ?? 0)
    setFormRateLimitWindowSeconds(provider.rate_limit_window_seconds ?? 3600)
    setFormError(null)
    setShowForm(true)
    setOpenMenuId(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  function onTypeChange(type: string) {
    setFormType(type)
    if (!editingId) {
      setFormBaseUrl(URL_HINTS[type] ?? '')
    }
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault()
    setFormLoading(true)
    setFormError(null)
    try {
      if (editingId) {
        const data: UpdateProviderRequest = {
          display_name: formDisplayName,
          base_url: formBaseUrl,
          enabled: formEnabled,
          rate_limit_per_user: formRateLimitPerUser,
          rate_limit_window_seconds: formRateLimitWindowSeconds,
        }
        if (formApiKey) data.api_key = formApiKey
        await updateAIProvider(orgId, editingId, data)
      } else {
        const data: CreateProviderRequest = {
          provider_type: formType,
          display_name: formDisplayName,
          base_url: formBaseUrl,
          enabled: formEnabled,
          rate_limit_per_user: formRateLimitPerUser,
          rate_limit_window_seconds: formRateLimitWindowSeconds,
        }
        if (formApiKey) data.api_key = formApiKey
        await createAIProvider(orgId, data)
      }
      setShowForm(false)
      setEditingId(null)
      await loadProviders()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setFormLoading(false)
    }
  }

  async function runTest(provider: AIProviderInfo) {
    setOpenMenuId(null)
    setTestingId(provider.id)
    setTestResult(null)
    try {
      setTestResult(await testAIProvider(orgId, provider.id))
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : 'Test failed' })
    } finally {
      setTestingId(null)
    }
  }

  async function confirmDelete() {
    if (!deletingProvider) return
    try {
      await deleteAIProvider(orgId, deletingProvider.id)
      setDeletingProvider(null)
      await loadProviders()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setDeletingProvider(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="ai-providers-loading">
        {[1, 2].map(i => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-sm"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ai-provider-settings">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
          {providers.length} provider{providers.length !== 1 ? 's' : ''}
        </span>
        {isAdmin ? (
          <button
            type="button"
            data-testid="add-provider-btn"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border-none px-3.5 py-2 text-sm font-medium transition"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onClick={openAddForm}
          >
            <Plus size={16} /> Add Provider
          </button>
        ) : null}
      </div>

      {providers.length === 0 && !showForm ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg px-8 py-12 text-center"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        >
          <Settings2 size={40} style={{ color: 'var(--color-outline)' }} />
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            No providers configured. Add one to enable AI chat for your team.
          </p>
        </div>
      ) : null}

      {providers.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {providers.map(provider => (
            <li
              key={provider.id}
              className="flex items-center justify-between gap-4 rounded-lg px-4 py-3 transition-colors"
              style={{ backgroundColor: 'var(--color-surface-container-low)' }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    {provider.display_name}
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--color-outline)' }}>
                    {truncateUrl(provider.base_url)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className="inline-flex rounded-sm px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                    color: 'var(--color-primary)',
                  }}
                >
                  {modelCount(provider)} models
                </span>
                {provider.rate_limit_per_user > 0 ? (
                  <span
                    className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 10%, transparent)',
                      color: 'var(--color-tertiary)',
                    }}
                  >
                    {provider.rate_limit_per_user}/
                    {provider.rate_limit_window_seconds >= 3600
                      ? `${provider.rate_limit_window_seconds / 3600}hr`
                      : `${provider.rate_limit_window_seconds / 60}min`}
                  </span>
                ) : null}
                <span
                  data-testid="status-badge"
                  className="inline-flex rounded-sm px-2 py-0.5 text-xs font-medium"
                  title={provider.enabled ? 'Provider is enabled' : 'Provider is disabled'}
                  style={{
                    backgroundColor: provider.enabled
                      ? 'color-mix(in srgb, var(--color-secondary) 15%, transparent)'
                      : 'color-mix(in srgb, var(--color-outline) 15%, transparent)',
                    color: provider.enabled ? 'var(--color-secondary)' : 'var(--color-outline)',
                  }}
                >
                  {provider.enabled ? 'Enabled' : 'Disabled'}
                </span>

                {isAdmin ? (
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="provider-menu-btn"
                      className="inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 transition"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      onClick={() =>
                        setOpenMenuId(openMenuId === provider.id ? null : provider.id)
                      }
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === provider.id ? (
                      <div
                        className="absolute top-full right-0 z-10 mt-1 min-w-[140px] rounded-lg py-1 shadow-lg"
                        style={{
                          backgroundColor: 'var(--color-surface-container-high)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                      >
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm transition"
                          style={{ color: 'var(--color-on-surface)' }}
                          onClick={() => openEditForm(provider)}
                        >
                          <Settings2 size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          data-testid={`test-provider-${provider.id}`}
                          aria-label={`Test connection for ${provider.display_name}`}
                          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm transition"
                          style={{ color: 'var(--color-on-surface)' }}
                          onClick={() => void runTest(provider)}
                        >
                          <TestTube2 size={14} /> Test
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-provider-${provider.id}`}
                          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm transition"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => {
                            setOpenMenuId(null)
                            setDeletingProvider(provider)
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {testingId ? (
        <div
          className="flex items-center gap-2 rounded-sm px-4 py-2 text-sm"
          data-testid="test-spinner"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <Loader2 size={16} className="animate-spin" /> Testing connection...
        </div>
      ) : null}
      {testResult && !testingId ? (
        <div
          className="flex items-center gap-2 rounded-sm px-4 py-2 text-sm"
          style={{
            backgroundColor: testResult.success
              ? 'color-mix(in srgb, var(--color-secondary) 10%, transparent)'
              : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: testResult.success ? 'var(--color-secondary)' : 'var(--color-error)',
          }}
        >
          {testResult.success ? <Check size={16} /> : <X size={16} />}
          {testResult.success ? (
            <span>Connected, {testResult.models_count} models found</span>
          ) : (
            <span>Connection failed: {testResult.error}</span>
          )}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-sm px-4 py-2 text-sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          data-testid="provider-form"
          className="flex flex-col gap-3 rounded-lg p-4"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-outline-variant)',
          }}
          onSubmit={e => void submitForm(e)}
        >
          <h3 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {editingId ? 'Edit Provider' : 'Add Provider'}
          </h3>

          <label
            className="flex flex-col gap-1 text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Provider Type
            <select
              value={formType}
              data-testid="form-provider-type"
              className="rounded-sm px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              disabled={Boolean(editingId)}
              onChange={e => onTypeChange(e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label
            className="flex flex-col gap-1 text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Display Name
            <input
              value={formDisplayName}
              onChange={e => setFormDisplayName(e.target.value)}
              data-testid="form-display-name"
              type="text"
              required
              className="rounded-sm px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              placeholder="e.g. Production OpenAI"
            />
          </label>

          <label
            className="flex flex-col gap-1 text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Base URL
            <input
              value={formBaseUrl}
              onChange={e => setFormBaseUrl(e.target.value)}
              data-testid="form-base-url"
              type="text"
              required
              className="rounded-sm px-3 py-2 font-mono text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              placeholder="https://api.example.com/v1"
            />
          </label>

          <label
            className="flex flex-col gap-1 text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            API Key
            <input
              value={formApiKey}
              onChange={e => setFormApiKey(e.target.value)}
              data-testid="form-api-key"
              type="password"
              className="rounded-sm px-3 py-2 font-mono text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              placeholder={editingId ? 'Leave blank to keep current' : 'Optional'}
            />
          </label>

          <label
            className="flex cursor-pointer items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <input
              checked={formEnabled}
              onChange={e => setFormEnabled(e.target.checked)}
              type="checkbox"
              className="m-0 w-auto"
            />
            Enabled
          </label>

          <div className="flex gap-3">
            <label
              className="flex flex-1 flex-col gap-1 text-xs font-medium"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Rate limit per user (0 = unlimited)
              <input
                value={formRateLimitPerUser}
                onChange={e => setFormRateLimitPerUser(Number(e.target.value))}
                type="number"
                min={0}
                className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              />
            </label>
            <label
              className="flex flex-1 flex-col gap-1 text-xs font-medium"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Window (seconds)
              <input
                value={formRateLimitWindowSeconds}
                onChange={e => setFormRateLimitWindowSeconds(Number(e.target.value))}
                type="number"
                min={60}
                className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              />
            </label>
          </div>

          {formError ? (
            <div className="text-xs" style={{ color: 'var(--color-error)' }}>
              {formError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-sm border px-3 py-1.5 text-sm font-medium transition"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-on-surface)',
                borderColor: 'var(--color-outline-variant)',
              }}
              onClick={cancelForm}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-sm border-none px-3 py-1.5 text-sm font-medium transition"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              disabled={formLoading}
            >
              {formLoading ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
              {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      ) : null}

      {deletingProvider ? (
        <div
          data-testid="delete-confirm"
          className="flex flex-col gap-3 rounded-lg p-4"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-error)',
          }}
        >
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface)' }}>
            Are you sure you want to delete <strong>{deletingProvider.display_name}</strong>? This
            action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              data-testid="delete-confirm-no"
              type="button"
              className="cursor-pointer rounded-sm border px-3 py-1.5 text-sm font-medium transition"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-on-surface)',
                borderColor: 'var(--color-outline-variant)',
              }}
              onClick={() => setDeletingProvider(null)}
            >
              Cancel
            </button>
            <button
              data-testid="delete-confirm-yes"
              type="button"
              className="cursor-pointer rounded-sm border-none px-3 py-1.5 text-sm font-medium transition"
              style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
              onClick={() => void confirmDelete()}
            >
              <Trash2 size={14} className="mr-1 inline" /> Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
