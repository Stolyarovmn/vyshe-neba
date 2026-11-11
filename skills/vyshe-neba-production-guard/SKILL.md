---
name: vyshe-neba-production-guard
description: Deterministic fail-closed production guard for «Выше неба». Use for every production image generation/review to turn allowlists, forbidden features, era-transition rules, explicit imagegen-context delivery, exact-source provenance and review gates into machine-checkable data before any asset can be called accepted.
---

# Vyshe Neba Production Guard

This skill is a project-specific guard layered on top of the canonical `ref2game` workflow and the repository production contracts. It does **not** replace `ref2game`, visual judgement, Google Drive provenance, exact-SHA approval, processing QA, scene QA, promotion or runtime publication.

Its purpose is to remove avoidable production mistakes by making the generation contract data-first and fail-closed.

## Sources of truth

Перед использованием прочитать `AGENTS.md` и обязательные производственные документы на закреплённом SHA `game-production`. Ветки и публикацию определяет `art/docs/RUNTIME_BRANCH_CONTRACT.md`; язык эпох — `art/docs/ERA_DESIGN_MATRIX.md`; формат справочных листов — `art/docs/ERA_REFERENCE_CONTRACT.md`; стиль — `art/style_bible.txt`; роли и эффекты — `main:game/src/data/buildings.js` и `main:game/docs/DESIGN.md` §4.4; части — паспорт объекта; идеи, rig и родословные — `art/placeables/IDEA_BANK_PLACEABLES.md`.

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

### 3. Build the canonical request deterministically

```bash
python3 tools/art_pipeline/production_guard.py build-request \
  art/reference_specs/<era>/<role>-<sheet>.json \
  --output /tmp/generation-request.txt
```

The builder appends `art/style_bible.txt` verbatim exactly once.

One call = one sheet-part, one role, one era. Never merge roles, eras or alternatives into one call.

### 4. Deliver the full request to conversational imagegen

A deterministic request file is not enough when the current image-generation surface does **not** accept that file/string as a literal prompt argument and instead infers instructions from conversational context. In that runtime, the guard must create an explicit context bridge:

```bash
python3 tools/art_pipeline/imagegen_chat_bridge.py build-chat-block \
  art/reference_specs/<era>/<role>-<sheet>.json \
  --output /tmp/imagegen-chat-block.txt

python3 tools/art_pipeline/imagegen_chat_bridge.py verify-chat-block \
  art/reference_specs/<era>/<role>-<sheet>.json \
  /tmp/imagegen-chat-block.txt
```

`verify-chat-block` must PASS before imagegen.

Then:

1. place the **exact complete contents** of `/tmp/imagegen-chat-block.txt` in the assistant message immediately before the image-generation tool call;
2. make the image-generation tool call as the next action;
3. insert **no additional natural-language instruction** between the block and the tool call;
4. never replace the block with shorthand such as `делай следующий набор`, `same as above`, `use the spec`, `continue`, or a summary of the requested specimens;
5. never manually rewrite, reorder, shorten or translate individual specimens/exclusions in the bridge block.

If the runtime accepts a real literal prompt argument, use the canonical `build-request` output unchanged through that argument instead. Do not use both delivery modes in a way that creates competing prompt text.

If neither literal prompt delivery nor the exact explicit chat block can be used, image generation is `BLOCKED`; do not guess that the generator received the canonical request.

This bridge makes request delivery auditable and closes the observed “short command loses item-level constraints” defect class. It does **not** guarantee that the image generator will obey every instruction; semantic visual review remains mandatory.

### 5. Preserve exact bytes before destructive work

Immediately after every attempt, including a rejection:

1. keep the untouched returned PNG;
2. verify actual dimensions versus the planned spec size (E0–E5 era-reference sheets alone permit ±1 px per axis), original byte count and exact SHA-256:

```bash
python3 tools/art_pipeline/production_guard.py verify-source \
  <spec.json> <untouched.png> --output /tmp/source.json
```

3. upload the untouched exact bytes to the verified Google Drive folder;
4. if the source is rejected, move it to `_rejected` without changing bytes;
5. do not crop, resize, recolor, quantize or run Pixel Snapper before archival/provenance.

For E0–E5 era-reference sheets only, source width and height may each differ from the planned value by at most 1 pixel; the guard records the signed per-axis delta and tolerance in source/review provenance. An offset of 2+ pixels on either axis is a technical source failure even if the image looks good. Every other source type remains strict. Preserve untouched original bytes, without padding, cropping or resizing.

### 6. Create a structured visual review

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

### 7. Fail closed

```bash
python3 tools/art_pipeline/production_guard.py validate-review \
  <spec.json> /tmp/source-review.json --image <untouched.png>
```

Approval is impossible while **any** gate/specimen is `fail` or `pending`, while the source SHA or byte count differs, when actual dimensions exceed the era-reference ±1 px allowance or its recorded signed deltas are missing/incorrect, or while Drive provenance is missing. Exact raw dimensions remain mandatory in metadata and are never silently changed.

If rejected, record concrete rejection reasons and stop before destructive processing. A source-era/scope/composition defect is never repaired downstream by Pixel Snapper, normalization or Aseprite.

### 8. Continue through the canonical pipeline only after source PASS

For placeables, resume the existing canonical pipeline and tracker. For world sprites, keep the separate ref2game route. This skill does not alter those flows.

## What the guard can and cannot prove

Deterministic code can prove schema consistency, allowlist size, prompt construction, exact style-bible embedding, exact explicit-chat-block construction, PNG dimensions, SHA-256, byte count, provenance fields and that all required review fields were explicitly closed.

It cannot prove that a conversational imagegen backend internally interpreted the context exactly as intended, nor can it reliably infer semantic visual facts such as “this object reads more like E0 than E1” from pixels without a vision reviewer. Those checks remain mandatory.

Never describe the system as literally error-free. The guarantee is **fail-closed process coverage and exact request delivery at the interface we control**, not perfect generator obedience or perfect visual perception.

## Change control

- Guard/tooling changes go through a separate branch/PR to `game-production`.
- Do not direct-push or auto-merge.
- Do not mix runtime changes into a guard/tooling PR.
- Add a regression test whenever a production defect class is found that can be represented deterministically.
- If a defect is visual/semantic, add or tighten a required structured review gate/specimen constraint rather than pretending it is automatically detectable.
