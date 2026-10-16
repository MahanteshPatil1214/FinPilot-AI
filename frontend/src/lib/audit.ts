import type { Tone } from './reconciliation'

export interface AuditActionMeta {
  label: string
  tone: Tone
  description: string
}

// Mirrors the actions the backend writes today (investigation_repository and
// investigation_service). Unrecognized actions are shown verbatim rather than
// guessed at, so a new server-side action never renders as a misleading label.
const ACTION_META: Record<string, AuditActionMeta> = {
  investigation_created: {
    label: 'Investigation created',
    tone: 'info',
    description: 'A new investigation case file was opened.',
  },
  investigation_run: {
    label: 'Investigation run',
    tone: 'neutral',
    description: 'The investigation workflow ran and recorded an outcome.',
  },
  review_decision: {
    label: 'Review decision',
    tone: 'matched',
    description: 'A human recorded a decision on a report version.',
  },
}

export const AUDIT_ACTION_ORDER = [
  'investigation_created',
  'investigation_run',
  'review_decision',
] as const

export function auditActionMeta(action: string): AuditActionMeta {
  return (
    ACTION_META[action] ?? {
      label: action.replace(/[_-]+/g, ' '),
      tone: 'neutral',
      description: 'Unrecognized audit action reported by the backend.',
    }
  )
}

const ENTITY_LABELS: Record<string, string> = {
  investigation: 'Investigation',
}

export function auditEntityLabel(entityType: string): string {
  return (
    ENTITY_LABELS[entityType] ??
    entityType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// A compact, human-readable rendering of an event's details payload. Keys are
// humanized and empty values are skipped; an empty or absent payload renders as
// an em dash rather than a misleading blank.
export function summarizeAuditDetails(
  details: Record<string, unknown> | null | undefined,
): string {
  if (!details) return '—'
  const parts: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || value === '') continue
    parts.push(`${humanizeKey(key)}: ${formatValue(value)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}
