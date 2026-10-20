// Collectibles: coins, fuel cans, repair kits and boost rings.

import { chance, nextFloat, range } from './rng.js';

export const COIN_VALUE = 4;
export const PICKUP_RADIUS = { coin: 28, fuel: 29, repair: 29 }; // reach of the rocket around its centre
export const MAGNET_BONUS = 90;
export const RING_HALF_WIDTH = [55, 85]; // rings are flat horizontal gates the rocket flies up through
export const RING_IMPULSE = 11; // speed added along the velocity when flying through a ring
export const RING_BOOST_TIME = 3; // seconds of a slightly raised speed limit
export const FUEL_PICKUP_SHARE = 0.126; // of the active tank
export const CANISTER_SHARE = 0.285; // of the active tank
export const REPAIR_AMOUNT = 40;
export const CONSUMABLE_REPAIR = 80;

const COIN_R = 9;
const ITEM_R = 15;
const COIN_SPACING = 30;

function makeItem(ctx, kind, x, alt, r) {
  return { id: ctx.nextId(), kind, hazard: false, x, y: -alt, r, active: true };
}

function coinTrail(rs, ctx, out) {
  const count = 4 + Math.floor(nextFloat(rs) * 3);
  const x = ctx.x0 + range(rs, 60, ctx.width - 60 - count * COIN_SPACING);
  const alt = ctx.alt0 + range(rs, 40, ctx.height - 40);
  const slope = range(rs, -0.35, 0.35);
  for (let i = 0; i < count; i++) {
    out.push(makeItem(ctx, 'coin', x + i * COIN_SPACING, alt + i * COIN_SPACING * slope + Math.sin(i * 0.9) * 14, COIN_R));
  }
}

// ctx: { bodyId, ix, iy, x0, alt0, width, height, padX, fuelDropRate, nextId }
export function spawnPickups(rs, ctx) {
  const out = [];
  coinTrail(rs, ctx, out);
  if (chance(rs, 0.5)) coinTrail(rs, ctx, out);

  const ringX = ctx.x0 + range(rs, 90, ctx.width - 90);
  const ringAlt = ctx.alt0 + range(rs, 60, ctx.height - 60);
  const nearPad = ringAlt < 300 && Math.abs(ringX - ctx.padX) < 150;
  const halfWidth = range(rs, RING_HALF_WIDTH[0], RING_HALF_WIDTH[1]);
  if (!nearPad) out.push({ ...makeItem(ctx, 'ring', ringX, ringAlt, halfWidth), orient: 'horizontal', halfWidth });

  const fuelRoll = nextFloat(rs);
  const fuelX = ctx.x0 + range(rs, 60, ctx.width - 60);
  const fuelAlt = ctx.alt0 + range(rs, 50, ctx.height - 50);
  if (fuelRoll < Math.min(0.9, 0.35 * ctx.fuelDropRate)) out.push(makeItem(ctx, 'fuel', fuelX, fuelAlt, ITEM_R));

  const repairRoll = nextFloat(rs);
  const repairX = ctx.x0 + range(rs, 80, ctx.width - 80);
  const repairAlt = ctx.alt0 + range(rs, 50, ctx.height - 50);
  if (repairRoll < 0.13) out.push(makeItem(ctx, 'repair', repairX, repairAlt, ITEM_R));

  // A few coins right above the pad so the very first hop already pays a little.
  if (ctx.bodyId === 'earth' && ctx.ix === 0 && ctx.iy === 0) {
    for (const alt of [70, 95, 120]) out.push(makeItem(ctx, 'coin', 6, alt, COIN_R));
  }
  return out;
}
