// Выпуклый ЭЛТ-экран. Единственное место интерфейса, где разрешены кривизна стекла, виньетка, свечение и градиенты
// (тест-страж ui.browser.cjs исключает вызовы из этого модуля).
//
// Конвейер одного экрана (всё в offscreen, размеры в CSS-пикселях × dpr):
//   1. содержимое рисует сам интерфейс в холст content (его пиксельные шрифты и значки как обычно);
//   2. послесвечение: буфер люминофора затухает и принимает новое содержимое;
//   3. монохромный люминофор: яркость содержимого окрашивается цветом люминофора (E0 зелёный, E1 янтарный), E2 — цвет как есть;
//   4. выпуклость: сначала строки, затем столбцы масштабируются полосами (ступенчатая бочка, без сглаживания — пиксели остаются пикселями);
//   5. свечение (размытая копия складывается «светлее»), строчная развёртка, виньетка, блик стекла, скруглённые углы трубки;
//   6. лёгкое мерцание яркости.
// Неподвижные части (фон стекла, строки развёртки, виньетка, маска углов) рисуются один раз на размер и кэшируются.

const MAX_ENTRIES = 40;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function createCrt() {
  const entries = new Map();

  function entryFor(id, w, h, dpr, tokens, cc) {
    const key = `${id}`;
    let e = entries.get(key);
    const sig = `${Math.round(w)}x${Math.round(h)}@${dpr}|${tokens.kind}|${tokens.tint}|${tokens.curve}|${tokens.vignette}|${tokens.scan}|${cc}`;
    if (e && e.sig === sig) {
      entries.delete(key);
      entries.set(key, e);
      return e;
    }
    const pw = Math.ceil(w * dpr);
    const ph = Math.ceil(h * dpr);
    e = {
      sig,
      w: Math.round(w),
      h: Math.round(h),
      dpr,
      content: makeCanvas(pw, ph),
      buf: makeCanvas(pw, ph),
      tint: makeCanvas(pw, ph),
      tmp: makeCanvas(pw, ph),
      out: makeCanvas(pw, ph),
      overlay: null,
      mask: null,
      plate: null,
      cleared: true,
    };
    buildStatic(e, tokens, cc);
    entries.set(key, e);
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
    return e;
  }

  /** Фон стекла, строки развёртки, виньетка, блик и маска углов — один раз на размер. */
  function buildStatic(e, tokens, cc) {
    const { w, h, dpr } = e;
    const pw = Math.ceil(w * dpr);
    const ph = Math.ceil(h * dpr);
    const radius = Math.min(12, Math.max(cc * 3, Math.round(Math.min(w, h) * 0.06 * (tokens.curve > 0 ? 1 : 0.4))));
    // фон стекла: тёмный тон люминофора
    const plate = makeCanvas(pw, ph);
    const pg = plate.getContext('2d');
    pg.scale(dpr, dpr);
    const [tr, tg, tb] = hexToRgb(tokens.tint);
    pg.fillStyle = tokens.kind === 'color' ? '#050912' : `rgb(${Math.round(tr * 0.05)},${Math.round(tg * 0.07)},${Math.round(tb * 0.05)})`;
    pg.fillRect(0, 0, w, h);
    e.plate = plate;
    // наложение: развёртка, виньетка, блик
    const overlay = makeCanvas(pw, ph);
    const og = overlay.getContext('2d');
    og.scale(dpr, dpr);
    if (tokens.scan > 0) {
      og.fillStyle = `rgba(0,0,0,${tokens.scan})`;
      for (let y = 0; y < h; y += cc * 2) og.fillRect(0, y + cc, w, cc);
    }
    if (tokens.vignette > 0) {
      // затемняются только края и углы трубки: заголовки и строки в верхней части экрана остаются яркими
      const g = og.createRadialGradient(w / 2, h / 2, Math.hypot(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${tokens.vignette * 0.6})`);
      og.fillStyle = g;
      og.fillRect(0, 0, w, h);
    }
    if (tokens.curve > 0) {
      const hl = og.createLinearGradient(0, 0, w * 0.7, h * 0.7);
      hl.addColorStop(0, `rgba(255,255,255,${0.1 * tokens.curve})`);
      hl.addColorStop(0.35, 'rgba(255,255,255,0)');
      og.fillStyle = hl;
      og.fillRect(0, 0, w, h);
    }
    e.overlay = overlay;
    // маска трубки: скруглённые углы
    const mask = makeCanvas(pw, ph);
    const mg = mask.getContext('2d');
    mg.scale(dpr, dpr);
    mg.fillStyle = '#fff';
    mg.beginPath();
    mg.roundRect(0, 0, w, h, radius);
    mg.fill();
    e.mask = mask;
  }

  return {
    /**
     * Подготовить холст содержимого экрана id размером w×h (CSS px). Возвращает { g, entry }; g уже масштабирован под dpr,
     * начало координат — левый верхний угол экрана.
     */
    begin(id, w, h, dpr, tokens, cc) {
      const e = entryFor(id, w, h, dpr, tokens, cc);
      const g = e.content.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, e.content.width, e.content.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { g, entry: e };
    },

    /** Вывести экран на ctx в прямоугольник rect (CSS px). tokens — skin.crt; o: time, reduceMotion, cc. */
    compose(ctx, entry, rect, tokens, o = {}) {
      const e = entry;
      const { dpr } = e;
      const pw = e.content.width;
      const ph = e.content.height;
      const cc = o.cc || 2;
      const mono = tokens.kind === 'green' || tokens.kind === 'amber';
      const hasFilter = 'filter' in ctx;

      // 2. послесвечение
      const bg = e.buf.getContext('2d');
      bg.setTransform(1, 0, 0, 1, 0, 0);
      const persist = o.reduceMotion ? 0 : tokens.persist || 0;
      if (e.cleared || persist <= 0) {
        bg.clearRect(0, 0, pw, ph);
        e.cleared = false;
      } else {
        bg.globalCompositeOperation = 'destination-out';
        bg.fillStyle = `rgba(0,0,0,${1 - persist})`;
        bg.fillRect(0, 0, pw, ph);
        bg.globalCompositeOperation = 'source-over';
      }
      bg.drawImage(e.content, 0, 0);

      // 3. цвет люминофора
      const tg = e.tint.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.clearRect(0, 0, pw, ph);
      tg.globalCompositeOperation = 'source-over';
      if (mono && hasFilter) {
        tg.filter = 'grayscale(1) brightness(1.3) contrast(1.15)';
        tg.drawImage(e.buf, 0, 0);
        tg.filter = 'none';
        tg.globalCompositeOperation = 'multiply';
        tg.fillStyle = tokens.tint;
        tg.fillRect(0, 0, pw, ph);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(e.buf, 0, 0);
        tg.globalCompositeOperation = 'source-over';
      } else tg.drawImage(e.buf, 0, 0);

      // 4. выпуклость: полосы строк, затем столбцов
      const out = e.out.getContext('2d');
      out.setTransform(1, 0, 0, 1, 0, 0);
      out.globalCompositeOperation = 'source-over';
      out.imageSmoothingEnabled = false;
      out.clearRect(0, 0, pw, ph);
      out.drawImage(e.plate, 0, 0);
      let warped = e.tint;
      if (tokens.curve > 0) {
        const a = 0.065 * tokens.curve;
        const step = Math.max(1, Math.round(cc * 2 * dpr));
        const t2 = e.tmp.getContext('2d');
        t2.setTransform(1, 0, 0, 1, 0, 0);
        t2.imageSmoothingEnabled = false;
        t2.clearRect(0, 0, pw, ph);
        for (let y = 0; y < ph; y += step) {
          const v = ((y + step / 2) / ph) * 2 - 1;
          const k = 1 - a * v * v;
          const dw = pw * k;
          t2.drawImage(e.tint, 0, y, pw, step, (pw - dw) / 2, y, dw, step);
        }
        // столбцы: края сжимаются по высоте
        out.save();
        for (let x = 0; x < pw; x += step) {
          const u = ((x + step / 2) / pw) * 2 - 1;
          const k = 1 - a * u * u;
          const dh = ph * k;
          out.drawImage(e.tmp, x, 0, step, ph, x, (ph - dh) / 2, step, dh);
        }
        out.restore();
        warped = null;
      }
      if (warped) out.drawImage(warped, 0, 0);

      // 5. свечение, развёртка, виньетка
      if (tokens.glow > 0 && !o.reduceMotion) {
        // свечение дёшево: копия уменьшается вчетверо со сглаживанием и возвращается обратно «светлее» — получается размытие
        if (!e.glow) e.glow = makeCanvas(Math.max(2, Math.ceil(pw / 4)), Math.max(2, Math.ceil(ph / 4)));
        const gg = e.glow.getContext('2d');
        gg.setTransform(1, 0, 0, 1, 0, 0);
        gg.clearRect(0, 0, e.glow.width, e.glow.height);
        gg.imageSmoothingEnabled = true;
        gg.drawImage(e.out, 0, 0, e.glow.width, e.glow.height);
        out.save();
        out.globalCompositeOperation = 'lighter';
        out.globalAlpha = tokens.glow * 0.55;
        out.imageSmoothingEnabled = true;
        out.drawImage(e.glow, 0, 0, pw, ph);
        out.restore();
        out.imageSmoothingEnabled = false;
      }
      out.drawImage(e.overlay, 0, 0);
      // маска трубки
      out.globalCompositeOperation = 'destination-in';
      out.drawImage(e.mask, 0, 0);
      out.globalCompositeOperation = 'source-over';

      // 6. мерцание яркости
      const t = o.time || 0;
      const flick = o.reduceMotion || !tokens.flicker ? 1 : 1 - tokens.flicker * (0.5 + 0.5 * Math.sin(t * 61 + rect.x)) * (0.6 + 0.4 * Math.sin(t * 7.3));
      const prevAlpha = ctx.globalAlpha;
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = prevAlpha * flick;
      ctx.drawImage(e.out, 0, 0, pw, ph, rect.x, rect.y, e.w, e.h);
      ctx.globalAlpha = prevAlpha;
      ctx.imageSmoothingEnabled = prevSmooth;
    },
  };
}
