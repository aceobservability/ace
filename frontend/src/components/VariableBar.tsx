import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { DashboardVariable } from '@/hooks/useVariables'

type VariableBarProps = {
  variables: DashboardVariable[]
  onValueChange: (payload: { name: string; value: string | string[] }) => void
}

export function VariableBar({ variables, onValueChange }: VariableBarProps) {
  const [openMultiSelect, setOpenMultiSelect] = useState<string | null>(null)

  function handleSingleChange(variable: DashboardVariable, event: React.ChangeEvent<HTMLSelectElement>) {
    onValueChange({ name: variable.name, value: event.target.value })
  }

  function handleTextChange(variable: DashboardVariable, event: React.ChangeEvent<HTMLInputElement>) {
    onValueChange({ name: variable.name, value: event.target.value })
  }

  function toggleMultiSelect(name: string) {
    setOpenMultiSelect(current => (current === name ? null : name))
  }

  function toggleMultiOption(variable: DashboardVariable, option: string) {
    const current = Array.isArray(variable.current) ? [...variable.current] : []
    const index = current.indexOf(option)
    if (index >= 0) {
      current.splice(index, 1)
    } else {
      current.push(option)
    }
    onValueChange({ name: variable.name, value: current })
  }

  function isMultiOptionSelected(variable: DashboardVariable, option: string): boolean {
    return Array.isArray(variable.current) && variable.current.includes(option)
  }

  function multiDisplayValue(variable: DashboardVariable): string {
    if (Array.isArray(variable.current) && variable.current.length > 0) {
      return variable.current.join(', ')
    }
    return 'Select...'
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-2"
      style={{
        backgroundColor: 'var(--color-surface-container-low)',
        borderBottom: '1px solid var(--color-outline-variant)',
      }}
      data-testid="variable-bar"
    >
      {variables.map(variable => (
        <div key={variable.id} className="flex items-center gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--color-on-surface-variant)' }}
            htmlFor={`var-${variable.name}`}
          >
            {variable.label || variable.name}
          </label>

          {variable.type !== 'textbox' &&
            variable.type !== 'constant' &&
            (!variable.options || variable.options.length === 0) && (
              <span title="No options loaded for this variable">
                <AlertTriangle size={14} style={{ color: 'var(--color-tertiary)' }} />
              </span>
            )}

          {variable.type === 'constant' ? (
            <span
              className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline-variant)',
              }}
            >
              {variable.current as string}
            </span>
          ) : variable.type === 'textbox' ? (
            <input
              id={`var-${variable.name}`}
              type="text"
              value={typeof variable.current === 'string' ? variable.current : ''}
              className="h-7 rounded px-2 text-xs outline-none transition"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                minWidth: '100px',
                maxWidth: '180px',
              }}
              onChange={event => handleTextChange(variable, event)}
            />
          ) : variable.multi ? (
            <div className="relative">
              <button
                id={`var-${variable.name}`}
                type="button"
                className="flex h-7 items-center gap-1 rounded px-2 text-xs outline-none transition"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                  minWidth: '120px',
                  maxWidth: '240px',
                }}
                onClick={() => toggleMultiSelect(variable.name)}
              >
                <span className="truncate">{multiDisplayValue(variable)}</span>
              </button>

              {openMultiSelect === variable.name && (
                <div
                  className="absolute top-full left-0 z-50 mt-1 max-h-48 min-w-[160px] overflow-y-auto rounded-md py-1"
                  style={{
                    backgroundColor: 'var(--color-surface-bright)',
                    border: '1px solid var(--color-outline-variant)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  {variable.options.map(option => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs transition hover:opacity-80"
                      style={{
                        color: 'var(--color-on-surface)',
                        backgroundColor: isMultiOptionSelected(variable, option)
                          ? 'var(--color-primary-muted)'
                          : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isMultiOptionSelected(variable, option)}
                        className="accent-[var(--color-primary)]"
                        onChange={() => toggleMultiOption(variable, option)}
                      />
                      {option}
                    </label>
                  ))}
                  {variable.options.length === 0 && (
                    <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-outline)' }}>
                      No options available
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <select
              id={`var-${variable.name}`}
              value={typeof variable.current === 'string' ? variable.current : ''}
              className="h-7 rounded px-2 text-xs outline-none transition"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                minWidth: '120px',
                maxWidth: '200px',
              }}
              onChange={event => handleSingleChange(variable, event)}
            >
              <option value="" disabled>
                Select...
              </option>
              {variable.options.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  )
}