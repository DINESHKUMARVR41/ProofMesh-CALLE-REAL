import Link from 'next/link'
import { createSupabaseServer, queryTimeout } from '@/lib/supabase/server'
import { QueueReview, type QueueDraft } from '@/components/queue-review'
import { planSweep, sweepConfigFromEnv, type SweepInvoice, type SkipReason } from '@/lib/queue/sweep'
import type { Tables } from '@/lib/types/database'

// Reads live queue + invoice data via the service-role client at request time.
export const dynamic = 'force-dynamic'

type QueueEntry = Tables<'call_queue'>
type Invoice = Tables<'invoices'>

const OPEN_STATUSES = new Set(['drafted', 'approved', 'dialing'])

function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000)
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FooterNote() {
  return (
    <footer className="mt-16 pt-6 border-t border-ink/[0.08]">
      <p className="font-mono text-[11px] leading-5 tracking-[0.04em] text-ink/60">
        Recovery calls are drafted on a schedule, approved by a human, and dialed
        automatically. This instance uses fictional demonstration data only.
      </p>
    </footer>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-mist flex flex-col">
      <div className="w-full max-w-[900px] mx-auto px-8 md:px-16 py-12 md:py-16 flex-1 flex flex-col">
        <div className="flex-1">{children}</div>
        <FooterNote />
      </div>
    </main>
  )
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Scheduled',
  dialing: 'Dialing now',
  completed: 'Completed',
  dropped: 'Dropped',
  expired: 'Expired',
}

