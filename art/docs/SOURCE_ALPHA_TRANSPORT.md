# Source alpha transport contract

## Status and scope

This is a narrow production compatibility extension for source-generation alpha transport. It exists because the current built-in imagegen can return otherwise useful isolated sprites with globally non-opaque alpha and baked edge light fields even when native transparency is requested.

For an asset whose machine-readable preflight explicitly declares `generation_gate.alpha_strategy = "opaque_chroma_key"`, this document overrides only the older wording that requires native transparent alpha at the **raw generation transport** boundary. It does **not** relax any source geometry, projection, era, FX, final-alpha, candidate, approval, promotion or runtime gate.

The default remains `native_transparent`. Keyed transport is opt-in, asset/era specific and must be justified by a durable tracker checkpoint showing repeated native-alpha failure.

## Allowed strategies

### `native_transparent`

- imagegen is invoked with native transparency enabled;
- the raw source must pass the normal source/alpha review;
- no keyed-background processing is introduced.

### `opaque_chroma_key`

Use only when the receipt explicitly enables it.

1. Imagegen is invoked with native transparency disabled.
2. The complete canvas is a single exact, fully opaque key color declared in the receipt. For the current B03 E0 recovery pass the key is `#FF00FF`.
3. The key color must be far from the asset palette and must not be used by the physical object.
4. The background must be spatially uniform: no gradient, vignette, texture, checkerboard, floor, cast shadow, glow, bloom, light cone, color spill or global light field.
5. The physical subject must already pass identity, era, construction, silhouette and projection review **before** key removal. Keying is transport conversion, not a way to repair a bad source.
6. The untouched opaque PNG is archived to Google Drive and SHA-256 recorded before any key removal.
7. `source_prepare` removes only the declared key color using the current ref2game keyed-art path (`gen.py key ... --key ff00ff --pixel`) or a byte-equivalent reviewed project implementation.
8. Keying must not be used to hide baked FX, projection mismatch, missing parts, bad contact geometry or an incorrect silhouette. If those defects are present, the raw source is rejected.
9. The keyed result must have clean transparent alpha before Pixel Snapper. Final candidate/runtime alpha requirements are unchanged.

## Source gate for keyed transport

A keyed raw source is accepted for `source_prepare` only if all are true:

- one complete requested asset and no extras;
- correct era and physical construction;
- correct camera family/projection by visual comparison to the exact approved reference;
- lamp/signal hardware is physically OFF unless the asset contract explicitly requires a static emissive source;
- no baked glow/bloom/cast shadow/lighting aura;
- exact declared key fills the background uniformly to the canvas boundary;
- object edges are crisp and do not contain a colored/light halo outside the physical silhouette;
- immutable raw archive + SHA-256 provenance exist.

Failure remains a source failure. Do not send a failed keyed raw into Pixel Snapper/normalize/Aseprite.

## B03 E0 recovery decision

`B03 / landing_guidance / E0 1978` may use `opaque_chroma_key` with exact key `#FF00FF` because repeated native-alpha attempts produced globally non-opaque sprites and broad baked alpha/light fields. This change addresses only alpha transport. The existing `island_top_3_4` projection gate, exact approved island reference, E0 atomic reference evidence, compact manual sight/yoke geometry and all downstream QA remain mandatory.
