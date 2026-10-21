# ref2game art source

В репозитории два связанных производственных потока. Выбор зависит от типа ассета:

| Поток | Для чего | Где описан | Инструменты |
| --- | --- | --- | --- |
| **ref2game: world sprites** | самолёты, дроны, природа, небо, фон, посадочные площадки, монеты | этот файл и `art/PROGRESS.md` | `tools/ref2game/{gen,slice,prep}.py`, `ref2game.json` |
| **Placeables pipeline** | покупаемые и размещаемые объекты базы и мастерской W/B (эпохи E0–E5) | `art/docs/ASSET_PRODUCTION_PIPELINE.md`, `art/docs/ASSET_TASK_TRACKER.md`, `art/placeables/PRODUCTION_MANIFEST.md` | `tools/art_pipeline/*`, workflows `asset-candidate` / `asset-promote` |

Общее для обоих потоков: `art/style_bible.txt` вставляется дословно в каждый запрос на генерацию; интерактивные ходы подчиняются `art/docs/EXECUTION_TIMEOUT_POLICY.md`.

Хранение оригиналов: для placeables канонический архив нетронутых генераций находится на Google Drive (`vyshe-neba/art-originals/`), а `art/raw/` необязателен. Для world sprites оригиналы листов дополнительно лежат в `art/raw` и `art/gen`.

`art/style_bible.txt` is the canonical style block and must be prepended verbatim to every future image-generation request.

For the current aircraft pass, the previously generated/sliced pack is being normalized into the ref2game layout. Future regeneration must follow `gen.py prepare -> image generation -> gen.py import -> slice.py -> prep.py` rather than bypassing those stages.

Canonical aircraft source metadata lives under `art/aircraft/`; runtime-ready copies live under `outputs/rocket/dist/assets/aircraft/` until the game is fully migrated to the standard `live/` layout.


## World sprite production

The generated sources and original imagegen sheets are retained in `art/gen` and `art/raw`. Requests contain the canonical style bible verbatim; tool imports are recorded in `art/logs`. Preparation is configured by `ref2game.json`; rebuild with `python3 tools/ref2game/prep.py --all` followed by `python3 tools/build-world-manifest.py`.

`live/world-sprites.js` owns physical sprite selection, articulated attachments and effects; build copies it and `live/aircraft.js` to runtime. Game and background integration remain in `outputs/rocket/dist/game.js` and `world-art.js` until the existing game is fully migrated. `npm run build` generates the standalone HTML locally; run `node outputs/rocket/qa-world.cjs` for assembled scene QA.

See `art/PROGRESS.md` for acceptance status and remaining work.

## Buyable / placeable infrastructure

`art/placeables/PRODUCTION_MANIFEST.md` is the canonical production contract for buyable and placeable base/workshop infrastructure. It defines the 17 object families, E0–E5 engineering lineage, target LP footprints, socket classes, articulated parts, event-driven motion contracts, relative economy tiers and generation/QA workflow.

Placeable artwork must follow `art/style_bible.txt` and the ref2game workflow. Design pivots in the manifest are intent only; runtime pivots must be measured from the approved imported artwork before rigging.
