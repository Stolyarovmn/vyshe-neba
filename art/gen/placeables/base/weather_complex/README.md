# B01 — Метеокомплекс (`weather_complex`)

High-quality E0–E5 originals generated under `ref2game`, archived in Google Drive and lineage-reviewed. Runtime PNGs are intentionally **not marked ready yet**: they must still pass official SpriteFusion Pixel Snapper, common-scale normalization to `96×122 LP`, Aseprite indexed/no-dither export and QA.

## Lineage

| era | year | stage |
|---|---:|---|
| E0 | 1978 | welded base, tubular mast, cup anemometer, vane, analog indicator |
| E1 | 1986 | industrial mast + compact mechanical weather radar |
| E2 | 1998 | motorized radar dish + CRT electronics |
| E3 | 2015 | modular digital weather station |
| E4 | 2035 | lidar/optical atmospheric head |
| E5 | 2060 | integrated multispectral atmospheric node |

The family is intentionally not monotonic in bulk: E2 is the heavy radar/CRT era; E3–E4 become physically cleaner and more compact. Runtime normalization must use a common world scale and bottom-center registration rather than stretching every era to fill the canvas independently.

## Runtime target

- footprint/canvas target: `96×122 LP`
- placement registration target: `(48,118)` bottom-center
- sockets: `roof | yard`
- parts: `body` static; `sensor` rotary; `vane` wind-reactive; `indicator` state
- gameplay: expose two pre-generated weather windows for the next launch; one switch to the second window, no infinite reroll

## Source archive

Canonical full-resolution originals and the lineage QA contact sheet live under Google Drive:

`vyshe-neba/art-originals/base/B01_weather_complex/`

Exact generation IDs, SHA-256 values, Drive IDs/URLs and rejected candidates are recorded in:

`art/raw/placeables/base/weather_complex/sources.json`

## Next production pass

1. Pixel Snapper candidate at family baseline `pixel-size 10`, <=32 colors.
2. Normalize all eras with one common scale to `96×122` and registration `(48,118)`.
3. Aseprite indexed/no-dither export.
4. Gameplay-size visual QA and era contact sheet.
5. Isolate `sensor`/`vane` parts from approved processed anchors.
6. Measure real pivots, reconstruct rest pose, then wire wind/scan motion in code.
