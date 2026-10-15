import type { Tone } from './reconciliation'

export interface StatusMeta {
  label: string
  tone: Tone
  description: string
}

// Mirrors the persisted `extraction_status` written when an invoice record is
// created from a source document. Nothing is inferred for unknown values.
const EXTRACTION_META: Record<string, StatusMeta> = {
  completed: {
    label: 'Extracted',
    tone: 'matched',
    description:
      'Structured invoice fields were extracted from the source document.',
  },
  pending: {
    label: 'Pending',
    tone: 'partial',
    description:
      'The invoice record exists but structured fields have not been extracted yet.',
  },
  failed: {
    label: 'Failed',
    tone: 'risk',
    description: 'Field extraction did not complete for this invoice.',
  },
}

export function extractionStatusMeta(
  status: string | null | undefined,
): StatusMeta {
  if (!status) {
    return {
      label: 'Unknown',
      tone: 'neutral',
      description: 'No extraction status was reported.',
    }
  }
  return (
    EXTRACTION_META[status] ?? {
      label: status,
      tone: 'neutral',
      description: 'Unrecognized extraction state reported by the backend.',
    }
  )
}
