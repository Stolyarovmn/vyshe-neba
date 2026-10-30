# B03 / landing_guidance — E0 replacement production brief

Based on `art/docs/ASSET_BRIEF_TEMPLATE.md`. Unknown facts are intentionally preserved as `UNKNOWN`; blocked stages are explicit. Branch/publication semantics follow `art/docs/RUNTIME_BRANCH_CONTRACT.md`.

## A. Identity и gameplay

- Asset ID / slug / family / zone: `B03 / landing_guidance / base / launch_core`
- Type: `base`
- Owner / reviewer / branch / commit SHA: `owner UNKNOWN / reviewer user for island reference, B03 reviewer pending / art/production-readiness-v2-20261030 / commit pinned by PR`
- Status: `design` — replacement E0 required; isolated candidate generation and later scene QA are allowed. Production promotion becomes available only after candidate/QA/approval gates. Runtime publication is separately blocked by a verified design-vs-runtime semantics/rig mismatch, not by an unknown asset path.
- Gameplay role / видимый результат, **design target**: `PRODUCTION_MANIFEST.md` says B03 predicts touchdown point, safe corridor and approach state and must not steer the rocket.
- Current runtime behavior at `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e`: building key `beacons` is implemented. `game/src/data/buildings.js` describes landing-zone illumination, landing-tolerance and perfect-landing effects; `game/src/sim/landing.js` actually widens touchdown tolerances by `1 + 0.25 * s.cfg.base.beacons` on the pad. This is **not the same mechanic** as the production-manifest tracking/corridor target.
- Runtime implementation status: asset mapping/consumer **verified**, design-target behavior **not verified/implemented**. Do not call the production-manifest mechanic implemented until a separate runtime integration change proves it.
- Dependencies: the hub uses `profile.buildings.beacons` and the generic building renderer; the layout reserves a symmetric pair at the two `beacons` anchors. The intended future tracking-head/lamp event/state contract is not implemented in the verified runtime.
- Что не входит в scope / новые механики запрещены: this art change does not alter landing physics, autopilot, HUD, guidance corridor, touchdown prediction, reward logic or runtime state machines.

## B. Физическая конструкция

- Опора, нагрузка, материал, габарит, способ изготовления: E0 portable tripod/base → tall mast/yoke → manual optical aiming head → separate physical signal lamp. Material/manufacturing details beyond this hierarchy: `UNKNOWN`.
- Питание/топливо/данные/кабели/трубы: `UNKNOWN`; do not invent visible cabling solely for decoration.
- Parts: `base`; `head`; `lamp`. Mast/yoke is structural geometry connecting base and aiming head.
- Joints / rails / sockets; pivot intent: physical pan/tilt aiming head; bottom-center placement registration target `(23,78)`.
- Measured pivots: `pending` until exact approved replacement art; source measurements: future approved candidate.
- Физическая безопасность, траектория ракеты, коллизии: pair is reserved on opposite sides of the pad in `BASE_ISLAND_LAYOUT.json`; exact collision behavior remains `UNKNOWN` and is not inferred from art placement.

## C. Camera, scene и runtime

