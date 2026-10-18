# W04 — Flight Simulator generation contract

Every generation call MUST be executed through `ref2game` and MUST append the complete contents of `art/style_bible.txt` verbatim after the era-specific block below.

Global contract for all eras:

- Generate ONE isolated `flight_simulator`, and nothing else.
- Transparent background, complete uncropped silhouette, useful padding.
- Same slight 3/4 gameplay projection and family scale across E0–E5.
- Physical parts must remain mechanically readable for the later cut-out rig: `base`, `pod`, `actuator_left`, `actuator_right`, `canopy`.
- No people, labels, text, pseudo-writing, logos, UI, scene background, cast shadow, baked glow, particles, motion blur, trajectory graphics or screen-data effects.
- The simulator is a real motion platform. Do not imply operation by bobbing/rotating the entire object.

## E0 — 1978

Create ONE isolated workshop flight simulator. A garage-built pilot seat on a heavy welded gimbal/motion frame with exposed mechanical joints, analog flight instruments, switches, physical control stick, visible cabling, and a practical articulated task lamp. The base and moving pod must read as separate physical systems; actuator attachment points must be visually plausible. Materials: worn painted steel, dark seat upholstery, warm aged metal, sparse red safety accents. No futuristic shell.

Source generation id: `155ad5c7-2e21-4bb6-811b-e42ed21ee5e7`.

## E1 — 1986

Evolve the approved E0 into the same engineering family in 1986. Add a compact enclosed training cabin and two clearly visible hydraulic actuators while retaining the heavy serviceable base, physical controls and early electronic instrumentation. The cabin must still expose enough mechanical logic to understand how pitch/roll are produced.

Source generation id: `77e671d8-6aa9-4aee-8389-7b3bf26271f2`.

## E2 — 1998

Evolve E1 into a late-1990s heavy CRT cockpit on a substantial motorized motion platform. Use multiple real CRT instruments, denser but orderly cable/service panels, stronger actuator housings and a more integrated pod. Preserve the E0/E1 base/pod/actuator ancestry; do not turn it into a spaceship prop.

Source generation id: `57f0cda3-c37e-489e-bdc5-404c89c935a9`.

## E3 — 2015

Evolve E2 into a modern panoramic simulator with a cleaner composite/painted-metal cockpit ring, flat displays and electric actuators. The pod should feel lighter and more precise but the base, actuator geometry and canopy/opening structure must remain physically understandable.

Source generation id: `c0dbb3e2-65b1-4b2a-8358-3deeb36a45f4`.

## E4 — 2035

Evolve E3 into a compact VR/robotic capsule on a precise multi-actuator platform. Robotics and enclosed mechanics may be more advanced, but real joints, load paths and actuator attachment points must remain visible. Cyan is only a restrained instrument accent, not the identity of the future era.

Source generation id: `ac153f0a-25ca-4f5a-9865-4949c355fb4a`.

## E5 — 2060

Evolve E4 into an adaptive simulation cell on a high-precision multi-axis support. Use lightweight integrated structures and smart-material-looking panels while keeping the physical base/pod/actuator/canopy function readable. The future version must still look mechanically capable of producing the training motion, not like a hologram or decorative sphere.

Source generation id: `b2916572-5c28-4dbe-9461-e3dd65786da8`.

## Gameplay / motion contract

W04 provides one pre-flight training scenario: crosswind, thrust failure, or excessive vertical speed. A successful exercise grants one non-stacking consumable safety buffer for the next flight; the first threshold exceedance of the trained type is reduced by 25%.

Animation must be causal: the selected scenario physically changes the pod pose and the two actuators move consistently with that pose. `canopy` may open/close for enter/exit. Idle remains nearly static. Mechanism pivots are measured only after isolated parts pass reconstruction QA.
