# «Выше неба» — Production Contract v2

**Статус:** нормативное дополнение к `ASSET_PRODUCTION_PIPELINE.md` для новых/изменяемых ассетов. Branch/storage/publication semantics задаёт `RUNTIME_BRANCH_CONTRACT.md`; tracker order и tool pins задаёт `PIPELINE_CONFIG.json`. Этот документ не отменяет exact-SHA approval, immutable originals, measured pivots или ref2game.

Термины: **MUST / ОБЯЗАТЕЛЬНО** — блокирующее требование; **SHOULD / ЖЕЛАТЕЛЬНО** — отклонение допустимо только с записанной причиной; **UNKNOWN** — данных нет, запрещено подставлять догадку.

## 1. Scope

- `ref2game` обязателен для всех 2D game-art запросов.
- World sprites сохраняют отдельный ref2game route.
- W/B placeables используют `tools/art_pipeline`: raw archive → Pixel Snapper → normalize → Aseprite → auto QA → immutable candidate → exact-SHA review.
- `art/style_bible.txt` включается в production request **дословно**; canonical request для receipt-based generation строит `build_generation_request.py`.
- G0/G1/G6 добавляют design/projection/runtime checks. Позднейшая runtime-separation migration уже добавила tracker-step `publish_runtime`; это отражено в `PIPELINE_CONFIG.json` v3 и `RUNTIME_BRANCH_CONTRACT.md`.
- `approved` означает approval конкретного exact image; `integrated`/runtime publication доказывается отдельно.

## 2. Sources of truth

| Что проверяем | Канонический источник |
| --- | --- |
| Process / approval / provenance / timeouts | `ASSET_PRODUCTION_PIPELINE.md`, `ASSET_TASK_TRACKER.md`, `EXECUTION_TIMEOUT_POLICY.md` |
| Branch/storage/publication | `RUNTIME_BRANCH_CONTRACT.md` |
| Ref workflow | current `studioigor/ref2game/codex/SKILL.md` |
| Visual language | `art/style_bible.txt` |
| Gameplay design / parts / lineage | `art/placeables/PRODUCTION_MANIFEST.md` |
| Tool pins / tracker order | `art/placeables/PIPELINE_CONFIG.json` |
| Island layout / anchors / footprint | `art/placeables/BASE_ISLAND_LAYOUT.json` |
| Current runtime names/paths/consumers | pinned `main:game/src/render/manifest.js` + corresponding code/checks |
| Approved geometry | exact approved PNG + SHA-256 + measured metadata |
| Immutable generation source | Google Drive original + SHA-256 + provenance |

При конфликте нельзя выбирать удобный источник. Зафиксировать обе версии, pinned refs/SHA, owner решения и blocker. Runtime code describes current implementation; production manifest remains a design target until integration is proven.

## 3. G0 — design/runtime preflight

Для каждой новой/изменяемой family заполнить brief по `ASSET_BRIEF_TEMPLATE.md` и явно указать:

1. asset id/slug/type/era/status/gameplay role;
2. why/where/when and dependencies;
3. physical construction, supports, joints, service logic;
4. approved visual reference, camera family, coordinate space, footprint/registration;
5. runtime logical name/path/consumer/fallback or `UNKNOWN/integration_pending`;
6. immutable source archive, prompt, provenance, toolchain and QA plan.

Missing gameplay reason, mandatory reference/size/socket or required runtime contract blocks the corresponding stage. Research concepts may exist as `not production`, never as silently ready assets.

## 4. Era lineage

| Era | Engineering character |
| --- | --- |
| E0 / 1978 | hand-built, exposed mechanics, welded supports, analog instruments |
| E1 / 1986 | industrial assembly, hydraulics, protected cabinets, early electronics |
| E2 / 1998 | motorization, CRT/racks, cable routing and diagnostics |
| E3 / 2015 | modular construction, composites, flat displays, enclosed servos |
| E4 / 2035 | robotics, autonomous modules, physical manipulators |
| E5 / 2060 | integrated materials/systems with readable physical function |

Each E(n)→E(n+1) records preserved/replaced/added/why/player signal. Cosmetic recolor is not engineering evolution. Future eras do not default to cyan/holograms.

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
| G0 / design | brief, gameplay reason, source/target, unknowns | no function/reference/contract |
| G1 / anchor | E0 silhouette, physical logic, camera family | wrong projection/impossible mechanism |
| G2 / lineage/source | E1–E5 ledger + exact Drive originals/provenance | source lost / unexplained era |
| G3 / processing | pinned Pixel Snapper → normalize → Aseprite + auto QA | wrong canvas/alpha/palette/registration |
| G4 / candidate | immutable candidate + exact-SHA visual/scene approval | review bound to different PNG |
| G5 / production | `promote` PR → `game-production` only | missing approval/evidence |
| G6 / rig/scene | measured pivots, motion/event/projection/occlusion QA | fake motion / false signal / sticker effect |
| G6b / runtime publication | exact approved bytes + verified mapping/semantics → PR to `main` | missing target, semantic conflict, SHA mismatch |
| G7 / game | applicable runtime build/tests on resulting runtime tree | missing/duplicate asset / broken build |

No invented thresholds. Canvas/palette/pixel-size come from `PIPELINE_CONFIG.json`; performance claims need measured baselines.

## 9. Change control

1. Restore tracker/checkpoint before work; do not regenerate approved art without cause.
2. Docs/art-rule changes, CI/tooling changes and runtime integration changes stay reviewable and separable.
3. Do not edit approved/source bytes outside the production flow.
4. Negative cases matter: missing original, wrong SHA, missing target, duplicate mapping, stale pivot, projection mismatch, eventless WORK.
5. A check is `CI enforced` only when the actual workflow ran successfully.
6. Interactive work follows `EXECUTION_TIMEOUT_POLICY.md`.
7. Every PR reports files/families, refs, checks actually run, blockers, rollback and next step.

## 10. Current verified state — 2026-10-30

Dated evidence below is a checkpoint, not a permanent branch pointer. Re-pin refs before every operation.

- Production reconciliation is canonical through `game-production@62cf089b565a2c082d0f8de6fd70086082e6b6ce`.
- PR #34 exact-head checks: readiness `41111497781` PASS; docs smoke `41111497937` PASS.
- Clean runtime is `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`; `Game runtime build` `41110329403` PASS.
- `main@af80ce...` differs from the earlier runtime asset evidence baseline `1a9362...` only by `.github/workflows/game-ci.yml`; no game code/runtime asset changed.
- Approved HD island source exists in production; the old `pending/unapproved` statement is obsolete.
- B03 runtime mapping is verified (`beacons`, `bld_beacons_<year>`, `game/assets/eras/e<era>-<year>/base/beacons.png`), but production tracking/corridor + moving-head/lamp semantics conflict with current landing-tolerance behavior. `publish_runtime` remains BLOCKED on semantics/rig integration.
- B03 currently has no accepted replacement E0 source: two 2026-10-30 generations were archived untouched and source-rejected before processing.
- GitHub Actions runner assignment succeeded for the cited runs; the earlier `runner_id=0/steps=[]` infrastructure blocker is no longer a current blocker for those checks.
- `art/runtime/RUNTIME_EXPORTS.json` at `62cf...` still contains stale island `blocked_source_missing` machine metadata even though the source exists. Correct it separately from docs before declaring that export entry canonical-ready.

## 11. Non-negotiable publication rule

Production approval and runtime publication are different facts. `promote` never means “already in game”; `publish_runtime` never becomes success merely because a PR was opened. Exact bytes, exact target, verified semantics, merge/resulting SHA and applicable runtime checks are required.