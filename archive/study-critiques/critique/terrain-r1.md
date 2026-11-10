# Terrain polish critic — round1

Independent bounded terrain-only review of fresh `work/world/5-moon-80.png` and `5-mars-80.png`, compared with earlier `scenes_r1.md` and `scenes_r2.md`. No code or art edited. **Verdict: functional terrain assembly accepted; one medium visual join fix recommended before final polish acceptance.**

## Scores (1–10)

| Axis | Score | Reason |
|---|---:|---|
| Ground/landing consistency | 8 | Current implementation retains measured landingAnchor and world0 projection; this review did not independently rerun physics. |
| Horizontal alpha joins | 9 |24px source endcaps are omitted; no background-visible channels or conspicuous exterior vertical border columns remain in examined frames. |
| Subsurface material | 8 | Former broad flat lower band is now continuous painted interior rock. |
| Repetition / shelf joins | 6 | Fullwidth horizontal dark line remains at~screeny802; repeated depth strips are apparent. |
| Bounded terrain overall | 8 | Major grounding/coverage issues from earlier reviews remain resolved; visible join is cosmetic and locally fixable. |

## Top fix: remove the painted bottom end outline

**Where:** `live/world-sprites.js:terrain`, final full-height upper-strip `ctx.drawImage`. Current top image still includes the source bottom border, creating a nearly fullwidth dark line around screenshot y800–803. Depth material is already drawn behind it, so cropping this image need not expose sky.

**Measured source rows:** unweighted mean of RGB channels overx24…width−25, including source pixels regardless alpha:

| Source | Above outline | Dark outline | After outline |
|---|---|---|---|
| Moon729×174 | row166:26.1 | rows167/168/169:7.5/3.7/6.4 | row171:32.8 |
| Mars728×185 | row177:27.6 | rows178/179/180:15.7/13.5/15.9 | row182:35.7 |

This isolates the painted edge independently of the screenshots; the blackline is not a physical surface crack that should recur across the entire viewport.

**Exact candidate crop rectangles (Canvas source x,y,width,height):**

- Moon: `[24,0,681,166]`.
- Mars: `[24,0,680,177]`.

These omit the bottom8source rows. Keep existing top/landing alignment. Draw destination height as`(im.height-8)*f`; do **not** stretch this shorter crop back to`im.height*f`, which would shift texture features relative to the contact geometry. Existing depth rock behind the strip supplies coverage. The visible source cuts remove≈5.93Moon/5.93Mars screenshot pixels at the inspected1.5screen scale. A fresh screenshot must verify that the selected remaining lower rock edge meets depth material without a new dark ledge.

## Remaining repetition (known polish difference)

- Upper-surface craters/ridges repeat every interior source width: Moon681×360/729≈336.30logical px, Mars680×360/728≈336.26logical px, or≈504.4screenshot px in these1440px frames. This is repeated terrain artwork, not renewed transparent gaps.
- Depth crops repeat Moon43source rows / Mars46source rows, corresponding≈31.85/34.12screenshot px. Identical rock clusters form a tapestry below the shelf. It is visible when inspecting the lower section, but the foreground rocket/pad remain clear.
- Optional later improvement: vary interior crop origin/phase deterministically, while preserving material scale and ensuring overlap. No new mechanic or unrelated environmental generation is required for this finding.

## Crops / limits

`5-moon-80-terrain-r1.png` and `5-mars-80-terrain-r1.png` show native screenshot regionx0…1439,y735…899. Current two frames establish these joins only at the sampled camera; the lead reports30scene QA, which this critic has not rerun. No new claim about all camera extremes or collision mechanics is made.

Relevant ref2game critic rules: terrain/platforms require coherent seams; polish8 checks repeated tile artifacts; material continuation must remain grounded and read as one rendering family. Canonical style bible prioritizes intentional clusters and clear silhouette over repetitive decorative texture.
