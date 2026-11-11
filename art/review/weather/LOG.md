# Журнал попыток: weather

> История перенесена 2026-11-11 из `art/briefs/B01_weather_complex_E0.md`. Исходный текст ниже сохранён дословно и в прежнем порядке; старые статусы, углы, пути и блокировки — исторические свидетельства. Действующий [паспорт](../../briefs/B01_weather_complex_E0.md).

Контрольная сумма перенесённого текста SHA-256: `4b34abd520db05e94b81ab268396ea2c70810851318fb51240e800de87d12141`.

---

# B01 / weather_complex / E0 1978 — production asset brief

**Status:** `source_projection_FAIL_assistant_review` for exact E0 original `98084e7dc6668c2f499eb477dc64f7ee199c6da6713d8679471675363c39d491`. This is not user rejection or approval. Replacement source generation and technical processing remain subject to exact prerequisite gates. See [Issue #93](https://github.com/Stolyarovmn/vyshe-neba/issues/93).

**Reviewed checkpoint baseline (not a permanent branch pointer):** `game-production@e5c53a0542416010020d191c106545218a9b82b4`, `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`. Durable tracker: [Issue #93](https://github.com/Stolyarovmn/vyshe-neba/issues/93). Re-pin after merge.

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
- `art/placeables/BASE_ISLAND_LAYOUT.json` version 3: key `weather`, `zone=command_north`, old island anchor `[1000,350]`, old `sprite_px=[142,180]`, `footprint_px=[100,28]`; `IDEA_BANK_PLACEABLES.md` design footprint `96×122 LP`, socket `roof|yard`, bottom-center design anchor `[48,118]` on 96×122 legacy processed art.
- **Map Editor final placement, displayed dimensions and on-site occlusion: UNKNOWN — separate later user gate.** Old layout numbers are illustrative TEST_ONLY coordinates, **not** authorized for map integration. Production art QA checks how exact source/candidate looks compared with the approved island at normal/reduced gameplay zoom; **no Map Editor JSON is needed for production-art review**. The latest TEST_ONLY composite exists, but projection mismatch was recorded as assistant self-review FAIL. Final placement land mask/contact/occlusion checks await user Map Editor approval.
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
- Current merged `art/placeables/PIPELINE_CONFIG.json` does **not** configure B01. A proposed family-wide `pixel_size=15` config (six historic E0–E5 pipeline records), source review and preflight are in stacked draft [PR #97](https://github.com/Stolyarovmn/vyshe-neba/pull/97), **not merged**. No new source_prepare, Pixel Snapper, normalize, Aseprite, candidate or QA has run.
- E0 canonical `art/references/eras/e0_1978/reference-set.json` is `approved_visual_reference_set`. All ten exact Drive originals were fetched and verified against their declared SHA-256 / bytes / 1536×1024 dimensions:
  - materials: `5d49bfa8e8561972226862a70c251e57ad42b0a8fa6242b7649f58868b3c5aee`, `6efe2f5e3a2f0951456a486c2cc5b435da761603e79a2a72e9cb003d109a899d`, `d4407f9e4ac9bcbf48bc1360d3c2d490550d51e2779203c4976769d80d623040`
  - mechanics: `36c52034690af8c1d78221bfe3d849cec175363ac41318b13c144b8c41ad9a46`, `aae9bf1771a4039e8cc58970bea6cbf0d83b97056c601368c858a3a3bc14f374`, `9302dee8e3dc7983d0ff3869504ade2e5adcda5d1eac218f173ea96d5762ffbf`
  - controls: `75013d529f538f0fb38844c4228f9d000f9590cb2a36c433aa5d8abeef0aed08`, `12d2b12960eca24ba2fc3a916c015feefb6d340672d130f737202e721a89cd72`
  - lighting: `4a6d2436c3468d106425933f1640ddbff1cfdb538a81e74070f926cae7d27103`, `cbf1c6c37c9537d9ba257aa6e95769e312920a5bd5be30a2ff0c76ed6ec87c78`.
- All ten source reference images verified locally, **none delivered to imagegen** in this pass. They define transferable construction/drive/controls/light vocabulary, never copy their whole objects.
- Existing *legacy* `art/prompts/b01_weather_complex.md` embeds the style bible and cannot be used with deterministic builder unchanged. Corrected **E0-only** prompt at `art/prompts/b01_weather_complex_e0.md` is proposed in [PR #97](https://github.com/Stolyarovmn/vyshe-neba/pull/97), but exact current request digest/bridge and actual delivery of ten E0 reference PNGs plus island for a replacement remain **UNVERIFIED/BLOCKED**; do not reuse historic request SHA after edits.
- This brief is not machine-readable preflight. A draft `art/briefs/B01_weather_complex_E0.preflight.json` exists only on stacked feature PR #97, currently binding source FAIL to the correct original SHA. Until its current baseline/config/prompt are reviewed/merged and exact request+PNG-image delivery validated, **replacement generation remains BLOCKED**.
- **Latest source gate: FAIL (assistant visual reviewer) on exact original SHA `98084e7dc6668c2f499eb477dc64f7ee199c6da6713d8679471675363c39d491`.** TEST_ONLY composite with exact SHA-bound approved island has been reviewed: visible top/base planes and near-frontal instrument face are inconsistent with the near-overhead island camera family. Original 3D camera angle remains UNKNOWN; 73.44° is island generation proxy only. Record: `art/qa/placeables/base/weather_complex/e0_1978.source_review.json` in PR #97. No user source approval claimed.
- Current **processed** candidate SHA: **UNKNOWN / none newly created**. Current post-processing visual QA: **NOT RUN**; source review FAIL; user exact-SHA approval **NOT GIVEN**. Historic run evidence: [atlas rebuild](https://github.com/Stolyarovmn/vyshe-neba/actions/runs/39100143288) success on older commit and [runtime QA](https://github.com/Stolyarovmn/vyshe-neba/actions/runs/39101045187) success on older commit; not repeated here.
- Source archive folder: Drive `14v5ev_BCpRTOlLhbELSfdVshzoDJeZ8S`, reverified to exist. Future generated source (only if required after preflight) must be archived untouched there before any processing.
- This document is **docs-only**: no authoring changes to runtime, no art/promote, no user approval, no merge.

## Exact next step

Use [Issue #93](https://github.com/Stolyarovmn/vyshe-neba/issues/93) and stacked PR #97. The current source has a SHA-bound assistant projection FAIL, so **do not reprocess it**. Reconcile the E0-only prompt path in B01 machine config with the receipt; rerun canonical preflight and request digest on the resulting reviewed production commit. Only generate a camera-corrected replacement if the complete literal request and the actual ten SHA-verified reference PNGs plus approved island image are delivered to imagegen, then archive untouched new original with SHA+Drive readback before any processing. Validate source projection in TEST_ONLY composite. Map Editor approval is **later**, not a prerequisite for sprite production. Runtime mechanics conflict remains separate; **do not merge subsequent PRs automatically**.
