import type { Tone } from './reconciliation'

export interface StatusMeta {
  label: string
  tone: Tone
  description: string
}

// Mirrors the persisted `processing_status` written by the upload endpoint.
// Nothing is inferred for unknown values.
const PROCESSING_META: Record<string, StatusMeta> = {
  completed: {
    label: 'Processed',
    tone: 'matched',
    description:
      'Text was extracted from the uploaded PDF and stored page by page.',
  },
  pending: {
    label: 'Pending',
    tone: 'partial',
    description: 'Stored, but structured processing has not completed yet.',
  },
  failed: {
    label: 'Failed',
    tone: 'risk',
    description: 'Processing did not complete for this document.',
  },
}

export function processingMeta(status: string | null | undefined): StatusMeta {
  if (!status) {
    return {
      label: 'Unknown',
      tone: 'neutral',
      description: 'No processing status was reported.',
    }
  }
  return (
    PROCESSING_META[status] ?? {
      label: status,
      tone: 'neutral',
      description: 'Unrecognized processing state reported by the backend.',
    }
  )
}

// Indexing status is derived server-side from the stored chunk count only.
export function indexingMeta(indexed: boolean): StatusMeta {
  return indexed
    ? {
        label: 'Indexed',
        tone: 'matched',
        description:
          'Chunks are stored and available as evidence for investigation.',
      }
    : {
        label: 'Not indexed',
        tone: 'neutral',
        description:
          'No chunks are stored yet. Run indexing to enable evidence retrieval.',
      }
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function documentTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return type
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
