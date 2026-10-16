import { useQuery } from '@tanstack/react-query'

import { listAuditEvents } from '../services/api'

interface AuditEventsParams {
  entity_type?: string
  entity_id?: string
  action?: string
  skip?: number
  limit?: number
}

export function useAuditEvents(params: AuditEventsParams = {}) {
  return useQuery({
    queryKey: ['audit', 'events', params],
    queryFn: () => listAuditEvents(params),
  })
}
