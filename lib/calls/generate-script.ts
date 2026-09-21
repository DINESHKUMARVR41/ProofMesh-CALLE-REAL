import { regionName } from '../calle/regions'

export interface InvoiceForScript {
  clientName: string
  amount: number
  currency: string
  dueDays: number
}

/** The automated-call disclosure. Must be spoken before any invoice/payment. */
export const AUTOMATED_DISCLOSURE =
  'Hello, this is an automated call from Devixus Finance on behalf of a client.'

/**
 * Generates the agentScript passed to CALL-E's placeCall(). Used by both the CLI
 * demo and the judge-facing web flow. `region` is the recipient's CALL-E region;
 * the copy follows it rather than a hardcoded locale.
 *
 * The very first spoken line identifies the call as automated, before the invoice
 * is mentioned — the voice is convincing enough that a listener may not otherwise
 * realise it is automated.
 */
export function generateCallScript(invoice: InvoiceForScript, region: string): string {
  const formatted = `${invoice.currency} ${invoice.amount.toFixed(2)}`

  return [
    `You are a professional accounts recovery specialist calling on behalf of Devixus Finance, a digital agency based in ${regionName(region)}.`,
    '',
    `REQUIRED DISCLOSURE: your first spoken sentence must identify this as an automated call, before any invoice or payment is mentioned. Say, near-verbatim: "${AUTOMATED_DISCLOSURE}"`,
    '',
    `CALL PURPOSE: Follow up on an overdue invoice of ${formatted} from ${invoice.clientName}, now ${invoice.dueDays} day(s) past due.`,
    '',
    'CALL FLOW:',
    `1. Open with the disclosure, then confirm identity: "${AUTOMATED_DISCLOSURE} Am I speaking with the accounts team at ${invoice.clientName}?"`,
    `2. Introduce the invoice: "I am following up on an outstanding invoice of ${formatted} that was due ${invoice.dueDays} days ago. Could you let me know when payment can be arranged?"`,
    '3. Listen and respond:',
    '   - Payment committed to a specific date: thank them, confirm the date, and close.',
    '   - They need more time: agree on a callback date, confirm it, and close.',
    '   - They dispute the invoice: acknowledge without argument, note the dispute, and close politely.',
    '   - No answer or voicemail: leave a brief professional message if possible.',
    '4. Close: "Thank you for your time. We will send a written follow-up shortly. Have a good day."',
    '',
    'TONE: Professional, calm, firm but polite. Never aggressive or confrontational.',
    '',
    'REQUIRED OUTCOME — report exactly one of:',
    '  paid_now          — client confirms payment made or arriving within 24 hours',
    '  committed_to_date — client agreed to a specific payment date (include the date)',
    '  disputed          — client disputes the invoice amount or claims prior payment (capture objection verbatim)',
    '  refused           — client declines to pay or engage; no date or dispute offered',
    '  no_answer         — phone rang to completion; nobody answered',
    '  voicemail         — reached voicemail; left a brief professional message',
    '  wrong_person      — a third party answered; named client was not reached',
  ].join('\n')
}

/**
 * Human-readable summary stored in arrangements.proposed_terms.
 * This is what the operator approves before the call is placed.
 */
export function generateProposedTerms(invoice: InvoiceForScript, region: string): string {
  const formatted = `${invoice.currency} ${invoice.amount.toFixed(2)}`
  return (
    `Recovery call for ${formatted} overdue ${invoice.dueDays} day(s) from ${invoice.clientName}. ` +
    `Objective: secure a payment commitment or agree a callback date. ` +
    `Language: English. Region: ${regionName(region)} (${region}).`
  )
}
