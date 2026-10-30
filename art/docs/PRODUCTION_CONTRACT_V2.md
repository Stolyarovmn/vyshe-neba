# «Выше неба» — Production Contract v2

**Статус:** нормативное дополнение к `ASSET_PRODUCTION_PIPELINE.md` для новых/изменяемых ассетов. Branch/storage/publication semantics задаёт `RUNTIME_BRANCH_CONTRACT.md`; tracker order и tool pins задаёт `PIPELINE_CONFIG.json`; visual/engineering language эпох E0–E5 задаёт `ERA_DESIGN_MATRIX.md`. Этот документ не отменяет exact-SHA approval, immutable originals, measured pivots или ref2game.

Термины: **MUST / ОБЯЗАТЕЛЬНО** — блокирующее требование; **SHOULD / ЖЕЛАТЕЛЬНО** — отклонение допустимо только с записанной причиной; **UNKNOWN** — данных нет, запрещено подставлять догадку.

## 1. Scope

- `ref2game` обязателен для всех 2D game-art запросов.
- World sprites сохраняют отдельный ref2game route.
- W/B placeables используют `tools/art_pipeline`: raw archive → Pixel Snapper → normalize → Aseprite → auto QA → immutable candidate → exact-SHA review.
- `art/style_bible.txt` включается в production request **дословно**; canonical request для receipt-based generation строит `build_generation_request.py`.
- `art/docs/ERA_DESIGN_MATRIX.md` обязателен для любой generation/review стадии, где выбирается или сравнивается эпоха E0–E5.
- G0/G1/G2/G6 добавляют design/era/projection/runtime checks. Runtime-separation migration добавила tracker-step `publish_runtime`; это отражено в `PIPELINE_CONFIG.json` v3 и `RUNTIME_BRANCH_CONTRACT.md`.
- `approved` означает approval конкретного exact image; `integrated`/runtime publication доказывается отдельно.

## 2. Sources of truth

| Что проверяем | Канонический источник |
| --- | --- |
| Process / approval / provenance / timeouts | `ASSET_PRODUCTION_PIPELINE.md`, `ASSET_TASK_TRACKER.md`, `EXECUTION_TIMEOUT_POLICY.md` |
| Branch/storage/publication | `RUNTIME_BRANCH_CONTRACT.md` |
| Ref workflow | current `studioigor/ref2game/codex/SKILL.md` |
| Visual language | `art/style_bible.txt` |
| **Era visual/engineering language E0–E5** | **`art/docs/ERA_DESIGN_MATRIX.md`** |
| Gameplay design / parts / object lineage | `art/placeables/PRODUCTION_MANIFEST.md` |
| Tool pins / tracker order | `art/placeables/PIPELINE_CONFIG.json` |
| Island layout / anchors / footprint | `art/placeables/BASE_ISLAND_LAYOUT.json` |
| Current runtime names/paths/consumers | pinned `main:game/src/render/manifest.js` + corresponding code/checks |
| Approved geometry | exact approved PNG + SHA-256 + measured metadata |
| Immutable generation source | Google Drive original + SHA-256 + provenance |

При конфликте нельзя выбирать удобный источник. Зафиксировать обе версии, pinned refs/SHA, owner решения и blocker. Runtime code describes current implementation; production manifest remains a design target until integration is proven.

`ERA_DESIGN_MATRIX.md` отвечает за общий язык эпох; `PRODUCTION_MANIFEST.md` отвечает за функцию и конкретную родословную объекта. Матрица не разрешает менять gameplay role или добавлять случайные parts; manifest не разрешает игнорировать era-language.

## 3. G0 — design/runtime preflight

Для каждой новой/изменяемой family заполнить brief по `ASSET_BRIEF_TEMPLATE.md` и явно указать:

1. asset id/slug/type/era/status/gameplay role;
2. why/where/when and dependencies;
3. physical construction, supports, joints, service logic;
4. approved visual reference, camera family, coordinate space, footprint/registration;
5. runtime logical name/path/consumer/fallback or `UNKNOWN/integration_pending`;
6. immutable source archive, prompt, provenance, toolchain and QA plan;
7. applicable era profile из `ERA_DESIGN_MATRIX.md` по восьми axes: manufacturing, materials, drive, interface, lighting, infrastructure, autonomy/service, silhouette/architecture.

Missing gameplay reason, mandatory reference/size/socket, mandatory era evidence or required runtime contract blocks the corresponding stage. Research concepts may exist as `not production`, never as silently ready assets.

## 4. Era lineage — mandatory contract

Подробная матрица находится в [`ERA_DESIGN_MATRIX.md`](ERA_DESIGN_MATRIX.md) и является обязательной.

Краткая последовательность:

