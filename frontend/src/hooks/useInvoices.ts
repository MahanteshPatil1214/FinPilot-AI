import { useQuery } from '@tanstack/react-query'

import { listInvoices } from '../services/api'

export interface RecordsQueryParams {
  skip?: number
  limit?: number
}

export function useInvoices(params: RecordsQueryParams = {}) {
  return useQuery({
    queryKey: ['invoices', 'list', params],
    queryFn: () => listInvoices(params),
    placeholderData: (previous) => previous,
  })
}
