/**
 * Demo script: walks one overdue invoice through the full call-orchestration path.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  pnpm demo
 *
 * Flags
 *   --auto-approve   skip the interactive script-approval prompt
 *   --invoice-id ID  use a specific invoice instead of the first overdue one
 *   --to=+E164       destination number (default: +6500000000 test number)
 *   --region=CC      CALL-E region override (default: inferred from --to)
 *   --live           respect CALLE_MODE from the environment instead of forcing
 *                    mock. A REAL call is placed only with --live AND
 *                    CALLE_MODE=live, and only after a typed confirmation.
 *
 * Default (no --live): CALLE_MODE is forced to 'mock' and the test number is
 * used, so a bare `pnpm demo` can never place a real call or spend a credit.
 */

import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/types/database';
import { getCalleClient } from '../lib/calle/index';
import { orchestrateCall } from '../lib/calls/orchestrate';

// ── Env validation ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n' +
      '  Copy .env.example to .env and fill in your Supabase credentials, then:\n' +
      '  node --env-file=.env --import tsx/esm scripts/demo-call.ts',
  );
  process.exit(1);
}

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const autoApprove = args.includes('--auto-approve') || args.includes('-y');
const invoiceIdFlag = (() => {
  const idx = args.indexOf('--invoice-id');
  return idx !== -1 ? args[idx + 1] : null;
})();

/** Read `--name=value` or `--name value`; null if absent. */
function getFlag(name: string): string | null {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return null;
}

// --live respects CALLE_MODE from the environment (which may be 'live').
// Without it, force mock so a default run can never place a real call.
const useEnvMode = args.includes('--live');
if (!useEnvMode) process.env.CALLE_MODE = 'mock';
const mode = process.env.CALLE_MODE ?? 'mock';
const isLive = mode === 'live';

// ── Supabase client ───────────────────────────────────────────────────────────

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Destination (default: Singapore test number; override with --to/--region) ─
const DEMO_PHONE = '+6500000000';
const DEMO_REGION = 'SG';

/** Best-effort E.164 country-code → CALL-E supported region. Longest prefixes first. */
function inferRegion(phone: string): string | null {
  const map: Array<[string, string]> = [
    ['+971', 'AE'], ['+880', 'BD'], ['+254', 'KE'],
    ['+65', 'SG'], ['+91', 'IN'], ['+60', 'MY'], ['+84', 'VN'], ['+49', 'DE'],
    ['+81', 'JP'], ['+33', 'FR'], ['+52', 'MX'], ['+55', 'BR'], ['+62', 'ID'],
    ['+63', 'PH'], ['+44', 'GB'], ['+61', 'AU'], ['+1', 'US'],
  ];
  for (const [cc, region] of map) if (phone.startsWith(cc)) return region;
  return null;
}

const toPhone = getFlag('to') ?? DEMO_PHONE;
const toRegionOrNull =
  getFlag('region') ?? (getFlag('to') ? inferRegion(toPhone) : DEMO_REGION);
if (toRegionOrNull === null) {
  console.error(
    `Could not infer a CALL-E region from ${toPhone}. Pass --region=<CC> (e.g. --region=BD).`,
  );
  process.exit(1);
}
const toRegion: string = toRegionOrNull;

