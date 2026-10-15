import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'

interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <PageHeader title={title} description={description} />
      <div className="mt-6">
        <StateMessage
          kind="empty"
          title="Not built yet"
          message="This screen is part of the roadmap and will be implemented in a later step, after the representative Reconciliation workspace is reviewed."
        />
      </div>
    </div>
  )
}
