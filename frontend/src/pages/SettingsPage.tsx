import { Bot, Database, Edit2, Lock, Shield, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getOrganization, listMembers } from '@/api/organizations'
import { AIProviderSettings } from '@/components/settings/AIProviderSettings'
import { CopilotConnectionPanel } from '@/components/settings/CopilotConnectionPanel'
import { DataSourceSettingsPanel } from '@/components/settings/DataSourceSettingsPanel'
import { GeneralSettingsSection } from '@/components/settings/GeneralSettingsSection'
import { GroupsSettingsSection } from '@/components/settings/GroupsSettingsSection'
import { MembersSettingsSection } from '@/components/settings/MembersSettingsSection'
import {
  isSettingsSection,
  type SettingsSection,
} from '@/components/settings/settingsSections'
import { SsoSettingsSection } from '@/components/settings/SsoSettingsSection'
import { useOrganization } from '@/hooks/useOrganization'
import { useAuthStore } from '@/stores/authStore'
import type { Member, Organization } from '@/types/organization'

const SECTION_META: Array<{
  key: SettingsSection
  label: string
  icon: typeof Edit2
}> = [
  { key: 'general', label: 'General', icon: Edit2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'groups', label: 'Groups & Permissions', icon: Shield },
  { key: 'datasources', label: 'Data Sources', icon: Database },
  { key: 'ai', label: 'AI Configuration', icon: Bot },
  { key: 'sso', label: 'SSO / Auth', icon: Lock },
]

export function SettingsPage() {
  const { section: sectionParam } = useParams<{ section: string }>()
  const navigate = useNavigate()
  const { currentOrg } = useOrganization()
  const currentUserId = useAuthStore(state => state.user?.id ?? null)

  const orgId = currentOrg?.id ?? ''
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasOrgProviders, setHasOrgProviders] = useState(false)

  const activeSection: SettingsSection = isSettingsSection(sectionParam)
    ? sectionParam
    : 'general'

  useEffect(() => {
    if (!isSettingsSection(sectionParam)) {
      navigate('/app/settings/general', { replace: true })
    }
  }, [sectionParam, navigate])

  const loadData = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [orgData, membersData] = await Promise.all([
        getOrganization(orgId),
        listMembers(orgId),
      ])
      setOrg(orgData)
      setMembers(membersData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organization')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const isAdmin = org?.role === 'admin'

  if (!isSettingsSection(sectionParam) && sectionParam !== undefined) {
    return <Navigate to="/app/settings/general" replace />
  }

  return (
    <div className="flex min-h-0 flex-1" style={{ color: 'var(--color-on-surface)' }}>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <header className="mb-6">
          <h1
            className="font-display text-2xl font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Settings
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {org?.name
              ? `Manage ${org.name} profile, members, datasources, and preferences`
              : 'Manage organization profile, members, datasources, and preferences'}
          </p>
          <nav
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Settings sections"
            data-testid="settings-section-nav"
          >
            {SECTION_META.map(item => {
              const Icon = item.icon
              const active = activeSection === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  data-testid={`settings-nav-${item.key}`}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition"
                  style={{
                    backgroundColor: active
                      ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                      : 'var(--color-surface-container-high)',
                    color: active ? 'var(--color-primary)' : 'var(--color-on-surface)',
                    border: active
                      ? '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)'
                      : '1px solid var(--color-outline-variant)',
                  }}
                  onClick={() => navigate(`/app/settings/${item.key}`)}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </header>

        {loading ? (
          <div className="py-8 text-center" style={{ color: 'var(--color-outline)' }}>
            Loading...
          </div>
        ) : null}
        {!loading && error ? (
          <div className="py-8 text-center" style={{ color: 'var(--color-error)' }}>
            {error}
          </div>
        ) : null}
        {!loading && !error && !orgId ? (
          <div className="py-8 text-center" style={{ color: 'var(--color-outline)' }}>
            No organization selected.
          </div>
        ) : null}

        {!loading && !error && orgId && org ? (
          <>
            {activeSection === 'general' ? (
              <GeneralSettingsSection
                org={org}
                orgId={orgId}
                isAdmin={Boolean(isAdmin)}
                onOrgUpdated={setOrg}
              />
            ) : null}

            {activeSection === 'members' ? (
              <MembersSettingsSection
                orgId={orgId}
                isAdmin={Boolean(isAdmin)}
                currentUserId={currentUserId}
                members={members}
                onMembersChange={setMembers}
              />
            ) : null}

            {activeSection === 'groups' ? (
              <GroupsSettingsSection
                orgId={orgId}
                isAdmin={Boolean(isAdmin)}
                orgMembers={members}
              />
            ) : null}

            {activeSection === 'datasources' ? (
              <section
                className="flex max-w-3xl flex-col gap-4"
                data-testid="settings-datasources"
              >
                <div
                  className="rounded-lg p-6"
                  style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                >
                  <h2
                    className="mb-2 flex items-center gap-2 font-display text-base font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    <Database size={20} /> Data Sources
                  </h2>
                  <p
                    className="mb-4 text-sm"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    Configure connections to Prometheus, Loki, Tempo, VictoriaMetrics, and other
                    data sources.
                  </p>
                  <DataSourceSettingsPanel orgId={orgId} isAdmin={Boolean(isAdmin)} />
                </div>
              </section>
            ) : null}

            {activeSection === 'ai' ? (
              <section className="flex max-w-2xl flex-col gap-4" data-testid="settings-ai">
                <AIProviderSettings
                  orgId={orgId}
                  isAdmin={Boolean(isAdmin)}
                  onProviderCount={setHasOrgProviders}
                />
                {!hasOrgProviders ? <CopilotConnectionPanel orgId={orgId} /> : null}
              </section>
            ) : null}

            {activeSection === 'sso' ? (
              <SsoSettingsSection orgId={orgId} isAdmin={Boolean(isAdmin)} />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
