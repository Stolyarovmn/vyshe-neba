# B03 / landing_guidance — E0 replacement production brief

Based on `art/docs/ASSET_BRIEF_TEMPLATE.md`. Unknown facts remain `UNKNOWN`; blocked stages are explicit. Branch/publication semantics follow `art/docs/RUNTIME_BRANCH_CONTRACT.md`.

## A. Identity и gameplay

- Asset ID / slug / family / zone: `B03 / landing_guidance / base / launch_core`
- Type: `base`
- Owner / reviewer / branch / commit SHA: `owner UNKNOWN / reviewer user for island reference, B03 candidate reviewer pending / canonical game-production / SHA pinned at execution time`
- Status: `design / source_rejected` — no accepted replacement E0 source exists yet. Five replacement attempts have been archived untouched and rejected before destructive processing.
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

### Exact island delivery evidence — 2026-11-01

For source review, the exact approved island bytes were exported from GitHub without modification through temporary `Asset production readiness` run `41339382082`. The run verified SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, Git blob `382ab3fb2906152e2bc2a2616d794192904e7d68`, and `722995` bytes before uploading a one-day artifact. Local artifact readback was `1916×821` and matched the same SHA-256. The temporary export branch is operational evidence only and is not production history.

## D. Era lineage

| Era | Continuity | Change | Status |
| --- | --- | --- | --- |
| E0 / 1978 | root | tripod + tall mast/yoke + small manual optical head + separate lamp | replacement source required; five current attempts rejected |
| E1 / 1986 | preserve footprint/axis/lamp/portrait silhouette | sectional radio beacon / heavier industrial head | blocked until E0 exact-SHA asset approval |
| E2 / 1998 | preserve physical ancestry | motorized optical/radio tracker | blocked on E1 asset approval |
| E3 / 2015 | preserve pan/tilt ancestry | laser-optical multi-sensor head, no baked beam | blocked on E2 |
| E4 / 2035 | preserve two-axis ancestry | enclosed servos / autonomous tracker | blocked on E3 |
| E5 / 2060 | preserve family scale/registration | lightweight multispectral directional head | blocked on E4 |

Old E0–E5 B03 originals remain archive provenance only; they are not approved lineage roots.

### E0 atomic visual evidence

`art/references/eras/e0_1978/reference-set.json` is now `approved_visual_reference_set`: all 10 exact-SHA atomic sheet-parts and all four complete roles passed the required E0↔E1 cross-era blind-order review. This status was merged by PR #77 and is canonical for E0 generation.

For B03 E0 generation, use all **applicable** E0 atomic sheets as role-labelled visual-engineering evidence together with the era matrix and this brief. B03 has no required operator console/display, so `controls-displays` must not be injected merely to consume every role. Reference sheets must never determine the finished beacon identity, whole-object composition or gameplay function.

Applicable evidence used for attempts 4/5:

- `materials-construction/01-surfaces-stock` — SHA-256 `5d49bfa8e8561972226862a70c251e57ad42b0a8fa6242b7649f58868b3c5aee`
- `materials-construction/02-joints-repairs` — SHA-256 `6efe2f5e3a2f0951456a486c2cc5b435da761603e79a2a72e9cb003d109a899d`
- `materials-construction/03-service-architecture` — SHA-256 `d4407f9e4ac9bcbf48bc1360d3c2d490550d51e2779203c4976769d80d623040`
- `mechanics-infrastructure/01-manual-drives` — SHA-256 `36c52034690af8c1d78221bfe3d849cec175363ac41318b13c144b8c41ad9a46`
- `mechanics-infrastructure/02-joints-lifting` — SHA-256 `aae9bf1771a4039e8cc58970bea6cbf0d83b97056c601368c858a3a3bc14f374`
- `mechanics-infrastructure/03-utilities-cabling` — SHA-256 `9302dee8e3dc7983d0ff3869504ade2e5adcda5d1eac218f173ea96d5762ffbf`
- `lighting-signals/01-lamps-fixtures` — SHA-256 `4a6d2436c3468d106425933f1640ddbff1cfdb538a81e74070f926cae7d27103`
- `lighting-signals/02-signal-hardware` — SHA-256 `cbf1c6c37c9537d9ba257aa6e95769e312920a5bd5be30a2ff0c76ed6ec87c78`

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
- Accepted replacement source: **none**.

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

