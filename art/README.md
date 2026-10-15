# ref2game art source

`art/style_bible.txt` is the canonical style block and must be prepended verbatim to every future image-generation request.

For the current aircraft pass, the previously generated/sliced pack is being normalized into the ref2game layout. Future regeneration must follow `gen.py prepare -> image generation -> gen.py import -> slice.py -> prep.py` rather than bypassing those stages.

Canonical aircraft source metadata lives under `art/aircraft/`; runtime-ready copies live under `outputs/rocket/dist/assets/aircraft/` until the game is fully migrated to the standard `live/` layout.
