import { useEffect, useMemo, useState } from 'react'

import { TransactionInspector } from '../components/transactions/TransactionInspector'
import { TransactionTable } from '../components/transactions/TransactionTable'
import { PageHeader } from '../components/ui/PageHeader'
import { PaginationFooter } from '../components/ui/PaginationFooter'
import { SearchFilter } from '../components/ui/SearchFilter'
import { StateMessage } from '../components/ui/StateMessage'
import { useTransactions } from '../hooks/useTransactions'

// The list endpoint exposes `skip`/`limit` only (no total count), so a page is
// filled by requesting one row past the page size to detect whether more exist.
const PAGE_SIZE = 25

function matchesFilter(
  transaction: {
    transaction_reference: string | null
    description: string | null
    counterparty: string | null
  },
  query: string,
): boolean {
  return [transaction.transaction_reference, transaction.description, transaction.counterparty].some(
    (field) => field !== null && field.toLowerCase().includes(query),
  )
}

export function TransactionsPage() {
  const [skip, setSkip] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const transactions = useTransactions({ skip, limit: PAGE_SIZE + 1 })

  const fetched = transactions.data ?? []
  const hasNext = fetched.length > PAGE_SIZE
  const pageItems = useMemo(() => fetched.slice(0, PAGE_SIZE), [fetched])

  const normalized = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      normalized
        ? pageItems.filter((transaction) => matchesFilter(transaction, normalized))
        : pageItems,
    [pageItems, normalized],
  )

  useEffect(() => {
    if (selectedId && !visible.some((transaction) => transaction.id === selectedId)) {
      setSelectedId(null)
    }
  }, [visible, selectedId])

  const selected = visible.find((transaction) => transaction.id === selectedId) ?? null

  const changePage = (nextSkip: number) => {
    setSkip(Math.max(0, nextSkip))
    setSelectedId(null)
  }

  const rangeStart = pageItems.length === 0 ? 0 : skip + 1
  const rangeEnd = skip + pageItems.length
  const summary = normalized
    ? `${visible.length} of ${pageItems.length} on this page`
    : `Records ${rangeStart}–${rangeEnd}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Transactions"
          description="Imported bank transactions, read back from the database exactly as stored by the deterministic CSV importer."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <SearchFilter
            label="Filter loaded records"
            value={query}
            onChange={setQuery}
            placeholder="Reference, description or counterparty"
            hint="Filters the records on the current page."
          />
          <span className="text-2xs uppercase tracking-label text-muted">
            {visible.length} shown
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {transactions.isLoading ? (
              <div className="p-6">
                <StateMessage kind="loading" title="Loading transactions" />
              </div>
            ) : transactions.isError ? (
              <div className="p-6">
                <StateMessage
                  kind="error"
                  title="Could not load transactions"
                  message={(transactions.error as Error).message}
                  onRetry={() => void transactions.refetch()}
                />
              </div>
            ) : pageItems.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No transactions"
                  message="Import a bank transaction CSV to populate this view."
                />
              </div>
            ) : visible.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No matching transactions"
                  message="No record on this page matches the filter."
                />
              </div>
            ) : (
              <TransactionTable
                items={visible}
                selectedId={selectedId}
                onSelect={(transaction) => setSelectedId(transaction.id)}
              />
            )}
          </div>

          <PaginationFooter
            summary={summary}
            hasPrevious={skip > 0}
            hasNext={hasNext}
            onPrevious={() => changePage(skip - PAGE_SIZE)}
            onNext={() => changePage(skip + PAGE_SIZE)}
          />
        </div>

        <aside className="h-[50vh] w-full shrink-0 border-t border-line bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <TransactionInspector transaction={selected} />
        </aside>
      </div>
    </div>
  )
}
