import type { Tone } from '../../lib/reconciliation'

const TONE_CLASSES: Record<Tone, string> = {
  matched: 'text-status-matched bg-status-matchedSoft border-status-matched/25',
  partial: 'text-status-partial bg-status-partialSoft border-status-partial/25',
  risk: 'text-status-risk bg-status-riskSoft border-status-risk/25',
  neutral: 'text-status-neutral bg-status-neutralSoft border-status-neutral/25',
  info: 'text-status-info bg-status-infoSoft border-status-info/25',
}

const DOT_CLASSES: Record<Tone, string> = {
  matched: 'bg-status-matched',
  partial: 'bg-status-partial',
  risk: 'bg-status-risk',
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
}

interface StatusPillProps {
  tone: Tone
  label: string
  className?: string
}

export function StatusPill({ tone, label, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-2xs font-semibold uppercase tracking-label ${TONE_CLASSES[tone]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
      {label}
    </span>
  )
}
