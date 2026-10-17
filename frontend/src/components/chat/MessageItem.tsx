import { chatOutcomeMeta } from '../../lib/chat'
import { formatDateTime } from '../../lib/format'
import type { ChatMessage } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'
import { CitationList } from './CitationList'
import { MarkdownAnswer } from './MarkdownAnswer'
import { ResultRefs } from './ResultRefs'
import { ToolTrace } from './ToolTrace'

const POSITIVE_OUTCOMES = new Set(['answered', 'success'])

// A single transcript entry. User turns are plain text; assistant turns render
// the Markdown answer plus the provenance the backend recorded — outcome,
// clickable record references, citations and the tool activity — so the reader
// can always separate what the assistant claims from what it actually did.
export function MessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const meta = chatOutcomeMeta(message.outcome)
  const showOutcome = !isUser && message.outcome !== null
  const showOutcomeNote = showOutcome && !POSITIVE_OUTCOMES.has(message.outcome ?? '')

  return (
    <article className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-label text-muted">
          {isUser ? 'You' : 'Assistant'}
        </span>
        {showOutcome ? (
          <StatusPill tone={meta.tone} label={meta.label} />
        ) : null}
        <span className="num ml-auto text-2xs text-muted">
          {formatDateTime(message.created_at)}
        </span>
      </div>

      {isUser ? (
        <p className="whitespace-pre-wrap rounded-sm border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink">
          {message.content}
        </p>
      ) : (
        <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface px-4 py-3">
          <MarkdownAnswer content={message.content} />
          {showOutcomeNote ? (
            <p className="text-2xs text-muted">{meta.description}</p>
          ) : null}
          {message.result_refs.length > 0 ? (
            <ResultRefs refs={message.result_refs} />
          ) : null}
          <CitationList citations={message.citations} />
          <ToolTrace toolCalls={message.tool_calls} />
        </div>
      )}
    </article>
  )
}
