import {
  AlertTriangle,
  Check,
  ChevronDown,
  Edit2,
  Info,
  Loader2,
  Lock,
  Plus,
  Shield,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getGoogleSSOConfig,
  getMicrosoftSSOConfig,
  getOktaSSOConfig,
  testOktaConnection,
  updateGoogleSSOConfig,
  updateMicrosoftSSOConfig,
  updateOktaSSOConfig,
} from '@/api/sso'
import {
  createRoleMapping,
  deleteRoleMapping,
  listRoleMappings,
  type SSOConfigRoleMapping,
} from '@/api/ssoRoleMappings'

type SsoProviderKey = 'google' | 'microsoft' | 'okta'

type SsoSettingsSectionProps = {
  orgId: string
  isAdmin: boolean
}

function roleBadgeStyle(role: string): React.CSSProperties {
  if (role === 'admin') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
      color: 'var(--color-error)',
    }
  }
  if (role === 'editor') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
      color: 'var(--color-primary)',
    }
  }
  if (role === 'auditor') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-info) 15%, transparent)',
      color: 'var(--color-info)',
    }
  }
  return {
    backgroundColor: 'color-mix(in srgb, var(--color-on-surface-variant) 15%, transparent)',
    color: 'var(--color-on-surface-variant)',
  }
}

