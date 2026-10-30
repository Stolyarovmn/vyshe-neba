# Production asset generation runbook

This runbook is the execution layer for `PRODUCTION_CONTRACT_V2.md`. It does not replace the existing tracker or machine pipeline. Branch/storage/publication semantics are governed by `RUNTIME_BRANCH_CONTRACT.md`.

## 0. Non-negotiable preflight

Before **every** production image generation:

1. Read `AGENTS.md`, `art/docs/ASSET_PRODUCTION_PIPELINE.md`, `art/docs/PRODUCTION_CONTRACT_V2.md`, `art/docs/RUNTIME_BRANCH_CONTRACT.md`, `art/docs/ASSET_TASK_TRACKER.md`, `art/docs/EXECUTION_TIMEOUT_POLICY.md`, `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, `art/placeables/PIPELINE_CONFIG.json`, and the current `studioigor/ref2game/codex/SKILL.md`. For island/placeables also read `art/placeables/BASE_ISLAND_LAYOUT.json`.
2. Pin the production branch SHA and the current runtime `main` SHA. Read `main:game/src/render/manifest.js` at that SHA. Do not infer runtime logical names from design docs.
3. Recover the durable tracker/checkpoint. Never restart a successful step unless its fingerprint/output SHA proves reuse is invalid.
4. Create/update the asset brief from `art/docs/ASSET_BRIEF_TEMPLATE.md`. Unknown facts remain `UNKNOWN`; critical missing facts become `BLOCKED`.
5. Confirm exactly one asset **or** one part sheet per imagegen call and exactly one era per anchor-generation call.
6. Confirm the Drive archive destination exists before generation. The raw generation must be archived there before any destructive processing.
7. Build the request with `tools/art_pipeline/build_generation_request.py`; this appends `art/style_bible.txt` verbatim and, for ground assets, binds the measured island projection proxy. Do not hand-copy or paraphrase the style bible into a production request.

## 1. Ground/placeable projection gate

Ground art uses camera family `island_top_3_4` and must match the actually approved HD island reference.

The current HD island is approved by the user and bound to exact SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`. The approval record is `art/gen/environment/start_island_hd.approval.json`; metadata is `art/gen/environment/start_island_hd.meta.json`. The original runtime byte-identity evidence was recorded on `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e`: `game/assets/shared/island/start-island.png` had Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`, and the user-supplied approved PNG recomputed to the same Git blob SHA-1. The exact approved PNG is now also canonical production history at `game-production:art/gen/environment/start_island_hd.png`, with the same Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68` and byte count `722995`. Current runtime `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` still resolves the island through `game/assets/shared/island/start-island.png`; its post-merge runtime build gate is green.

### Measured generation projection preset

The reproducible measurement record is `art/gen/environment/start_island_hd.projection.json`. On the approved PNG, 865 color-filtered pixels from the yellow dashed circular launch-pad marking were fit with an ellipse. The fitted diameters are `175.6885 × 183.2924 px`, giving ground-circle compression `175.6885 / 183.2924 = 0.958515`.

Under the **proxy assumption only** that this painted marking represents a true horizontal physical circle rendered orthographically:

- equivalent elevation above the ground plane = `asin(0.958515) = 73.4386°`;
- equivalent tilt away from straight top-down = `90° - 73.4386° = 16.5614°`.

For production generation, use the rounded control values **73.44° elevation / 16.56° from top-down** together with the exact island reference. These values are a **reference-equivalent generation proxy**, not a recovered fact about the original 3D camera. A single painterly 2D image cannot uniquely identify the original camera, and the painted circle may itself be artistically deprojected. Therefore the canonical field `projection_angle` remains `UNKNOWN`; **47° remains unsupported**. If the numeric proxy conflicts visually with the exact SHA-bound reference, the reference wins.

This opens the reference prerequisite for scene QA. It does not auto-approve any placeable: every candidate still needs real-scale composite checks for projection family, contact, footprint, anchor, occlusion and land mask.

Always use `BASE_ISLAND_LAYOUT.json` for anchor/footprint/land-mask/occlusion checks. LP and island pixels are different coordinate spaces.

## 2. Generation → immutable raw source

Immediately after a successful generation:

1. Save the untouched original PNG to the asset's Google Drive archive folder.
2. Compute SHA-256 from the exact archived bytes and record: generation ID, dimensions, byte count, Drive file ID/URL, SHA-256, prompt path, era, and review result.
3. Do not crop, resize, quantize, alpha-clean, recolor, or overwrite the archived original.
4. Reject at source gate if the subject/era/camera/parts are wrong, the output contains multiple alternatives, text/UI/scenery/baked FX, or edge/background defects that violate the brief/style bible. Move rejected originals to the asset `_rejected` folder where one exists and record the reason + exact SHA.

