---
name: vyshe-neba-production-guard
description: Deterministic production guard for «Выше неба». Use for every production image generation/review to turn allowlists, forbidden features, era-transition rules, exact-source provenance and review gates into machine-checkable data before any asset can be called accepted.
---

# Vyshe Neba Production Guard

This skill is a project-specific guard layered on top of the canonical `ref2game` workflow and the repository production contracts. It does **not** replace `ref2game`, visual judgement, Google Drive provenance, exact-SHA approval, processing QA, scene QA, promotion or runtime publication.

Its purpose is to remove avoidable production mistakes by making the generation contract data-first and fail-closed.

## Sources of truth

Before use, follow `AGENTS.md` and read the current mandatory production documents at the pinned `game-production` SHA. Branch/storage/publication semantics remain governed by `art/docs/RUNTIME_BRANCH_CONTRACT.md`; era language by `art/docs/ERA_DESIGN_MATRIX.md`; era-reference shape by `art/docs/ERA_REFERENCE_CONTRACT.md`; style by `art/style_bible.txt`; gameplay identity/parts by `art/placeables/PRODUCTION_MANIFEST.md`.

This guard never promotes an inference above those sources.

## Core rule

For an era-reference sheet, the JSON spec under `art/reference_specs/<era>/` is the machine source of truth for:

- era/year and exactly one canonical role;
- planned dimensions and layout;
- explicit specimen allowlist (maximum 8 by default);
- explicit global forbidden list;
- required era signals;
- previous-era language that must be replaced;
- previous-era regressions that must not return;
- presentation gates such as no labels, scenery, cast shadow or baked FX;
- Drive archive destination.

The `.md` prompt is generated from that spec. Do not hand-edit the prompt and then leave the spec stale.

## Required flow

### 1. Pin and recover

1. Pin exact `game-production` and `main` SHA.
2. Read the canonical docs and current `main:game/src/render/manifest.js` required by `AGENTS.md`.
3. Recover the relevant tracker/reference-set checkpoint before creating anything new.
4. Never regenerate an exact-SHA success without a recorded invalidation reason.

### 2. Validate the spec before imagegen

```bash
python3 tools/art_pipeline/production_guard.py validate-spec \
  art/reference_specs/<era>/<role>-<sheet>.json
```

Any error is `BLOCKED`. Do not compensate by rewriting the request manually.

For the complete repository guard:

```bash
python3 tools/art_pipeline/production_guard.py validate-tree
```

This also rejects prompt/spec drift.

### 3. Build the actual request deterministically

```bash
python3 tools/art_pipeline/production_guard.py build-request \
  art/reference_specs/<era>/<role>-<sheet>.json \
  --output /tmp/generation-request.txt
```

Use that request unchanged for the image-generation call. The builder appends `art/style_bible.txt` verbatim exactly once.

One call = one sheet-part, one role, one era. Never merge roles, eras or alternatives into one call.

### 4. Preserve exact bytes before destructive work

Immediately after every attempt, including a rejection:

1. keep the untouched returned PNG;
2. verify exact dimensions/byte count/SHA-256 against the spec:

```bash
python3 tools/art_pipeline/production_guard.py verify-source \
  <spec.json> <untouched.png> --output /tmp/source.json
```

3. upload the untouched exact bytes to the verified Google Drive folder;
4. if the source is rejected, move it to `_rejected` without changing bytes;
5. do not crop, resize, recolor, quantize or run Pixel Snapper before archival/provenance.

A dimension mismatch is a technical source failure even if the image looks good.

### 5. Create a structured visual review

After Drive upload:

```bash
python3 tools/art_pipeline/production_guard.py init-review \
  <spec.json> <untouched.png> \
  --generation-id <id> \
  --drive-file-id <id> \
  --drive-url <url> \
  --output /tmp/source-review.json
```

The reviewer must explicitly inspect and set every gate and every specimen verdict. Required visual gates include:

- atomic scope only;
- exact requested specimen count;
- no unlisted specimen class;
- style-family match;
- era-language match;
- readability;
- no text/pseudo-text;
- no baked cast shadow/FX;
- no regression into the previous era.

Every listed specimen receives its own `pass | fail | pending` verdict.

### 6. Fail closed

```bash
python3 tools/art_pipeline/production_guard.py validate-review \
  <spec.json> /tmp/source-review.json --image <untouched.png>
```

Approval is impossible while **any** gate/specimen is `fail` or `pending`, while the exact SHA/dimensions differ, or while Drive provenance is missing.

If rejected, record concrete rejection reasons and stop before destructive processing. A source-era/scope/composition defect is never repaired downstream by Pixel Snapper, normalization or Aseprite.

### 7. Continue through the canonical pipeline only after source PASS

For placeables, resume the existing canonical pipeline and tracker. For world sprites, keep the separate ref2game route. This skill does not alter those flows.

## What the guard can and cannot prove

Deterministic code can prove schema consistency, allowlist size, prompt construction, exact style-bible embedding, PNG dimensions, SHA-256, byte count, provenance fields and that all required review fields were explicitly closed.

It cannot reliably infer semantic visual facts such as “this object reads more like E0 than E1” from pixels without a vision reviewer. Those checks remain mandatory, but the guard makes them impossible to omit silently.

Never describe the system as literally error-free. The guarantee is **fail-closed process coverage**, not perfect visual perception.

## Change control

- Guard/tooling changes go through a separate branch/PR to `game-production`.
- Do not direct-push or auto-merge.
- Do not mix runtime changes into a guard/tooling PR.
- Add a regression test whenever a production defect class is found that can be represented deterministically.
- If a defect is visual/semantic, add or tighten a required structured review gate/specimen constraint rather than pretending it is automatically detectable.
