# B03 / landing_guidance — E0 replacement production brief

Based on `art/docs/ASSET_BRIEF_TEMPLATE.md`. Unknown facts are intentionally preserved as `UNKNOWN`; blocked stages are explicit.

## A. Identity и gameplay

- Asset ID / slug / family / zone: `B03 / landing_guidance / base / launch_core`
- Type: `base`
- Owner / reviewer / branch / commit SHA: `owner UNKNOWN / reviewer user for island reference, B03 reviewer pending / art/production-readiness-v2-20261030 / commit pinned by PR`
- Status: `design` — replacement E0 required; isolated candidate generation and later scene QA are allowed; runtime integration/promotion remain blocked as noted below.
- Gameplay role / видимый результат: design target from `PRODUCTION_MANIFEST.md` — predict touchdown point, safe corridor and approach state; it must not steer the rocket.
- Почему существует; почему здесь; почему в этой эпохе: landing-guidance information beside the launch pad; E0 is the 1978 root of the family. Runtime implementation of the design target is `UNKNOWN`.
- Реализовано в runtime? `UNKNOWN / integration_pending`; `main:game/src/render/manifest.js` at `1a9362aceff825f99cf0b0481351bff0e5c6e04e` contains no `landing_guidance` logical name.
- Зависимости: design docs say purchase `beacons` places a symmetric pair by code. Actual purchase/event wiring: `UNKNOWN` until runtime consumer verification.
- Что не входит в scope / новые механики запрещены: no autopilot, no baked guidance corridor/touchdown marker/laser beam/HUD, no new gameplay implementation in this art change.

## B. Физическая конструкция

- Опора, нагрузка, материал, габарит, способ изготовления: E0 portable tripod/base → tall mast/yoke → manual optical aiming head → separate physical signal lamp. Material/manufacturing details beyond this hierarchy: `UNKNOWN`.
- Питание/топливо/данные/кабели/трубы: `UNKNOWN`; do not invent visible cabling solely for decoration.
- Parts: `base`; `head`; `lamp`. Mast/yoke is structural geometry connecting base and aiming head.
- Joints / rails / sockets; pivot intent: physical pan/tilt aiming head; bottom-center placement registration target `(23,78)`.
- Measured pivots: `pending` until exact approved replacement art; source measurements: future approved candidate.
- Физическая безопасность, траектория ракеты, коллизии: pair is reserved on opposite sides of the pad in `BASE_ISLAND_LAYOUT.json`; exact collision behavior in runtime: `UNKNOWN`.

## C. Camera, scene и runtime

