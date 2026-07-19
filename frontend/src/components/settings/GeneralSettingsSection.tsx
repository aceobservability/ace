import { Edit2, Shield } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteOrganization,
  updateOrgBranding,
  updateOrganization,
} from '@/api/organizations'
import { organizationsQueryKey } from '@/hooks/useOrganizations'
import { useOrgStore } from '@/stores/orgStore'
import type { Organization } from '@/types/organization'
import { useQueryClient } from '@tanstack/react-query'

type GeneralSettingsSectionProps = {
  org: Organization
  orgId: string
  isAdmin: boolean
  onOrgUpdated: (org: Organization) => void
}

const LOGO_FILE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
const LOGO_FILE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function isAllowedLogoFile(file: File): boolean {
  return LOGO_FILE_TYPES.has(file.type)
}

export function GeneralSettingsSection({
  org,
  orgId,
  isAdmin,
  onOrgUpdated,
}: GeneralSettingsSectionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(org.name)
  const [editSlug, setEditSlug] = useState(org.slug)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [brandingColor, setBrandingColor] = useState(org.branding?.primary_color ?? '')
  const [brandingTitle, setBrandingTitle] = useState(org.branding?.app_title ?? '')
  const [brandingLogo, setBrandingLogo] = useState(org.branding?.logo_data_uri ?? '')
  // Preview comes only from File blob URLs — never from free-text DOM input (CodeQL js/xss-through-dom).
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const logoPreviewUrlRef = useRef<string | null>(null)
  const [brandingLoading, setBrandingLoading] = useState(false)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const [brandingNotice, setBrandingNotice] = useState<string | null>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const replaceLogoPreview = useCallback((nextUrl: string | null) => {
    if (logoPreviewUrlRef.current) {
      URL.revokeObjectURL(logoPreviewUrlRef.current)
    }
    logoPreviewUrlRef.current = nextUrl
    setLogoPreviewUrl(nextUrl)
  }, [])

  useEffect(() => {
    return () => {
      if (logoPreviewUrlRef.current) {
        URL.revokeObjectURL(logoPreviewUrlRef.current)
        logoPreviewUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setEditName(org.name)
    setEditSlug(org.slug)
    setBrandingColor(org.branding?.primary_color ?? '')
    setBrandingTitle(org.branding?.app_title ?? '')
    setBrandingLogo(org.branding?.logo_data_uri ?? '')
    // Drop local file preview when org branding reloads from the API.
    replaceLogoPreview(null)
  }, [org, replaceLogoPreview])

  function handleLogoFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    if (!isAllowedLogoFile(file)) {
      setBrandingError('Logo must be a PNG, JPEG, GIF, or WebP image')
      return
    }
    setBrandingError(null)
    // Object URL from File is not DOM-text taint; safe for <img src>.
    replaceLogoPreview(URL.createObjectURL(file))
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBrandingLogo(reader.result)
      }
    }
    reader.onerror = () => {
      setBrandingError('Failed to read logo file')
    }
    reader.readAsDataURL(file)
  }

  function clearLogo() {
    setBrandingLogo('')
    replaceLogoPreview(null)
  }

  function startEdit() {
    setEditMode(true)
    setEditName(org.name)
    setEditSlug(org.slug)
    setEditError(null)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditError(null)
  }

  async function saveEdit() {
    if (!editName.trim()) {
      setEditError('Name is required')
      return
    }
    setEditLoading(true)
    setEditError(null)
    try {
      const updated = await updateOrganization(orgId, {
        name: editName.trim(),
        slug: editSlug.trim(),
      })
      onOrgUpdated(updated)
      setEditMode(false)
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to update organization')
    } finally {
      setEditLoading(false)
    }
  }

  async function saveBranding() {
    setBrandingLoading(true)
    setBrandingError(null)
    setBrandingNotice(null)
    try {
      const updated = await updateOrgBranding(orgId, {
        primary_color: brandingColor.trim() || null,
        app_title: brandingTitle.trim() || null,
        logo_data_uri: brandingLogo.trim() || null,
      })
      onOrgUpdated(updated)
      setBrandingNotice('Branding saved')
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
    } catch (e) {
      setBrandingError(e instanceof Error ? e.message : 'Failed to update branding')
    } finally {
      setBrandingLoading(false)
    }
  }

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      await deleteOrganization(orgId)
      // Drop stale selection so shell/hooks do not keep serving the deleted org.
      const orgStore = useOrgStore.getState()
      if (orgStore.currentOrgId === orgId) {
        orgStore.clear()
      }
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
      navigate('/app/dashboards')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete organization')
    } finally {
      setDeleteLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6" data-testid="settings-general">
      <div
        className="rounded-lg p-6"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="m-0 flex items-center gap-2 font-display text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            General
          </h2>
          {isAdmin && !editMode ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              data-testid="org-edit-btn"
              onClick={startEdit}
            >
              <Edit2 size={16} /> Edit
            </button>
          ) : null}
        </div>

        {editMode ? (
          <div
            className="mb-4 rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          >
            <div className="mb-4">
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
                htmlFor="org-name-input"
              >
                Organization Name
              </label>
              <input
                id="org-name-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                type="text"
                data-testid="org-name-input"
                className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={editLoading}
              />
            </div>
            <div className="mb-4">
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
                htmlFor="org-slug-input"
              >
                URL Slug
              </label>
              <input
                id="org-slug-input"
                value={editSlug}
                onChange={e => setEditSlug(e.target.value)}
                data-testid="org-slug-input"
                type="text"
                className="w-full rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                disabled={editLoading}
              />
            </div>
            {editError ? (
              <div
                className="mt-3 rounded-sm px-3.5 py-2.5 text-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  color: 'var(--color-error)',
                }}
              >
                {editError}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                data-testid="org-edit-cancel-btn"
                onClick={cancelEdit}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                  color: '#fff',
                  border: 'none',
                }}
                data-testid="org-edit-save-btn"
                onClick={() => void saveEdit()}
                disabled={editLoading}
              >
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Name
              </span>
              <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                {org.name}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Slug
              </span>
              <span className="font-mono text-sm" style={{ color: 'var(--color-on-surface)' }}>
                {org.slug}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Your Role
              </span>
              <span
                className="font-mono text-sm capitalize"
                style={{ color: 'var(--color-primary)' }}
              >
                {org.role}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Created
              </span>
              <span className="font-mono text-sm" style={{ color: 'var(--color-on-surface)' }}>
                {new Date(org.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        className="rounded-lg p-6"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
        data-testid="settings-branding"
      >
        <h2
          className="mb-2 flex items-center gap-2 font-display text-base font-semibold"
          style={{ color: 'var(--color-on-surface)' }}
        >
          Branding
        </h2>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Customize the accent color, app title, and logo for this organization.
        </p>

        <div className="mb-4">
          <label
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
            htmlFor="branding-app-title"
          >
            App Title
          </label>
          <input
            id="branding-app-title"
            value={brandingTitle}
            onChange={e => setBrandingTitle(e.target.value)}
            type="text"
            data-testid="branding-app-title"
            placeholder="Ace"
            className="w-full rounded-sm px-3 py-2.5 text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }}
            disabled={!isAdmin || brandingLoading}
          />
        </div>

        <div className="mb-4">
          <label
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
            htmlFor="branding-primary-color"
          >
            Primary Color
          </label>
          <div className="flex items-center gap-3">
            <input
              id="branding-primary-color"
              value={brandingColor || '#C9960F'}
              onChange={e => setBrandingColor(e.target.value)}
              type="color"
              data-testid="branding-primary-color"
              className="h-10 w-12 cursor-pointer rounded-sm border-none bg-transparent p-0"
              disabled={!isAdmin || brandingLoading}
            />
            <input
              value={brandingColor}
              onChange={e => setBrandingColor(e.target.value)}
              type="text"
              data-testid="branding-primary-color-text"
              placeholder="#C9960F"
              className="flex-1 rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              disabled={!isAdmin || brandingLoading}
            />
          </div>
        </div>

        <div className="mb-4">
          <span
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
            id="branding-logo-label"
          >
            Logo
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="branding-logo"
              type="file"
              accept={LOGO_FILE_ACCEPT}
              data-testid="branding-logo"
              aria-labelledby="branding-logo-label"
              className="max-w-full text-sm file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
              style={{
                color: 'var(--color-on-surface-variant)',
              }}
              disabled={!isAdmin || brandingLoading}
              onChange={e => {
                handleLogoFileChange(e.target.files)
                // Allow re-selecting the same file.
                e.target.value = ''
              }}
            />
            {brandingLogo || logoPreviewUrl ? (
              <button
                type="button"
                className="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                data-testid="branding-logo-clear"
                disabled={!isAdmin || brandingLoading}
                onClick={clearLogo}
              >
                Remove logo
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            PNG, JPEG, GIF, or WebP. Preview uses a local file blob URL (not free-text input).
          </p>
          {logoPreviewUrl ? (
            <img
              src={logoPreviewUrl}
              alt="Organization logo preview"
              className="mt-3 h-10 max-w-[160px] object-contain"
              data-testid="branding-logo-preview"
            />
          ) : brandingLogo.trim() ? (
            <p
              className="mt-2 text-xs"
              style={{ color: 'var(--color-on-surface-variant)' }}
              data-testid="branding-logo-saved-hint"
            >
              A logo is saved for this organization. Upload a new file to replace it, or remove it.
            </p>
          ) : null}
          {/* Hidden field keeps the API payload value without binding free-text DOM → img src. */}
          <input type="hidden" data-testid="branding-logo-data" value={brandingLogo} readOnly />
        </div>

        {brandingError ? (
          <div
            className="mb-3 rounded-sm px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}
          >
            {brandingError}
          </div>
        ) : null}
        {brandingNotice ? (
          <div
            className="mb-3 rounded-sm px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            {brandingNotice}
          </div>
        ) : null}

        {isAdmin ? (
          <div className="flex justify-end">
            <button
              type="button"
              className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                color: '#fff',
                border: 'none',
              }}
              data-testid="branding-save-btn"
              onClick={() => void saveBranding()}
              disabled={brandingLoading}
            >
              {brandingLoading ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <div
          className="rounded-lg p-6"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-error)',
          }}
        >
          <h2
            className="mb-4 flex items-center gap-2 text-base font-semibold"
            style={{ color: 'var(--color-error)' }}
          >
            <Shield size={20} /> Danger Zone
          </h2>
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <strong className="mb-1 block text-sm" style={{ color: 'var(--color-on-surface)' }}>
                Delete Organization
              </strong>
              <p className="m-0 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                Permanently delete this organization and all its data.
              </p>
            </div>
            <button
              type="button"
              className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
              style={{ backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }}
              data-testid="org-delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Organization
            </button>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          data-testid="org-delete-modal"
        >
          <button
            type="button"
            aria-label="Close delete confirmation"
            className="absolute inset-0 cursor-default border-none p-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete organization confirmation"
            className="relative max-w-[400px] rounded-lg p-6"
            style={{
              backgroundColor: 'var(--color-surface-bright)',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            <h3
              className="mb-3 text-lg font-semibold"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Delete Organization?
            </h3>
            <p className="mb-6 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              This will permanently delete <strong>{org.name}</strong> and all its dashboards,
              panels, and settings.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                data-testid="org-delete-cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-sm px-4 py-2.5 text-sm font-semibold transition"
                style={{ backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }}
                data-testid="org-delete-confirm-btn"
                onClick={() => void handleDelete()}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Organization'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
