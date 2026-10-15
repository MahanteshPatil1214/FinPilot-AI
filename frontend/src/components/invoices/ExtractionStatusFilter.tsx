interface ExtractionStatusFilterProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

const OPTIONS: Array<{ key: string | undefined; label: string }> = [
  { key: undefined, label: 'All' },
  { key: 'completed', label: 'Extracted' },
  { key: 'pending', label: 'Pending' },
]

export function ExtractionStatusFilter({
  value,
  onChange,
}: ExtractionStatusFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {OPTIONS.map((option) => {
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
