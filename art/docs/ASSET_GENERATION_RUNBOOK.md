# Production asset generation runbook

This runbook is the execution layer for `PRODUCTION_CONTRACT_V2.md`. Branch/storage/publication semantics are governed by `RUNTIME_BRANCH_CONTRACT.md`; tracker order is governed by `PIPELINE_CONFIG.json` + `ASSET_TASK_TRACKER.md`.

## 0. Non-negotiable preflight

Before **every** production image generation:

1. Read `AGENTS.md`, `art/docs/ASSET_PRODUCTION_PIPELINE.md`, `art/docs/PRODUCTION_CONTRACT_V2.md`, `art/docs/RUNTIME_BRANCH_CONTRACT.md`, this runbook, `art/docs/ASSET_TASK_TRACKER.md`, `art/docs/EXECUTION_TIMEOUT_POLICY.md`, `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, `art/placeables/PIPELINE_CONFIG.json`, and the current `studioigor/ref2game/codex/SKILL.md`. For island/placeables also read `art/placeables/BASE_ISLAND_LAYOUT.json`.
2. Pin the **current** production `game-production` SHA and current runtime `main` SHA. Read `main:game/src/render/manifest.js` at the pinned runtime SHA. Never treat a dated SHA in a document as a permanent branch pointer.
3. Recover the durable tracker/checkpoint first. Never restart a successful step unless its fingerprint/output SHA proves reuse is invalid.
4. Create/update the asset brief from `ASSET_BRIEF_TEMPLATE.md`. Unknown facts remain `UNKNOWN`; critical missing facts become `BLOCKED`.
5. Confirm exactly one asset **or** one part sheet per imagegen call and exactly one era per anchor-generation call.
6. Confirm the Drive archive destination exists before generation. The untouched raw generation must be archived there before destructive processing.
7. When a preflight receipt exists, run `validate_generation_preflight.py`, then build the actual request with `build_generation_request.py`. The builder appends `art/style_bible.txt` verbatim exactly once and binds ground assets to the approved island projection evidence. Do not manually paraphrase or re-order the canonical request.

PASS of generation preflight authorizes only the isolated generation stage. It does not approve source geometry, scene projection, production promotion, runtime publication, rig behavior or game regression.

## 1. Ground/placeable projection gate

Ground art uses camera family `island_top_3_4` and must visually match the exact approved HD island reference.

Current approved reference evidence:

- production path: `art/gen/environment/start_island_hd.png`;
- approved SHA-256: `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`;
- Git blob SHA-1: `382ab3fb2906152e2bc2a2616d794192904e7d68`;
- dimensions: `1916×821`;
- approval record: `art/gen/environment/start_island_hd.approval.json`;
- projection measurement: `art/gen/environment/start_island_hd.projection.json`.

### Measured generation projection preset

The approved image contains a yellow dashed launch-pad marking measured as a projected ground circle. The fit used 865 selected pixels and produced ellipse diameters `175.6885 × 183.2924 px`, so ground-circle compression is `0.958515`.

Under the **proxy assumption only** that the painted marking represents a true horizontal physical circle rendered orthographically:

- equivalent elevation above the ground plane = `73.4386°`;
- equivalent tilt from straight top-down = `16.5614°`.

Production generation uses rounded control values **73.44° elevation / 16.56° from top-down / compression 0.958515** together with the exact reference. These are a **reference-equivalent generation proxy**, not a recovered fact about the original 3D camera. Actual source camera angle remains `UNKNOWN`; **47° remains unsupported**.

**Important:** supplying the numeric proxy does not prove the generator obeyed it. Source review must reject a result that visually reads lower/front-side or otherwise fails to match the island's visible top planes/depth compression. If the exact reference and the numeric proxy appear to disagree, the SHA-bound reference wins.

Scene approval still requires a real-scale composite: anchor, footprint, contact, occlusion, land mask, normal/reduced zoom and relevant scene states. LP and island pixels are different coordinate spaces.

## 2. Generation → immutable raw source

Immediately after every production generation attempt, including a rejected one:

1. preserve the untouched returned PNG;
2. compute SHA-256, dimensions and byte count from those exact bytes;
3. upload the untouched original to the verified asset Drive archive before crop/resize/quantize/alpha cleanup/recolor/Aseprite;
4. record generation ID, Drive file ID/URL, SHA-256, size, era, prompt/preflight evidence and verdict;
5. move meaningful rejected originals to the asset `_rejected` folder when present, preserving exact bytes.

Reject at **source gate** if subject, era, camera/projection family, parts, silhouette or exclusions are wrong. A source geometry/projection defect is not repaired by Pixel Snapper or normalization.

## 3. Placeable machine pipeline

For W/B placeables only:

```text
source_prepare
→ Pixel Snapper
→ normalize
→ Aseprite indexed/no-dither
→ automatic QA
→ immutable candidate manifest
→ exact-SHA visual review
→ scene QA
```

After production gates pass, publication is split:

```text
promote: candidate → production PR → game-production
publish_runtime: exact approved production bytes → replacement PR → main
game_tests: runtime/build checks on the resulting runtime tree
```

Tool pins come from `PIPELINE_CONFIG.json`. Never guess `pixel_size`, canvas, registration, transport scale or pivots.

AI draws physical parts. Code owns joints/rig motion, state transitions, lights, dynamic shadows, screens/data, particles, glow, beams and all other temporary effects.

## 4. World sprites

World sprites keep the separate ref2game flow (`prepare → imagegen → import → slice/prep → game QA`). Do not route them through the W/B placeable processing pipeline without an explicit migration.

## 5. Approval and publication

- Visual approval is bound to the exact candidate SHA.
- Pivots are measured only from exact approved art.
- Production `promote` stores approved art/history in `game-production` only.
- Runtime `publish_runtime` requires `art/runtime/RUNTIME_EXPORTS.json`, verified target/consumer/semantics and existing `main:game/assets/...` target.
- `main` must not receive production history/candidates/raw/QA or parallel mirrors.
- Old runtime images are not stored as `_old`, `backup`, dated or `v2` copies. Rollback uses Git history/revert.
- A created runtime PR is not publication success; merge/resulting runtime SHA must be confirmed.
- No direct push to `main`; no automatic merge.

## 6. B03 restart target and current checkpoint

`B03 / landing_guidance` remains the first configured Batch-A repair target. The old E0–E5 lineage is archived provenance but rejected by gameplay-size QA. Old E0 visible bbox was `36×42`; configured processed target is `38–42 × 70–76` inside canvas `46×82`, registration `(23,78)`, `pixel_size=12`, <=32 colors.

B03 runtime mapping is verified on `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`:

- key `beacons`;
- logical pattern `bld_beacons_<year>`;
- targets `game/assets/eras/e<era>-<year>/base/beacons.png` for E0–E5;
- renderer resolves through `buildingSpriteName(...)` / `drawBuilding(...)`;
- current gameplay widens landing tolerances;
- production manifest instead targets touchdown/corridor prediction plus a tracking `head` and state `lamp`.

Therefore `publish_runtime` remains **BLOCKED by semantics/rig integration**, not path discovery.

### 2026-10-30 E0 generation attempts

Two production attempts were archived untouched and rejected at source gate:

1. generation `6cee0780-a34a-4080-aa25-5bb59fc9300a`, SHA-256 `7dadfb2372f517829ef72058e4248ab78a9e6632c986aaa35bc7be8f7495fda9`, Drive `1qoJB5TlvtwOvTKsNpA3FkvgzlK6kLc21` — rejected because the invocation did not preserve the full deterministic canonical request contract;
2. generation `18107bdb-1d7e-4ee8-9e1d-64c4d0937a6e`, SHA-256 `c6c73b10378e250ddfe24c969f7427b7f4efbfa334c5e1f0ef632d6fb8f4a8ce`, Drive `1zcWJox7a9HjtJwv71Xn6o2RcYziOAmLC` — rejected because the head read as a large surveillance-camera body and the view was too low/front-side to match `island_top_3_4` projection evidence.

Both are provenance only. No Pixel Snapper/normalize/Aseprite/candidate processing was performed on them. The retry budget for that interactive turn was exhausted; the next attempt must resume from tracker issue #28 in a new turn.

## 7. Verified branch/check evidence

Always re-pin current branch heads before acting. The following is dated evidence, not a permanent branch pointer:

- production reconciliation PR #34 merged as `game-production@62cf089b565a2c082d0f8de6fd70086082e6b6ce`;
- exact-head `Asset production readiness` run `41111497781` — PASS;
- exact-head `Production contract docs smoke` run `41111497937` — PASS;
- runtime `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` `Game runtime build` run `41110329403` — PASS;
- current `main` has no `game/test` directory, so that runtime workflow is a manifest/build/checksum gate, not a full B03 gameplay regression suite.

The old production-side runtime `game-ci.yml` is not part of `game-production`. Runtime build assumptions must stay in the clean `main` tree.