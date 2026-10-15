import { useQuery } from '@tanstack/react-query'

import { getDashboardSummary } from '../services/api'

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
  })
}
