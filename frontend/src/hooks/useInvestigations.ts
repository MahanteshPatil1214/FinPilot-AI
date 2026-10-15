import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getInvestigation,
  getInvestigationReviews,
  listInvestigations,
  runInvestigation,
} from '../services/api'

export interface InvestigationsQueryParams {
  status?: string
  skip?: number
  limit?: number
}

export function useInvestigations(params: InvestigationsQueryParams) {
  return useQuery({
    queryKey: ['investigations', 'list', params],
    queryFn: () => listInvestigations(params),
    placeholderData: (previous) => previous,
  })
}

export function useInvestigation(investigationId: string | null) {
  return useQuery({
    queryKey: ['investigations', 'detail', investigationId],
    queryFn: () => getInvestigation(investigationId as string),
    enabled: Boolean(investigationId),
  })
}

export function useInvestigationReviews(investigationId: string | null) {
  return useQuery({
    queryKey: ['investigations', 'reviews', investigationId],
    queryFn: () => getInvestigationReviews(investigationId as string),
    enabled: Boolean(investigationId),
  })
}

export function useRunInvestigation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (investigationId: string) => runInvestigation(investigationId),
    // Refresh details and history once the run settles, whether it succeeded or
    // failed, so the screen always reflects the persisted outcome.
    onSettled: (_result, _error, investigationId) => {
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'detail', investigationId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'reviews', investigationId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'list'],
      })
    },
  })
}
