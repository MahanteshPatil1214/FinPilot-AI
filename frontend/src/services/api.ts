import type {
  BankTransaction,
  DocumentDetail,
  DocumentListResponse,
  DocumentStatus,
  DocumentUploadResponse,
  Invoice,
  KnowledgeIndexResponse,
  ReconciliationResults,
  ReconciliationRunResponse,
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

interface ListDocumentsParams {
  skip?: number
  limit?: number
}

export function listDocuments(
  params: ListDocumentsParams = {},
): Promise<DocumentListResponse> {
  const query = new URLSearchParams()
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<DocumentListResponse>(`/documents${suffix}`)
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
