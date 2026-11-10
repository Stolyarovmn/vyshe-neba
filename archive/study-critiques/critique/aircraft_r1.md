# Aircraft critic — round 1

Independent, read-only code/asset audit, 2026-10-15 UTC. Verdict: **FIX / REGENERATE PARTS; not accepted as completed animation integration**.

## Scores (1–10)

| Axis | Score | Evidence |
|---|---:|---|
| Shared rendering family | 7 | Representative six lineages share stepped shading, cool dark contours and broadly upper-left highlights. No external approved aircraft reference supplied for exact fidelity. |
| Body/animation separation | 2 | Propeller blades are still visible in full body PNGs; runtime draws the same full PNG before drawing additional animated blades. |
| Effect anchors | 3 | Several engine/propeller points are copied across distinct silhouettes and miss by 8–33 source pixels. |
| Alpha | 5 | Runtime ZIP bodies are predominantly opaque but retain thousands of soft pixels; full-size source bodies have no alpha=255 pixels in measured examples. |
| Overall bounded aircraft integration | 4 | Readable art, but duplicate frozen moving parts and incorrect emitters prevent acceptance. No whole-game score is implied. |

## Highest-impact fixes

1. **Separate static propellers from body art.** `art/gen/low_primary_1978.png` visibly contains blades around x=222–230, y≈40–130; corresponding ZIP image also contains them. In `live/aircraft.js`, `draw()` unconditionally draws the entire body, then `front()` adds two moving strokes and an ellipse at the metadata hub. Frozen blades cannot disappear. Same issue visible in `low_primary_2060`, `medium_passenger_1978`, `medium_cargo_1986`, and lower propellers of `low_multiwing_2060`. Regenerate/edit body-only images with stationary nacelles/hubs and separate rotating parts; import/slice and update ZIP. Merely moving metadata cannot fix frozen blades.

2. **Measure each actual hub/nozzle individually.** See table. `xy()` uses full-image normalized coordinates, so asset dimensions are the denominator, not opaque bounding boxes. The marked 1:1 source contact sheet is `aircraft_r1_anchors.png` (red p=propeller, e=engine, f=fan). Landmark measurements below are visual source-image picks with ±3 source-pixel uncertainty; they are sufficient to establish the large gaps, but are not a final anchor manifest.

| Asset / point | Image W×H | Metadata normalized | Current source x,y | Observed physical point x,y | Gap / implication |
|---|---|---|---|---|---|
| low_primary_1978 nose hub | 242×174 | .94,.59 | 227.5,102.7 | ≈225,84 | ≈19 px; at runtime width 98, ≈7.6 px too low |
| low_primary_2060 nose hub | 245×155 | .94,.59 | 230.3,91.5 | ≈230,108 | ≈16.5 px high |
| low_multiwing_1978 nose hub | 265×176 | .93,.52 | 246.5,91.5 | ≈246,91 | Approximately aligned; blade separation still needed |
| low_multiwing_2060 upper-rear hub | 269×188 | .51,.25 | 137.2,47 | ≈134,34 | ≈13 px low; other three points need final individual measurement |
| medium_passenger_1978 first hub | 271×134 | .51,.78 | 138.2,104.5 | ≈142,111 | ≈7.5 px; second hub ≈204,110 versus metadata195.1,93.8 (≈18 px) |
| medium_passenger_2015 visible fan | 261×133 | .52,.79 | 135.7,105.1 | ≈153,116 | ≈20 px; point sits near upper nacelle body instead of front opening |
| medium_cargo_1986 second hub | 253×132 | .72,.70 | 182.2,92.4 | ≈165,72 | ≈27 px; animated propeller appears on fuselage |
| medium_cargo_2060 fan | 252×138 | .52,.79 | 131,109 | No exposed circular fan at this location | Generic civilJet profile is incompatible with this blended silhouette; inspect actual engine exits before emitting FX |
| high_fighter_1978 rear nozzle | 233×141 | .05,.50 | 11.7,70.5 | ≈23,67 | ≈12 px left; plume starts off the physical nozzle |
| high_fighter_2060 rear nozzle | 279×181 | .05,.50 | 14,90.5 | ≈47,97 | ≈33.6 px, about12.6 px at runtime width105; emitter floats behind silhouette |
| high_experimental_1978 rear nozzle | 238×130 | .05,.50 | 11.9,65 | ≈15,72 | ≈8 px |
| high_experimental_2060 rear nozzle | 276×93 | .05,.50 | 13.8,46.5 | ≈15,46 | Approximately aligned |

3. **Audit navigation lights against real wing tips.** Every one of the 36 profiles currently repeats (.34,.8) red and (.38,.24) green despite different wings, dimensions and view. This blanket reuse is not evidence of correct attachment. Measure actual tip positions for each body, including near/far occlusion; do not claim anchor acceptance based on JSON point count.

4. **Remove halo and establish authoritative prepared art.** Current source vs packaged art differs. A source PNG may be kept as generation output, but prepared PNGs and their transformation provenance must be explicit. Inspect edge crops composited against both sky and dark space, then harden solid edges without erasing legitimate thin details. Do not count all semitransparency as erroneous; the measured soft-pixel counts below include anti-aliasing.

## ZIP versus generated sources

Inspected `outputs/rocket/dist/assets/aircraft/aircraft-sprites-36.zip`: 36 PNG entries; `zipfile.testzip()` returns None (CRC passes). All 36 entry dimensions equal their same-named `art/gen/*.png`; all 36 differ pixel-for-pixel. Thus the current ZIP is **not** the old larger aircraft sheet and **not** byte-identical source art; the same aircraft designs with prepared alpha are present. `live/aircraft.js` loads this ZIP at runtime, not legacy upload chunks. This audit does not prove the deployed HTML maps to the latest local ZIP.

| Image | gen opaque / soft nonzero | ZIP opaque / soft nonzero |
|---|---:|---:|
| low_primary_1978 | 0 / 20,433 | 17,890 / 2,528 |
| medium_passenger_2015 | 0 / 16,592 | 14,616 / 1,860 |
| high_fighter_2060 | 0 / 21,358 | 19,032 / 2,316 |

Counts computed from RGBA alpha: opaque=255, soft=1…254. PNG compression differences do not explain differing decoded pixels.

## Rules broken / scope limits

- Canonical style bible: code owns propeller motion; whole-body frozen blades plus moving overlays violate system separation.
- ref2game critics polish item5: every emitted effect must start at its actual emitter; copied anchor coordinates fail for measured silhouettes.
- Style bible alpha/edges: potentially visible soft fringe requires actual-background verification, not alpha count alone.
- Representative review covers both ends of several lineages and a problematic cargo intermediate, not every one of 36 hubs/nozzles. Full 36-profile acceptance still required after fixes.
- No slowed live footage or animation phase strip was available to this critic. Static-layer duplication is established from PNGs and draw order, but live timing, facing occlusion, and full-scene readability remain unscored.
- No game mechanics requested or proposed.
