# Sprite production progress

Snapshot: 2026-10-16 (Moscow). Continue this file instead of repeating generated batches.

## Source and integration checkpoint

- Canonical design code: `art/style_bible.txt`. All 11 prepared imagegen requests contain that block verbatim (checked by literal substring comparison).
- Production follows ref2game `codex/SKILL.md`: prepare -> built-in imagegen -> import -> slice -> prep. Original sheets, prepared sources, requests and import logs are retained in `art/raw`, `art/gen`, `art/requests`, `art/logs`.
- There are 164 prepared PNG entries in the world manifest, including separated physical parts and retained source variants. The aircraft ZIP contains 36 PNGs and passes Python ZIP CRC verification. These counts overlap in aircraft artwork; they are not a count of 200 distinct object designs.
- Capsules, rocket cores, booster blocks, fuel, repair kits, magnets, coins, checkpoint rings, balloon envelope/pod parts, satellite bodies/panels, city silhouettes and Moon/Mars pads use base-era selection (1978/1986/1998/2015/2035/2060).
- This pass added six canopy and six folded-pack variants through imagegen and integrated them. Suspension cords follow the moving canopy in code.
- Nature (four rocks, four clouds, Moon/Earth, terrain) is selected without artificial era changes.
- Runtime integration: `live/world-sprites.js`, `live/aircraft.js`; build copies both to runtime. Existing game/background integration remains in `outputs/rocket/dist/game.js` and `world-art.js`.
- The generated standalone HTML is intentionally not committed; `npm run build` recreates it from committed source/assets.

## Corrections accepted in review

- Aircraft choice is cached from object origin; moving coordinates no longer change lineage/era mid-flight.
- Flat Moon/Mars decks replace obstructing station art. Their measured center deck anchors align with physics ground; width is 170 world units, matching existing pad bounds.
- Terrain uses measured median-lip anchors and overlapping tiles to close transparent channels.
- Physical canopies, panels, asteroids and pickups preserve source proportions (coin width animation is deliberate).
- Left satellite panel is mirrored so its connector faces inward.
- Detached booster draws its own body only; crash fragments sample physical painted material instead of solid rectangles.
- Mars no longer displays Earth atmospheric waypoints. Code stars have time-based brightness.

## Verification

- `npm test`: build and all existing regression scripts passed, including browser controls, stage separation, camera/map, pad UI, audio, Earth-to-Moon transfer and mobile gestures. In this runner Chrome was replaced by the available Chromium; the audio test required multiprocess Chromium.
- `qa-world.cjs`: 164 world sprites, 36 aircraft, 30 assembled scenes across six eras/Earth/Moon/Mars, stable aircraft selection, measured landing-anchor presence, physical aspect ratios, detached booster isolation and panel movement passed with zero page/asset errors.
- `qa-world-offline.cjs`: manifest and four deterministic Canvas contact renders passed.
- ref2game `qa.mjs --only ui,anchors,anim`: six states passed. Its world-art-only harness has no HUD UI records; six warnings remain. HUD is covered by the existing game QA, not by this harness. Character rig checks do not apply to this non-character harness; do not describe this as a complete ref2game gate.
- `qa-world-motion.cjs`: six eras x three secondary systems x 17 samples passed. Panel samples cover a full 9.6664-second cycle; parachute samples cover 2.3271 seconds. Flame samples cover its primary 43-rad/s length oscillation; its other independent oscillation is not claimed to share that period.
- Independent critics: `study/critique/sprites_r2.md` (8/10), `scenes_r2.md` (8/10), `motion_r3.md` (8/10). Reports preserve measured evidence and limitations. No global completion approval.

## Remaining work / next pass

1. Audit aircraft source art against code effects. Some physical propeller blades appear to remain in body textures; separate blades from bodies and verify there is no fixed duplicate beneath code rotation. Measure engine/propeller/nav-light anchors per actual sprite; current profiles contain approximate coordinates. Independent aircraft review `study/critique/aircraft_r1.md` is NOT accepted (4/10): baked blades and effect anchors are confirmed blockers. Examples: low_primary_1978 propeller hub is near source (225,84), while metadata maps near (227.5,102.7); high_fighter_2060 nozzle is near (47,97), while metadata maps near (14,90.5). Landmarks have about ±3 source-pixel visual measurement uncertainty; use the original images to verify individual replacements.
2. Audit the retained Earth `sky-route.png`/base atlas for baked stars and other effects. Code stars alone do not prove that all legacy baked effects are gone. Any replacement raster must use built-in imagegen with the verbatim style bible, preserve composition, and pass assembled-scene/map QA.
3. Replace generic satellite body hinge positions with measured per-era joint metadata if the attachment audit shows visible gaps. Panel mirroring and full-cycle geometry are already verified; do not regenerate accepted panels unnecessarily.
4. Terrain polish: periodic dark joins and a broad plain lower substrate band remain. Open transparent seams and gross physical-ground mismatch are fixed. Preserve collision/gameplay while improving the visual join/fill.
5. Finish the global play-feel/performance and stage-transition visual acceptance after the remaining changes. Existing functional regressions passing is not a measured 55/60 fps gate.

Task is not complete. Keep the recurring task enabled. Do not regenerate accepted batches or add mechanics.
