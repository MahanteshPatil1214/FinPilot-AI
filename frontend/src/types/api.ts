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
