// Shared guard for the cron route handlers (sweep + dialer). Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET` on every scheduled invocation when CRON_SECRET
// is set on the project. We fail CLOSED: if CRON_SECRET is unset, every request is
// rejected — a cron route must never be publicly triggerable (it drafts/dials calls
// and spends budget). This is the sole trust boundary for those routes.

export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed — no secret configured means no access
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

/** 401 JSON response for an unauthorized cron request. */
export function cronUnauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}
