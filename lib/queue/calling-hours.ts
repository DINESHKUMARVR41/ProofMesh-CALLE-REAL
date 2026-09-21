// Calling-hours window for the dialer. An approved call must never ring someone
// outside a civilised local window (default 10:00–18:00 in the client's region).
//
// Region -> a REPRESENTATIVE IANA timezone. Several supported regions span multiple
// zones (US, CA, AU, BR, ID); a production system would derive the zone from the number's
// area code or a per-client setting. For this demo one representative zone per
// region is deliberate and sufficient — it is documented, not hidden.
const REGION_TZ: Record<string, string> = {
  US: 'America/New_York',
  CA: 'America/Toronto',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  AE: 'Asia/Dubai',
  IN: 'Asia/Kolkata',
  BD: 'Asia/Dhaka',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  ID: 'Asia/Jakarta',
  VN: 'Asia/Ho_Chi_Minh',
  PH: 'Asia/Manila',
  JP: 'Asia/Tokyo',
  AU: 'Australia/Sydney',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  KE: 'Africa/Nairobi',
}

/** Half-open window [startHour, endHour) in the client's local time. */
export interface CallingHours {
  startHour: number
  endHour: number
}

export const DEFAULT_CALLING_HOURS: CallingHours = { startHour: 10, endHour: 18 }

export function callingHoursFromEnv(): CallingHours {
  const start = Number(process.env.QUEUE_CALL_START_HOUR)
  const end = Number(process.env.QUEUE_CALL_END_HOUR)
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 24
  return {
    startHour: valid(start) ? start : DEFAULT_CALLING_HOURS.startHour,
    endHour: valid(end) ? end : DEFAULT_CALLING_HOURS.endHour,
  }
}

/** Local hour (0–23) in a region's representative timezone at `now`, or null. */
export function localHour(region: string, now: Date): number | null {
  const tz = REGION_TZ[region]
  if (!tz) return null
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).format(now)
  const h = parseInt(formatted, 10)
  if (!Number.isFinite(h)) return null
  return h === 24 ? 0 : h // some runtimes render midnight as "24"
}

export function isWithinCallingHours(
  region: string,
  now: Date,
  hours: CallingHours = DEFAULT_CALLING_HOURS,
): boolean {
  const h = localHour(region, now)
  if (h === null) return false
  return h >= hours.startHour && h < hours.endHour
}

/** The subset of `regions` currently inside their local calling window. */
export function regionsInCallingHours(
  regions: Iterable<string>,
  now: Date,
  hours: CallingHours = DEFAULT_CALLING_HOURS,
): string[] {
  const out: string[] = []
  for (const r of new Set(regions)) {
    if (isWithinCallingHours(r, now, hours)) out.push(r)
  }
  return out
}
