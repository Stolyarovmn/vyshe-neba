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

`main` is the clean build/runtime branch.

It contains the game code, build files, runtime tests when present, and only the **currently active runtime assets** needed by the game. Runtime raster assets live at canonical `game/assets/...` paths consumed by `main:game/src/render/manifest.js`.

`main` MUST NOT receive production-only trees such as `art/`, `work/`, candidates, raw originals, QA history, production manifests, or `outputs/rocket` mirrors as part of an art promotion.

The current repository layout supports this role: `main` root contains `.gitattributes`, `.gitignore`, `game/` and `package.json`; production files are not part of that tree.

### `clean-src`

`clean-src` is not the canonical runtime/build branch under this contract. It currently has a separate history, includes production/legacy material, and has no `game/assets/` tree. It may be retained as a historical/experimental branch, but promotion MUST NOT target it unless a separate migration explicitly redefines the branch model.

## Two publication boundaries

### Boundary A — candidate → production

A visually approved candidate is promoted only into `game-production`:

1. verify automatic QA and exact-SHA visual approval;
2. write the approved PNG/metadata to the canonical production path under `art/gen/...`;
3. write/update production provenance and promotion manifest;
4. create a PR targeting `game-production`;
5. do not write runtime files to `main` in this step.

This boundary preserves production history and reproducibility.

### Boundary B — approved production → runtime

Runtime publication is a separate operation after Boundary A is complete:

1. pin the exact `game-production` commit containing the approved asset;
2. verify the approved source SHA-256 against its production manifest/review;
3. resolve an explicit, verified runtime mapping `production source -> main:game/assets/...`;
4. check out exact `main` base as the runtime tree;
5. copy the approved bytes to the **existing canonical runtime path**, replacing the old file in place;
6. verify the copied bytes have the approved SHA-256;
7. verify the runtime diff contains only explicitly declared changed targets;
8. run the available build/runtime checks on that exact tree;
9. create a runtime PR targeting `main` containing only those declared runtime asset replacements.

If the canonical runtime path does not yet exist, publication is **BLOCKED**. A new asset needs a separate runtime-integration PR first (logical name/path/consumer/fallback/tests). Art promotion must not invent a new runtime path.

Creating the runtime PR does not itself prove that the new bytes are already in `main`; publication is final only after the PR is merged/verified at the resulting runtime commit. Automatic merge is forbidden.

## No duplicate historical copies in runtime

For an asset replacement, `main` stores exactly one active file at its canonical runtime path.

Forbidden during runtime publication:

- `*_old.png`, `*_previous.png`, `*_backup.png`;
- `v1/`, `v2/`, dated backup directories or parallel legacy mirrors created only to preserve the previous picture;
- a second copy of the same runtime asset under `art/gen`, `outputs/rocket/dist/assets`, or another mirror inside `main`;
- keeping the superseded file under a different runtime name merely for rollback.

Rollback uses Git history (`git revert`, previous commit/blob, or a revert PR), not duplicate files in the runtime tree.

## Runtime mapping

Machine publication uses `art/runtime/RUNTIME_EXPORTS.json` on `game-production`.

Each publishable entry must contain:

- explicit production `source` under `art/gen/`;
- exact approved SHA-256;
- explicit canonical `target` under `game/assets/`;
- verified existing-target runtime contract;
- publication `status=ready` only when source bytes actually exist in the production tree and approval evidence contains that SHA.

Default mode is `replace_in_place`; target must already exist on the pinned `main` commit.

A missing mapping, missing production source, missing target, SHA mismatch, target outside `game/assets/`, unapproved source, or non-ready status is a blocking error.

## Tracker semantics

Paired CI/tool migration PR #31 introduces a new forward-compatible machine step. After that migration is merged, canonical tracker order is:

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

- `promote` means approved candidate has crossed Boundary A into production history.
- `publish_runtime` means exact approved bytes have crossed Boundary B into the clean runtime branch. A merely opened PR is not sufficient to claim final publication; merge/resulting runtime SHA must be confirmed.
- `game_tests` applies only to the runtime/build tree and must not be inferred from production-only checks.

Tracker schema remains forward-compatible: existing checkpoint states gain missing canonical steps as `pending` without losing earlier attempts/status/output hashes. `PIPELINE_CONFIG.json` is bumped as part of the paired tool migration because the canonical step list changes.

Until the paired tool migration is actually merged, this docs branch describes the target contract but does not pretend the canonical `game-production` machine tracker already implements it.

## CI / workflow separation

Production workflows run from `game-production` and may inspect/prepare candidates.

Runtime publication workflow must use a separate checkout/worktree of `main` and must reject changes outside declared changed runtime targets. It must never stage `art/gen`, production metadata, candidates, raw sources, QA history or legacy `outputs/rocket` mirrors into the runtime PR.

The runtime workflow must record both exact production source commit and exact runtime base commit. Build/install steps must not introduce extra tracked files such as lockfiles into the runtime PR.

Runtime/manifest/code changes remain separate from pure asset replacement PRs. A replacement of an already-integrated asset should normally modify only its canonical `game/assets/...` file(s).

## Migration plan

1. Keep current `main` as the clean runtime/build branch; do not mass-copy production history into it.
2. Change candidate promotion so its PR targets `game-production` and stages only production art/provenance.
3. Add a separate runtime-publish workflow that reads an exact approved source from `game-production` and replaces only declared `main:game/assets/...` files.
4. Add `publish_runtime` to tracker/config/tooling as a forward-compatible step migration.
5. Add explicit runtime mappings only after verifying the target path and consumer against the pinned `main` manifest/code and confirming the exact production source bytes exist.
6. Existing runtime files in `main` remain in place until individually replaced by approved assets; no duplicate backup copies are created.
7. New assets without an existing runtime target remain `integration_pending/BLOCKED` until a separate runtime integration PR exists.

## Rollback

### Production rollback

Revert the production PR or restore the prior production commit; provenance/Drive originals remain immutable.

### Runtime rollback

Revert the runtime asset PR (or create a new PR restoring the previous Git blob). Do not add backup copies to `main`.

## Current blockers

- `game-production` at the currently checked SHA does not yet contain the pending v2 contract/`AGENTS.md`; this contract is being introduced through the current draft PR chain and is not canonical until merged.
- The current `main` branch has build code and runtime assets but no `game/test` directory at the checked SHA, so full same-commit game regression cannot be claimed there yet.
- B03 `landing_guidance` has no verified runtime logical name/consumer/target on the checked `main`; its runtime publication remains blocked even after art approval until runtime integration is added separately.
- The approved HD island runtime target and SHA are verified, but the exact approved `start_island_hd.png` binary is not currently committed at its expected production `art/gen/...` source path; therefore it is not publishable through Boundary B until that production-source gap is resolved.
