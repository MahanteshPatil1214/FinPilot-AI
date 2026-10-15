interface StateMessageProps {
  kind: 'loading' | 'empty' | 'error'
  title: string
  message?: string
  onRetry?: () => void
  className?: string
}

export function StateMessage({
  kind,
  title,
  message,
  onRetry,
  className = '',
}: StateMessageProps) {
  const tone =
    kind === 'error'
      ? 'border-status-risk/25 text-status-risk'
      : 'border-line text-graphite'

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 border border-dashed ${tone} px-6 py-12 text-center ${className}`}
    >
      {kind === 'loading' ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      ) : null}
      <p className="font-serif text-base text-ink">{title}</p>
      {message ? <p className="max-w-md text-sm text-graphite">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-sm border border-line-strong px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-accent-soft"
        >
          Try again
        </button>
      ) : null}
    </div>
  )
}
