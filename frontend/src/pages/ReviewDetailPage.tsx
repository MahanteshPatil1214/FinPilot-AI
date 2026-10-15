import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EvidenceCitationInspector } from '../components/investigations/EvidenceCitationInspector'
import { EvidenceTable } from '../components/investigations/EvidenceTable'
import { FindingsList } from '../components/investigations/FindingsList'
import { LinkedRecordsPanel } from '../components/investigations/LinkedRecordsPanel'
import { WorkflowPanel } from '../components/investigations/WorkflowPanel'
import { AuditTimeline } from '../components/reviews/AuditTimeline'
import { ReviewDecisionForm } from '../components/reviews/ReviewDecisionForm'
import { ReviewHeader } from '../components/reviews/ReviewHeader'
import { ProvenanceList, type ProvenanceEntry } from '../components/ui/ProvenanceList'
import { SectionTitle } from '../components/ui/SectionTitle'
import { SourceTag } from '../components/ui/SourceTag'
import { StateMessage } from '../components/ui/StateMessage'
import { StatusPill } from '../components/ui/StatusPill'
import {
  useInvestigation,
  useInvestigationReviews,
  useSubmitInvestigationReview,
} from '../hooks/useInvestigations'
import { confidenceMeta, reportSourceMeta } from '../lib/investigations'
import { ApiError } from '../services/api'

