# Satellite attachment module — runtime acceptance, round 1

Independent bounded review of the wired satellite module. Inputs: `live/world-sprites.js`, `tools/build-world-manifest.py`, `art/satellite-joints.json`, generated runtime manifest, `work/motion/frame-00.png` through16 and `work/motion/report.json`. No runtime or artwork edits.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Physical connection readability | 9 | Both arrays now meet visible body material across all six eras; no floating connector gap visible at inspected extreme phases. |
| Pivot/part continuity | 9 | Root connector is the pivot, mirrored on the left; body stays fixed while arrays rotate. |
| Scale and silhouette | 8 | Natural aspect ratios preserved and narrow connectors remain legible; legacy small details still compress heavily at gameplay scale. |
| Evidence and metadata integrity | 9 | Per-era authored coordinates replace generic points; original source SHA256 assertions protect against stale landmark data. |
| Overall module | 9 | Accept the bounded runtime attachment solution; no regeneration or concrete gap fix is required. |

## Runtime evidence

- Contact grid: `satellite-r1/native_connections.png`, same grid magnified3× with nearest-neighbour sampling: `satellite-r1/connections_3x.png`. Each of six era rows shows frames00,04,08,12,16. Source screenshots are1440×900 presentation of a720×460 canvas; native sheet maps back to that canvas before crop. It is an inspection aid, not a pixel-art resampling change in the game.
- Inspected positive extreme(frame04), negative extreme(frame12), baseline frames00/08/16. All twelve body/array connections remain visually solid at both extremes in this grid. Connector material is visible immediately outside the body silhouette, while its tip overlaps the body instead of ending in empty space.
- Independently compared left and right panel-dominated regions at frame00 and16 for **all six eras**: each of twelve regions has **0 changed pixels** after one primary solar period. Results: `satellite-r1/return-measurements.json`. This verifies pose return for the examined panel regions; separate navigation-light cadence is excluded by those crops.
- `work/motion/report.json` contains six satellite entries with17 samples each, period9.66643893412244s, all successive deltas positive. Thus the intermediate arrays move and the reviewed start/end pose returns. Image-difference energy alone is not a hardware-landmark measurement; the visual extremes review supplies the complementary attachment check.
- Runtime uses actual body height `38*z*height/width`, per-era body points and explicit panel-root anchors. This removes the old mismatch between hardcoded40px height and the differing source body proportions.

## Classification and uncertainty

These are **authored sidewall attachment points**, not observed pre-existing painted solar hinges. `art/satellite-joints.json` deliberately retains `bodyJoints:null`; runtime metadata labels the applied rig as `authored sidewall overlap; not observed painted hinges`. No hidden mechanical structure is claimed.

Measurement artifact values: authored overlap with reviewed visible sidewall1.198–1.831 logical game px; all authored roots lie on alpha255 body material; nearest prepared panel-root material distance0–0.0655 game px. These geometric values explain the solid joins seen after wiring. Body source-pixel placement uncertainty is4px; connector-root uncertainty3px. Depending on era scale these correspond to roughly0.61–0.92 and0.49–0.84 logical game px respectively. They describe landmark/authoring precision, not observed runtime gaps. The chosen overlap absorbs those small raster/placement uncertainties in the reviewed poses.

## Ranked residuals

1. **No attachment blocker remains in this bounded module.** Preserve the source hash guard when artwork is replaced; remeasure or explicitly re-author attachment coordinates rather than silently normalizing unrelated imagery.
2. **Native scale details are busy in late eras.** This is inherited material design, not a new connector defect. Do not regenerate or simplify merely to alter a passed physical connection; judge alongside full gameplay art if further polish is requested.
3. **Global completion remains separate.** This acceptance does not audit legacy Earth raster lights/effects, all environment sources, collision behaviour or stage transitions. Existing static antenna appendages are retained physical art; this module adds no mechanic.

## Rules checked

- Style bible physical objects vs code-owned motion: pass within inspected module.
- Complete silhouette and natural aspect: pass within inspected module.
- ref2game attachment continuity through extremes: pass for the inspected six-era runtime poses.
- Provenance honesty: pass; authored rig locations are explicitly distinguished from measured hardware.

Verdict: **ACCEPT satellite attachment module** at current gameplay scale. No further critic round or regeneration is requested for this subject.
