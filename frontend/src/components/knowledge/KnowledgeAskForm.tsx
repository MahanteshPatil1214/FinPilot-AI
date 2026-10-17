import type { UseMutationResult } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { ApiError } from '../../services/api'
import type { KnowledgeAskRequest, KnowledgeAskResponse } from '../../types/api'

const MAX_QUESTION = 1000

interface KnowledgeAskFormProps {
  ask: UseMutationResult<KnowledgeAskResponse, Error, KnowledgeAskRequest>
}

export function KnowledgeAskForm({ ask }: KnowledgeAskFormProps) {
  const [question, setQuestion] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  // A 503 means the backend has no language model configured. Surface it as a
  // distinct, honest state rather than a generic failure.
  const unavailable = ask.error instanceof ApiError && ask.error.status === 503

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) {
      setFieldError('Enter a question before asking.')
      return
    }
    setFieldError(null)
    ask.mutate({ query: trimmed })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-sm border border-line bg-surface p-4"
    >
      <label
        htmlFor="knowledge-question"
        className="text-2xs uppercase tracking-label text-muted"
      >
        Question
      </label>
      <textarea
        id="knowledge-question"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value)
          if (fieldError) setFieldError(null)
        }}
        rows={3}
        maxLength={MAX_QUESTION}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? 'knowledge-question-error' : undefined}
        placeholder="e.g. What payment terms are stated on the invoice?"
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
            id="knowledge-question-error"
            role="alert"
            className="text-xs text-status-risk"
          >
            {fieldError}
          </p>
        ) : (
          <span className="text-xs text-muted">
            Answers are drawn only from indexed documents.
          </span>
        )}
        <span className="num shrink-0 text-2xs text-muted">
          {question.length}/{MAX_QUESTION}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={ask.isPending}
          className="rounded-sm border border-accent bg-accent px-3.5 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ask.isPending ? 'Asking…' : 'Ask'}
        </button>
        {ask.isPending ? (
          <span className="text-xs text-muted">Retrieving evidence…</span>
        ) : null}
      </div>

      {unavailable ? (
        <div
          role="alert"
          className="mt-3 rounded-sm border border-status-partial/40 bg-status-partialSoft px-3 py-2 text-sm text-status-partial"
        >
          <p className="font-semibold">Answer generation is unavailable</p>
          <p className="mt-1 text-graphite">
            No language model is configured for this deployment, so Ask cannot
            draft a cited answer. Document retrieval still works.
          </p>
        </div>
      ) : ask.isError ? (
        <div
          role="alert"
          className="mt-3 rounded-sm border border-status-risk/40 bg-status-riskSoft px-3 py-2 text-sm text-status-risk"
        >
          {ask.error.message}
        </div>
      ) : null}
    </form>
  )
}
