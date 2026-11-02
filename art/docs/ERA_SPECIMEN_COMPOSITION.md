# Atomic specimen generation and deterministic sheet composition

Status: proposed gated migration for blocked era-reference sheets. This is a generation METHOD for the existing canonical sheet spec, not a second reference set, alternate specimen list, or v2. ERA_REFERENCE_CONTRACT.md remains authoritative.

## Trigger and scope

Issue #90 records repeated wrong-class E2 generation. With the user's explicit approval, the four invalidated E2/1998 sheets may use one isolated atomic specimen per imagegen call, then code composes eight reviewed specimens into the same 1536×1024 4×2 canonical sheet. Initially targeted: materials-construction/02-joints-repairs, mechanics-infrastructure/01-servo-drives, controls-displays/02-instruments-displays, lighting-signals/02-signal-hardware. No rerender of unaffected approved E0/E1 or other E2 sheets. The default one-call-one-sheet method remains valid elsewhere. A source failure alone does not silently enable this exception for any other sheet.

One imagegen call generates EXACTLY ONE allowed specimen ID of ONE role and ONE era. Never make a broad 8-part imagegen call under this mode; never accept whole gameplay objects, whole scenes, controls masquerading as joints, or mixed roles. Composite is a DERIVED artifact, never an untouched imagegen original. Existing source descriptions, IDs, order and role in the single machine spec remain unchanged.

## Per-specimen preflight and archive

1. Pin real production/runtime SHA; read AGENTS, ref2game, style bible, era matrix, approved E1 lineage, tracker, selected E2 spec and all applicable contracts. Run existing production_guard validate-spec/validate-tree and E2 uniqueness audit. Do not rely on old accepted/rejected raws under a modified spec.
2. Build a deterministic SINGLE-specimen request from the existing sheet JSON and the ONE selected specimen description, all global exclusions and era signals. Explicitly exclude the other seven specimens. Append art/style_bible.txt VERBATIM exactly once. Verify request SHA and full literal chat-bridge before generation; a short semantic summary is NOT a production request. If the actual imagegen interface cannot deliver a full request, generation is BLOCKED.
3. New input control, not a claim about old sheets: 1024×1024 isolated full physical specimen, true RGBA transparency, uncropped, no baked glow/shadow, labels, scenery or other items.
4. For EACH generated PNG: preserve exact original bytes, compute SHA-256/byte size/dimensions, upload untouched to verified E2 Google Drive before any crop/resize/normalization, record generation ID, request SHA, tool and archive ID/URL. Rejected raws go to _rejected; no overwrites.
5. Each source has its own exact-SHA technical gate and explicit human visual review with reviewer identity and notes: correct ID/class, construction, E1→E2 technology, style, role, no text/FX, full alpha silhouette. Any pending/fail or missing provenance BLOCKS composition. No automatic background removal to repair a failed source.
6. Production attempts follow EXECUTION_TIMEOUT_POLICY: maximum 2 generation retries PER single specimen per interactive turn, 20-minute deadline, checkpoint after each source.

## Deterministic composition contract

After EXACTLY EIGHT distinct source originals (IDs 01..08) pass:
- Run tools/art_pipeline/compose_era_reference_sheet.py with existing canonical sheet JSON, an eight-entry source manifest and a directory of archived originals. The manifest must bind exact sheet-spec SHA, per-ID generation ID, raw PNG byte SHA, Drive file ID/URL, deterministic per-ID request digest and visual PASS reviewer.
- Fail closed on missing/duplicate ID or source SHA, incorrect dimensions or RGBA transparency, any object touching source image borders, missing provenance, non-PASS per-ID review, wrong request digest or spec SHA. Never silently accept an already-rejected raw file or overwrite immutable inputs.
- Assemble 1536×1024 in exact ID order, 4 columns × 2 rows, cells 384×512 with fixed 32px interior padding, single neutral #F2F0F2 background. Use alpha bbox after raw archival; proportionally scale with pinned deterministic NEAREST resampling and center each specimen; never stretch, repaint or relabel. Record crop bbox, scaled size and cell placement, Pillow/Python versions, tool SHA, input and output SHA-256.
- Composite is a derived immutable CANDIDATE with its own output SHA, not an imagegen original. Run entire sheet-level structured visual review on that exact output: 8 correct atomic identities, no clipping/overlap/mixed roles, era/style QA, E1↔E2 blind order, and independent source/provenance checks. A machine compositor proves pixels/layout only; semantic acceptance remains visual.
- Keep existing single canonical E2 reference-set manifest and prior raw originals. Only after all exact-SHA gates PASS may a reviewed production PR update its sheet approval. No direct runtime/main change.

## Migration and rollback

A. Review this docs-only PR, and separately implement the composer, deterministic single-source request/bridge and negative tests in a tooling/CI PR. Neither auto-merges. Before first generation, both must be merged and tested together on exact resulting game-production SHA. ChatGPT Project settings must be manually updated by the user from art/docs/GAMES_PROJECT_INSTRUCTIONS.md; GitHub file edits do NOT change active user settings.
B. Start with one specimen of E2 materials-construction/02. Upload/review its raw original. Resume remaining IDs from SHA-bound checkpoint. Only then build a new composed sheet. Subsequently cover E2 mechanics/01, controls/02 and lighting/02; no blanket approval.
C. Rollback docs and tooling by Git revert. Originals remain archived and immutable; rejected or derived candidates are never promoted or relabeled as direct imagegen sources. Default 8-in-one sheet route continues for approved E0/E1 and unaffected sheets.

BLOCKED until BOTH PRs merge, exact combined CI passes, a real literal request or exact chat-bridge can be verified, Drive destination exists, and per-element source/review gates are satisfied.
