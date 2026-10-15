import { MATCH_STATUS_ORDER, statusMeta } from '../../lib/reconciliation'

interface SegmentedStatusFilterProps {
  value: string | undefined
  counts: Record<string, number> | undefined
  total: number | undefined
  onChange: (status: string | undefined) => void
}

export function SegmentedStatusFilter({
  value,
  counts,
  total,
  onChange,
}: SegmentedStatusFilterProps) {
  const segments: Array<{ key: string | undefined; label: string; count?: number }> =
    [
      { key: undefined, label: 'All', count: total },
      ...MATCH_STATUS_ORDER.map((status) => ({
        key: status,
        label: statusMeta(status).label,
        count: counts?.[status],
      })),
    ]

  return (
    <div className="flex flex-wrap items-center gap-1">
      {segments.map((segment) => {
        const active = value === segment.key
        return (
          <button
            key={segment.key ?? 'all'}
            type="button"
            onClick={() => onChange(segment.key)}
            className={[
              'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface text-graphite hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            <span>{segment.label}</span>
            {segment.count !== undefined ? (
              <span className="num text-2xs text-muted">
                {segment.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
