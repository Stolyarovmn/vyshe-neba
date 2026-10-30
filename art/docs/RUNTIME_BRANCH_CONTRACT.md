# Runtime / production branch contract

## Purpose

This contract separates art production history from the clean game build/runtime tree.

**Normative precedence:** this document supersedes older branch/storage/publication wording in `ASSET_PRODUCTION_PIPELINE.md` and `ASSET_TASK_TRACKER.md` wherever those older texts describe direct promotion into `main`, build-time runtime mirroring from production `art/gen`, or a single undivided `promote -> game_tests` boundary. Processing, QA, SHA-bound approval, tool pins and ref2game rules remain unchanged unless explicitly migrated elsewhere.

## Canonical branch roles

### `game-production`

`game-production` is the production/history branch. It may contain:

- production docs, briefs, prompts and toolchain configuration;
- source provenance and Google Drive references;
- raw/source transport metadata;
- generated/processed approved art under `art/gen/`;
- QA evidence, candidate manifests and approval records;
- production-only workflows and tools.

Production history belongs here. Old approved versions may remain reachable through Git history and production provenance when required for audit/reproducibility.

### `main`

`main` is the clean build/runtime branch and current default branch.

It contains game code, build files, runtime checks when present, and only the **currently active runtime assets** needed by the game. Runtime raster assets live at canonical `game/assets/...` paths consumed by `main:game/src/render/manifest.js`.

`main` MUST NOT receive production-only trees such as `art/`, `work/`, candidates, raw originals, QA history, production manifests, or `outputs/rocket` mirrors as part of an art promotion.

### `clean-src`

`clean-src` is not the canonical runtime/build branch under this contract. It has a separate history, includes production/legacy material, and is not the active `game/assets` runtime tree. It may be retained as historical/experimental unless a separate migration explicitly redefines the branch model.

## Two publication boundaries

### Boundary A — candidate → production

A visually approved candidate is promoted only into `game-production`:

1. verify automatic QA and exact-SHA visual approval;
2. write the approved PNG/metadata to canonical production `art/gen/...`;
3. write/update production provenance and promotion evidence;
4. create a PR targeting `game-production`;
5. do not write runtime files to `main` in this step.

### Boundary B — approved production → runtime

Runtime publication is a separate operation after Boundary A:

1. pin the exact `game-production` commit containing the approved asset;
2. verify the approved source SHA-256 against approval/provenance evidence;
3. resolve explicit mapping `production source -> main:game/assets/...` from `art/runtime/RUNTIME_EXPORTS.json`;
4. verify the actual runtime consumer and gameplay/rig/state semantics against a pinned `main` commit;
5. check out that exact `main` base;
6. copy approved bytes to the **existing canonical runtime path**, replacing the old file in place;
7. verify copied SHA-256;
8. reject any runtime diff outside declared targets;
9. run the available runtime/build checks on that exact tree;
10. create a separate PR targeting `main`.

A known file path alone is not sufficient. If the target does not exist, the consumer is unknown, or production semantics materially differ from runtime behavior, `publish_runtime` is **BLOCKED** until a separate reviewed integration change resolves the mismatch.

Creating a runtime PR does not itself prove publication. `publish_runtime=success` requires merge/resulting runtime SHA confirmation. Automatic merge is forbidden.

## No duplicate historical copies in runtime

For an asset replacement, `main` stores exactly one active file at its canonical runtime path.

Forbidden during runtime publication:

- `*_old.png`, `*_previous.png`, `*_backup.png`;
- version/date backup directories created only for rollback;
- a second copy under `art/gen`, `outputs/rocket/dist/assets`, or another mirror inside `main`;
- retaining the superseded file under a second runtime name only for rollback.

Rollback uses Git history/revert, not duplicate runtime files.

## Runtime mapping

Machine publication uses `art/runtime/RUNTIME_EXPORTS.json` on `game-production`.

Each publishable entry must contain:

- explicit production `source` under `art/gen/`;
- exact approved SHA-256;
- explicit canonical `target` under `game/assets/`;
- verified existing-target runtime contract;
- compatible verified semantics, or an explicit reviewed decision that the replacement is art-only and does not claim a new mechanic;
- `status=ready` only when source bytes exist in production and approval evidence contains that exact SHA.

Default mode is `replace_in_place`; target must already exist on the pinned `main` commit.

Missing source/target, SHA mismatch, target outside `game/assets`, missing approval, unresolved semantics, or non-ready status is blocking.

## Tracker semantics — canonical now

The production/runtime migration is already canonical. `art/placeables/PIPELINE_CONFIG.json` version 3 defines:

```text
generate
→ edit
→ archive_original
→ source_prepare
→ pixel_snap
→ normalize
→ aseprite_index
→ qa_auto
→ candidate_manifest
→ visual_review
→ promote
→ publish_runtime
→ game_tests
```

- `promote` means approved art crossed Boundary A into `game-production`.
- `publish_runtime` means exact approved bytes crossed Boundary B into `main`; an opened PR is not enough.
- `game_tests` belongs to the runtime/build tree and cannot be inferred from production-only smoke/readiness checks.

Existing checkpoints remain forward-compatible: missing canonical steps appear as `pending` without invalidating earlier successful outputs unless fingerprints/SHA evidence changed.

## CI / workflow separation

Production workflows run from `game-production` and may inspect/prepare candidates. Runtime publication uses a separate checkout/worktree of `main` and must reject changes outside declared runtime targets.

Build/install steps must not introduce extra tracked files into runtime PRs. Runtime manifest/code changes remain separate from pure asset replacements.

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
- `PRODUCTION_MANIFEST.md` instead targets touchdown/corridor prediction plus a physically tracking `head` and state `lamp`.

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

## Rollback

### Production rollback

Revert the production PR or restore the prior production commit. Drive originals/provenance remain immutable.

### Runtime rollback

Revert the runtime asset PR or restore the previous Git blob in a new PR. Do not create backup copies in `main`.

### Workflow-trigger rollback

Revert the workflow migration. Do not solve trigger problems by copying production/history trees into `main`.