# World sprites — independent asset and motion critique, round 1

Reviewed 2026-10-15. This review made no runtime/code edits. Inputs: `art/style_bible.txt`, `live/world-sprites.js`, prepared `outputs/rocket/dist/assets/world/*`, `work/world/contact-{0,0.28,0.56,0.84}.png`, Earth 1978 assembled frame and Moon 2060 assembled frame. These are the current **flat landing pads**, not the old station designs. There is no approved reference crop for each new object, so these are design-code/readability scores, not a claim of reference fidelity. Automated `work/ref2game-qa/report.json` reports zero traced nozzle distance for six eras; its limitation is discussed below.

## Scores

| Axis | Score / 10 | Reason |
|---|---:|---|
| Style and silhouette | 8 | Clear functional silhouettes; restrained warm neutral/red/cyan palette and stepped materials survive the shown game scale. |
| Prepared alpha | 8 | Gray composites have clean dark silhouettes. Low-opacity edge pixels exist, but a visible white matte fringe was **not** confirmed on correct compositing. |
| Proportions | 5 | Hardcoded destination rectangles squash canopy and solar panels; some square item destinations distort their original silhouettes. |
| Attachment/grounding | 6 | Separate parts work, but opposite satellite panels share an unmirrored connector; terrain tile seams break the ground plane. |
| Era evolution | 7 | Pickups, balloon structures and satellite bodies evolve visibly over six columns; rocket progression is subtler but coherent. Natural rocks repeat by variant rather than epoch. |
| Motion | 6 | Coin turning, balloon pod drift and solar array motion are demonstrated; physical joint-specific anchors and full-loop/transition evidence are incomplete. |
| Overall batch | 7 | Good usable asset foundation; fix the measured integration defects before calling final acceptance. |

## Highest-impact fixes

1. **Close lunar/Martian terrain seams.** WHAT: `outputs/rocket/dist/world-art.js`, terrain strip loop, and prepared `terrain_moon.png` / `terrain_mars.png`. Evidence: `work/world/5-moon-80.png` shows ~8–10 screen-pixel dark vertical gaps around x248–257, 788–797 and1328–1337 in the ground. `sprites_r1/terrain_3x.png` magnifies the first seam. WHY: loop advances exactly one full sprite width while the prepared asset has transparent edge padding (Moon alpha bbox x1..726 inside729 columns; Mars x3..725 inside728). The rocky side contours add variable-width empty corners, so cropping the bbox alone may not fully solve this. CHANGE: draw an opaque underlying terrain band of matching shadow colour, overlap adjacent strips by the transparent contour width, and use a repeated-edge blend/cap if needed. Verify no background-colour column remains below the walk surface across the wrap for both worlds. Do not merely enlarge individual landing pads.

2. **Preserve artwork aspect ratios except intentional coin turn.** WHAT: `live/world-sprites.js`, `parachute`, `hazard('satellite')`, `item`. WHY: canopy source390×265 has h/w0.679 but is drawn80×32 (h/w0.400), vertical compression41.1%; panel1978 164×92 is drawn46×17, compression34.1%; panel2060 240×169 gets compression47.5%. Fuel1978 is compressed14.4% vertically, repair1978 stretched25.8% vertically by40×40. CHANGE: fit assets into their existing gameplay bounding boxes with a single uniform scale (`min(targetW/sourceW,targetH/sourceH)`), then update attachment positions to the resulting bounds. Leave coin squash intentional because it represents a turn. Re-render the same contact and assembled scenes; inspect canopy rope end registration after the change.

3. **Mirror or explicitly anchor the left solar array.** WHAT: `live/world-sprites.js`, satellite loop. WHY: `panel_1978.png` has its physical thin connector at the left edge (roughly x0..20 of164), while both sides reuse the same image orientation. Left array consequently points its connector outward. Generic body joints are `[.08,.5]` and `[.92,.5]` for all six geometrically different bodies. CHANGE: use a connector anchor per panel and body joint per era; draw left array mirrored so the connector faces body. Rotate about the connector, not the array centre. Add trace points that compare the actual panel connector to actual body hinge at frame0, positive extreme and negative extreme. A geometric zero-distance check against a generic centre is insufficient.

4. **Improve acceptance coverage, not only motion-energy coverage.** WHAT: `live/index.html` QA states and animation strip. WHY: current deterministic scene renders booster+parachute simultaneously and traces only the booster nozzle. It does not establish assembled validity of capsule chute transition, core separation, reversed aircraft/solar pivots, or full0.65rad/s array cycle. The supplied contact frames span only0.84s, versus ~9.67s solar cycle. CHANGE: add valid representative stage states and a full cycle with endpoint/hinge checks. Tests should use measured occupied-alpha landmarks (or reviewed per-asset metadata) rather than assigning exhaust=[.5,1] and checking a flame started at that same assumed value. Core-to-booster join shows a small visible gap in the contact view; verify whether this is an intended detached/QA pose or an attached in-game stage before accepting it.

## Evidence and measurements

- Gray composite: `sprites_r1/runtime_gray.png`. Sprite measurement output: `sprites_r1/measurements.json`.
- Prepared partial-alpha pixel counts (not automatically defects): booster1978 2731; satellite1978 3622; panel1978 1281; canopy4696; terrainMoon5318. Pale neutral fraction of the alpha>128 outer2px band: booster0%, panel0%, canopy0%, satellite0.9%. A transparent-image tool preview initially suggested a halo, but that hypothesis was withdrawn after correct gray compositing. Do not strip white physical panels on the basis of the tool preview.
- Contact-sheet changes versus t0, same fixed crop: balloon pod343/389/412 pixels changed at t.28/.56/.84; satellite906/985/1023; coin179/182/177. This confirms separately changing regions, not joint correctness or seamless full cycles.
- Current Moon landing pad has a usable empty flat central deck. Prepared pad2060 is242×132 and runtime draw uses natural aspect ratio. This fixes the former station/pad design conflict; no regeneration is requested for the pad in this round.
- Physical canopy, booster, satellite, panel and terrain inspected on gray contain no obvious baked exhaust, glow plume or frozen particle trail. Warm material highlights alone are not baked dynamic effects.

## Rules broken / not yet demonstrated

- Style bible alpha/composition + ref2game terrain grounding: prepared transparent tile borders must not expose the background when assembled.
- Style bible large readable masses / functional construction: nonuniform scaling alters designed mass and panel connector geometry.
- ref2game animation attachment continuity: left panel physical connector alignment is not preserved; per-body hinge positions not established.
- ref2game motion acceptance: full cycles and stage transitions are not evidenced by four subsecond contact stills. Current QA energy and generic nozzle tests do not prove this.

## Minor issues / scope limits

- Terrain repeats its two large crater pattern at a regular ~540px interval in the shown1440px frame. After sealing gaps, consider shifted/mirrored sections only if allowed by light direction, or a second authored strip; do not manufacture era-dependent geology.
- Asteroid rotation70×65 vs source341×340 compresses vertical proportion6.9%; far less severe than panels, but using natural ratio keeps the family consistent.
- All six era coins read primarily as the same gold token at shown scale. This is acceptable for role recognition; do not add micro-detail merely to force difference.
- HUD overlap/coin-behind-panel in the supplied Earth debug scene exists, but HUD redesign is outside this asset batch. The Earth frame is not a basis for claiming full game acceptance.

Verdict: **FIX IN POST / CODE**, then re-render the same regions. No demonstrated need to regenerate the current flat landing pads. The full animation and game acceptance gate remains open.
