// Six technological eras. `advance` describes the "Модернизация космодрома" project that leaves the era.
// cap.part = 3 * (id + 1); cap.building = id + 1 (buildings may have a `lead`, see buildings.js).

import { PART_LEVELS_PER_ERA } from './economy.js';

function era(id, year, name, desc, bonus, advance) {
  return {
    id,
    year,
    name,
    desc,
    cap: { part: PART_LEVELS_PER_ERA * (id + 1), building: id + 1 },
    bonus,
    advance,
  };
}

// Milestone items: every item must hold. Altitudes are meters, `maxAlt` is the best altitude of any flight.
const alt = (min) => ({ type: 'maxAlt', min });
const soft = (min) => ({ type: 'softLandings', min });

export const ERAS = [
  era(0, 1978, 'Гаражная мечта', 'Ручная сборка. Сарай, бетон и мечта.',
    { fuel: 0, income: 0, discount: 0 },
    { coins: 360, data: 8, buildings: { count: 2, level: 1 }, milestone: { text: 'Мягкая посадка и высота 3 км', items: [soft(1), alt(3000)] } }),
  era(1, 1986, 'Своя мастерская', 'Подъёмник, бак и первые станки.',
    { fuel: 0.04, income: 0.05, discount: 0.02 },
    { coins: 1500, data: 40, buildings: { count: 4, level: 2 }, milestone: { text: 'Высота 30 км', items: [alt(30000)] } }),
  era(2, 1998, 'Испытательный центр', 'Кран, радар и кирпичные цехи.',
    { fuel: 0.08, income: 0.1, discount: 0.04 },
    { coins: 5500, data: 150, buildings: { count: 6, level: 3 }, milestone: { text: 'Линия космоса: высота 100 км', items: [alt(100000)] } }),
  era(3, 2015, 'Космический порт', 'Центр управления и солнечные поля.',
    { fuel: 0.12, income: 0.15, discount: 0.06 },
    { coins: 18000, data: 480, buildings: { count: 8, level: 4 }, milestone: { text: 'Мягкая посадка на Луне', items: [{ type: 'moonLanding' }] } }),
  era(4, 2035, 'Орбитальная эра', 'Роботы, конвейеры и станции.',
    { fuel: 0.16, income: 0.2, discount: 0.08 },
    { coins: 60000, data: 1300, buildings: { count: 10, level: 5 }, milestone: { text: 'Мягкая посадка на Марсе', items: [{ type: 'marsLanding' }] } }),
  era(5, 2060, 'Горизонт будущего', 'Мегаполисы и космопорт будущего.',
    { fuel: 0.2, income: 0.25, discount: 0.1 },
    null),
];
