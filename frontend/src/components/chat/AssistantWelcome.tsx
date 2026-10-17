interface Capability {
  title: string
  prompt: string
  description: string
}

// Suggestions are written to match what the assistant can actually do — each
// maps to a supported intent (document Q&A, financial query, discrepancy,
// review queue, report). Clicking one starts a conversation with the prompt
// pre-filled in the composer.
const CAPABILITIES: Capability[] = [
  {
    title: 'Document Q&A',
    prompt: 'What do the payment terms in the vendor agreement say?',
    description: 'Explain a policy or clause and cite the document and page.',
  },
  {
    title: 'Invoices & transactions',
    prompt: 'Which transactions are unmatched?',
    description: 'Find reconciliation matches, unmatched or partial payments.',
  },
  {
    title: 'Explain a discrepancy',
    prompt: 'Why was invoice INV-2026-0001 underpaid?',
    description: 'Show the deterministic difference and the policy behind it.',
  },
  {
    title: 'Reviews waiting',
    prompt: 'What investigations need my review?',
    description: 'Summarize items awaiting a human decision, with links.',
  },
  {
    title: 'Period report',
    prompt: "Summarize this period's reconciliation results.",
    description: 'Recap this period’s reconciliation outcomes.',
  },
]

export function AssistantWelcome({
  onExample,
  disabled,
}: {
  onExample: (prompt: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="max-w-2xl">
          <h2 className="font-serif text-xl text-ink">
            Ask across your documents and records
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-graphite">
            FinPilot AI retrieves evidence from your indexed documents and reads
            your stored records to answer questions. Every answer cites its
            sources, reports which steps it ran, and never moves money, changes
            bank details, or edits financial records.
          </p>
        </div>

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <li key={capability.title}>
              <button
                type="button"
                onClick={() => onExample(capability.prompt)}
                disabled={disabled}
                className="group h-full w-full rounded-sm border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft disabled:opacity-60"
              >
                <span className="block text-sm font-medium text-ink">
                  {capability.title}
                </span>
                <span className="mt-0.5 block text-2xs text-muted">
                  {capability.description}
                </span>
                <span className="mt-2 block text-xs text-accent group-hover:underline">
                  “{capability.prompt}”
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