| Era | Engineering / visual character |
| --- | --- |
| E0 / 1978 | hand-built/state-military-utilitarian language, exposed mechanics, welded supports, analog controls, sparse warm lamps |
| E1 / 1986 | standardized industrial assembly, hydraulics/electromechanics, cabinets, cable trays/pipe racks, denser functional indicators |
| E2 / 1998 | motorization, CRT/racks, beige/gray plastics, cable routing, diagnostics and visible electronics complexity |
| E3 / 2015 | mature modular commercial/institutional spaceport, composites, flat displays, enclosed servos, cleaner surfaces |
| E4 / 2035 | autonomous robotics + glass architectural language; panoramic/curtain-wall glazing for suitable buildings, sensor-rich autonomous machines |
| E5 / 2060 | sterile integrated post-screen systems; spatial/holographic UI where needed, contactless/levitating mobility for mobile equipment, functional embedded light paths |

### 4.1 Transition rule

Each `E(n)→E(n+1)` MUST:

- record `preserved / replaced / added / why / player signal`;
- noticeably change at least **3 of the 8** era axes defined in `ERA_DESIGN_MATRIX.md`;
- preserve at least **2 recognizable family traits** when physical function allows;
- remain the same causal object family rather than becoming six unrelated concepts.

Between E0 and E5 at least **6 of 8** era axes must change radically.

Cosmetic recolor, adding cyan, adding more glow or merely changing housing shape is not engineering evolution.

### 4.2 Blind-order review

Without year/era labels, reviewer SHOULD be able to order E0–E5 by technological progression using construction, materials, mechanics, UI and silhouette — not palette alone. Failure blocks era approval until corrected or an explicit exception is recorded.

### 4.3 E4 rule

E4 MUST read as autonomous/robotic rather than “E3 with blue light”. Suitable large buildings SHOULD use the project’s E4 glass language: panoramic/curtain-wall glazing, transparent service galleries/control volumes and light structural framing. Functional/safety reasons may override glass usage; the exception is written in the brief.

### 4.4 E5 rule

E5 may and, where applicable, SHOULD use spatial/holographic interfaces, levitation/contactless mobility, integrated light lines and cold blue-white functional accents as era-defining technologies.

This does **not** permit generic sci-fi decoration:

- complex UI uses spatial/volumetric holographic presentation instead of a permanent rectangular screen when the function requires UI;
- AI draws projector/emitter/aperture/interface hardware; active holographic content, animation and glow are code-owned;
- mobile E5 equipment defaults to physically explained hover/levitation/contactless locomotion instead of conventional wheels/tracks; AI draws lift pads/field modules/stabilizers, code owns hover motion/field FX;
- conventional ground contact in E5 requires a written functional reason;
- light lines must mean state/path/routing/load/navigation/warning/transfer or another explicit function;
- hologram/cyan/glow/levitation/light strips cannot substitute for a required physical mechanism.

## 5. Projection, scale and scene placement

Camera families are separate:

- island/ground purchases: `island_top_3_4` from the exact approved island reference;
- workshop: approved interior family;
- aircraft/hazards: side/slight-3/4 side per style bible.

### Current approved island evidence

`start_island_hd` is **approved**, not pending:

- production reference: `art/gen/environment/start_island_hd.png`;
- SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`;
- Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`;
- dimensions `1916×821`;
- approval record `art/gen/environment/start_island_hd.approval.json`;
- projection record `art/gen/environment/start_island_hd.projection.json`.

Actual original 3D camera angle remains `UNKNOWN`. **47° is unsupported.**

Measured ground-circle proxy:

- compression `0.958515`;
- orthographic-equivalent elevation `73.4386°` (`73.44°` production control);
- tilt from top-down `16.5614°` (`16.56°` production control).

This is generation control only. Exact reference appearance wins. A generated source must still pass visual projection review; a low/front-side result is rejected even if the request contained the proxy.

For every ground candidate: verify `BASE_ISLAND_LAYOUT.json`, scale conversion, anchor, footprint, contact, occlusion, land mask and real-scale/reduced-zoom composite. Do not bake cast shadow.

## 6. Physics, animation and causal signals

- AI draws complete physical parts; code owns rig/state/light/data/FX.
- Do not fake a mechanism by bobbing/rotating/scaling the whole sprite when real moving parts exist.
- `WORK` needs trigger, precondition, state transition, affected parts, termination/cancel/cooldown and gameplay result.
- Default causal sequence: `OFF → IDLE → NOTICE → WORK → FINISH → COOLDOWN → IDLE` unless documented otherwise.
- No eventless perpetual WORK.
- Critical state cannot be encoded by color alone.
- Measured pivots come only from exact approved art.
- Era-specific signal technology follows `ERA_DESIGN_MATRIX.md`; the need for a signal still comes from gameplay/state causality.
- Holograms, field visualization, glow, levitation motion, sparks, leaks, beams and other active effects are code-owned unless an environmental asset explicitly requires a static effect.

