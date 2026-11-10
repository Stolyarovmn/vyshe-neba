# Earth effects — independent critic round2

Read-only review of regenerated `work/world/5-earth-1300.png`, `3-earth-6400.png`, `work/atmosphere/earth-{1300-0,3200-10,6400-0}.png`, current renderer and `work/atmosphere/report.json`. Original sky-route remains the reference for composition; no claim of exact visual fidelity is justified.

## Scores

| Axis | /10 | Reason |
|---|---:|---|
| Foreground readability |9| Plain sky gives strong rocket/resource separation. |
| Effects separation: sky |9| Active routeSky uses clean colour plate; stars/cloud transforms belong to code. |
| Original cloud/edge composition |6| Highcirrus frames the sides, but low sky is markedly emptier; repeated cloud shapes replace old varied arcs/banks. |
| Star visibility and motion |8| Correct post-atlas pass, visible lower-frame stars in6400 scene; QA reports858 changed colour channels between times. |
| Meteor rendering |4| Newly active trail is a straight gold line and square head; simple programmer-effect appearance. |
| Overall Earth sky |7| Functional and readable, visibly simplified compared with original. |

## Confirmed fixes

- `WorldArt` now calls stars after drawing opaque atlas and before physical Moon image. The prior occlusion defect is resolved. Its Earth eligibility threshold remains worldY6200; therefore points at6200–6400 can now be visible where the atlas formerly covered them. This range conclusion is supported by source draw order/threshold and visible star dots through the lower part of the6400 frame, not a separate6200 camera capture.
- `environment()` actually calls `atmosphericEffects()`. Code clouds are no longer an orphaned function. Low clouds use clock-dependent x drift; highcirrus uses separate slower drift and an altitude envelope. QA report records low8/cirrus12 cloud draw calls, space0/Moon0, and `moved:87.61380780411935`. That moved metric is the QA script's aggregate, not proof that every cloud travelled87px; do not relabel its unit without inspecting the script.
- `sky-color-plate.png` is724×2172 and replaces the stars/clouds plate without changing atlas dimensions. No residual star crosses or source cloud masses are visible in the reviewed sky scenes.

## Remaining differences and concrete changes

### 1. Low sky is much emptier — visible composition regression, not a gameplay blocker

In1300 screenshot only one main cloud at x≈900–1120,y≈145–295 and a cropped bank in the lower-right survive; the original source carried continuous edge-heavy banks and wisps. The central quiet region is preserved but edge hierarchy is weakened.

Measured using both source plates resampled to724×2172,140-row bands centred at source row corresponding to each world height, RGB absolute residual from a Gaussian-blur(radius5):

| World height | Original texture MAD | New plate MAD | Original mean RGB | New mean RGB |
|---|---:|---:|---|---|
|1300|6.965|0.471|79.3,182.7,247.7|25.1,170.6,253.5|
|3200|6.283|0.542|11.2,59.4,151.4|0.5,58.0,170.2|
|6300|3.051|0.396|2.6,13.1,39.5|0.6,10.1,35.4|

These measure the underlying plates, excluding the new runtime clouds. The reduction is expected from removing baked objects, but confirms that the plate itself does not preserve the old visual density. Readability improves; reference fidelity does not.

Smallest remedy: compose existing cloud masters into softer edge banks using code-controlled position/opacity. Avoid adding central obstruction. At1300, left edge needs some counterweight to the right-only dominant bank. No new raster generation is necessary unless the available silhouettes cannot provide varied wisps.

### 2. Highcirrus forms obvious repeated side stamps — medium polish

At3200 the same cloud silhouette repeats left/right and every320world units (~480 screenshotpx at zoom1). Both sides share the same source index3. Vary source cloud index, width, alpha and phase deterministically; retain quiet central corridor. Current side x anchor includes cam.x so these layers track screen edges horizontally; that is acceptable framing, but not evidence of world parallax depth.

### 3. Newly visible meteor primitive — medium polish

`game.js:atmosphericEffects` renders a uniform line length36logicalpx with square4px head. At6400 screenshot the example around x503,y648 has a straight≈54px trail and≈6px square head. This fails the explicit critic checklist against flat primitive effects. Replace with a tapered, segmented streak whose tail alpha/width change with age, and a layered small hot core; keep its existing motion and spawn timing. No new mechanics or raster are required.

## Separate legacy work — NOT fixed this pass

The original base sheet still contains lamp halos/pools, antenna beacon halos and2060 drone/pod glows. The cloud/sky replacement does not affect those pixels. Baked sunset wisps remain in base artwork too. Those are preserved legacy differences, and the claim “all effects are code systems” remains false globally until they are separated or explicitly marked unfinished. Nothing in this report approves those as resolved.

## Acceptance

**Accept the functional sky-layer fix:** baked sky stars removed, occlusion corrected, code cloud/meteor pass connected, code animation evidence present. **Do not claim exact original composition or polished final FX.** Remaining medium polish is low-cloud balance, repeatedcirrus, and primitive meteor shape. Separate base lighting/drone legacy work remains open. No project code or art was edited by this critic.
