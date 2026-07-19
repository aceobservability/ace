import { Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  createInvitation,
  removeMember,
  updateMemberRole,
} from '@/api/organizations'
import type { Member, MembershipRole } from '@/types/organization'

type MembersSettingsSectionProps = {
  orgId: string
  isAdmin: boolean
  currentUserId: string | null
  members: Member[]
  onMembersChange: (members: Member[]) => void
}

const ROLE_OPTIONS: MembershipRole[] = ['viewer', 'editor', 'admin', 'auditor']

function countAdmins(members: Member[]): number {
  return members.filter(m => m.role === 'admin').length
}

export function MembersSettingsSection({
  orgId,
  isAdmin,
  currentUserId,
  members,
  onMembersChange,
}: MembersSettingsSectionProps) {
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MembershipRole>('viewer')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const adminCount = useMemo(() => countAdmins(members), [members])

  function isSelf(member: Member): boolean {
    return Boolean(currentUserId && member.user_id === currentUserId)
  }

  function isLastAdmin(member: Member): boolean {
    return member.role === 'admin' && adminCount <= 1
  }

  function canChangeRole(member: Member, newRole: MembershipRole): string | null {
    if (isSelf(member) && member.role === 'admin' && newRole !== 'admin') {
      return 'You cannot demote yourself. Ask another admin to change your role.'
    }
    if (isLastAdmin(member) && newRole !== 'admin') {
      return 'Cannot demote the last admin. Promote another member first.'
    }
    return null
  }

  function canRemove(member: Member): string | null {
    if (isSelf(member)) {
      return 'You cannot remove yourself from the organization.'
    }
    if (isLastAdmin(member)) {
      return 'Cannot remove the last admin. Promote another member first.'
    }
    return null
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      setInviteError('Email is required')
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    setInviteSuccess(null)
    try {
      const invitation = await createInvitation(orgId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      // Never render raw invite tokens in the DOM — they are secrets.
      setInviteSuccess(`Invitation sent to ${invitation.email}`)
      setInviteEmail('')
      setInviteRole('viewer')
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleRoleChange(member: Member, newRole: MembershipRole) {
    const blocked = canChangeRole(member, newRole)
    if (blocked) {
      window.alert(blocked)
      return
    }
    try {
      await updateMemberRole(orgId, member.user_id, { role: newRole })
      onMembersChange(
        members.map(m => (m.id === member.id ? { ...m, role: newRole } : m)),
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to update role')
    }
  }

  async function handleRemoveMember(member: Member) {
    const blocked = canRemove(member)
    if (blocked) {
      window.alert(blocked)
      return
    }
    if (!window.confirm(`Remove ${member.email} from this organization?`)) return
    try {
      await removeMember(orgId, member.user_id)
      onMembersChange(members.filter(m => m.id !== member.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to remove member')
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4" data-testid="settings-members">
      <div
        className="rounded-lg p-6"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="m-0 flex items-center gap-2 font-display text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            <Users size={20} /> Members ({members.length})
          </h2>
          {isAdmin ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-semibold transition"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                color: '#fff',
                border: 'none',
              }}
              data-testid="org-invite-btn"
              onClick={() => setShowInviteForm(prev => !prev)}
            >
              <UserPlus size={16} /> Invite
            </button>
          ) : null}
        </div>

        {showInviteForm && isAdmin ? (
          <div
            className="mb-4 rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          >
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                type="email"
                placeholder="Email address"
                data-testid="org-invite-email-input"
                className="flex-1 rounded-sm px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={inviteLoading}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as MembershipRole)}
                data-testid="org-invite-role-select"
                className="w-full cursor-pointer rounded-sm px-3 py-2.5 text-sm focus:outline-none md:w-[120px]"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={inviteLoading}
              >
                {ROLE_OPTIONS.map(role => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                  color: '#fff',
                  border: 'none',
                }}
                data-testid="org-invite-submit-btn"
                onClick={() => void handleInvite()}
                disabled={inviteLoading}
              >
                {inviteLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
            {inviteError ? (
              <div
                className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  color: 'var(--color-error)',
                }}
                data-testid="org-invite-error"
              >
                {inviteError}
              </div>
            ) : null}
            {inviteSuccess ? (
              <div
                className="mt-3 rounded-sm px-3.5 py-2.5 text-sm break-all"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                  color: 'var(--color-primary)',
                }}
                data-testid="org-invite-success"
              >
                {inviteSuccess}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2" data-testid="members-list">
          {members.map(member => {
            const self = isSelf(member)
            const lastAdmin = isLastAdmin(member)
            const removeBlocked = canRemove(member)
            const roleDisabled = self || lastAdmin

            return (
              <div
                key={member.id}
                data-testid={`member-row-${member.id}`}
                className="flex items-center gap-3 rounded-lg p-3"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-sm font-semibold"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                    color: '#fff',
                  }}
                >
                  {(member.name || member.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    {member.name || member.email}
                    {self ? (
                      <span
                        className="ml-2 text-xs font-normal"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        (you)
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="block overflow-hidden text-xs text-ellipsis whitespace-nowrap"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {member.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <select
                      value={member.role}
                      data-testid={`member-role-${member.id}`}
                      onChange={e =>
                        void handleRoleChange(member, e.target.value as MembershipRole)
                      }
                      disabled={roleDisabled}
                      title={
                        self
                          ? 'You cannot change your own role'
                          : lastAdmin
                            ? 'Cannot demote the last admin'
                            : undefined
                      }
                      className="w-auto cursor-pointer rounded-sm px-2 py-1.5 text-xs focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--color-surface-container-low)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                    >
                      {ROLE_OPTIONS.map(role => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className="font-mono text-xs capitalize"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      {member.role}
                    </span>
                  )}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                      data-testid={`member-remove-${member.id}`}
                      onClick={() => void handleRemoveMember(member)}
                      disabled={Boolean(removeBlocked)}
                      title={removeBlocked ?? 'Remove member'}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
          {members.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-outline)' }}>
              No members yet.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
