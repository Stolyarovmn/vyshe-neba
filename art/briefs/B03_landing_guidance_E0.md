# B03 / landing_guidance — E0 replacement production brief

Based on `art/docs/ASSET_BRIEF_TEMPLATE.md`. Unknown facts remain `UNKNOWN`; blocked stages are explicit. Branch/publication semantics follow `art/docs/RUNTIME_BRANCH_CONTRACT.md`.

## A. Identity и gameplay

- Asset ID / slug / family / zone: `B03 / landing_guidance / base / launch_core`
- Type: `base`
- Owner / reviewer / branch / commit SHA: `owner UNKNOWN / reviewer user for island reference, B03 candidate reviewer pending / canonical game-production / SHA pinned at execution time`
- Status: `design / source_rejected` — no accepted replacement E0 source exists yet. Three 2026-10-30 replacement attempts were archived untouched and rejected before destructive processing.
- Gameplay role / visible result, **design target**: `PRODUCTION_MANIFEST.md` says B03 predicts touchdown point, safe corridor and approach state and must not steer the rocket.
- Current runtime behavior at `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`: building key `beacons` is implemented; current landing simulation widens landing tolerances according to beacon level. This is **not** the production-manifest tracking/corridor mechanic.
- Runtime implementation status: asset mapping/consumer **verified**; design-target behavior/rig **not implemented or verified**.
- Dependencies: renderer uses `profile.buildings.beacons`; layout reserves a symmetric pair at the two `beacons` anchors.
- Out of scope: this art task does not alter landing physics, autopilot, HUD, corridor prediction, reward logic or runtime state machines.

## B. Physical construction

- E0 construction target: portable tripod/base → tall mast/yoke → **small manual optical aiming head** → separate physical signal lamp.
- The mast/yoke must carry most of the height; the head must not read as a large horizontal surveillance camera, cannon or telescope.
- E0 manufacturing/material language is constrained by `ERA_DESIGN_MATRIX.md` and the applicable exact-SHA atomic E0 reference sheets. References provide reusable construction/material/mechanical/signal vocabulary only; they do not determine B03 identity or layout.
- Parts: `base`; `head`; `lamp`; mast/yoke is structural geometry connecting base and aiming head.
- Joint intent: physical pan/tilt aiming head; bottom-center placement registration `(23,78)`.
- Measured pivots: `pending` until exact approved replacement art.
- Collision/safety behavior beyond the reserved layout remains `UNKNOWN`.

## C. Camera, scene and runtime

