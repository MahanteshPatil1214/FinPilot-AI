import type { UseMutationResult } from '@tanstack/react-query'

import { formatDateTime, shortId } from '../../lib/format'
import {
  currentReviewMeta,
  investigationStatusMeta,
  isReviewable,
} from '../../lib/investigations'
import type { Investigation } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'
import { RunControl } from './RunControl'

interface InvestigationHeaderProps {
  investigation: Investigation
  run: UseMutationResult<Investigation, Error, string>
  onBack: () => void
}

export function InvestigationHeader({
  investigation,
  run,
  onBack,
}: InvestigationHeaderProps) {
  const status = investigationStatusMeta(investigation.status)
  const review = currentReviewMeta(investigation)

  return (
    <header className="border-b border-line px-6 py-4">
      <button
        type="button"
        onClick={onBack}
        className="text-2xs uppercase tracking-label text-muted transition-colors hover:text-ink"
      >
        ← Investigations
      </button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-xl text-ink">
              Investigation{' '}
              <span className="num text-base text-graphite">
                {shortId(investigation.id, 12)}
              </span>
            </h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone} label={status.label} />
            <span className="num text-2xs uppercase tracking-label text-muted">
              Report v{investigation.report_version}
            </span>
            <StatusPill tone={review.tone} label={review.label} />
            {isReviewable(investigation.status) ? (
              <span className="text-2xs uppercase tracking-label text-status-info">
                Awaiting decision
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xs uppercase tracking-label text-muted">
            Created {formatDateTime(investigation.created_at)} · Updated{' '}
            {formatDateTime(investigation.updated_at)}
          </p>
        </div>

        <RunControl investigation={investigation} run={run} />
      </div>
    </header>
  )
}
