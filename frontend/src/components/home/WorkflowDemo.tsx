import {
  PROVENANCE,
  type ProvenanceKind,
} from '../../lib/provenance'

interface Step {
  kind: ProvenanceKind
  title: string
  detail: string
}

// An explicitly illustrative walk-through of how the five layers cooperate on a
// single discrepancy. It deliberately uses no amounts, identifiers, citations or
// outcomes, so nothing here can be mistaken for a real record.
const STEPS: Step[] = [
  {
    kind: 'fact',
    title: 'Rows are read',
    detail:
      'An invoice row and a bank transaction row are loaded from PostgreSQL, scoped to this organization.',
  },
  {
    kind: 'deterministic',
    title: 'The difference is computed',
    detail:
      'The reference links, but the amounts differ. The delta is computed exactly with Decimal-safe arithmetic and the result is a deterministic partial match.',
  },
  {
    kind: 'evidence',
    title: 'Evidence is retrieved',
    detail:
      'Semantic search over indexed documents surfaces the passages most relevant to that difference.',
  },
  {
    kind: 'ai',
    title: 'A finding is drafted',
    detail:
      'A bounded LangGraph workflow drafts a finding that cites those retrieved passages — without performing financial arithmetic of its own.',
  },
  {
    kind: 'human',
    title: 'A human decides',
    detail:
      'A reviewer approves, rejects or requests more information. The decision is versioned and appended to the audit trail.',
  },
]

export function WorkflowDemo() {
  return (
    <div className="overflow-hidden rounded-sm border border-line bg-surface">
      <div className="grid lg:grid-cols-[1fr_1.05fr]">
        <div className="border-b border-line p-6 lg:border-b-0 lg:border-r lg:p-8">
          <span className="num text-2xs uppercase tracking-label text-accent">
            Evidence &amp; agent workflow
          </span>
          <h2 className="mt-3 max-w-md font-serif text-2xl leading-snug text-ink">
            Retrieved evidence grounds the model. It never owns the numbers.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-graphite">
            When a deterministic match leaves a difference, retrieval supplies the
            supporting passages and the workflow drafts a cited finding. The
            calculation and the final decision stay on the deterministic and
            human layers — separately identifiable at every step.
          </p>

          <div className="mt-6 rounded-sm border border-line bg-paper p-4">
            <p className="text-sm leading-relaxed text-graphite">
              <span className="font-medium text-ink">
                Retrieved passages support AI reasoning.
              </span>{' '}
              Financial calculations and the final human decision remain
              separately identifiable. The model reads evidence and drafts prose;
              it never mutates financial records.
            </p>
          </div>
        </div>

        <div className="bg-paper p-6 lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="num text-2xs uppercase tracking-label text-muted">
              Illustrative workflow
            </span>
            <span className="rounded-sm border border-dashed border-line-strong px-2 py-0.5 text-2xs uppercase tracking-label text-muted">
              Not a real record
            </span>
          </div>

          <ol className="mt-5 space-y-4">
            {STEPS.map((step) => (
              <li key={step.kind} className="flex gap-3">
                <span className="mt-0.5 flex w-28 shrink-0 justify-start">
                  <span
                    className={`inline-flex items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-label ${PROVENANCE[step.kind].className}`}
                  >
                    {PROVENANCE[step.kind].short}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-ink">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-graphite">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
