import { useMutation } from '@tanstack/react-query'

import { askKnowledge } from '../services/api'
import type { KnowledgeAskRequest } from '../types/api'

// Ask is a write-shaped, user-initiated action (it runs retrieval and, when
// configured, a model call on the backend), so it is modelled as a mutation
// keyed by the submitted question rather than a cached query.
export function useAskKnowledge() {
  return useMutation({
    mutationFn: (payload: KnowledgeAskRequest) => askKnowledge(payload),
  })
}
