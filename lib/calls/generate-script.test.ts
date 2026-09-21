/**
 * Script generator test. Run with: tsx lib/calls/generate-script.test.ts
 *
 * Every generated script must open with the automated-call disclosure, and that
 * disclosure must come before the invoice/amount is mentioned.
 */
import assert from 'node:assert/strict'

import { generateCallScript, AUTOMATED_DISCLOSURE } from './generate-script'

function run(): void {
  const invoice = { clientName: 'Test Client', amount: 4500, currency: 'USD', dueDays: 45 }

  for (const region of ['BD', 'SG', 'US']) {
    const script = generateCallScript(invoice, region)
    const lower = script.toLowerCase()

    assert.ok(script.includes(AUTOMATED_DISCLOSURE), `${region}: contains the disclosure verbatim`)

    const discIdx = lower.indexOf('automated call')
    const amountIdx = script.indexOf('4500.00')
    assert.ok(discIdx >= 0, `${region}: "automated call" present`)
    assert.ok(amountIdx >= 0, `${region}: amount present`)
    assert.ok(discIdx < amountIdx, `${region}: disclosure comes before the invoice amount`)

    // The first spoken open line carries the disclosure.
    const openLine = script.split('\n').find((l) => l.trim().startsWith('1. Open')) ?? ''
    assert.ok(openLine.includes(AUTOMATED_DISCLOSURE), `${region}: spoken open line discloses automated`)
  }

  console.log('\n✓ script disclosure: every script opens with the automated-call disclosure before the invoice\n')
}

try {
  run()
} catch (err) {
  console.error('FAIL', err)
  process.exitCode = 1
}
