import Link from 'next/link'
import { DemoCallPanel } from '@/components/demo-call-panel'
import { QueueCancelButton } from '@/components/queue-cancel'
import { createSupabaseServer, queryTimeout } from '@/lib/supabase/server'
import { InvoiceStatusBadge, CallOutcomeBadge } from '@/components/status-badges'
import type { Tables } from '@/lib/types/database'

// Reads live data from Supabase at request time (already dynamic via the [id]
// param; explicit here so it's never statically prerendered against Supabase).
export const dynamic = 'force-dynamic'

type Invoice = Tables<'invoices'>
type Call = Tables<'calls'>
type Arrangement = Tables<'arrangements'>
type QueueEntry = Tables<'call_queue'>

const QUEUE_STATUS_LABEL: Record<string, string> = {
  drafted: 'Drafted — awaiting approval',
  approved: 'Scheduled',
  dialing: 'Dialing now',
}

type PageProps = {
  params: Promise<{ id: string }>
}

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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function BackLink() {
  return (
    <Link
      href="/invoices"
      className="inline-block font-mono text-xs uppercase tracking-[0.1em] text-ink/60 hover:text-pulse transition-colors mb-8"
    >
      ← Invoices
    </Link>
  )
}

function FooterNote() {
  return (
    <footer className="mt-16 pt-6 border-t border-ink/[0.08]">
      <p className="font-mono text-[11px] leading-5 tracking-[0.04em] text-ink/60">
        This instance uses fictional demonstration data only. No real client
        information is stored here.
      </p>
    </footer>
  )
}

// Shared page shell so every state (main / error / not-found) keeps the same
// gutter and the fictional-data footer note.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-mist flex flex-col">
      <div className="w-full max-w-[820px] mx-auto px-8 md:px-16 py-12 md:py-16 flex-1 flex flex-col">
        <div className="flex-1">{children}</div>
        <FooterNote />
      </div>
    </main>
  )
}

// One editorial timeline: a vertical hairline with entries hung off it.
function Timeline({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative ml-1 border-l border-ink/[0.12] space-y-7">{children}</ol>
  )
}

function TimelineItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-6">
      <span className="absolute -left-[4.5px] top-[7px] h-2 w-2 rounded-full bg-ink/30" />
      {children}
    </li>
  )
}

function SectionError({ label }: { label: string }) {
  return <p className="font-body text-sm text-ink/60">{label}</p>
}

