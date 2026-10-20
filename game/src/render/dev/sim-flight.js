// Стенд на настоящей симуляции: sim/flight.js + автопилот. Нужен, чтобы проверить рендер на реальном
// FlightState (поля, события, объекты). Подключается динамически, чтобы превью жило без sim.

export async function createSimFlight() {
  const sim = await import('../../sim/index.js');
  let flight = null;
  let pilot = null;
  let config = null;
  let seed = 1;
  let endedFor = 0;

  function start(opts) {
    const era = opts.era;
    const base = { radar: 1, beacons: 1, weather: 1, income: 1, fuelDropRate: 1.2, padSafety: 0.3 };
    const common = {
      seed, era, base, skin: 'classic', avionics: { predict: 2, assist: 0 }, weather: opts.weather ? opts.weather.kind : null,
    };
    const body = opts.body;
    const dest = new URLSearchParams(globalThis.location.search).get('dest');
    const trip = body === 'earth' && (dest === 'moon' || dest === 'mars') ? dest : null;
    const heavy = era >= 3 || body !== 'earth' || trip;
    config = heavy
      ? sim.heavyRocket({ ...common, destination: trip || body, start: body === 'earth' ? null : { body } })
      : sim.startRocket({ ...common, parachute: { level: 2 }, destination: 'earth' });
    flight = sim.createFlight(config);
    const mission = body !== 'earth' ? 'land' : heavy ? 'space' : 'hop';
    pilot = sim.createAutopilot({ skill: 0.9, mission, targetAlt: 380, seed });
    endedFor = 0;
    return flight;
  }

  return {
    get last() {
      return { flight, events: [] };
    },
    reset() {
      flight = null;
    },
    /** Шаг: dt секунд реального времени * opts.speed (ускорение для проверки длинных полётов). */
    update(dt, opts) {
      if (!flight || flight.cfg.era !== opts.era) start(opts);
      const events = [];
      if (flight.ended) {
        endedFor += dt;
        if (endedFor > 4) {
          seed += 1;
          start(opts);
        }
      } else {
        const total = dt * (opts.speed || 1);
        const h = 1 / 120;
        let left = total;
        while (left > 1e-6 && !flight.ended) {
          const step = Math.min(h, left);
          const input = pilot.next(flight, step);
          events.push(...sim.step(flight, input, step));
          left -= step;
        }
      }
      return { flight, config, events };
    },
  };
}
