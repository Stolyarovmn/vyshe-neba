# Independent assembled-scene critic — round 2

Reviewed the regenerated `work/world/5-moon-80.png`, `5-mars-80.png`, and current `outputs/rocket/dist/{world-art,game}.js` plus world manifest. No project code changed by this critic. Comparison uses the same 1440×900 viewport as round1. No external reference frame is available, so these are design-contract and assembly scores, not reference-fidelity scores.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Gameplay readability | 8 | Rocket, ring and resources remain identifiable on both local skies. |
| Grounding / collision agreement | 8 | Central 2060 deck contacts agree exactly with world0; representative terrain lip is within2 world units of it. |
| Terrain assembly | 7 | Transparent channels are closed; edge texture still creates a repeating join and substrate ends in a flat fill. |
| Location / era selection | 8 | Mars Earth-waypoint regression is fixed; the reviewed 2060 artwork matches the existing era selection path. |
| Sprite style coherence | 8 | Local-scene materials and contours are consistent at play scale. |
| HUD assembly | 7 | Same limitations as round1: only the supplied viewport and strings checked. |
| Overall assembled frame | 8 | Round1 material grounding and location defects are resolved; residual terrain repetition is a polish issue. |

## Verification of requested fixes

1. **Measured landing anchors — PASS.** `world-art.js` projects terrain at world0 and uses manifest `landingAnchor`; both2060 pads also use their measured landingAnchor. Recomputed alpha>128 central-deck row vs manifest: Moon top14/132, Mars15/134. At width170 their contact errors are **0.00 logical px**. Terrain median first-opaque row gives Moon **−1.9753**, Mars **−1.9780 logical px**, compared with round1 **+41.72 / +46.62**. At screenshot scale1.5 these become roughly−2.96/−2.97px, within the visible roughness of the terrain lip. Terrain decorative peaks extend above the flat physics surface; they should remain scenery rather than implied colliders.
2. **Terrain alpha-margin overlap — PASS for open channels.** Draw width360 and stride340 supply20 logical pixels of overlap, comfortably exceeding the ≈4px gap from the padding. The previous background-visible vertical channels are absent from both inspected images. Dark join/texture repetition remains near screenshot x280,790,1300: it is now a material edge rather than an open hole.
3. **Pad width — PASS.** Draw width170 matches the physics pad region abs(x)<85 (up to strict-boundary convention).
4. **Mars waypoint suppression — PASS.** `drawRoute` returns on mode2 and4; the regenerated Mars screenshot no longer shows “Над облаками” or its3.0km route line.

New magnified crops: `scenes_r1/5-moon-80-r2.png`, `scenes_r1/5-mars-80-r2.png`.

## Remaining polish and acceptance limits

- **Medium visual polish:** the texture band ends around screenshot y802 in both scenes, followed by a broad flat substrate fill. This reads as a thin illustrated shelf above a plain rectangle when the camera shows the subsurface. Extend existing terrain texture downward or crop the camera before that band becomes prominent. It does not reintroduce contact mismatch.
- **Minor:** repeat join shading and the same distinctive mound recur approximately every510 screenshot px (340 world units ×1.5). Blend/mirror varied existing tiles or introduce a prepared alternate, without changing the flat collision plane.
- **Known stylization:** a flat world0 physics plane cannot precisely match every rock protrusion on a rough drawn lip. Median error is now under2 world units; no claim of pixel-perfect collision for every pebble is appropriate.
- **Unchanged acceptance scope:** this review does not validate runtime animation, all six era assets, zoom/camera extremes, interactive landings, or the legacy Earth backdrop FX noted in round1. Those require their own evidence; they are not newly discovered defects in the two local scenes.

## Blockers

**No remaining blocker in the four requested fixes for these inspected scenes.** Keep global task completion gated on the separate full QA/motion checks and unresolved legacy FX decision, not this limited two-frame acceptance alone.
