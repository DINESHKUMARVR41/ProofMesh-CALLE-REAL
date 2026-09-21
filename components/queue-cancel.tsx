'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dropQueueEntry } from '@/app/actions/queue'

/**
 * Cancel a scheduled recovery call before it dials. Recurrence is never hidden —
 * a queued call is always visible on its invoice with this control, so the owner
 * can stop it. Only meaningful before dialing (drafted/approved).
 */
export function QueueCancelButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          try {
            await dropQueueEntry(id)
            router.refresh()
          } catch {
            /* surfaced on next load; nothing destructive happened */
          }
        })
      }
      disabled={pending}
      className="font-body text-sm font-medium text-ink/70 hover:text-pulse transition-colors disabled:opacity-40"
    >
      {pending ? 'Cancelling…' : 'Cancel scheduled call'}
    </button>
  )
}
