import { Link } from 'react-router-dom'

import { formatAmountExact, formatSignedAmount } from '../../lib/format'
import { StatusPill } from '../ui/StatusPill'

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-paper/60">{label}</dt>
      <dd className="num text-sm text-paper">{value}</dd>
    </div>
  )
}

// A stylised excerpt of a real reconciliation result, used as the hero's
// centrepiece instead of an abstract illustration. Values mirror the seeded
// demo scenario (see docs/demo-scenario.md).
function LedgerCard() {
  return (
    <div className="animate-rise w-full max-w-sm rounded-sm border border-white/10 bg-ink-soft/80 p-5 shadow-overlay backdrop-blur [animation-delay:180ms]">
      <div className="flex items-center justify-between">
        <span className="text-2xs uppercase tracking-label text-muted">
          Reconciliation
        </span>
        <StatusPill tone="partial" label="Partial match" />
      </div>

      <dl className="mt-4 space-y-2.5">
        <LedgerRow label="Invoice INV-2026-0001" value={formatAmountExact('12000.00')} />
        <LedgerRow
          label="Bank ref INV-2026-0001"
          value={formatAmountExact('11700.00')}
        />
      </dl>

      <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
        <span className="text-2xs uppercase tracking-label text-muted">
          Difference
        </span>
        <span className="num text-sm font-medium text-status-partial">
          {formatSignedAmount('300.00')}
        </span>
      </div>

      <div className="mt-4 rounded-sm border border-white/10 bg-ink/50 p-3">
        <p className="text-2xs uppercase tracking-label text-muted">
          Cited evidence
        </p>
        <p className="mt-1 text-xs leading-relaxed text-paper/90">
          vendor_policy_acme.pdf · page 1 — “300.00 early-settlement discount.”
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
        <span className="text-2xs text-muted">Report v2 · awaiting review</span>
        <span className="num text-2xs text-muted">deterministic</span>
      </div>
    </div>
  )
}

export function HeroPanel() {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div aria-hidden="true" className="rule-grid absolute inset-0 opacity-70" />
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div>
          <p className="animate-rise num text-2xs uppercase tracking-label text-accent-soft/80">
            FinPilot AI · Deterministic financial operations
          </p>
          <h1 className="animate-rise mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.01em] sm:text-5xl lg:text-6xl [animation-delay:60ms]">
            Explain every difference.
            <span className="block text-accent-soft">Then prove it.</span>
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-base leading-relaxed text-paper/70 [animation-delay:120ms]">
            FinPilot AI matches invoices to bank transactions with
            deterministic, Decimal-safe rules, investigates every discrepancy
            through an evidence-grounded workflow, and routes each decision to a
            human — leaving a versioned, append-only audit trail behind it.
          </p>

          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:180ms]">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover"
            >
              Enter the workspace
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              to="/reconciliation"
              className="inline-flex items-center gap-2 rounded-sm border border-white/20 px-4 py-2.5 text-sm text-paper/90 transition-colors hover:border-white/40 hover:text-paper"
            >
              See the demo scenario
            </Link>
          </div>

          <p className="animate-rise mt-8 num text-2xs uppercase tracking-label text-muted [animation-delay:240ms]">
            Decimal-safe matching · Evidence-grounded reports · Append-only audit
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <LedgerCard />
        </div>
      </div>
    </section>
  )
}
