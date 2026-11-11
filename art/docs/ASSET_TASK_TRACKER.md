# Asset Pipeline Task Tracker / Resume Contract

Этот документ является обязательным дополнением к `ASSET_PRODUCTION_PIPELINE.md`, `RUNTIME_BRANCH_CONTRACT.md` и ref2game production flow. Его задача — не начинать дорогую генерацию/обработку ассета заново после обрыва чата, CI job или новой сессии и отдельно фиксировать production approval и runtime publication.

**Уточнение 2026-11-11:** стадии трекера сохранены для совместимости; две обязательные границы и командные workflow — история процесса. Публикация — PR в `main` по `RUNTIME_BRANCH_CONTRACT.md`, без командных веток и обязательной записи в `RUNTIME_EXPORTS.json`. Роли и эффекты задают `main:game/src/data/buildings.js` и `main:game/docs/DESIGN.md` §4.4, геометрию — `main:game/src/render/manifest.js`; `IDEA_BANK_PLACEABLES.md` — идеи, rig и родословные.

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
- `publish_runtime` — точные утверждённые байты опубликованы PR в runtime-ветку `main` по подтверждённым каноническим путям `game/assets/...`. До слияния и подтверждения SHA результата шаг не считается завершённой публикацией; отдельный workflow для этого не нужен.
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

## Стадия promote — сохранение в производстве

Прежнее название Boundary A относится к исторической схеме; `asset-promote.yml` удалён 2026-11-11. Для сохранения утверждённого результата:

1. восстановить последний checkpoint; обработку повторять только при изменении входов или отсутствии подтверждённого результата;
2. проверить визуальную приёмку, связанную с точным SHA;
3. сохранить утверждённый арт, происхождение и QA в `game-production`, не включая runtime-файлы;
4. отметить подтверждённый результат в `promote` и сохранить checkpoint.

Эта стадия не публикует арт в `main`. Командная ветка для её выполнения не требуется.

## Стадия publish_runtime — публикация в main

Прежнее название Boundary B и workflow `asset-publish-runtime.yml` — история; workflow удалён 2026-11-11. Текущий порядок задаёт `RUNTIME_BRANCH_CONTRACT.md`:

1. закрепить production-коммит и базовый коммит `main`, проверить исходник, SHA, приёмку и runtime-потребителя;
2. заменить активные файлы по объявленным каноническим путям `game/assets/...`; новые пути требуют явного подключения потребителя в проверяемом PR;
3. исключить резервные и исторические копии (`*_old`, `backup`, параллельные зеркала);
4. создать PR в `main` с перечнем заменённых путей, скриншотом из игры и строкой «байты = SHA»;
5. выполнить применимые проверки игры и сборки на получившемся дереве и указать реальные результаты.

`art/runtime/RUNTIME_EXPORTS.json` — необязательная справочная карта источников и целей. Командные ветки не требуются. Скриншот из игры должен быть принят владельцем.

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
