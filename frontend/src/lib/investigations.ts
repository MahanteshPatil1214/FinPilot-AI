import type { Tone } from './reconciliation'
import type { Investigation } from '../types/api'

export interface StatusMeta {
  label: string
  tone: Tone
  description: string
}

// Mirrors Investigation.status in the backend (investigation_service.ALL_STATUSES).
// Nothing is inferred for unrecognized values.
export const INVESTIGATION_STATUS_ORDER = [
  'pending',
  'running',
  'completed',
  'needs_review',
  'failed',
  'approved',
  'rejected',
  'needs_more_information',
] as const

const STATUS_META: Record<string, StatusMeta> = {
  pending: {
    label: 'Pending',
    tone: 'neutral',
    description: 'Created but the workflow has not been run yet.',
  },
  running: {
    label: 'Running',
    tone: 'info',
    description: 'The workflow is currently running for this investigation.',
  },
  completed: {
    label: 'Completed',
    tone: 'matched',
    description:
      'A report was generated and no human review was required by the workflow.',
  },
  needs_review: {
    label: 'Needs review',
    tone: 'partial',
    description: 'A report is awaiting a human decision.',
  },
  failed: {
    label: 'Failed',
    tone: 'risk',
    description: 'The workflow run did not produce a report.',
  },
  approved: {
    label: 'Approved',
    tone: 'matched',
    description: 'A human approved the report for the version shown.',
  },
  rejected: {
    label: 'Rejected',
    tone: 'risk',
    description: 'A human rejected the report for the version shown.',
  },
  needs_more_information: {
    label: 'Needs more information',
    tone: 'partial',
    description: 'A human asked for more information before deciding.',
  },
}

export function investigationStatusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      tone: 'neutral',
      description: 'Unrecognized investigation status reported by the backend.',
    }
  )
}

// A review may only be submitted when the investigation is reviewable
// (repository.REVIEWABLE_STATUSES). The report review screen enforces this; the
// workspace only reflects it.
const REVIEWABLE_STATUSES = new Set(['completed', 'needs_review'])

export function isReviewable(status: string): boolean {
  return REVIEWABLE_STATUSES.has(status)
}

// The backend accepts a run from any non-running state; a run while already
// running is not offered because the call is synchronous.
export function canRun(investigation: Investigation): boolean {
  return investigation.status !== 'running'
}

export function hasReport(investigation: Investigation): boolean {
  return investigation.report !== null || investigation.report_version > 0
}

export interface ReviewMeta {
  label: string
  tone: Tone
}

const DECISION_META: Record<string, ReviewMeta> = {
  approved: { label: 'Approved', tone: 'matched' },
  rejected: { label: 'Rejected', tone: 'risk' },
  needs_more_information: { label: 'Needs more information', tone: 'partial' },
}

export function reviewDecisionMeta(decision: string | null | undefined): ReviewMeta {
  if (!decision) {
    return { label: 'No decision', tone: 'neutral' }
  }
  return DECISION_META[decision] ?? { label: decision, tone: 'neutral' }
}

// The current review state of an investigation. A review only counts as current
// when its report_version still matches the investigation's report; a review on
// an older version is superseded by a newer report.
export function currentReviewMeta(
  investigation: Investigation,
): ReviewMeta & { superseded: boolean } {
  if (investigation.review_status) {
    return { ...reviewDecisionMeta(investigation.review_status), superseded: false }
  }
  if (investigation.latest_review && !investigation.latest_review.is_current) {
    return { label: 'Superseded', tone: 'neutral', superseded: true }
  }
  return { label: 'No decision', tone: 'neutral', superseded: false }
}

const CONFIDENCE_META: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'High', tone: 'matched' },
  medium: { label: 'Medium', tone: 'info' },
  low: { label: 'Low', tone: 'partial' },
}

export function confidenceMeta(confidence: string | null | undefined): {
  label: string
  tone: Tone
} {
  if (!confidence) return { label: 'Not recorded', tone: 'neutral' }
  return CONFIDENCE_META[confidence] ?? { label: confidence, tone: 'neutral' }
}

export interface ReportSourceMeta {
  label: string
  provenance: 'deterministic' | 'ai'
  description: string
}

// A report whose model_name is the deterministic sentinel was produced without
// a language model; anything else names the model that wrote the prose.
export function reportSourceMeta(
  modelName: string | null | undefined,
): ReportSourceMeta {
  if (!modelName) {
    return {
      label: 'Not recorded',
      provenance: 'deterministic',
      description: 'No report source was recorded.',
    }
  }
  if (modelName === 'deterministic') {
    return {
      label: 'Deterministic summary',
      provenance: 'deterministic',
      description:
        'This report was produced by deterministic rules only — no language model wrote it.',
    }
  }
  return {
    label: `Model · ${modelName}`,
    provenance: 'ai',
    description:
      'The summary and hypotheses were written by a language model and validated against the gathered facts and evidence.',
  }
}

// The defined, deterministic graph executed by the backend (agents/graph.py).
// Only the last reached stage is persisted in workflow_state.
export const WORKFLOW_STAGES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'validate_request', label: 'Validate request' },
  { key: 'load_financial_records', label: 'Load financial records' },
  { key: 'gather_evidence', label: 'Gather evidence' },
  { key: 'assess_evidence_sufficiency', label: 'Assess evidence sufficiency' },
  { key: 'generate_report', label: 'Generate report' },
  { key: 'validate_report_and_citations', label: 'Validate report and citations' },
]

const OUTCOME_LABELS: Record<string, string> = {
  pending: 'Pending',
  human_review: 'Routed to human review',
  completed: 'Completed',
  failed: 'Failed',
}

const STAGE_LABELS: Record<string, string> = Object.fromEntries([
  ...WORKFLOW_STAGES.map((stage) => [stage.key, stage.label]),
  ...Object.entries(OUTCOME_LABELS),
])

export function stageLabel(state: string | null | undefined): string {
  if (!state) return 'Not recorded'
  return STAGE_LABELS[state] ?? state
}

export function workflowStageIndex(state: string | null | undefined): number {
  if (!state) return -1
  return WORKFLOW_STAGES.findIndex((stage) => stage.key === state)
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  reconciliation_match: 'Reconciliation match',
  bank_transaction: 'Bank transaction',
}

export interface RecordWorkspace {
  to: string
  label: string
}

// The workspace that owns a given database record type, so a citation or linked
// record can point the operator at the screen that holds the underlying values.
export function recordWorkspace(
  recordType: string | null | undefined,
): RecordWorkspace | null {
  switch (recordType) {
    case 'invoice':
      return { to: '/invoices', label: 'Open invoices' }
    case 'bank_transaction':
      return { to: '/transactions', label: 'Open transactions' }
    case 'reconciliation_match':
      return { to: '/reconciliation', label: 'Open reconciliation' }
    default:
      return null
  }
}

export function recordTypeLabel(recordType: string | null | undefined): string {
  if (!recordType) return 'Database record'
  return (
    RECORD_TYPE_LABELS[recordType] ??
    recordType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

export interface CitationKindMeta {
  label: string
  provenance: 'evidence' | 'fact'
}

export function citationKindMeta(kind: string): CitationKindMeta {
  if (kind === 'document_chunk') {
    return { label: 'Document passage', provenance: 'evidence' }
  }
  if (kind === 'database_record') {
    return { label: 'Database record', provenance: 'fact' }
  }
  return { label: kind, provenance: 'fact' }
}
