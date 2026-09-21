// Shared phone-number masking. Lives in the core `calle` layer so the client
// impls (mock/live) and the orchestrator can mask numbers in their log lines
// without importing from the demo-call feature (which would invert layering).
// A full destination number must never sit in server logs — see ABUSE-REVIEW S1.

/** Mask a number to country code + last 3 digits, e.g. +880*******000. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return '+' + '*'.repeat(Math.max(0, phone.length - 1))
  return phone.slice(0, 4) + '*'.repeat(phone.length - 7) + phone.slice(-3)
}
