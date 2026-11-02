# B01 / weather_complex / E0 1978 — production asset brief

**Status:** `blocked_existing_source_review`; not an approval, not a generation receipt and not runtime-publication authority.

**Pinned recovery baseline:** `game-production@2cfffb42bdce0d9b5e5ef1e3eee398ba2ebab6fc`, `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`. Durable tracker: [Issue #93](https://github.com/Stolyarovmn/vyshe-neba/issues/93). After a merge, re-pin branch heads rather than treating these as permanent pointers.

## A. Identity / gameplay

- Asset: **B01**, slug `weather_complex`, family: base placeable, zone `command_north`, E0 year **1978**, «Гаражная мечта».
- Gameplay role: **Information**. Production design targets **two predetermined weather windows for next launch**, with a one-time user switch and no infinite reroll; no physical modification to wind by purchasing the station.
- Existing **main** implementation differs: `game/src/data/buildings.js` defines `forecast` and `stormBonus`; `game/src/sim/weather.js` models changing weather. This is **not the two-window production design**. Runtime semantics = `CONFLICT`.
- No new gameplay mechanics or runtime edits authorized by this brief. Do not declare production-target behavior implemented.

## B. Physical construction and moving parts

- Static `body`: compact hand-welded steel angle/plate base, bolted feet, visible reinforced pipe mast; functional cable path and service attachment for analog panel. No generic decorative parts.
- Rotary `sensor`: physical cup-anemometer rotor and its bearing/shaft, complete axle/hub geometry. Wind magnitude drives the motion in code.
- Wind-reactive `vane`: physical wind-direction vane, visible shaft/pivot and bearing/mast connector. Code owns direction/rotation. Do not bake movement blur.
- State hardware `indicator`: analog pointer dial/gauge plus period-appropriate physical indicator hardware (if functional) in a serviceable casing. Needle/state and glow are code-owned; no baked UI or pseudo-writing.
- AI draws only complete, physically separable hardware and attachment surfaces. Code owns wind dynamics, preview/confirm events, needle, signals, shadows, particles, glow, and all temporal FX.
- Existing old exact-processing rig metadata `art/gen/placeables/base/weather_complex/parts/part_extraction.json` records **historic** measured pivots: sensor `[42,29]`, vane `[48,36]`, indicator `[57,63]` inside 96×122. These may only be reused if the same exact processed art/part geometry is retained; any replacement source requires remeasurement. Pixel-exact reconstruction is reported in old metadata, **not revalidated in this pass**.

## C. Camera / island / scene / runtime

- Camera family: `island_top_3_4`; actual original camera angle **UNKNOWN**. 47° is unsupported.
- Approved reference `art/gen/environment/start_island_hd.png`, SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, 1916×821 px; authorization `art/gen/environment/start_island_hd.approval.json`.
- Generation **proxy only**: elevation 73.44° above ground; tilt 16.56° from topdown; ground-plane compression 0.958515. Reference appearance has priority over the numbers.
- `art/placeables/BASE_ISLAND_LAYOUT.json` version 3: key `weather`, `zone=command_north`, old island anchor `[1000,350]`, old `sprite_px=[142,180]`, `footprint_px=[100,28]`; `PRODUCTION_MANIFEST.md` design footprint `96×122 LP`, socket `roof|yard`, bottom-center design anchor `[48,118]` on 96×122 legacy processed art.
- **Map Editor final placement, display dimensions, anchor and occlusion approval: UNKNOWN**; all old numbers are targets only, not final editor-approved constraints. Exact-island scene composite, contact points, land mask, reduced-zoom readability and occlusion QA: **PENDING**.
- Existing `main` runtime target `game/assets/eras/e0-1978/base/weather-complex.png`, logical `bld_weather_1978`; actual consumers `game/src/render/manifest.js` → `game/src/render/buildings.js::drawBuilding` → `game/src/render/hub.js`. Git blob SHA-1 `f288f04a04ae95889cbc2aefee1218f6d435b95c`. Actual decoded runtime byte SHA-256 `f49c5e6a80d2301013f8a69b669210f0f4cd752248c915a832f203c45630661c`, 1,745 bytes; matches `e0_1978.pipeline.json.final_sha256`.
- `art/runtime/RUNTIME_EXPORTS.json` has **no B01 export mapping**. `publish_runtime=BLOCKED` pending mapping, semantic review and separate runtime PR.

## D. E0 art-direction axes (ERA_DESIGN_MATRIX.md)

| Axis | E0 1978 implementation and functional reason |
| --- | --- |
| Manufacturing | hand-welded steel plate/angle base, visibly fitted joints, bolts and inspectable service hardware |
| Materials | mat olive/gray-green/steel, dirty beige where reasonable, rubber around cables, weathered but legible surfaces |
| Drive | open physical bearing for cups and mechanical pivot for vane; no enclosed servo or future actuator |
| Interface | analog physical dial/pointer and period switches only when needed, no LCD/CRT requirement for this simple station |
| Lighting | sparse warm incandescent or amber/red physical lamp hardware only if connected to useful state; illumination code-owned |
| Infrastructure | visible plausible cable from sensor to indicator; routing and clamps, no gratuitous conduit |
| Autonomy/service | manually installed/calibrated, repairable, service access without hidden magic mechanisms |
| Silhouette | compact low welded legs + tall tubular mast + cup rotor + offset vane + modest analog box |

E0 family-anchor identity to preserve into E1–E5 where function permits: stationary weather sensing, base/mast footprint, recognizable sensing head, and causal wind/forecast feedback. For E1–E5, a separate transition record with at least three changed axes and two preserved traits is required; no lineage approval is asserted by this E0 brief.

## E. Causal events / rig

| Trigger | Hardware motion/response | End condition |
| --- | --- | --- |
| wind field changes | cup rotor speed changes; vane aims along actual prevailing wind | updates only with wind, not cosmetic looping |
| weather preview request | valid physical sensing/indicator response if runtime event exists | finite preview; no imaginary perpetual WORK |
| weather-window selection confirmed | short analog pointer/indicator response if implemented | explicit finish/cooldown |
| weather idle / pause | static structure, no artificial mast rocking | pause/reduced motion respects engine state |

No runtime event wiring is evidenced for the **production two-window design** at pinned `main`. Code/rig/gameplay event QA = **BLOCKED**.

## F. Originals, references, QA and publication

- **Immutable existing raw E0**: generation `943ecfd0-1d0b-4fd2-9ff4-1ac5882c134a`, Drive [file](https://drive.google.com/file/d/1pZnJVdKaLbdGO80jMbS_POP4eIrYMMzI/view?usp=drivesdk), SHA-256 `02bf3b102e870f1bebc6c826246d4e658d2f9a38abaa0bca8c8a82db9b2bd542`, 1,819,367 bytes, RGBA 1024×1536. Actual byte SHA/dimensions **reverified** 2026-11-03.
- Source alpha extrema `[0,254]`; absence of 255 alone is **not** failure. Visual alpha composites on black and white were inspected; no automatic baked-halo conclusion.
- Old `art/gen/placeables/base/weather_complex/e0_1978.pipeline.json` records Pixel Snapper size 15, 32 colors, Aseprite indexed/no-dither 1.3.18.6, output 96×122; runtime bytes prove exact final SHA exists. `README.md` instead says size 10/pending; `manifest.json` says pending; `sources.json` says ready; `visual_qa.json` lacks exact candidate SHA-bound user approval. **No old approval claim is inherited.**
- Current `art/placeables/PIPELINE_CONFIG.json` version 3 **does not configure B01**. Do not guess/configure family-wide pixel size from a README. No current new `source_prepare`, Pixel Snapper, normalize, Aseprite, QA or candidate was run.
- E0 canonical `art/references/eras/e0_1978/reference-set.json` is `approved_visual_reference_set`. All ten exact Drive originals were fetched and verified against their declared SHA-256 / bytes / 1536×1024 dimensions:
  - materials: `5d49bfa8e8561972226862a70c251e57ad42b0a8fa6242b7649f58868b3c5aee`, `6efe2f5e3a2f0951456a486c2cc5b435da761603e79a2a72e9cb003d109a899d`, `d4407f9e4ac9bcbf48bc1360d3c2d490550d51e2779203c4976769d80d623040`
  - mechanics: `36c52034690af8c1d78221bfe3d849cec175363ac41318b13c144b8c41ad9a46`, `aae9bf1771a4039e8cc58970bea6cbf0d83b97056c601368c858a3a3bc14f374`, `9302dee8e3dc7983d0ff3869504ade2e5adcda5d1eac218f173ea96d5762ffbf`
  - controls: `75013d529f538f0fb38844c4228f9d000f9590cb2a36c433aa5d8abeef0aed08`, `12d2b12960eca24ba2fc3a916c015feefb6d340672d130f737202e721a89cd72`
  - lighting: `4a6d2436c3468d106425933f1640ddbff1cfdb538a81e74070f926cae7d27103`, `cbf1c6c37c9537d9ba257aa6e95769e312920a5bd5be30a2ff0c76ed6ec87c78`.
- All ten source reference images verified locally, **none delivered to imagegen** in this pass. They define transferable construction/drive/controls/light vocabulary, never copy their whole objects.
- Existing asset prompt `art/prompts/b01_weather_complex.md` already embeds the whole style bible. `tools/art_pipeline/build_generation_request.py` appends it again and rejects repetition. A corrected canonical B01 request, SHA digest and literal chat bridge **do not exist**; **generation=BLOCKED**, not attempted. Do not declare the source request valid.
- This brief is not the machine-readable preflight receipt. No `art/briefs/B01_weather_complex_E0.preflight.json` exists yet. Add that and a corrected prompt/config in a reviewed follow-on PR; run `validate_generation_preflight.py` and `build_generation_request.py` with exact files.
- New source gate: `BLOCKED` pending exact-island projection and scene review. Old original visually reads lower/front-side than the approved almost-topdown island; a definitive reject/approve requires real scene composite and explicit SHA-bound review.
- Current candidate SHA: **UNKNOWN / none newly created**. Current visual/scene QA: **PENDING**; approval: **NOT GRANTED**. Historic run evidence: [atlas rebuild](https://github.com/Stolyarovmn/vyshe-neba/actions/runs/39100143288) success on older commit and [runtime QA](https://github.com/Stolyarovmn/vyshe-neba/actions/runs/39101045187) success on older commit; not repeated here.
- Source archive folder: Drive `14v5ev_BCpRTOlLhbELSfdVshzoDJeZ8S`, reverified to exist. Future generated source (only if required after preflight) must be archived untouched there before any processing.
- This document is **docs-only**: no authoring changes to runtime, no art/promote, no user approval, no merge.

## Exact next step

Use [Issue #93](https://github.com/Stolyarovmn/vyshe-neba/issues/93) to reconcile current machine B01 config, correct canonical prompt/style-bible handling, and create fail-closed preflight receipt. Obtain exact HD island PNG bytes for actual composite and authoritative Map Editor JSON. Decide source gate on the SHA-bound old original; only if proven invalid proceed to a new E0 generation with all applicable real E0 reference PNGs and exact request delivery, then archive and review. Production and runtime PRs remain separate; **do not merge automatically**.
