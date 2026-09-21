/**
 * Maps the skill's result_schema outcome values to the DB CHECK constraint values.
 * DB valid values: paid | committed | callback | no_answer | refused | error | disputed
 *
 * Skill outcome → DB value:
 *   paid_now          → paid
 *   committed_to_date → committed
 *   disputed          → disputed  (distinct from refusal — different next-action)
 *   refused           → refused   (pass-through via isDbCallOutcome)
 *   no_answer         → no_answer (pass-through via isDbCallOutcome)
 *   voicemail         → callback
 *   wrong_person      → callback
 */

const DB_OUTCOMES = [
  'paid',
  'committed',
  'callback',
  'no_answer',
  'refused',
  'error',
  'disputed',
] as const;

export type DbCallOutcome = (typeof DB_OUTCOMES)[number];

function isDbCallOutcome(value: string): value is DbCallOutcome {
  return (DB_OUTCOMES as readonly string[]).includes(value);
}

const CALLE_TO_DB: Record<string, DbCallOutcome> = {
  paid_now: 'paid',
  committed_to_date: 'committed',
  disputed: 'disputed',
  voicemail: 'callback',
  wrong_person: 'callback',
};

export function mapCalleOutcome(raw: string | null): DbCallOutcome {
  if (!raw) return 'error';
  if (isDbCallOutcome(raw)) return raw;
  return CALLE_TO_DB[raw] ?? 'error';
}
