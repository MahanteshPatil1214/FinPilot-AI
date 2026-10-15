import type { UseMutationResult } from '@tanstack/react-query'

import { canRun, hasReport } from '../../lib/investigations'
import type { Investigation } from '../../types/api'

interface RunControlProps {
  investigation: Investigation
  run: UseMutationResult<Investigation, Error, string>
}

export function RunControl({ investigation, run }: RunControlProps) {
  const running = investigation.status === 'running' || run.isPending
  const reportExists = hasReport(investigation)
  const permitted = canRun(investigation)

  const label = running
    ? 'Running…'
    : reportExists
      ? 'Re-run investigation'
      : 'Run investigation'

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={() => run.mutate(investigation.id)}
        disabled={!permitted || running}
        className="rounded-sm border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
      {reportExists && !running ? (
        <p className="max-w-[16rem] text-2xs leading-relaxed text-muted sm:text-right">
          Re-running produces a new report version. Any decision recorded against
          the current version becomes superseded.
        </p>
      ) : null}
      {run.isError ? (
        <p className="max-w-[18rem] text-2xs text-status-risk sm:text-right" role="alert">
          {run.error.message}
        </p>
      ) : null}
    </div>
  )
}