export default async function QueuePage() {
  let entries: QueueEntry[] = []
  let invoices: Invoice[] = []
  let fetchError: string | null = null

  try {
    const supabase = createSupabaseServer()
    const [queueRes, invoiceRes] = await Promise.all([
      supabase.from('call_queue').select('*').order('drafted_at', { ascending: false }).abortSignal(queryTimeout()),
      supabase.from('invoices').select('*').abortSignal(queryTimeout()),
    ])
    if (queueRes.error) throw new Error(queueRes.error.message)
    if (invoiceRes.error) throw new Error(invoiceRes.error.message)
    entries = queueRes.data ?? []
    invoices = invoiceRes.data ?? []
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to load the queue'
  }

  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const clientName = (invoiceId: string) => invoiceById.get(invoiceId)?.client_name ?? 'Unknown client'

  // ── Actionable drafts → the review component ────────────────────────────────
  const drafts: QueueDraft[] = entries
    .filter((e) => e.status === 'drafted')
    .map((e) => {
      const inv = invoiceById.get(e.invoice_id)
      const expiresMs = new Date(e.expires_at).getTime()
      return {
        id: e.id,
        clientName: inv?.client_name ?? 'Unknown client',
        amountLabel: inv ? formatAmount(inv.amount, inv.currency) : '—',
        daysOverdue: inv ? Math.max(0, daysOverdue(inv.due_date)) : 0,
        scheduledForLabel: formatDateTime(e.scheduled_for),
        toPhone: e.to_phone ?? '—',
        toRegion: e.to_region ?? '—',
        script: e.script,
        expiresAtLabel: formatDateTime(e.expires_at),
        expiresSoon: expiresMs - Date.now() < 12 * 3_600_000,
      }
    })

  const scheduled = entries.filter((e) => e.status === 'approved' || e.status === 'dialing')
  const history = entries.filter((e) => ['completed', 'dropped', 'expired'].includes(e.status))

  // ── "No phone on file" surface: overdue invoices the sweep can't draft for a
  //    lack of a valid number — shown, not silently ignored. Computed with the
  //    same planner the sweep uses so the two never disagree. ──────────────────
  const openInvoiceIds = new Set(entries.filter((e) => OPEN_STATUSES.has(e.status)).map((e) => e.invoice_id))
  const sweepInvoices: SweepInvoice[] = invoices.map((i) => ({
    id: i.id,
    user_id: i.user_id,
    client_name: i.client_name,
    amount: i.amount,
    currency: i.currency,
    due_date: i.due_date,
    status: i.status,
    language_preference: i.language_preference,
    client_phone: i.client_phone,
    client_region: i.client_region,
  }))
  const { skipped } = planSweep(
    sweepInvoices,
    { openQueueInvoiceIds: openInvoiceIds, recentCallInvoiceIds: new Set() },
    sweepConfigFromEnv(),
    new Date(),
  )
  const needsPhone = skipped
    .filter((s) => s.reason === 'no_phone' || s.reason === 'unsupported_number')
    .map((s) => ({ invoice: invoiceById.get(s.invoiceId), reason: s.reason }))
    .filter((x): x is { invoice: Invoice; reason: SkipReason } => x.invoice !== undefined)

  if (fetchError !== null) {
    return (
      <Shell>
        <Link href="/invoices" className="inline-block font-mono text-xs uppercase tracking-[0.1em] text-ink/60 hover:text-pulse transition-colors mb-8">
          ← Invoices
        </Link>
        <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">Could not load the queue</p>
        <p className="font-body text-base text-ink/60">{fetchError}</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <Link href="/invoices" className="inline-block font-mono text-xs uppercase tracking-[0.1em] text-ink/60 hover:text-pulse transition-colors mb-8">
        ← Invoices
      </Link>

      <header className="pb-8 border-b border-ink/[0.12] mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-4">Morning review</p>
        <h1 className="font-display text-[2.5rem] leading-[1.02] md:text-5xl font-medium tracking-[-0.03em] text-ink">
          The <span className="font-serif italic">queue</span>
        </h1>
        <p className="font-body text-[15px] leading-6 text-ink/60 mt-4 max-w-xl">
          Recovery calls drafted for newly overdue invoices. Approve the ones to place —
          each is dialed automatically at its scheduled time, one at a time, within calling hours.
        </p>
      </header>

      {/* No phone on file — surfaced, not dropped */}
      {needsPhone.length > 0 && (
        <section className="mb-10 rounded-card border border-ink/[0.12] bg-white/50 px-5 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-2">
            Not drafted — no phone on file
          </p>
          <ul className="space-y-1">
            {needsPhone.map(({ invoice, reason }) => (
              <li key={invoice.id} className="font-body text-sm text-ink/70 flex flex-wrap gap-x-2">
                <span className="text-ink">{invoice.client_name}</span>
                <span className="font-mono text-xs text-ink/50 tabular-nums">
                  {formatAmount(invoice.amount, invoice.currency)} · {Math.max(0, daysOverdue(invoice.due_date))}d overdue ·{' '}
                  {reason === 'no_phone' ? 'no number' : 'unsupported number'}
                </span>
              </li>
            ))}
          </ul>
          <p className="font-body text-xs text-ink/50 mt-3">
            Add a phone number to these invoices and the next sweep will draft a call.
          </p>
        </section>
      )}

      {/* The review queue */}
      <section className="mb-14">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-6">
          Awaiting review
          {drafts.length > 0 && (
            <span className="font-mono text-xs text-ink/60 font-normal ml-3 tabular-nums">{drafts.length}</span>
          )}
        </h2>
        <QueueReview drafts={drafts} />
      </section>

      {/* Scheduled (approved / dialing) */}
      {scheduled.length > 0 && (
        <section className="mb-14">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-6">Scheduled</h2>
          <ul className="divide-y divide-ink/[0.08]">
            {scheduled.map((e) => (
              <li key={e.id} className="py-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-body text-[15px] text-ink">{clientName(e.invoice_id)}</span>
                <span className="font-mono text-xs text-ink/60 tabular-nums">
                  {e.to_phone ?? '—'} · {STATUS_LABEL[e.status] ?? e.status} · {formatDateTime(e.scheduled_for)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* History — below the fold */}
      {history.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink mb-6">History</h2>
          <ul className="divide-y divide-ink/[0.08]">
            {history.map((e) => (
              <li key={e.id} className="py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-body text-sm text-ink/80">{clientName(e.invoice_id)}</span>
                <span className="font-mono text-xs text-ink/50 tabular-nums">
                  {STATUS_LABEL[e.status] ?? e.status} · {formatDateTime(e.drafted_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  )
}