4. `6aa64119-bf48-4b0e-8ae0-7acf66bc234d`
   - raw PNG `1024×1536`, `1521002` bytes;
   - SHA-256 `3030a3cfb3f6229d7e25ce7834dc46cc9298bbb28cf7017e3181f38606c4a5b2`;
   - Drive ID `1fwf2XQLZqV1Vy6EryxHk4_tuQ_Bj1Od4`, moved unchanged to `_rejected`;
   - all eight applicable exact-SHA E0 role references were actually supplied to imagegen;
   - identity/reference transfer improved materially: tall narrow mast, compact open-yoke sight, manual fasteners/adjustments, separate signal lamp and disciplined cable routing are directly visible;
   - rejected at source gate because the ground-object projection reads materially lower/front-side than the exact approved island family and the raw contains a visible semi-transparent baked halo/lighting aura around the object; the base/tripod contact read also required correction before acceptance.

5. `d39e7f27-9a5b-42cb-b8d3-57203e0aca8d`
   - corrective edit of attempt 4; raw PNG `1024×1536`, `1548956` bytes;
   - SHA-256 `b091cc642cb0b5aebf439637ff41191d4ecdbf6dff4193200fa2a006f13988e9`;
   - Drive ID `11VeYlncW5OcEpe4DZ62Uo8lX30mnPFfG`, moved unchanged to `_rejected`;
   - edit used the previous raw plus applicable manual-mechanics/joint/lamp E0 references and explicitly targeted a three-contact tripod, OFF lamp, compact sight and causal cable routing;
   - compact-head/CCTV failure class is corrected: the head reads as a small manual optical sight in an open yoke and remains subordinate to the mast; E0 material/joint/service language is clearly visible;
   - rejected at source gate because comparison with the **exact approved island bytes** still shows a materially lower/front-side projection than `island_top_3_4`, and a semi-transparent baked halo remains around the isolated object/lamp. These are source defects and are not delegated to Pixel Snapper/normalize/Aseprite.

All five rejected originals are provenance only. No rejected attempt reached Pixel Snapper / normalize / Aseprite / candidate processing.

### Reference-transfer finding for attempts 4/5

- Manifest/brief drove the object identity and overall hierarchy: one B03 beacon, tall portrait form, tripod/base → mast/open yoke → compact optical head → separate lamp, pan/tilt ancestry and no operator console.
- `materials-construction` evidence visibly transferred painted/worn steel, fabricated profiles, bolted plates/brackets and repairable service construction.
- `mechanics-infrastructure` evidence visibly transferred open pivots/yoke, visible pins/bearings/locking hardware, manual adjustment and short causal cable routing.
- `lighting-signals` evidence visibly transferred a separate period-style physical lamp/lens/housing.
- No claim is made that references *caused* the improvement; this pass only demonstrates visible reference-transfer fidelity.
- Relative to attempts 2/3, attempts 4/5 directly avoid the large CCTV/box-camera head and show stronger E0 construction language. Projection remains the blocking repeated failure class.

### Current checkpoint

- Generation retry budget for the 2026-11-01 interactive pass is exhausted: two production generation attempts were made (attempt 4 + corrective attempt 5).
- Repeated blocking class: `projection_mismatch_island_top_3_4`; attempt 5 also retains forbidden baked alpha halo.
- Per `EXECUTION_TIMEOUT_POLICY.md`, do not make a third near-identical generation in the same pass. Next generation must change method/control, not merely repeat the prompt.
- Auto QA: `pending` — no accepted source/candidate.
- Visual SHA-bound QA: `pending`.
- Projection/scene QA: source projection **fail**; candidate scene QA not reached.
- Production promotion (`promote`): `pending`; allowed only after accepted source → processing → auto QA → exact-SHA visual/scene approval.
- Runtime mapping: verified on `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`.
- Runtime publication (`publish_runtime`): **BLOCKED by semantics/rig integration**.
- Rig/event QA: **BLOCKED** until tracking head/lamp runtime state contract is implemented and verified or the production design target is explicitly revised.
- Game regression: **BLOCKED** until B03 runtime integration/publication exists.

**Next source action:** change the generation control method so the exact approved island image is supplied directly as the projection reference together with the approved E0 role sheets; preserve the compact-head geometry of attempt 5, explicitly forbid any alpha halo/baked illumination, and run at most two new attempts in a later interactive pass. Do not process attempts 4/5 downstream.
