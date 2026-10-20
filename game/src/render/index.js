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
import { createFlightRenderer } from './flight.js';

export { manifest, loadAssets, computeLayout };

export function createRenderer(canvas, assets) {
  const painter = createPainter(assets);
  const shared = { profile: null };
  const hub = createHub(painter, shared);
  const flight = createFlightRenderer(painter, shared);

  return {
    canvas,
    assets,
    painter,
    hub,
    flight,
    layout(w, h, dpr, safe) {
      return computeLayout(w, h, dpr, safe);
    },
    /** События sim для частиц, тряски и вспышек; flight (необязательно) — состояние для позиции эффектов. */
    events(list, flightState) {
      flight.events(list, flightState);
    },
  };
}
