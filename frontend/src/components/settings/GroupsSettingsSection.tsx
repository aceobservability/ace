import { Info, Shield, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroupMembers,
  listGroups,
  removeGroupMember,
} from '@/api/groups'
import type { Member } from '@/types/organization'
import type { UserGroup, UserGroupMembership } from '@/types/rbac'

type GroupsSettingsSectionProps = {
  orgId: string
  isAdmin: boolean
  orgMembers: Member[]
}

export function GroupsSettingsSection({
  orgId,
  isAdmin,
  orgMembers,
}: GroupsSettingsSectionProps) {
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [groupMessage, setGroupMessage] = useState<string | null>(null)
  const [groupActionError, setGroupActionError] = useState<string | null>(null)

  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false)
  const [createGroupName, setCreateGroupName] = useState('')
  const [createGroupDescription, setCreateGroupDescription] = useState('')
  const [createGroupLoading, setCreateGroupLoading] = useState(false)

  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([])
  const [groupMembersById, setGroupMembersById] = useState<
    Record<string, UserGroupMembership[]>
  >({})
  const [groupMembersLoading, setGroupMembersLoading] = useState<Record<string, boolean>>({})
  const [groupMembersError, setGroupMembersError] = useState<Record<string, string | null>>({})
  const [groupMemberActionLoading, setGroupMemberActionLoading] = useState<
    Record<string, boolean>
  >({})
  const [addMemberUserIdByGroup, setAddMemberUserIdByGroup] = useState<Record<string, string>>({})

  const orgMemberOptions = useMemo(
    () =>
      [...orgMembers].sort((a, b) =>
        (a.name || a.email).localeCompare(b.name || b.email, undefined, {
          sensitivity: 'base',
        }),
      ),
    [orgMembers],
  )

  const resetGroupMessages = useCallback(() => {
    setGroupMessage(null)
    setGroupActionError(null)
  }, [])

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    setGroupsError(null)
    try {
      const data = await listGroups(orgId)
      setGroups(data)
      const valid = new Set(data.map(g => g.id))
      setExpandedGroupIds(prev => prev.filter(id => valid.has(id)))
    } catch (e) {
      setGroups([])
      setGroupsError(e instanceof Error ? e.message : 'Failed to load groups')
    } finally {
      setGroupsLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  function startCreateGroup() {
    setShowCreateGroupForm(true)
    setCreateGroupName('')
    setCreateGroupDescription('')
    resetGroupMessages()
  }

  function cancelCreateGroup() {
    setShowCreateGroupForm(false)
    setCreateGroupName('')
    setCreateGroupDescription('')
    resetGroupMessages()
  }

  async function handleCreateGroup() {
    const name = createGroupName.trim()
    if (!name) {
      setGroupActionError('Group name is required')
      return
    }
    setCreateGroupLoading(true)
    resetGroupMessages()
    try {
      await createGroup(orgId, {
        name,
        description: createGroupDescription.trim() || undefined,
      })
      setGroupMessage('Group created')
      setShowCreateGroupForm(false)
      setCreateGroupName('')
      setCreateGroupDescription('')
      await loadGroups()
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed to create group')
    } finally {
      setCreateGroupLoading(false)
    }
  }

  async function handleDeleteGroup(group: UserGroup) {
    if (!window.confirm(`Delete group "${group.name}"?`)) return
    setGroupMemberActionLoading(prev => ({ ...prev, [group.id]: true }))
    resetGroupMessages()
    try {
      await deleteGroup(orgId, group.id)
      setGroupMessage('Group deleted')
      setGroupMembersById(prev => {
        const next = { ...prev }
        delete next[group.id]
        return next
      })
      await loadGroups()
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed to delete group')
    } finally {
      setGroupMemberActionLoading(prev => ({ ...prev, [group.id]: false }))
    }
  }

  async function loadGroupMembers(groupId: string) {
    setGroupMembersLoading(prev => ({ ...prev, [groupId]: true }))
    setGroupMembersError(prev => ({ ...prev, [groupId]: null }))
    try {
      const members = await listGroupMembers(orgId, groupId)
      setGroupMembersById(prev => ({ ...prev, [groupId]: members }))
    } catch (e) {
      setGroupMembersError(prev => ({
        ...prev,
        [groupId]: e instanceof Error ? e.message : 'Failed to load members',
      }))
    } finally {
      setGroupMembersLoading(prev => ({ ...prev, [groupId]: false }))
    }
  }

  async function toggleGroupMembers(groupId: string) {
    if (expandedGroupIds.includes(groupId)) {
      setExpandedGroupIds(prev => prev.filter(id => id !== groupId))
      return
    }
    setExpandedGroupIds(prev => [...prev, groupId])
    if (!groupMembersById[groupId] && !groupMembersLoading[groupId]) {
      await loadGroupMembers(groupId)
    }
  }

  function availableMembersForGroup(groupId: string): Member[] {
    const existing = new Set((groupMembersById[groupId] ?? []).map(m => m.user_id))
    return orgMemberOptions.filter(m => !existing.has(m.user_id))
  }

  async function handleAddGroupMember(groupId: string) {
    const userId = addMemberUserIdByGroup[groupId]
    if (!userId) {
      setGroupActionError('Select a member to add')
      return
    }
    setGroupMemberActionLoading(prev => ({ ...prev, [groupId]: true }))
    resetGroupMessages()
    try {
      const membership = await addGroupMember(orgId, groupId, { user_id: userId })
      setGroupMembersById(prev => ({
        ...prev,
        [groupId]: [...(prev[groupId] ?? []), membership],
      }))
      setAddMemberUserIdByGroup(prev => ({ ...prev, [groupId]: '' }))
      setGroupMessage('Member added to group')
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed to add group member')
    } finally {
      setGroupMemberActionLoading(prev => ({ ...prev, [groupId]: false }))
    }
  }

  async function handleRemoveGroupMember(groupId: string, member: UserGroupMembership) {
    if (!window.confirm(`Remove ${member.email} from this group?`)) return
    const actionKey = `${groupId}:${member.user_id}`
    setGroupMemberActionLoading(prev => ({ ...prev, [actionKey]: true }))
    resetGroupMessages()
    try {
      await removeGroupMember(orgId, groupId, member.user_id)
      setGroupMembersById(prev => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).filter(m => m.user_id !== member.user_id),
      }))
      setGroupMessage('Member removed from group')
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed to remove group member')
    } finally {
      setGroupMemberActionLoading(prev => ({ ...prev, [actionKey]: false }))
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4" data-testid="settings-groups">
      <div
        className="mb-4 flex items-start gap-2 rounded-md p-3"
        style={{
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline)',
        }}
      >
        <Info
          size={16}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--color-on-surface-variant)' }}
        />
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Groups here manage access to specific dashboards and folders. SSO group-to-role mappings
          are configured in the{' '}
          <Link className="underline" to="/app/settings/sso">
            SSO / Auth
          </Link>{' '}
          tab.
        </p>
      </div>

      <div
        className="rounded-lg p-6"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="m-0 flex items-center gap-2 font-display text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            <Shield size={20} /> Groups ({groups.length})
          </h2>
          {isAdmin && !showCreateGroupForm ? (
            <button
              type="button"
              className="cursor-pointer rounded-sm px-3 py-1.5 text-sm font-semibold transition"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                color: '#fff',
                border: 'none',
              }}
              data-testid="new-group-button"
              onClick={startCreateGroup}
            >
              New Group
            </button>
          ) : null}
        </div>

        {groupMessage ? (
          <div
            className="mt-3 rounded-sm px-3.5 py-2.5 text-sm break-all"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              color: 'var(--color-primary)',
            }}
            data-testid="group-action-success"
          >
            {groupMessage}
          </div>
        ) : null}
        {groupActionError ? (
          <div
            className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}
            data-testid="group-action-error"
          >
            {groupActionError}
          </div>
        ) : null}

        {showCreateGroupForm && isAdmin ? (
          <div
            className="mb-4 rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          >
            <div className="mb-4">
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
                htmlFor="create-group-name"
              >
                Group Name
              </label>
              <input
                id="create-group-name"
                value={createGroupName}
                onChange={e => setCreateGroupName(e.target.value)}
                type="text"
                data-testid="create-group-name"
                className="w-full rounded-sm px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={createGroupLoading}
              />
            </div>
            <div className="mb-4">
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
                htmlFor="create-group-description"
              >
                Description (optional)
              </label>
              <input
                id="create-group-description"
                value={createGroupDescription}
                onChange={e => setCreateGroupDescription(e.target.value)}
                type="text"
                data-testid="create-group-description"
                className="w-full rounded-sm px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={createGroupLoading}
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                onClick={cancelCreateGroup}
                disabled={createGroupLoading}
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
                data-testid="create-group-submit"
                onClick={() => void handleCreateGroup()}
                disabled={createGroupLoading}
              >
                {createGroupLoading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        ) : null}

        {groupsLoading ? (
          <div className="rounded-sm p-3.5 text-sm" style={{ color: 'var(--color-outline)' }}>
            Loading groups...
          </div>
        ) : null}
        {groupsError ? (
          <div
            className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}
          >
            {groupsError}
          </div>
        ) : null}
        {!groupsLoading && !groupsError && groups.length === 0 ? (
          <div className="rounded-sm p-3.5 text-sm" style={{ color: 'var(--color-outline)' }}>
            No groups yet.
          </div>
        ) : null}
        {!groupsLoading && groups.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groups.map(group => {
              const expanded = expandedGroupIds.includes(group.id)
              const members = groupMembersById[group.id] ?? []
              const available = availableMembersForGroup(group.id)
              const selectedUserId = addMemberUserIdByGroup[group.id] ?? ''
              return (
                <article
                  key={group.id}
                  className="rounded-lg p-3.5"
                  style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                  data-testid={`group-card-${group.id}`}
                >
                  <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
                    <div className="min-w-0">
                      <h3 className="m-0 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                        {group.name}
                      </h3>
                      <p
                        className="my-1 text-xs"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {group.description || 'No description'}
                      </p>
                      <span
                        className="font-mono text-xs"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        {members.length} members
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition"
                        style={{
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                        data-testid={`toggle-group-members-${group.id}`}
                        onClick={() => void toggleGroupMembers(group.id)}
                      >
                        {expanded ? 'Hide Members' : 'Show Members'}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-semibold transition"
                          style={{
                            backgroundColor: 'var(--color-error)',
                            color: '#fff',
                            border: 'none',
                          }}
                          data-testid={`delete-group-${group.id}`}
                          onClick={() => void handleDeleteGroup(group)}
                          disabled={groupMemberActionLoading[group.id]}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {expanded ? (
                    <div
                      className="mt-3 border-t pt-3"
                      style={{ borderColor: 'var(--color-outline)' }}
                    >
                      {groupMembersLoading[group.id] ? (
                        <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
                          Loading members...
                        </p>
                      ) : null}
                      {groupMembersError[group.id] ? (
                        <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                          {groupMembersError[group.id]}
                        </p>
                      ) : null}
                      {!groupMembersLoading[group.id] && members.length === 0 ? (
                        <p
                          className="text-xs"
                          style={{ color: 'var(--color-outline)' }}
                          data-testid={`group-empty-${group.id}`}
                        >
                          No members in this group.
                        </p>
                      ) : null}
                      {members.map(member => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-2 py-1.5 text-xs"
                          style={{ color: 'var(--color-on-surface)' }}
                          data-testid={`group-member-${group.id}-${member.user_id}`}
                        >
                          <div className="min-w-0">
                            <span className="block">{member.name || member.email}</span>
                            <span style={{ color: 'var(--color-on-surface-variant)' }}>
                              {member.email}
                            </span>
                          </div>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ color: 'var(--color-on-surface-variant)' }}
                              data-testid={`remove-group-member-${group.id}-${member.user_id}`}
                              title="Remove from group"
                              disabled={groupMemberActionLoading[`${group.id}:${member.user_id}`]}
                              onClick={() => void handleRemoveGroupMember(group.id, member)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      ))}

                      {isAdmin ? (
                        <div
                          className="mt-3 flex flex-col gap-2 md:flex-row"
                          data-testid={`add-group-member-form-${group.id}`}
                        >
                          <select
                            value={selectedUserId}
                            onChange={e =>
                              setAddMemberUserIdByGroup(prev => ({
                                ...prev,
                                [group.id]: e.target.value,
                              }))
                            }
                            data-testid={`add-group-member-select-${group.id}`}
                            className="flex-1 cursor-pointer rounded-sm px-2 py-2 text-xs focus:outline-none"
                            style={{
                              backgroundColor: 'var(--color-surface-container-low)',
                              color: 'var(--color-on-surface)',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                            disabled={
                              groupMemberActionLoading[group.id] || available.length === 0
                            }
                          >
                            <option value="">
                              {available.length === 0
                                ? 'All org members already added'
                                : 'Select member to add'}
                            </option>
                            {available.map(member => (
                              <option key={member.user_id} value={member.user_id}>
                                {member.name || member.email} ({member.email})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-sm px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                            style={{
                              background:
                                'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                              color: '#fff',
                              border: 'none',
                            }}
                            data-testid={`add-group-member-submit-${group.id}`}
                            onClick={() => void handleAddGroupMember(group.id)}
                            disabled={
                              !selectedUserId ||
                              groupMemberActionLoading[group.id] ||
                              available.length === 0
                            }
                          >
                            <UserPlus size={14} /> Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
