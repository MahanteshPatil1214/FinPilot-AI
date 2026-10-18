// Zero-argument assistant commands. Selecting one sends its canonical prompt,
// so the backend orchestrator runs the real read-only operation. The prompt
// strings are pinned by the backend routing test
// `tests/test_chat_context.py::test_slash_command_phrases_route_to_their_capability`
// so a command can never advertise a capability the backend does not route.
//
// Only capabilities that are actually implemented are exposed here. Commands
// that would need a required argument (for example targeting a specific
// invoice) are intentionally left out rather than faked.
export interface SlashCommand {
  name: string
  description: string
  prompt: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/documents',
    description: 'Search and summarize your indexed documents',
    prompt: 'Search my documents and summarize the most relevant information.',
  },
  {
    name: '/reconciliation',
    description: 'Run the reconciliation engine',
    prompt: 'Run reconciliation.',
  },
  {
    name: '/invoices',
    description: 'List invoices and their totals',
    prompt: 'List the invoices.',
  },
  {
    name: '/transactions',
    description: 'List recent bank transactions',
    prompt: 'List the recent transactions.',
  },
  {
    name: '/investigate',
    description: 'Start an investigation for the latest discrepancy',
    prompt: 'Investigate the latest discrepancy.',
  },
  {
    name: '/reviews',
    description: 'Summarize investigations waiting for your review',
    prompt: 'Summarize investigations waiting for my review.',
  },
  {
    name: '/dashboard',
    description: 'Show the workspace summary',
    prompt: 'Show the workspace summary.',
  },
]
