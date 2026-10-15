import {
  reportSourceMeta,
  stageLabel,
  workflowStageIndex,
  WORKFLOW_STAGES,
} from '../../lib/investigations'
import type { Investigation } from '../../types/api'

export function WorkflowPanel({
  investigation,
}: {
  investigation: Investigation
}) {
  const currentIndex = workflowStageIndex(investigation.workflow_state)
  const source = reportSourceMeta(investigation.model_name)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-ink">
          Last reached stage:{' '}
          <span className="text-graphite">
            {stageLabel(investigation.workflow_state)}
          </span>
        </p>
        <p className="text-xs text-muted">
          Report source: <span className="text-graphite">{source.label}</span> ·
          Report v{investigation.report_version}
        </p>
      </div>

      <ol className="space-y-1.5">
        {WORKFLOW_STAGES.map((stage, index) => {
          const reached = currentIndex >= 0 && index < currentIndex
          const current = index === currentIndex
          return (
            <li key={stage.key} className="flex items-center gap-2 text-xs">
              <span
                className={[
                  'h-1.5 w-1.5 rounded-full',
                  current
                    ? 'bg-accent'
                    : reached
                      ? 'bg-status-matched'
                      : 'bg-line-strong',
                ].join(' ')}
              />
              <span
                className={
                  current
                    ? 'font-medium text-ink'
                    : reached
                      ? 'text-graphite'
                      : 'text-muted'
                }
              >
                {stage.label}
              </span>
              {current ? (
                <span className="text-2xs uppercase tracking-label text-accent">
                  current
                </span>
              ) : null}
            </li>
          )
        })}
        <li className="flex items-center gap-2 pt-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          <span className="text-muted">
            Retry once, then route to human review or finalize
          </span>
        </li>
      </ol>

      <p className="text-2xs leading-relaxed text-muted">
        The workflow is the fixed sequence shown above. Only the most recently
        reached stage is stored, so earlier steps are not individually
        timestamped here.
      </p>
    </div>
  )
}
