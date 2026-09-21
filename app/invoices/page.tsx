import Link from 'next/link'
import { createSupabaseServer, queryTimeout } from '@/lib/supabase/server'
import { InvoiceStatusBadge } from '@/components/status-badges'
import type { Tables } from '@/lib/types/database'

// Reads live data from Supabase via the service-role client — must render at
// request time, never prerendered at build. Without this the page is statically
// generated (hitting Supabase during `next build`), which bakes a stale snapshot
// and makes the build depend on Supabase env + network.
export const dynamic = 'force-dynamic'

type Invoice = Tables<'invoices'>

const OVERDUE_STATUSES = new Set(['overdue', 'disputed'])
// Threshold for the Glow left-edge signal marker: a row this far past due reads
// as "chase now". Kept modest so it stays a signal, not decoration.
const BADLY_OVERDUE_DAYS = 30

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const now = new Date()
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function FooterNote() {
  return (
    <footer className="mt-16 md:mt-24 pt-6 border-t border-ink/[0.08]">
      <p className="font-mono text-[11px] leading-5 tracking-[0.04em] text-ink/60">
        This instance uses fictional demonstration data only. No real client
        information is stored here.
      </p>
    </footer>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-md py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink mb-4">
        Error
      </p>
      <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">
        Could not load invoices
      </p>
      <p className="font-body text-base text-ink/60 mb-6">{message}</p>
      <Link
        href="/invoices"
        className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill inline-block hover:bg-pulse/90 transition-colors"
      >
        Retry
      </Link>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="max-w-md py-12">
      <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">
        Nothing here yet
      </p>
      <p className="font-body text-base text-ink/60">
        Invoices will appear here once they are added to the system.
      </p>
    </div>
  )
}

export default async function InvoicesPage() {
  let invoices: Invoice[] = []
  let scheduledInvoiceIds = new Set<string>()
  let fetchError: string | null = null

  try {
    const supabase = createSupabaseServer()
    const [invoiceRes, queueRes] = await Promise.all([
      supabase.from('invoices').select('*').order('due_date', { ascending: true }).abortSignal(queryTimeout()),
      supabase
        .from('call_queue')
        .select('invoice_id')
        .in('status', ['drafted', 'approved', 'dialing'])
        .abortSignal(queryTimeout()),
    ])

    if (invoiceRes.error) throw new Error(invoiceRes.error.message)
    invoices = invoiceRes.data ?? []
    // A failed queue read only costs the marker, not the page.
    if (!queueRes.error) scheduledInvoiceIds = new Set((queueRes.data ?? []).map((r) => r.invoice_id))
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to load invoices'
  }

  const overdueCount = invoices.filter((i) => i.status === 'overdue').length

  return (
    <main className="min-h-screen bg-mist flex flex-col">
      <div className="w-full max-w-[1100px] mx-auto px-8 md:px-16 lg:px-24 py-16 md:py-24 flex-1">
        {/* Header */}
        <header className="pb-10 md:pb-12 border-b border-ink/[0.12]">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60">
              Recovery Tracker
            </p>
            <Link
              href="/queue"
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 hover:text-pulse transition-colors"
            >
              Review queue →
            </Link>
          </div>
          <h1 className="font-display text-[2.75rem] leading-[1.02] md:text-6xl font-medium tracking-[-0.03em] text-ink">
            Invoices
          </h1>
          {fetchError === null && invoices.length > 0 && (
            <p className="font-body text-[22px] leading-8 text-ink/70 mt-5">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              {overdueCount > 0 && (
                <>
                  , {overdueCount}{' '}
                  <span className="font-serif italic text-ink">overdue</span>
                </>
              )}
              .
            </p>
          )}
          <p className="font-body text-[15px] leading-6 text-ink/60 mt-4 max-w-xl">
            Overdue-invoice recovery calls placed by a CALL-E agent — drafted on a
            schedule, approved by a human, dialed automatically. Every call is
            human-approved before it&rsquo;s placed.
          </p>
        </header>

        {fetchError !== null && <ErrorState message={fetchError} />}

        {fetchError === null && invoices.length === 0 && <EmptyState />}

        {fetchError === null && invoices.length > 0 && (
          <div className="mt-10 md:mt-12">
            {/* Mobile card list — hidden on md+ */}
            <div className="md:hidden divide-y divide-ink/[0.08]">
              {invoices.map((invoice) => {
                const days = daysOverdue(invoice.due_date)
                const isActionable = OVERDUE_STATUSES.has(invoice.status)
                const badlyOverdue = isActionable && days > BADLY_OVERDUE_DAYS

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className={`block pl-4 pr-1 py-5 transition-colors hover:bg-ink/[0.03] ${
                      badlyOverdue ? 'shadow-[inset_3px_0_0_0_#C9FF3B]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span className="font-body text-[17px] font-medium text-ink leading-6">
                        {invoice.client_name}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    {scheduledInvoiceIds.has(invoice.id) && (
                      <span className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-pill bg-ink/[0.06] text-ink/70 mb-1.5">
                        Call scheduled
                      </span>
                    )}
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-sm text-ink tabular-nums">
                        {formatAmount(invoice.amount, invoice.currency)}
                      </span>
                      {isActionable && days > 0 ? (
                        <span className="font-mono text-xs font-medium text-ink tabular-nums">
                          {days}d overdue
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-ink/60 tabular-nums">
                          Due {formatDate(invoice.due_date)}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Desktop table — sits directly on Mist, hairline rules, no card */}
            <div className="hidden md:block">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-10 border-b border-ink/[0.12] pl-4 pr-2 pb-3">
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60">
                  Client
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 text-right w-28">
                  Amount
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 w-36">
                  Due Date
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 w-28">
                  Status
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-ink/[0.08]">
                {invoices.map((invoice) => {
                  const days = daysOverdue(invoice.due_date)
                  const isActionable = OVERDUE_STATUSES.has(invoice.status)
                  const badlyOverdue = isActionable && days > BADLY_OVERDUE_DAYS

                  return (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-10 items-center pl-4 pr-2 py-5 transition-colors hover:bg-ink/[0.03] group ${
                        badlyOverdue ? 'shadow-[inset_3px_0_0_0_#C9FF3B]' : ''
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="font-body text-[17px] font-medium text-ink group-hover:text-pulse transition-colors">
                          {invoice.client_name}
                        </span>
                        {scheduledInvoiceIds.has(invoice.id) && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-pill bg-ink/[0.06] text-ink/70 whitespace-nowrap">
                            Call scheduled
                          </span>
                        )}
                      </div>
                      <div className="w-28 text-right">
                        <span className="font-mono text-sm text-ink tabular-nums">
                          {formatAmount(invoice.amount, invoice.currency)}
                        </span>
                      </div>
                      <div className="w-36">
                        {isActionable && days > 0 ? (
                          <span className="font-mono text-xs text-ink/70 tabular-nums">
                            {formatDate(invoice.due_date)}
                            <span className="text-ink font-medium"> · {days}d</span>
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-ink/60 tabular-nums">
                            {formatDate(invoice.due_date)}
                          </span>
                        )}
                      </div>
                      <div className="w-28">
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <FooterNote />
      </div>
    </main>
  )
}
