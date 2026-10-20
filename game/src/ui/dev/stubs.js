// Временные заглушки чужих модулей (data / rules / sim / render / audio), чтобы интерфейс работал отдельно.
// Подключаются только если настоящий модуль не нашёлся (см. ui/bridge.js). Контракт: game/docs/ARCHITECTURE.md.

import { computeLayout } from '../layout.js';

// ---------- данные ----------

export const PART_IDS = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'parachute', 'avionics'];
export const BUILDING_IDS = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory', 'weather', 'control', 'radar', 'energy', 'observation', 'recovery'];

const BUILDING_ERA = { energy: 1, logistics: 1, factory: 1, weather: 1, radar: 2, control: 2, observation: 3, recovery: 3, gantry: 1 };
const ceil = Math.ceil;

const PART_REQ = {
  engine: (l) => [['service', ceil(l / 3)], ['factory', ceil(l / 6)]],
  tank: (l) => [['fuel', ceil(l / 3)]],
  hull: (l) => [['factory', ceil(l / 3)]],
  booster: () => [['gantry', 1]],
  capsule: (l) => [['rescue', ceil(l / 3)]],
  legs: (l) => [['beacons', ceil(l / 3)]],
  fins: (l) => [['service', ceil(l / 4)]],
  parachute: (l) => [['rescue', ceil(l / 4)]],
  avionics: (l) => [['control', ceil(l / 3)], ['radar', ceil(l / 4)]],
};

export const stubData = {
  ERAS: [1978, 1986, 1998, 2015, 2035, 2060].map((year, id) => ({ id, year, cap: { part: 3 * (id + 1), building: id + 1 } })),
  SHOP: [
    { id: 'chute', cost: 60 },
    { id: 'repair', cost: 90 },
    { id: 'canister', cost: 120 },
    { id: 'magnet', cost: 80 },
  ],
  SKINS: [
    { id: 'classic', cost: 0 },
    { id: 'sunset', cost: 400 },
    { id: 'frost', cost: 900 },
    { id: 'mint', cost: 1600 },
  ],
  ACHIEVEMENTS: [
    { id: 'first-flight', coins: 50 },
    { id: 'first-landing', coins: 120 },
    { id: 'altitude-1km', coins: 150 },
    { id: 'perfect', coins: 200 },
    { id: 'moon', coins: 3000 },
  ],
};

const buildingCost = (key, l) => Math.round(70 * 1.6 ** l * (key === 'energy' ? 0.7 : 1));
const partCost = (l) => Math.round(36 * 1.31 ** l);

export function createStubProfile() {
  return {
    v: 1,
    coins: 480,
    data: 6,
    era: 0,
    parts: Object.fromEntries(PART_IDS.map((k) => [k, 0])),
    buildings: Object.fromEntries(BUILDING_IDS.map((k) => [k, 0])),
    inventory: { chute: 1, repair: 1, canister: 0, magnet: 0 },
    skins: ['classic'],
    skin: 'classic',
    milestones: { maxAlt: 0, softLandings: 0, moonLanding: false, marsLanding: false },
    stats: { flights: 0, landings: 0, crashes: 0, perfect: 0, streak: 0, bestStreak: 0, distance: 0, earned: 0, rings: 0, pickups: 0, near: 0, storm: 0, moon: 0, mars: 0, parachutes: 0, saved: 0, airtime: 0 },
    achievements: [],
    contracts: { active: [], done: [], seed: 1 },
    settings: { master: 0.8, music: 0.6, sfx: 0.9, controlMode: 'arcade', reduceMotion: false, textScale: 1, colorblind: false, vibrate: true, touchLayout: 'right', tutorial: { done: false, step: 0 } },
  };
}

// ---------- правила ----------

const clone = (o) => JSON.parse(JSON.stringify(o));
const BNAME = {
  beacons: 'Стартовые маяки', gantry: 'Башня обслуживания', deluge: 'Охлаждение площадки', service: 'Сервисная команда', rescue: 'Спасательная станция',
  fuel: 'Топливный комплекс', logistics: 'Логистический терминал', factory: 'Производственный цех', weather: 'Метеостанция', control: 'Центр управления',
  radar: 'Радар слежения', energy: 'Энергетический узел', observation: 'Наблюдательный комплекс', recovery: 'Система возврата',
};

