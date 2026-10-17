import { toolStatusLabel, toolStatusTone, toolTraceSummary } from '../../lib/chat'
import type { Tone } from '../../lib/reconciliation'
import type { ChatToolCall } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

const TOOL_TONE: Record<string, Tone> = {
  ok: 'matched',
  empty: 'neutral',
  error: 'risk',
  skipped: 'partial',
}

// An honest, collapsible record of exactly which read-only tools the assistant
// ran for this turn and how each one ended. It is rendered from the persisted
// payload, so it can never show activity that did not happen.
export function ToolTrace({ toolCalls }: { toolCalls: ChatToolCall[] }) {
  return (
    <details className="group rounded-sm border border-line bg-paper">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-2xs uppercase tracking-label text-muted">
        <span className="transition-transform group-open:rotate-90">▶</span>
        <span className="font-semibold text-graphite">Activity</span>
        <span>{toolTraceSummary(toolCalls)}</span>
      </summary>
      {toolCalls.length === 0 ? (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">
          No tools were run for this turn.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {toolCalls.map((call, index) => (
            <li
              key={`${call.name}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2"
            >
              <span className="text-xs font-medium text-ink">{call.label}</span>
              <StatusPill
                tone={TOOL_TONE[toolStatusTone(call.status)]}
                label={toolStatusLabel(call.status)}
              />
              <span className="min-w-0 flex-1 text-xs text-graphite">
                {call.summary}
              </span>
              {call.duration_ms > 0 ? (
                <span className="num text-2xs text-muted">
                  {call.duration_ms} ms
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
