import type { Tone } from './reconciliation'
import type { ChatOutcome, ChatResultRef, ChatToolCall } from '../types/api'

export interface ChatOutcomeMeta {
  label: string
  tone: Tone
  description: string
}

// How each assistant outcome should read. "answered" and "success" are the two
// positive endings; every other outcome is an honest, distinct non-answer that
// the UI must never dress up as a result.
export const CHAT_OUTCOME_META: Record<ChatOutcome, ChatOutcomeMeta> = {
  answered: {
    label: 'Answered',
    tone: 'matched',
    description: 'Grounded in the cited document passages.',
  },
  success: {
    label: 'Completed',
    tone: 'matched',
    description: 'Computed from stored records.',
  },
  insufficient_evidence: {
    label: 'Insufficient evidence',
    tone: 'partial',
    description: 'The available records do not support an answer.',
  },
  needs_clarification: {
    label: 'Needs a detail',
    tone: 'info',
    description: 'A specific record is required to continue.',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'partial',
    description: 'A required capability is not configured.',
  },
  unsupported: {
    label: 'Not supported',
    tone: 'risk',
    description: 'This request is outside the assistant’s scope.',
  },
  error: {
    label: 'Failed',
    tone: 'risk',
    description: 'The request could not be completed.',
  },
}

export function chatOutcomeMeta(outcome: string | null | undefined): ChatOutcomeMeta {
  if (!outcome) {
    return {
      label: 'Unclassified',
      tone: 'neutral',
      description: 'No outcome was recorded for this message.',
    }
  }
  return (
    CHAT_OUTCOME_META[outcome as ChatOutcome] ?? {
      label: outcome,
      tone: 'neutral',
      description: 'Unrecognized outcome.',
    }
  )
}

export type ToolTone = 'ok' | 'empty' | 'error' | 'skipped'

const TOOL_LABELS: Record<ToolTone, string> = {
  ok: 'Ran',
  empty: 'No results',
  error: 'Failed',
  skipped: 'Skipped',
}

export function toolStatusTone(status: string): ToolTone {
  if (status === 'ok' || status === 'empty' || status === 'error' || status === 'skipped') {
    return status
  }
  return 'skipped'
}

export function toolStatusLabel(status: string): string {
  return TOOL_LABELS[toolStatusTone(status)]
}

// A compact, honest summary line for the tool-trace disclosure. The outcome of
// a turn is only ever claimed from evidence the backend recorded: if no tool
// calls were recorded, we say so rather than implying activity.
export function toolTraceSummary(toolCalls: ChatToolCall[]): string {
  if (toolCalls.length === 0) return 'No tools were run'
  const errored = toolCalls.filter((call) => call.status === 'error').length
  const skipped = toolCalls.filter((call) => call.status === 'skipped').length
  const parts = [`${toolCalls.length} step${toolCalls.length === 1 ? '' : 's'}`]
  if (errored) parts.push(`${errored} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  return parts.join(' · ')
}

const REF_KIND_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  transaction: 'Transaction',
  document: 'Document',
  reconciliation: 'Reconciliation',
  investigation: 'Investigation',
  review: 'Review',
}

export function refKindLabel(kind: string): string {
  return REF_KIND_LABELS[kind] ?? kind
}

export function citationLabel(
  index: number,
  filename: string,
  page: number | null,
): string {
  const pageLabel = page !== null ? `page ${page}` : 'page unknown'
  return `[${index}] ${filename} — ${pageLabel}`
}

// Deduplicate result references by kind+href so a turn that consulted the same
// record twice (for example an invoice and its reconciliation row) does not
// repeat the link.
export function uniqueRefs(refs: ChatResultRef[]): ChatResultRef[] {
  const seen = new Set<string>()
  const result: ChatResultRef[] = []
  for (const ref of refs) {
    const key = `${ref.kind}|${ref.href}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }
  return result
}
