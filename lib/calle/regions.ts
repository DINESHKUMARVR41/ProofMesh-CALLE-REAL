// Canonical CALL-E region data: the supported recipient regions, the E.164
// country-code → region derivation, and display names. Region is always derived
// from the number, never trusted from client input.

/** CALL-E supported recipient regions (BD = Bangladesh, English only). */
export const SUPPORTED_REGIONS = [
  'US', 'SG', 'MY', 'IN', 'AE', 'AU', 'CA', 'GB', 'VN',
  'DE', 'JP', 'FR', 'MX', 'BR', 'ID', 'PH', 'KE', 'BD',
] as const

export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number]

const SUPPORTED = new Set<string>(SUPPORTED_REGIONS)

export function isSupportedRegion(region: string): region is SupportedRegion {
  return SUPPORTED.has(region)
}

// E.164 country-code → region, longest prefix first so +880 wins over +88, etc.
// +1 is shared by US and CA; we cannot tell them apart from the code alone, so we
// report US — both are supported and CALL-E routes by the number regardless.
const PREFIX_TO_REGION: Array<[string, string]> = [
  ['+971', 'AE'], ['+880', 'BD'], ['+254', 'KE'],
  ['+65', 'SG'], ['+91', 'IN'], ['+60', 'MY'], ['+84', 'VN'], ['+49', 'DE'],
  ['+81', 'JP'], ['+33', 'FR'], ['+52', 'MX'], ['+55', 'BR'], ['+62', 'ID'],
  ['+63', 'PH'], ['+44', 'GB'], ['+61', 'AU'], ['+1', 'US'],
]

/** Derive the CALL-E region from an E.164 number, or null if unsupported. */
export function regionForE164(phone: string): SupportedRegion | null {
  for (const [prefix, region] of PREFIX_TO_REGION) {
    if (phone.startsWith(prefix)) return region as SupportedRegion
  }
  return null
}

const REGION_NAMES: Record<string, string> = {
  BD: 'Bangladesh', SG: 'Singapore', US: 'the United States', CA: 'Canada',
  GB: 'the United Kingdom', AU: 'Australia', IN: 'India', MY: 'Malaysia',
  AE: 'the United Arab Emirates', VN: 'Vietnam', DE: 'Germany', JP: 'Japan',
  FR: 'France', MX: 'Mexico', BR: 'Brazil', ID: 'Indonesia', PH: 'the Philippines',
  KE: 'Kenya',
}

export function regionName(region: string): string {
  return REGION_NAMES[region] ?? region
}
