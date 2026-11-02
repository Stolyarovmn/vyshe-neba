# B03 — Landing Guidance (`landing_guidance`)

Required workflow: `ref2game` + `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

Generate **one beacon per call**. The purchased gameplay object places a symmetric pair in code; do not bake both beacons into one sprite.

Physical parts: `base` static; `head` physically aims; `lamp` is a state part. Guidance corridor, predicted touchdown point, laser beam/light cone, HUD and safe/unsafe overlays are code-owned and must not be baked into the source PNG.

The generation is isolated with a complete uncropped silhouette and no people, text, labels, logos, scenery or UI. Source-alpha transport is controlled by the current preflight receipt; `art/style_bible.txt` is appended verbatim to each generation request.

## Source alpha transport — receipt controlled

The default source mode is native transparent alpha. When the current preflight declares `generation_gate.alpha_strategy = opaque_chroma_key`, use the keyed raw-source path defined by `art/docs/SOURCE_ALPHA_TRANSPORT.md` instead:

- render the **entire canvas fully opaque** on one exact flat solid key color from the receipt; for the current E0 recovery pass it is **pure `#FF00FF`**;
- native transparency must be OFF for that call;
- background must be perfectly uniform to every canvas edge: no gradient, vignette, checkerboard, floor, scenery, cast shadow, glow, bloom, light cone, color spill or global light field;
- the physical object must not use the key color;
- lamp is physically **OFF** in the E0 source: show the lens/material but no emissive appearance;
- raw PNG is archived untouched and SHA-256 recorded before key removal;
- deterministic key removal happens only at `source_prepare`; it may not repair projection, geometry, missing parts or baked FX.

Reject the raw source before keying if the key background is non-uniform, if an aura/halo exists around the object, or if any normal source/projection/era gate fails.

## Silhouette / proportion contract

This is a **tall, narrow landing beacon**, not a surveillance camera, cannon, telescope or squat turret.

- Runtime footprint for one beacon is `46×82 LP`; design the source around a portrait silhouette close to that proportion.
- After production processing, the visible body should target roughly `38–42 LP` wide and `70–76 LP` high while remaining inside the canonical canvas.
- The vertical mast/yoke must carry a substantial part of the height. Keep a clearly readable base → mast/yoke → aiming head → lamp hierarchy.
- The aiming head may project sideways, but it must not dominate the silhouette or become wider than the functional ground stance.
- Do not solve the design as a large horizontal camera body on short legs.
- Preserve enough padding for the head to pan/tilt without clipping.

## E0 source gate — required structural read

For **E0 / 1978**, the aiming assembly must read as a small hand-serviceable optical sight carried inside or directly by an open mechanical yoke, not as an enclosed camera body.

- Keep the optical element compact: a small sight/lens/aperture and simple mechanical housing, visibly subordinate to the mast/yoke.
- Do not use a long rectangular box, long cylindrical barrel, surveillance-camera housing, cannon-like tube or telescope-like body.
- Keep the mast/yoke visually responsible for most of the beacon height; the head is a compact mechanism attached to it, not the main mass.
- Keep the physical signal lamp clearly separate from the aiming head. The lamp must read OFF in the E0 source; illumination/glow is code-owned.
- Avoid decorative loose cabling unless it is mechanically necessary to connect visible parts.

## Ground projection lock — mandatory

For ground projection, match the **exact approved island reference** rather than a generic isometric object. Camera family is `island_top_3_4`.

The actual original 3D camera angle remains `UNKNOWN`; **47° is unsupported and must not be used**.

Use the measured SHA-bound island proxy as generation control:

- elevation above the ground plane: **`73.44°`**;
- tilt from straight top-down: **`16.56°`**;
- projected ground-circle compression: **`0.958515`**.

These numbers are a generation proxy, not a recovered camera fact. The exact approved island appearance has priority if the numeric proxy and visual reference appear to disagree.

The source must visibly read as `island_top_3_4`: show clearly readable upper planes on tripod/base hardware, yoke/head, lamp cap, mounting plates and feet; vertical/front faces must be visually subordinate to the top-down 3/4 read. Depth on the ground plane must look compressed rather than like a conventional low isometric/front 3/4 product view.

**Reject at source gate** if the object reads predominantly frontal, side-on or low-angle, even if the request contained the proxy values. A visually lower camera is a source defect and must be regenerated; it must not be delegated to key removal, Pixel Snapper, normalize or Aseprite.

Era lineage:

- **E0 / 1978:** portable tripod, manual optical sight/aiming head, separate physical signal lamp.
- **E1 / 1986:** sectional radio beacon / heavier industrial aiming head; retain physical axis and lamp.
- **E2 / 1998:** motorized tracker with optical/radio head and protected state lamp.
- **E3 / 2015:** laser-optical tracker with compact multi-optic head on real pan/tilt drive; no baked beam.
- **E4 / 2035:** autonomous compact tracker, enclosed servos, multi-sensor head, physical lamp.
- **E5 / 2060:** lightweight integrated directional multispectral beacon; precise physical two-axis head, no hologram.

E1–E5 evolve from the previous approved era, preserving ground footprint, portrait proportion and recognizable pan/tilt geometry.

If imagegen inherits an unrelated subject from prior context, first create a code-drawn structural reference containing only `tripod/base → mast/yoke → aiming head → lamp`, then edit that reference into the requested era. Structural references are control aids, never runtime art.

Runtime target for one beacon:

- footprint: `46×82 LP`
- registration target: `(23,78)` bottom-center design target
- palette baseline: <=32 colors
- SpriteFusion Pixel Snapper: official `Hugo-Dz/spritefusion-pixel-snapper`, revision `ae20461f60fb39e75d15f184bab1ebec1219511c`
- candidate family baseline: `--pixel-size 12`, subject to gameplay-size QA; any production adjustment must be one family-wide value, never per-era scaling
- Aseprite: official `aseprite/aseprite` `1.3.18.6`, indexed, no dithering
