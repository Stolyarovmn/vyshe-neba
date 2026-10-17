# B02 — Tracking Radar (`tracking_radar`)

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

## Generation contract

Generate exactly **one isolated era asset per image-generation call**. Never generate an E0–E5 board, infographic, atlas, UI panel, or multiple unrelated assets as production art.

Create one complete ground tracking-radar installation. Physical parts are `pedestal`, `azimuth`, `dish`, and `feed`; every part must remain mechanically plausible for later cut-out rigging. The dish must visibly rotate around a real azimuth mechanism and tilt around a readable yoke/pivot rather than implying motion by rotating the whole sprite.

No people, scenery, labels, text, pseudo-writing, logos, UI, baked screen data, radar sweep, glow, cast shadow, particles, beams, trajectories, motion blur, or other frozen FX. Background must be transparent and the silhouette complete with generous padding.

Use a consistent side-to-slight-3/4 gameplay projection across the whole family. Keep the ground footprint and basic pedestal ancestry recognizable from E0 through E5.

The six eras are one engineering lineage:

- **E0 / 1978:** rough directional tracking antenna on a heavy welded pedestal, exposed mechanical gearing/yoke and simple physical feed hardware. Credible late-1970s engineering; no futuristic enclosure.
- **E1 / 1986:** industrial parabolic dish with reinforced pedestal, external drive housings and clearly readable azimuth/elevation mechanisms.
- **E2 / 1998:** more compact motorized tracking radar, enclosed servos, cleaner cable routing and a physically distinct feed assembly; late-1990s test-center engineering.
- **E3 / 2015:** modern modular tracking unit with a compact phased-array or hybrid panel/dish solution on a precise powered mount; clean enclosed drives, still visibly mechanical.
- **E4 / 2035:** distributed sensor head consolidated around an autonomous precision mount; less exposed cabling and smaller moving mass while preserving a real azimuth/elevation mechanism.
- **E5 / 2060:** lightweight multispectral directional array on a high-precision physical gimbal. Advanced materials and integration are allowed, but no hologram and no functionally impossible floating parts.

For E1–E5, evolve from the previously approved era rather than redesigning from scratch. Preserve recognizable pedestal proportions, rotation axis, aiming logic and family silhouette.

## Runtime target

- Manifest footprint: `134×118 LP`
- Placement registration: bottom-center; final numeric registration is measured after approved art normalization
- Palette baseline: <= `32` colors after processing
- SpriteFusion Pixel Snapper: official `Hugo-Dz/spritefusion-pixel-snapper`, pinned revision `ae20461f60fb39e75d15f184bab1ebec1219511c`
- Family Pixel Snapper `--pixel-size` is selected after E0 visual QA and then held constant across E0–E5 unless a documented family-wide reprocess changes it
- Aseprite: official `aseprite/aseprite` `1.3.18.6`, indexed color, no dithering

## Style bible — verbatim

VYSHE NEBA — CANONICAL STYLE BIBLE

Style family: cohesive HD pixel-art / pixel-look game art with deliberate pixel clusters, clear silhouettes, restrained detail and a finished indie-game presentation. It must look designed, not like a filtered 3D render or generic AI illustration.

Shape language: large readable masses first, functional construction second, sparse small accents last. Silhouettes must remain legible at actual gameplay size and when reduced by the camera. Avoid meaningless micro-detail, decorative noise and accidental extra parts.

Shading: stepped pixel shading is the default. Use a small, intentional tonal ramp per material; add extra tones, controlled dithering or a limited gradient only when they clearly improve material readability. No pillow shading and no soft airbrushed volume on solid small sprites.

Palette temperature: shadows are cool dark blue-gray; lit neutrals are warm off-white/metal; saturated reds, golds and cyans are accents, not mandatory identifiers. Materials may use their own palettes as long as value hierarchy and world coherence are preserved.

Line: prefer dark chromatic selective outlines instead of pure black. The outer contour is usually visually about one logical pixel at runtime, may lighten or disappear on the lit side, and may deepen on the shadow side. Interior lines are sparse and functional.

Texture: intentional pixel clusters, stepped diagonals and broad quiet regions. Avoid random single-pixel noise. Dithering is a deliberate material or transition tool, never a blanket texture.

Detail hierarchy: keep most of the surface calm. Concentrate detail around functional mechanisms, focal points, material changes and attachment areas. Readability at gameplay size has priority over master-image detail.

Lighting sentence — use verbatim on every generation: One consistent key light comes from the upper-left, with warm light on upper-left planes and cool blue-gray shadow on lower-right planes; use no baked cast shadow.

Projection: gameplay aircraft and moving hazards use a consistent strict side to slight 3/4 side view chosen for silhouette readability; do not mix top-down, isometric or frontal projections inside one asset family unless a specific gameplay need requires it.

Alpha and composition: isolated runtime sprites use a clean transparent background, complete uncropped silhouette and enough padding for rotation or moving attachments. Solid sprite edges should be crisp and free of accidental semi-transparent fringe.

System separation: the image contains the physical object and its materials. Code owns scale, final palette normalization, alpha cleanup, dynamic light response, glow, bloom, cast shadow, propeller motion, turbines, exhaust, afterburner, heat haze, contrails, navigation lights, particles, smoke, motion blur, trails and all other motion or effects.

Exclusions: no text, letters, numbers, logos, watermark, pseudo-writing, scenery, UI, baked glow, bloom, light rays, cast shadow, motion blur, particles, smoke trails, speed lines or frozen effects unless the requested asset explicitly requires an environmental element.

Artistic freedom: these rules define the shared language, not a template. A deliberate deviation is allowed when it clearly produces a stronger silhouette, better material, better readability, stronger character or more coherent result. Do not preserve a rule at the expense of visibly better art; do not use “artistic freedom” to excuse technical defects or accidental generator artifacts.