A source rejection is not a processing failure. Do not try to repair a wrong silhouette/era by Pixel Snapper or normalization.

## 3. Placeable machine pipeline

For W/B placeables only:

`source_prepare → Pixel Snapper → normalize → Aseprite indexed/no-dither → automatic QA → immutable candidate manifest → exact-SHA visual review`

After visual/scene approval the publication path is deliberately split:

`promote (production PR → game-production) → publish_runtime (replacement PR → main) → game_tests`

Tool pins come from `PIPELINE_CONFIG.json`. Never guess `pixel_size`, canvas, registration, transport scale, or pivots. If an asset is absent from machine config, stop before candidate processing and measure/approve the missing values in a separate change.

AI draws physical parts. Code owns joints/rig motion, state transitions, lights, dynamic shadows, screens/data, particles, glow, exhaust and all other FX.

## 4. World sprites

World sprites keep the separate ref2game flow (`prepare → imagegen → import → slice/prep → game QA`). Do not route them through the W/B placeable candidate pipeline unless an explicit migration is approved.

## 5. Approval and two-stage publication

- Visual approval is bound to the exact candidate SHA; “looks approved” without SHA is not an approval.
- Measured pivots are recorded only from exact approved art.
- Scene QA must use real scale, normal/reduced zoom, contact/occlusion/land mask and the approved reference.
- Production promotion (`promote`) may proceed once production gates pass even when runtime integration is still unknown; it stores approved art/history in `game-production` only.
- Runtime publication (`publish_runtime`) requires verified logical name/consumer/canonical target and exact mapping in `art/runtime/RUNTIME_EXPORTS.json`. It replaces an **existing** `main:game/assets/...` file at the same path through a separate PR.
- `main` must not receive production history, candidates, raw sources, QA evidence, `art/gen` mirrors or `outputs/rocket` mirrors.
- Old runtime images are not kept as `_old`, `backup`, `v2` or parallel paths. Rollback uses Git history/revert.
- Creating a runtime PR is not the same as publishing it; final `publish_runtime=success` requires merge/resulting runtime SHA confirmation.
- Never push directly to `main` or auto-merge.

## 6. First safe restart target

The first configured Batch-A repair target is `B03 landing_guidance`: its existing E0–E5 originals are archived but the lineage is explicitly rejected by gameplay-size QA. The recorded E0 visible bbox is `36×42`, while the configured target is `38–42×70–76`; therefore a **replacement E0** is required before E1–E5 are rebuilt. B03 has pinned `pixel_size=12`, canvas `46×82`, registration `(23,78)`, and a verified Drive archive folder.

The HD island reference and measured generation projection preset are available for B03, so it can proceed through generation, immutable-original archival, processing, automatic QA, exact-SHA review and scene QA. After those gates pass, approved B03 art may be promoted into `game-production` even while runtime publication remains blocked.

B03 runtime **mapping is verified** on current `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`: runtime key `beacons`, logical-name pattern `bld_beacons_<year>`, canonical target pattern `game/assets/eras/e<era>-<year>/base/beacons.png`, and rendering via `buildingSpriteName(...)` / `drawBuilding(...)`. All manifest entries resolve in the green runtime build gate.

B03 **runtime publication remains BLOCKED by a semantics/rig mismatch**, not by path discovery. Current `game/src/sim/landing.js` widens landing tolerances using `s.cfg.base.beacons`; the production manifest instead targets touchdown/corridor prediction plus a physically tracking `head` and state `lamp`. Resolve that behavior/rig contract in a separate runtime integration PR before `publish_runtime`.

## 7. Current cross-branch limitations

`game-production` is the production/history tree; `main` is the clean runtime/build tree. Canonical production is currently `game-production@f9f3b102ec2d5d10962f80b0f7ed250e08092384`; canonical runtime is `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`.

The exact approved HD island binary is now present at the expected production path `art/gen/environment/start_island_hd.png` and matches Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`; the former production-source gap is resolved.

Runtime CI is intentionally separate from production CI. `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` passed post-merge `Game runtime build` run `41110329403`. Canonical production `game-production@f9f3b102ec2d5d10962f80b0f7ed250e08092384` passed post-merge `Asset production readiness` run `41110520764` and `Production contract docs smoke` run `41110520841`. These are build/readiness gates, not B03 runtime integration regression.

The old production-side runtime `game-ci.yml` has been removed from `game-production`. Do not reintroduce runtime-build assumptions into the production/history tree.