export default async function InvoicePage({ params }: PageProps) {
  const { id } = await params

  let invoice: Invoice | null = null
  let calls: Call[] = []
  let arrangements: Arrangement[] = []
  let queueEntries: QueueEntry[] = []
  let fetchError: string | null = null
  let callsError: string | null = null
  let arrangementsError: string | null = null
  let notFound = false

  try {
    const supabase = createSupabaseServer()

    const [invoiceRes, callsRes, arrangementsRes, queueRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).abortSignal(queryTimeout()).single(),
      supabase
        .from('calls')
        .select('*')
        .eq('invoice_id', id)
        .order('started_at', { ascending: false })
        .abortSignal(queryTimeout()),
      supabase
        .from('arrangements')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at', { ascending: false })
        .abortSignal(queryTimeout()),
      supabase
        .from('call_queue')
        .select('*')
        .eq('invoice_id', id)
        .in('status', ['drafted', 'approved', 'dialing'])
        .order('scheduled_for', { ascending: true })
        .abortSignal(queryTimeout()),
    ])

    if (invoiceRes.error) {
      if (invoiceRes.error.code === 'PGRST116') {
        notFound = true
      } else {
        throw new Error(invoiceRes.error.message)
      }
    } else {
      invoice = invoiceRes.data
    }

    if (callsRes.error) callsError = callsRes.error.message
    else calls = callsRes.data ?? []
    if (arrangementsRes.error) arrangementsError = arrangementsRes.error.message
    else arrangements = arrangementsRes.data ?? []
    if (!queueRes.error) queueEntries = queueRes.data ?? []
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to load invoice'
  }

  // Error state
  if (fetchError !== null) {
    return (
      <Shell>
        <BackLink />
        <div className="max-w-md py-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink mb-4">
            Error
          </p>
          <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">
            Failed to load
          </p>
          <p className="font-body text-base text-ink/60 mb-6">{fetchError}</p>
          <Link
            href="/invoices"
            className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill inline-block hover:bg-pulse/90 transition-colors"
          >
            Back to invoices
          </Link>
        </div>
      </Shell>
    )
  }

  // Not found state
  if (notFound || invoice === null) {
    return (
      <Shell>
        <BackLink />
        <div className="max-w-md py-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-4">
            Not found
          </p>
          <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">
            Invoice not found
          </p>
          <p className="font-body text-base text-ink/60 mb-6">
            This invoice does not exist or has been removed.
          </p>
          <Link
            href="/invoices"
            className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill inline-block hover:bg-pulse/90 transition-colors"
          >
            Back to invoices
          </Link>
        </div>
      </Shell>
    )
  }

  const days = daysOverdue(invoice.due_date)
  const isActionable = ['overdue', 'disputed'].includes(invoice.status)

  return (
    <Shell>
      <BackLink />

      {/* Invoice header block — Ink surface, client above the hero amount */}
      <div className="rounded-card bg-ink p-8 md:p-10 mb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <p className="font-mono text-xs text-mist/60">
            {isActionable && days > 0 ? (
              <>
                {days} day{days !== 1 ? 's' : ''}{' '}
                <span className="font-serif italic text-mist">overdue</span>
              </>
            ) : (
              `Due ${formatDate(invoice.due_date)}`
            )}
          </p>
          <div className="shrink-0">
            <InvoiceStatusBadge status={invoice.status} onDark />
          </div>
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-[-0.02em] text-mist mb-4 break-words">
          {invoice.client_name}
        </h1>
        {/* Sized to fit the card on narrow screens — the widest amount ($11,200)
            must not bleed past the padding at 360px. */}
        <p className="font-display text-[2.5rem] sm:text-[3.5rem] md:text-[4rem] leading-[1.02] font-medium tracking-[-0.03em] text-mist tabular-nums break-words">
          {formatAmount(invoice.amount, invoice.currency)}
        </p>
      </div>

      {/* Metadata row — mono labels + values, hairline separators */}
      <dl className="grid grid-cols-2 gap-y-6 md:grid-cols-4 md:gap-0 border-y border-ink/[0.12] py-5 md:divide-x md:divide-ink/[0.10] mb-12">
        {[
          { label: 'Due Date', value: formatDate(invoice.due_date) },
          { label: 'Currency', value: invoice.currency },
          { label: 'Language', value: invoice.language_preference, cap: true },
          { label: 'Added', value: formatDate(invoice.created_at) },
        ].map((m, i) => (
          <div key={m.label} className={i > 0 ? 'md:pl-6' : ''}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-1.5">
              {m.label}
            </dt>
            <dd
              className={`font-mono text-sm text-ink tabular-nums ${m.cap ? 'capitalize' : ''}`}
            >
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Scheduled recovery calls — recurrence made visible, cancellable before dialing */}
      {queueEntries.length > 0 && (
        <section className="mb-12 rounded-card border border-ink/[0.12] bg-white/50 p-6">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-4">
            Scheduled recovery {queueEntries.length === 1 ? 'call' : 'calls'}
          </h2>
          <ul className="space-y-4">
            {queueEntries.map((q) => (
              <li key={q.id} className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-ink tabular-nums">
                    {QUEUE_STATUS_LABEL[q.status] ?? q.status} · {formatDateTime(q.scheduled_for)}
                  </p>
                  {q.to_phone !== null && (
                    <p className="font-mono text-xs text-ink/60 tabular-nums mt-1">
                      to {q.to_phone}
                      {q.to_region !== null && <> ({q.to_region})</>}
                    </p>
                  )}
                </div>
                {(q.status === 'drafted' || q.status === 'approved') && (
                  <div className="shrink-0">
                    <QueueCancelButton id={q.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="font-body text-xs text-ink/50 mt-4">
            Drafted on a schedule, approved by a human, dialed automatically. Cancel any call above before it dials.
          </p>
        </section>
      )}

      {/* Judge-facing call flow — capped, guarded, draft-then-approve */}
      <DemoCallPanel invoiceId={invoice.id} />

      {/* Call history */}
      <section className="mb-12">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-6">
          Call History
          {calls.length > 0 && (
            <span className="font-mono text-xs text-ink/60 font-normal ml-3 tabular-nums">
              {calls.length} call{calls.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {callsError !== null ? (
          <SectionError label={`Couldn't load call history: ${callsError}`} />
        ) : calls.length === 0 ? (
          <p className="font-body text-sm text-ink/60">No calls placed yet.</p>
        ) : (
          <Timeline>
            {calls.map((call) => (
              <TimelineItem key={call.id}>
                <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between md:gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-ink tabular-nums">
                      {formatDateTime(call.started_at)}
                    </p>
                    <p className="font-mono text-xs text-ink/60 mt-1 tabular-nums">
                      Duration {formatDuration(call.duration_seconds)}
                      {call.calle_call_id !== null && (
                        <> · ID {call.calle_call_id.slice(0, 12)}&hellip;</>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CallOutcomeBadge outcome={call.outcome} />
                  </div>
                </div>
                {call.transcript_ref !== null && (
                  <p className="font-body text-sm text-ink/60 mt-2 break-words">
                    {call.transcript_ref}
                  </p>
                )}
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </section>

      {/* Payment arrangements */}
      <section>
        <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-6">
          Payment Arrangements
          {arrangements.length > 0 && (
            <span className="font-mono text-xs text-ink/60 font-normal ml-3 tabular-nums">
              {arrangements.length}
            </span>
          )}
        </h2>

        {arrangementsError !== null ? (
          <SectionError label={`Couldn't load arrangements: ${arrangementsError}`} />
        ) : arrangements.length === 0 ? (
          <p className="font-body text-sm text-ink/60">No arrangements proposed yet.</p>
        ) : (
          <Timeline>
            {arrangements.map((arr) => (
              <TimelineItem key={arr.id}>
                <p className="font-body text-sm text-ink mb-3 break-words">
                  {arr.proposed_terms}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-[11px] leading-none uppercase tracking-[0.1em] px-2.5 py-1 rounded-pill ${
                      arr.human_approved
                        ? 'bg-pulse text-mist'
                        : 'bg-ink/[0.06] text-ink/70'
                    }`}
                  >
                    {arr.human_approved ? 'Human approved' : 'Pending approval'}
                  </span>
                  <span
                    className={`font-mono text-[11px] leading-none uppercase tracking-[0.1em] px-2.5 py-1 rounded-pill ${
                      arr.client_agreed
                        ? 'bg-pulse text-mist'
                        : 'bg-ink/[0.06] text-ink/70'
                    }`}
                  >
                    {arr.client_agreed ? 'Client agreed' : 'Awaiting client'}
                  </span>
                </div>
                <p className="font-mono text-xs text-ink/60 mt-3 tabular-nums">
                  {formatDateTime(arr.created_at)}
                </p>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </section>
    </Shell>
  )
}
