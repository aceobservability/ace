import { useCallback, useEffect, useMemo, useState } from 'react'
import { listGroups } from '@/api/groups'
import { listMembers } from '@/api/organizations'
import { listDashboardPermissions, replaceDashboardPermissions } from '@/api/permissions'
import type { Dashboard } from '@/types/dashboard'
import type { Member } from '@/types/organization'
import type {
  PrincipalType,
  ResourcePermissionEntry,
  ResourcePermissionLevel,
  UserGroup,
} from '@/types/rbac'

type DashboardPermissionsEditorProps = {
  dashboard: Dashboard
  orgId: string
}

export function DashboardPermissionsEditor({ dashboard, orgId }: DashboardPermissionsEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [entries, setEntries] = useState<ResourcePermissionEntry[]>([])

  const [newPrincipalType, setNewPrincipalType] = useState<PrincipalType>('user')
  const [newPrincipalId, setNewPrincipalId] = useState('')
  const [newPermission, setNewPermission] = useState<ResourcePermissionLevel>('view')

  const principalOptions = useMemo(() => {
    if (newPrincipalType === 'user') {
      return members.map(member => ({
        id: member.user_id,
        label: `${member.name || member.email} (${member.email})`,
      }))
    }

    return groups.map(group => ({
      id: group.id,
      label: group.name,
    }))
  }, [groups, members, newPrincipalType])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionError(null)

    try {
      const [permissionEntries, orgMembers, orgGroups] = await Promise.all([
        listDashboardPermissions(dashboard.id),
        listMembers(orgId),
        listGroups(orgId),
      ])

      setEntries(permissionEntries)
      setMembers(orgMembers)
      setGroups(orgGroups)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load dashboard permissions')
    } finally {
      setLoading(false)
    }
  }, [dashboard.id, orgId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function principalLabel(entry: ResourcePermissionEntry): string {
    if (entry.principal_type === 'user') {
      const member = members.find(item => item.user_id === entry.principal_id)
      return member
        ? `${member.name || member.email} (${member.email})`
        : `Unknown user (${entry.principal_id})`
    }

    const group = groups.find(item => item.id === entry.principal_id)
    return group ? group.name : `Unknown group (${entry.principal_id})`
  }

  function addEntry() {
    setSuccessMessage(null)
    setActionError(null)

    if (!newPrincipalId) {
      setActionError('Select a principal to add')
      return
    }

    const duplicate = entries.some(
      entry =>
        entry.principal_type === newPrincipalType && entry.principal_id === newPrincipalId,
    )

    if (duplicate) {
      setActionError('This principal already has a permission entry')
      return
    }

    setEntries(current => [
      ...current,
      {
        principal_type: newPrincipalType,
        principal_id: newPrincipalId,
        permission: newPermission,
      },
    ])
    setNewPrincipalId('')
    setNewPermission('view')
  }

  function updateEntryPermission(index: number, permission: ResourcePermissionLevel) {
    setEntries(current =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              permission,
            }
          : entry,
      ),
    )
    setSuccessMessage(null)
  }

  function removeEntry(index: number) {
    setEntries(current => current.filter((_, entryIndex) => entryIndex !== index))
    setActionError(null)
    setSuccessMessage(null)
  }

  async function savePermissions() {
    setSaving(true)
    setActionError(null)
    setSuccessMessage(null)

    try {
      const updatedEntries = await replaceDashboardPermissions(dashboard.id, {
        entries,
      })
      setEntries(updatedEntries)
      setSuccessMessage('Dashboard permissions updated')
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Failed to update dashboard permissions',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="dashboard-permissions-editor">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-on-surface)]">Permissions</h3>

      {loading ? (
        <div className="rounded-sm border border-dashed px-4 py-3 text-sm text-[var(--color-outline)]">
          Loading permissions...
        </div>
      ) : error ? (
        <div className="rounded-sm border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="mt-4 flex items-center gap-3 rounded-sm bg-[var(--color-surface-container-high)] p-3">
            <div className="grid flex-1 grid-cols-[130px_minmax(0,1fr)_120px] gap-2 max-md:grid-cols-1">
              <select
                value={newPrincipalType}
                data-testid="principal-type-select"
                disabled={saving}
                className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                onChange={event => {
                  setNewPrincipalType(event.target.value as PrincipalType)
                  setNewPrincipalId('')
                }}
              >
                <option value="user">User</option>
                <option value="group">Group</option>
              </select>
              <select
                value={newPrincipalId}
                data-testid="principal-select"
                disabled={saving || principalOptions.length === 0}
                className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                onChange={event => setNewPrincipalId(event.target.value)}
              >
                <option value="">Select {newPrincipalType}</option>
                {principalOptions.map(option => (
                  <option key={`${newPrincipalType}-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={newPermission}
                data-testid="permission-select"
                disabled={saving}
                className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                onChange={event =>
                  setNewPermission(event.target.value as ResourcePermissionLevel)
                }
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="button"
              className="cursor-pointer rounded-sm bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="add-permission-entry"
              disabled={saving}
              onClick={addEntry}
            >
              Add Entry
            </button>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-sm border border-dashed px-4 py-3 text-sm text-[var(--color-outline)]">
              No explicit ACL entries. Organization role defaults apply.
            </div>
          ) : (
            <div className="overflow-hidden rounded bg-[var(--color-surface-container-low)]">
              <div className="grid grid-cols-[1fr_auto] bg-[var(--color-surface-container-high)] px-4 py-3 font-mono text-xs uppercase tracking-[0.07em] text-[var(--color-outline)]">
                <span>Principal</span>
                <span>Actions</span>
              </div>
              {entries.map((entry, index) => (
                <div
                  key={`${entry.principal_type}-${entry.principal_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--color-on-surface-variant)] max-md:flex-col max-md:items-start"
                  data-testid={`permission-entry-${index}`}
                >
                  <div className="flex min-w-0 flex-col">
                    <strong className="truncate text-sm text-[var(--color-on-surface)]">
                      {principalLabel(entry)}
                    </strong>
                    <span className="mt-1 w-fit rounded-sm bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs uppercase tracking-wide text-[var(--color-primary)]">
                      {entry.principal_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:items-start">
                    <select
                      value={entry.permission}
                      data-testid={`entry-permission-${index}`}
                      disabled={saving}
                      className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 max-md:w-full"
                      onChange={event =>
                        updateEntryPermission(
                          index,
                          event.target.value as ResourcePermissionLevel,
                        )
                      }
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="button"
                      className="cursor-pointer text-sm font-medium text-[var(--color-error)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 max-md:w-full"
                      data-testid={`remove-entry-${index}`}
                      disabled={saving}
                      onClick={() => removeEntry(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {actionError && (
            <div className="rounded-sm border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
              {actionError}
            </div>
          )}
          {successMessage && (
            <div className="rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-2 text-sm text-[var(--color-primary)]">
              {successMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-sm bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="save-dashboard-permissions"
              disabled={saving}
              onClick={() => void savePermissions()}
            >
              {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