- Reference asset URL / SHA-256 / approval status: current HD reference is `art/gen/environment/start_island_hd.meta.json` plus `art/gen/environment/start_island_hd.approval.json`; exact approved SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, approved by user on `2026-10-30T14:33:35Z`. The user-supplied PNG recomputed to Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`, exactly matching `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e:game/assets/shared/island/start-island.png`.
- Camera family: `island_top_3_4`.
- Actual source projection angle: `UNKNOWN`; 47° is not approved evidence.
- Projection calibration: `art/gen/environment/start_island_hd.projection.json`.
- Measured generation proxy: fitted launch-pad ground-circle compression `0.958515`; orthographic-equivalent elevation `73.44°` above the ground plane / `16.56°` from straight top-down. This numeric value is a generation control derived from the approved 2D reference, not a recovered fact about the original 3D camera. Exact reference appearance wins if they differ.
- World space / LP / px conversion: `BASE_ISLAND_LAYOUT.json` v3 says island size `1916×821`, launch origin `[388,375]`, `units_per_px=0.665`, and approximate `1 LP ≈ 1.45 island px` for sprite scale.
- Layout key, anchor, footprint, visible bbox, sprite_px, layers, occlusion: purchase `beacons`; anchors `[283,395]` and `[493,395]`; layout sprite target `[100,77]`, footprint `[90,26]`; production canvas for one beacon `46×82 LP`; configured visible bbox target `38–42 × 70–76 LP`. Layer/occlusion details beyond layout: `UNKNOWN`.
- Gameplay-size, reduced zoom, portrait scene screenshots: `pending`; must be produced after a replacement candidate exists.
- Runtime asset key: `beacons`.
- Runtime logical-name pattern: `bld_beacons_<year>`, produced by `game/src/render/manifest.js::buildingSpriteName` and loaded for every `ART_BUILDINGS` era.
- Runtime consumer: `game/src/render/hub.js` calls `drawPlacedBuildings`; `game/src/render/buildings.js` reads `profile.buildings.beacons`, places both configured anchors and resolves `bld_beacons_<year>` through the generic sprite path.
- Existing canonical runtime target pattern: `game/assets/eras/e<era>-<year>/base/beacons.png`; E0 target exists at `game/assets/eras/e0-1978/base/beacons.png`, Git blob SHA-1 `2a528e56d50a20af1e19ef2c197d01f34794ccf4` on the pinned `main`.
- Runtime fallback: generic `drawBuilding` falls back to procedural drawing only when the resolved sprite is unavailable; B03 is in `ART_BUILDINGS`, so the normal path is the era sprite.
- E0–E5 mapping и размер/registration: configured E0–E5 years `[1978,1986,1998,2015,2035,2060]`; one-beacon canvas `46×82`, registration `(23,78)`, family `pixel_size=12`, <=32 colors.
- Отклонения от утверждённого reference: current replacement E0 not generated yet.

## D. Эпохи: непрерывная lineage

| Era | Сохранено от предыдущей | Заменено / почему | Добавлено / зачем | Материал, приборы, свет, интерфейс | Reference SHA / status |
| --- | --- | --- | --- | --- | --- |
| E0 / 1978 | базовая функция | — | tripod + manual optical aiming head + separate physical lamp | material details `UNKNOWN`; future code owns lamp state | replacement required; previous source `1c9ecd…` rejected after gameplay-size QA |
| E1 / 1986 | physical axis + lamp + portrait silhouette | rebuild only after replacement E0 approval | sectional radio beacon / heavier industrial head | exact materials `UNKNOWN` | archived old source is provenance only, not approved lineage |
| E2 / 1998 | E1 physical ancestry | rebuild only after E1 approval | motorized optical/radio tracker | protected state lamp | archived old source is provenance only |
| E3 / 2015 | physical pan/tilt ancestry | rebuild only after E2 approval | laser-optical multi-sensor head | no baked beam | archived old source is provenance only |
| E4 / 2035 | physical two-axis ancestry | rebuild only after E3 approval | autonomous enclosed servos / multi-sensor head | code-owned state | archived old source is provenance only |
| E5 / 2060 | family scale/registration + physical tracking axes | rebuild only after E4 approval | lightweight directional multispectral head | no hologram/baked FX | archived old source is provenance only |

## E. События, состояния, анимации, сигналы

| Trigger / precondition | State before → after | Parts / motion / limits | Termination, cancel, cooldown | Игровой результат и visual signal | Reduced-motion equivalent |
| --- | --- | --- | --- | --- | --- |
| current runtime | static owned-building draw by `profile.buildings.beacons` | no verified per-part head/lamp rig | no verified B03 state machine | landing tolerances are widened by current simulation; data also defines beacon illumination/perfect-landing effects | current static sprite path |
| production-manifest target | `UNKNOWN` until a separate integration contract is implemented | `head` physically pans/tilts; `lamp` is a state part | `UNKNOWN` | target: safe/unsafe approach + touchdown/corridor acknowledgement | `UNKNOWN` |

- Источник текущих gameplay values: `game/src/data/buildings.js` + `game/src/sim/landing.js` on pinned `main`; do not reinterpret them as the future tracking mechanic.
- Источник будущих indicator patterns / head tracking: `UNKNOWN / BLOCKED` until a separate runtime state/event integration is specified and implemented.
- Idle без ложной работы; ветер/погода/ночь/пауза: no fake perpetual WORK. Current runtime does not provide the production-manifest head/lamp state machine.
- Что рисует AI, что анимирует/подсвечивает код: AI draws complete physical beacon parts. Intended future code owns head motion and lamp state. Guidance corridor, predicted touchdown marker, beams/light cones and HUD remain code-only and are not baked into the art.
- Rest reconstruction / motion sheet / event integration evidence: `pending`; runtime publication of the new design stays blocked until the intended rig/state semantics are resolved or the production manifest is deliberately revised to match current runtime behavior.

## F. Source, QA, production promotion, runtime publication

- Prompt path + verbatim style bible check: `art/prompts/b03_landing_guidance.md`; production request must be built with `tools/art_pipeline/build_generation_request.py`, which appends `art/style_bible.txt` verbatim and injects the measured island projection proxy.
- Source gen ID / exact original SHA / dimensions / Drive ID: replacement source `pending`. Existing E0 `7b0172e8-a316-4f42-bf91-7355d46037d3`, SHA-256 `1c9ecd76cdd455f97fe9f1d25c7acd6d94523b64a6120438fd360e3112599b11`, dimensions `1167×1347`, Drive ID `1yYEphiPqV0bK4P71sNG-u5Gm3iLyfTu7` is archived but rejected by gameplay-size QA.
- Previous-era + E0 reference IDs: replacement E0 must become the new root; old E1–E5 remain archived provenance only.
- Pipeline config / tool revisions / candidate SHA: target migration `PIPELINE_CONFIG.json` v3; Pixel Snapper revision `ae20461f60fb39e75d15f184bab1ebec1219511c`; Aseprite `1.3.18.6`; candidate SHA `pending`.
- Auto QA: `pending`.
- Visual SHA-bound QA: `pending`.
- Projection/scene QA: `pending`; approved island + measured generation proxy are available, but scene approval still requires an actual replacement candidate composited at real scale/zoom/occlusion.
- Production promotion (`promote`): `pending`, not blocked by the runtime semantic mismatch. It may open after the exact replacement candidate passes archive/processing/auto-QA/visual/scene gates and stores approved art only in `game-production`.
- Runtime mapping: **verified** for `beacons` / `bld_beacons_<year>` / `game/assets/eras/e<era>-<year>/base/beacons.png` on pinned `main`.
- Runtime publication (`publish_runtime`): `BLOCKED` by semantics/rig integration, not by unknown path. Current runtime gameplay behavior and the production-manifest target differ materially; publishing the new art as if the target mechanic were implemented would be a false integration claim.
- Rig/event QA: `BLOCKED` until the intended tracking head/lamp state machine is implemented and verified, or the production manifest is deliberately changed to the current runtime contract in a separate reviewed decision.
- Game regression: `BLOCKED` until a runtime publication/integration PR exists. At checked `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e`, `game/test` is absent, so no same-commit runtime test is claimed.
- Open blockers / reason / owner / next action: (1) replacement E0 source not generated; generate one isolated tall/narrow beacon and archive untouched original; (2) resolve B03 design-target vs current-runtime semantics/rig integration before `publish_runtime`; (3) GitHub Actions currently fail before runner assignment, tracked in issue #29.
- Rollback (previous approved version): no production-approved B03 lineage is recorded; old E0–E5 originals remain archived provenance and must not be promoted as current production art.

**Generation target:** one isolated B03 E0 beacon only. **Scene QA target:** open after candidate creation. **Production promotion target:** pending until candidate gates pass. **Runtime publication target:** BLOCKED by verified semantics/rig integration mismatch, not by an unknown runtime path.
