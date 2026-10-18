import { chatOutcomeMeta } from '../../lib/chat'
import { formatDateTime } from '../../lib/format'
import type { ChatMessage } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'
import { CitationList } from './CitationList'
import { MarkdownAnswer } from './MarkdownAnswer'
import { ResultRefs } from './ResultRefs'
import { ToolTrace } from './ToolTrace'

const POSITIVE_OUTCOMES = new Set(['answered', 'success'])

// A single transcript entry. User turns are a soft bubble on the right; the
// assistant's turn reads as plain prose, followed by the provenance the backend
// recorded — outcome, clickable record references, citations and (only when it
// actually ran) the read-only tool activity — so the reader can always separate
// what the assistant claims from what it did.
export function MessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const meta = chatOutcomeMeta(message.outcome)
  const showOutcome = !isUser && message.outcome !== null
  const showOutcomeNote =
    showOutcome && !POSITIVE_OUTCOMES.has(message.outcome ?? '')

  if (isUser) {
    return (
      <article className="flex flex-col items-end gap-1.5">
        <span className="pr-1 text-2xs font-semibold uppercase tracking-label text-muted">
          You
        </span>
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tr-sm border border-line bg-surface px-3.5 py-2 text-sm leading-relaxed text-ink">
          {message.content}
        </p>
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-label text-muted">
          Assistant
        </span>
        {showOutcome ? <StatusPill tone={meta.tone} label={meta.label} /> : null}
        <span className="num ml-auto text-2xs text-muted">
          {formatDateTime(message.created_at)}
        </span>
      </div>

      <MarkdownAnswer content={message.content} />
      {showOutcomeNote ? (
        <p className="text-2xs text-muted">{meta.description}</p>
      ) : null}
      {message.result_refs.length > 0 ? (
        <ResultRefs refs={message.result_refs} />
      ) : null}
      {message.citations.length > 0 ? (
        <CitationList citations={message.citations} />
      ) : null}
      {message.tool_calls.length > 0 ? (
        <ToolTrace toolCalls={message.tool_calls} />
      ) : null}
    </article>
  )
}