export function SsoSettingsSection({ orgId, isAdmin }: SsoSettingsSectionProps) {
  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoNotice, setSsoNotice] = useState<string | null>(null)

  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [googleSaving, setGoogleSaving] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const [microsoftTenantId, setMicrosoftTenantId] = useState('')
  const [microsoftClientId, setMicrosoftClientId] = useState('')
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState('')
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false)
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false)
  const [microsoftSaving, setMicrosoftSaving] = useState(false)
  const [microsoftError, setMicrosoftError] = useState<string | null>(null)

  const [oktaDomain, setOktaDomain] = useState('')
  const [oktaClientId, setOktaClientId] = useState('')
  const [oktaClientSecret, setOktaClientSecret] = useState('')
  const [oktaGroupsClaimName, setOktaGroupsClaimName] = useState('groups')
  const [oktaDefaultRole, setOktaDefaultRole] = useState('viewer')
  const [oktaEnabled, setOktaEnabled] = useState(false)
  const [oktaConfigured, setOktaConfigured] = useState(false)
  const [oktaSaving, setOktaSaving] = useState(false)
  const [oktaError, setOktaError] = useState<string | null>(null)
  const [oktaTestStatus, setOktaTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle',
  )
  const [oktaTestMessage, setOktaTestMessage] = useState('')

  const [oktaRoleMappings, setOktaRoleMappings] = useState<SSOConfigRoleMapping[]>([])
  const [oktaRoleMappingsLoading, setOktaRoleMappingsLoading] = useState(false)
  const [showAddMappingForm, setShowAddMappingForm] = useState(false)
  const [newMappingGroup, setNewMappingGroup] = useState('')
  const [newMappingRole, setNewMappingRole] = useState('viewer')
  const [addMappingLoading, setAddMappingLoading] = useState(false)
  const [addMappingError, setAddMappingError] = useState<string | null>(null)

  const [activeSsoProvider, setActiveSsoProvider] = useState<SsoProviderKey | null>(null)
  const [ssoDialogOpen, setSsoDialogOpen] = useState(false)
  const [showAddProviderDropdown, setShowAddProviderDropdown] = useState(false)

  const resetSSOMessages = useCallback(() => {
    setSsoNotice(null)
    setGoogleError(null)
    setMicrosoftError(null)
    setOktaError(null)
  }, [])

  const loadOktaRoleMappings = useCallback(async () => {
    setOktaRoleMappingsLoading(true)
    try {
      setOktaRoleMappings(await listRoleMappings(orgId, 'okta'))
    } catch {
      setOktaRoleMappings([])
    } finally {
      setOktaRoleMappingsLoading(false)
    }
  }, [orgId])

  const loadGoogleConfig = useCallback(async () => {
    setGoogleError(null)
    setGoogleClientSecret('')
    try {
      const config = await getGoogleSSOConfig(orgId)
      setGoogleClientId(config.client_id)
      setGoogleEnabled(config.enabled)
      setGoogleConfigured(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load Google SSO'
      if (msg === 'Google SSO not configured') {
        setGoogleClientId('')
        setGoogleEnabled(false)
        setGoogleConfigured(false)
        return
      }
      setGoogleError(msg)
    }
  }, [orgId])

  const loadMicrosoftConfig = useCallback(async () => {
    setMicrosoftError(null)
    setMicrosoftClientSecret('')
    try {
      const config = await getMicrosoftSSOConfig(orgId)
      setMicrosoftTenantId(config.tenant_id)
      setMicrosoftClientId(config.client_id)
      setMicrosoftEnabled(config.enabled)
      setMicrosoftConfigured(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load Microsoft SSO'
      if (msg === 'Microsoft SSO not configured') {
        setMicrosoftTenantId('')
        setMicrosoftClientId('')
        setMicrosoftEnabled(false)
        setMicrosoftConfigured(false)
        return
      }
      setMicrosoftError(msg)
    }
  }, [orgId])

  const loadOktaConfig = useCallback(async () => {
    setOktaError(null)
    setOktaClientSecret('')
    try {
      const config = await getOktaSSOConfig(orgId)
      if (config) {
        setOktaDomain(config.tenant_id)
        setOktaClientId(config.client_id)
        setOktaGroupsClaimName(config.groups_claim_name || 'groups')
        setOktaDefaultRole(config.default_role || 'viewer')
        setOktaEnabled(config.enabled)
        setOktaConfigured(true)
        await loadOktaRoleMappings()
      } else {
        setOktaDomain('')
        setOktaClientId('')
        setOktaGroupsClaimName('groups')
        setOktaDefaultRole('viewer')
        setOktaEnabled(false)
        setOktaConfigured(false)
      }
    } catch (e) {
      setOktaError(e instanceof Error ? e.message : 'Failed to load Okta SSO')
    }
  }, [orgId, loadOktaRoleMappings])

  const loadSSOConfigs = useCallback(async () => {
    setSsoLoading(true)
    resetSSOMessages()
    await Promise.all([loadGoogleConfig(), loadMicrosoftConfig(), loadOktaConfig()])
    setSsoLoading(false)
  }, [loadGoogleConfig, loadMicrosoftConfig, loadOktaConfig, resetSSOMessages])

  useEffect(() => {
    void loadSSOConfigs()
  }, [loadSSOConfigs])

  const ssoProviders = useMemo(
    () => [
      {
        key: 'google' as const,
        name: 'Google',
        issuer: 'accounts.google.com',
        configured: googleConfigured,
        enabled: googleEnabled,
        mappingCount: 0,
      },
      {
        key: 'microsoft' as const,
        name: 'Microsoft',
        issuer: microsoftTenantId
          ? `login.microsoftonline.com/${microsoftTenantId}`
          : 'login.microsoftonline.com',
        configured: microsoftConfigured,
        enabled: microsoftEnabled,
        mappingCount: 0,
      },
      {
        key: 'okta' as const,
        name: 'Okta',
        issuer: oktaDomain ? `${oktaDomain}.okta.com` : 'okta.com',
        configured: oktaConfigured,
        enabled: oktaEnabled,
        mappingCount: oktaRoleMappings.length,
      },
    ],
    [
      googleConfigured,
      googleEnabled,
      microsoftConfigured,
      microsoftEnabled,
      microsoftTenantId,
      oktaConfigured,
      oktaDomain,
      oktaEnabled,
      oktaRoleMappings.length,
    ],
  )

  const configuredSsoProviders = ssoProviders.filter(p => p.configured)
  const unconfiguredSsoProviders = ssoProviders.filter(p => !p.configured)
  const activeSsoLabel =
    ssoProviders.find(p => p.key === activeSsoProvider)?.name ?? ''

  function openSsoProvider(provider: SsoProviderKey) {
    setSsoDialogOpen(true)
    setActiveSsoProvider(provider)
    resetSSOMessages()
    setOktaTestStatus('idle')
    setOktaTestMessage('')
    setAddMappingError(null)
    setShowAddMappingForm(false)
  }

  function closeSsoDialog() {
    setSsoDialogOpen(false)
    setActiveSsoProvider(null)
    resetSSOMessages()
    setShowAddProviderDropdown(false)
  }

  function selectNewProvider(providerKey: SsoProviderKey) {
    setShowAddProviderDropdown(false)
    openSsoProvider(providerKey)
  }

  async function handleSaveGoogleSSO() {
    if (!isAdmin) return
    const cId = googleClientId.trim()
    const cSecret = googleClientSecret.trim()
    if (!cId) {
      setGoogleError('Client ID is required')
      return
    }
    if (!cSecret) {
      setGoogleError('Client secret is required')
      return
    }
    setGoogleSaving(true)
    setGoogleError(null)
    setSsoNotice(null)
    try {
      const updated = await updateGoogleSSOConfig(orgId, {
        client_id: cId,
        client_secret: cSecret,
        enabled: googleEnabled,
      })
      setGoogleClientId(updated.client_id)
      setGoogleEnabled(updated.enabled)
      setGoogleConfigured(true)
      setGoogleClientSecret('')
      setSsoNotice('Google SSO settings saved')
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Failed to save Google SSO settings')
    } finally {
      setGoogleSaving(false)
    }
  }

  async function handleSaveMicrosoftSSO() {
    if (!isAdmin) return
    const tId = microsoftTenantId.trim()
    const cId = microsoftClientId.trim()
    const cSecret = microsoftClientSecret.trim()
    if (!tId) {
      setMicrosoftError('Tenant ID is required')
      return
    }
    if (!cId) {
      setMicrosoftError('Client ID is required')
      return
    }
    if (!cSecret) {
      setMicrosoftError('Client secret is required')
      return
    }
    setMicrosoftSaving(true)
    setMicrosoftError(null)
    setSsoNotice(null)
    try {
      const updated = await updateMicrosoftSSOConfig(orgId, {
        tenant_id: tId,
        client_id: cId,
        client_secret: cSecret,
        enabled: microsoftEnabled,
      })
      setMicrosoftTenantId(updated.tenant_id)
      setMicrosoftClientId(updated.client_id)
      setMicrosoftEnabled(updated.enabled)
      setMicrosoftConfigured(true)
      setMicrosoftClientSecret('')
      setSsoNotice('Microsoft SSO settings saved')
    } catch (e) {
      setMicrosoftError(e instanceof Error ? e.message : 'Failed to save Microsoft SSO settings')
    } finally {
      setMicrosoftSaving(false)
    }
  }

  async function handleSaveOktaSSO() {
    if (!isAdmin) return
    const domain = oktaDomain.trim()
    const cId = oktaClientId.trim()
    const cSecret = oktaClientSecret.trim()
    if (!domain) {
      setOktaError('Okta domain is required')
      return
    }
    if (domain.includes(' ') || domain.includes('://')) {
      setOktaError('Enter the Okta domain only (e.g. dev-12345), not a full URL')
      return
    }
    if (!cId) {
      setOktaError('Client ID is required')
      return
    }
    if (!cSecret) {
      setOktaError('Client secret is required')
      return
    }
    setOktaSaving(true)
    setOktaError(null)
    setSsoNotice(null)
    try {
      const updated = await updateOktaSSOConfig(orgId, {
        tenant_id: domain,
        client_id: cId,
        client_secret: cSecret,
        groups_claim_name: oktaGroupsClaimName || 'groups',
        default_role: oktaDefaultRole || 'viewer',
        enabled: oktaEnabled,
      })
      setOktaDomain(updated.tenant_id)
      setOktaClientId(updated.client_id)
      setOktaGroupsClaimName(updated.groups_claim_name)
      setOktaDefaultRole(updated.default_role)
      setOktaEnabled(updated.enabled)
      setOktaConfigured(true)
      setOktaClientSecret('')
      setSsoNotice('Okta SSO settings saved')
    } catch (e) {
      setOktaError(e instanceof Error ? e.message : 'Failed to save Okta SSO settings')
    } finally {
      setOktaSaving(false)
    }
  }

  async function handleTestOktaConnection() {
    setOktaTestStatus('testing')
    setOktaTestMessage('')
    try {
      const result = await testOktaConnection(orgId)
      if (result.status === 'connected') {
        setOktaTestStatus('success')
        setOktaTestMessage(result.message || 'Connected — OIDC discovery verified')
      } else {
        setOktaTestStatus('error')
        setOktaTestMessage(result.message || 'Connection test failed')
      }
    } catch (e) {
      setOktaTestStatus('error')
      setOktaTestMessage(e instanceof Error ? e.message : 'Connection test failed')
    }
  }

  async function handleAddRoleMapping() {
    const group = newMappingGroup.trim()
    if (!group) {
      setAddMappingError('Group name is required')
      return
    }
    setAddMappingLoading(true)
    setAddMappingError(null)
    try {
      const mapping = await createRoleMapping(orgId, 'okta', {
        sso_group_name: group,
        ace_role: newMappingRole,
      })
      setOktaRoleMappings(prev => [...prev, mapping])
      setNewMappingGroup('')
      setNewMappingRole('viewer')
      setShowAddMappingForm(false)
    } catch (e) {
      setAddMappingError(e instanceof Error ? e.message : 'Failed to create role mapping')
    } finally {
      setAddMappingLoading(false)
    }
  }

  async function handleDeleteRoleMapping(mappingId: string) {
    try {
      await deleteRoleMapping(orgId, 'okta', mappingId)
      setOktaRoleMappings(prev => prev.filter(m => m.id !== mappingId))
    } catch (e) {
      setOktaError(e instanceof Error ? e.message : 'Failed to delete role mapping')
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4" data-testid="settings-sso">
      <div
        className="rounded-lg p-6"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2
            className="m-0 flex items-center gap-2 font-display text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            <Lock size={20} /> SSO / Auth
          </h2>
          {isAdmin && configuredSsoProviders.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-semibold transition"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                  color: '#fff',
                  border: 'none',
                }}
                data-testid="add-provider-btn"
                onClick={() => setShowAddProviderDropdown(prev => !prev)}
              >
                <Plus size={16} /> Add Provider <ChevronDown size={14} />
              </button>
              {showAddProviderDropdown ? (
                <div
                  className="absolute top-full right-0 z-10 mt-1 w-48 rounded-md py-1"
                  style={{
                    backgroundColor: 'var(--color-surface-bright)',
                    border: '1px solid var(--color-outline-variant)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.32), 0 2px 4px rgba(0,0,0,0.20)',
                  }}
                  data-testid="add-provider-dropdown"
                >
                  {ssoProviders.map(provider => (
                    <button
                      key={provider.key}
                      type="button"
                      className="w-full cursor-pointer border-none px-3 py-2 text-left text-sm transition"
                      style={{
                        backgroundColor: 'transparent',
                        color: provider.configured
                          ? 'var(--color-on-surface-variant)'
                          : 'var(--color-on-surface)',
                        opacity: provider.configured ? 0.5 : 1,
                      }}
                      disabled={provider.configured}
                      data-testid={`add-provider-${provider.key}`}
                      onClick={() => {
                        if (!provider.configured) selectNewProvider(provider.key)
                      }}
                    >
                      {provider.name}
                      {provider.configured ? (
                        <span className="ml-1 text-xs">(configured)</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Configure SSO providers and authentication settings for your organization.
        </p>

        {ssoLoading ? (
          <div className="p-3.5 text-sm" style={{ color: 'var(--color-outline)' }}>
            Loading SSO settings...
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <article
              className="flex flex-col gap-2.5 rounded-lg p-3.5"
              style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              data-testid="sso-provider-password"
            >
              <div>
                <h3 className="m-0 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  Email/Password
                </h3>
                <p
                  className="mt-1 mb-0 text-xs"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  Built-in authentication method available for all organizations.
                </p>
              </div>
              <span
                className="inline-flex w-fit rounded-sm px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)',
                  color: 'var(--color-secondary)',
                }}
              >
                Enabled
              </span>
            </article>

            {configuredSsoProviders.map(provider => (
              <div
                key={provider.key}
                className="flex flex-col gap-2.5 rounded-lg p-3.5 transition"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                data-testid={`sso-provider-${provider.key}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                      {provider.name}
                    </h3>
                    <p
                      className="mt-1 mb-0 truncate font-mono text-xs"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {provider.issuer}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {provider.mappingCount > 0 ? (
                      <span
                        className="text-xs"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {provider.mappingCount} mapping
                        {provider.mappingCount !== 1 ? 's' : ''}
                      </span>
                    ) : null}
                    <span
                      className="inline-flex rounded-sm px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: provider.enabled
                          ? 'color-mix(in srgb, var(--color-secondary) 15%, transparent)'
                          : 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)',
                        color: provider.enabled
                          ? 'var(--color-secondary)'
                          : 'var(--color-tertiary)',
                      }}
                    >
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        data-testid={`edit-sso-${provider.key}`}
                        aria-label={`Configure ${provider.name} SSO`}
                        onClick={() => openSsoProvider(provider.key)}
                      >
                        <Edit2 size={14} className="mr-1 inline" /> Settings
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {configuredSsoProviders.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-lg px-4 py-8 text-center"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                data-testid="sso-empty-state"
              >
                <Shield size={40} style={{ color: 'var(--color-outline)' }} />
                <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  Connect an identity provider to enable single sign-on for your team.
                </p>
                <p className="m-0 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Supports Google, Microsoft, Okta
                </p>
                {isAdmin ? (
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                        color: '#fff',
                        border: 'none',
                      }}
                      data-testid="add-provider-empty-btn"
                      onClick={() => setShowAddProviderDropdown(prev => !prev)}
                    >
                      <Plus size={16} /> Add Provider <ChevronDown size={14} />
                    </button>
                    {showAddProviderDropdown ? (
                      <div
                        className="absolute top-full left-1/2 z-10 mt-1 w-48 -translate-x-1/2 rounded-md py-1"
                        style={{
                          backgroundColor: 'var(--color-surface-bright)',
                          border: '1px solid var(--color-outline-variant)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.32), 0 2px 4px rgba(0,0,0,0.20)',
                        }}
                        data-testid="add-provider-empty-dropdown"
                      >
                        {unconfiguredSsoProviders.map(p => (
                          <button
                            key={p.key}
                            type="button"
                            className="w-full cursor-pointer border-none px-3 py-2 text-left text-sm transition"
                            style={{
                              backgroundColor: 'transparent',
                              color: 'var(--color-on-surface)',
                            }}
                            data-testid={`add-provider-empty-${p.key}`}
                            onClick={() => selectNewProvider(p.key)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {ssoNotice ? (
          <div
            className="mt-3 rounded-sm px-3.5 py-2.5 text-sm break-all"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            {ssoNotice}
          </div>
        ) : null}
      </div>

      {ssoDialogOpen ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          data-testid="sso-config-modal"
        >
          <button
            type="button"
            aria-label="Close SSO configuration"
            className="absolute inset-0 cursor-default border-none p-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={closeSsoDialog}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${activeSsoLabel} SSO Settings`}
            className="relative max-h-[90vh] w-[min(640px,calc(100vw-2rem))] max-w-[640px] overflow-y-auto rounded-lg p-6"
            style={{
              backgroundColor: 'var(--color-surface-bright)',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h3
                  className="mb-1 text-base"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {activeSsoLabel} SSO Settings
                </h3>
                <p className="mb-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Update credentials and enable status for this provider.
                </p>
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                data-testid="close-sso-config"
                onClick={closeSsoDialog}
              >
                Close
              </button>
            </div>

            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              data-testid="sso-config-panel"
            >
              {activeSsoProvider === 'google' ? (
                <div data-testid="google-sso-card">
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="google-client-id"
                    >
                      Client ID
                    </label>
                    <input
                      id="google-client-id"
                      value={googleClientId}
                      onChange={e => setGoogleClientId(e.target.value)}
                      type="text"
                      data-testid="google-client-id"
                      aria-label="Google Client ID"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || googleSaving}
                    />
                  </div>
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="google-client-secret"
                    >
                      Client Secret
                    </label>
                    <input
                      id="google-client-secret"
                      value={googleClientSecret}
                      onChange={e => setGoogleClientSecret(e.target.value)}
                      type="password"
                      data-testid="google-client-secret"
                      aria-label="Google Client Secret"
                      placeholder="Enter to update"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || googleSaving}
                    />
                  </div>
                  <label
                    className="m-0 inline-flex items-center gap-2 text-sm"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    <input
                      checked={googleEnabled}
                      onChange={e => setGoogleEnabled(e.target.checked)}
                      type="checkbox"
                      data-testid="google-enabled"
                      className="m-0 w-auto"
                      disabled={!isAdmin || googleSaving}
                    />
                    Enable Google SSO
                  </label>
                  {googleError ? (
                    <div
                      className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                        color: 'var(--color-error)',
                      }}
                    >
                      {googleError}
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-3 flex justify-end gap-3">
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        onClick={closeSsoDialog}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                          color: '#fff',
                          border: 'none',
                        }}
                        data-testid="save-google-sso"
                        disabled={googleSaving}
                        onClick={() => void handleSaveGoogleSSO()}
                      >
                        {googleSaving ? 'Saving...' : 'Save Google SSO'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeSsoProvider === 'microsoft' ? (
                <div data-testid="microsoft-sso-card">
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="microsoft-tenant-id"
                    >
                      Tenant ID
                    </label>
                    <input
                      id="microsoft-tenant-id"
                      value={microsoftTenantId}
                      onChange={e => setMicrosoftTenantId(e.target.value)}
                      type="text"
                      data-testid="microsoft-tenant-id"
                      aria-label="Microsoft Tenant ID"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || microsoftSaving}
                    />
                  </div>
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="microsoft-client-id"
                    >
                      Client ID
                    </label>
                    <input
                      id="microsoft-client-id"
                      value={microsoftClientId}
                      onChange={e => setMicrosoftClientId(e.target.value)}
                      type="text"
                      data-testid="microsoft-client-id"
                      aria-label="Microsoft Client ID"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || microsoftSaving}
                    />
                  </div>
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="microsoft-client-secret"
                    >
                      Client Secret
                    </label>
                    <input
                      id="microsoft-client-secret"
                      value={microsoftClientSecret}
                      onChange={e => setMicrosoftClientSecret(e.target.value)}
                      type="password"
                      data-testid="microsoft-client-secret"
                      aria-label="Microsoft Client Secret"
                      placeholder="Enter to update"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || microsoftSaving}
                    />
                  </div>
                  <label
                    className="m-0 inline-flex items-center gap-2 text-sm"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    <input
                      checked={microsoftEnabled}
                      onChange={e => setMicrosoftEnabled(e.target.checked)}
                      type="checkbox"
                      data-testid="microsoft-enabled"
                      className="m-0 w-auto"
                      disabled={!isAdmin || microsoftSaving}
                    />
                    Enable Microsoft SSO
                  </label>
                  {microsoftError ? (
                    <div
                      className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                        color: 'var(--color-error)',
                      }}
                    >
                      {microsoftError}
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-3 flex justify-end gap-3">
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        onClick={closeSsoDialog}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                          color: '#fff',
                          border: 'none',
                        }}
                        data-testid="save-microsoft-sso"
                        disabled={microsoftSaving}
                        onClick={() => void handleSaveMicrosoftSSO()}
                      >
                        {microsoftSaving ? 'Saving...' : 'Save Microsoft SSO'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeSsoProvider === 'okta' ? (
                <div data-testid="okta-sso-card">
                  <div
                    className="mb-4 flex gap-3 rounded-md p-3"
                    style={{
                      backgroundColor: 'var(--color-surface-container-low)',
                      border: '1px solid var(--color-outline)',
                    }}
                    data-testid="okta-setup-callout"
                  >
                    <Info
                      size={18}
                      className="mt-0.5 shrink-0"
                      style={{ color: 'var(--color-info)' }}
                    />
                    <p
                      className="m-0 text-xs leading-relaxed"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      To enable group-to-role mapping, configure a &quot;groups&quot; claim in your
                      Okta authorization server. This allows Ace to automatically assign roles based
                      on your Okta group memberships.
                    </p>
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                        htmlFor="okta-domain"
                      >
                        Okta Domain
                      </label>
                      <input
                        id="okta-domain"
                        value={oktaDomain}
                        onChange={e => setOktaDomain(e.target.value)}
                        type="text"
                        data-testid="okta-domain"
                        aria-label="Okta Domain"
                        placeholder="dev-12345"
                        className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        disabled={!isAdmin || oktaSaving}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                        htmlFor="okta-client-id"
                      >
                        Client ID
                      </label>
                      <input
                        id="okta-client-id"
                        value={oktaClientId}
                        onChange={e => setOktaClientId(e.target.value)}
                        type="text"
                        data-testid="okta-client-id"
                        aria-label="Okta Client ID"
                        className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        disabled={!isAdmin || oktaSaving}
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      htmlFor="okta-client-secret"
                    >
                      Client Secret
                    </label>
                    <input
                      id="okta-client-secret"
                      value={oktaClientSecret}
                      onChange={e => setOktaClientSecret(e.target.value)}
                      type="password"
                      data-testid="okta-client-secret"
                      aria-label="Okta Client Secret"
                      placeholder="Enter to update"
                      className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                      disabled={!isAdmin || oktaSaving}
                    />
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                        htmlFor="okta-groups-claim"
                      >
                        Groups Claim Name
                      </label>
                      <input
                        id="okta-groups-claim"
                        value={oktaGroupsClaimName}
                        onChange={e => setOktaGroupsClaimName(e.target.value)}
                        type="text"
                        data-testid="okta-groups-claim"
                        aria-label="Groups Claim Name"
                        placeholder="groups"
                        className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        disabled={!isAdmin || oktaSaving}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                        htmlFor="okta-default-role"
                      >
                        Default Role
                      </label>
                      <select
                        id="okta-default-role"
                        value={oktaDefaultRole}
                        onChange={e => setOktaDefaultRole(e.target.value)}
                        data-testid="okta-default-role"
                        aria-label="Default Role"
                        className="w-full cursor-pointer rounded-sm px-3 py-2.5 text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        disabled={!isAdmin || oktaSaving}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                        <option value="auditor">Auditor</option>
                      </select>
                    </div>
                  </div>

                  <label
                    className="m-0 inline-flex items-center gap-2 text-sm"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    <input
                      checked={oktaEnabled}
                      onChange={e => setOktaEnabled(e.target.checked)}
                      type="checkbox"
                      data-testid="okta-enabled"
                      className="m-0 w-auto"
                      disabled={!isAdmin || oktaSaving}
                    />
                    Enable Okta SSO
                  </label>

                  {oktaError ? (
                    <div
                      className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                        color: 'var(--color-error)',
                      }}
                      data-testid="okta-error"
                    >
                      {oktaError}
                    </div>
                  ) : null}

                  {isAdmin ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition"
                          style={{
                            backgroundColor: 'var(--color-surface-container-low)',
                            color: 'var(--color-on-surface)',
                            border: '1px solid var(--color-outline-variant)',
                          }}
                          data-testid="okta-test-connection"
                          disabled={oktaTestStatus === 'testing' || !oktaConfigured}
                          onClick={() => void handleTestOktaConnection()}
                        >
                          {oktaTestStatus === 'testing' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          Test Connection
                        </button>
                        {oktaTestStatus === 'success' ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: 'var(--color-secondary)' }}
                            data-testid="okta-test-success"
                          >
                            <Check size={14} /> {oktaTestMessage}
                          </span>
                        ) : null}
                        {oktaTestStatus === 'error' ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: 'var(--color-error)' }}
                            data-testid="okta-test-error"
                          >
                            <AlertTriangle size={14} /> {oktaTestMessage}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                          style={{
                            backgroundColor: 'var(--color-surface-container-low)',
                            color: 'var(--color-on-surface)',
                            border: '1px solid var(--color-outline-variant)',
                          }}
                          onClick={closeSsoDialog}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                          style={{
                            background:
                              'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                            color: '#fff',
                            border: 'none',
                          }}
                          data-testid="save-okta-sso"
                          disabled={oktaSaving}
                          onClick={() => void handleSaveOktaSSO()}
                        >
                          {oktaSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                          {oktaSaving ? 'Saving...' : 'Save Configuration'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {oktaConfigured ? (
                    <div
                      className="mt-6 border-t pt-4"
                      style={{ borderColor: 'var(--color-outline)' }}
                      data-testid="okta-role-mappings-section"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h4
                          className="m-0 text-sm font-semibold"
                          style={{ color: 'var(--color-on-surface)' }}
                        >
                          Group → Role Mapping
                        </h4>
                        {isAdmin && !showAddMappingForm ? (
                          <button
                            type="button"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-medium transition"
                            style={{
                              backgroundColor: 'var(--color-surface-container-low)',
                              color: 'var(--color-on-surface)',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                            data-testid="add-mapping-btn"
                            onClick={() => {
                              setShowAddMappingForm(true)
                              setAddMappingError(null)
                            }}
                          >
                            <Plus size={14} /> Add Mapping
                          </button>
                        ) : null}
                      </div>

                      {showAddMappingForm ? (
                        <div
                          className="mb-3 flex flex-col gap-2 rounded-md p-3"
                          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                          data-testid="add-mapping-form"
                        >
                          <div className="flex flex-col gap-2 md:flex-row">
                            <input
                              value={newMappingGroup}
                              onChange={e => setNewMappingGroup(e.target.value)}
                              type="text"
                              placeholder="SSO group name"
                              aria-label="SSO Group Name"
                              className="flex-1 rounded-sm px-3 py-2 font-mono text-sm focus:outline-none"
                              style={{
                                backgroundColor: 'var(--color-surface-container-high)',
                                color: 'var(--color-on-surface)',
                                border: '1px solid var(--color-outline-variant)',
                              }}
                              disabled={addMappingLoading}
                              data-testid="new-mapping-group"
                            />
                            <select
                              value={newMappingRole}
                              onChange={e => setNewMappingRole(e.target.value)}
                              aria-label="Ace Role"
                              className="w-full cursor-pointer rounded-sm px-3 py-2 text-sm focus:outline-none md:w-[120px]"
                              style={{
                                backgroundColor: 'var(--color-surface-container-high)',
                                color: 'var(--color-on-surface)',
                                border: '1px solid var(--color-outline-variant)',
                              }}
                              disabled={addMappingLoading}
                              data-testid="new-mapping-role"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Admin</option>
                              <option value="auditor">Auditor</option>
                            </select>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="cursor-pointer rounded-sm px-3 py-2 text-sm font-semibold transition"
                                style={{
                                  background:
                                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                                  color: '#fff',
                                  border: 'none',
                                }}
                                disabled={addMappingLoading}
                                data-testid="add-mapping-submit"
                                onClick={() => void handleAddRoleMapping()}
                              >
                                {addMappingLoading ? 'Adding...' : 'Add'}
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium transition"
                                style={{
                                  backgroundColor: 'transparent',
                                  color: 'var(--color-on-surface-variant)',
                                  border: '1px solid var(--color-outline-variant)',
                                }}
                                disabled={addMappingLoading}
                                onClick={() => {
                                  setShowAddMappingForm(false)
                                  setAddMappingError(null)
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          {addMappingError ? (
                            <div
                              className="rounded-sm px-3 py-2 text-xs"
                              style={{
                                backgroundColor:
                                  'color-mix(in srgb, var(--color-error) 10%, transparent)',
                                color: 'var(--color-error)',
                              }}
                              data-testid="add-mapping-error"
                            >
                              {addMappingError}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {oktaRoleMappingsLoading ? (
                        <div className="p-3 text-sm" style={{ color: 'var(--color-outline)' }}>
                          Loading mappings...
                        </div>
                      ) : null}
                      {!oktaRoleMappingsLoading && oktaRoleMappings.length === 0 ? (
                        <div
                          className="p-3 text-sm"
                          style={{ color: 'var(--color-outline)' }}
                          data-testid="no-mappings-message"
                        >
                          No group mappings. Users will get the default role ({oktaDefaultRole}).
                        </div>
                      ) : null}
                      {!oktaRoleMappingsLoading && oktaRoleMappings.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {oktaRoleMappings.map(mapping => (
                            <div
                              key={mapping.id}
                              className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                              style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                              data-testid={`mapping-row-${mapping.id}`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="truncate font-mono text-sm"
                                  style={{ color: 'var(--color-on-surface)' }}
                                >
                                  {mapping.sso_group_name}
                                </span>
                                <span
                                  className="shrink-0 text-xs"
                                  style={{ color: 'var(--color-outline)' }}
                                >
                                  →
                                </span>
                                <span
                                  className="inline-flex shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium capitalize"
                                  style={roleBadgeStyle(mapping.ace_role)}
                                >
                                  {mapping.ace_role}
                                </span>
                              </div>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition"
                                  style={{ color: 'var(--color-on-surface-variant)' }}
                                  data-testid={`delete-mapping-${mapping.id}`}
                                  aria-label={`Delete mapping for ${mapping.sso_group_name}`}
                                  onClick={() => void handleDeleteRoleMapping(mapping.id)}
                                >
                                  <X size={14} />
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
