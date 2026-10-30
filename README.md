# Выше неба: производство игры

Ветка содержит всё, что нужно для производства игры, кроме самой сборки и исходников арта.
Актуальные исходники рендера и runtime-ассеты проверены в ветке `main` (снимок 2026-10-30). Упоминание прежней ветки `game-build` было устаревшим; перед работой проверяйте фактический список веток и SHA. Готовая standalone-сборка в этом production-only дереве не подтверждена.
Исходные изображения (оригиналы генераций, листы-источники, перенос двоичных данных, резервные копии) в репозиторий не входят: их хранилище — Google Drive (`vyshe-neba/art-originals/`), идентификаторы файлов записаны в provenance-файлах.

Пути файлов сохранены как в историческом полном дереве, но не все ссылки существуют в каждой ветке. Для запуска полного CI требуется **явно собранный и проверенный workspace**: runtime из `main` на выбранном SHA + production-файлы из `game-production` на выбранном SHA + необходимые оригиналы/бинарные ассеты по provenance. Простое утверждение, что старый `outputs/rocket` доступен, неверно: часть legacy build scripts отсутствует в текущих ветках. До создания reproducible assembly/CI adapter такой запуск считается `BLOCKED`, а не успешным.

Дополнительные обязательные правила: [`art/docs/PRODUCTION_CONTRACT_V2.md`](art/docs/PRODUCTION_CONTRACT_V2.md) — совместимые design/era/projection/runtime gates; [`art/docs/ASSET_BRIEF_TEMPLATE.md`](art/docs/ASSET_BRIEF_TEMPLATE.md) — паспорт; [`art/docs/GAMES_PROJECT_INSTRUCTIONS.md`](art/docs/GAMES_PROJECT_INSTRUCTIONS.md) — текст для настроек ChatGPT Project «Games»; [`AGENTS.md`](AGENTS.md) — инструкции агентам. Они не заменяют существующий pipeline и не объявляют старый CI рабочим без запуска.

## Карта

| Тема | Где лежит |
| --- | --- |
| Дизайн игры, архитектура, язык интерфейса | `game/docs/` |
| Pipeline производства ассетов, трекер задач, политика таймаутов, схема острова, список недостающего арта | `art/docs/`, `art/README.md`, `art/PROGRESS.md` |
| Манифест производства построек и конфигурация pipeline | `art/placeables/` (`PRODUCTION_MANIFEST.md`, `PIPELINE_CONFIG.json`, `BASE_ISLAND_LAYOUT.json`) |
| Канонический стиль, вставляется в каждый запрос на генерацию | `art/style_bible.txt` |
| Промпты на генерацию (в том числе ещё не нарисованные постройки) | `art/prompts/`, `art/prompts/missing/` |
| Арт-pipeline: обработка, QA, продвижение кандидатов, трекер | `tools/art_pipeline/` |
| Подготовка спрайтов мира (prepare, import, slice, prep) | `tools/ref2game/`, `ref2game.json` |
| Сборка манифестов и наборов (самолёты, мир, база, небо) | `tools/build-*.py`, `tools/prepare-*.py` |
| Подготовка артов новой игры (HD-остров, фоны, лёгкие спрайты, раскладка острова) | `game/tools/prepare-*.py`, `game/tools/optimize-sprites.py`, `game/tools/island-layout.py` |
| Баланс и диагностика (бот экономики, пробные посадки) | `game/tools/economy-bot*.mjs`, `game/tools/probe-landing.mjs` |
| Тесты (юнит-тесты, браузерные проверки, звук, отрисовка) | `game/test/` |
| Происхождение арта: provenance, QA-отчёты, логи импорта, запросы | `art/gen/**` (только json, md, txt), `art/raw/**/*.json`, `art/logs/`, `art/requests/`, `art/qa/`, `art/aircraft/`, `art/infrastructure/`, `art/*.json` |
| CI | `.github/workflows/` |
| Исследования и критика (разбор Into Space, трафик по высотам, ревью спрайтов) | `study/`, `outputs/rocket/docs/`, `outputs/rocket/study/` |

Документы о высотах трафика лежат в `outputs/rocket/` потому, что юнит-тесты симуляции читают их по этому пути.

## Что сознательно не включено

- Изображения (`png`, `webp`) и архивы: оригиналы, листы-источники и промежуточные результаты хранятся на Google Drive; готовые игровые ассеты лежат в ветке `game-build`.
- `art/source_transport/` (перенос двоичных файлов в текстовом виде), `art/old/` (резервные копии заменённых источников).
- Старая версия игры (`outputs/rocket/dist`, её сборка и проверки) и её рантайм-модули (`live/`).
