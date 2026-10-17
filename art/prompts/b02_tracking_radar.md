# B02 — Tracking Radar (`tracking_radar`)

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

Generate **one tracking radar per call and one era per call**. Do not generate an era board, atlas, animation sheet, UI panel, labels or multiple alternatives in the same image.

Physical parts required by the production manifest:

- `pedestal` — static grounded structure;
- `azimuth` — physical rotating stage around the vertical axis;
- `dish` / sensor panel — independently aiming elevation assembly;
- `feed` — physical receiver/feed assembly when the era uses a dish.

The source PNG contains only physical construction. Search sweep graphics, target markers, beams, glow, screen data, particles, cast shadows and tracking overlays are code-owned and must not be baked in.

Each generation is isolated on transparent alpha with complete silhouette and enough padding for azimuth/elevation motion. No people, text, labels, logos, scenery, ground plane, UI or pseudo-writing. `art/style_bible.txt` is appended verbatim to every generation request.

One consistent key light comes from the upper-left, with warm light on upper-left planes and cool blue-gray shadow on lower-right planes; use no baked cast shadow.

## Silhouette / mechanism contract

- Runtime footprint target: `134×118 LP`.
- The grounded pedestal must read clearly at gameplay size and visually support the moving head.
- The azimuth joint must be structurally obvious; the upper assembly must plausibly rotate without deforming the pedestal.
- Dish/panel elevation must have a readable yoke or hinge. Do not fake motion by rotating the whole sprite.
- Keep cables/feeds physically plausible but subordinate to the large silhouette; avoid meaningless micro-detail.
- Preserve transparent clearance around the moving head so its tracking range will not clip after rigging.

## Era lineage

- **E0 / 1978:** coarse directional antenna on a rugged mechanical pedestal; exposed gearing/hand-serviceable structure; function readable without futuristic electronics.
- **E1 / 1986:** recognizable parabolic tracking dish on industrial azimuth/elevation drives.
- **E2 / 1998:** compact motorized tracking radar with enclosed electronics and servo housings; physical dish/feed remains readable.
- **E3 / 2015:** phased-array panel replaces the large dish; precise powered azimuth/elevation frame remains physical and visible.
- **E4 / 2035:** distributed multi-sensor head on a compact autonomous tracking mount; no hologram and no arbitrary floating pieces.
- **E5 / 2060:** lightweight multispectral array on a precise articulated frame; integrated construction evolves from E4 while retaining obvious physical tracking axes.

E1–E5 evolve from the previous approved era. Preserve family scale, registration logic and recognizable azimuth/elevation ancestry. Future eras must evolve the engineering solution, not merely add cyan accents.

Runtime target:

- footprint: `134×118 LP`
- placement anchor: bottom-center; exact runtime pivots remain pending until part-sheet measurement
- palette baseline: <=32 colors
- SpriteFusion Pixel Snapper: official `Hugo-Dz/spritefusion-pixel-snapper`, revision `ae20461f60fb39e75d15f184bab1ebec1219511c`
- Pixel Snapper `--pixel-size` is selected once for the whole E0–E5 family after source review; never tune it per era
- Aseprite: official `aseprite/aseprite` `1.3.18.6`, indexed, no dithering
