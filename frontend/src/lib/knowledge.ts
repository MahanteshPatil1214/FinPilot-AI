import type { Tone } from './reconciliation'

export interface KnowledgeStatusMeta {
  label: string
  tone: Tone
  description: string
}

// The backend returns one of two statuses for an answer. "answered" means the
// model produced a grounded, cited response; "insufficient_evidence" means no
// passage cleared the relevance threshold (or the model declined), so the client
// must present it honestly rather than as an answer.
export const KNOWLEDGE_STATUS_META: Record<string, KnowledgeStatusMeta> = {
  answered: {
    label: 'Answered',
    tone: 'matched',
    description: 'Grounded in the cited document passages.',
  },
  insufficient_evidence: {
    label: 'Insufficient evidence',
    tone: 'partial',
    description: 'The uploaded documents do not contain a sufficient answer.',
  },
}

export function knowledgeStatusMeta(status: string): KnowledgeStatusMeta {
  return (
    KNOWLEDGE_STATUS_META[status] ?? {
      label: status,
      tone: 'neutral',
      description: 'Unrecognized answer status.',
    }
  )
}
