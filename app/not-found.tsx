import Link from 'next/link'

export default function NotFound() {
  return <main className="min-h-screen bg-mist text-ink grid place-items-center px-6">
    <div className="max-w-md text-center">
      <div className="font-display text-2xl font-semibold">Proof<span className="text-pulse">Mesh</span></div>
      <div className="mt-10 font-mono text-[11px] uppercase tracking-[.16em] text-pulse">404 · Evidence not found</div>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">This page doesn&apos;t exist.</h1>
      <p className="mt-4 text-ink/60 leading-7">Return to the evidence workspace and start a new verification case.</p>
      <Link href="/" className="mt-7 inline-flex rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pulse">Open ProofMesh →</Link>
    </div>
  </main>
}
