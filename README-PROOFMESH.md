# ProofMesh + CALL-E

Evidence-backed verification for business documents.

## Quick start

```powershell
npm install -g pnpm
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Test immediately
Upload all three files from `sample-evidence/`:
- purchase-order-PO-1042.txt
- invoice-INV-8831.txt
- delivery-note-DN-771.txt

The system will extract the quantities and raise a real quantity inconsistency: 400 vs 500 vs 350.

## Enable AI extraction
Set `GEMINI_API_KEY` in `.env.local`. Gemini is used for structured claim extraction and image-document transcription. The deterministic extractor remains the fallback.

## Enable live phone investigation
Set `CALLE_API_KEY` in `.env.local`. ProofMesh sends the unresolved finding as a goal-driven CALL-E task only after the user clicks the human approval button.

## Evidence safety
CALL-E statements are recorded as supplier claims. They are not automatically treated as verified evidence. A supporting document or independent source must be checked before a reviewer resolves the finding.
