# Agent rules — «Выше неба»

Для **каждого** запроса по игре сначала прочитать и применять:

1. `art/docs/ASSET_PRODUCTION_PIPELINE.md` — существующая производственная цепочка, approval, CI.
2. `art/docs/PRODUCTION_CONTRACT_V2.md` — обязательные preflight, engineering/era/projection/runtime gates; совместимое расширение.
3. `art/docs/ASSET_TASK_TRACKER.md`, `art/docs/EXECUTION_TIMEOUT_POLICY.md` — resume и лимиты.
4. `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, `art/placeables/PIPELINE_CONFIG.json`, `art/placeables/BASE_ISLAND_LAYOUT.json` по типу задачи.
5. `https://github.com/studioigor/ref2game/blob/main/codex/SKILL.md` — обязательный workflow ref2game.
6. Для новых/изменяемых assets: `art/docs/ASSET_BRIEF_TEMPLATE.md`.

**Проверить branch и SHA до действий.** Эта ветка `game-production` содержит production docs/scripts, но не полный runtime. Актуальный рендер сверять с `main:game/src/render/manifest.js` на выбранном SHA; не предполагать `game-build` и `outputs/rocket` без проверки. Не подменять отсутствующие файлы выдуманными.

**Нельзя:** обходить SHA-bound approval, менять originals, считать candidate production, угадывать pivots/проекцию (47° не подтверждено), генерировать E0–E5 одной доской, анимировать механизм целым PNG, добавлять eventless FX, делать direct push в `main`, заявлять о непроверенном CI. Новые правила и исправления — через ветку/PR с QA и rollback. При отсутствии данных — `UNKNOWN/BLOCKED` с конкретной причиной.

Текст для пользовательских настроек ChatGPT Project: `art/docs/GAMES_PROJECT_INSTRUCTIONS.md`. Настройки проекта меняет сам пользователь, этот файл их не применяет автоматически.
