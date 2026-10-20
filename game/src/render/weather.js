// Погода для рендера: приводит разные формы weather к единым долям.
//   Состояние sim:  { kind, cloud, rain, storm, wind, flash }  — числа 0..1, storm уже учитывает высоту.
//   Прогноз хаба:   { kind, wind, storm? }                     — только вид погоды.

import { clamp } from './util.js';

const KIND_MOOD = {
  clear: { cloud: 0.3, rain: 0, storm: 0 },
  cloudy: { cloud: 0.75, rain: 0, storm: 0 },
  overcast: { cloud: 0.75, rain: 0, storm: 0 },
  rain: { cloud: 0.95, rain: 0.7, storm: 0.25 },
  storm: { cloud: 1, rain: 1, storm: 1 },
  dust: { cloud: 1, rain: 0, storm: 1 },
};

/**
 * Возвращает { cloud, rain, storm, wind, dust, flash }: доли 0..1 (wind со знаком, ед./с).
 * Если в weather есть числовые cloud/rain/storm (состояние sim) — берутся они, иначе значения по kind.
 */
export function weatherMood(weather, out) {
  const target = out || { cloud: 0, rain: 0, storm: 0, wind: 0, dust: 0, flash: 0 };
  let cloud = KIND_MOOD.clear.cloud;
  let rain = 0;
  let storm = 0;
  let wind = 0;
  let flash = 0;
  const kind = weather ? weather.kind : 'clear';
  if (weather && kind !== 'none') {
    const preset = KIND_MOOD[kind] || KIND_MOOD.clear;
    const numeric = typeof weather.cloud === 'number';
    cloud = numeric ? clamp(weather.cloud, 0, 1) : preset.cloud;
    rain = numeric ? clamp(Number(weather.rain) || 0, 0, 1) : preset.rain;
    const stormValue = typeof weather.storm === 'boolean' ? (weather.storm ? 1 : 0) : clamp(Number(weather.storm) || 0, 0, 1);
    storm = numeric ? stormValue : Math.max(preset.storm, stormValue);
    wind = Number(weather.wind) || 0;
    flash = Number(weather.flash) || 0;
    if (!numeric) {
      if (storm > cloud) cloud = storm;
      if (storm > 0.5 && rain < storm) rain = storm;
    }
  }
  target.cloud = cloud;
  target.rain = rain;
  target.storm = storm;
  target.wind = wind;
  target.dust = kind === 'dust' ? Math.max(storm, 0.35) : 0;
  target.flash = flash;
  return target;
}
