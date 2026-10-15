import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  getDocument,
  getDocumentStatus,
  indexDocument,
  listDocuments,
  uploadDocument,
} from '../services/api'

interface DocumentsQueryParams {
  skip?: number
  limit?: number
}

export function useDocuments(params: DocumentsQueryParams = {}) {
  return useQuery({
    queryKey: ['documents', 'list', params],
    queryFn: () => listDocuments(params),
    placeholderData: (previous) => previous,
  })
}

export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: ['documents', 'detail', documentId],
    queryFn: () => getDocument(documentId as string),
    enabled: Boolean(documentId),
  })
}

export function useDocumentStatus(documentId: string | null) {
  return useQuery({
    queryKey: ['documents', 'status', documentId],
    queryFn: () => getDocumentStatus(documentId as string),
    enabled: Boolean(documentId),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadDocument(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'list'] })
    },
  })
}

export function useIndexDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) => indexDocument(documentId),
    onSuccess: (_result, documentId) => {
      void queryClient.invalidateQueries({
        queryKey: ['documents', 'status', documentId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['documents', 'detail', documentId],
      })
    },
  })
}
