# B01 / weather_complex / E0 1978 — Rig Part Sheet

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

Create ONE isolated rig part sheet for the already approved B01 E0 / 1978 weather-complex anchor art. Use the approved E0 anchor as the visual/geometry reference. Do not redesign the machine.

The part sheet contains exactly these physical components, fully separated from each other with generous transparent padding and no overlaps:

1. `body` — complete static welded base, tubular mast and fixed electronics/control box structure, with all attachment geometry required to reconstruct the approved rest pose.
2. `sensor` — complete rotary weather-sensor head, including hidden attachment area around the rotation joint.
3. `vane` — complete wind-reactive cup-anemometer / wind-vane assembly, including the full axle/hub area that is hidden in rest pose.
4. `indicator` — complete physical state-indicator/gauge hardware as its own removable component, with all mounting tabs/hidden attachment area.

Do not show alternate poses, animation frames, arrows, labels, callouts, numbers, text, pseudo-writing, UI, motion streaks or duplicated parts. The sheet is only a clean inventory of the four physical rig pieces.

Critical reconstruction rule: when the four parts are composited at their true attachment points, they must recreate the approved E0 anchor silhouette and proportions exactly enough for a measured cut-out rig. Preserve the approved camera/projection, materials, palette family, upper-left lighting direction and 1978 engineering logic. Do not simplify away actual attachment geometry. Do not invent new machinery.

Transparent background. Every part complete and uncropped. No baked cast shadow, glow, bloom, smoke, particles or other FX.

One consistent key light comes from the upper-left, with warm light on upper-left planes and cool blue-gray shadow on lower-right planes; use no baked cast shadow.

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