function buildingReqs(profile, key, level) {
  const out = [];
  const needEra = BUILDING_ERA[key] || 0;
  if (profile.era < needEra) out.push({ kind: 'era', era: needEra, text: `Откроется в эпохе ${[1978, 1986, 1998, 2015, 2035, 2060][needEra]}` });
  if (level > profile.era + 1) out.push({ kind: 'era', era: level - 1, text: 'Нужна следующая эпоха' });
  if (key !== 'energy' && level >= 3 && profile.buildings.energy < ceil(level / 2)) out.push({ kind: 'building', building: 'energy', level: ceil(level / 2), text: `Нужен «${BNAME.energy}» ур. ${ceil(level / 2)}` });
  return out;
}

export const stubRules = {
  getPartState(profile, id) {
    const level = profile.parts[id] || 0;
    const max = 18;
    const cap = 3 * (profile.era + 1);
    const nl = level + 1;
    const locked = [];
    let next = null;
    if (level < max) {
      next = { cost: partCost(nl), data: nl >= 4 ? Math.round(2 * 1.35 ** (nl - 3)) : 0, stats: { level: nl } };
      if (nl > cap) locked.push({ kind: 'era', era: profile.era + 1, text: 'Нужна следующая эпоха' });
      for (const [b, l] of PART_REQ[id](nl)) {
        if ((profile.buildings[b] || 0) < l) locked.push({ kind: 'building', building: b, level: l, text: `Нужна постройка «${BNAME[b]}» ур. ${l}` });
      }
      if (profile.coins < next.cost) locked.push({ kind: 'coins', need: next.cost, text: `Не хватает монет: ${next.cost - profile.coins}` });
      if (profile.data < next.data) locked.push({ kind: 'data', need: next.data, text: `Не хватает данных: ${next.data - profile.data}` });
    }
    return { level, max, cap, next, locked };
  },
  buyPart(profile, id) {
    const st = stubRules.getPartState(profile, id);
    if (!st.next || st.locked.length) return { ok: false, reasons: st.locked, profile };
    const p = clone(profile);
    p.coins -= st.next.cost;
    p.data -= st.next.data;
    p.parts[id] += 1;
    return { ok: true, reasons: [], profile: p };
  },
  getBuildingState(profile, key) {
    const level = profile.buildings[key] || 0;
    const max = 6;
    const nl = level + 1;
    const locked = [];
    let next = null;
    if (level < max) {
      next = { cost: buildingCost(key, nl), data: nl >= 3 ? nl * 2 : 0, power: nl * 2 };
      locked.push(...buildingReqs(profile, key, nl));
      if (profile.coins < next.cost) locked.push({ kind: 'coins', need: next.cost, text: `Не хватает монет: ${next.cost - profile.coins}` });
      if (profile.data < next.data) locked.push({ kind: 'data', need: next.data, text: `Не хватает данных: ${next.data - profile.data}` });
    }
    const use = level * 2;
    return { level, max, next, locked, power: { use, supply: key === 'energy' ? level * 8 : 0 } };
  },
  buyBuilding(profile, key) {
    const st = stubRules.getBuildingState(profile, key);
    if (!st.next || st.locked.length) return { ok: false, reasons: st.locked, profile };
    const p = clone(profile);
    p.coins -= st.next.cost;
    p.data -= st.next.data;
    p.buildings[key] += 1;
    return { ok: true, reasons: [], profile: p };
  },
  getEraState(profile) {
    const next = profile.era + 1;
    if (next > 5) return { era: profile.era, next: null, conditions: [], ok: false };
    const count = Object.values(profile.buildings).filter((l) => l >= next - 0).length;
    const need = [2, 4, 6, 8, 10][profile.era];
    const costCoins = [360, 1500, 5500, 18000, 60000][profile.era];
    const costData = [8, 40, 150, 480, 1300][profile.era];
    const mileAlt = [3000, 30000, 100000][profile.era];
    const mileOk = profile.era <= 2 ? profile.milestones.maxAlt >= mileAlt && (profile.era > 0 || profile.milestones.softLandings > 0) : profile.era === 3 ? profile.milestones.moonLanding : profile.milestones.marsLanding;
    const conditions = [
      { kind: 'coins', have: profile.coins, need: costCoins, ok: profile.coins >= costCoins, text: `Монеты: ${profile.coins} / ${costCoins}` },
      { kind: 'data', have: profile.data, need: costData, ok: profile.data >= costData, text: `Данные: ${profile.data} / ${costData}` },
      { kind: 'buildings', have: count, need, ok: count >= need, text: `Построек уровня ${next}+: ${count} / ${need}` },
      { kind: 'milestone', ok: mileOk, text: ['Мягкая посадка и высота 3 км', 'Высота 30 км', 'Высота 100 км', 'Посадка на Луне', 'Посадка на Марсе'][profile.era] },
    ];
    return { era: profile.era, next, conditions, ok: conditions.every((c) => c.ok), cost: { coins: costCoins, data: costData } };
  },
  advanceEra(profile) {
    const st = stubRules.getEraState(profile);
    if (!st.ok) return { ok: false, reasons: st.conditions.filter((c) => !c.ok), profile };
    const p = clone(profile);
    p.coins -= st.cost.coins;
    p.data -= st.cost.data;
    p.era += 1;
    return { ok: true, reasons: [], profile: p };
  },
  powerBalance(profile) {
    let supply = 12;
    let demand = 0;
    for (const k of BUILDING_IDS) {
      const l = profile.buildings[k] || 0;
      demand += l * 2;
      if (k === 'energy') supply += l * 8;
    }
    return { supply, demand, ratio: demand ? Math.min(1, supply / demand) : 1 };
  },
  deriveRocket(profile) {
    const p = profile.parts;
    return {
      thrust: 1.5 + p.engine * 0.18,
      fuelCapacity: 100 + p.tank * 24,
      hp: 100 + p.hull * 30,
      landingSpeed: 0.9 + p.legs * 0.12,
      turnRate: 1 + p.fins * 0.1,
      chute: p.parachute,
      predict: p.avionics >= 6 ? 2 : p.avionics >= 2 ? 1 : 0,
      boosterFuel: p.booster * 40,
      capsuleFuel: p.capsule * 12,
    };
  },
  deriveBase(profile) {
    const b = profile.buildings;
    return { income: 1 + b.logistics * 0.04, radar: Math.min(1, b.radar / 3), beacons: Math.min(1, b.beacons / 3), repairOnLand: b.service * 0.08, dataMult: 1 + b.observation * 0.1 };
  },
  availableDestinations(profile) {
    const moonOk = profile.era >= 3 && profile.buildings.control >= 1 && profile.buildings.radar >= 1;
    return [
      { id: 'earth', ok: true, reasons: [] },
      { id: 'moon', ok: moonOk, reasons: moonOk ? [] : ['Нужна эпоха 2015, Центр управления и Радар слежения'] },
      { id: 'mars', ok: false, reasons: ['Сначала мягкая посадка на Луне'] },
    ];
  },
  makeFlightConfig(profile, { destination = 'earth', consumables = {}, seed = 1 } = {}) {
    const d = stubRules.deriveRocket(profile);
    const base = stubRules.deriveBase(profile);
    return {
      seed,
      era: profile.era,
      destination,
      skin: profile.skin,
      stages: [{ id: 'core', thrust: d.thrust, fuel: d.fuelCapacity, burnRate: 1, mass: 1, turn: d.turnRate }],
      hull: { hp: d.hp, debrisResist: 0 },
      legs: { vTol: d.landingSpeed, hTol: 0.7, angTol: 0.28 },
      fins: { turn: d.turnRate, dragCut: 0 },
      parachute: { level: d.chute },
      avionics: { predict: d.predict, assist: 0 },
      base: { radar: base.radar, beacons: base.beacons, weather: 0, income: base.income, fuelDropRate: 1, repairOnLand: base.repairOnLand, rescueRefund: 0, padSafety: 0, dataMult: base.dataMult, perfectBonus: 1 },
      consumables: { chute: 0, repair: 0, canister: 0, magnet: 0, ...consumables },
      transferCost: { moon: 0.5, mars: 0.8 },
    };
  },
  settleFlight(profile, result) {
    const p = clone(profile);
    const coins = Math.round(result.coinsPicked + result.maxAlt * 0.2 + (result.outcome === 'landed' ? 40 + (result.perfect ? 30 : 0) : 0));
    const data = result.maxAlt > 300 ? 1 + Math.round(result.maxAlt / 800) : 0;
    p.coins += coins;
    p.data += data;
    p.stats.flights += 1;
    if (result.outcome === 'landed') {
      p.stats.landings += 1;
      p.milestones.softLandings += 1;
    } else if (result.outcome === 'crashed') p.stats.crashes += 1;
    p.milestones.maxAlt = Math.max(p.milestones.maxAlt, Math.round(result.maxAlt * 10));
    for (const k of Object.keys(result.used || {})) if (result.used[k]) p.inventory[k] = Math.max(0, (p.inventory[k] || 0) - 1);
    return { profile: p, report: { coins, data } };
  },
  listContracts() {
    return [];
  },
};

