interface SearchFilterProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  hint?: string
  className?: string
}

export function SearchFilter({
  value,
  onChange,
  label,
  placeholder,
  hint,
  className = '',
}: SearchFilterProps) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-2xs uppercase tracking-label text-muted">
        {label}
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-64 max-w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {hint ? <span className="text-2xs text-muted">{hint}</span> : null}
    </label>
  )
}
