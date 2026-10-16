# Aircraft runtime critic — round 3 (bounded final)

Independent review of current runtime assets and phase renders, 2026-10-16 UTC. **ACCEPT current aircraft body/rotor integration with bounded limitations below.** This is an aircraft module verdict, not final whole-game completion.

## Scores (1–10)

| Axis | Score | Reason |
|---|---:|---|
| Body/animation separation | 9 | New12 low bodies and3 replacement transports no longer carry frozen blades; visible phase changes occur around the intended stationary hubs. |
| Physical attachment | 8 | Previous large detached-rotor/exhaust gaps are absent in examined phase sheets; every profile has individual pixel landmarks. Landmark picking remains ±3–5 source pixels. |
| Runtime transform consistency | 10 | Independent read of report:648 draws,1,764 traced origins, maximum numeric discrepancy0.0000010559 canvas pixels; both facings and3 scales. This proves transformation consistency, not pixel-perfect physical landmark truth. |
| Motion/readability | 8 | Low-family props visibly change phase;4 distributed rotors on2060 multiwing are attached and moving. Transport props/fans move. Phase sampling is too short to judge a full navigation-light blink cycle. |
| Occlusion | 8 | Exhaust rendered behind body, rotors/fans in front, with no obvious silhouette-breaking effect in examined facings. No per-part depth masks exist, so arbitrary view changes would need new scrutiny. |
| FX finish | 6 | Thin rotor strokes and elliptical blur are readable at this scale; exhaust remains simple triangles/rectangles rather than richly shaped pixel effects. Cosmetic polish remains possible. |
| Overall aircraft module | 8 | Major round1 technical blockers resolved; runtime module acceptable without claiming exact source-landmark certainty or whole-scene QA. |

## Evidence examined

- `work/aircraft/facing-1-phase-0.png`, `facing-1-phase-2.png`, and `facing--1-phase-3.png`: all36 aircraft per sheet, both facings, separate engine/rotor phases.
- `work/aircraft/report.json`:648 transformed draws,1,764 origins,0 errors,4,756 changed RGBA channels in the scripted low-family motion region.
- `outputs/rocket/qa-aircraft.cjs`: actual runtime draw calls at zoom.55/1/1.8 and rotation.19, three time samples for the transform pass; five phase sheets per facing.
- `live/aircraft.js`: `behind()` precedes full-body image; `front()` follows it. Origins use individual normalized metadata and the same transform as the body.
- `tools/build-aircraft.py`: profile normalization uses full source dimensions; alpha-neighborhood validates material near anchors; deterministic ZIP packaging uses prepared images.
- Independent ZIP check:36 entries, CRC pass; **all36 ZIP entry byte strings equal their same-named prepared world PNGs**. Thus the phase review uses the cleaned body-only assets, not old source PNGs or legacy upload chunks.

## Independent phase difference check

Compared phase0 versus phase2 using per-aircraft cell crops excluding captions. Counts are changed output **pixels**, not RGBA channel count. All12 low aircraft:278…766 changed pixels per cell. Passenger1978:395; cargo1978:196; cargo1986:505. This corroborates moving rotor pixels rather than only global sprite translations. Zero-change2060 passenger/cargo and experimental1998 are expected for these short samples: those bodies have no visible fan/outlet and were deliberately assigned no invented mechanism; navigation blink does not change during these sampled times.

| Family | 1978 | 1986 | 1998 | 2015 | 2035 | 2060 |
|---|---:|---:|---:|---:|---:|---:|
| low_primary | 313 | 337 | 313 | 374 | 317 | 278 |
| low_multiwing | 346 | 400 | 342 | 343 | 313 | 766 |
| medium_passenger | 395 | 203 | 254 | 142 | 110 | 0 |
| medium_cargo | 196 | 505 | 201 | 134 | 157 | 0 |
| high_fighter | 26 | 24 | 28 | 75 | 70 | 71 |
| high_experimental | 59 | 39 | 0 | 72 | 78 | 90 |

## Residual limits / useful fixes

1. **Diagnostic screenshot sizing (minor tooling issue):** inspected PNGs are1440×1000 while backing canvas is960×900. CSS scale is x1.5 versus y1.111, so these screenshots distort aspect and are not literal native gameplay-scale evidence. Export the canvas backing pixels with `toDataURL()` for strict native-scale comparison. Runtime aircraft dimensions in `draw()` itself preserve image aspect. This is a report-surface limitation, not evidence of distorted in-game art.
2. **Full blink/long-cycle review not established:** shown phase times span only≈45 milliseconds; blink uses260ms steps. Code exists, but these particular phase strips cannot prove its full visible cycle or long-duration trails.
3. **Landmark uncertainty:** trace discrepancy≈10⁻⁶px is floating-point transform agreement against the same candidate source measurements. It does not reduce the independent visual landmark uncertainty of±3–5px. At widths98…120, source uncertainty shrinks proportionately; large regenerated transport sources shrink it further.
4. **Facing light consistency (known design tradeoff):** horizontal mirroring also mirrors baked upper-left highlight placement. No new visible technical failure in this bounded rotor/anchor review, but global light-direction fidelity is not demonstrated for both facings.
5. **No new mechanics:** closed cargo1978 lower pod remains closed and receives no propeller. Invisible2060 transport fans and experimental1998 nozzle remain omitted. This is appropriate restraint, not missing requested gameplay.

No runtime code edited by this reviewer. The source candidate JSON and prior round reports remain the measurement provenance.
