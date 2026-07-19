import { AlertCircle, Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { AMMatcher } from '@/types/datasource'

export type SilenceFormState = {
  matchers: Array<AMMatcher & { key: string }>
  start: string
  end: string
  createdBy: string
  comment: string
}

type SilenceModalProps = {
  form: SilenceFormState
  saving: boolean
  error: string | null
  onChange: (next: SilenceFormState) => void
  onClose: () => void
  onSubmit: () => void
}

export function SilenceModal({
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
}: SilenceModalProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  const displayError = error || localError

  function updateMatcher(key: string, patch: Partial<AMMatcher>) {
    onChange({
      ...form,
      matchers: form.matchers.map(m => (m.key === key ? { ...m, ...patch } : m)),
    })
  }

  function handleSubmit() {
    setLocalError(null)
    const validMatchers = form.matchers.filter(m => m.name.trim() !== '')
    if (validMatchers.length === 0) {
      setLocalError('At least one matcher is required')
      return
    }
    if (!form.comment.trim()) {
      setLocalError('Comment is required')
      return
    }
    const startDate = new Date(form.start)
    const endDate = new Date(form.end)
    if (endDate <= startDate) {
      setLocalError('End time must be after start time')
      return
    }
    onSubmit()
  }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="silence-modal-title"
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface-bright)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <h2
            id="silence-modal-title"
            className="m-0 font-display text-base font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Create Silence
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition"
            style={{ color: 'var(--color-outline)' }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <div className="text-sm font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
              Matchers <span style={{ color: 'var(--color-error)' }}>*</span>
            </div>
            <div className="mb-2 flex flex-col gap-2">
              {form.matchers.map((m, idx) => (
                <div key={m.key} className="flex items-center gap-2">
                  <input
                    value={m.name}
                    onChange={e => updateMatcher(m.key, { name: e.target.value })}
                    type="text"
                    placeholder="Label name"
                    data-testid={`silence-matcher-name-${idx}`}
                    className="flex-1 rounded-sm px-2.5 py-1.5 font-mono text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  />
                  <select
                    value={m.isEqual ? 'eq' : 'neq'}
                    onChange={e => updateMatcher(m.key, { isEqual: e.target.value === 'eq' })}
                    className="w-13 rounded-sm px-1.5 py-1.5 text-center font-mono text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <option value="eq">{m.isRegex ? '=~' : '='}</option>
                    <option value="neq">{m.isRegex ? '!~' : '!='}</option>
                  </select>
                  <input
                    value={m.value}
                    onChange={e => updateMatcher(m.key, { value: e.target.value })}
                    type="text"
                    placeholder="Value"
                    data-testid={`silence-matcher-value-${idx}`}
                    className="flex-1 rounded-sm px-2.5 py-1.5 font-mono text-sm focus:outline-none"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  />
                  <label
                    className="flex cursor-pointer items-center gap-1 text-xs whitespace-nowrap"
                    style={{ color: 'var(--color-outline)' }}
                    title="Regex match"
                  >
                    <input
                      type="checkbox"
                      checked={m.isRegex}
                      onChange={e => updateMatcher(m.key, { isRegex: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    Regex
                  </label>
                  <button
                    type="button"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: 'var(--color-outline)' }}
                    disabled={form.matchers.length <= 1}
                    onClick={() => {
                      if (form.matchers.length > 1) {
                        onChange({
                          ...form,
                          matchers: form.matchers.filter(item => item.key !== m.key),
                        })
                      }
                    }}
                    title="Remove matcher"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 self-start border-none bg-transparent text-sm transition"
              style={{ color: 'var(--color-primary)' }}
              onClick={() =>
                onChange({
                  ...form,
                  matchers: [
                    ...form.matchers,
                    {
                      key: `matcher-${Date.now()}-${form.matchers.length}`,
                      name: '',
                      value: '',
                      isRegex: false,
                      isEqual: true,
                    },
                  ],
                })
              }
            >
              <Plus size={12} aria-hidden />
              Add Matcher
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="silence-start"
                className="text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                Start
              </label>
              <input
                id="silence-start"
                data-testid="silence-start-input"
                value={form.start}
                onChange={e => onChange({ ...form, start: e.target.value })}
                type="datetime-local"
                className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="silence-end"
                className="text-sm font-medium"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                End
              </label>
              <input
                id="silence-end"
                data-testid="silence-end-input"
                value={form.end}
                onChange={e => onChange({ ...form, end: e.target.value })}
                type="datetime-local"
                className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="silence-created-by"
              className="text-sm font-medium"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Created By
            </label>
            <input
              id="silence-created-by"
              data-testid="silence-created-by-input"
              value={form.createdBy}
              onChange={e => onChange({ ...form, createdBy: e.target.value })}
              type="text"
              placeholder="your-name@example.com"
              className="rounded-sm px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="silence-comment"
              className="text-sm font-medium"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Comment <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <textarea
              id="silence-comment"
              data-testid="silence-comment-input"
              value={form.comment}
              onChange={e => onChange({ ...form, comment: e.target.value })}
              rows={3}
              placeholder="Reason for silencing..."
              className="min-h-[68px] resize-y rounded-sm px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {displayError ? (
            <div
              className="flex items-center gap-2 rounded-sm px-4 py-3 text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                color: 'var(--color-error)',
              }}
              data-testid="silence-error"
            >
              <AlertCircle size={14} aria-hidden />
              {displayError}
            </div>
          ) : null}
        </div>

        <div
          className="flex justify-end gap-2.5 px-5 py-4"
          style={{ borderTop: '1px solid var(--color-outline-variant)' }}
        >
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }}
            data-testid="silence-cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }}
            data-testid="silence-create-btn"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {saving ? 'Creating...' : 'Create Silence'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
