-- ============================================================
-- FICTIONAL DEMO SEED — supabase/seed/demo.sql
--
-- This file contains entirely invented data for demonstration
-- purposes in a public deployment. It must never contain real
-- client names, real invoice numbers, real phone numbers, or
-- any amounts or references traceable to an actual business
-- or person.
--
-- Phone numbers are from documented fictional/reserved ranges:
--   NANP (US/CA)  +1 555-010-xxxx  (NANP 555-01xx series, reserved for fiction)
--   UK Ofcom      +44 7700 900xxx  (Ofcom drama range, never assigned)
--   AU ACMA       +61 491 570 1xx  (ACMA dramatic purposes range)
--
-- Chronology: each invoice is issued (created_at) ~30 days before its
-- due date, so the "Added" date always precedes the due date and every
-- call/arrangement on it. Dates embedded in free-text (proposed terms,
-- transcripts) are human-formatted (e.g. "6 Jul 2026"), not ISO.
--
-- Run this against a Supabase instance where at least one user
-- has already signed up. The seed attaches all rows to the first
-- user found in auth.users. Re-running is safe: every INSERT uses
-- ON CONFLICT (id) DO NOTHING.
-- ============================================================

DO $seed$
DECLARE
  v_user_id uuid;

  -- Invoice UUIDs
  v_inv_pending        uuid := 'deed0001-0000-0000-0000-000000000000';
  v_inv_recent         uuid := 'deed0002-0000-0000-0000-000000000000';
  v_inv_bad            uuid := 'deed0003-0000-0000-0000-000000000000';
  v_inv_disputed       uuid := 'deed0004-0000-0000-0000-000000000000';
  v_inv_paid           uuid := 'deed0005-0000-0000-0000-000000000000';
  v_inv_arranged       uuid := 'deed0006-0000-0000-0000-000000000000';
  v_inv_large          uuid := 'deed0007-0000-0000-0000-000000000000';

  -- Call UUIDs
  v_call_01            uuid := 'ca110001-0000-0000-0000-000000000000';
  v_call_02            uuid := 'ca110002-0000-0000-0000-000000000000';
  v_call_03            uuid := 'ca110003-0000-0000-0000-000000000000';
  v_call_04            uuid := 'ca110004-0000-0000-0000-000000000000';
  v_call_05            uuid := 'ca110005-0000-0000-0000-000000000000';
  v_call_06            uuid := 'ca110006-0000-0000-0000-000000000000';

  -- Arrangement UUIDs
  v_arr_marlowe        uuid := 'a2a00001-0000-0000-0000-000000000000';
  v_arr_thornbury      uuid := 'a2a00002-0000-0000-0000-000000000000';
  v_arr_ashford        uuid := 'a2a00003-0000-0000-0000-000000000000';

BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'No users in auth.users — sign up at the app first, then run the seed.';
  END IF;

  -- ── Invoices ───────────────────────────────────────────────────────
  -- Spread of states: pending, recently overdue, badly overdue,
  -- disputed, paid, arranged, and a second badly-overdue large invoice.
  -- created_at = due_date − 30 days, so the invoice is always issued
  -- before it falls due (and before any call placed on it).

  -- Fictional destination numbers from documented reserved ranges (see header):
  -- NANP +1 555-010-xxxx, UK Ofcom +44 7700 900xxx, AU ACMA +61 491 570 1xx.
  -- client_region is the derived CALL-E region; the sweep only drafts calls for
  -- invoices that carry a (valid) phone, so every dial-able demo invoice has one.
  INSERT INTO public.invoices
    (id, user_id, client_name, amount, currency, due_date, status, language_preference,
     client_phone, client_region, created_at)
  VALUES

    -- 1. Not yet due — upcoming, no action needed yet
    ( v_inv_pending, v_user_id,
      'Pemberton & Hale Ltd',
      3200.00, 'USD', (current_date + 20),
      'pending', 'en', '+447700900101', 'GB', (current_date + 20 - 30)::timestamptz ),

    -- 2. Recently overdue — 14 days, first chase opportunity
    ( v_inv_recent, v_user_id,
      'Clearfield Digital Inc',
      5750.00, 'USD', (current_date - 14),
      'overdue', 'en', '+15550100022', 'US', (current_date - 14 - 30)::timestamptz ),

    -- 3. Badly overdue — 52 days, two call attempts already logged
    ( v_inv_bad, v_user_id,
      'Whitmore Media Group LLC',
      8900.00, 'USD', (current_date - 52),
      'overdue', 'en', '+15550100038', 'US', (current_date - 52 - 30)::timestamptz ),

    -- 4. Disputed — client contested the charge on a recovery call
    ( v_inv_disputed, v_user_id,
      'Ashford Analytics Pty Ltd',
      2400.00, 'USD', (current_date - 30),
      'disputed', 'en', '+61491570156', 'AU', (current_date - 30 - 30)::timestamptz ),

    -- 5. Paid — settled after a single recovery call 75 days ago
    ( v_inv_paid, v_user_id,
      'Thornbury Creative Pty Ltd',
      6100.00, 'USD', (current_date - 90),
      'paid', 'en', '+61491570157', 'AU', (current_date - 90 - 30)::timestamptz ),

    -- 6. Arranged — committed to payment date, arrangement executed
    ( v_inv_arranged, v_user_id,
      'Marlowe Digital Solutions Inc',
      4500.00, 'USD', (current_date - 28),
      'arranged', 'en', '+15550100054', 'US', (current_date - 28 - 30)::timestamptz ),

    -- 7. Badly overdue — 35 days, large balance, no call placed yet
    ( v_inv_large, v_user_id,
      'Highfield Consulting Ltd',
      11200.00, 'USD', (current_date - 35),
      'overdue', 'en', '+447700900315', 'GB', (current_date - 35 - 30)::timestamptz )

  ON CONFLICT (id) DO NOTHING;


  -- ── Historical calls ───────────────────────────────────────────────
  -- Phone numbers are from documented fictional ranges (see file header).

  INSERT INTO public.calls
    (id, invoice_id, user_id, started_at, duration_seconds,
     calle_call_id, outcome, transcript_ref)
  VALUES

    -- Whitmore: first attempt — no answer
    -- Client phone: +15550100038 (NANP 555-010 fictional range)
    ( v_call_01, v_inv_bad, v_user_id,
      now() - interval '18 days', 38,
      'mock_hist_calle_001', 'no_answer',
      'No answer at +15550100038 (Whitmore Media Group LLC). '
      'Voicemail not available. Call ended after 38 s.' ),

    -- Whitmore: second attempt — callback requested
    -- Client phone: +15550100038 (NANP 555-010 fictional range)
    ( v_call_02, v_inv_bad, v_user_id,
      now() - interval '11 days', 72,
      'mock_hist_calle_002', 'callback',
      'Spoke with accounts clerk at Whitmore Media Group LLC '
      '(+15550100038). AP manager unavailable; clerk requested '
      'a callback. Duration 72 s.' ),

    -- Thornbury: paid — full settlement confirmed on call
    -- Client phone: +61491570157 (ACMA dramatic purposes range)
    ( v_call_03, v_inv_paid, v_user_id,
      now() - interval '75 days', 154,
      'mock_hist_calle_003', 'paid',
      'James Thornbury at Thornbury Creative Pty Ltd '
      '(+61491570157) confirmed bank transfer of USD 6,100 '
      'completed same day. Invoice INV-0089 closed. Duration 154 s.' ),

    -- Marlowe: committed — payment date agreed
    -- Client phone: +15550100054 (NANP 555-010 fictional range)
    ( v_call_04, v_inv_arranged, v_user_id,
      now() - interval '5 days', 203,
      'mock_hist_calle_004', 'committed',
      'Sarah Marlowe at Marlowe Digital Solutions Inc '
      '(+15550100054) committed to full payment of USD 4,500 '
      'by ' || to_char(current_date + 7, 'FMDD Mon YYYY') || '. '
      'Reference INV-0147. Duration 203 s.' ),

    -- Ashford: disputed — client contested the charge during call
    -- Client phone: +61491570156 (ACMA dramatic purposes range)
    ( v_call_05, v_inv_disputed, v_user_id,
      now() - interval '20 days', 118,
      'mock_hist_calle_005', 'disputed',
      'Accounts contact at Ashford Analytics Pty Ltd '
      '(+61491570156) disputed invoice INV-0133 (USD 2,400), '
      'citing a scope disagreement. Escalated to email within '
      '1 business day per dispute protocol. Duration 118 s.' ),

    -- Highfield: first attempt — no answer, large invoice 35 days overdue
    -- Client phone: +447700900315 (Ofcom dramatic purposes range)
    ( v_call_06, v_inv_large, v_user_id,
      now() - interval '3 days', 42,
      'mock_hist_calle_006', 'no_answer',
      'No answer at +447700900315 (Highfield Consulting Ltd). '
      'Voicemail box full. Duration 42 s. Follow-up required for '
      'INV-0162 (USD 11,200, 35 days overdue).' )

  ON CONFLICT (id) DO NOTHING;


  -- ── Payment arrangements ───────────────────────────────────────────
  -- created_at precedes approved_at/executed_at.

  INSERT INTO public.arrangements
    (id, invoice_id, user_id, proposed_terms,
     human_approved, client_agreed, status,
     created_at, approved_at, rejected_at, executed_at)
  VALUES

    -- Marlowe: approved and executed — client committed to date
    ( v_arr_marlowe, v_inv_arranged, v_user_id,
      'Full payment of USD 4,500 by ' || to_char(current_date + 7, 'FMDD Mon YYYY')
      || ' via bank transfer. Reference: INV-0147.',
      true, true, 'executed',
      now() - interval '6 days',
      now() - interval '6 days',
      null,
      now() - interval '5 days' ),

    -- Thornbury: approved and executed — paid immediately on call
    ( v_arr_thornbury, v_inv_paid, v_user_id,
      'Immediate full payment of USD 6,100 via bank transfer. '
      'Reference: INV-0089.',
      true, true, 'executed',
      now() - interval '76 days',
      now() - interval '76 days',
      null,
      now() - interval '75 days' ),

    -- Ashford: human-approved but rejected after client disputed the charge
    ( v_arr_ashford, v_inv_disputed, v_user_id,
      'Full payment of USD 2,400 by ' || to_char(current_date - 15, 'FMDD Mon YYYY')
      || '. Reference: INV-0133.',
      true, false, 'rejected',
      now() - interval '21 days',
      now() - interval '21 days',
      now() - interval '19 days',
      null )

  ON CONFLICT (id) DO NOTHING;

END $seed$;
