# ProofMesh update

Implemented the standalone-product pass:

- ProofMesh is now the primary README/product identity.
- Browser metadata now uses ProofMesh branding.
- 404 page no longer routes users into the invoice-recovery product.
- Quantity verification now reports PO↔Invoice, PO↔Delivery, and Invoice↔Delivery relationships separately.
- Purchase-order amendment documents can support an invoice quantity during re-verification.
- Claims now carry extraction provenance (`AI`, `RULE`, or `CALL-E`).
- Supplier phone statements are converted into explicit low-confidence, unverified claims.
- Added supporting-evidence upload and re-verification APIs.
- Added human resolution/rejection API with a documentary-evidence gate for `resolved`.
- Added duplicate active-investigation protection.
- Added animated ProofMesh landing page and animated case workspace.
- Added clearer trust boundaries, status pills, provenance explanations, recommended actions, and investigation states.
- Added reduced-motion CSS support.

The older invoice-recovery application files remain intact, but ProofMesh no longer exposes that application through its primary branding or 404 experience.
