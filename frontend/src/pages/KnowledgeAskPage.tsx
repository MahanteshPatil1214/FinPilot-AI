import { Link } from 'react-router-dom'

import { KnowledgeAnswerPanel } from '../components/knowledge/KnowledgeAnswerPanel'
import { KnowledgeAskForm } from '../components/knowledge/KnowledgeAskForm'
import { PageHeader } from '../components/ui/PageHeader'
import { useAskKnowledge } from '../hooks/useKnowledge'

export function KnowledgeAskPage() {
  const ask = useAskKnowledge()

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <PageHeader
        title="Knowledge & Ask"
        description="Ask a question in natural language. FinPilot AI retrieves the most relevant passages from your indexed documents and answers only from that evidence, citing each source by document and page. When the documents do not contain an answer, it says so instead of inventing one."
      />

      <p className="mt-4 rounded-sm border border-accent/25 bg-accent-soft px-3 py-2 text-xs text-accent">
        Document Q&amp;A now lives in the{' '}
        <Link to="/assistant" className="font-semibold underline">
          Assistant
        </Link>
        , where you can attach and upload documents and ask across multiple
        files. This page remains available for direct links.
      </p>

      <div className="mt-6 space-y-4">
        <KnowledgeAskForm ask={ask} />
        {ask.data ? <KnowledgeAnswerPanel response={ask.data} /> : null}
      </div>
    </div>
  )
}
