import { AlertTriangle, Check, Info, Loader2, Plus, X } from 'lucide-react'
import type { SSOConfigRoleMapping } from '@/api/ssoRoleMappings'
import {
  errorBannerStyle,
  fieldStyle,
  primaryButtonStyle,
  ROLE_OPTIONS,
  roleBadgeStyle,
  secondaryButtonStyle,
} from './ssoShared'

type OktaSsoFormProps = {
  isAdmin: boolean
  domain: string
  clientId: string
  clientSecret: string
  groupsClaimName: string
  defaultRole: string
  enabled: boolean
  configured: boolean
  saving: boolean
  error: string | null
  testStatus: 'idle' | 'testing' | 'success' | 'error'
  testMessage: string
  roleMappings: SSOConfigRoleMapping[]
  roleMappingsLoading: boolean
  showAddMappingForm: boolean
  newMappingGroup: string
  newMappingRole: string
  addMappingLoading: boolean
  addMappingError: string | null
  onDomainChange: (value: string) => void
  onClientIdChange: (value: string) => void
  onClientSecretChange: (value: string) => void
  onGroupsClaimNameChange: (value: string) => void
  onDefaultRoleChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
  onCancel: () => void
  onSave: () => void
  onTestConnection: () => void
  onShowAddMappingForm: (show: boolean) => void
  onNewMappingGroupChange: (value: string) => void
  onNewMappingRoleChange: (value: string) => void
  onAddMapping: () => void
  onDeleteMapping: (mappingId: string) => void
  onClearAddMappingError: () => void
}

export function OktaSsoForm({
  isAdmin,
  domain,
  clientId,
  clientSecret,
  groupsClaimName,
  defaultRole,
  enabled,
  configured,
  saving,
  error,
  testStatus,
  testMessage,
  roleMappings,
  roleMappingsLoading,
  showAddMappingForm,
  newMappingGroup,
  newMappingRole,
  addMappingLoading,
  addMappingError,
  onDomainChange,
  onClientIdChange,
  onClientSecretChange,
  onGroupsClaimNameChange,
  onDefaultRoleChange,
  onEnabledChange,
  onCancel,
  onSave,
  onTestConnection,
  onShowAddMappingForm,
  onNewMappingGroupChange,
  onNewMappingRoleChange,
  onAddMapping,
  onDeleteMapping,
  onClearAddMappingError,
}: OktaSsoFormProps) {
  return (
    <div data-testid="okta-sso-card">
      <div
        className="mb-4 flex gap-3 rounded-md p-3"
        style={{
          backgroundColor: 'var(--color-surface-container-low)',
          border: '1px solid var(--color-outline)',
        }}
        data-testid="okta-setup-callout"
      >
        <Info size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-info)' }} />
        <p className="m-0 text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
          To enable group-to-role mapping, configure a &quot;groups&quot; claim in your Okta
          authorization server. This allows Ace to automatically assign roles based on your Okta
          group memberships.
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
            value={domain}
            onChange={e => onDomainChange(e.target.value)}
            type="text"
            data-testid="okta-domain"
            aria-label="Okta Domain"
            placeholder="dev-12345"
            className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
            style={fieldStyle}
            disabled={!isAdmin || saving}
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
            value={clientId}
            onChange={e => onClientIdChange(e.target.value)}
            type="text"
            data-testid="okta-client-id"
            aria-label="Okta Client ID"
            className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
            style={fieldStyle}
            disabled={!isAdmin || saving}
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
          value={clientSecret}
          onChange={e => onClientSecretChange(e.target.value)}
          type="password"
          data-testid="okta-client-secret"
          aria-label="Okta Client Secret"
          placeholder="Enter to update"
          className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={fieldStyle}
          disabled={!isAdmin || saving}
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
            value={groupsClaimName}
            onChange={e => onGroupsClaimNameChange(e.target.value)}
            type="text"
            data-testid="okta-groups-claim"
            aria-label="Groups Claim Name"
            placeholder="groups"
            className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
            style={fieldStyle}
            disabled={!isAdmin || saving}
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
            value={defaultRole}
            onChange={e => onDefaultRoleChange(e.target.value)}
            data-testid="okta-default-role"
            aria-label="Default Role"
            className="w-full cursor-pointer rounded-sm px-3 py-2.5 text-sm focus:outline-none"
            style={fieldStyle}
            disabled={!isAdmin || saving}
          >
            {ROLE_OPTIONS.map(role => (
              <option key={role} value={role}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label
        className="m-0 inline-flex items-center gap-2 text-sm"
        style={{ color: 'var(--color-on-surface)' }}
      >
        <input
          checked={enabled}
          onChange={e => onEnabledChange(e.target.checked)}
          type="checkbox"
          data-testid="okta-enabled"
          className="m-0 w-auto"
          disabled={!isAdmin || saving}
        />
        Enable Okta SSO
      </label>

      {error ? (
        <div
          className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
          style={errorBannerStyle()}
          data-testid="okta-error"
        >
          {error}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition"
              style={secondaryButtonStyle}
              data-testid="okta-test-connection"
              disabled={testStatus === 'testing' || !configured}
              onClick={onTestConnection}
            >
              {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : null}
              Test Connection
            </button>
            {testStatus === 'success' ? (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--color-secondary)' }}
                data-testid="okta-test-success"
              >
                <Check size={14} /> {testMessage}
              </span>
            ) : null}
            {testStatus === 'error' ? (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--color-error)' }}
                data-testid="okta-test-error"
              >
                <AlertTriangle size={14} /> {testMessage}
              </span>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
              style={secondaryButtonStyle}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-4 py-2.5 text-sm font-semibold transition"
              style={primaryButtonStyle}
              data-testid="save-okta-sso"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      ) : null}

      {configured ? (
        <div
          className="mt-6 border-t pt-4"
          style={{ borderColor: 'var(--color-outline)' }}
          data-testid="okta-role-mappings-section"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
              Group → Role Mapping
            </h4>
            {isAdmin && !showAddMappingForm ? (
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-medium transition"
                style={secondaryButtonStyle}
                data-testid="add-mapping-btn"
                onClick={() => {
                  onShowAddMappingForm(true)
                  onClearAddMappingError()
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
                  onChange={e => onNewMappingGroupChange(e.target.value)}
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
                  onChange={e => onNewMappingRoleChange(e.target.value)}
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
                  {ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-sm px-3 py-2 text-sm font-semibold transition"
                    style={primaryButtonStyle}
                    disabled={addMappingLoading}
                    data-testid="add-mapping-submit"
                    onClick={onAddMapping}
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
                      onShowAddMappingForm(false)
                      onClearAddMappingError()
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {addMappingError ? (
                <div
                  className="rounded-sm px-3 py-2 text-xs"
                  style={errorBannerStyle()}
                  data-testid="add-mapping-error"
                >
                  {addMappingError}
                </div>
              ) : null}
            </div>
          ) : null}

          {roleMappingsLoading ? (
            <div className="p-3 text-sm" style={{ color: 'var(--color-outline)' }}>
              Loading mappings...
            </div>
          ) : null}
          {!roleMappingsLoading && roleMappings.length === 0 ? (
            <div
              className="p-3 text-sm"
              style={{ color: 'var(--color-outline)' }}
              data-testid="no-mappings-message"
            >
              No group mappings. Users will get the default role ({defaultRole}).
            </div>
          ) : null}
          {!roleMappingsLoading && roleMappings.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {roleMappings.map(mapping => (
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
                    <span className="shrink-0 text-xs" style={{ color: 'var(--color-outline)' }}>
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
                      onClick={() => onDeleteMapping(mapping.id)}
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
  )
}
