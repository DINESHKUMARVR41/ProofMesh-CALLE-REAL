# ProofMesh — real pipeline setup

This build replaces the static case demo with a real local evidence pipeline.

## What is real
- PDF text extraction with `pdf-parse`
- DOCX text extraction with `mammoth`
- SHA-256 fingerprinting
- local case persistence under `data/proofmesh`
- claim extraction from uploaded evidence
- optional Gemini claim extraction / image OCR
- evidence graph generated from uploaded evidence
- deterministic quantity/entity/missing-evidence checks
- human approval before investigation
- live CALL-E API integration when `CALLE_API_KEY` is present
- polling of the live CALL-E task and structured supplier claim

## Environment
Copy `.env.example` to `.env.local` and add:

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
CALLE_API_KEY=your_key
```

If `GEMINI_API_KEY` is missing, the system still works for text PDFs/DOCX/TXT using deterministic extraction.
If `CALLE_API_KEY` is missing, the investigation screen remains usable but does not place a phone call.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Recommended judge flow
1. Upload a purchase order, invoice and delivery note.
2. Use synthetic values such as PO 400, invoice 500, delivery 350.
3. Watch the live extraction/graph UI.
4. Open the quantity inconsistency finding.
5. Enter a supplier number.
6. Review the question and click **Approve & investigate with CALL-E**.
7. CALL-E returns a supplier statement as an unverified claim.
8. Request/upload the supporting evidence and re-run the case to verify it.

## Important evidence rule
A phone statement is not automatically verified evidence. ProofMesh records it as a claim and requires supporting documentary/independent evidence before a reviewer can treat the discrepancy as resolved.

## Current scope
The MVP supports text-based PDF/DOCX/TXT/CSV/JSON/MD evidence and Gemini-assisted image extraction. Production OCR, object storage, multi-user authentication, PostgreSQL, webhook hardening and a full document viewer are the next deployment hardening steps.