## 7. Runtime compatibility gate

Before production promotion, document the expected runtime target; before runtime publication, verify it against pinned `main`:

- asset/family/era ↔ logical name/path;
- `ERA_YEARS` and actual asset resolver;
- consumer, layers, anchor/registration, fallback;
- `BROKEN_PLACEABLE_ERAS`/procedural fallback when present;
- duplicate/missing files and clean runtime tree.

Current `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` has no `game/test` directory. Therefore old references to `game/test/render.manifest.test.mjs` or `game/test/render.island.test.mjs` are **not current executable gates**. Current `Game runtime build` checks clean-tree policy, manifest resolution and standalone build/checksum. Asset-specific regression must be claimed only when such a test/QA path actually exists and runs on the relevant runtime commit.

## 8. QA / release gates

| Gate | Required | Blocking example |
| --- | --- | --- |
| G0 / design | brief, gameplay reason, source/target, era matrix profile, unknowns | no function/reference/era contract |
| G1 / anchor | E0 silhouette, physical logic, camera family | wrong projection/impossible mechanism |
| G2 / lineage/source | E1–E5 ledger + era-transition evidence + exact Drive originals/provenance | source lost / recolor lineage / unexplained era |
| G3 / processing | pinned Pixel Snapper → normalize → Aseprite + auto QA | wrong canvas/alpha/palette/registration |
| G4 / candidate | immutable candidate + exact-SHA visual/scene/era approval | review bound to different PNG / era unreadable |
| G5 / production | `promote` PR → `game-production` only | missing approval/evidence |
| G6 / rig/scene | measured pivots, motion/event/projection/occlusion QA | fake motion / false signal / sticker effect |
| G6b / runtime publication | exact approved bytes + verified mapping/semantics → PR to `main` | missing target, semantic conflict, SHA mismatch |
| G7 / game | applicable runtime build/tests on resulting runtime tree | missing/duplicate asset / broken build |

No invented asset-processing thresholds. Canvas/palette/pixel-size come from `PIPELINE_CONFIG.json`; performance claims need measured baselines. Era transition thresholds in `ERA_DESIGN_MATRIX.md` are design-review rules explicitly adopted by the project, not image-processing measurements.

## 9. Change control

1. Restore tracker/checkpoint before work; do not regenerate approved art without cause.
2. Docs/art-rule changes, CI/tooling changes and runtime integration changes stay reviewable and separable.
3. Do not edit approved/source bytes outside the production flow.
4. Negative cases matter: missing original, wrong SHA, missing target, duplicate mapping, stale pivot, projection mismatch, eventless WORK, era recolor, unsupported E5 magic/no-hardware levitation.
5. A check is `CI enforced` only when the actual workflow ran successfully.
6. Interactive work follows `EXECUTION_TIMEOUT_POLICY.md`.
7. Every PR reports files/families, refs, checks actually run, blockers, rollback and next step.

## 10. Current verified state — 2026-10-30

Dated evidence below is a checkpoint, not a permanent branch pointer. Re-pin refs before every operation.

- Current canonical production is `game-production@f04ffcef5bb651275ee53da7ecb0ae7119124d11`, after merged docs #35 and runtime-metadata #36.
- Clean runtime is `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`; `Game runtime build` run `41110329403` PASS.
- `art/runtime/RUNTIME_EXPORTS.json` now marks `ENV_START_ISLAND_HD` `status=ready` with source SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`; the former `blocked_source_missing` contradiction is obsolete.
- Approved HD island source exists in production; actual original 3D camera angle remains UNKNOWN.
- B03 runtime mapping is verified (`beacons`, `bld_beacons_<year>`, existing `base/beacons.png` targets), but production tracking/corridor + moving-head/lamp semantics conflict with current landing-tolerance behavior. `publish_runtime` remains BLOCKED on semantics/rig integration.
- B03 currently has no accepted replacement E0 source. Three 2026-10-30 replacement attempts were archived untouched and source-rejected before destructive processing; attempt 3 SHA-256 is `10c97d1f0d00909ca3ce71648b34b34245eec219a95d4039f7f48cc736b73f0f`.
- PR #37 (`prompt/b03-e0-source-gate-20261030`, head `37ca1d996a2478dba9296cc845237546b96c06ce`) tightens the B03 E0 source geometry/projection gate; exact-head readiness run `41121187447` PASS and docs smoke `41121187439` PASS. It remains a separate unmerged prompt change at this checkpoint.
- GitHub Actions runner assignment succeeded for the cited runs; the earlier billing/runner-assignment blocker is not current for those checks.

## 11. Non-negotiable publication rule

Production approval and runtime publication are different facts. `promote` never means “already in game”; `publish_runtime` never becomes success merely because a PR was opened. Exact bytes, exact target, verified semantics, merge/resulting SHA and applicable runtime checks are required.
