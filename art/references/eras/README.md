# Canonical era visual reference sets

This directory indexes the **single canonical visual reference set** for each E0–E5 era.

Normative rules:

- `art/docs/ERA_DESIGN_MATRIX.md` — era visual/engineering language;
- `art/docs/ERA_REFERENCE_CONTRACT.md` — mandatory atomic reference-set structure;
- `art/style_bible.txt` — common rendering language;
- applicable asset brief/manifest — gameplay role, parts, projection and object lineage.

Era references are a reusable visual-engineering vocabulary, not whole-object concept art. The canonical set for each era contains exactly four atomic **roles**:

1. `materials-construction`
2. `mechanics-infrastructure`
3. `controls-displays`
4. `lighting-signals`

Each role may contain **multiple exact-SHA sheet-parts** when needed to keep atomic specimens large and readable. These sheet-parts belong to the same role and the same canonical set; they are not versions or alternative reference schemes. Default density is at most 8 specimens per sheet-part, with fewer allowed for more complex hardware.

Whole buildings, vehicles, radars, cranes, launch complexes, base scenes and `applications` boards are forbidden as canonical era references. Architecture/silhouette language is shown through construction fragments, joints, facade/panel connections, structural profiles and service details rather than complete buildings.

When an era has an approved reference set:

1. read its `reference-set.json` before generation;
2. use all applicable atomic sheet-parts by their declared roles;
3. bind provenance to each listed SHA-256/Drive original;
4. preserve the family-specific gameplay/parts/projection contract from the asset brief and manifest;
5. transfer materials, construction, mechanisms, infrastructure, controls and lighting language only — never copy a depicted whole object.

Generated lettering/pseudo-text is non-authoritative. Dynamic screen data, active glow, motion and temporary FX remain code-owned.

Era reference approval is separate from approval of any production asset and does not bypass source, projection, QA, exact-SHA candidate, promotion or runtime gates.

## Current sets

- `e0_1978/` — **rebuild required** under the atomic-only multi-sheet role contract; previous matrix/elements/applications are not canonical evidence.
- `e1_1986/` — **rebuild required** under the atomic-only multi-sheet role contract; previous matrix/elements/applications are not canonical evidence.
- `e2_1998/` — **rebuild required** under the atomic-only multi-sheet role contract; previous broad boards and style-correction attempts are not canonical evidence.
- E3–E5 — pending; must be created directly in the atomic-only format after E0–E2 are approved.

Cross-era blind-order review compares matching complete role sets (`materials` to `materials`, `mechanics` to `mechanics`, etc.), using all approved sheet-parts of the role and never complete architecture/application scenes.
