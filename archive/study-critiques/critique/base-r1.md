# Base FX separation — independent critic round1

Reviewed original `outputs/rocket/dist/assets/base-eras.png` and new `art/gen/base_static_sheet.png` at native source scale and2× nearest-neighbour grid views for all six cells. The new sheet is1774×887. This is a new subject, separate from the completed bounded sky review. No runtime code or artwork edited by this critic.

## Scores / verdict

| Axis | /10 | Reason |
|---|---:|---|
| Architecture and era identity |9| Tower/crane/radar/solar/glasshouse progression remains identifiable in all six source cells. |
| Composition preservation |9| Same central empty pad, sunset disc, lake, mountain silhouettes and side framing. Minor pixel/detail drift is visible, so not a pixel-exact edit. |
| Requested frozen FX removal |8| Cloud wisps, diffuse lamp/beacon halos and2060 hovering bodies/underglow are visibly removed; colored window and cyan material pixels remain. |
| Anchor usability |8| Two proposed lamp points and1–3 mast-tip beacons per era; observed hardware vs authored emission is explicitly marked. |
| Overall source sheet |9| ACCEPT for import and assembled-scene checks; no regeneration requested. |

## Concrete source changes verified

- All six sky regions are now clean gradient sunsets, rather than retaining frozen cloud streaks. The sun disc/reflection and environmental warm horizon remain; those are deliberate static environmental composition, not evidence of missed exhaust/particles.
-1978/1986 hanging lamp and curved pole fixtures remain physically present, but large warm halos are absent. The replacement is dimmer and suitable for code-driven emission.
-1998/2015/2035/2060 prominent red beacon auras on upper towers are absent. As a sanity check,13×13 source boxes around three recorded mast endpoints in2015 contain135 threshold-red pixels in the original and0 in new;2035 is85→0;2060 is80→0. Threshold used R>140,R>1.8G,R>1.2B. These samples support removal of those particular red auras; they do not prove the absence of every warm pixel or establish a lens at every authored emitter.
-2060 drone-like bodies formerly above/along the right and central bridge are absent. No frozen cyan underglow remains at their former hovering positions. Glasshouse, bridge, upper circular tower bands and pipes remain structurally coherent.
- Cyan ring/conduit bands in2035/2060 still have light-valued material faces, and several small warm window/fixture pixels remain across the sheet. They have no obvious diffuse halo in the native crops. Do not replace these solid materials with holes or call every cyan/yellow face an unresolved FX defect. Any newly animated light must begin at an appropriate housing, not at arbitrary cyan artwork.

## Actionable anchors written

`art/base-anchors.json` includes source SHA256, source size, grid/crop convention, world-transform equations and per-era local native-source points. It provides12 lamp candidates and16 beacon candidates. The source hash is `2c3fae4d551fc898aad23527b037d2706a0360184bdd225d31c928a85742f6e5`.

| Era | Lamp candidates local x,y | Mast-tip beacon candidates local x,y |
|---|---|---|
|1978|(197,220),(439,245)|(166,91)|
|1986|(197,220),(439,245)|(149,119),(166,91),(179,130)|
|1998|(141,188),(445,211)|(165,76),(188,84),(201,50)|
|2015|(123,292),(418,258)|(192,23),(224,38),(167,69)|
|2035|(150,284),(440,212)|(191,19),(212,8),(168,53)|
|2060|(151,283),(440,214)|(190,19),(211,8),(168,53)|

Lamp uncertainty is±2–4 source pixels depending on visible fixture clarity. Mast-tip uncertainty is±2. The1978/1986 lamps are observed lamp housings; later entries that use a general service fixture or cap are **authored emitter choices**, not fabricated identification of an existing lamp lens. All mast-tip emissions are marked authored on visible hardware endpoints. This distinction is in the JSON and must survive downstream metadata/reporting.

Coordinate mapping follows the actual runtime:3×2 grid, cell591.333×443.5; source inset2 each side; destination1280×800; world top600,left−650. Source-local(x,y) maps to world `x=-650+(x-2)*1280/(1774/3-4)`, `y=600-(y-2)*800/(887/2-4)`. Be careful to retain fractional cell origins rather than assuming591px integer columns. A±3px source uncertainty becomes±6.54 world x/±5.46 world y, so final emitter footprint should remain subtle and be visually checked against its housing in assembled scenes.

Native and grid crops are in `study/critique/base-r1/eraN.png` and `gridN.png`.

## Remaining checks / blockers

No source-art blocker identified. Import the new sheet before claiming the legacy original is gone from runtime; assembled scenes must confirm source hashes and per-era emitter alignment at actual draw transforms. Decorative2060 drone bodies, if reintroduced, must use isolated approved raster art and code animation/glow; this edit only removed them, it did not itself deliver new animated drones. Ground geometry and central empty landing zone remain as in the original base layout and require no new mechanism.
