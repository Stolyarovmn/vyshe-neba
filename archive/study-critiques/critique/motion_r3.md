# Secondary motion — independent final bounded review, round 3

Reviewed `outputs/rocket/qa-world-motion.cjs`, `work/motion/report.json`, all saved-frame filenames and visual strips made from frames00,04,08,12,16. No code edits. Evidence sheets: `motion_r3/satellite_extremes.png`, `parachute_extremes.png`, `flame_extremes.png`. Native screenshot crops preserve rendered scale. This is a bounded asset/secondary-motion review, not a full-game completion certificate.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Articulation and part separation | 8 | Arrays rotate separately, canopy sways while capsule stays fixed, cords follow canopy endpoints, flame changes independently of physical body. |
| Attachment continuity | 8 | No conspicuous hinge break at inspected array extremes; cord math rotates endpoints with canopy and previous measured attachment error remains below1 logical pixel. |
| Timing and loops | 8 | Full-period samples now cover each primary oscillator; array pose returns exactly in independently compared panel crops. Flame has multiple frequencies, so its nominal test interval is not a complete composite loop. |
| Readability/style | 8 | Materials remain still; motion is localized to appropriate physical parts and effects. No newly observed baked trails or glow in this batch. |
| Overall secondary motion | 8 | Accept the reviewed secondary systems with the explicit limitations below. |

## What the new evidence establishes

- Report contains18 rows: six eras × satellite/parachute/flame. Each row has17 samples and positive successive image-difference minima. Satellite period9.666438934s, canopy period2.327105669s and main flame-length period0.146120589s are calculated from2π divided by their frequencies in code. Report and script agree.
- For era1998, independent image comparison of both panel-only crops at saved frame00 and16 found **zero changed pixels**. These saved frames are separated by one full satellite oscillation. This verifies panel-pose return in that example, excluding the independently blinking centre light.
- Visual extrema strip shows arrays flattening/tilting smoothly relative to the stable satellite body, retaining inward-facing connectors. Generic body hinge metadata still limits anatomical/mechanical precision; no additional separated array is visible in these inspected examples.
- Capsule remains fixed while canopy and ropes shift in the saved strip. Cords terminate near physical edge hooks; they follow canopy rotation in the current endpoint transform rather than remaining frozen in screen space.
- Flame strip shows changing axial length/taper and lateral shape with its start aligned to the booster nozzle. Code renders physical booster once, then dynamic flame layers; static body textures do not contain the moving exhaust.
- This supersedes round2's specific concern that the supplied evidence covered only0.84s. The new numeric per-system test covers each chosen primary period across all six eras.

## Residual limits and concrete next checks

1. **Do not call every effect a verified closed loop.** `qa-world-motion.cjs` tests positive differences between successive samples; it does not assert frame0 equals frame16. Flame length uses sin43t, but edge variation uses sin61t, so0.146120589s is only the length oscillator's period. Satellite light blink has its own cadence. Those independent phases are acceptable for procedural effects and help avoid repetitive appearance, but the numeric pass proves changing frames, not a complete composite seam. If a seamless composite loop is required, sample/compare the actual common period or test continuous behaviour at wrap/reset explicitly.

2. **Physical satellite hinge positions remain generic.** Six bodies share normalized midpoint joints rather than individually measured hardware landmarks. Mirroring and root rotation are corrected, but current evidence cannot establish pixel-exact mechanical attachment. Keep this as a known approximation or add true per-era hinge/connector metadata; do not claim measured hinges.

3. **These screenshots are isolated assembled rigs, not all gameplay transitions.** No damage/death, parachute deployment timing, separation-transition continuity, collisions, audio or camera path is established by this motion script. Use existing live game QA for those and report its results separately. Saved combined strips use the satellite period as their common sampling interval; the script's dedicated numeric loops use each system's own period.

4. **Legacy Earth environment effects remain outside this review.** Existing raster Earth background may contain fixed lights/atmospheric effects. The new asset batch's inspected materials do not establish that the entire game is free of baked effects. Audit existing source imagery before declaring the user's effect-separation requirement complete.

## Rule status

- ref2game separately articulated systems, full primary-cycle coverage and visible motion: satisfied for reviewed rigs within scope.
- ref2game exact joint/anatomical landmark measurement: partial, generic satellite hinges remain.
- Style bible code-owned dynamic effects: observed in reviewed flame, canopy cords and array motion; global legacy art not audited.
- Final game/interaction gate: outside this critic's evidence.

Verdict: **ACCEPT reviewed secondary motion**, retaining the stated approximation and global-audit limitations. No further critic round is requested for this bounded subject; do not translate this acceptance into “all sprites and animations complete.”
