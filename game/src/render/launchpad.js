// Стартовый стол на острове: плита, опоры, огневой канал. Общий для хаба и полёта.
// Поверхность плиты — y = 0 (там стоит ракета); сама плита уходит вниз до y = 6.

import { clamp } from './util.js';
import { fillWorldRect } from './painter.js';

const TABLE_PALETTES = [
  ['#5b5649', '#8a826c', '#b3a98a'],
  ['#4d555c', '#7b858a', '#b3b6ad'],
  ['#3d4c58', '#64767f', '#b1bcb8'],
  ['#34495a', '#5f7b88', '#bcc8c4'],
  ['#2b4452', '#55808a', '#c0d0cd'],
  ['#24404d', '#4f8892', '#cadbd6'],
];

export const TABLE_HALF_WIDTH = 34;

export function drawLaunchTable(ctx, view, era) {
  const colors = TABLE_PALETTES[clamp(era | 0, 0, 5)];
  fillWorldRect(ctx, view, -TABLE_HALF_WIDTH, 0, TABLE_HALF_WIDTH * 2, 6, colors[0]);
  fillWorldRect(ctx, view, -TABLE_HALF_WIDTH, 0, TABLE_HALF_WIDTH * 2, 2, colors[2]);
  fillWorldRect(ctx, view, -11, 1, 22, 5, '#0d1620');
  for (const side of [-1, 1]) {
    fillWorldRect(ctx, view, side * 22 - 3, -9, 6, 9, colors[1]);
    fillWorldRect(ctx, view, side * 22 - 4, -10, 8, 2, colors[2]);
    fillWorldRect(ctx, view, side * 22 - 1, -12, 2, 2, '#d8523f');
  }
}

/** Миганием огней по краям посадочной зоны (маяки): lit — маяки куплены. */
export function drawPadLights(ctx, view, centerX, half, lit, time, ok) {
  const phase = Math.floor(time * 3) % 4;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const x = centerX + side * half;
    fillWorldRect(ctx, view, x - 1, -14, 2, 14, '#586f73');
    const on = lit ? phase === (i * 2) % 4 || phase === (i * 2 + 1) % 4 : phase === 0;
    const color = on ? (ok ? '#c9efcf' : '#ffd98a') : '#586f73';
    fillWorldRect(ctx, view, x - 2, -17, 4, 4, color);
  }
}
