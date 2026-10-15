import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ReviewDecisionValue } from '../types/api'
import {
  getInvestigation,
  getInvestigationReviews,
  listInvestigations,
  runInvestigation,
  submitInvestigationReview,
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

export interface SubmitReviewInput {
  investigationId: string
  decision: ReviewDecisionValue
  rationale: string
  reportVersion: number
}

export function useSubmitInvestigationReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitReviewInput) =>
      submitInvestigationReview(input.investigationId, {
        decision: input.decision,
        rationale: input.rationale,
        report_version: input.reportVersion,
      }),
    // A decision changes the investigation's status and review history. Refresh
    // both (and the queue) once it settles — including on a 409 conflict, where
    // the refetch surfaces the version the backend actually holds.
    onSettled: (_result, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'detail', input.investigationId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'reviews', input.investigationId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['investigations', 'list'],
      })
    },
  })
}
