# Выше неба — производство (`game-production`)

Ветка хранит всё, что нужно для производства игры, кроме самой игры: правила, брифы, промпты, provenance арта, инструменты обработки и архив. Сама игра — ветка `main`: код, активные ассеты, тесты, сборка (`npm run build` → `game/dist/vyshe-neba.html`), документы дизайна в `main:game/docs/`.

Оригиналы генераций (PNG до обработки) в репозитории не хранятся: они на Google Drive (`vyshe-neba/art-originals/`), идентификаторы — в provenance-файлах `art/gen/**`.

## Карта

| Тема | Где |
| --- | --- |
| Правила для агентов | `AGENTS.md` |
| Арт-направление: HD-пиксель, три камеры, рецепт генерации | `art/docs/ART_DIRECTION_HD_PIXEL.md`, шаблон запроса `art/docs/templates/SPRITE_REQUEST.md`, скрипты `tools/hd_pixel/` |
| Язык эпох E0–E5 | `art/docs/ERA_DESIGN_MATRIX.md`; формат era-reference листов `art/docs/ERA_REFERENCE_CONTRACT.md`; утверждённые наборы `art/references/eras/` (E0–E4) |
| Состояния объектов (PRESS/ON/BLOCKED/DENIED) | `art/docs/ASSET_STATE_SPEC.md` |
| Сопутствующие объекты на карте | `art/docs/E0_SCENERY_RULES.md` |
| Паспорт объекта, брифы, промпты | `art/docs/ASSET_BRIEF_TEMPLATE.md`, `art/briefs/`, `art/prompts/` |
| Идеи, правила rig и родословная построек | `art/placeables/IDEA_BANK_PLACEABLES.md`; роли и эффекты — `main:game/src/data/buildings.js` и `main:game/docs/DESIGN.md` §4.4 |
| Раскладка острова | источник истины — `main:game/src/render/manifest.js` (`BUILDING_ANCHORS`, `ISLAND`); `art/placeables/BASE_ISLAND_LAYOUT.json` и `art/docs/BASE_ISLAND_LAYOUT.md` — воспроизводимая выгрузка версии 4 из манифеста (`tools/hd_pixel/export_island_layout.py`) |
| Публикация в main, Drive, provenance | `art/docs/RUNTIME_BRANCH_CONTRACT.md`: PR с путями, скриншотом из игры и строкой «байты = SHA»; `art/docs/ASSET_PRODUCTION_PIPELINE.md`, `art/docs/ASSET_GENERATION_RUNBOOK.md`; `art/runtime/RUNTIME_EXPORTS.json` — необязательная справочная карта |
| Guard для era-reference листов | `skills/vyshe-neba-production-guard/SKILL.md`, `tools/art_pipeline/production_guard.py`, `art/reference_specs/` |
| Журналы E0 (ноябрь 2026) | `art/docs/E0_REWORK_TRACKER_20261107.md`, `art/docs/E0_COVERAGE_20261108.md`, `art/docs/E0_BASE_AUDIT_20261107.md`, `art/review/` |
| Текст для настроек ChatGPT Project «Games» | `art/docs/GAMES_PROJECT_INSTRUCTIONS.md` (владелец копирует вручную) |
| CI этой ветки | `.github/workflows/`: `production-contract`, `production-guard`, `ground-projection-gate`, `asset-readiness`, `asset-candidate`, `b01-e0-*`, `b03-art-pipeline`, `art-pipeline`, `art-tools-bootstrap` |
| Архив | `archive/` (старая игра `outputs/rocket`, критика, закрытые журналы) |

## Чего здесь нет

- исходников и ассетов игры — они в `main`;
- `game/test`, `game/tools/economy-bot*` и `game/docs` — перенесены в `main` в ноябре 2026, чтобы тесты запускались рядом с кодом;
- рабочих копий генераций, `art/source_transport/`, `art/old/`.
