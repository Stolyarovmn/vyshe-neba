# B03 — Система посадочного наведения (`landing_guidance`)

High-quality E0–E5 originals for **one** beacon are generated under `ref2game`, archived on Google Drive and lineage-reviewed. Gameplay purchases place a symmetric pair; symmetry is code/layout, not baked into the source sprite.

Runtime art is not marked ready until official SpriteFusion Pixel Snapper, common-scale normalization to `46×82 LP`, Aseprite indexed/no-dither export and QA are complete.

## Lineage

| era | year | stage |
|---|---:|---|
| E0 | 1978 | tripod + optical sight + physical lamp |
| E1 | 1986 | sectional radio beacon |
| E2 | 1998 | motorized optical/radio tracker |
| E3 | 2015 | laser-optical multi-sensor tracker |
| E4 | 2035 | autonomous compact tracker |
| E5 | 2060 | integrated directional multispectral beacon |

## Runtime target

- one-beacon footprint: `46×82 LP`
- registration target: `(23,78)` bottom-center
- sockets: `pad_left | pad_right`
- parts: `base` static; `head` aiming; `lamp` state
- mechanic: touchdown prediction / safe corridor / approach state only; never steers the rocket

The head must track around measured physical pivots. Predicted touchdown marker, corridor, optical/laser beam, lamp glow and HUD are code-owned.

## Source archive

Canonical full-resolution originals and the lineage QA contact sheet live under:

`vyshe-neba/art-originals/base/B03_landing_guidance/`

Exact generation IDs, SHA-256 values and Drive IDs/URLs are in:

`art/raw/placeables/base/landing_guidance/sources.json`

## Next production pass

1. Pixel Snapper candidate at baseline `pixel-size 12`, <=32 colors.
2. Normalize all eras at one common world scale to `46×82` with registration `(23,78)`.
3. Aseprite indexed/no-dither export.
4. Gameplay-size lineage QA.
5. Isolate `head` and lamp/base geometry from approved processed anchors.
6. Measure actual yoke/azimuth pivots; reconstruct rest pose.
7. Wire tracking and state response in code; render motion sheet and QA it frame by frame.
