import { useHealth } from '../../hooks/useHealth'

const STACK = [
  {
    name: 'FastAPI',
    detail: 'Python API with schema-validated request and response contracts.',
  },
  {
    name: 'PostgreSQL + pgvector',
    detail: 'Transactional storage plus vector search, one database.',
  },
  {
    name: 'Sentence Transformers',
    detail: 'Local all-MiniLM-L6-v2 embeddings at 384 dimensions.',
  },
  {
    name: 'Groq LLM',
    detail: 'Drafts investigation reports when a key is configured.',
  },
  {
    name: 'LangGraph',
    detail: 'A bounded, read-only investigation workflow.',
  },
  {
    name: 'React + TypeScript',
    detail: 'This workspace: typed, accessible, real data only.',
  },
]

// Health is reported honestly: the endpoint exposes service liveness only, so
// the panel never implies that an LLM is reachable just because it is configured.
function ServiceStatus() {
  const health = useHealth()

  const label = health.isLoading
    ? 'Checking…'
    : health.isError
      ? 'Unreachable'
      : (health.data?.status ?? 'Unknown')

  const tone = health.isLoading
    ? 'text-muted'
    : health.isError
      ? 'text-status-risk'
      : 'text-status-matched'

  return (
    <p className="text-xs text-graphite">
      Service status{' '}
      <span className={`num font-medium ${tone}`}>{label}</span>
    </p>
  )
}

export function StackPanel() {
  return (
    <div>
      <span className="num text-2xs uppercase tracking-label text-accent">
        Under the hood
      </span>
      <h2 className="mt-3 font-serif text-2xl leading-snug text-ink">
        Built from ordinary, inspectable parts.
      </h2>

      <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {STACK.map((item) => (
          <div key={item.name} className="bg-surface p-5">
            <h3 className="font-serif text-base text-ink">{item.name}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-graphite">
              {item.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ServiceStatus />
        <p className="max-w-xl text-xs leading-relaxed text-muted">
          The liveness probe reports service status only. The model used for a run
          is recorded on the investigation itself — availability is never assumed
          from configuration.
        </p>
      </div>
    </div>
  )
}