- Approved reference: `art/gen/environment/start_island_hd.png`, SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`, user-approved `2026-10-30T14:33:35Z`.
- Camera family: `island_top_3_4`.
- Actual source camera angle: `UNKNOWN`; 47° unsupported.
- Projection calibration: `art/gen/environment/start_island_hd.projection.json`.
- Measured generation proxy: compression `0.958515`; `73.44°` elevation above ground / `16.56°` from straight top-down. Proxy only; exact reference wins.
- Source gate must visually verify top-plane/depth compression. A generator output that reads lower/front-side is rejected even if the request contained the numeric proxy.
- Layout: island `1916×821`, origin `[388,375]`, `units_per_px=0.665`; approximate `1 LP ≈ 1.45 island px`.
- Purchase key: `beacons`; anchors `[283,395]`, `[493,395]`; layout sprite target `[100,77]`; footprint `[90,26]`.
- One-beacon production canvas `46×82`; visible bbox target `38–42 × 70–76`; registration `(23,78)`; `pixel_size=12`; <=32 colors.
- Scene QA screenshots/composites: `pending` until an accepted replacement source/candidate exists.
- Runtime key: `beacons`.
- Logical pattern: `bld_beacons_<year>`.
- Runtime consumer: `game/src/render/buildings.js::drawBuilding` resolves `buildingSpriteName(...)`.
- Existing target pattern: `game/assets/eras/e<era>-<year>/base/beacons.png` for E0–E5.
- Fallback behavior: generic procedural fallback only when resolved sprite is unavailable; normal B03 path uses era sprite.

## D. Era lineage

| Era | Continuity | Change | Status |
| --- | --- | --- | --- |
| E0 / 1978 | root | tripod + tall mast/yoke + small manual optical head + separate lamp | replacement source required; three current attempts rejected |
| E1 / 1986 | preserve footprint/axis/lamp/portrait silhouette | sectional radio beacon / heavier industrial head | blocked until E0 exact-SHA approval |
| E2 / 1998 | preserve physical ancestry | motorized optical/radio tracker | blocked on E1 |
| E3 / 2015 | preserve pan/tilt ancestry | laser-optical multi-sensor head, no baked beam | blocked on E2 |
| E4 / 2035 | preserve two-axis ancestry | enclosed servos / autonomous tracker | blocked on E3 |
| E5 / 2060 | preserve family scale/registration | lightweight multispectral directional head | blocked on E4 |

Old E0–E5 originals remain archive provenance only; they are not approved lineage roots.

### E0 atomic visual evidence

`art/references/eras/e0_1978/reference-set.json` is currently `candidate_complete_pending_cross_era_review`: 10/10 planned atomic sheet-parts have immutable Drive-backed exact-SHA candidates with per-sheet self-review PASS, but the era is not yet `approved_visual_reference_set`.

For the next B03 E0 generation, applicable E0 atomic sheets may be used as role-labelled visual-engineering evidence together with the era matrix and this brief. B03 has no required operator console/display, so `controls-displays` must not be injected merely to consume every role. Reference sheets must never determine the finished beacon identity, whole-object composition or gameplay function.

## E. Events / animation / signals

| Contract | State |
| --- | --- |
| Current runtime | static owned-building sprite; no verified per-part head/lamp state machine; gameplay widens landing tolerance |
| Production target | tracking `head`, state `lamp`, safe/unsafe/touchdown/corridor acknowledgement; exact state machine remains `UNKNOWN/BLOCKED` until runtime integration |

AI draws complete physical parts. Future code owns head motion, lamp state, guidance corridor, predicted touchdown marker, beams/light cones, HUD and other temporary FX. No fake perpetual WORK.

## F. Source, QA, promotion

- Prompt path: `art/prompts/b03_landing_guidance.md`.
- Production request: must be assembled by `tools/art_pipeline/build_generation_request.py`; style bible verbatim exactly once; measured island proxy bound to approved reference.
- Pipeline config: v3; Pixel Snapper `ae20461f60fb39e75d15f184bab1ebec1219511c`; Aseprite `1.3.18.6`.
- Accepted replacement source: **pending**.

### Rejected source attempts — provenance only

1. `6cee0780-a34a-4080-aa25-5bb59fc9300a`
   - raw PNG `1024×1536`, `1201470` bytes;
   - SHA-256 `7dadfb2372f517829ef72058e4248ab78a9e6632c986aaa35bc7be8f7495fda9`;
   - Drive ID `1qoJB5TlvtwOvTKsNpA3FkvgzlK6kLc21`;
   - rejected because the invocation did not preserve the full deterministic canonical request/style-bible contract.

2. `18107bdb-1d7e-4ee8-9e1d-64c4d0937a6e`
   - raw PNG `1086×1448`, `605396` bytes;
   - SHA-256 `c6c73b10378e250ddfe24c969f7427b7f4efbfa334c5e1f0ef632d6fb8f4a8ce`;
   - Drive ID `1zcWJox7a9HjtJwv71Xn6o2RcYziOAmLC`;
   - rejected because the aiming head reads as a large surveillance-camera body and the view is too low/front-side for the `island_top_3_4` reference family.

3. `e6ead6df-4913-479a-9069-c84adfcdae28`
   - raw PNG `941×1672`, `681208` bytes;
   - SHA-256 `10c97d1f0d00909ca3ce71648b34b34245eec219a95d4039f7f48cc736b73f0f`;
   - Drive ID `1X5kqdc--HrIE2uB00XEjm8g7mwuVUEy5`;
   - exact Drive readback matched SHA before review; rejected original was moved unchanged to `_rejected` folder `1OGGRdCTDh_yaMJ_2H6krOm0UNAFFCHVf`;
   - rejected because the aiming assembly again reads as a large horizontal box-camera and dominates the upper silhouette.

All three were archived untouched before review; no destructive processing was performed on any rejected replacement attempt.

- Auto QA: `pending` — no accepted source/candidate.
- Visual SHA-bound QA: `pending`.
- Projection/scene QA: `pending`.
- Production promotion (`promote`): `pending`; allowed only after accepted source → processing → auto QA → exact-SHA visual/scene approval.
- Runtime mapping: verified on `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`.
- Runtime publication (`publish_runtime`): **BLOCKED by semantics/rig integration**.
- Rig/event QA: **BLOCKED** until tracking head/lamp runtime state contract is implemented and verified or the production design target is explicitly revised.
- Game regression: **BLOCKED** until B03 runtime integration/publication exists.
- Next source action: after this checkpoint reconciliation is reviewed/merged, re-pin `game-production`/`main`, rerun `validate_generation_preflight.py`, rebuild the deterministic request, verify the exact applicable E0 reference bytes/SHA and approved island reference, then start a new interactive production attempt. Maximum two generation attempts in that turn; archive/review each exact source before any destructive processing.

**Generation target:** one isolated B03 E0 / 1978 beacon only. E1–E5 remain blocked until E0 exact-SHA approval.
