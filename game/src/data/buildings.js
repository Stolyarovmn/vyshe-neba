// Fourteen base buildings, six levels each. levels[i] describes level i + 1.
// Island anchors live in art/placeables/BASE_ISLAND_LAYOUT.json under the same keys.
//
// Level N of a building requires: an era (N - 1, or its first era if later), the energy node at level N - 1
// (from level 2 on) and the dependency building at level N - 1. The dependency graph is a DAG on purpose.
// Effects are plain numbers: fractions, multipliers' bonus parts or counts. A power deficit scales the
// continuous ones down; `discrete` ones (slots, free consumables) switch off below half power.

import { MAX_BUILDING_LEVEL, PRICE_SCALE } from './economy.js';

const LEVELS = Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => i + 1);

function nice(value) {
  if (value < 500) return Math.max(5, Math.round(value / 5) * 5);
  if (value < 5000) return Math.round(value / 10) * 10;
  if (value < 50000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

// Power use of level N for a building of weight w. Weights are tuned so that the energy node at level
// (era + 1) can carry every unlocked building of that level.
const POWER_CURVE = [2, 4, 7, 11, 16, 22];
// Data needed from level 5 on, multiplied by the building weight.
const DATA_CURVE = [0, 0, 0, 0, 6, 20];
const COST_GROWTH = 2.5;

// Supply of the energy node per level; the launch table adds BASE_POWER_SUPPLY on top.
const ENERGY_SUPPLY = [14, 28, 78, 162, 236, 330];

const fx = (key, label, unit, digits = 2, discrete = false) => ({ key, label, unit, digits, discrete });

const SPEC = {
  beacons: {
    name: 'Стартовые маяки',
    need: 'Нужны стартовые маяки',
    desc: 'Подсвечивают зону посадки, расширяют допуск посадки и повышают награду за идеальное касание.',
    cost: 40, weight: 0.6, minEra: 0, dataWeight: 0.5, dependsOn: null,
    effects: {
      landTol: [0.05, 0.088, 0.125, 0.163, 0.205, 0.25], // realised by the simulation as 0.25 * beacons01
      beacons01: [0.2, 0.35, 0.5, 0.65, 0.82, 1],
      perfectBonus: [0.05, 0.1, 0.15, 0.2, 0.26, 0.32],
    },
    info: [fx('landTol', 'Допуск посадки', '%'), fx('beacons01', 'Подсветка зоны', '%'), fx('perfectBonus', 'Бонус идеальной посадки', '%')],
  },
  gantry: {
    name: 'Башня обслуживания',
    need: 'Нужна башня обслуживания',
    desc: 'Даёт мощность разгонному блоку и дозаправляет ступени на столе.',
    cost: 70, weight: 1.2, minEra: 0, dataWeight: 0.8, dependsOn: null,
    effects: {
      boosterPower: [0, 0.1, 0.22, 0.36, 0.52, 0.7],
      padFuel: [0.02, 0.05, 0.09, 0.14, 0.2, 0.28],
    },
    info: [fx('boosterPower', 'Мощность разгонного блока', '%'), fx('padFuel', 'Дозаправка на столе', '%')],
  },
  deluge: {
    name: 'Охлаждение площадки',
    need: 'Нужно охлаждение площадки',
    desc: 'Защищает площадку от мощных двигателей и снижает износ обшивки.',
    cost: 60, weight: 0.8, minEra: 0, dataWeight: 0.6, dependsOn: 'gantry',
    effects: {
      padSafety: [0.25, 0.45, 0.62, 0.78, 0.9, 1],
      hullWear: [0.05, 0.1, 0.16, 0.22, 0.3, 0.4],
    },
    info: [fx('padSafety', 'Защита площадки', '%'), fx('hullWear', 'Меньше износа обшивки', '%')],
  },
  service: {
    name: 'Сервисная команда',
    need: 'Нужна сервисная команда',
    desc: 'Чинит обшивку между полётами и снижает цену двигателя и стабилизаторов.',
    cost: 55, weight: 1, minEra: 0, dataWeight: 0.6, dependsOn: null,
    effects: {
      repairOnLand: [0.1, 0.2, 0.32, 0.46, 0.62, 0.8],
      discountEngineFins: [0.03, 0.06, 0.09, 0.12, 0.15, 0.18],
    },
    info: [fx('repairOnLand', 'Ремонт обшивки', '%'), fx('discountEngineFins', 'Скидка на двигатель и стабилизаторы', '%')],
  },
  rescue: {
    name: 'Спасательная станция',
    need: 'Нужна спасательная станция',
    desc: 'Возвращает часть стоимости при аварии и обслуживает капсулу и парашют.',
    cost: 65, weight: 1, minEra: 0, dataWeight: 0.6, dependsOn: 'service',
    effects: {
      rescueRefund: [0.15, 0.28, 0.4, 0.52, 0.64, 0.75],
      freeChute: [0, 0, 1, 1, 1, 1],
    },
    info: [fx('rescueRefund', 'Возврат при аварии', '%'), fx('freeChute', 'Бесплатный парашют', '', 0, true)],
  },
  fuel: {
    name: 'Топливный комплекс',
    need: 'Нужен топливный комплекс',
    desc: 'Поднимает потолок ёмкости баков, чаще роняет баки в небе и даёт бесплатную канистру.',
    cost: 50, weight: 1.2, minEra: 0, dataWeight: 0.6, dependsOn: null,
    effects: {
      tankBonus: [0.03, 0.06, 0.1, 0.14, 0.19, 0.25],
      fuelDropRate: [0.1, 0.2, 0.32, 0.45, 0.6, 0.8],
      freeCanister: [0, 0, 0, 1, 1, 1],
    },
    info: [fx('tankBonus', 'Ёмкость бака', '%'), fx('fuelDropRate', 'Баки в небе', '%'), fx('freeCanister', 'Бесплатная канистра', '', 0, true)],
  },
  logistics: {
    name: 'Логистический терминал',
    need: 'Нужен логистический терминал',
    desc: 'Открывает слоты контрактов и поднимает награду за грузовые рейсы на Луну и Марс.',
    cost: 120, weight: 1.1, minEra: 1, dataWeight: 0.8, dependsOn: 'fuel',
    effects: {
      contractSlots: [1, 2, 2, 2, 2, 2],
      cargoReward: [0.1, 0.2, 0.3, 0.45, 0.6, 0.8],
    },
    info: [fx('contractSlots', 'Дополнительные контракты', 'шт.', 0, true), fx('cargoReward', 'Награда за грузовые рейсы', '%')],
  },
  factory: {
    name: 'Производственный цех',
    need: 'Нужен производственный цех',
    desc: 'Снижает цену модулей ракеты и открывает дорогие узлы поздних эпох.',
    cost: 140, weight: 1.5, minEra: 1, dataWeight: 1, dependsOn: 'service',
    effects: {
      partDiscount: [0.03, 0.06, 0.1, 0.14, 0.18, 0.22],
    },
    info: [fx('partDiscount', 'Скидка на модули', '%')],
  },
  weather: {
    name: 'Метеостанция',
    need: 'Нужна метеостанция',
    desc: 'Показывает прогноз погоды в меню и на HUD, награждает за полёт сквозь шторм.',
    cost: 90, weight: 0.6, minEra: 1, dataWeight: 0.7, dependsOn: null,
    effects: {
      forecast: [0.2, 0.4, 0.6, 0.75, 0.9, 1],
      stormBonus: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    },
    info: [fx('forecast', 'Точность прогноза', '%'), fx('stormBonus', 'Бонус за шторм', '%')],
  },
  control: {
    name: 'Центр управления',
    need: 'Нужен центр управления',
    desc: 'Телеметрия и линия прогноза, прибавка к доходу полёта. Открывает Луну вместе с радаром.',
    cost: 160, weight: 1.4, minEra: 2, dataWeight: 1.2, dependsOn: 'radar',
    effects: {
      telemetry: [0.2, 0.4, 0.6, 0.8, 0.9, 1],
      flightIncome: [0.02, 0.04, 0.07, 0.1, 0.14, 0.18],
    },
    info: [fx('telemetry', 'Телеметрия', '%'), fx('flightIncome', 'Доход полёта', '%')],
  },
  radar: {
    name: 'Радар слежения',
    need: 'Нужен радар слежения',
    desc: 'Подсвечивает самолёты и обломки заранее и снижает число столкновений.',
    cost: 150, weight: 1.4, minEra: 2, dataWeight: 1.1, dependsOn: 'weather',
    effects: {
      radar01: [0.2, 0.4, 0.6, 0.75, 0.9, 1],
      collisionCut: [0.1, 0.2, 0.3, 0.42, 0.55, 0.7],
    },
    info: [fx('radar01', 'Дальность радара', '%'), fx('collisionCut', 'Меньше столкновений', '%')],
  },
  energy: {
    name: 'Энергетический узел',
    need: 'Нужен энергетический узел',
    desc: 'Мощность для всех построек. При дефиците эффекты построек пропорционально слабеют.',
    cost: 130, weight: 0.2, minEra: 1, dataWeight: 0.8, dependsOn: null, lead: 1,
    effects: {},
    info: [],
  },
  observation: {
    name: 'Наблюдательный комплекс',
    need: 'Нужен наблюдательный комплекс',
    desc: 'Увеличивает прирост данных и раскрывает высотные зоны.',
    cost: 300, weight: 1.3, minEra: 3, dataWeight: 1.3, dependsOn: 'control',
    effects: {
      dataMult: [0.15, 0.3, 0.5, 0.75, 1.05, 1.4],
      zoneReveal: [0.2, 0.4, 0.6, 0.8, 0.9, 1],
    },
    info: [fx('dataMult', 'Прирост данных', '%'), fx('zoneReveal', 'Раскрытие зон', '%')],
  },
  recovery: {
    name: 'Система возврата',
    need: 'Нужна система возврата',
    desc: 'Возвращает капсулу с Луны и Марса и выплачивает за экспедицию.',
    cost: 300, weight: 1.6, minEra: 3, dataWeight: 1.4, dependsOn: 'logistics', alsoDependsOn: 'rescue',
    effects: {
      expeditionPay: [0.1, 0.25, 0.45, 0.7, 1, 1.4],
      salvage: [0.1, 0.2, 0.3, 0.45, 0.6, 0.8],
    },
    info: [fx('expeditionPay', 'Выплата за экспедицию', '%'), fx('salvage', 'Спасение при аварии вдали', '%')],
  },
};

function levelRequirements(key, spec, level) {
  const lead = spec.lead ?? 0;
  const era = Math.max(spec.minEra, level - 1 - lead);
  const out = era > 0 ? [{ era }] : [];
  if (level >= 2 && key !== 'energy') out.push({ building: 'energy', level: level - 1 });
  if (level >= 2) {
    for (const dep of [spec.dependsOn, spec.alsoDependsOn]) {
      if (dep) out.push({ building: dep, level: level - 1 });
    }
  }
  return out;
}

function buildBuilding(key, spec) {
  let previous = 0;
  const levels = LEVELS.map((level) => {
    const raw = nice(PRICE_SCALE * spec.cost * COST_GROWTH ** (level - 1));
    const cost = raw <= previous ? previous + 5 : raw;
    previous = cost;
    const use = key === 'energy'
      ? [1, 1, 2, 2, 3, 3][level - 1]
      : Math.max(1, Math.round(spec.weight * POWER_CURVE[level - 1]));
    const effects = {};
    for (const [name, curve] of Object.entries(spec.effects)) effects[name] = curve[level - 1];
    return {
      cost,
      data: Math.round(DATA_CURVE[level - 1] * spec.dataWeight),
      power: { use, supply: key === 'energy' ? ENERGY_SUPPLY[level - 1] : 0 },
      effects,
      requires: levelRequirements(key, spec, level),
    };
  });
  return {
    id: key,
    name: spec.name,
    desc: spec.desc,
    need: spec.need,
    minEra: spec.minEra,
    lead: spec.lead ?? 0,
    effectInfo: spec.info,
    levels,
  };
}

export const BUILDINGS = Object.fromEntries(Object.entries(SPEC).map(([key, spec]) => [key, buildBuilding(key, spec)]));
export const BUILDING_KEYS = Object.keys(BUILDINGS);
