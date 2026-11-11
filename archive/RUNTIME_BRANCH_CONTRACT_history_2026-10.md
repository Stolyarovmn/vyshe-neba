# История контракта публикации: октябрь 2026

> **Архив, не действующий процесс.** Перенесено 2026-11-11 из контракта публикации. Ниже дословно сохранены исторические разделы, включая прежние статусы и английский текст. Они не описывают текущие ветки, блокировки или обязательные действия. Действующие правила: [Публикация в main](../art/docs/RUNTIME_BRANCH_CONTRACT.md).

### Trigger contract while `main` is default

Production-only workflows are not copied into `main` merely to expose `workflow_dispatch`. Canonical control-plane refs are ephemeral command branches based on the exact current `game-production` SHA:

- `asset-promote/**` changes only `.asset-command/promote.json`;
- `asset-publish-runtime/**` changes only `.asset-command/publish-runtime.json`.

Command JSON contains at minimum:

```json
{
  "asset": "B03",
  "production_base_sha": "<exact current game-production SHA>"
}
```

The workflow must verify the exact production base, reject any additional diff, and reset the command-only commit before staging production/runtime changes. Command branches are control-plane refs, not production/runtime history.

## Verified B03 runtime mapping and semantic conflict

The B03 mapping was re-verified against `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721`:

- production family `B03 / landing_guidance` corresponds to runtime building key `beacons`;
- logical names are `bld_beacons_<year>` through `buildingSpriteName`;
- canonical targets exist at `game/assets/eras/e<era>-<year>/base/beacons.png` for E0–E5;
- `game/src/render/buildings.js::drawBuilding` resolves the sprite, driven by `profile.buildings.beacons`;
- current simulation widens landing tolerances through the beacon level;
- `IDEA_BANK_PLACEABLES.md` instead targets touchdown/corridor prediction plus a physically tracking `head` and state `lamp`.

Therefore path/consumer are verified, but `publish_runtime` remains **BLOCKED by semantics/rig integration**, not by path discovery. This blocker does not prevent preserving a future exact-approved B03 lineage in `game-production` after production gates pass.

`main@af80ce...` differs from the earlier mapping baseline `1a9362...` only by `.github/workflows/game-ci.yml`; no game code or runtime asset changed in that transition.

## Current verified branch state — 2026-10-30

Do not treat this dated evidence as an eternal branch pointer; always re-pin refs before work.

- `game-production@62cf089b565a2c082d0f8de6fd70086082e6b6ce` contains the v2 contracts, runtime separation tooling, approved HD island production binary and reconciled B03 preflight evidence.
- PR #34 exact-head checks passed: `Asset production readiness` run `41111497781` and `Production contract docs smoke` run `41111497937`.
- `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` is the clean runtime/build branch. `Game runtime build` run `41110329403` passed.
- Current `main` has no `game/test` directory. The runtime workflow verifies clean-tree policy, manifest resolution and standalone build/checksum; it is **not** a full B03 gameplay regression suite.
- The exact approved HD island source now exists in production at `art/gen/environment/start_island_hd.png`, SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`.
- The former GitHub runner-assignment blocker is resolved for the cited checks; do not generalize that into a guarantee for future runs.
- `art/runtime/RUNTIME_EXPORTS.json` at this commit still contains a stale `blocked_source_missing` island status despite the production source now existing. That machine-metadata contradiction must be corrected in a separate metadata PR before claiming the export entry itself is canonical-ready.

## Remaining blockers

- B03 has no accepted replacement E0 candidate yet; current production attempts are source-rejected and cannot proceed to processing.
- B03 `publish_runtime` remains blocked by the verified design-target vs runtime semantics/rig mismatch.
- Full asset-specific runtime/game regression cannot be claimed until an actual B03 integration/publication change exists and the applicable runtime checks run on that resulting tree.
