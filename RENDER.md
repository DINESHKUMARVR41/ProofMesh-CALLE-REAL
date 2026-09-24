# Deploy ProofMesh on Render

This deployment file is intentionally minimal: the application code and runtime behavior are unchanged. Only Render configuration and a health endpoint are added.

## 1. Push the repository to GitHub

Keep `.env.local` out of GitHub. Render will receive secrets through its Environment settings.

## 2. In Render

Choose **New + → Blueprint** and select the repository containing this `render.yaml`.

Render will create a Node web service using:

- Build: `npm install && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- Node: 20
- CALL-E mode: `live`

## 3. Add the secret values

Set these in Render's Environment tab:

- `NEXT_PUBLIC_SUPABASE_URL` — if your existing application routes use Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — if your existing application routes use Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `CALLE_API_KEY` — your CALL-E live API key
- `GEMINI_API_KEY` — your Gemini API key

The non-secret defaults are already in `render.yaml`:

- `CALLE_MODE=live`
- `GEMINI_MODEL=gemini-2.5-flash`

## Important

This configuration does **not** switch ProofMesh to mock CALL-E mode. It keeps live CALL-E behavior by setting `CALLE_MODE=live`.

Do not commit `.env.local` or any API key to GitHub.
