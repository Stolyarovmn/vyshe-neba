// Заглушки только для случая, когда настоящий рендер или аудио недоступны (см. ui/bridge.js).
// Рабочий путь игры их не использует, пока render/ отдаёт hub, flight и events.

import { computeLayout } from '../layout.js';

export function createNullAudio() {
  const noop = () => {};
  return { unlock: noop, setVolumes: noop, setMuted: noop, update: noop, sfx: noop, events: noop, music: { set: noop }, suspend: noop, resume: noop, stub: true };
}

const ANCHORS = { beacons: [-92, 4], gantry: [150, 12], deluge: [235, 8], service: [335, 12], rescue: [445, 14], fuel: [560, 16], logistics: [685, 12], factory: [815, 16], weather: [760, 92], control: [905, 78], radar: [1035, 96], energy: [1085, 30], observation: [1180, 102], recovery: [1210, 14] };

export function createStubRenderer() {
  const camera = (L) => {
    const s = L.portrait ? L.w / 620 : L.h / 360;
    return { s, ox: L.portrait ? L.w * 0.32 : L.w * 0.18, oy: L.h * (L.portrait ? 0.42 : 0.5) };
  };
  const toScreen = (c, x, y) => [c.ox + x * c.s, c.oy - y * c.s];
  const keys = Object.keys(ANCHORS);
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
        ctx.fillStyle = '#e8e8ee';
        ctx.fillRect(px - 6 * c.s, py - 70 * c.s, 12 * c.s, 66 * c.s);
        ctx.fillStyle = '#d33';
        ctx.fillRect(px - 6 * c.s, py - 80 * c.s, 12 * c.s, 10 * c.s);
        for (const [key, level] of Object.entries(profile.buildings)) {
          if (!level) continue;
          const a = ANCHORS[key];
          const [bx, by] = toScreen(c, a[0], a[1]);
          const h = (24 + level * 8) * c.s;
          ctx.fillStyle = `hsl(${(keys.indexOf(key) * 47) % 360} 35% 55%)`;
          ctx.fillRect(bx - 16 * c.s, by - h, 32 * c.s, h);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 3; i++) ctx.fillRect(((time * 14 + i * 190) % (L.w + 100)) - 60, 40 + i * 26, 60, 12);
      },
      hitTest(x, y, { profile, layout: L } = {}) {
        const c = camera(L);
        for (const [key, level] of Object.entries(profile.buildings)) {
          if (!level) continue;
          const a = ANCHORS[key];
          const [bx, by] = toScreen(c, a[0], a[1]);
          const h = (24 + level * 8) * c.s;
          if (x > bx - 20 * c.s && x < bx + 20 * c.s && y > by - h && y < by + 6 * c.s) return key;
        }
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
        const groundY = a.y + f.alt * scale * 0.5;
        ctx.fillStyle = '#4c7a38';
        ctx.fillRect(0, groundY, L.w, L.h);
        for (const o of f.objects || []) {
          const sx = a.x + (o.x - f.x) * scale * 0.5;
          const sy = a.y - (-o.y - f.alt) * scale * 0.5;
          if (sx < -20 || sx > L.w + 20 || sy < -20 || sy > L.h + 20) continue;
          ctx.fillStyle = o.hazard ? '#d4452b' : o.kind === 'fuel' ? '#62e38d' : o.kind === 'ring' ? '#52d8ff' : '#ffd23f';
          ctx.fillRect(sx - 4, sy - 4, 8, 8);
        }
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
