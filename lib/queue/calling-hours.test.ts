/**
 * Calling-hours test. Run with: tsx lib/queue/calling-hours.test.ts
 *
 * Uses fixed-offset, no-DST zones (BD = UTC+6, SG = UTC+8) plus America/New_York
 * (EDT = UTC-4 in August) so the assertions are deterministic for the chosen dates.
 */
import assert from 'node:assert/strict'

import {
  DEFAULT_CALLING_HOURS,
  isWithinCallingHours,
  localHour,
  regionsInCallingHours,
} from './calling-hours'

function run(): void {
  // 06:00 UTC → BD 12:00, SG 14:00 (both inside 10–18); NY 02:00 (outside)
  const midday = new Date('2026-08-04T06:00:00Z')
  assert.equal(localHour('BD', midday), 12, 'BD is UTC+6')
  assert.equal(localHour('SG', midday), 14, 'SG is UTC+8')
  assert.equal(localHour('US', midday), 2, 'US(NY) is UTC-4 in August (EDT)')
  assert.equal(localHour('ZZ', midday), null, 'unknown region → null')

  assert.ok(isWithinCallingHours('BD', midday), 'BD 12:00 is within hours')
  assert.ok(!isWithinCallingHours('US', midday), 'US 02:00 is outside hours')

  const allowed = regionsInCallingHours(['BD', 'SG', 'US'], midday)
  assert.deepEqual(allowed.sort(), ['BD', 'SG'], 'only in-hours regions returned')

  // 20:00 UTC → BD 02:00 (outside)
  const night = new Date('2026-08-04T20:00:00Z')
  assert.ok(!isWithinCallingHours('BD', night), 'BD 02:00 is outside hours')
  assert.deepEqual(regionsInCallingHours(['BD'], night), [], 'nothing in-hours at BD night')

  // Custom all-day window includes everything for a known region.
  assert.ok(isWithinCallingHours('BD', night, { startHour: 0, endHour: 24 }), 'all-day window always in')

  // Default window is 10–18.
  assert.equal(DEFAULT_CALLING_HOURS.startHour, 10)
  assert.equal(DEFAULT_CALLING_HOURS.endHour, 18)

  console.log('\n✓ calling-hours: local hour per region correct; only in-hours regions dial; window configurable\n')
}

try {
  run()
} catch (err) {
  console.error('FAIL', err)
  process.exitCode = 1
}
