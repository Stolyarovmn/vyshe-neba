# Agent rules — «Выше неба»

Для **каждого** запроса по игре сначала прочитать и применять:

1. `art/docs/ASSET_PRODUCTION_PIPELINE.md` — существующая производственная цепочка, approval, CI.
2. `art/docs/PRODUCTION_CONTRACT_V2.md` — обязательные preflight, engineering/era/projection/runtime gates; совместимое расширение.
3. `art/docs/RUNTIME_BRANCH_CONTRACT.md` — обязательное разделение production/history и чистой runtime/build ветки, правила двухступенчатого promotion и rollback.
4. `art/docs/ASSET_GENERATION_RUNBOOK.md` — исполнимый порядок каждого production imagegen: preflight → deterministic request → immutable raw archive → source gate → processing/approval.
5. `art/docs/ASSET_TASK_TRACKER.md`, `art/docs/EXECUTION_TIMEOUT_POLICY.md` — resume и лимиты.
6. `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, `art/placeables/PIPELINE_CONFIG.json`, `art/placeables/BASE_ISLAND_LAYOUT.json` по типу задачи.
7. `https://github.com/studioigor/ref2game/blob/main/codex/SKILL.md` — обязательный workflow ref2game.
8. Для новых/изменяемых assets: `art/docs/ASSET_BRIEF_TEMPLATE.md` и соответствующий `art/briefs/*` preflight receipt, если он существует.

**Проверить branch и SHA до действий.** `game-production` — production/history ветка с docs/scripts, approved production art, provenance и QA, но не полный runtime. `main` — чистая runtime/build ветка: актуальный рендер сверять с `main:game/src/render/manifest.js` на выбранном SHA; runtime-art хранится только по каноническим `game/assets/...` путям. Не предполагать `game-build`, `clean-src` как canonical build branch или legacy `outputs/rocket` без проверки. Не подменять отсутствующие файлы выдуманными.

Для production imagegen, когда существует receipt, сначала запускать `tools/art_pipeline/validate_generation_preflight.py`, затем собирать фактический generation request через `tools/art_pipeline/build_generation_request.py`. Ручное перефразирование `art/style_bible.txt` вместо deterministic append запрещено. PASS этого preflight означает только разрешение на указанную стадию generation; он не открывает scene/runtime/promotion gates.

**Promotion разделён на две границы.** Candidate с exact-SHA visual approval сначала попадает только в `game-production` (`art/gen` + provenance/QA) через production PR. Затем отдельный runtime-publish берёт exact approved bytes и создаёт отдельный PR в `main`, заменяя уже существующий канонический `game/assets/...` файл **на том же пути**. В `main` запрещены production history/candidates/raw/QA и backup-копии старых картинок (`*_old`, `backup`, parallel mirrors). Rollback runtime — через Git history/revert. Если runtime target/consumer не подтверждён или target ещё не существует, runtime publication `BLOCKED` до отдельного integration PR.

**Нельзя:** обходить SHA-bound approval, менять originals, считать candidate production, угадывать pivots/проекцию (47° не подтверждено), генерировать E0–E5 одной доской, анимировать механизм целым PNG, добавлять eventless FX, делать direct push в `main`, смешивать production files с runtime PR или заявлять о непроверенном CI. Новые правила и исправления — через ветку/PR с QA и rollback. При отсутствии данных — `UNKNOWN/BLOCKED` с конкретной причиной.

Текст для пользовательских настроек ChatGPT Project: `art/docs/GAMES_PROJECT_INSTRUCTIONS.md`. Настройки проекта меняет сам пользователь, этот файл их не применяет автоматически.
