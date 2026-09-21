type InvoiceStatusKey = 'overdue' | 'pending' | 'paid' | 'disputed' | 'arranged'
type OutcomeKey = 'paid' | 'committed' | 'callback' | 'no_answer' | 'refused' | 'error'

// Pill discipline (REDESIGN-BRIEF.md):
//   quiet   → Ink 8% fill, Ink 90% text (Paid, Pending — resolved/not-yet states)
//   weight  → solid fill (Overdue = Glow fill + Ink text; Disputed/Refused = Ink fill + Mist text)
//   active  → Pulse tint (Arranged, positive call outcomes)
// Glow is used only as a small pill fill with Ink text on top — never as text on a light surface.
// Quiet text was Ink 70%; raised to 90% — the audit flagged Paid/Pending as the
// faintest text on the page. Still comfortably the quietest pills, just legible.
const QUIET = 'bg-ink/[0.08] text-ink/90'
// Solid Pulse fill + Mist text. Pulse text on a Pulse tint only reaches ~4.3:1 at
// 11px (fails 4.5:1); the solid fill measures ~4.9:1 and reads as an active chip.
const ACTIVE = 'bg-pulse text-mist'

const INVOICE_STATUS_STYLES: Record<InvoiceStatusKey, { label: string; className: string }> = {
  overdue:  { label: 'Overdue',  className: 'bg-glow text-ink' },
  pending:  { label: 'Pending',  className: QUIET },
  paid:     { label: 'Paid',     className: QUIET },
  disputed: { label: 'Disputed', className: 'bg-ink text-mist' },
  arranged: { label: 'Arranged', className: ACTIVE },
}

// On a dark (Ink) surface — the detail hero — the light-surface fills invert or
// vanish (Disputed's Ink fill disappears on Ink). These fills read on Ink.
const INVOICE_STATUS_STYLES_ON_DARK: Record<InvoiceStatusKey, string> = {
  overdue:  'bg-glow text-ink',
  pending:  'bg-mist/15 text-mist',
  paid:     'bg-mist/15 text-mist',
  disputed: 'bg-mist text-ink',
  arranged: 'bg-pulse text-mist',
}

const OUTCOME_STYLES: Record<OutcomeKey, { label: string; className: string }> = {
  paid:      { label: 'Paid',      className: ACTIVE },
  committed: { label: 'Committed', className: ACTIVE },
  callback:  { label: 'Callback',  className: QUIET },
  no_answer: { label: 'No Answer', className: QUIET },
  refused:   { label: 'Refused',   className: 'bg-ink text-mist' },
  error:     { label: 'Error',     className: QUIET },
}

const PILL_BASE =
  'font-mono text-[11px] leading-none uppercase tracking-[0.1em] px-2.5 py-1 rounded-pill inline-block whitespace-nowrap'

function isInvoiceStatusKey(s: string): s is InvoiceStatusKey {
  return Object.prototype.hasOwnProperty.call(INVOICE_STATUS_STYLES, s)
}

function isOutcomeKey(s: string): s is OutcomeKey {
  return Object.prototype.hasOwnProperty.call(OUTCOME_STYLES, s)
}

export function InvoiceStatusBadge({
  status,
  onDark = false,
}: {
  status: string
  onDark?: boolean
}) {
  const label = isInvoiceStatusKey(status) ? INVOICE_STATUS_STYLES[status].label : status
  const className =
    onDark && isInvoiceStatusKey(status)
      ? INVOICE_STATUS_STYLES_ON_DARK[status]
      : isInvoiceStatusKey(status)
        ? INVOICE_STATUS_STYLES[status].className
        : onDark
          ? 'bg-mist/15 text-mist'
          : QUIET

  return <span className={`${PILL_BASE} ${className}`}>{label}</span>
}

export function CallOutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null

  const config = isOutcomeKey(outcome)
    ? OUTCOME_STYLES[outcome]
    : { label: outcome, className: QUIET }

  return <span className={`${PILL_BASE} ${config.className}`}>{config.label}</span>
}
