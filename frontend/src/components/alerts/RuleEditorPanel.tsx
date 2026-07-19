import { Check, Copy, FileCode2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatAlertDuration, ruleToYaml } from '@/lib/alerts'
import type { VMAlertRule } from '@/types/datasource'

type RuleEditorPanelProps = {
  rule: VMAlertRule
  groupName: string
  onClose: () => void
}

/**
 * Structured rule editor for VMAlert rules.
 *
 * VMAlert loads rules from files / configmaps and exposes only a read API.
 * Ace therefore provides an editor for inspection, YAML export, and copy —
 * mutations must be applied in the rule source of truth outside Ace.
 */
export function RuleEditorPanel({ rule, groupName, onClose }: RuleEditorPanelProps) {
  const yaml = useMemo(() => ruleToYaml(rule, groupName), [rule, groupName])
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(yaml)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      data-testid="rule-editor-modal"
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
        aria-labelledby="rule-editor-title"
        className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface-bright)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 size={18} style={{ color: 'var(--color-primary)' }} aria-hidden />
            <div className="min-w-0">
              <h2
                id="rule-editor-title"
                className="m-0 truncate font-display text-base font-bold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Rule editor — {rule.name}
              </h2>
              <p className="m-0 truncate text-xs" style={{ color: 'var(--color-outline)' }}>
                Group: {groupName}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition"
            style={{ color: 'var(--color-outline)' }}
            onClick={onClose}
            aria-label="Close rule editor"
            data-testid="rule-editor-close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div
            className="rounded-sm px-3 py-2 text-xs leading-relaxed"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 10%, transparent)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid color-mix(in srgb, var(--color-tertiary) 25%, transparent)',
            }}
            data-testid="rule-editor-readonly-notice"
          >
            VMAlert rules are file-managed and Ace only has a read API for them. Use this editor to
            inspect the live rule and export YAML; apply mutations in your rule source (configmap /
            file) and reload VMAlert.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" testId="rule-editor-name">
              {rule.name}
            </Field>
            <Field label="Type" testId="rule-editor-type">
              {rule.type || 'alerting'}
            </Field>
            <Field label="State" testId="rule-editor-state">
              {rule.state || '—'}
            </Field>
            <Field label="For / duration" testId="rule-editor-duration">
              {rule.duration > 0 ? formatAlertDuration(rule.duration) : '—'}
            </Field>
            {rule.health ? (
              <Field label="Health" testId="rule-editor-health">
                {rule.health}
              </Field>
            ) : null}
            {rule.lastError ? (
              <Field label="Last error" testId="rule-editor-last-error">
                {rule.lastError}
              </Field>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--color-outline)' }}>
              Expression
            </span>
            <pre
              data-testid="rule-editor-query"
              className="overflow-x-auto rounded-sm px-3 py-2 font-mono text-xs whitespace-pre-wrap"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
              }}
            >
              {rule.query}
            </pre>
          </div>

          {rule.labels && Object.keys(rule.labels).length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Labels
              </span>
              <div className="flex flex-wrap gap-1.5" data-testid="rule-editor-labels">
                {Object.entries(rule.labels).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {key}={value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {rule.annotations && Object.keys(rule.annotations).length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                Annotations
              </span>
              <div className="flex flex-col gap-1" data-testid="rule-editor-annotations">
                {Object.entries(rule.annotations).map(([key, value]) => (
                  <div key={key} className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <strong>{key}:</strong> {value}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-outline)' }}
              >
                YAML export
              </span>
              <button
                type="button"
                data-testid="rule-editor-copy-yaml"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                onClick={() => void handleCopy()}
              >
                {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                {copied ? 'Copied' : 'Copy YAML'}
              </button>
            </div>
            <pre
              data-testid="rule-editor-yaml"
              className="overflow-x-auto rounded-sm px-3 py-2 font-mono text-xs whitespace-pre-wrap"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {yaml}
            </pre>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Field({
  label,
  children,
  testId,
}: {
  label: string
  children: string
  testId?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--color-outline)' }}>
        {label}
      </span>
      <span
        data-testid={testId}
        className="font-mono text-sm"
        style={{ color: 'var(--color-on-surface)' }}
      >
        {children}
      </span>
    </div>
  )
}
