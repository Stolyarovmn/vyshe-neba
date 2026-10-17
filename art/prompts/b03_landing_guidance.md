# B03 — Landing Guidance (`landing_guidance`)

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

Generate **one beacon per call**. The purchased gameplay object places a symmetric pair in code; do not bake both beacons into one sprite.

Physical parts: `base` static; `head` physically aims; `lamp` is a state part. Guidance corridor, predicted touchdown point, laser beam/light cone, HUD and safe/unsafe overlays are code-owned and must not be baked into the source PNG.

Each generation is isolated on transparent alpha with complete silhouette and no people, text, labels, logos, scenery or UI. `art/style_bible.txt` is appended verbatim to each generation request.

Era lineage:

- **E0 / 1978:** portable tripod, manual optical sight/aiming head, separate physical signal lamp.
- **E1 / 1986:** sectional radio beacon / heavier industrial aiming head; retain physical axis and lamp.
- **E2 / 1998:** motorized tracker with optical/radio head and protected state lamp.
- **E3 / 2015:** laser-optical tracker with compact multi-optic head on real pan/tilt drive; no baked beam.
- **E4 / 2035:** autonomous compact tracker, enclosed servos, multi-sensor head, physical lamp.
- **E5 / 2060:** lightweight integrated directional multispectral beacon; precise physical two-axis head, no hologram.

E1–E5 evolve from the previous approved era, preserving ground footprint and recognizable pan/tilt geometry.

If imagegen inherits an unrelated subject from prior context, first create a code-drawn structural reference containing only `tripod/base → mast/yoke → aiming head → lamp`, then edit that reference into the requested era. Structural references are control aids, never runtime art.

Runtime target for one beacon:

- footprint: `46×82 LP`
- registration target: `(23,78)` bottom-center design target
- palette baseline: <=32 colors
- SpriteFusion Pixel Snapper: official `Hugo-Dz/spritefusion-pixel-snapper`, revision `ae20461f60fb39e75d15f184bab1ebec1219511c`
- candidate family baseline: `--pixel-size 12`, subject to gameplay-size QA
- Aseprite: official `aseprite/aseprite` `1.3.18.6`, indexed, no dithering
