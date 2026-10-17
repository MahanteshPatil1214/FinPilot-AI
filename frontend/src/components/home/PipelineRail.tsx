import {
  PROVENANCE,
  type ProvenanceKind,
} from '../../lib/provenance'

interface Stage {
  index: string
  kind: ProvenanceKind
  title: string
  detail: string
}

// The five real stages of the system, in order. Each stage is tagged with the
// provenance layer it produces, so deterministic logic, retrieved evidence,
// AI hypotheses and human decisions stay visually distinguishable.
const STAGES: Stage[] = [
  {
    index: '01',
    kind: 'fact',
    title: 'Financial inputs',
    detail:
      'Invoices, bank CSVs and supporting documents are ingested and stored as organization-scoped records.',
  },
  {
    index: '02',
    kind: 'deterministic',
    title: 'Deterministic reconciliation',
    detail:
      'Exact decimal arithmetic and rule-based matching link records and flag differences — no model in the loop.',
  },
  {
    index: '03',
    kind: 'evidence',
    title: 'Document retrieval',
    detail:
      'Sentence Transformers embeddings (all-MiniLM-L6-v2, 384 dims) and PostgreSQL/pgvector return relevant passages.',
  },
  {
    index: '04',
    kind: 'ai',
    title: 'Agent investigation',
    detail:
      'A bounded LangGraph workflow reads evidence with read-only tools; Groq powers report generation when configured.',
  },
  {
    index: '05',
    kind: 'human',
    title: 'Human review',
    detail:
      'Approve, reject or request more information. Decisions are versioned and written to an append-only audit trail.',
  },
]

export function PipelineRail() {
  const lastIndex = STAGES.length - 1

  return (
    <div>
      <span className="num text-2xs uppercase tracking-label text-accent">
        Technology pipeline
      </span>
      <h2 className="mt-3 font-serif text-2xl leading-snug text-ink">
        From raw records to a reviewed decision
      </h2>

      <ol className="mt-6 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage) => (
          <li key={stage.index} className="relative bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="num text-2xs text-muted">{stage.index}</span>
              {stage.index !== STAGES[lastIndex].index ? (
                <span
                  aria-hidden="true"
                  className="num hidden text-2xs text-line-strong lg:inline"
                >
                  →
                </span>
              ) : null}
            </div>
            <span
              className={`mt-3 inline-flex items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-label ${PROVENANCE[stage.kind].className}`}
            >
              {PROVENANCE[stage.kind].short}
            </span>
            <h3 className="mt-2 font-serif text-base leading-snug text-ink">
              {stage.title}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-graphite">
              {stage.detail}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
        Each stage produces a distinct, labelled layer. Deterministic logic,
        retrieved evidence, AI-generated hypotheses and human decisions are never
        merged into a single undifferentiated answer.
      </p>
    </div>
  )
}
