# Production asset generation runbook

This runbook is the execution layer for `PRODUCTION_CONTRACT_V2.md`. Branch/storage/publication semantics are governed by `RUNTIME_BRANCH_CONTRACT.md`; tracker order is governed by `PIPELINE_CONFIG.json` + `ASSET_TASK_TRACKER.md`; era visual/engineering language is governed by `ERA_DESIGN_MATRIX.md`; approved era visual evidence is indexed under `art/references/eras/`.

## 0. Non-negotiable preflight

Before **every** production image generation:

1. Read `AGENTS.md`, `art/docs/ASSET_PRODUCTION_PIPELINE.md`, `art/docs/PRODUCTION_CONTRACT_V2.md`, `art/docs/RUNTIME_BRANCH_CONTRACT.md`, this runbook, `art/docs/ASSET_TASK_TRACKER.md`, `art/docs/EXECUTION_TIMEOUT_POLICY.md`, `art/docs/ERA_DESIGN_MATRIX.md`, `art/references/eras/README.md`, `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, `art/placeables/PIPELINE_CONFIG.json`, and the current `studioigor/ref2game/codex/SKILL.md`. For island/placeables also read `art/placeables/BASE_ISLAND_LAYOUT.json`.
2. Pin the **current** production `game-production` SHA and current runtime `main` SHA. Read `main:game/src/render/manifest.js` at the pinned runtime SHA. Never treat a dated SHA in a document as a permanent branch pointer.
3. Recover the durable tracker/checkpoint first. Never restart a successful step unless its fingerprint/output SHA proves reuse is invalid.
4. Create/update the asset brief from `ASSET_BRIEF_TEMPLATE.md`. Unknown facts remain `UNKNOWN`; critical missing facts become `BLOCKED`.
5. Resolve the selected era through `ERA_DESIGN_MATRIX.md`. Record all applicable axes: manufacturing, materials, drive, interface, lighting, infrastructure, autonomy/service, silhouette/architecture. For E1–E5 record the transition from the previous approved era: at least 3 changed axes and at least 2 preserved family traits when physically possible.
6. If `art/references/eras/<era>/reference-set.json` exists with approved status, read it before generation, verify the listed SHA-256/Drive provenance, and use all applicable sheets by their declared roles together with the era matrix and asset-specific brief. Generated lettering/pseudo-text inside a reference sheet is non-authoritative. Transfer era language, not literal object identity.
7. Confirm exactly one asset **or** one part sheet per imagegen call and exactly one era per anchor-generation call.
8. Confirm the Drive archive destination exists before generation. The untouched raw generation must be archived there before destructive processing.
9. When a preflight receipt exists, run `validate_generation_preflight.py`, then build the actual request with `build_generation_request.py`. The builder appends `art/style_bible.txt` verbatim exactly once and binds ground assets to the approved island projection evidence. Do not manually paraphrase or re-order the canonical request.
10. Confirm the canonical asset prompt contains enough era-specific evidence to enforce the matrix. A prompt that only says `more modern`, `more futuristic`, `add cyan`, `add hologram` or similar is insufficient and blocks generation.

PASS of generation preflight authorizes only the isolated generation stage. It does not approve source geometry, era distinctness, scene projection, production promotion, runtime publication, rig behavior or game regression.

## 1. Era generation gate

Before each imagegen call verify:

- selected era/year is explicit;
- object gameplay role and physical parts come from `PRODUCTION_MANIFEST.md`/brief;
- era language comes from `ERA_DESIGN_MATRIX.md`;
- an approved era reference set, when present, is included as SHA-bound visual evidence and its relevant sheets are used by role;
- era-specific materials, mechanics/drive, UI, lighting, infrastructure, autonomy and silhouette are named where applicable;
- E1–E5 use the previous exact-approved era as primary lineage reference when available; E0 remains the family anchor reference when useful;
- decorative futurism does not substitute for physical function.

### E4

For suitable large architecture, E4 should visibly use panoramic/curtain-wall glazing, transparent galleries/control volumes and light structural frames. E4 machines should read as autonomous/robotic rather than merely recolored E3 hardware.

### E5

For applicable E5 assets:

- complex UI is spatial/volumetric/holographic rather than a permanent rectangular display;
- mobile equipment defaults to physically explained hover/levitation/contactless locomotion rather than conventional wheel/track travel;
- integrated light lines are functional signals/routes, not decoration;
- AI source art contains the physical projector/emitter/lift/stabilizer hardware;
- active holographic content, glow, field visualization and hover motion remain code-owned.

Any exception must be written in the brief before generation.

## 2. Ground/placeable projection gate

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

## 3. Generation → immutable raw source

Immediately after every production generation attempt, including a rejected one:

1. preserve the untouched returned PNG;
2. compute SHA-256, dimensions and byte count from those exact bytes;
3. upload the untouched original to the verified asset Drive archive before crop/resize/quantize/alpha cleanup/recolor/Aseprite;
4. record generation ID, Drive file ID/URL, SHA-256, size, era, prompt/preflight evidence and verdict;
5. move meaningful rejected originals to the asset `_rejected` folder when present, preserving exact bytes.

Reject at **source gate** if subject, era, camera/projection family, parts, silhouette, era-language or exclusions are wrong. A source geometry/projection/era defect is not repaired by Pixel Snapper or normalization.

## 4. Placeable machine pipeline

For W/B placeables only:

```text
source_prepare
→ Pixel Snapper
→ normalize
→ Aseprite indexed/no-dither
→ automatic QA
→ immutable candidate manifest
→ exact-SHA visual review
→ era distinctness / blind-order review
→ scene QA
```

After production gates pass, publication is split:

```text
promote: candidate → production PR → game-production
publish_runtime: exact approved production bytes → replacement PR → main
game_tests: runtime/build checks on the resulting runtime tree
```

Tool pins come from `PIPELINE_CONFIG.json`. Never guess `pixel_size`, canvas, registration, transport scale or pivots.

AI draws physical parts. Code owns joints/rig motion, state transitions, lights, dynamic shadows, screens/data, holographic content, levitation/field visualization, particles, glow, beams and all other temporary effects.

## 5. World sprites

World sprites keep the separate ref2game flow (`prepare → imagegen → import → slice/prep → game QA`). Do not route them through the W/B placeable processing pipeline without an explicit migration. Era visual/engineering language still follows `ERA_DESIGN_MATRIX.md` when a world-sprite family has E0–E5 variants, and any approved era reference set remains applicable visual evidence.

## 6. Approval and publication

- Visual approval is bound to the exact candidate SHA.
- Era approval is bound to the exact candidate(s) being compared; do not approve lineage from thumbnails that differ from production bytes.
- Approved era reference sheets are visual evidence only; they do not approve a production asset or bypass any asset gate.
- Pivots are measured only from exact approved art.
- Production `promote` stores approved art/history in `game-production` only.
- Runtime `publish_runtime` requires `art/runtime/RUNTIME_EXPORTS.json`, verified target/consumer/semantics and existing `main:game/assets/...` target.
- `main` must not receive production history/candidates/raw/QA or parallel mirrors.
- Old runtime images are not stored as `_old`, `backup`, dated or `v2` copies. Rollback uses Git history/revert.
- A created runtime PR is not publication success; merge/resulting runtime SHA must be confirmed.
- No direct push to `main`; no automatic merge.

## 7. B03 restart target and current checkpoint

`B03 / landing_guidance` remains the first configured Batch-A repair target. The old E0–E5 lineage is archived provenance but rejected by gameplay-size QA. Old E0 visible bbox was `36×42`; configured processed target is `38–42 × 70–76` inside canvas `46×82`, registration `(23,78)`, `pixel_size=12`, <=32 colors.

B03 runtime mapping is verified on `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`:

- key `beacons`;
- logical pattern `bld_beacons_<year>`;
- targets `game/assets/eras/e<era>-<year>/base/beacons.png` for E0–E5;
- renderer resolves through `buildingSpriteName(...)` / `drawBuilding(...)`;
- current gameplay widens landing tolerances;
- production manifest instead targets touchdown/corridor prediction plus a tracking `head` and state `lamp`.

Therefore `publish_runtime` remains **BLOCKED by semantics/rig integration**, not path discovery.

### 2026-10-30 E0 replacement attempts

Three production attempts were archived untouched and rejected at source gate before destructive processing:

1. generation `6cee0780-a34a-4080-aa25-5bb59fc9300a`, SHA-256 `7dadfb2372f517829ef72058e4248ab78a9e6632c986aaa35bc7be8f7495fda9`, Drive `1qoJB5TlvtwOvTKsNpA3FkvgzlK6kLc21` — invocation did not preserve the full deterministic canonical request contract;
2. generation `18107bdb-1d7e-4ee8-9e1d-64c4d0937a6e`, SHA-256 `c6c73b10378e250ddfe24c969f7427b7f4efbfa334c5e1f0ef632d6fb8f4a8ce`, Drive `1zcWJox7a9HjtJwv71Xn6o2RcYziOAmLC` — head read as a large surveillance-camera body and view was too low/front-side;
3. generation `e6ead6df-4913-479a-9069-c84adfcdae28`, SHA-256 `10c97d1f0d00909ca3ce71648b34b34245eec219a95d4039f7f48cc736b73f0f`, Drive `1X5kqdc--HrIE2uB00XEjm8g7mwuVUEy5` — aiming assembly again read as a large horizontal box-camera/surveillance-camera body and dominated the upper silhouette.

All three are provenance only. No Pixel Snapper/normalize/Aseprite/candidate processing was performed on them.

PR #37 has been merged after combined-tree readiness/docs checks passed. The next B03 generation must apply both its compact-yoke source gate and the canonical E0 profile/reference set: hand-built/repairable construction, exposed mechanically justified hardware, analog/physical signal logic and period-appropriate materials; no modern/future visual shortcuts.

## 8. Verified branch/check evidence

Always re-pin current branch heads before acting. Dated evidence below is not a permanent branch pointer.

- era matrix PR #38 merged into `game-production` as `cba5aac1963917351e5957dea40d3686a4601c06` after exact-head docs/readiness PASS;
- B03 prompt PR #37 merged as `49bea6f900895c461e7c5b0e55b48667185ce04a` after combined-tree `Asset production readiness` run `41129760722` PASS and `Production contract docs smoke` run `41129760401` PASS;
- runtime `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` remains the clean runtime/build branch;
- `art/runtime/RUNTIME_EXPORTS.json` has the approved HD island entry `status=ready` with exact SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`;
- current `main` has no `game/test` directory, so runtime workflow is a manifest/build/checksum gate, not a full B03 gameplay regression suite.

The old production-side runtime `game-ci.yml` is not part of `game-production`. Runtime build assumptions must stay in the clean `main` tree.
