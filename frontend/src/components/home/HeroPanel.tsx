import { Link } from 'react-router-dom'

import { PROVENANCE, type ProvenanceKind } from '../../lib/provenance'

const LAYER_ORDER: ProvenanceKind[] = [
  'fact',
  'deterministic',
  'evidence',
  'ai',
  'human',
]

const LAYER_NOTE: Record<ProvenanceKind, string> = {
  fact: 'Stored database values',
  deterministic: 'Decimal-safe matching rules',
  evidence: 'Semantically retrieved passages',
  ai: 'Draft findings over that evidence',
  human: 'Versioned reviewer decision',
}

// The five layers FinPilot AI keeps separately identifiable. Showing them in the
// hero communicates the product's core guarantee at a glance; it is an
// architecture legend, not a depiction of live activity.
function ProvenanceLegend() {
  return (
    <div className="animate-rise rounded-sm border border-white/10 bg-ink-soft/70 p-5 shadow-overlay backdrop-blur [animation-delay:180ms]">
      <p className="num text-2xs uppercase tracking-label text-muted">
        Provenance, kept separate
      </p>
      <ol className="mt-4 space-y-3">
        {LAYER_ORDER.map((kind, index) => (
          <li key={kind} className="flex items-center gap-3">
            <span className="num w-4 shrink-0 text-2xs text-muted">
              {index + 1}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-label ${PROVENANCE[kind].className}`}
            >
              {PROVENANCE[kind].short}
            </span>
            <span className="min-w-0 text-xs text-paper/70">
              {LAYER_NOTE[kind]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function HeroPanel() {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div aria-hidden="true" className="rule-grid absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div>
          <p className="animate-rise num text-2xs uppercase tracking-label text-accent-soft/80">
            FinPilot AI · AI financial operations
          </p>
          <h1 className="animate-rise mt-5 max-w-2xl font-serif text-4xl leading-[1.05] tracking-[-0.01em] sm:text-5xl lg:text-6xl [animation-delay:60ms]">
            Every discrepancy has evidence.
            <span className="block text-accent-soft">Every decision has a trail.</span>
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-base leading-relaxed text-paper/70 [animation-delay:120ms]">
            FinPilot AI reconciles financial records deterministically, retrieves
            the supporting documents, investigates discrepancies through a
            bounded AI workflow, and routes every decision to human review —
            with each layer kept separately identifiable and fully auditable.
          </p>

          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:180ms]">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover"
            >
              Enter workspace
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              to="/reconciliation"
              className="inline-flex items-center gap-2 rounded-sm border border-white/20 px-4 py-2.5 text-sm text-paper/90 transition-colors hover:border-white/40 hover:text-paper"
            >
              Explore the demo
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ProvenanceLegend />
        </div>
      </div>
    </section>
  )
}
