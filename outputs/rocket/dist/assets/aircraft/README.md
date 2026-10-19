# Aircraft sprite pack

Runtime aircraft art is stored as a packed atlas plus a crop manifest.

- `aircraft-atlas.png` — 36 normalized runtime sprites in a 6×6 atlas.
- `aircraft-atlas.json` — sprite ids, lineages, era years, atlas rectangles, cell rectangles and anchors.
- `aircraft-sprites-36.zip` — the same 36 sprites as separate transparent PNG files for editing/reuse.

Canonical ordering:

- columns: `1978`, `1986`, `1998`, `2015`, `2035`, `2060`
- rows: `low_primary`, `low_multiwing`, `medium_passenger`, `medium_cargo`, `high_fighter`, `high_experimental`

The era years are gameplay technology tiers, not claims of strict historical accuracy. Sprite selection rules are documented in `outputs/rocket/study/aircraft-traffic-by-altitude-and-era.md`.
