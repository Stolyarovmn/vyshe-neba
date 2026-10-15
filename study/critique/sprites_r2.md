# World sprites — independent critique, round 2

Reviewed current164-entry manifest, `live/world-sprites.js`, current `work/world/contact-*.png`, latest `work/world/5-moon-80.png`, new `art/gen/parachute_eras_sheet.png` and prepared canopies on gray. No runtime/code edits. This is a design-code and attachment review, not a reference-fidelity claim.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Style/silhouette | 8 | New era canopy/pack designs share the established warm neutrals, red accents, dark outline and clear large masses. |
| Prepared alpha | 8 | Gray composites have clean silhouettes with retained hook holes; no confirmed matte fringe. |
| Proportions | 9 | Canopy, panels, items and asteroids now retain native aspect ratios. Coin flattening remains deliberate animation. |
| Attachment/grounding | 8 | Left panel connector now faces body, core/booster joint overlaps, terrain gaps sealed. Cord endpoints stay within1 logical pixel of occupied canopy art. |
| Era evolution | 8 | Six canopy and six pack designs visibly progress from simple fabric/straps to segmented modern panels without changing nature by era. |
| Motion | 7 | Physical subparts remain separate and cords follow canopy rotation. Complete-cycle and transition acceptance remains limited by supplied QA evidence. |
| Overall | 8 | Previously identified visible integration blockers are corrected. Residual issues below are polish/verification limits. |

## Ranked residual issues

1. **Full motion-cycle proof remains incomplete.** WHAT: deterministic QA scene, report and animation contact strips. WHY: `work/ref2game-qa/report.json` currently has `fails:[]`, attachment on1.931/off0, but `cycles:{}` and six UI warnings. Four contact samples end at0.84s while solar array oscillation has period2π/.65≈9.67s. CHANGE: sample at least one full9.67s cycle and stage transitions if claiming complete animation acceptance. This does not invalidate the visible geometry fixes; it limits claims about seamless cycles and state transitions.

2. **Per-body solar hinges are still approximate.** WHAT: `manifest.sprites[satellite_*].panelJoints` and `hazard('satellite')`. WHY: a mirrored left panel now has correct connector orientation. All bodies still use common `[.08,.5]` / `[.92,.5]` joints and vertical coordinate scaled by40, while drawn body height is now natural-aspect `38*H/W` (e.g.44.16 for1978). At y=.5 that formula difference is zero, but the generic midline is not an independently measured mechanical hinge for six differing bodies. CHANGE: record true physical hinge/connector points if further refining; retain current arrangement if accepting its slight approximate placement at gameplay scale. No new obvious floating panel appears in the current contact strip.

3. **Ground fill changes to a flat lower band.** WHAT: latest Moon scene, approximately y802..899. WHY: seamless strips now cover the formerly open8–10px gaps, but beneath the rocky side texture there is a broad uniform fill. CHANGE: extend/repeat the lower material if this band can be reached during ordinary play; otherwise keep as a known camera-edge limitation. Current scene is much better than exposed sky seams. New landing pads retain flat clear decks.

## Verified round-1 fixes

- Aspect: canopy1978 now80×60.952px from252×192 source; canopy2060 now80×61.634px from257×198. Uniform scale exactly preserves h/w. Panel and item calls now derive the second dimension from source metadata or omit explicit height. Rock does likewise.
- Left solar array: `ctx.scale(side,1)` now mirrors the left array so its thin physical connector faces inward. It rotates about the shared root transform, not an arbitrary independent centre.
- Stage join: core bottom moved from-35 to-32 relative to the booster coordinate, increasing overlap3 logical pixels. Contact sheet no longer shows the former obvious detached seam.
- Debris: `o.debris` uses only the named booster/capsule/core body, bypassing powered full assembly; physical fragments are texture crops from the body art rather than featureless programmer rectangles. Core debris deliberately clips away the retained nose; transition continuity still needs its normal game test.
- Terrain: strip draw width360 vs step340 creates20 world-unit overlap; solid underfill prevents seeing sky below. Current Moon assembled screenshot has no former vertical void columns.
- Era parachutes: canopies1978/1986/1998/2015/2035/2060 and packs of the same years are selected through `id(name,era)`.
- Cord math uses canopy angle for its endpoint, keeping attachment together through sway. With runtime80px canopy width, nearest alpha>=200 material distance at the two endpoints is0.94/0.60px (1978),0.87/0.28 (1986),0.74/0.15 (1998),0.29/0.22 (2015),0.53/0.30 (2035),0.11/0.11 (2060). All within1 logical pixel; rotation preserves those distances. These endpoints land near outer hooks rather than exactly through their hole centres, a minor approximation.

Evidence: `sprites_r2/canopies_gray.png`, `sprites_r2/measurements.json`. Measurements are from prepared runtime PNGs, not the raw generator backdrop. Raw source sheet has colored low-alpha surroundings in transparent preview; correct prepared gray composites do not show them as a baked glow. No new generation requested.

## Rule status and limitations

- Round1 nonuniform proportion and terrain assembly failures: corrected.
- Round1 left panel connector orientation: corrected.
- Style bible physical object/effect separation: preserved in inspected canopy, panels, corps and fragments. Flames, drift, cords and lights remain code systems.
- ref2game final motion/game gate: not fully established by this asset review; use the lead's complete live interaction tests and full-cycle evidence before reporting all animations verified.
- HUD text remains outside this review; QA explicitly warns no UI records.

Verdict: **ACCEPT assets and visible integration fixes**, with the above motion-proof and lower-band limitations. No remaining regeneration blocker in this reviewed batch.
