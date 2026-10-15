import { Link } from 'react-router-dom'

export interface MetricCardProps {
  label: string
  value: number | string
  hint?: string
  to?: string
}

export function MetricCard({ label, value, hint, to }: MetricCardProps) {
  const body = (
    <>
      <span className="text-2xs uppercase tracking-label text-muted">
        {label}
      </span>
      <span className="num mt-2 block font-serif text-3xl leading-none text-ink">
        {value}
      </span>
      {hint ? (
        <span className="mt-2 block text-2xs leading-relaxed text-muted">
          {hint}
        </span>
      ) : null}
    </>
  )

  const base = 'block rounded-sm border border-line bg-surface p-4'

  if (to) {
    return (
      <Link
        to={to}
        className={`${base} transition-colors hover:border-line-strong hover:bg-paper`}
      >
        {body}
      </Link>
    )
  }

  return <div className={base}>{body}</div>
}