// ---------- симуляция ----------

export const stubSim = {
  createFlight(config) {
    const stage = config.stages[0];
    return {
      phase: 'pad', time: 0, body: config.destination, x: 0, y: 0, vx: 0, vy: 0, angle: 0, av: 0, throttle: 0, alt: 0, speed: 0,
      stageIndex: 0, stages: [{ id: stage.id, fuel: stage.fuel, maxFuel: stage.fuel }], fuel: stage.fuel, maxFuel: stage.fuel,
      hp: config.hull.hp, maxHp: config.hull.hp, coins: 0, rcs: { left: 0, right: 0 }, atmo: 1, weather: { kind: 'clear', wind: 0.4, storm: 0 },
      objects: [], pad: { x: 0, w: 60 }, landing: { ...config.legs, ok: false }, canTransfer: false, predict: null, zone: 'low-air',
      maxAlt: 0, _cfg: config, _events: [], _used: { ...config.consumables }, _pickups: 0,
    };
  },
  step(s, input, dt) {
    const ev = [];
    if (s.phase === 'landed' || s.phase === 'crashed') return ev;
    const cfg = s._cfg;
    const g = 0.98;
    const thrust = cfg.stages[0].thrust;
    const want = s.fuel > 0 ? input.throttle : 0;
    s.throttle += (want - s.throttle) * Math.min(1, dt * 6);
    if (s.phase === 'pad' && s.throttle > 0.3) {
      s.phase = 'ascent';
      ev.push({ type: 'liftoff' });
    }
    if (s.phase === 'pad') return ev;
    s.av += (input.tilt * 1.4 - s.av) * Math.min(1, dt * 5);
    s.angle += s.av * dt;
    const burn = s.throttle * dt * 1.1;
    s.fuel = Math.max(0, s.fuel - burn);
    s.stages[0].fuel = s.fuel;
    if (s.fuel <= 0 && burn > 0) ev.push({ type: 'fuel-empty' });
    const a = s.throttle * thrust * g * 1.0;
    s.vx += Math.sin(s.angle) * a * dt;
    s.vy += (-Math.cos(s.angle) * a + g) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.alt = -s.y;
    s.speed = Math.hypot(s.vx, s.vy);
    s.maxAlt = Math.max(s.maxAlt, s.alt);
    s.time += dt;
    s.atmo = Math.max(0, 1 - s.alt / 10000);
    s.canTransfer = s.alt > 1500 && cfg.destination !== 'earth';
    if (s.alt <= 0 && s.time > 0.3) {
      s.y = 0;
      s.alt = 0;
      const v = Math.abs(s.vy);
      const ok = v <= cfg.legs.vTol * 1.0 && Math.abs(s.vx) <= cfg.legs.hTol && Math.abs(s.angle) <= cfg.legs.angTol;
      s.landing.ok = ok;
      s.lastTouch = { v, h: Math.abs(s.vx), ang: Math.abs(s.angle) };
      s.phase = ok ? 'landed' : 'crashed';
      s.vx = s.vy = 0;
      ev.push(ok ? { type: 'landed', perfect: v < 0.3 } : { type: 'crashed', reason: 'speed' });
    }
    return ev;
  },
  summarize(s) {
    const done = s.phase === 'landed' || s.phase === 'crashed';
    const lt = s.lastTouch || { v: 0, h: 0, ang: 0 };
    return {
      outcome: s.phase === 'landed' ? 'landed' : s.phase === 'crashed' ? 'crashed' : 'abandoned',
      perfect: s.phase === 'landed' && lt.v < 0.3, destination: s._cfg.destination, maxAlt: s.maxAlt, distance: Math.abs(s.x), time: s.time,
      fuelLeft01: s.fuel / s.maxFuel, hpLeft01: s.hp / s.maxHp, coinsPicked: s.coins, rings: 0, pickups: s._pickups, near: 0, stormTime: 0, usedChute: false,
      reason: done && s.phase === 'crashed' ? 'speed' : '', landing: lt, used: s._used,
    };
  },
};

