import type {
  BankTransaction,
  AuditEventListResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  ConversationCreateRequest,
  ConversationDetail,
  ConversationListResponse,
  ConversationSummary,
  DashboardSummary,
  DocumentDetail,
  DocumentListResponse,
  DocumentStatus,
  DocumentUploadResponse,
  HealthStatus,
  Investigation,
  InvestigationListResponse,
  Invoice,
  KnowledgeAskRequest,
  KnowledgeAskResponse,
  KnowledgeIndexResponse,
  ReconciliationMatch,
  ReconciliationResults,
  ReconciliationRunResponse,
  ReviewDecisionRequest,
  ReviewHistoryResponse,
} from '../types/api'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(extractMessage(status, detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function extractMessage(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.length > 0) return detail
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    const inner = (detail as { detail: unknown }).detail
    if (typeof inner === 'string') return inner
  }
  return `Request failed (${status})`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    let detail: unknown = null
    try {
      detail = await response.json()
    } catch {
      detail = response.statusText
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard/summary')
}

// Liveness probe. Returns only a status and service name; no configuration.
export function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('/health')
}

interface ReconciliationResultsParams {
  status?: string
  skip?: number
  limit?: number
}

export function getReconciliationResults(
  params: ReconciliationResultsParams = {},
): Promise<ReconciliationResults> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<ReconciliationResults>(`/reconciliation/results${suffix}`)
}

export function runReconciliation(
  dateWindowDays?: number,
): Promise<ReconciliationRunResponse> {
  const body =
    dateWindowDays !== undefined
      ? JSON.stringify({ date_window_days: dateWindowDays })
      : undefined
  return request<ReconciliationRunResponse>('/reconciliation/run', {
    method: 'POST',
    body,
  })
}

export function getReconciliationResult(
  matchId: string,
): Promise<ReconciliationMatch> {
  return request<ReconciliationMatch>(
    `/reconciliation/results/${encodeURIComponent(matchId)}`,
  )
}

export function getInvoice(invoiceId: string): Promise<Invoice> {
  return request<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}`)
}

export function getTransaction(
  transactionId: string,
): Promise<BankTransaction> {
  return request<BankTransaction>(
    `/transactions/${encodeURIComponent(transactionId)}`,
  )
}

export function getDocumentStatus(documentId: string): Promise<DocumentStatus> {
  return request<DocumentStatus>(
    `/documents/${encodeURIComponent(documentId)}/status`,
  )
}

interface ListRecordsParams {
  skip?: number
  limit?: number
}

function pageQuery(params: ListRecordsParams): string {
  const query = new URLSearchParams()
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export function listDocuments(
  params: ListRecordsParams = {},
): Promise<DocumentListResponse> {
  return request<DocumentListResponse>(`/documents${pageQuery(params)}`)
}

// The invoice and transaction list endpoints return a plain array of records
// (full objects) with `skip`/`limit` only; there is no total count or filter
// parameter, so pagination is driven by probing one row past the page size.
export function listInvoices(
  params: ListRecordsParams = {},
): Promise<Invoice[]> {
  return request<Invoice[]>(`/invoices${pageQuery(params)}`)
}

export function listTransactions(
  params: ListRecordsParams = {},
): Promise<BankTransaction[]> {
  return request<BankTransaction[]>(`/transactions${pageQuery(params)}`)
}

export function getDocument(documentId: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(
    `/documents/${encodeURIComponent(documentId)}`,
  )
}

// Upload is multipart/form-data: the browser must set the Content-Type header
// itself so the multipart boundary is included, so we bypass `request`.
export async function uploadDocument(
  file: File,
): Promise<DocumentUploadResponse> {
  const form = new FormData()
  form.append('file', file, file.name)

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    let detail: unknown = null
    try {
      detail = await response.json()
    } catch {
      detail = response.statusText
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as DocumentUploadResponse
}

export function indexDocument(
  documentId: string,
): Promise<KnowledgeIndexResponse> {
  return request<KnowledgeIndexResponse>(
    `/knowledge/index/${encodeURIComponent(documentId)}`,
    { method: 'POST' },
  )
}

// Evidence-grounded question answering. The backend retrieves matching document
// passages, asks the model to answer from them and cite them, and returns an
// honest "insufficient evidence" status when nothing clears the threshold. A
// 503 means answer generation is not configured (no model available).
export function askKnowledge(
  payload: KnowledgeAskRequest,
): Promise<KnowledgeAskResponse> {
  return request<KnowledgeAskResponse>('/knowledge/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

interface InvestigationsParams {
  status?: string
  skip?: number
  limit?: number
}

export function listInvestigations(
  params: InvestigationsParams = {},
): Promise<InvestigationListResponse> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<InvestigationListResponse>(`/investigations${suffix}`)
}

export function getInvestigation(
  investigationId: string,
): Promise<Investigation> {
  return request<Investigation>(
    `/investigations/${encodeURIComponent(investigationId)}`,
  )
}

// Running is synchronous on the backend: the response is the finished
// investigation (status and report_version already advanced).
export function runInvestigation(
  investigationId: string,
): Promise<Investigation> {
  return request<Investigation>(
    `/investigations/${encodeURIComponent(investigationId)}/run`,
    { method: 'POST' },
  )
}

export function getInvestigationReviews(
  investigationId: string,
): Promise<ReviewHistoryResponse> {
  return request<ReviewHistoryResponse>(
    `/investigations/${encodeURIComponent(investigationId)}/reviews`,
  )
}

// Records a human decision against a specific report version. The backend
// rejects a stale version (409) or a non-reviewable status (409) rather than
// overwriting a newer report; the returned investigation reflects the new status.
export function submitInvestigationReview(
  investigationId: string,
  payload: ReviewDecisionRequest,
): Promise<Investigation> {
  return request<Investigation>(
    `/investigations/${encodeURIComponent(investigationId)}/review`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

interface AuditEventsParams {
  entity_type?: string
  entity_id?: string
  action?: string
  skip?: number
  limit?: number
}

// The audit trail is append-only and organization-scoped; this is the only
// request the client makes against it (a read).
export function listAuditEvents(
  params: AuditEventsParams = {},
): Promise<AuditEventListResponse> {
  const query = new URLSearchParams()
  if (params.entity_type) query.set('entity_type', params.entity_type)
  if (params.entity_id) query.set('entity_id', params.entity_id)
  if (params.action) query.set('action', params.action)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<AuditEventListResponse>(`/audit/events${suffix}`)
}

// --- Assistant chat --------------------------------------------------------

export function listConversations(): Promise<ConversationListResponse> {
  return request<ConversationListResponse>('/chat/conversations')
}

export function createConversation(
  payload: ConversationCreateRequest = {},
): Promise<ConversationSummary> {
  return request<ConversationSummary>('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  return request<ConversationDetail>(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
  )
}

export function deleteConversation(conversationId: string): Promise<void> {
  return request<void>(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
  )
}

// Sends one user turn and returns the persisted user and assistant messages.
// The backend classifies the request, runs only the relevant read-only tools and
// returns structured provenance; this call never mutates financial records.
export function sendChatMessage(
  conversationId: string,
  payload: ChatMessageRequest,
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}
