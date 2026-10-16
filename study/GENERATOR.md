# Imagegen follow-up production

## Body-only aviation

The low-aircraft v2 edit was imported and sliced into twelve accepted blade-free bodies. Individual source-pixel landmarks were reviewed independently before normalization.

The first three-transport v2 sheet was only partially accepted: cargo 1986 was clean, but passenger 1978 and cargo 1978 retained fixed vertical blade bars. Those two crops are named `transport_reject_*` and explicitly excluded from prep/runtime. The original returned sheet, request and import log are preserved as rejected evidence, not represented as completed assets.

A v3 two-target edit explicitly removed the remaining black engine-front bars. Both bodies were imported/sliced/prepped and accepted. Cargo 1978 has one clearly visible upper hub; its closed lower pod was not assigned an invented propeller.

The generator returned different canvas sizes. Slicing used actual returned alpha components; runtime dimensions and landmarks are normalized to each complete prepared image, never an assumed grid size. All 36 packaged aircraft are byte-identical to the prepared PNGs listed in `art/aircraft/prepared-manifest.json`.

## Sky separation

The new sky color plate is an opaque imagegen edit of the retained legacy sky reference. It is prepared without trimming or aspect changes. Stars/cloud/cirrus/meteor positions, lifecycle and glow are now code systems for this layer. This does not claim that legacy base lamps, beacons or 2060 background drone glow have already been separated.

## QA pitfall

Deterministic art tests replace `requestAnimationFrame` with a no-op. Playwright state waits in those tests must use explicit interval polling: default RAF polling can freeze before asynchronous image loading completes and produce a false timeout. The asset conditions and 30-second timeout are unchanged.

Diagnostic aircraft PNGs are exported from the native canvas rather than CSS screenshots; global game canvas styles would otherwise stretch the diagnostic surface independently in x/y.
