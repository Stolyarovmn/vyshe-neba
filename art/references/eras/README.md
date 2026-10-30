# Canonical era visual reference sets

This directory indexes **approved visual reference sets** for the E0–E5 art-direction matrix.

Normative rules remain in `art/docs/ERA_DESIGN_MATRIX.md`, `art/style_bible.txt` and the applicable asset brief/manifest. Reference sheets are visual evidence for materials, mechanisms, interfaces, lighting, infrastructure, service logic and silhouette. Any generated lettering/pseudo-text inside a sheet is **not** authoritative and must not be copied into runtime art.

When an era has an approved reference set:

1. read its `reference-set.json` before generation;
2. use the listed exact raw Drive originals as visual references when the generation tool supports references;
3. bind provenance to the listed SHA-256 values;
4. use all sheets by their declared roles rather than treating one sheet as the whole era;
5. preserve the family-specific gameplay/parts/projection contract from the asset brief and manifest;
6. do not copy a depicted object literally when the new asset has a different function — transfer the era language, not the object identity.

Era reference approval is separate from approval of any production asset. A reference set does not bypass source, projection, QA, exact-SHA candidate, promotion or runtime gates.

Current sets:

- `e0_1978/` — approved; architecture/application correction is being reviewed separately and does not overwrite the immutable original sheets.
- `e1_1986/` — approved; use together with E0 for lineage-aware E1 generation/review; architecture/application correction is being reviewed separately.
- `e2_1998/` — **correction required**. Engineering-content evidence (CRT/racks/diagnostics/test-center specialization) remains useful, but the current sheets fail the common style-family review because they are substantially more photorealistic/render-like than E0/E1. Do not use E2 as a canonical visual-style reference until same-style correction sheets pass exact-SHA and E0→E1→E2 blind-order/style review.
- E3–E5 — pending sequential visual approval.
