// Response types mirroring the backend Pydantic schemas.
// Amounts are serialized by Pydantic as JSON strings (e.g. "12000.00") to
// preserve decimal precision; dates are ISO strings.

export type MatchStatus =
  | 'exact_match'
  | 'partial_match'
  | 'possible_match'
  | 'needs_review'
  | 'unmatched'
  | 'duplicate_candidate'

export type MatchingMethod =
  | 'reference_exact'
  | 'reference_in_description'
  | 'amount_exact_within_window'
  | 'amount_exact_outside_window'
  | 'amount_exact_date_unknown'
  | 'none'

export interface ReconciliationMatch {
  id: string
  organization_id: string
  invoice_id: string | null
  transaction_id: string | null
  match_status: MatchStatus
  matching_method: MatchingMethod | string
  difference_amount: string | null
  explanation: string | null
  created_at: string
}

export interface ReconciliationResults {
  organization_id: string
  total: number
  skip: number
  limit: number
  counts: Record<string, number>
  items: ReconciliationMatch[]
}

export interface ReconciliationRunResponse {
  organization_id: string
  date_window_days: number
  generated_at: string
  total_matches: number
  counts: Record<string, number>
}

export interface Invoice {
  id: string
  organization_id: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string | null
  total_amount: string | null
  source_document_id: string | null
  extraction_status: string
  created_at: string
}

export interface BankTransaction {
  id: string
  organization_id: string
  transaction_reference: string | null
  transaction_date: string | null
  description: string | null
  amount: string | null
  currency: string | null
  counterparty: string | null
  source_document_id: string | null
  import_batch_id: string | null
  created_at: string
}

export interface DocumentStatus {
  document_id: string
  processing_status: string
  indexing_status: string
  indexed: boolean
  chunk_count: number
  page_count: number | null
}

export interface DocumentSummary {
  id: string
  organization_id: string
  original_filename: string
  content_type: string | null
  document_type: string | null
  file_hash: string | null
  file_size: number | null
  page_count: number | null
  processing_status: string
  created_at: string
}

export interface DocumentPage {
  page_number: number
  content: string | null
  char_count: number | null
}

export interface DocumentDetail extends DocumentSummary {
  pages: DocumentPage[]
}

export interface DocumentListResponse {
  total: number
  skip: number
  limit: number
  items: DocumentSummary[]
}

export interface DocumentUploadResponse {
  document_id: string
  invoice_id: string | null
  page_count: number
  filename: string
  status: string
}

export interface KnowledgeIndexResponse {
  document_id: string
  chunks_indexed: number
}

// --- Investigations -------------------------------------------------------
// Mirrors app/schemas/investigation.py. The report is a validated structured
// object; citations carry identifiers only (there is no stored excerpt), and
// money remains decimal strings.

export type InvestigationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'approved'
  | 'rejected'
  | 'needs_more_information'

export type ReviewDecisionValue =
  | 'approved'
  | 'rejected'
  | 'needs_more_information'

export interface Citation {
  index: number
  kind: string
  document_id: string | null
  filename: string | null
  document_type: string | null
  page_number: number | null
  chunk_id: string | null
  score: number | null
  record_type: string | null
  record_id: string | null
}

export interface Finding {
  statement: string
  kind: string
  citations: number[]
}

export interface InvestigationReport {
  summary: string
  findings: Finding[]
  missing_evidence: string[]
  recommended_action: string
  confidence: string
  requires_human_review: boolean
  citations: Citation[]
}

export interface ReviewDecisionRecord {
  id: string
  investigation_id: string
  decision: string
  rationale: string
  reviewer_id: string | null
  previous_status: string
  resulting_status: string
  report_version: number
  is_current: boolean
  created_at: string | null
}

export interface Investigation {
  id: string
  organization_id: string
  created_by: string | null
  invoice_id: string | null
  reconciliation_match_id: string | null
  status: InvestigationStatus | string
  workflow_state: string | null
  model_name: string | null
  report_version: number
  report: InvestigationReport | null
  review_status: string | null
  latest_review: ReviewDecisionRecord | null
  created_at: string | null
  updated_at: string | null
}

export interface InvestigationListResponse {
  total: number
  skip: number
  limit: number
  items: Investigation[]
}

export interface ReviewHistoryResponse {
  investigation_id: string
  total: number
  review_status: string | null
  items: ReviewDecisionRecord[]
}

// Mirrors app/schemas/investigation.py ReviewDecisionRequest. The reviewer is
// taken from the authenticated context on the backend, never from the client.
export interface ReviewDecisionRequest {
  decision: ReviewDecisionValue
  rationale: string
  report_version: number
}
