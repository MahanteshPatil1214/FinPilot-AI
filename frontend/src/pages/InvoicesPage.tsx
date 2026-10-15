import { useEffect, useMemo, useState } from 'react'

import { ExtractionStatusFilter } from '../components/invoices/ExtractionStatusFilter'
import { InvoiceInspector } from '../components/invoices/InvoiceInspector'
import { InvoiceTable } from '../components/invoices/InvoiceTable'
import { PageHeader } from '../components/ui/PageHeader'
import { PaginationFooter } from '../components/ui/PaginationFooter'
import { SearchFilter } from '../components/ui/SearchFilter'
import { StateMessage } from '../components/ui/StateMessage'
import { useInvoices } from '../hooks/useInvoices'

// The list endpoint exposes `skip`/`limit` only (no total count), so a page is
// filled by requesting one row past the page size to detect whether more exist.
const PAGE_SIZE = 25

function matchesFilter(
  invoice: { invoice_number: string | null; currency: string | null },
  query: string,
): boolean {
  return [invoice.invoice_number, invoice.currency].some(
    (field) => field !== null && field.toLowerCase().includes(query),
  )
}

export function InvoicesPage() {
  const [skip, setSkip] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const invoices = useInvoices({ skip, limit: PAGE_SIZE + 1 })

  const fetched = invoices.data ?? []
  const hasNext = fetched.length > PAGE_SIZE
  const pageItems = useMemo(() => fetched.slice(0, PAGE_SIZE), [fetched])

  const normalized = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      pageItems.filter(
        (invoice) =>
          (status === undefined || invoice.extraction_status === status) &&
          (normalized === '' || matchesFilter(invoice, normalized)),
      ),
    [pageItems, normalized, status],
  )

  useEffect(() => {
    if (selectedId && !visible.some((invoice) => invoice.id === selectedId)) {
      setSelectedId(null)
    }
  }, [visible, selectedId])

  const selected = visible.find((invoice) => invoice.id === selectedId) ?? null

  const changePage = (nextSkip: number) => {
    setSkip(Math.max(0, nextSkip))
    setSelectedId(null)
  }

  const filtered = status !== undefined || normalized !== ''
  const rangeStart = pageItems.length === 0 ? 0 : skip + 1
  const rangeEnd = skip + pageItems.length
  const summary = filtered
    ? `${visible.length} of ${pageItems.length} on this page`
    : `Records ${rangeStart}–${rangeEnd}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Invoices"
          description="Invoice records extracted from source documents, read back from the database exactly as stored."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="flex flex-wrap items-end gap-6">
            <SearchFilter
              label="Filter loaded records"
              value={query}
              onChange={setQuery}
              placeholder="Invoice number or currency"
              hint="Filters the records on the current page."
            />
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-muted">
                Extraction status
              </span>
              <ExtractionStatusFilter value={status} onChange={setStatus} />
            </div>
          </div>
          <span className="text-2xs uppercase tracking-label text-muted">
            {visible.length} shown
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {invoices.isLoading ? (
              <div className="p-6">
                <StateMessage kind="loading" title="Loading invoices" />
              </div>
            ) : invoices.isError ? (
              <div className="p-6">
                <StateMessage
                  kind="error"
                  title="Could not load invoices"
                  message={(invoices.error as Error).message}
                  onRetry={() => void invoices.refetch()}
                />
              </div>
            ) : pageItems.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No invoices"
                  message="Upload an invoice PDF in the Document center to create records here."
                />
              </div>
            ) : visible.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No matching invoices"
                  message="No record on this page matches the current filters."
                />
              </div>
            ) : (
              <InvoiceTable
                items={visible}
                selectedId={selectedId}
                onSelect={(invoice) => setSelectedId(invoice.id)}
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
          <InvoiceInspector invoice={selected} />
        </aside>
      </div>
    </div>
  )
}
