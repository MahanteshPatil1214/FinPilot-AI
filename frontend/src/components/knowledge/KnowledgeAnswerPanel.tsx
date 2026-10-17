import { formatNumber } from '../../lib/format'
import { knowledgeStatusMeta } from '../../lib/knowledge'
import type { KnowledgeAskResponse } from '../../types/api'
import { SectionTitle } from '../ui/SectionTitle'
import { SourceTag } from '../ui/SourceTag'
import { StatusPill } from '../ui/StatusPill'

function pageLabel(page: number | null): string {
  return page !== null ? `page ${page}` : 'page unknown'
}

// Renders a knowledge answer and its evidence. The two possible outcomes are
// shown distinctly: a grounded, cited answer, or an honest "insufficient
// evidence" notice. Retrieved passages are always shown as evidence — never as
// the answer itself — so a model's prose is never mistaken for a source.
export function KnowledgeAnswerPanel({
  response,
}: {
  response: KnowledgeAskResponse
}) {
  const status = knowledgeStatusMeta(response.status)
  const answered = response.status === 'answered' && response.citations.length > 0

  return (
    <section className="rounded-sm border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <SourceTag kind="ai" />
        <span className="font-serif text-sm text-ink">Answer</span>
        <StatusPill tone={status.tone} label={status.label} />
        <span className="ml-auto text-2xs uppercase tracking-label text-muted">
          Grounded in retrieved evidence
        </span>
      </header>

      <div className="space-y-6 px-4 py-4">
        <p className="text-sm leading-relaxed text-graphite">
          <span className="text-2xs uppercase tracking-label text-muted">
            Question{' '}
          </span>
          {response.query}
        </p>

        {answered ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {response.answer}
          </p>
        ) : (
          <div className="rounded-sm border border-status-partial/30 bg-status-partialSoft px-3 py-3">
            <p className="text-sm font-medium text-status-partial">
              Insufficient evidence
            </p>
            <p className="mt-1 text-sm leading-relaxed text-graphite">
              {response.answer}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              No answer was generated. Index documents that cover this question,
              then ask again.
            </p>
          </div>
        )}

        {answered ? (
          <div>
            <SectionTitle hint="Retrieved evidence">Citations</SectionTitle>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-sm border border-line">
              {response.citations.map((citation) => (
                <li
                  key={citation.chunk_id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-surface px-3 py-2"
                >
                  <span className="num text-2xs text-muted">
                    [{citation.index}]
                  </span>
                  <span className="text-sm text-ink">{citation.filename}</span>
                  <span className="num text-2xs text-graphite">
                    {pageLabel(citation.page_number)}
                  </span>
                  <span className="num ml-auto text-2xs text-muted">
                    similarity {formatNumber(citation.score, 3)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-2xs leading-relaxed text-muted">
              Bracketed numbers in the answer refer to these retrieved passages.
            </p>
          </div>
        ) : null}

        {response.evidence.length > 0 ? (
          <div>
            <SectionTitle
              hint={answered ? 'Retrieved evidence' : 'Below threshold'}
            >
              {answered ? 'Source passages' : 'Retrieved passages'}
            </SectionTitle>
            <ul className="mt-2 space-y-3">
              {response.evidence.map((item, position) => (
                <li
                  key={item.chunk_id}
                  className="rounded-sm border border-line bg-paper px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="num text-2xs text-muted">
                      [{position + 1}]
                    </span>
                    <span className="text-xs text-ink">{item.filename}</span>
                    <span className="num text-2xs text-graphite">
                      {pageLabel(item.page_number)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-graphite">
                    {item.content}
                  </p>
                </li>
              ))}
            </ul>
            {!answered ? (
              <p className="mt-1.5 text-2xs leading-relaxed text-muted">
                These passages were retrieved but were not sufficient to answer
                the question.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
