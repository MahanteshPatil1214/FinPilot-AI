import type { MatchStatus, MatchingMethod } from '../types/api'

export type Tone = 'matched' | 'partial' | 'risk' | 'neutral' | 'info'

export interface StatusMeta {
  label: string
  tone: Tone
  description: string
}

export const MATCH_STATUS_ORDER: MatchStatus[] = [
  'exact_match',
  'partial_match',
  'possible_match',
  'needs_review',
  'unmatched',
  'duplicate_candidate',
]

export const MATCH_STATUS_META: Record<MatchStatus, StatusMeta> = {
  exact_match: {
    label: 'Exact match',
    tone: 'matched',
    description: 'Reference and amount agree; the strongest deterministic outcome.',
  },
  partial_match: {
    label: 'Partial match',
    tone: 'partial',
    description: 'Linked by reference, but the amount differs.',
  },
  possible_match: {
    label: 'Possible match',
    tone: 'info',
    description: 'Amount agrees within the date window but no reference link.',
  },
  needs_review: {
    label: 'Needs review',
    tone: 'risk',
    description: 'Ambiguous or duplicate signals require a human decision.',
  },
  unmatched: {
    label: 'Unmatched',
    tone: 'neutral',
    description: 'No invoice or transaction counterpart was found.',
  },
  duplicate_candidate: {
    label: 'Duplicate candidate',
    tone: 'risk',
    description: 'The same value appears more than once; verify before trusting.',
  },
}

export function statusMeta(status: string): StatusMeta {
  return (
    MATCH_STATUS_META[status as MatchStatus] ?? {
      label: status,
      tone: 'neutral',
      description: 'Unknown status.',
    }
  )
}

const METHOD_LABELS: Record<MatchingMethod, string> = {
  reference_exact: 'Reference — exact',
  reference_in_description: 'Reference — in description',
  amount_exact_within_window: 'Amount — within date window',
  amount_exact_outside_window: 'Amount — outside date window',
  amount_exact_date_unknown: 'Amount — date unknown',
  none: 'No matching signal',
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method as MatchingMethod] ?? method
}
