# ProofMesh

## Decision-Aware Evidence Intelligence

> **Don't just trust information. Trace the evidence behind the decision.**

ProofMesh turns fragmented business documents into a traceable evidence network, detects contradictions with deterministic rules, and helps a human investigate unresolved questions through a human-approved CALL-E phone call.

### The core loop

```text
Documents
   ↓
Claims
   ↓
Evidence Graph
   ↓
Deterministic Verification
   ↓
Finding
   ↓
Human Review
   ↓
CALL-E Investigation
   ↓
Supplier Statement (UNVERIFIED)
   ↓
Supporting Evidence
   ↓
Re-verification
   ↓
Human Decision
```

### What makes ProofMesh different

- **Evidence-first:** every extracted claim stays linked to its source document.
- **Deterministic verification:** contradictions are checked by explicit rules rather than asking an LLM to decide whether something is true.
- **Trust boundaries:** a supplier statement from a phone call is recorded as an unverified claim until supporting evidence is checked.
- **Human approval:** a real CALL-E investigation is never silently triggered by the verification engine.
- **Provenance:** uploaded files receive SHA-256 fingerprints so the exact uploaded bytes can be identified later.

### Example

A procurement team receives:

| Evidence | Quantity |
|---|---:|
| Purchase Order | 400 |
| Invoice | 500 |
| Delivery Note | 350 |

ProofMesh does not label the supplier as fraudulent. It explains the relationships:

- Invoice vs PO: **+100 units**
- Delivery vs PO: **−50 units**
- Invoice vs Delivery: **+150 units**

It then identifies the evidence needed to resolve the discrepancy. If the documents cannot answer the question, a human can approve a CALL-E investigation. The resulting supplier statement remains explicitly **unverified** until documentary evidence is uploaded and the case is re-verified.

## Product architecture

- `components/proofmesh-dashboard.tsx` — standalone ProofMesh intake experience
- `components/proof-case-client.tsx` — evidence review workspace
- `lib/proofmesh/extract.ts` — document extraction and provenance hashing
- `lib/proofmesh/gemini.ts` — optional AI-assisted claim extraction
- `lib/proofmesh/engine.ts` — evidence graph + deterministic verification
- `lib/proofmesh/store.ts` — local case persistence
- `app/api/proofmesh/*` — ProofMesh APIs
- `lib/calle/*` — CALL-E integration capability

CALL-E is an investigation capability inside ProofMesh. The older invoice-recovery application remains in the repository for compatibility, but it is not part of the ProofMesh user journey.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### Environment

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
CALLE_API_KEY=your_key
```

Gemini is optional for text extraction because ProofMesh has a deterministic extraction fallback. CALL-E is optional unless you want to place a real investigation call.

## Demo flow

1. Upload the sample purchase order, invoice and delivery note.
2. Review extracted claims and provenance.
3. Inspect the quantity findings.
4. Approve a human-gated CALL-E investigation.
5. Review the supplier statement as **unverified**.
6. Upload supporting evidence such as an approved PO amendment.
7. Re-run verification.
8. Record the human resolution/rejection with a reason.

## Trust model

ProofMesh deliberately separates:

**Evidence → Claim → Verification → Investigation → Supporting Evidence → Human Decision**

A phone statement is not documentary proof. An AI extraction is not automatically a verified fact. The verification engine is the authority for deterministic cross-document checks, while humans retain the final decision.

## Scope

ProofMesh is a hackathon-scale prototype. It currently uses local JSON persistence and is designed for a focused evidence-review workflow rather than enterprise multi-tenancy.
