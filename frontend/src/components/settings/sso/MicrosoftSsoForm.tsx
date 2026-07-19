import {
  errorBannerStyle,
  fieldStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from './ssoShared'

type MicrosoftSsoFormProps = {
  isAdmin: boolean
  tenantId: string
  clientId: string
  clientSecret: string
  enabled: boolean
  saving: boolean
  error: string | null
  onTenantIdChange: (value: string) => void
  onClientIdChange: (value: string) => void
  onClientSecretChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
  onCancel: () => void
  onSave: () => void
}

export function MicrosoftSsoForm({
  isAdmin,
  tenantId,
  clientId,
  clientSecret,
  enabled,
  saving,
  error,
  onTenantIdChange,
  onClientIdChange,
  onClientSecretChange,
  onEnabledChange,
  onCancel,
  onSave,
}: MicrosoftSsoFormProps) {
  return (
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
          value={tenantId}
          onChange={e => onTenantIdChange(e.target.value)}
          type="text"
          data-testid="microsoft-tenant-id"
          aria-label="Microsoft Tenant ID"
          className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={fieldStyle}
          disabled={!isAdmin || saving}
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
          value={clientId}
          onChange={e => onClientIdChange(e.target.value)}
          type="text"
          data-testid="microsoft-client-id"
          aria-label="Microsoft Client ID"
          className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={fieldStyle}
          disabled={!isAdmin || saving}
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
          value={clientSecret}
          onChange={e => onClientSecretChange(e.target.value)}
          type="password"
          data-testid="microsoft-client-secret"
          aria-label="Microsoft Client Secret"
          placeholder="Enter to update"
          className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={fieldStyle}
          disabled={!isAdmin || saving}
        />
      </div>
      <label
        className="m-0 inline-flex items-center gap-2 text-sm"
        style={{ color: 'var(--color-on-surface)' }}
      >
        <input
          checked={enabled}
          onChange={e => onEnabledChange(e.target.checked)}
          type="checkbox"
          data-testid="microsoft-enabled"
          className="m-0 w-auto"
          disabled={!isAdmin || saving}
        />
        Enable Microsoft SSO
      </label>
      {error ? (
        <div className="mt-3 rounded-sm px-3.5 py-2.5 text-sm" style={errorBannerStyle()}>
          {error}
        </div>
      ) : null}
      {isAdmin ? (
        <div className="mt-3 flex justify-end gap-3">
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
            className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
            style={primaryButtonStyle}
            data-testid="save-microsoft-sso"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Saving...' : 'Save Microsoft SSO'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
