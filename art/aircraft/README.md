# Aircraft art source

This directory is the ref2game-facing source description for the aircraft family.

- `effects.json` — runtime attachment/effect anchors and engine/effect types.
- `traffic.json` — altitude/era selection policy used to derive the runtime traffic system.
- Existing generated aircraft artwork is retained in the runtime pack under `outputs/rocket/dist/assets/aircraft/`; any future visual regeneration must be imported through the canonical ref2game generation pipeline and then replace the runtime pack in the same change as the sizing/placement code.

The current era years are gameplay technology tiers, not strict historical claims.
