/**
 * Destination validation test. Run with: tsx lib/demo-call/phone.test.ts
 *
 * Covers: a valid number in several supported regions; an unsupported region; a
 * malformed number; a premium-rate prefix; and a number whose region is spoofed
 * in the request body — all rejected except the valid ones. Region is always
 * derived from the number, never from the claimed region.
 */
import assert from 'node:assert/strict'

import { validateDestination, maskPhone } from './phone'

function run(): void {
  // Valid, one per a few regions — region derived from the number.
  const bd = validateDestination('+8801711000000')
  assert.ok(bd.ok && bd.region === 'BD', 'BD number valid, region derived')
  assert.ok(bd.ok && !bd.masked.includes('1711'), 'masked number hides the middle')
  assert.ok(validateDestination('+6591234567').ok, 'SG number valid')
  assert.ok(validateDestination('+12025550123').ok, 'US number valid')

  // Client claims the correct region → still fine.
  assert.ok(validateDestination('+8801711000000', 'BD').ok, 'matching claimed region passes')

  // Unsupported region (Uzbekistan +998).
  const unsup = validateDestination('+998901234567')
  assert.ok(!unsup.ok && unsup.reason === 'unsupported_region', 'unsupported region rejected')

  // Malformed numbers.
  for (const bad of ['12345', 'not-a-number', '+0123456789', '', '++49123']) {
    const r = validateDestination(bad)
    assert.ok(!r.ok && r.reason === 'malformed', `"${bad}" rejected as malformed`)
  }

  // Premium-rate prefix.
  const prem = validateDestination('+19001234567')
  assert.ok(!prem.ok && prem.reason === 'premium_or_invalid', 'premium prefix rejected')

  // Region spoofed in the request body: BD number, claims US.
  const spoof = validateDestination('+8801711000000', 'US')
  assert.ok(!spoof.ok && spoof.reason === 'region_mismatch', 'region spoof rejected server-side')

  // Masking never reveals the full number.
  assert.ok(!maskPhone('+8801711000000').includes('1711000'), 'mask hides the body')

  console.log('\n✓ destination validation: valid regions pass; malformed / unsupported / premium / spoofed rejected\n')
}

try {
  run()
} catch (err) {
  console.error('FAIL', err)
  process.exitCode = 1
}