export function ReviewDetailPage() {
  const { id: investigationId = '' } = useParams()
  const navigate = useNavigate()
  const investigation = useInvestigation(investigationId || null)
  const reviews = useInvestigationReviews(investigationId || null)
  const submit = useSubmitInvestigationReview()
  const [selectedCitation, setSelectedCitation] = useState<number | null>(null)

  if (!investigationId) {
    return (
      <div className="p-6">
        <StateMessage
          kind="error"
          title="No investigation selected"
          message="Open an investigation from the review queue."
        />
      </div>
    )
  }

  if (investigation.isLoading) {
    return (
      <div className="p-6">
        <StateMessage kind="loading" title="Loading review" />
      </div>
    )
  }

  if (investigation.isError) {
    const notFound =
      investigation.error instanceof ApiError && investigation.error.status === 404
    return (
      <div className="p-6">
        <StateMessage
          kind="error"
          title={notFound ? 'Investigation not found' : 'Could not load review'}
          message={(investigation.error as Error).message}
          onRetry={notFound ? undefined : () => void investigation.refetch()}
        />
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => navigate('/reviews')}
            className="text-2xs uppercase tracking-label text-muted transition-colors hover:text-ink"
          >
            ← Back to report review
          </button>
        </div>
      </div>
    )
  }

  const item = investigation.data
  if (!item) return null

  const report = item.report
  const facts = report?.findings.filter((finding) => finding.kind === 'fact') ?? []
  const hypotheses =
    report?.findings.filter((finding) => finding.kind === 'hypothesis') ?? []
  const source = reportSourceMeta(item.model_name)
  const confidence = confidenceMeta(report?.confidence)
  const reviewItems = reviews.data?.items ?? []

  const provenance: ProvenanceEntry[] = [
    {
      kind: 'fact',
      title: 'Financial facts',
      detail:
        'Report facts and linked records are read back from the database; amounts are shown exactly as stored.',
      state: report ? 'present' : 'none',
    },
    {
      kind: 'evidence',
      title: 'Retrieved evidence',
      detail: report?.citations.length
        ? 'Document passages and database records the report cites.'
        : 'No evidence citations were recorded.',
      state: report?.citations.length ? 'present' : 'none',
    },
    {
      kind: 'ai',
      title: 'AI hypothesis',
      detail:
        source.provenance === 'ai'
          ? 'Summary and hypotheses were drafted by a language model, then validated.'
          : 'Not applicable — this report was produced by deterministic rules only.',
      state: source.provenance === 'ai' ? 'present' : 'not-applicable',
    },
    {
      kind: 'human',
      title: 'Human decision',
      detail: reviewItems.length
        ? 'Decisions recorded against this report version.'
        : 'No human decision has been recorded.',
      state: reviewItems.length ? 'present' : 'none',
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReviewHeader investigation={item} onBack={() => navigate('/reviews')} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
            {report ? (
              <>
                <section>
                  <SectionTitle hint="Report">Assessment</SectionTitle>
                  <div className="mt-3 rounded-sm border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceTag kind={source.provenance} />
                      <span className="text-2xs uppercase tracking-label text-muted">
                        {source.label}
                      </span>
                      <StatusPill
                        tone={confidence.tone}
                        label={`${confidence.label} confidence`}
                      />
                      <StatusPill
                        tone={report.requires_human_review ? 'partial' : 'matched'}
                        label={
                          report.requires_human_review
                            ? 'Human review required'
                            : 'No human review required'
                        }
                      />
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink">
                      {report.summary}
                    </p>
                  </div>

                  <div className="mt-4 rounded-sm border border-line border-l-2 border-l-accent bg-surface p-4">
                    <span className="text-2xs uppercase tracking-label text-muted">
                      Recommended action
                    </span>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      {report.recommended_action}
                    </p>
                  </div>
                </section>

                <section>
                  <SectionTitle hint="Database">Financial facts</SectionTitle>
                  {facts.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      No facts were recorded in this report.
                    </p>
                  ) : (
                    <FindingsList
                      findings={facts}
                      selectedCitation={selectedCitation}
                      onSelectCitation={setSelectedCitation}
                    />
                  )}
                </section>

                <section>
                  <SectionTitle hint="AI">Hypotheses</SectionTitle>
                  {hypotheses.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      No hypotheses were recorded in this report.
                    </p>
                  ) : (
                    <FindingsList
                      findings={hypotheses}
                      selectedCitation={selectedCitation}
                      onSelectCitation={setSelectedCitation}
                    />
                  )}
                </section>

                <section>
                  <SectionTitle hint="Evidence">Missing evidence</SectionTitle>
                  {report.missing_evidence.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      The workflow did not record any missing evidence.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {report.missing_evidence.map((entry, position) => (
                        <li
                          key={position}
                          className="flex gap-2 text-sm leading-relaxed text-graphite"
                        >
                          <span className="text-status-partial">•</span>
                          <span>{entry}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <SectionTitle hint="Evidence">Evidence citations</SectionTitle>
                  {report.citations.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      This report recorded no evidence citations.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-sm border border-line">
                      <EvidenceTable
                        citations={report.citations}
                        selectedCitation={selectedCitation}
                        onSelect={setSelectedCitation}
                      />
                    </div>
                  )}
                  <p className="mt-2 text-2xs leading-relaxed text-muted">
                    Select a citation to inspect it in the panel.
                  </p>
                </section>
              </>
            ) : (
              <section>
                <StateMessage
                  kind="empty"
                  title="No report"
                  message="This investigation has no report to review. Run the investigation from its case file first."
                />
              </section>
            )}

            <section>
              <SectionTitle hint="Database">Linked records</SectionTitle>
              <div className="mt-3">
                <LinkedRecordsPanel investigation={item} />
              </div>
            </section>

            <section>
              <SectionTitle hint="Deterministic">Workflow</SectionTitle>
              <div className="mt-3">
                <WorkflowPanel investigation={item} />
              </div>
            </section>

            <section>
              <SectionTitle hint="Decision">Record a decision</SectionTitle>
              <div className="mt-3">
                <ReviewDecisionForm
                  investigation={item}
                  submit={submit}
                  onReload={() => {
                    void investigation.refetch()
                    void reviews.refetch()
                  }}
                />
              </div>
            </section>

            <section>
              <SectionTitle hint="Human">Audit timeline</SectionTitle>
              <div className="mt-3">
                <AuditTimeline reviews={reviews} />
              </div>
            </section>

            <section>
              <SectionTitle>Provenance</SectionTitle>
              <div className="mt-3">
                <ProvenanceList entries={provenance} />
              </div>
            </section>
          </div>
        </div>

        <aside className="h-[60vh] w-full shrink-0 border-t border-line bg-surface lg:h-full lg:w-[400px] lg:border-l lg:border-t-0">
          <EvidenceCitationInspector
            citations={report?.citations ?? []}
            findings={report?.findings ?? []}
            selectedCitation={selectedCitation}
          />
        </aside>
      </div>
    </div>
  )
}
