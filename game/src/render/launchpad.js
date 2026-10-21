// Пусковой стол на карте острова и огни посадочной зоны. Общие для хаба и полёта.
// Карта в мировых единицах: центр стола — (0, 0), там стоит ракета (низ ракеты в этой точке).

import { clamp } from './util.js';
import { fillWorldRect } from './painter.js';

const MOUNT_PALETTES = [
  { rim: '#2b333c', plate: '#4c5660', steel: '#6c7782', accent: '#d9902f' },
  { rim: '#2a323b', plate: '#4a5963', steel: '#6f7b86', accent: '#e0953a' },
  { rim: '#26303b', plate: '#455867', steel: '#738391', accent: '#e8a043' },
  { rim: '#232f3c', plate: '#41596b', steel: '#7a8c9b', accent: '#e0b04c' },
  { rim: '#1f2d3b', plate: '#3d5c70', steel: '#82979f', accent: '#58d3d8' },
  { rim: '#1b2b3a', plate: '#3a6076', steel: '#8aa0a8', accent: '#6ee7e0' },
];

export const MOUNT_RADIUS = 31; // ед. мира: опорное кольцо под ракетой

/**
 * Пусковой стол: кольцо с насечкой, огненное отверстие, прижимы, предупреждающие дуги.
 * Рисуется поверх запечённого бетона острова, под ракетой.
 */
export function drawLaunchMount(ctx, view, era, time) {
  const palette = MOUNT_PALETTES[clamp(era | 0, 0, 5)];
  const cx = view.sx(0);
  const cy = view.sy(0);
  const s = view.S;
  const rx = MOUNT_RADIUS * s;
  const ry = rx * 0.86;
  ctx.save();
  // тень под кольцом
  ctx.fillStyle = 'rgba(8,12,18,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 2 * s, cy + 3 * s, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // обод и плита
  ctx.fillStyle = palette.rim;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.plate;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  // предупреждающие дуги по ободу
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(1, s * 2.2);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.12;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.94, ry * 0.94, 0, a0, a0 + 0.38);
    ctx.stroke();
  }
  // насечка плиты
  ctx.strokeStyle = palette.steel;
  ctx.lineWidth = Math.max(1, s * 0.8);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    ctx.moveTo(cx - rx * 0.78, cy + (i * ry) / 4.4);
    ctx.lineTo(cx + rx * 0.78, cy + (i * ry) / 4.4);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // огненное отверстие
  ctx.fillStyle = '#0c1118';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 1.2, rx * 0.36, ry * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.steel;
  ctx.lineWidth = Math.max(1, s * 1.1);
  ctx.stroke();
  ctx.restore();
  // болты и прижимы
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(a) * MOUNT_RADIUS * 0.62;
    const by = Math.sin(a) * MOUNT_RADIUS * 0.54;
    fillWorldRect(ctx, view, bx - 2, by - 2, 4, 4, palette.steel);
    fillWorldRect(ctx, view, bx - 1, by - 1, 2, 2, palette.rim);
  }
  const blink = Math.floor(time * 2) % 2 === 0;
  fillWorldRect(ctx, view, -MOUNT_RADIUS * 0.8 - 1, -1, 2, 2, blink ? palette.accent : palette.rim);
  fillWorldRect(ctx, view, MOUNT_RADIUS * 0.8 - 1, -1, 2, 2, blink ? palette.rim : palette.accent);
}

/** Миганием огней по краям посадочной зоны на Луне/Марсе: lit — маяки куплены. */
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

/**
 * Посадочная зона на карте острова: пунктирное кольцо и четыре огня по сторонам (маяки).
 * alpha — видимость; ok — состояние допустимо для посадки.
 */
export function drawPadRing(ctx, view, pad, lit, ok, time, alpha) {
  if (alpha <= 0.01) return;
  const cx = view.sx(pad.x);
  const cy = view.sy(0);
  const rx = pad.half * view.S;
  const ry = rx * 0.86;
  const color = ok ? '150,240,170' : '255,214,120';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([view.S * 9, view.S * 6]);
  ctx.lineDashOffset = -time * view.S * 10;
  // тёмная подложка и яркая линия: кольцо читается и на светлом бетоне, и на траве
  ctx.strokeStyle = 'rgba(6,20,12,0.55)';
  ctx.lineWidth = Math.max(3, view.S * 3.6);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${color},1)`;
  ctx.lineWidth = Math.max(2, view.S * 2.2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const phase = Math.floor(time * 3) % 4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const on = lit ? (i + phase) % 4 < 2 : phase === i;
    ctx.fillStyle = on ? `rgba(${color},1)` : 'rgba(80,100,104,0.8)';
    const d = Math.max(3, view.S * 3);
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx - d / 2), Math.round(cy + Math.sin(a) * ry - d / 2), d, d);
  }
  ctx.restore();
}
