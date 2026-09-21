// Brand-token verification page. Originally the app root (task 1); moved here so
// judges land on /invoices instead of a palette dump. Kept because it's a useful
// at-a-glance check that all four colours and three typefaces are wired correctly.
const brandColors = [
  {
    name: 'ink',
    hex: '#0A0A0B',
    cssVar: '--ink',
    bgClass: 'bg-ink',
    textClass: 'text-mist',
    usage: 'Primary text, backgrounds',
  },
  {
    name: 'pulse',
    hex: '#5C4BFF',
    cssVar: '--pulse',
    bgClass: 'bg-pulse',
    textClass: 'text-mist',
    usage: 'Primary CTA, interactive elements',
  },
  {
    name: 'glow',
    hex: '#C9FF3B',
    cssVar: '--glow',
    bgClass: 'bg-glow',
    textClass: 'text-ink',
    usage: 'Signal accent — max 8% of surface',
  },
  {
    name: 'mist',
    hex: '#F5F4F0',
    cssVar: '--mist',
    bgClass: 'bg-mist',
    textClass: 'text-ink',
    usage: 'Page background, card surfaces',
    border: true,
  },
]

const typefaces = [
  {
    name: 'Space Grotesk',
    token: '--font-display',
    twClass: 'font-display',
    role: 'Display',
    sample: 'Invoice Recovery',
    detail: 'var(--font-display)',
  },
  {
    name: 'Geist',
    token: '--font-body',
    twClass: 'font-body',
    role: 'Body',
    sample: 'Payment arrangement accepted.',
    detail: 'var(--font-body)',
  },
  {
    name: 'Geist Mono',
    token: '--font-mono',
    twClass: 'font-mono',
    role: 'Mono',
    sample: 'CALL-E · INV-2026-0042',
    detail: 'var(--font-mono)',
  },
]

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-mist p-8 md:p-16">
      <header className="mb-16 max-w-2xl">
        <p className="font-mono text-xs tracking-widest text-pulse uppercase mb-3">
          CALL-E · Brand Tokens
        </p>
        <h1 className="font-display text-5xl font-bold text-ink leading-tight mb-4">
          Design System
        </h1>
        <p className="font-body text-base text-ink/60">
          Palette and typeface verification. All four brand colours and all three
          typefaces must be visible to confirm correct wiring.
        </p>
      </header>

      {/* Colour Palette */}
      <section className="mb-16">
        <h2 className="font-display text-2xl font-semibold text-ink mb-2">
          Colour Palette
        </h2>
        <p className="font-body text-sm text-ink/50 mb-6">
          Four tokens — two dark, one signal, one light.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {brandColors.map((color) => (
            <div
              key={color.name}
              className={`rounded-card overflow-hidden ${color.border ? 'ring-1 ring-ink/10' : ''}`}
            >
              <div className={`${color.bgClass} h-32`} />
              <div className="bg-white px-4 py-3 border-t border-ink/5">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-display text-sm font-semibold text-ink capitalize">
                    {color.name}
                  </span>
                  <span className="font-mono text-xs text-ink/40">{color.hex}</span>
                </div>
                <p className="font-mono text-xs text-pulse mb-1">{color.cssVar}</p>
                <p className="font-body text-xs text-ink/50">{color.usage}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typefaces */}
      <section className="mb-16">
        <h2 className="font-display text-2xl font-semibold text-ink mb-2">
          Typefaces
        </h2>
        <p className="font-body text-sm text-ink/50 mb-6">
          Three fonts — display, body, mono — loaded via Next.js font optimisation.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {typefaces.map((face) => (
            <div
              key={face.name}
              className="rounded-card bg-white ring-1 ring-ink/5 px-6 py-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="font-mono text-xs text-pulse bg-pulse/5 px-2 py-0.5 rounded-input">
                  {face.role}
                </span>
              </div>
              <p
                className={`${face.twClass} text-2xl font-semibold text-ink mb-4 leading-snug`}
              >
                {face.sample}
              </p>
              <div className="border-t border-ink/5 pt-3 space-y-1">
                <p className="font-mono text-xs text-ink/40">{face.name}</p>
                <p className="font-mono text-xs text-pulse">{face.token}</p>
                <p className="font-mono text-xs text-ink/30">{face.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Scale sample */}
      <section>
        <h2 className="font-display text-2xl font-semibold text-ink mb-6">
          Combined sample
        </h2>
        <div className="rounded-card bg-ink p-8 max-w-xl">
          <p className="font-mono text-xs tracking-widest text-glow uppercase mb-3">
            INV-2026-0042 · Overdue 45 days
          </p>
          <h3 className="font-display text-3xl font-bold text-mist mb-2">
            Arif Hossain
          </h3>
          <p className="font-body text-mist/60 mb-6">
            Outstanding balance: BDT 85,000 — Web development project,
            milestone 3 of 4.
          </p>
          <button className="font-body text-sm font-medium bg-pulse text-mist px-6 py-2.5 rounded-pill">
            Draft recovery call
          </button>
        </div>
      </section>
    </main>
  )
}
