import { Link } from 'react-router-dom'

import { HeroPanel } from '../components/home/HeroPanel'
import { PipelineRail } from '../components/home/PipelineRail'
import { ScenarioSpotlight } from '../components/home/ScenarioSpotlight'

const PAIN_POINTS = [
  'Unmatched rows and small deltas pile up in spreadsheets, each one a manual hunt.',
  'The explanation already exists — in a policy PDF or a forwarded email nobody reopens.',
  'Decisions get re-litigated, and there is no defensible trail when an auditor asks.',
]

const OUTCOMES = [
  {
    problem: 'A difference nobody can explain',
    outcome: 'A deterministic delta with a cited document behind it',
  },
  {
    problem: 'AI you cannot trust with money',
    outcome: 'A model that only reads evidence and drafts prose',
  },
  {
    problem: 'The same case decided twice',
    outcome: 'Versioned reviews — stale decisions rejected, not overwritten',
  },
  {
    problem: 'No defensible record for auditors',
    outcome: 'An append-only trail of who did what, and when',
  },
]

const GUARDRAILS = [
  {
    label: 'Determinism',
    detail:
      'The deterministic core never calls the LLM. Matching is rules, not guesses.',
  },
  {
    label: 'Containment',
    detail:
      'The LLM never mutates financial records. It reads evidence and drafts a report.',
  },
  {
    label: 'Versioning',
    detail:
      'Reviews bind to a report version; a stale submission is rejected, never overwritten.',
  },
  {
    label: 'Isolation',
    detail:
      'Every read is organization-scoped at the data layer, from documents to audit.',
  },
]

const WORKSPACES = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/documents', label: 'Document center' },
  { to: '/reconciliation', label: 'Reconciliation' },
  { to: '/investigations', label: 'Investigations' },
  { to: '/reviews', label: 'Report review' },
  { to: '/audit', label: 'Audit history' },
]

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="num text-2xs uppercase tracking-label text-accent">
      {children}
    </span>
  )
}

export function HomePage() {
  return (
    <div className="pb-16">
      <HeroPanel />

      {/* The problem --------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.4fr_0.6fr]">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 max-w-xs font-serif text-2xl leading-snug text-ink">
              Reconciliation tells you a number is wrong. It rarely tells you
              why.
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-2xl text-base leading-relaxed text-graphite">
              Finance teams reconcile in spreadsheets and reconcile again next
              month. The hard part was never the arithmetic — it is explaining a
              difference, deciding what to do about it, and being able to show
              your work later.
            </p>
            <ul className="mt-8 space-y-4">
              {PAIN_POINTS.map((point) => (
                <li key={point} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-status-partial"
                  />
                  <span className="text-sm leading-relaxed text-graphite">
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works -------------------------------------------------- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 font-serif text-2xl text-ink">
                One bounded pipeline, five honest stages
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">
              Nothing skips a step, and nothing outside the pipeline can touch a
              financial record.
            </p>
          </div>
          <div className="mt-8">
            <PipelineRail />
          </div>
        </div>
      </section>

      {/* What it solves ------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <Eyebrow>What it solves</Eyebrow>
        <h2 className="mt-3 max-w-lg font-serif text-2xl leading-snug text-ink">
          From an open question to a defensible answer
        </h2>

        <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
          {OUTCOMES.map((item) => (
            <div key={item.problem} className="bg-surface p-6">
              <p className="text-2xs uppercase tracking-label text-muted">
                Problem
              </p>
              <p className="mt-1.5 text-sm text-graphite">{item.problem}</p>
              <div className="mt-4 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="text-accent"
                >
                  →
                </span>
                <p className="text-2xs uppercase tracking-label text-accent">
                  What you get
                </p>
              </div>
              <p className="mt-1.5 font-serif text-lg leading-snug text-ink">
                {item.outcome}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Guardrails ---------------------------------------------------- */}
      <section className="relative overflow-hidden border-y border-ink bg-ink text-paper">
        <div
          aria-hidden="true"
          className="rule-grid absolute inset-0 opacity-60"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-14 lg:py-20">
          <span className="num text-2xs uppercase tracking-label text-accent-soft/80">
            Guardrails
          </span>
          <h2 className="mt-3 max-w-lg font-serif text-2xl leading-snug">
            The AI assists. It does not hold the pen on money.
          </h2>
          <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {GUARDRAILS.map((item) => (
              <div
                key={item.label}
                className="border-l border-white/15 pl-4"
              >
                <dt className="num text-2xs uppercase tracking-label text-paper">
                  {item.label}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-paper/70">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Scenario ------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <ScenarioSpotlight />
      </section>

      {/* Footer CTA ---------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="rounded-sm border border-line bg-paper p-6 lg:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-serif text-2xl text-ink">
                Explore the workspace
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite">
                Every screen reads the same persisted, organization-scoped data.
                Start at the dashboard, or jump straight to a workspace.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover"
            >
              Enter the workspace
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-6">
            {WORKSPACES.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-sm border border-line px-3 py-1.5 text-xs text-graphite transition-colors hover:border-line-strong hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
