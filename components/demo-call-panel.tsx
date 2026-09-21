'use client'

import { useEffect, useState } from 'react'
import {
  draftDemoCall,
  placeDemoCall,
  pollDemoCall,
  getDemoCallInfo,
  type BudgetView,
  type PollResult,
  type TranscriptTurnView,
} from '@/app/actions/demo-call'
import { CallOutcomeBadge } from '@/components/status-badges'

type Phase = 'idle' | 'review' | 'placing' | 'polling' | 'done' | 'denied' | 'error'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 660 // 22 minutes — comfortably exceeds a call + processing

export function DemoCallPanel({ invoiceId }: { invoiceId: string }) {
  const [mode, setMode] = useState<'mock' | 'live' | null>(null)
  const [budget, setBudget] = useState<BudgetView | null>(null)
  const [phone, setPhone] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [script, setScript] = useState<string | null>(null)
  const [masked, setMasked] = useState<string | null>(null)
  const [pollState, setPollState] = useState<string>('')
  const [result, setResult] = useState<Extract<PollResult, { done: true }> | null>(null)

  useEffect(() => {
    getDemoCallInfo()
      .then((info) => {
        setMode(info.mode)
        setBudget(info.budget)
      })
      .catch(() => {})
  }, [])

  async function refreshBudget() {
    try {
      setBudget((await getDemoCallInfo()).budget)
    } catch {}
  }

  async function onReview() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await draftDemoCall(invoiceId, phone)
      if (!r.ok) {
        setMessage(r.message)
        setPhase('idle')
      } else {
        setScript(r.script)
        setMasked(r.masked)
        setBudget(r.budget)
        setPhase('review')
      }
    } catch {
      setMessage('Could not prepare the call. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function poll(callId: string, attempt: number) {
    if (attempt > POLL_MAX_ATTEMPTS) {
      setPhase('done')
      setPollState('')
      setMessage(
        'The call was placed, but the result did not arrive in time. It may still complete — check back shortly.',
      )
      return
    }
    try {
      const r = await pollDemoCall(callId)
      if (r.done) {
        setResult(r)
        setPhase('done')
        setPollState('')
        void refreshBudget()
      } else {
        setPollState(r.status)
        setTimeout(() => void poll(callId, attempt + 1), POLL_INTERVAL_MS)
      }
    } catch {
      setTimeout(() => void poll(callId, attempt + 1), POLL_INTERVAL_MS)
    }
  }

  async function onPlace() {
    setBusy(true)
    setMessage(null)
    setPhase('placing')
    try {
      const r = await placeDemoCall(invoiceId, phone)
      if (!r.ok) {
        setMessage(r.message)
        setPhase('denied')
        void refreshBudget()
        return
      }
      setPhase('polling')
      setPollState('queued')
      void poll(r.calleCallId, 1)
    } catch {
      setMessage('The call could not be placed. Please try again.')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setPhase('idle')
    setScript(null)
    setResult(null)
    setMessage(null)
    setPollState('')
  }

  const remaining = budget?.remaining ?? null
  const exhausted = remaining !== null && remaining <= 0

  return (
    <section className="mt-12 rounded-card border border-ink/[0.12] bg-white/60 p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink">
          Place a recovery call
        </h2>
        {budget && (
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 tabular-nums">
            {remaining} / {budget.total} demo calls left
          </span>
        )}
      </div>

      <p className="font-body text-sm text-ink/70 mb-5 max-w-prose">
        {mode === 'live' ? (
          <>
            This places a <strong className="text-ink">real phone call</strong> to the number you
            enter. The agent identifies itself as an automated call at the start. Your number is{' '}
            <strong className="text-ink">not stored</strong> — only a masked form is kept.
          </>
        ) : (
          <>
            The deployment is in <strong className="text-ink">mock mode</strong>: this walks through
            the full approval flow and logs a <strong className="text-ink">simulated</strong> call —
            no real phone rings. The script, budget guard, and result handling are exactly what a
            live call uses.
          </>
        )}
      </p>

      {message && (
        <p className="font-body text-sm text-ink mb-4 rounded-input bg-ink/[0.06] px-4 py-3">
          {message}
        </p>
      )}

      {/* Step 1 — enter number */}
      {(phase === 'idle' || phase === 'denied' || phase === 'error') && (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="Your number in full international format, e.g. +8801711000000"
            disabled={busy || exhausted}
            className="flex-1 font-mono text-sm text-ink bg-white rounded-input border border-ink/15 px-4 py-2.5 placeholder:text-ink/40 focus:outline-none focus:border-pulse"
          />
          <button
            onClick={onReview}
            disabled={busy || exhausted || phone.trim().length < 6}
            className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill hover:bg-pulse/90 transition-colors disabled:opacity-40"
          >
            {busy ? 'Preparing…' : 'Review call script'}
          </button>
        </div>
      )}
      {exhausted && phase === 'idle' && (
        <p className="font-body text-sm text-ink/60 mt-3">
          The demo call budget for this deployment has been used up.
        </p>
      )}

      {/* Step 2 — review the drafted script, then approve */}
      {phase === 'review' && script && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-2">
            Calling {masked} · the agent will follow this script
          </p>
          <pre className="font-mono text-xs text-ink/80 whitespace-pre-wrap bg-ink/[0.04] rounded-input p-4 max-h-72 overflow-y-auto mb-4">
            {script}
          </pre>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onPlace}
              disabled={busy}
              className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill hover:bg-pulse/90 transition-colors disabled:opacity-40"
            >
              {mode === 'live' ? 'Approve & place the call' : 'Approve & place (mock)'}
            </button>
            <button
              onClick={reset}
              disabled={busy}
              className="font-body text-sm font-medium text-ink/60 px-4 py-2.5 hover:text-pulse transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — placing / polling */}
      {(phase === 'placing' || phase === 'polling') && (
        <p className="font-mono text-sm text-ink/70">
          {phase === 'placing' ? 'Placing the call…' : `Waiting for the result… (${pollState})`}
        </p>
      )}

      {/* Step 4 — result */}
      {phase === 'done' && result && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <CallOutcomeBadge outcome={result.outcome} />
            {result.paymentDate && (
              <span className="font-mono text-xs text-ink/70 tabular-nums">
                Payment date: {result.paymentDate}
              </span>
            )}
            {result.durationSeconds !== null && (
              <span className="font-mono text-xs text-ink/60 tabular-nums">
                {result.durationSeconds}s
              </span>
            )}
          </div>
          {result.transcript.length > 0 && (
            <ol className="space-y-2 mb-4">
              {result.transcript.map((t: TranscriptTurnView, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/50 mr-2">
                    {t.role === 'agent' ? 'Agent' : 'Client'}
                  </span>
                  <span className="font-body text-ink/80">{t.text}</span>
                </li>
              ))}
            </ol>
          )}
          <button
            onClick={reset}
            className="font-body text-sm font-medium text-pulse hover:underline"
          >
            Place another call
          </button>
        </div>
      )}
    </section>
  )
}
