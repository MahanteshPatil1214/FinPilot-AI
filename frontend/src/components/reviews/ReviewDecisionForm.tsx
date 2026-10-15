import type { UseMutationResult } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import type { SubmitReviewInput } from '../../hooks/useInvestigations'
import {
  investigationStatusMeta,
  isReviewable,
  reviewDecisionMeta,
} from '../../lib/investigations'
import { ApiError } from '../../services/api'
import type { Investigation, ReviewDecisionValue } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

const MAX_RATIONALE = 2000

const DECISIONS: {
  value: ReviewDecisionValue
  label: string
  cta: string
  description: string
}[] = [
  {
    value: 'approved',
    label: 'Approve',
    cta: 'Approve report',
    description: 'Accept the report as recorded for this version.',
  },
  {
    value: 'rejected',
    label: 'Reject',
    cta: 'Reject report',
    description: 'Reject the report for this version.',
  },
  {
    value: 'needs_more_information',
    label: 'Needs more information',
    cta: 'Request more information',
    description: 'Hold the decision until more information is available.',
  },
]

interface Conflict {
  stale: boolean
  message: string
}

// A 409 from the backend is either a stale report version or a status that is no
// longer eligible for review. Both must surface without a decision being saved.
function conflictFrom(error: Error | null): Conflict | null {
  if (error instanceof ApiError && error.status === 409) {
    return { stale: error.message.toLowerCase().includes('stale'), message: error.message }
  }
  return null
}

interface ReviewDecisionFormProps {
  investigation: Investigation
  submit: UseMutationResult<Investigation, Error, SubmitReviewInput>
  onReload: () => void
}

export function ReviewDecisionForm({
  investigation,
  submit,
  onReload,
}: ReviewDecisionFormProps) {
  const [decision, setDecision] = useState<ReviewDecisionValue>('approved')
  const [rationale, setRationale] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const reviewable = isReviewable(investigation.status)
  const conflict = conflictFrom(submit.error)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = rationale.trim()
    if (!trimmed) {
      setFieldError('A rationale is required before recording a decision.')
      return
    }
    if (trimmed.length > MAX_RATIONALE) {
      setFieldError(`Rationale must be ${MAX_RATIONALE} characters or fewer.`)
      return
    }
    setFieldError(null)
    submit.mutate({
      investigationId: investigation.id,
      decision,
      rationale: trimmed,
      reportVersion: investigation.report_version,
    })
  }

  return (
    <div className="space-y-4">
      {submit.isSuccess && submit.data ? (
        <div
          role="status"
          className="rounded-sm border border-status-matched/30 bg-status-matchedSoft px-3 py-2 text-sm text-status-matched"
        >
          Decision recorded. This investigation is now{' '}
          <span className="font-semibold">
            {investigationStatusMeta(submit.data.status).label}
          </span>
          .
        </div>
      ) : null}

      {conflict ? (
        <div
          role="alert"
          className="rounded-sm border border-status-partial/40 bg-status-partialSoft px-3 py-2 text-sm text-status-partial"
        >
          <p className="font-semibold">
            {conflict.stale
              ? 'This report changed while you were reviewing it'
              : 'This investigation is not eligible for review'}
          </p>
          <p className="mt-1 text-graphite">{conflict.message}</p>
          {conflict.stale ? (
            <p className="mt-1 text-graphite">
              Your decision was not saved. Review the latest report version and
              decide again.
            </p>
          ) : null}
          <button
            type="button"
            onClick={onReload}
            className="mt-2 rounded-sm border border-line-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-accent-soft"
          >
            Reload report
          </button>
        </div>
      ) : submit.isError ? (
        <div
          role="alert"
          className="rounded-sm border border-status-risk/40 bg-status-riskSoft px-3 py-2 text-sm text-status-risk"
        >
          {submit.error.message}
        </div>
      ) : null}

      {!reviewable ? (
        <div className="rounded-sm border border-line bg-surface px-3 py-3 text-sm text-graphite">
          <p>This investigation is not currently awaiting a review decision.</p>
          <p className="mt-1 text-xs text-muted">
            Status: {investigationStatusMeta(investigation.status).label}. A
            decision can only be recorded while a report is awaiting review.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="text-2xs uppercase tracking-label text-muted">
              Decision
            </legend>
            <div className="mt-2 space-y-2">
              {DECISIONS.map((option) => {
                const meta = reviewDecisionMeta(option.value)
                const selected = decision === option.value
                return (
                  <label
                    key={option.value}
                    className={[
                      'flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2 transition-colors',
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line hover:border-line-strong',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="review-decision"
                      value={option.value}
                      checked={selected}
                      onChange={() => setDecision(option.value)}
                      className="mt-1 h-3.5 w-3.5 accent-accent"
                    />
                    <span className="min-w-0">
                      <StatusPill tone={meta.tone} label={option.label} />
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {option.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="review-rationale"
              className="text-2xs uppercase tracking-label text-muted"
            >
              Rationale
            </label>
            <textarea
              id="review-rationale"
              value={rationale}
              onChange={(event) => {
                setRationale(event.target.value)
                if (fieldError) setFieldError(null)
              }}
              rows={4}
              maxLength={MAX_RATIONALE}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'review-rationale-error' : undefined}
              placeholder="Explain the decision. It is stored with the review as an append-only record."
              className={[
                'mt-2 w-full rounded-sm border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none',
                fieldError
                  ? 'border-status-risk/50 focus:border-status-risk'
                  : 'border-line focus:border-accent',
              ].join(' ')}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              {fieldError ? (
                <p
                  id="review-rationale"
                  role="alert"
                  className="text-xs text-status-risk"
                >
                  {fieldError}
                </p>
              ) : (
                <span className="text-xs text-muted">
                  Required. Recorded against report v{investigation.report_version}.
                </span>
              )}
              <span className="num shrink-0 text-2xs text-muted">
                {rationale.length}/{MAX_RATIONALE}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-sm border border-accent bg-accent px-3.5 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submit.isPending
              ? 'Recording decision…'
              : (DECISIONS.find((entry) => entry.value === decision)?.cta ??
                'Record decision')}
          </button>
        </form>
      )}
    </div>
  )
}
