# Assembled base / motion — independent critic round2

Reviewed native960×600 base renders across six eras and nine phase samples, including magnified emitter/drone strips. Examined `qa-base.cjs`, its report, `WorldArt` light/drone projection and `WorldSprites.baseDrone`. No runtime code or artwork changed. Critique evidence is in `study/critique/base-r2/`.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Preserved architecture / era identity |9| Towers, crane, radar, solar roof and2060 glasshouse match the accepted static sheet and retain original era progression. |
| Lamp emitter alignment |9| Hanging lamp crop centres glow on the existing bulb housing; no gross visible offset; projection QA covers mirrored bands and zooms. |
| Beacon pulse / mounting |8| Red pulses originate at the authored mast endpoints, with on/off phases visible across the1.32s strip. |
| Decorative drone scale / silhouette |8| Small20–30px bodies read as background flying machines; no opaque haze in assembled frames. Fine details naturally collapse at this scale. |
| Drone articulation |8| Fan blades move independently of the fixed body; separate code geometry is present at measured wells. |
| Overall assembled subject |9| ACCEPT for this bounded subject; no new blocker found. |

## Measurements / checks

- `work/base/report.json`:96 lamp projection observations; maximum formula-to-render radial-gradient centre error0; base size1774×887; code motion true. The underlying test spans six eras, camera central/mirrored band, and zoom.55/1/1.8. This confirms transform implementation agreement, not automatic recognition of the correct physical housing; the native crop review supplies the latter limited visual check.
- The54 base PNGs cover six eras × nine times `phase*1.32/8`, i.e.0,.165,.330,.495,.660,.825,.990,1.155,1.320s. The beacon implementation has a1.32s period, .18s on-window, and .19s phase stagger per indexed beacon. Native strip `era3-cycle.png` visibly shows the upper mast lit at beginning and end with dark intermediate states; a different lower mast lights in a staggered sample. This is a full beacon period, not a claim of a mathematically looping whole scene: lamps and drone bob use different rates.
- Hanging1978 lamp crop `era0-cycle.png` keeps its centre in the physical lamp around source(197,220); its illumination varies while the housing remains static. Warm halos now come from the code rather than the static sheet.
- Independent browser measurement held drone centre/width fixed, invoked `WorldSprites.baseDrone` directly, and compared RGBA outputs across those nine times. At t0→.165, body0(width26) changed12 channels and body1(width30) changed21 channels. Because centre/body sprite are fixed in this test, those first-interval differences demonstrate independent fan motion rather than whole-body bob alone. Full raw results are `fan-motion.json`; channel counts are not pixel counts or a quality score.
- Three-bladed fan code rotates at37rad/s, with per-fan phase offsets; its pattern repeats faster than the .165s strip sampling. Thus the native scene strip is a sparse demonstration, not a high-framerate motion video. No frozen-fan claim is supported by this sampling; fixed-body measurements and source geometry establish animation.
- Two drone bodies retain measured fan-well positions from `art/base-drones.json`. Native effective fan radii are roughly1–2px at20–30px body width, so blade movement is subtle. That is consistent with noninteractive distant props. Enlarging them merely to show the rig would alter intended depth/scale.
- Runtime `game.js` loads `base-static.png`, not the original `base-eras.png`. Generated-source SHA256 is `2c3fae4d551fc898aad23527b037d2706a0360184bdd225d31c928a85742f6e5`; prepared PNG SHA256 is `b5a01ee653b1468a34afe0032fe7dbcded362664679f4d2167fbfacbf6a48d25`. Hashes differ due to file encoding/metadata, but independent decoded RGBA comparison finds **0 changed channels**, both887×1774×4. This establishes runtime artwork pixel identity with the accepted static source.

## Scope and remaining differences

The previous base-specific legacy blocker is resolved for this active base layer: frozen cloud wisps, broad lamp/beacon auras and original static hovering drones are replaced by the accepted static sheet and code lights/decorative fan rigs. Keeping the old original file as an archival source is not itself a runtime defect.

Static environmental sunrise/reflection, shaded buildings, warm windows and cyan physical material faces remain in the background. This is not a claim that every lighting cue across all legacy game screens has been converted to a dynamic renderer. It confirms the requested base-layer separation, not interior/workshop or every possible screen. New drone bodies are visually related replacements, not exact original silhouettes.

Minor:20px drones look like small mechanical flecks at native scale and their fans cannot be individually counted without magnification; this is acceptable for distant decoration. Authored beacon placement must continue to be labelled authored on observed hardware, as in the anchor metadata; it is not evidence of original beacon-lens identity.

## Verdict

**ACCEPT base runtime separation and decorative motion.** No further source-art or code fix requested by this critic for this subject. Preserve the native strips and automated report as evidence; keep broader task acceptance tied to the lead's complete build/gameplay checks rather than treating this subject review as proof of every game system.
