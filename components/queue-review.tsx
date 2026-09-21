'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveQueueEntries, dropQueueEntry, editQueueScript } from '@/app/actions/queue'

export interface QueueDraft {
  id: string
  clientName: string
  amountLabel: string
  daysOverdue: number
  scheduledForLabel: string
  toPhone: string
  toRegion: string
  script: string
  expiresAtLabel: string
  expiresSoon: boolean
}

/**
 * The morning review. Drafted recovery calls the owner approves as a batch — the
 * product's core loop made visible. Approval here is what turns a draft into a call
 * that will be placed automatically at its scheduled time; the copy says so plainly.
 */
export function QueueReview({ drafts }: { drafts: QueueDraft[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (drafts.length === 0) {
    return (
      <p className="font-body text-base text-ink/60">
        No calls are waiting for review. The scheduled sweep drafts recovery calls for
        newly overdue invoices; they will appear here for your approval.
      </p>
    )
  }

  const allSelected = selected.size === drafts.length
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(drafts.map((d) => d.id)))

  function approve(ids: string[]) {
    if (ids.length === 0) return
    setMessage(null)
    startTransition(async () => {
      try {
        const r = await approveQueueEntries(ids)
        const parts = [`Approved ${r.approved.length} call${r.approved.length !== 1 ? 's' : ''}.`]
        if (r.skipped.length > 0) parts.push(`${r.skipped.length} skipped.`)
        setMessage(parts.join(' '))
        setSelected(new Set())
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Approval failed.')
      }
    })
  }

  function drop(id: string) {
    setMessage(null)
    startTransition(async () => {
      try {
        await dropQueueEntry(id)
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Could not drop the draft.')
      }
    })
  }

  function saveEdit(id: string) {
    setMessage(null)
    startTransition(async () => {
      try {
        await editQueueScript(id, draftText)
        setEditing(null)
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Could not save the script.')
      }
    })
  }

  return (
    <div>
      {/* What approval means — stated plainly, above the actions */}
      <div className="rounded-card bg-ink/[0.04] border border-ink/[0.08] px-5 py-4 mb-6">
        <p className="font-body text-sm text-ink/80">
          Approving a call places it automatically at its scheduled time — no further
          click. Calls are dialed one at a time, within calling hours for the client&rsquo;s
          region. Drop anything you don&rsquo;t want placed; edit a script before approving.
        </p>
      </div>

      {message && (
        <p className="font-body text-sm text-ink mb-4 rounded-input bg-ink/[0.06] px-4 py-3">
          {message}
        </p>
      )}

      {/* Batch controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.12] pb-3 mb-1">
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-pulse" />
          {allSelected ? 'Clear' : 'Select all'}
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => approve([...selected])}
            disabled={pending || selected.size === 0}
            className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2 rounded-pill hover:bg-pulse/90 transition-colors disabled:opacity-40"
          >
            Approve selected ({selected.size})
          </button>
          <button
            onClick={() => approve(drafts.map((d) => d.id))}
            disabled={pending}
            className="font-body text-sm font-medium border border-ink/20 text-ink px-5 py-2 rounded-pill hover:border-pulse hover:text-pulse transition-colors disabled:opacity-40"
          >
            Approve all
          </button>
        </div>
      </div>

      <ul className="divide-y divide-ink/[0.08]">
        {drafts.map((d) => (
          <li key={d.id} className="py-5">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                onChange={() => toggle(d.id)}
                className="mt-1.5 accent-pulse"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-body text-[17px] font-medium text-ink">{d.clientName}</span>
                  <span className="font-mono text-sm text-ink tabular-nums">{d.amountLabel}</span>
                </div>
                <p className="font-mono text-xs text-ink/60 tabular-nums mt-1">
                  {d.daysOverdue}d overdue · {d.toPhone} ({d.toRegion}) · scheduled {d.scheduledForLabel}
                  {d.expiresSoon && <span className="text-ink"> · expires {d.expiresAtLabel}</span>}
                </p>

                {/* Script — expandable, editable while drafted */}
                {editing === d.id ? (
                  <div className="mt-3">
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={10}
                      className="w-full font-mono text-xs text-ink/80 bg-ink/[0.04] rounded-input p-3 border border-ink/15 focus:outline-none focus:border-pulse"
                    />
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => saveEdit(d.id)}
                        disabled={pending}
                        className="font-body text-sm font-medium bg-pulse text-mist px-4 py-1.5 rounded-pill hover:bg-pulse/90 transition-colors disabled:opacity-40"
                      >
                        Save script
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        disabled={pending}
                        className="font-body text-sm text-ink/60 px-3 py-1.5 hover:text-pulse transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <details className="mt-2 group">
                    <summary className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 cursor-pointer hover:text-pulse list-none">
                      View script
                    </summary>
                    <pre className="font-mono text-xs text-ink/80 whitespace-pre-wrap bg-ink/[0.04] rounded-input p-3 mt-2 max-h-72 overflow-y-auto">
                      {d.script}
                    </pre>
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => {
                          setEditing(d.id)
                          setDraftText(d.script)
                        }}
                        disabled={pending}
                        className="font-body text-sm font-medium text-ink/70 hover:text-pulse transition-colors disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => drop(d.id)}
                        disabled={pending}
                        className="font-body text-sm font-medium text-ink/70 hover:text-pulse transition-colors disabled:opacity-40"
                      >
                        Drop
                      </button>
                    </div>
                  </details>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
