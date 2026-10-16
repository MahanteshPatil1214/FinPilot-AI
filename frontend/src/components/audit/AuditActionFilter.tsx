import { AUDIT_ACTION_ORDER, auditActionMeta } from '../../lib/audit'

interface AuditActionFilterProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

export function AuditActionFilter({ value, onChange }: AuditActionFilterProps) {
  const options: Array<{ key: string | undefined; label: string }> = [
    { key: undefined, label: 'All' },
    ...AUDIT_ACTION_ORDER.map((action) => ({
      key: action as string,
      label: auditActionMeta(action).label,
    })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = value === option.key
        return (
          <button
            key={option.key ?? 'all'}
            type="button"
            onClick={() => onChange(option.key)}
            className={[
              'rounded-sm border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
