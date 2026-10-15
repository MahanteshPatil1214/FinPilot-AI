import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  getDocumentStatus,
  getInvoice,
  getReconciliationResults,
  getTransaction,
  runReconciliation,
} from '../services/api'

export interface ReconciliationQueryParams {
  status?: string
  skip?: number
  limit?: number
}

export function useReconciliationResults(params: ReconciliationQueryParams) {
  return useQuery({
    queryKey: ['reconciliation', 'results', params],
    queryFn: () => getReconciliationResults(params),
    placeholderData: (previous) => previous,
  })
}

export function useRunReconciliation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dateWindowDays?: number) => runReconciliation(dateWindowDays),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
    },
  })
}

export function useInvoice(invoiceId: string | null) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => getInvoice(invoiceId as string),
    enabled: Boolean(invoiceId),
  })
}

export function useTransaction(transactionId: string | null) {
  return useQuery({
    queryKey: ['transaction', transactionId],
    queryFn: () => getTransaction(transactionId as string),
    enabled: Boolean(transactionId),
  })
}

export function useDocumentStatus(documentId: string | null) {
  return useQuery({
    queryKey: ['document', 'status', documentId],
    queryFn: () => getDocumentStatus(documentId as string),
    enabled: Boolean(documentId),
  })
}
