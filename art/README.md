# art/ — производство арта

Действующий стандарт для любой картинки в игре — `docs/ART_DIRECTION_HD_PIXEL.md`: HD-пиксель по эталону острова, три камеры (полёт сверху, база изометрия 40°, иконки фронт 3/4), палитра острова плюс акценты эпохи, рецепт генерации и обработки (`tools/hd_pixel/`). Язык эпох — `docs/ERA_DESIGN_MATRIX.md`, состояния объектов — `docs/ASSET_STATE_SPEC.md`, общий текст стиля для запросов — `style_bible.txt`.

| Папка | Что внутри |
| --- | --- |
| `docs/` | контракты и правила (см. `README.md` в корне ветки) |
| `briefs/` | паспорта построек E0 (B01–B07, BI_*, EN01, OB01) по `docs/ASSET_BRIEF_TEMPLATE.md` |
| `prompts/` | промпты генераций; `prompts/era_references/` — сгенерированные из `reference_specs/` (не править руками) |
| `reference_specs/`, `references/eras/` | машинные спецификации и утверждённые наборы era-reference листов E0–E4 |
| `gen/` | обработанный утверждённый арт и provenance (`*.json`, `*.md`); бинарники только там, где это production-source |
| `raw/`, `requests/`, `logs/`, `qa/`, `review/` | свидетельства: сырые метаданные, запросы, журналы импорта, QA-отчёты, ревью |
| `placeables/` | `PRODUCTION_MANIFEST.md` (роли и части), `PIPELINE_CONFIG.json` (порядок трекера и пины инструментов), `BASE_ISLAND_LAYOUT.json` (историческая выгрузка раскладки v3; источник истины — `main:game/src/render/manifest.js`) |
| `runtime/RUNTIME_EXPORTS.json` | карта production-source → runtime-target для публикации |
| `aircraft/`, `infrastructure/`, `*.json` | метаданные старых потоков (самолёты, инфраструктура, шары, спутник); актуальные размеры — в `manifest.js` на `main` |

Два потока обработки, которые ещё существуют в инструментах: `tools/ref2game/` (world-спрайты: самолёты, природа) и `tools/art_pipeline/` (placeables: Pixel Snapper → normalize → Aseprite → QA → кандидат). Для спрайтов E0 в ноябре 2026 вместо них использован `tools/hd_pixel/`; какой путь брать для нового объекта, решает `docs/ART_DIRECTION_HD_PIXEL.md` §4.
