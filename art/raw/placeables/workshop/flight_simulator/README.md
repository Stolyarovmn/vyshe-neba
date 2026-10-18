# W04 raw source provenance

The canonical W04 `flight_simulator` source lineage was generated as six independent image-generation calls. Full native generator outputs are `1254×1254 RGBA` and are identified by `source_gen_id` + `source_sha256` in the per-era JSON files.

The GitHub production pipeline must use `ref2game`, `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md`, the official `Hugo-Dz/spritefusion-pixel-snapper`, and official Aseprite.

Do not replace a source silently. Any storage/transport derivative must record its exact deterministic transform and SHA separately from the native generator source. Runtime art is approved only after Pixel Snapper, canonical `172×160 LP` registration, Aseprite indexed/no-dither export, and QA.

Moving-part pivots are not inferred from the canvas registration point. They remain pending until isolated `base`, `pod`, `actuator_left`, `actuator_right`, and `canopy` parts are approved and measured.
