# Sprite production progress

Snapshot: 2026-10-16 (Moscow). Continue this file instead of repeating generated batches.

## Source and integration checkpoint

- Canonical design code: `art/style_bible.txt`. All 15 prepared imagegen requests contain that block verbatim (checked by literal substring comparison; rejected sheet parts are retained as evidence, not runtime assets).
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

1. Aircraft round-1 blockers are resolved in the follow-up below. Do not regenerate the accepted 15 body-only replacements or restore old family-wide effect coordinates. A longer full navigation-blink cycle remains a minor verification gap; source landmark uncertainty is explicitly retained.
2. The legacy base atlas still contains lamp halos, red beacon glow and 2060 decorative drone underglow/bodies. Sky-layer baked stars/clouds are removed from runtime, but the whole-base lighting separation is NOT done. See `study/critique/earth-effects-r1.md` for exact source regions. Preserve buildings, ground, mountains and sun; do a surgical imagegen edit plus code lighting at measured housings, not a new base redesign or new interactive drone mechanics.
3. Replace generic satellite body hinge positions with measured per-era joint metadata if the attachment audit shows visible gaps. Panel mirroring and full-cycle geometry are already verified; do not regenerate accepted panels unnecessarily.
4. Terrain polish: periodic dark joins and a broad plain lower substrate band remain. Open transparent seams and gross physical-ground mismatch are fixed. Preserve collision/gameplay while improving the visual join/fill.
5. Finish whole-game play-feel and visual transition acceptance after base-effect separation. The follow-up measured a passing desktop RAF pacing sample (below), but this is not a universal hardware/mobile performance guarantee.

Task is not complete. Keep the recurring task enabled. Do not regenerate accepted batches or add mechanics.

## Follow-up after commit 32dedbc: aircraft and sky

- Built-in imagegen edited twelve low-aircraft bodies and three propeller transports to remove frozen blades. The first transport sheet retained unwanted bars on two aircraft; those parts were rejected, retained under `transport_reject_*`, and excluded from prep. The second targeted edit supplied the accepted two bodies. All accepted source designs remain consistent with the original family; no new gameplay mechanics were introduced.
- `art/aircraft/anchor-candidates-r2.json` contains individual source-pixel hub/nozzle/fan/light positions for all 36 aircraft. These are independent visual landmark measurements with approximately ±3–5 source-pixel uncertainty. Propeller radii are authored rig geometry, not measurements of blades that no longer exist. Hidden/ambiguous mechanisms are omitted rather than invented.
- `tools/build-aircraft.py` rejects stale source hashes/dimensions and anchors off physical material, normalizes positions, and packages the exact same prepared PNG bytes as world QA. Fixed ZIP timestamps make the package reproducible; CRC and all 36 entries were verified.
- New code anchor traces validate 648 transformed aircraft draws, 1764 effect origins, both facings, three scales and a rotated parent transform. Maximum normalization/transform discrepancy was about 0.0000011 output pixels; this does NOT reduce visual landmark uncertainty. Phase exports now use native 960x900 canvas PNGs instead of CSS-stretched screenshots.
- Independent aircraft final bounded review: `study/critique/aircraft_r3.md`, accepted 8/10; frozen-blade and large-anchor-error blockers resolved. Effect finish and full light-blink coverage remain explicitly limited.
- A new opaque imagegen sky color plate replaces the runtime use of `sky-route.png`; the original is kept for provenance. Code stars now draw after the atmosphere atlas and remain visible below its top boundary. Low cloud banks and high cirrus use existing generated masters with code motion, staggered placement and clean central play space.
- Found and corrected a disconnected render path: `atmosphericEffects()` existed but was not called. It now runs in the flight environment. Meteor trails now taper/fade over their lifecycle with code glow and an actual rock-sprite head, not fixed straight bars plus a square.
- Independent sky review `study/critique/earth-effects-r3.md`: accepted 8/10, readability 9/10. This is a layered style/readability acceptance, not a claim that the original dense galaxy and cloud arcs are pixel-identical.
- QA harness fix: tests that disable requestAnimationFrame now poll loading conditions on a 50ms interval. Previously default RAF polling could freeze before ZIP decoding completed; the asset-ready condition and 30-second timeout remain unchanged.
- Current follow-up verification: the unified `npm test` passed all 14 build/QA steps, including the new aircraft and atmosphere checks. The 30 assembled world scenes, full-period secondary-motion QA, and ref2game six-state ui/anchors/anim checks passed. The ref2game art-only harness still has six expected missing-HUD-record warnings; character rigs are not exercised there.
- Optional performance measurement: Chromium/SwiftShader, viewport 1440x900, canvas 1920x1200, base-era 2060 flight, after warm-up: 241 RAF frames / 4.0113 seconds = 60.0803 fps; p95 frame interval 16.7ms; no page errors; flight state retained. `art/qa/performance-report.json` records this bounded run. This passes the 55fps sample threshold, not a claim about all devices or all gameplay states.
- Reproduction: `python3 tools/ref2game/prep.py --all`, `python3 tools/build-world-manifest.py`, `python3 tools/build-aircraft.py`, `python3 tools/prepare-sky.py`, then `npm test`. `qa-performance.cjs` is optional and not a universal CI gate. The source-hash guard deliberately fails if aircraft art changes without remeasuring its landmarks.
