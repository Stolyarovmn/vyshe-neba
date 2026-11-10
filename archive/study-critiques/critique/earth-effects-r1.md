# Earth background effects audit — independent critic, round1

Read-only audit of original `outputs/rocket/dist/assets/sky-route.png` (724×2172), `base-eras.png` (1774×887), `world-art.js`, and `game.js:environment/atmosphericEffects`. Native-resolution crops are saved in `study/critique/earth-effects-r1/`. All image bands below are visual inventory bounds, not semantic segmentation masks; stars and wispy clouds interleave, so a hard horizontal cut cannot isolate them cleanly.

## Findings

**The source artwork does contain baked effects that the existing code effects do not replace.** Stars are the clearest direct conflict. Base lamp/beacon halos and2060 hovering-object underglows also remain baked. Clouds are allowed to be raster objects under the brief; the problem is their immutable backdrop placement/weather state, not their existence as images.

No unmistakable lightning bolt, aircraft exhaust, smoke plume, meteor streak, explosion or rain field was found in either original image. Do not invent those defects or claim those layers need regeneration. White wisps in sky-route are clouds/cirrus; there is insufficient evidence to call them exhaust trails.

## Source coordinates and world mapping

### sky-route

`earthAtlas` draws the full source to1600×6500, beginning at map y0/world y6400. Thus source row `v` maps to **worldY=6400−v×6500/2172**. One world unit is10 displayed game metres (existing manifest convention). Horizontal source x maps to world x=−800+x×1600/724 in central band; other bands mirror the atlas.

| Element | Source band, approximate | World height range | Evidence / consequence |
|---|---|---|---|
| Dense blue galactic/star texture | y0–740 | 6400→4185.5 | Thousands of bright flecks, fixed blue nebulous clumps; part of the opaque image. |
| Isolated star dots / four-point stars | y0–1160 | 6400→2928.5 | Readable crosses near (486,51), (241,124), (295,261), (447,298), (574,344), (491,594), plus fainter dots lower down. Bounds intentionally include overlapping cirrus; do not erase every white pixel. |
| Wispy cirrus becoming large white cloud banks | y≈520–2172 | 4843.8→−100 | Lower banks grow from left/right edges; central negative space is a major compositional feature. These do not move or respond to weather independently of camera. |
| Last cloud/source rows | y≈1938–1987 | 600.3→453.6 | Partly covered by the base top fade. Below world455 the central/edge base is opaque, hiding later sky rows. |

The renderer's top180-map-pixel cap darkens only source first≈60.15 rows (world6400→6220); it does not remove the source star field below that band.

### base-eras

The sheet is3 columns×2 rows. Fractional renderer cell size is591.333×443.5; each cell is cropped by2 source pixels on each side and scaled to1280×800, placed with its top at world600. For source y local to an era cell, **worldY=600−(v−2)×800/439.5**. Global source y is local v plus0 for1978/1986/1998 or443.5 for2015/2035/2060. Native crop PNGs round the cell extraction to integer pixels; do not treat their one-pixel rounding as runtime geometry.

| Element | Era / approximate local source box or band | World band | Treatment |
|---|---|---|---|
| Sunset cloud wisps | All six, y10–158 |585.4→316.0 | Immutable environmental cloud layer; allowed artwork material, but not weather-driven. |
| Sun disc and warm atmospheric horizon | All six, disc near x305–328,y155–175 |321.5→285.1 | Preserve as celestial/environmental composition. The brief does not require replacing a sun disc with particles or new mechanics. |
| Warm lamps and light pools | All six; obvious1978 lamps near(199,222),(440,247); broader mechanisms/windows extend y200–375 |239.6→−79.0 | Physical lamp housings/windows can remain; halos/pools must be separated if strict code-owned dynamic light is required. |
| Red antenna beacons with halos |1998 at roughly(165,76),(188,80);2015/2035/2060 upper antenna rows y8–144 |589.1→341.5 | The housings/material red pixels can remain; baked luminous aura is an effect. Static red pixels do not establish blinking animation. |
| Cyan luminous tower strips / ring bands |2035/2060, upper/lower tower details | Mixed, within base footprint | Keep physical cyan material; remove surrounding bloom then code-render emission at source-derived anchors. Do not infer that every cyan pixel is unwanted glow. |
| Hovering drone/pod-like objects and underglow |2060 near(296,236),(385,232),(475,176),(544,159), approximately y145–260 |339.7→130.4 | Bodies are baked in the backdrop; cyan under-light is fixed. Separate/mask bodies and their glow if motion is required. Do not add interactable drones or collision mechanics. |

