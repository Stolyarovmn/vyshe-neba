# Asset Pipeline Task Tracker / Resume Contract

Этот документ является обязательным дополнением к `ASSET_PRODUCTION_PIPELINE.md` и `ref2game` production flow. Его задача — не начинать дорогую генерацию/обработку ассета заново после обрыва чата, CI job или новой сессии.

## Durable state

Для каждого `asset_id / era` ведётся checkpoint:

```text
<CANDIDATE>/.tracker/<ASSET>/<ERA>/current.json
<CANDIDATE>/.tracker/<ASSET>/<ERA>/status.md
```

Промежуточные технические файлы сохраняются в:

```text
<CANDIDATE>/.work/<ERA>/
```

GitHub Actions сохраняет весь candidate как artifact:

```text
asset-checkpoint-<ASSET>-<RUN_ID>-<RUN_ATTEMPT>
```

Artifact хранится 30 дней и включает hidden `.tracker` / `.work`. Новый run сначала восстанавливает самый свежий non-expired checkpoint и только затем запускает processor с `--resume`.

Кроме artifact pipeline синхронизирует GitHub Issue:

```text
[asset-pipeline] <ASSET> <asset_name>
```

Issue является человекочитаемым task tracker: current step, status всех стадий, status по эпохам, последний run и имя checkpoint artifact. После перезапуска чата первым делом проверяется этот issue.

## Канонические шаги

Порядок задаётся `art/placeables/PIPELINE_CONFIG.json -> tracker.steps`:

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
→ game_tests
```

Статусы:

```text
pending | running | success | failed | blocked | skipped
```

`running` записывается до начала шага. `success`, `failed` или `blocked` записывается сразу после результата. Поэтому после аварийной остановки видна точная стадия, на которой работа оборвалась.

## Resume contract

Шаг разрешено пропустить только если одновременно:

1. status = `success`;
2. input fingerprint совпадает;
3. каждый записанный output существует;
4. SHA-256 каждого output совпадает с checkpoint.

Если input изменился, инвалидируется только этот шаг и downstream.

Примеры:

- изменился source / generation result → пересчёт с source/generation boundary;
- изменился Pixel Snapper revision, binary или `pixel_size` → с `pixel_snap`;
- изменился normalizer, canvas или registration → с `normalize`;
- изменились QA thresholds → только с `qa_auto`;
- изменился visual review → Pixel Snapper/Aseprite не повторяются;
- упал `game_tests` → art generation/processing не повторяются.

## Image generation / edit / archive

`generate`, `edit` и `archive_original` могут происходить вне GitHub Actions, но обязаны отмечаться тем же tracker.

Перед внешним действием:

```bash
python3 tools/art_pipeline/task_tracker.py \
  --state-dir <candidate>/.tracker \
  --asset W04 --era e1_1986 \
  mark --step generate --status running \
  --reason "imagegen started"
```

После успешного импорта source:

```bash
python3 tools/art_pipeline/task_tracker.py \
  --state-dir <candidate>/.tracker \
  --asset W04 --era e1_1986 \
  mark --step generate --status success \
  --fingerprint <SOURCE_SHA256> \
  --output <source-file>
```

Для ремонта/редактирования используется `edit`; после загрузки untouched original в Google Drive — `archive_original`.

Если source уже существовал до внедрения tracker, processor восстанавливает `generate`/`archive_original` из provenance. Отсутствующий Google Drive provenance отмечается как `blocked`, но automatic processing может продолжаться; promotion остаётся запрещённым production gate.

## Technical processing

Canonical command:

```bash
python3 tools/art_pipeline/process_asset.py \
  --repo-root . \
  --asset W04 \
  --output <candidate> \
  --state-dir <candidate>/.tracker \
  --pixel-snapper <tool> \
  --aseprite <tool> \
  --resume
```

Можно возобновить только одну эпоху:

```text
--era e3_2015
```

После сборки всей family создаётся `candidate-manifest.json`. `visual_review` остаётся `blocked`, пока hash-bound review не одобрит точные SHA-256 текущих PNG.

## Manual recovery

Статус:

```bash
python3 tools/art_pipeline/task_tracker.py \
  --state-dir <candidate>/.tracker \
  --asset W04 --era e3_2015 status
```

Инвалидация с конкретного шага:

```bash
python3 tools/art_pipeline/task_tracker.py \
  --state-dir <candidate>/.tracker \
  --asset W04 --era e3_2015 \
  reset --from-step normalize \
  --reason "normalizer contract changed"
```

Снятие stale lock:

```bash
python3 tools/art_pipeline/task_tracker.py \
  --state-dir <candidate>/.tracker \
  --asset W04 --era e3_2015 unlock
```

Tracker использует lock на `asset/era`; GitHub Actions дополнительно использует `concurrency` по asset id, поэтому два writer'а не должны одновременно менять один candidate.

## Promotion and game regression

`asset-promote.yml`:

1. восстанавливает последний checkpoint;
2. повторно вызывает processor с `--resume`;
3. проверяет hash-bound visual approval;
4. отмечает `promote` после staging canonical `art/gen` + runtime manifest;
5. создаёт promotion PR вместо прямого push в `main`;
6. сохраняет новый checkpoint и обновляет tracker issue.

`game-ci.yml` на `2d_promote-*` PR записывает результат полного `npm test` как:

```text
game_tests = success | failed
```

в тот же checkpoint и issue.

Таким образом tracker покрывает цепочку целиком:

```text
image generation/edit
→ archive
→ processing
→ automatic QA
→ visual QA
→ promotion
→ full game regression
```

## Важное ограничение

Tracker фиксирует состояние и воспроизводимость процесса, но не заменяет художественную проверку. `ref2game`, automatic QA, hash-bound visual review, measured rig QA и full game regression остаются обязательными production gates.
