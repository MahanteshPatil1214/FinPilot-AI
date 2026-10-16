interface Stage {
  index: string
  title: string
  detail: string
  tag: string
}

// The five real stages of the system, in order. Tags name the concrete mechanism
// rather than a generic claim.
const STAGES: Stage[] = [
  {
    index: '01',
    title: 'Ingest',
    detail: 'Invoice PDFs are parsed and bank statements imported row by row.',
    tag: 'PyMuPDF · CSV',
  },
  {
    index: '02',
    title: 'Match',
    detail: 'Deterministic rules weigh reference, amount and date window.',
    tag: 'Decimal-safe',
  },
  {
    index: '03',
    title: 'Investigate',
    detail: 'A bounded workflow gathers cited evidence and drafts a report.',
    tag: 'LangGraph + RAG',
  },
  {
    index: '04',
    title: 'Review',
    detail: 'A human approves, rejects, or asks for more information.',
    tag: 'Human gate',
  },
  {
    index: '05',
    title: 'Audit',
    detail: 'Every action is appended; entries are never edited or deleted.',
    tag: 'Append-only',
  },
]

export function PipelineRail() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
      {STAGES.map((stage, position) => (
        <li
          key={stage.index}
          className="relative bg-surface p-5"
          style={{ animationDelay: `${position * 60}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="num text-2xs text-accent">{stage.index}</span>
            <span className="num text-2xs uppercase tracking-label text-muted">
              {stage.tag}
            </span>
          </div>
          <h3 className="mt-4 font-serif text-base text-ink">{stage.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-graphite">
            {stage.detail}
          </p>
        </li>
      ))}
    </ol>
  )
}
