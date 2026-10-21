# Rocket modular fins lineage

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

## Generation contract

Generate exactly **one isolated stabilizer/fins era asset per image-generation call**.

Physical entity: the detachable stabilizer assembly only: central structural collar/mount plus left/right aerodynamic fins. Do not include the long cylindrical body, capsule, engine/nozzle, booster, flame, smoke, UI, labels or scenery. The collar must fit the common body lower mating diameter and remain mechanically plausible as an independent purchased component.

Era lineage:
- E0 / 1978: simple red metal stabilizers on a dark structural collar, rugged fasteners.
- E1 / 1986: cleaner bracing and more controlled airfoil geometry.
- E2 / 1998: stronger composite/metal hybrid surfaces and precise mounts.
- E3 / 2015: modern enclosed hinges/mounts and reduced exposed structure.
- E4 / 2035: lighter high-strength surfaces with restrained integrated accents.
- E5 / 2060: precise lightweight stabilizers, still physical and mechanically readable, no holograms.

For E1–E5 evolve from the previously approved era; do not redesign from scratch.

Transparent background, full uncropped silhouette, generous padding. No text, pseudo-writing, logos, baked FX or cast shadow.

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