- Reference asset URL / SHA-256 / approval status: current HD reference is `art/gen/environment/start_island_hd.meta.json` plus `art/gen/environment/start_island_hd.approval.json`; exact approved SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, approved by user on `2026-10-30T14:33:35Z`. The user-supplied PNG recomputed to Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`, exactly matching `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e:game/assets/shared/island/start-island.png`.
- Camera family: `island_top_3_4`.
- Actual source projection angle: `UNKNOWN`; 47° is not approved evidence.
- Projection calibration: `art/gen/environment/start_island_hd.projection.json`.
- Measured generation proxy: fitted launch-pad ground-circle compression `0.958515`; orthographic-equivalent elevation `73.44°` above the ground plane / `16.56°` from straight top-down. This numeric value is a generation control derived from the approved 2D reference, not a recovered fact about the original 3D camera. Exact reference appearance wins if they differ.
- World space / LP / px conversion: `BASE_ISLAND_LAYOUT.json` v3 says island size `1916×821`, launch origin `[388,375]`, `units_per_px=0.665`, and approximate `1 LP ≈ 1.45 island px` for sprite scale.
- Layout key, anchor, footprint, visible bbox, sprite_px, layers, occlusion: purchase `beacons`; anchors `[283,395]` and `[493,395]`; layout sprite target `[100,77]`, footprint `[90,26]`; production canvas for one beacon `46×82 LP`; configured visible bbox target `38–42 × 70–76 LP`. Layer/occlusion details beyond layout: `UNKNOWN`.
- Gameplay-size, reduced zoom, portrait scene screenshots: `pending`; must be produced after a replacement candidate exists.
- Runtime logical name / path / consumer / fallback: `UNKNOWN / integration_pending`; do not invent a manifest entry.
- E0–E5 mapping и размер/registration: configured E0–E5 years `[1978,1986,1998,2015,2035,2060]`; one-beacon canvas `46×82`, registration `(23,78)`, family `pixel_size=12`, <=32 colors.
- Отклонения от утверждённого reference: current replacement E0 not generated yet.

## D. Эпохи: непрерывная lineage

| Era | Сохранено от предыдущей | Заменено / почему | Добавлено / зачем | Материал, приборы, свет, интерфейс | Reference SHA / status |
| --- | --- | --- | --- | --- | --- |
| E0 / 1978 | базовая функция | — | tripod + manual optical aiming head + separate physical lamp | material details `UNKNOWN`; code owns lamp state | replacement required; previous source `1c9ecd…` rejected after gameplay-size QA |
| E1 / 1986 | physical axis + lamp + portrait silhouette | rebuild only after replacement E0 approval | sectional radio beacon / heavier industrial head | exact materials `UNKNOWN` | archived old source is provenance only, not approved lineage |
| E2 / 1998 | E1 physical ancestry | rebuild only after E1 approval | motorized optical/radio tracker | protected state lamp | archived old source is provenance only |
| E3 / 2015 | physical pan/tilt ancestry | rebuild only after E2 approval | laser-optical multi-sensor head | no baked beam | archived old source is provenance only |
| E4 / 2035 | physical two-axis ancestry | rebuild only after E3 approval | autonomous enclosed servos / multi-sensor head | code-owned state | archived old source is provenance only |
| E5 / 2060 | family scale/registration + physical tracking axes | rebuild only after E4 approval | lightweight directional multispectral head | no hologram/baked FX | archived old source is provenance only |

## E. События, состояния, анимации, сигналы

| Trigger / precondition | State before → after | Parts / motion / limits | Termination, cancel, cooldown | Игровой результат и visual signal | Reduced-motion equivalent |
| --- | --- | --- | --- | --- | --- |
| tracking design target / runtime wiring `UNKNOWN` | `UNKNOWN` until event contract is verified | `head` physically pans/tilts; `lamp` is a state part | `UNKNOWN` | design target: safe/unsafe approach + touchdown acknowledgement | `UNKNOWN` |

- Источник значений для индикаторов и смысл цвета/паттерна: `UNKNOWN / BLOCKED` until runtime event/state source is verified.
- Idle без ложной работы; ветер/погода/ночь/пауза: no fake perpetual WORK; detailed state integration `UNKNOWN`.
- Что рисует AI, что анимирует/подсвечивает код: AI draws the complete physical beacon parts; code owns head motion, lamp state, guidance corridor, predicted touchdown marker, beams/light cones, HUD and other FX.
- Rest reconstruction / motion sheet / event integration evidence: `pending`.

## F. Source, QA, promotion

- Prompt path + verbatim style bible check: `art/prompts/b03_landing_guidance.md`; production request must be built with `tools/art_pipeline/build_generation_request.py`, which appends `art/style_bible.txt` verbatim and injects the measured island projection proxy.
- Source gen ID / exact original SHA / dimensions / Drive ID: replacement source `pending`. Existing E0 `7b0172e8-a316-4f42-bf91-7355d46037d3`, SHA-256 `1c9ecd76cdd455f97fe9f1d25c7acd6d94523b64a6120438fd360e3112599b11`, dimensions `1167×1347`, Drive ID `1yYEphiPqV0bK4P71sNG-u5Gm3iLyfTu7` is archived but rejected by gameplay-size QA.
- Previous-era + E0 reference IDs: replacement E0 must become the new root; old E1–E5 remain archived provenance only.
- Pipeline config / tool revisions / candidate SHA: `PIPELINE_CONFIG.json` v2; Pixel Snapper revision `ae20461f60fb39e75d15f184bab1ebec1219511c`; Aseprite `1.3.18.6`; candidate SHA `pending`.
- Auto QA: `pending`.
- Visual SHA-bound QA: `pending`.
- Projection/scene QA: `pending`; approved island + measured generation proxy are available, but scene approval still requires an actual replacement candidate composited at real scale/zoom/occlusion.
- Rig/event QA: `BLOCKED` until runtime event/state consumer is identified.
- Runtime contract / game regression: `BLOCKED`; runtime logical name/consumer not verified. At checked `main@1a9362aceff825f99cf0b0481351bff0e5c6e04e`, `game/test` is absent, so no same-commit runtime test is claimed.
- Open blockers / reason / owner / next action: (1) replacement E0 source not generated; generate one isolated tall/narrow beacon and archive untouched original; (2) runtime integration contract `UNKNOWN`; resolve in separate runtime/CI work before promotion; (3) GitHub Actions currently fails before runner assignment, tracked in issue #29.
- Rollback (previous approved version): no production-approved B03 lineage is recorded; old E0–E5 originals remain archived provenance and must not be promoted.

**Generation target:** one isolated B03 E0 beacon only. **Scene QA target:** open after candidate creation. **Promotion target:** BLOCKED until runtime/event/integration gates pass.
