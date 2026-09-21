import Link from 'next/link'

// Global 404 for any path outside /invoices — matches the invoice not-found state
// (editorial, no card, fictional-data footer note) so bad paths don't fall through
// to the default Next.js 404.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-mist flex flex-col">
      <div className="w-full max-w-[820px] mx-auto px-8 md:px-16 py-12 md:py-16 flex-1 flex flex-col">
        <div className="flex-1">
          <Link
            href="/invoices"
            className="inline-block font-mono text-xs uppercase tracking-[0.1em] text-ink/60 hover:text-pulse transition-colors mb-8"
          >
            ← Invoices
          </Link>
          <div className="max-w-md py-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60 mb-4">
              Not found
            </p>
            <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-2">
              Page not found
            </p>
            <p className="font-body text-base text-ink/60 mb-6">
              This page does not exist. The recovery tracker lives at{' '}
              <Link href="/invoices" className="text-pulse hover:underline">
                /invoices
              </Link>
              .
            </p>
            <Link
              href="/invoices"
              className="font-body text-sm font-medium bg-pulse text-mist px-5 py-2.5 rounded-pill inline-block hover:bg-pulse/90 transition-colors"
            >
              Go to invoices
            </Link>
          </div>
        </div>
        <footer className="mt-16 pt-6 border-t border-ink/[0.08]">
          <p className="font-mono text-[11px] leading-5 tracking-[0.04em] text-ink/60">
            This instance uses fictional demonstration data only. No real client
            information is stored here.
          </p>
        </footer>
      </div>
    </main>
  )
}
