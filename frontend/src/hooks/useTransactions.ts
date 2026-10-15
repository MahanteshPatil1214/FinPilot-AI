import { useQuery } from '@tanstack/react-query'

import { listTransactions } from '../services/api'

export interface RecordsQueryParams {
  skip?: number
  limit?: number
}

export function useTransactions(params: RecordsQueryParams = {}) {
  return useQuery({
    queryKey: ['transactions', 'list', params],
    queryFn: () => listTransactions(params),
    placeholderData: (previous) => previous,
  })
}
