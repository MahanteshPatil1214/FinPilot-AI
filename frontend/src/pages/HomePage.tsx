import { HeroPanel } from '../components/home/HeroPanel'
import { OperationalMetrics } from '../components/home/OperationalMetrics'
import { PipelineRail } from '../components/home/PipelineRail'
import { StackPanel } from '../components/home/StackPanel'
import { WorkflowDemo } from '../components/home/WorkflowDemo'

export function HomePage() {
  return (
    <div className="pb-20">
      <HeroPanel />

      <div className="mx-auto max-w-6xl space-y-16 px-6 py-14">
        <section>
          <PipelineRail />
        </section>

        <section>
          <OperationalMetrics />
        </section>

        <section>
          <WorkflowDemo />
        </section>

        <section>
          <StackPanel />
        </section>
      </div>
    </div>
  )
}
