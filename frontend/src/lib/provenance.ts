export type ProvenanceKind =
  | 'fact'
  | 'deterministic'
  | 'evidence'
  | 'ai'
  | 'human'

export interface ProvenanceMeta {
  label: string
  short: string
  className: string
}

// Visually separates the layers of a financial claim: a stored database value,
// a deterministic rule outcome, retrieved evidence, an AI hypothesis, or a
// human decision. The same classes are reused by SourceTag and ProvenanceList.
export const PROVENANCE: Record<ProvenanceKind, ProvenanceMeta> = {
  fact: {
    label: 'Database fact',
    short: 'DB FACT',
    className: 'text-ink-soft border-line-strong bg-paper',
  },
  deterministic: {
    label: 'Deterministic result',
    short: 'DETERMINISTIC',
    className: 'text-accent border-accent/30 bg-accent-soft',
  },
  evidence: {
    label: 'Retrieved evidence',
    short: 'EVIDENCE',
    className: 'text-status-info border-status-info/25 bg-status-infoSoft',
  },
  ai: {
    label: 'AI hypothesis',
    short: 'AI',
    className: 'text-status-partial border-status-partial/25 bg-status-partialSoft',
  },
  human: {
    label: 'Human decision',
    short: 'HUMAN',
    className:
      'text-status-matched border-status-matched/25 bg-status-matchedSoft',
  },
}
