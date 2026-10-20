// Публичный вход модуля render (контракт ARCHITECTURE §9).
//
//   const assets = await loadAssets(manifest);
//   const renderer = createRenderer(canvas, assets);
//   renderer.hub.draw(ctx, { profile, time, layout });
//   renderer.flight.draw(ctx, { flight, config, time, layout, settings });
//   renderer.events(flightEvents);
//   renderer.layout(w, h, dpr, safeInsets);

import * as manifest from './manifest.js';
import { loadAssets } from './assets.js';
import { createPainter } from './painter.js';
import { computeLayout } from './layout.js';
import { createHub } from './hub.js';

export { manifest, loadAssets, computeLayout };

export function createRenderer(canvas, assets) {
  const painter = createPainter(assets);
  const hub = createHub(painter);

  return {
    canvas,
    assets,
    painter,
    hub,
    layout(w, h, dpr, safe) {
      return computeLayout(w, h, dpr, safe);
    },
  };
}
