# ref2game art source

`art/style_bible.txt` is the canonical style block and must be prepended verbatim to every future image-generation request.

For the current aircraft pass, the previously generated/sliced pack is being normalized into the ref2game layout. Future regeneration must follow `gen.py prepare -> image generation -> gen.py import -> slice.py -> prep.py` rather than bypassing those stages.

Canonical aircraft source metadata lives under `art/aircraft/`; runtime-ready copies live under `outputs/rocket/dist/assets/aircraft/` until the game is fully migrated to the standard `live/` layout.


## World sprite production

The generated sources and original imagegen sheets are retained in `art/gen` and `art/raw`. Requests contain the canonical style bible verbatim; tool imports are recorded in `art/logs`. Preparation is configured by `ref2game.json`; rebuild with `python3 tools/ref2game/prep.py --all` followed by `python3 tools/build-world-manifest.py`.

`live/world-sprites.js` owns physical sprite selection, articulated attachments and effects; build copies it and `live/aircraft.js` to runtime. Game and background integration remain in `outputs/rocket/dist/game.js` and `world-art.js` until the existing game is fully migrated. `npm run build` generates the standalone HTML locally; run `node outputs/rocket/qa-world.cjs` for assembled scene QA.

See `art/PROGRESS.md` for acceptance status and remaining work.
