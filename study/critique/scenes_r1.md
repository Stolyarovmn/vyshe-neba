# Independent assembled-scene critic — round 1

Reviewed current `work/world` renders for Earth (1978/2060 at world y300; 2015 at y6400), Moon (2060 y80), Mars (1978 y80), `art/style_bible.txt`, `live/world-sprites.js`, and `outputs/rocket/dist/{world-art,journey,game,engine}.js`. This is a scene/module review, not final motion or end-to-end game acceptance. No matching external reference frame was supplied; scores are against the canonical style bible and the actual physics contract, not invented fidelity measurements. Screenshots are 1440×900, representing the 960×600 game viewport at 1.5×.

## Scores

| Axis | Score /10 | Evidence |
|---|---:|---|
| Gameplay readability | 8 | Rocket ≈50×110 screenshot pixels, ring ≈80×110, coin ≈20×20; silhouettes separate on dark local scenes. Earth sunset sun lies directly beside the rocket and reduces focal separation. |
| Grounding / collision agreement | 3 | Terrain median top sits 41.72 / 46.62 world units below the physics surface; pad top sits 4.94–8.20 units above it in measured samples. |
| Terrain assembly | 4 | Repeated 360-unit segments expose 4px source alpha margins, producing conspicuous vertical channels. |
| Location / era selection | 7 | Ring, repair kit, balloon and aviation visibly change between 1978/2060; natural terrain is location-based. Mars still draws an Earth “Над облаками / 3.0 км” waypoint. |
| Sprite style coherence | 7 | New foreground sprites have readable selective outlines; Earth base background has much denser/softer detail and emissive art, already present in the backdrop. |
| HUD assembly | 7 | Numeric chips have consistent spacing at 1440×900; help text occupies the top-right Earth background region. Minimum supported viewport and worst-case values were not assessed. |
| Overall assembled frame | 6 | Recognizable game scene, but terrain channels and mismatched collision surface are material defects. |

## Ranked concrete fixes

### 1. Align terrain and landing artwork with the physics surface

**Where:** `outputs/rocket/dist/world-art.js:draw`, local ground branch. `engine.js:step` clamps rocket.y to 0; `game.js` calls landing when rocket.y<=0. Current terrain uses project(ix*360,-35), sprite width360, ay=.1. Pads use project(0,0), width160, ay=.2.

**Measured:** PNG alpha>128, per-column first opaque pixel, median over non-empty columns:

| Asset | Dimensions | Median visible terrain lip / central pad top, source px | Visible top relative to physics ground, logical screen px at zoom1 |
|---|---|---:|---:|
| terrain_moon | 729×174 | 31 | +41.72 |
| terrain_mars | 728×185 | 42 | +46.62 |
| pad_moon_1978 | 246×123 | 17 (central 40–60% width) | −4.94 |
| pad_moon_2060 | 242×132 | 14 | −8.20 |
| pad_mars_1978 | 246×123 | 16 | −5.59 |
| pad_mars_2060 | 242×134 | 15 | −7.80 |

Terrain formula: 35 − sourceHeight*360/sourceWidth*.1 + medianLip*360/sourceWidth. Positive = below the physical plane. Pad formula: (deckTop − .2*sourceHeight)*160/sourceWidth. Screenshot discrepancies are 1.5 times those numbers.

**Why:** outside the pad the rocket will stop tens of pixels above visible terrain; on the pad it enters the upper deck before the landing trigger. A flat central deck on supports is valid artwork; its contact row must be explicit.

**Change:** record per-sprite contact metadata, project terrain contact at world0, and set pad anchor to the actual central deck row / source height. If rough terrain requires a shallow offset, limit it deliberately and document it. The physics “pad” region is abs(x)<85 (170 units wide), while artwork is160 units wide: unify those dimensions or document the tolerance.

Crops: `scenes_r1/moon-ground.png`, `scenes_r1/mars-ground.png` (3× nearest-neighbour crops, same underlying screenshot scale).

