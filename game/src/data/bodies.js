// Bodies and destinations. Physical constants come from the simulation so both packages always agree.

import { BODIES as SIM_BODIES } from '../sim/bodies.js';

const NAMES = { earth: 'Земля', moon: 'Луна', mars: 'Марс' };
const DESCS = {
  earth: 'Атмосфера до 100 км. Старт и посадка на острове.',
  moon: 'Вакуум и малая гравитация. Нужен перелёт после линии космоса.',
  mars: 'Разреженная атмосфера и сильный ветер у поверхности.',
};

export const BODIES = Object.fromEntries(
  Object.entries(SIM_BODIES).map(([id, body]) => [id, {
    id,
    name: NAMES[id],
    desc: DESCS[id],
    gravity: body.gravity,
    atmo: { ...body.atmo },
    surface: body.surface,
    parachute: body.atmo.density >= 0.35, // the canopy needs dense air: Moon and Mars are out
  }]),
);

// Share of the core stage fuel that a transfer maneuver burns (before the avionics saving).
export const TRANSFER_COST = { moon: 0.3, mars: 0.5 };

// What the base and the rocket must provide before the destination can be chosen.
// `building` and `part` entries are minimum levels, `era` is the minimum era id.
export const DESTINATIONS = {
  earth: {
    id: 'earth',
    name: 'Атмосфера',
    desc: 'Короткий вылет над океаном: высота, кольца, мягкая посадка.',
    requires: [],
  },
  moon: {
    id: 'moon',
    name: 'Луна',
    desc: 'Выйти за линию космоса, выполнить перелёт и сесть на Луне.',
    requires: [
      { era: 3 },
      { building: 'control', level: 3 },
      { building: 'radar', level: 2 },
      { building: 'recovery', level: 1 },
      { part: 'capsule', level: 10 },
    ],
  },
  mars: {
    id: 'mars',
    name: 'Марс',
    desc: 'Долгий перелёт, разреженная атмосфера, тяжёлый груз.',
    requires: [
      { era: 4 },
      { building: 'control', level: 4 },
      { building: 'radar', level: 3 },
      { building: 'recovery', level: 3 },
      { building: 'logistics', level: 3 },
      { part: 'capsule', level: 13 },
    ],
  },
};