// ── Seed invoice used when no overdue invoice exists ─────────────────────────
const SEED_INVOICE = {
  client_name: 'Orion Design Pte Ltd',
  amount: 4800.0,
  currency: 'SGD',
  language_preference: 'en',
  /** 35 days in the past */
  due_date: new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10),
  status: 'overdue',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function hr(): void {
  console.log('─'.repeat(72));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nCALL-E Invoice Recovery — Demo (CALLE_MODE=mock)\n');
  hr();

  // 1. Find or create an overdue invoice.
  let invoice: Database['public']['Tables']['invoices']['Row'];

  if (invoiceIdFlag) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceIdFlag)
      .single();
    if (error || !data) {
      console.error(`Invoice ${invoiceIdFlag} not found: ${error?.message ?? 'no data'}`);
      process.exit(1);
    }
    invoice = data;
  } else {
    const { data: overdue } = await supabase
      .from('invoices')
      .select('*')
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(1);

    if (overdue && overdue.length > 0) {
      invoice = overdue[0];
      console.log(`Found overdue invoice: ${invoice.id}`);
    } else {
      console.log('No overdue invoices found — seeding a demo invoice.');

      // Need a user_id to satisfy the FK.
      const {
        data: { users },
        error: authErr,
      } = await supabase.auth.admin.listUsers();

      if (authErr || !users.length) {
        console.error(
          'No users in auth.users. Sign up at the app first, then re-run this script.',
        );
        process.exit(1);
      }

      const userId = users[0].id;
      const { data: created, error: createErr } = await supabase
        .from('invoices')
        .insert({ ...SEED_INVOICE, user_id: userId })
        .select()
        .single();

      if (createErr || !created) {
        console.error(`Failed to seed invoice: ${createErr?.message ?? 'unknown'}`);
        process.exit(1);
      }

      invoice = created;
      console.log(`Seeded demo invoice: ${invoice.id}`);
    }
  }

  hr();
  console.log(`Invoice   : ${invoice.id}`);
  console.log(`Client    : ${invoice.client_name}`);
  console.log(`Amount    : ${invoice.currency} ${invoice.amount.toFixed(2)}`);
  console.log(`Due date  : ${invoice.due_date}`);
  console.log(`Status    : ${invoice.status}`);
  console.log(`Phone     : ${toPhone} (${toRegion})`);
  console.log(
    `Mode      : ${mode}${isLive ? '  ** LIVE — a real call will be placed **' : '  (mock — no real call)'}`,
  );
  hr();

  // Mandatory gate before any real call — not bypassable by --auto-approve.
  if (isLive) {
    console.log(
      '\nLIVE MODE: this will place a REAL call via CALL-E and spend a call credit.',
    );
    const confirm = await prompt(
      `Type the destination number (${toPhone}) exactly to confirm, or anything else to abort: `,
    );
    if (confirm.trim() !== toPhone) {
      console.error('Aborted — confirmation did not match the destination number.');
      process.exit(1);
    }
    console.log('Confirmed. Placing live call...\n');
  }

  const calle = getCalleClient();

  const result = await orchestrateCall({
    supabase,
    calle,
    invoice,
    toPhone,
    toRegion,
    onApprove: async (agentScript: string): Promise<boolean> => {
      console.log('\n── Generated call script ─────────────────────────────────────\n');
      console.log(agentScript);
      console.log('\n──────────────────────────────────────────────────────────────\n');

      if (autoApprove) {
        console.log('Auto-approving (--auto-approve flag set).');
        return true;
      }

      const answer = await prompt('Approve this script and place the call? [y/N] ');
      return answer.trim().toLowerCase() === 'y';
    },
  });

  hr();
  console.log('\nOrchestration complete.\n');
  console.log(`Arrangement : ${result.arrangementId}`);
  console.log(`Call row    : ${result.callRowId}`);
  console.log(`CALL-E id   : ${result.calleCallId}`);
  console.log(`Outcome     : ${result.outcome}`);
  console.log(`Payment date: ${result.paymentDate ?? '(n/a)'}`);
  console.log(`Duration    : ${result.durationSeconds ?? '?'}s`);
  console.log(`Summary     : ${result.transcriptSummary ?? '(none)'}`);
  console.log(`\nCALL-E events logged: ${result.calleEvents.length}`);

  for (const ev of result.calleEvents) {
    console.log(
      `  ${ev.method.padEnd(16)} ${ev.success ? 'OK' : 'FAIL'}  ${ev.durationMs}ms` +
        (ev.error ? `  error: ${ev.error}` : ''),
    );
  }

  hr();
  console.log('\nAll rows written. Check Supabase for invoices, calls, and arrangements.\n');
}

main().catch((err: unknown) => {
  console.error('\nDemo failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