### 2. Remove terrain alpha-margin channels

**Where:** `world-art.js:draw` local terrain tile loop; `terrain_moon.png`, `terrain_mars.png`.

**Measured:** Moon alpha>128 horizontal bbox is x4..724 inclusive in width729; Mars x4..722 in width728. With tile spacing360 and drawing width360, margins leave about4 logical pixels /6 screenshot pixels between adjacent opaque bodies. `5-moon-80.png` exposes channels around x249–256, x788–795, x1328–1336. Their recurrence is conspicuous at play scale.

**Change:** trim transparent horizontal padding for terrain placement and overlap adjacent opaque bounds slightly. The silhouette edge heights must also be checked after overlap; a width-only change can hide gaps while retaining an abrupt vertical step. Backfill must cover the full below-ground screen. Add automated alpha/coverage checks at several camera x positions and zoom .7/1.

Crop: `scenes_r1/terrain-seam.png`.

### 3. Suppress Earth route labels on Mars

**Where:** `game.js:drawRoute`; it skips mode2 only.

**Measured:** `0-mars-80.png` shows “Над облаками” at x0..291, y234..268, and a “3.0 км” waypoint. Mars mode4 passes the early return; Moon mode2 does not.

**Change:** return unless rocket.body==='earth', or explicitly exclude mode2 and4 consistently with other location checks. Assert no Earth waypoint labels in Moon/Mars QA scenes.

Crop: `scenes_r1/mars-earth-waypoint.png`.

### 4. Separate known legacy backdrop differences from completion of new assets

**Where:** Earth `earthAtlas` routeSky/base rendering, high-altitude sample `3-earth-6400.png`.

**Observed:** the atlas shows a fixed star field beneath the additional small code stars, including a bright four-point star near screenshot x1202,y661. The task requires stars/effects to be code systems. The existing Earth base also carries baked lamp blooms. This review did not inspect source provenance or animate these assets, so it cannot establish whether replacement is required for this task; do not describe the entire effects separation as verified based on current screenshots.

**Change:** audit the source backdrop and explicitly list any retained baked star/light elements as legacy exceptions or replace them using the required pipeline. Verify animation independently.

## Polish checklist

1. Rendering family: **partial pass** — new sprites share the pixel-look language; Earth background is visibly softer/denser. See `earth-actor.png` crop, no reference image parity claim.
2. Texel density: **not fully verified** — runtime sprite scale differs naturally by class; whole-frame inspection cannot prove one logical pixel density across generated masters.
3. Outline / light: **partial pass** — new objects generally read upper-left light; no per-asset light measurement in this scene review.
4. HUD: **pass at inspected viewport only**; minimum viewport/long strings not checked.
5. FX emitters / occlusion: **not verified** — requires dedicated motion/anchor evidence; still renders do not establish it.
6. Articulation: **not applicable to walking characters**; satellite, aircraft and balloon rig motion need separate review.
7. Grounding / sorting: **fail**, fixes1–2.
8. Generator artifacts / tiles: **fail**, repeated terrain gaps; no obvious garbled labels on reviewed new foreground assets.
9. Placeholder tells: **fail for location label**, fix3; no debug overlay in inspected renders.
10. State readability / reactions: **not verified** from screenshots alone.
11. FX age strips: **not verified**; no full effect lifecycle supplied to this critic.

## Rules affected

`critics.md` terrain/platform contract (“walk line = drawn top”), polish7 grounding, polish8 visible repeated tiles, polish9 context-correct presentation; canonical style bible alpha/composition and system-separation clauses where legacy backdrop contains static FX.

## Minor / acceptance limits

- Earth sunset solar disc sits almost directly behind the player at the tested frame; check other camera positions before changing the composition.
- Moons/Mars carry an intentionally stylized visible Earth of66 logical pixels; no astronomy-scale claim is made.
- No code was changed by this critic. The lead must re-render identical scenes after fixes and preserve this report as round1 evidence. Motion and gameplay interaction acceptance remain separate.
