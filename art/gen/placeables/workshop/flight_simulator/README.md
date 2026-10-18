# W04 — Пилотажный тренажёр (`flight_simulator`)

Шесть эпохальных anchor-спрайтов покупаемого объекта мастерской, подготовленных по `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md` и `ref2game`.

## Соответствие эпох

| файл | эпоха | год | визуальная стадия |
|---|---|---:|---|
| `e0_1978.png` | E0 | 1978 | самодельное кресло на открытой карданной раме, механические приборы |
| `e1_1986.png` | E1 | 1986 | закрывающаяся учебная кабина на двух приводах |
| `e2_1998.png` | E2 | 1998 | CRT cockpit simulator на тяжёлой motion-platform |
| `e3_2015.png` | E3 | 2015 | панорамная кабина с электрическими актуаторами |
| `e4_2035.png` | E4 | 2035 | компактная VR/robotic capsule на multi-actuator platform |
| `e5_2060.png` | E5 | 2060 | адаптивная simulation cell на точной многоосевой опоре |

## Runtime

- canvas: `172×160 LP`
- shared placement anchor: `(86,156)` bottom-center
- common normalization scale across E0–E5
- nearest-neighbor resize
- transparent canvas
- UI separators and detached background/task-light artifacts removed during import

## Gameplay role

Открывает тренировочные полёты без стоимости восстановления, расходников, наград и влияния на основную статистику.

## Animation contract

Цельный спрайт — только anchor/reference и статический fallback. Нельзя имитировать тренажёр вращением/покачиванием/масштабированием всего PNG.

Физические части для следующего rig-pass:
- `base` — static;
- `pod` — rigid body around measured gimbal center;
- `actuator_left` — linear actuator;
- `actuator_right` — linear actuator;
- `canopy` — open/close around measured hinge.

Причинные события:
- `workshop_enter` — подготовка тренажёра;
- `simulator_start` — посадка/закрытие и переход в ACTIVE;
- `simulator_motion` — pod повторяет симулируемые pitch/roll acceleration cues;
- `simulator_stop` — возврат в neutral и открытие canopy;
- `era_changed` — подмена эпохального art.

Screen data, glow, dynamic light, motion blur, vibration and HUD are code-owned FX.

## Ref2game next step

1. Generate/approve isolated `base`, `pod`, `actuator_left`, `actuator_right`, `canopy` parts.
2. Measure actual gimbal/linear/hinge pivots on approved sprites.
3. Build the cut-out rig.
4. Render motion/contact sheet and run QA before enabling WORK motion in gameplay.
