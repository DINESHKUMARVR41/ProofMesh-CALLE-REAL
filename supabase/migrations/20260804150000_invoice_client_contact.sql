-- Phase F: a client destination on the invoice, so scheduled recovery calls have
-- a number to dial.
--
-- Both nullable: an invoice without a phone is simply never auto-dialed — the
-- threshold sweep skips it, and the /queue page surfaces it as "no phone on file"
-- rather than silently ignoring it. client_region is DERIVED from client_phone
-- (the CALL-E region) and stored alongside it; the dialer re-derives/validates at
-- dial time via the same destination-validation module the judge flow uses.
--
-- The public judge call flow is unaffected: a judge enters their own number, which
-- always overrides — they are calling themselves, not the client.

alter table public.invoices
  add column client_phone  text,
  add column client_region text;
