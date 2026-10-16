import { Link } from 'react-router-dom'

import { formatAmountExact, formatSignedAmount } from '../../lib/format'

const ARTIFACTS = [
  {
    name: 'invoice_acme_2026_0001.pdf',
    role: 'Invoice INV-2026-0001',
    value: formatAmountExact('12000.00'),
  },
  {
    name: 'bank_statement_2026_01.csv',
    role: 'Payment referencing the invoice',
    value: formatAmountExact('11700.00'),
  },
  {
    name: 'vendor_policy_acme.pdf',
    role: 'Explains the 300.00 early-settlement discount',
    value: null,
  },
]

export function ScenarioSpotlight() {
  return (
    <div className="overflow-hidden rounded-sm border border-line bg-surface">
      <div className="grid lg:grid-cols-[1fr_0.85fr]">
        <div className="p-6 lg:p-8">
          <span className="num text-2xs uppercase tracking-label text-accent">
            The demo scenario
          </span>
          <h2 className="mt-3 max-w-md font-serif text-2xl leading-snug text-ink">
            A payment lands 300.00 short. The answer is one document away.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-graphite">
            FinPilot AI flags the difference deterministically, then retrieves
            and <span className="text-ink">cites</span> the vendor policy that
            explains it — a 300.00 early-settlement discount. The reconciliation
            itself never changes; the investigation only explains it, and a
            human decides.
          </p>
          <Link
            to="/reconciliation"
            className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Open the reconciliation workspace
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>

        <div className="border-t border-line bg-paper p-6 lg:border-l lg:border-t-0 lg:p-8">
          <ul className="space-y-4">
            {ARTIFACTS.map((artifact) => (
              <li
                key={artifact.name}
                className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-4 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="num truncate text-xs text-ink">
                    {artifact.name}
                  </p>
                  <p className="mt-0.5 text-2xs text-muted">{artifact.role}</p>
                </div>
                {artifact.value ? (
                  <span className="num shrink-0 text-sm text-ink-soft">
                    {artifact.value}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-sm border border-status-info/25 bg-status-infoSoft px-2 py-0.5 text-2xs font-semibold uppercase tracking-label text-status-info">
                    Cited
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-baseline justify-between rounded-sm bg-surface px-4 py-3">
            <span className="text-2xs uppercase tracking-label text-muted">
              Unexplained difference
            </span>
            <span className="num text-base font-medium text-status-partial">
              {formatSignedAmount('300.00')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
