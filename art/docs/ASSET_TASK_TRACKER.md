# Asset Pipeline Task Tracker / Resume Contract

Этот документ является обязательным дополнением к `ASSET_PRODUCTION_PIPELINE.md`, `RUNTIME_BRANCH_CONTRACT.md` и ref2game production flow. Его задача — не начинать дорогую генерацию/обработку ассета заново после обрыва чата, CI job или новой сессии и отдельно фиксировать production approval и runtime publication.

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

После миграции разделения production/runtime порядок задаётся `art/placeables/PIPELINE_CONFIG.json -> tracker.steps`:

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

Значение последних стадий:

- `promote` — exact-SHA approved candidate подготовлен/опубликован в production history (`game-production`, canonical `art/gen` + provenance/QA). Это **не означает**, что картинка уже попала в игру.
- `publish_runtime` — exact approved bytes прошли отдельную Boundary B: replacement PR в чистую runtime/build ветку `main`, только по подтверждённым canonical `game/assets/...` путям. До merge/подтверждения runtime PR шаг не должен считаться окончательно опубликованным.
- `game_tests` — проверки чистого runtime/build дерева на том commit, который реально содержит заменённый runtime asset. Production docs/config smoke не заменяет этот шаг.

Старые checkpoint автоматически мигрируются вперёд: новый `publish_runtime` появляется как `pending`; предыдущие успешные шаги сохраняются, если их fingerprint/output SHA-256 всё ещё совпадают.

Статусы:

```text
pending | running | success | failed | blocked | skipped
```

`running` записывается до начала шага. `success`, `failed` или `blocked` записывается сразу после подтверждённого результата. Поэтому после аварийной остановки видна точная стадия, на которой работа оборвалась.

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
- production PR изменил approved bytes → `promote` и downstream инвалидируются;
- runtime export mapping/target/base commit изменился → инвалидируется `publish_runtime` и `game_tests`, но art processing не повторяется;
- упал `game_tests` → generation/processing/promotion/runtime replacement не повторяются без изменения их fingerprints.

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

Если source уже существовал до внедрения tracker, processor восстанавливает `generate`/`archive_original` из provenance. Отсутствующий Google Drive provenance отмечается как `blocked`; automatic processing может продолжаться, но production promotion остаётся запрещённым gate.

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

## Boundary A — production promotion

`asset-promote.yml` должен:

1. работать из `game-production`, а не из `main`;
2. восстановить последний checkpoint;
3. повторно вызвать processor с `--resume`;
4. проверить hash-bound visual approval;
5. stage только canonical production art/provenance (`art/gen/...`);
6. отметить `promote` после подтверждённого production staging;
7. создать PR **в `game-production`**, без runtime-файлов;
8. сохранить checkpoint и обновить tracker issue.

Production promotion не имеет права коммитить `game/assets`, `outputs/rocket` runtime mirrors или менять `main`.

## Boundary B — runtime publication

Отдельный runtime-publish должен:

1. pin exact production commit и exact runtime `main` base commit;
2. прочитать SHA-bound `art/runtime/RUNTIME_EXPORTS.json`;
3. проверить source SHA/approval;
4. разрешить target только под `game/assets/...` и только если он уже существует на pinned `main`;
5. заменить файл **на том же canonical runtime path**;
6. запретить backup/history copies (`*_old`, `backup`, `v2`, parallel mirrors);
7. проверить, что runtime diff содержит только явно разрешённые replacement targets;
8. выполнить доступный build/runtime gate;
9. создать отдельный PR в `main`.

`publish_runtime=success` допускается только после подтверждения фактической runtime публикации/merge exact approved bytes. Само создание PR не равно merge и не должно ложно закрывать шаг. Rollback выполняется Git revert/history, а не второй копией PNG в runtime tree.

## Game regression

`game_tests` относится к чистой runtime/build ветке. Результат production-only smoke workflow не может переводить `game_tests` в success.

Таким образом tracker покрывает цепочку целиком:

```text
image generation/edit
→ archive
→ processing
→ automatic QA
→ visual QA
→ production promotion
→ runtime replacement publication
→ runtime/game regression
```

## Важное ограничение

Tracker фиксирует состояние и воспроизводимость процесса, но не заменяет художественную проверку. `ref2game`, automatic QA, hash-bound visual review, measured rig QA, runtime mapping verification и full game regression остаются обязательными production gates.
