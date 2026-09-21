// Destination-number validation for the public call endpoint. Someone's phone
// rings, so this rejects hard and derives everything server-side: it never trusts
// a client-supplied region, and it stores/returns only a masked number.
import { regionForE164, type SupportedRegion } from '../calle/regions'
import { maskPhone } from '../calle/phone-mask'

// Masking lives in the core calle layer (mock/live/orchestrator all mask logs
// with it); re-exported here so existing importers of './phone' are unaffected.
export { maskPhone }

export type PhoneRejection =
  | 'malformed' // not E.164
  | 'unsupported_region' // region not in CALL-E's list
  | 'premium_or_invalid' // premium-rate / disallowed prefix or bad length
  | 'region_mismatch' // client claimed a region that the number contradicts

export type PhoneValidation =
  | { ok: true; e164: string; region: SupportedRegion; masked: string }
  | { ok: false; reason: PhoneRejection }

// Strict E.164: '+', country code starting 1-9, 7–15 digits total.
const E164 = /^\+[1-9]\d{6,14}$/

// Obvious premium-rate / special-service prefixes to refuse. Not exhaustive —
// see ABUSE-REVIEW; operators must apply their own carrier-level controls.
const PREMIUM_PREFIXES = [
  '+1900', '+1976', // NANP premium / special
  '+4409', '+4470', // UK premium (09) / personal-numbering (070) ranges
  '+6019', // rough MY special-services guard
]

/**
 * Validate a destination. `claimedRegion` is whatever the request body asserted;
 * it is only used to reject a mismatch — the authoritative region is derived
 * from the number itself.
 */
export function validateDestination(rawPhone: unknown, claimedRegion?: unknown): PhoneValidation {
  const phone = typeof rawPhone === 'string' ? rawPhone.replace(/[\s()-]/g, '') : ''
  if (!E164.test(phone)) return { ok: false, reason: 'malformed' }
  if (PREMIUM_PREFIXES.some((p) => phone.startsWith(p))) {
    return { ok: false, reason: 'premium_or_invalid' }
  }
  const region = regionForE164(phone)
  if (!region) return { ok: false, reason: 'unsupported_region' }
  if (typeof claimedRegion === 'string' && claimedRegion && claimedRegion.toUpperCase() !== region) {
    return { ok: false, reason: 'region_mismatch' }
  }
  return { ok: true, e164: phone, region, masked: maskPhone(phone) }
}

export function phoneRejectionMessage(reason: PhoneRejection): string {
  switch (reason) {
    case 'malformed':
      return 'Enter a valid phone number in international format, e.g. +8801711000000.'
    case 'unsupported_region':
      return 'That country is not supported by CALL-E. Use a number in a supported region.'
    case 'premium_or_invalid':
      return 'That number looks like a premium-rate or special-service line and cannot be called.'
    case 'region_mismatch':
      return 'The number and region do not match.'
  }
}