There are also painted shadows under scenery. They are part of the legacy background, not isolated runtime sprite shadows; strict scene-wide no-baked-cast-shadow acceptance would require a separate background-lighting scope decision. Do not claim that updating new foreground sprites has already removed these.

## Runtime coverage and concrete issue

1. `WorldArt.draw` first draws generated stars, then draws `earthAtlas` on top. The atlas is opaque. Consequently Earth code stars in world6200–6400 are **occluded**, while the source star field remains visible below6400. Code stars above6400/local Moon/Mars are not hidden by the Earth atlas. Moving the code star pass after the atlas is necessary when replacing its star layer.
2. `game.js:atmosphericEffects` uses reusable cloud sprites and camera-derived positions for world rows180+i×210. Their opacity fades using rocket altitude1000–2200; weather adds opacity. The baked clouds at world≈2929–4844 cannot be controlled by this existing low-altitude overlay. It is not enough to say “cloud system exists”.
3. Dynamic rain and flash are code-driven in `environment`; no baked rain/lightning counterpart was observed in these sources. Meteors are code-driven in `atmosphericEffects` and no unequivocal baked meteor was found.
4. Base glows/beacons and2060 hovering bodies belong to the opaque cached base canvas. There is no independent animation/lighting of these exact backdrop pixels in the inspected renderer. Foreground aircraft light/engine systems do not animate them.

## Smallest safe remedy

### Primary single-layer request: edit only sky-route

Use built-in imagegen with the **existing724×2172 sky-route as the edit reference**, plus the full style bible verbatim in the prompt. Request one full-size **clean sky colour plate** preserving its vertical blue-to-navy palette progression, edge-heavy composition and central quiet area, but removing all distinct stars, star-cross glints, luminous speckle/galaxy detail and cloud/cirrus masses. No celestial bodies, text, structures, trails, weather effects or new objects. Preserve the source aspect ratio. This is a single existing layer replacement, not a new scene or a regeneration of the Earth base.

Then render stars after the atlas with an altitude-controlled star system. Reuse existing generated cloud masters as code-positioned/animated background layers; add a sparse wispy high-altitude cloud layer only if the existing four masters cannot preserve the original edge arcs. A separate cloud raster is legitimate; its transforms, opacity and response belong to code. Match the old broad value progression and central negative space in assembled scenes at world300/1300/4200/6400; do not replace the sky with a different imagined composition.

A plain gradient made only in code is a lower-production-cost alternative, but would visibly remove the reference texture structure. Do not claim it preserves the original composition/fidelity without a before/after review.

### Secondary surgical base separation

Do not regenerate the whole base sheet. First extract stable per-era lamp/beacon coordinates from the existing source. An imagegen edit of the existing sheet can remove **only the luminous halos/light pools and2060 drone underglow/bodies**, preserving all buildings, ground, sun, mountains and objects. Restore subtle code light/blink at the recorded housings; if preserving2060 drones, use isolated bodies as noninteractive background props with code-owned movement/glow. No new gameplay mechanism is needed. Because clouds overlap the sunset landscape, removing them from the base is a distinct edit and should not be conflated with a simple star cleanup.

## Acceptance / blocker statement

The claim “all effects are code systems” is **not supported by the current Earth sources and draw order**. Baked stars are a direct remaining blocker to that claim. Existing background lamp glows/beacons/2060 underglow must either be surgically separated or explicitly retained as uncompleted legacy work. No image or runtime code was changed in this audit.