// ---------- аудио ----------

export function createNullAudio() {
  const noop = () => {};
  return { unlock: noop, setVolumes: noop, setMuted: noop, update: noop, sfx: noop, music: { set: noop }, suspend: noop, resume: noop, stub: true };
}

// ---------- рендер ----------

const ANCHORS = { beacons: [-92, 4], gantry: [150, 12], deluge: [235, 8], service: [335, 12], rescue: [445, 14], fuel: [560, 16], logistics: [685, 12], factory: [815, 16], weather: [760, 92], control: [905, 78], radar: [1035, 96], energy: [1085, 30], observation: [1180, 102], recovery: [1210, 14] };

export function createStubRenderer() {
  const camera = (L) => {
    const s = L.portrait ? L.w / 620 : L.h / 360;
    return { s, ox: L.portrait ? L.w * 0.32 : L.w * 0.18, oy: L.h * (L.portrait ? 0.42 : 0.5) };
  };
  const toScreen = (c, x, y) => [c.ox + x * c.s, c.oy - y * c.s];
  return {
    stub: true,
    layout: (w, h, dpr, safe) => computeLayout(w, h, dpr, safe),
    events() {},
    hub: {
      draw(ctx, { profile, time, layout: L }) {
        const g = ctx.createLinearGradient(0, 0, 0, L.h);
        g.addColorStop(0, '#2d5a9e');
        g.addColorStop(0.55, '#8ec5e8');
        g.addColorStop(0.56, '#2f7fb3');
        g.addColorStop(1, '#14466e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, L.w, L.h);
        const c = camera(L);
        const [ix, iy] = toScreen(c, -330, 0);
        ctx.fillStyle = '#c9b27a';
        ctx.fillRect(ix, iy, 1650 * c.s, 120 * c.s);
        ctx.fillStyle = '#5a8a3c';
        ctx.fillRect(ix, iy, 1650 * c.s, 14 * c.s);
        const [px, py] = toScreen(c, 0, 0);
        ctx.fillStyle = '#777';
        ctx.fillRect(px - 50 * c.s, py - 4 * c.s, 100 * c.s, 8 * c.s);
        // ракета на столе
        ctx.fillStyle = '#e8e8ee';
        ctx.fillRect(px - 6 * c.s, py - 70 * c.s, 12 * c.s, 66 * c.s);
        ctx.fillStyle = '#d33';
        ctx.fillRect(px - 6 * c.s, py - 80 * c.s, 12 * c.s, 10 * c.s);
        for (const [key, level] of Object.entries(profile.buildings)) {
          if (!level) continue;
          const a = ANCHORS[key];
          const [bx, by] = toScreen(c, a[0], a[1]);
          const h = (24 + level * 8) * c.s;
          ctx.fillStyle = `hsl(${(BUILDING_IDS.indexOf(key) * 47) % 360} 35% 55%)`;
          ctx.fillRect(bx - 16 * c.s, by - h, 32 * c.s, h);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(bx - 12 * c.s, by - h + 4 * c.s, 8 * c.s, 6 * c.s);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 3; i++) ctx.fillRect(((time * 14 + i * 190) % (L.w + 100)) - 60, 40 + i * 26, 60, 12);
      },
      hitTest(x, y, { profile, layout: L }) {
        const c = camera(L);
        for (const [key, level] of Object.entries(profile.buildings)) {
          if (!level) continue;
          const a = ANCHORS[key];
          const [bx, by] = toScreen(c, a[0], a[1]);
          const h = (24 + level * 8) * c.s;
          if (x > bx - 20 * c.s && x < bx + 20 * c.s && y > by - h && y < by + 6 * c.s) return key;
        }
        const [px, py] = toScreen(c, 0, 0);
        if (Math.abs(x - px) < 24 * c.s && y > py - 90 * c.s && y < py) return 'rocket';
        return null;
      },
    },
    flight: {
      draw(ctx, { flight: f, layout: L }) {
        const k = Math.min(1, f.alt / 12000);
        const g = ctx.createLinearGradient(0, 0, 0, L.h);
        g.addColorStop(0, k > 0.6 ? '#05060f' : '#2d5a9e');
        g.addColorStop(1, k > 0.9 ? '#0a1030' : '#9fd0ee');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, L.w, L.h);
        const a = L.rocketAnchor;
        const scale = L.portrait ? L.w / 360 : L.h / 400;
        const groundY = a.y + f.alt * scale * 1.2;
        ctx.fillStyle = '#4c7a38';
        ctx.fillRect(0, groundY, L.w, L.h);
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(f.angle);
        ctx.fillStyle = '#e8e8ee';
        ctx.fillRect(-5 * scale, -30 * scale, 10 * scale, 40 * scale);
        ctx.fillStyle = '#d33';
        ctx.fillRect(-5 * scale, -38 * scale, 10 * scale, 8 * scale);
        if (f.throttle > 0.02) {
          ctx.fillStyle = '#ffb627';
          ctx.fillRect(-3 * scale, 10 * scale, 6 * scale, 22 * scale * f.throttle);
        }
        ctx.restore();
      },
    },
  };
}
