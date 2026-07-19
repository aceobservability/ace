import { Trash2, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import {
  createInvitation,
  removeMember,
  updateMemberRole,
} from '@/api/organizations'
import type { Member, MembershipRole } from '@/types/organization'

type MembersSettingsSectionProps = {
  orgId: string
  isAdmin: boolean
  members: Member[]
  onMembersChange: (members: Member[]) => void
}

const ROLE_OPTIONS: MembershipRole[] = ['viewer', 'editor', 'admin', 'auditor']

export function MembersSettingsSection({
  orgId,
  isAdmin,
  members,
  onMembersChange,
}: MembersSettingsSectionProps) {
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MembershipRole>('viewer')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

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
      setInviteSuccess(`Invitation sent! Token: ${invitation.token}`)
      setInviteEmail('')
      setInviteRole('viewer')
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleRoleChange(member: Member, newRole: MembershipRole) {
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
              >
                {inviteSuccess}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2" data-testid="members-list">
          {members.map(member => (
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
                    className="w-auto cursor-pointer rounded-sm px-2 py-1.5 text-xs focus:outline-none"
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
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                    data-testid={`member-remove-${member.id}`}
                    onClick={() => void handleRemoveMember(member)}
                    title="Remove member"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
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
