# «Выше неба» — Canonical Era Reference Contract

## Purpose

This document defines the **single canonical visual-reference format** for E0–E5. It is not a versioned alternative and must not coexist with legacy/application reference schemes.

Era references are a **visual-engineering vocabulary**, not concept art for whole game objects. They exist to show reusable primitives that future assets may combine according to `PRODUCTION_MANIFEST.md` and the asset brief.

The canonical sources remain:

- `art/docs/ERA_DESIGN_MATRIX.md` — era engineering/visual language;
- `art/style_bible.txt` — shared rendering language;
- `art/placeables/PRODUCTION_MANIFEST.md` — gameplay role, physical parts and object lineage;
- this document — how era visual evidence must be represented.

## Canonical reference-set shape

Each era E0–E5 has exactly one reference set composed of four role sheets:

1. `materials-construction`
2. `mechanics-infrastructure`
3. `controls-displays`
4. `lighting-signals`

A role sheet may contain many **isolated atomic examples**, but it must not depict a complete production object, complete building, complete vehicle, complete launch complex or staged base scene.

A canonical role sheet is a **specimen field, not an infographic/UI poster**. The image itself should contain separated physical examples on one neutral background. Do not rely on title bars, era labels, captions, numbered sections, legends, dashboard frames or a four-quadrant board to communicate the era. Any technological ordering must remain readable when all text is removed.

### 1. materials-construction

Show reusable material and construction vocabulary only:

- painted/raw metal samples;
- plastics, rubber, concrete, wood, composites, glass where era-appropriate;
- panel edges, seams, joints, welds, rivets, bolts, flanges, brackets;
- structural profiles and short frame fragments;
- service-door, hatch, grille, louver and ventilation fragments;
- facade/wall/roof connection fragments when architecture language matters;
- wear/finish examples where functionally justified.

**Architecture/silhouette evidence is represented by construction fragments, not whole buildings.**

### 2. mechanics-infrastructure

Show reusable physical mechanisms and routed utilities only:

- motors, gearboxes, bearings, pulleys, chains, belts, screws, hydraulic elements, servos and actuators as era-appropriate;
- hinges, pivots, yokes, rollers, guides and serviceable joints;
- cable bundles, trays, conduits, connectors, junctions and patch hardware;
- pipes, elbows, flanges, valves, manifolds, pumps and hose couplings;
- mounting/service access patterns.

Do not combine these primitives into a complete radar, crane, recovery vehicle, fuel depot, cargo terminal or other gameplay asset.

### 3. controls-displays

Show reusable operator/diagnostic vocabulary only:

- switches, buttons, knobs, levers and emergency controls;
- analog gauges and scales;
- indicator clusters;
- CRT/LCD/flat/spatial-interface **hardware** as era-appropriate;
- racks, replaceable modules, connectors and diagnostic panels;
- screen bezel/depth/housing language.

Do not show a complete control room, simulator, workstation room or building interior. Dynamic screen content remains code-owned.

### 4. lighting-signals

Show reusable physical emitters and signaling language only:

- bulbs, lamps, beacons, housings, lenses, reflectors and fixtures;
- work-light fixtures;
- warning/ready/work signal groupings;
- era-specific light temperature and value hierarchy;
- restrained palette/value swatches showing material response to the canonical upper-left key light.

No baked glow, bloom, rays or dynamic FX. Code owns active illumination behavior.

## Absolute exclusions

Era reference sheets MUST NOT contain:

- whole buildings, hangars, towers or launch structures;
- complete vehicles, aircraft, carts or recovery machines;
- complete radars, beacons, cranes, fuel depots, cargo terminals or other production assets;
- base scenes, landscapes, staged yards or room scenes;
- whole-object/application boards;
- cross-era comparison boards inside a generation result;
- object compositions that can be copied directly as a gameplay asset;
- decorative pseudo-components without a causal engineering role;
- infographic/dashboard composition where several canonical roles are presented as separate labeled panels.

If a generator returns any of the above, the source is rejected for **reference scope failure** even when its style and era are otherwise correct.

## Era axes mapping

The eight axes from `ERA_DESIGN_MATRIX.md` remain mandatory, but visual evidence is mapped to atomic roles:

| Era axis | Primary reference role |
| --- | --- |
| manufacturing | materials-construction |
| materials | materials-construction |
| drive | mechanics-infrastructure |
| interface | controls-displays |
| lighting | lighting-signals |
| infrastructure | mechanics-infrastructure |
| autonomy/service | mechanics-infrastructure + controls-displays |
| silhouette/architecture | materials-construction fragments only |

A whole building is never required to prove the silhouette/architecture axis.

## Adjacent-era contrast contract

Every role prompt for E1–E5 must state what is **replaced from the previous era**, not merely what is added. The prior-era prompt must also state the next-era signatures that are intentionally absent.

For role-to-role blind order, adjacent eras must be distinguishable by construction/technology rather than by palette, cleanliness, damage, label text or lamp density alone. Examples of valid transitions include hand-fitted fabrication → repeatable stamped/folded modules, manual exposed drives → hydraulic/electromechanical assistance, individually mounted controls → standardized grouped modules, or isolated incandescent signals → planned standardized fixture families.

If the reviewer cannot explain a physical manufacturing/mechanical/interface/lighting replacement between adjacent role sheets without looking at labels or color, the later era fails cross-era role review.

## Generation contract

- One image-generation call = one role sheet for one era.
- Never generate several eras in one call.
- Never generate the four roles as one broad era board.
- The applicable role prompt is combined with `art/style_bible.txt` **verbatim exactly once**.
- Keep examples visually separated and non-overlapping.
- Use one neutral background; no scenery.
- Do not request or accept title bars, era/year labels, captions, numbered sections, legends, UI/dashboard framing or four-quadrant layouts. Unlabeled material/value swatches are allowed where the role requires them.
- The canonical upper-left lighting sentence from the style bible applies to every physical example.
- The untouched source is archived and SHA-256 recorded before destructive processing while it remains a candidate for the canonical set.

## Approval

An era becomes `approved_visual_reference_set` only when all four exact-SHA role sheets pass:

1. scope review — atomic only, no whole objects/scenes and no multi-role infographic board;
2. style-family review — matches `art/style_bible.txt`;
3. era review — visibly expresses the era matrix;
4. role completeness review — required vocabulary is represented;
5. cross-era role review — the same role can be ordered technologically across adjacent eras without relying on labels or palette alone.

Blind-order QA is performed **role-to-role** (`materials` vs `materials`, `mechanics` vs `mechanics`, etc.), not by comparing whole architecture/application scenes. Reviewers must be able to name the physical technology/manufacturing replacement that establishes the order.

## Canonical-only storage rule

Repository metadata under `art/references/eras/` describes only the single current canonical reference set or a pending rebuild state. Do not keep `legacy`, `superseded`, `_v2`, `applications`, architecture-correction or whole-object sidecars in canonical reference metadata.

Invalid reference boards are removed from canonical metadata immediately. Physical deletion of previously archived Drive originals is performed only after the rule change authorizing that cleanup is merged into `game-production`; until then they are non-canonical and must not be used as visual evidence.

## Asset-generation use

A production asset is derived from:

`gameplay role + parts/lineage from PRODUCTION_MANIFEST + asset brief + applicable atomic era references + style bible`.

Era references never determine the identity, overall layout or gameplay function of the new object. They provide only reusable construction/material/mechanical/interface/lighting vocabulary.
