# B01 E0 rig cutout

This rig pass follows `ref2game` and `art/docs/ASSET_PRODUCTION_PIPELINE.md`.

The approved E0 anchor art is decomposed pixel-exactly into four cut-out layers: `body`, `sensor`, `vane`, `indicator`. No replacement image generation is used for the accepted rig parts because the approved anchor already contains the required rigid subassemblies and the cutout reconstruction is pixel-exact.

Measured LP pivots from the approved 96x122 anchor:

- sensor: `(42,29)`
- vane: `(48,36)`
- indicator mount: `(57,63)`
- placement registration: `(48,118)`

`indicator` hardware stays rigid; its state illumination/data is owned by code. `sensor` and `vane` move as their real rigid subassemblies, never by moving the whole placeable sprite.
