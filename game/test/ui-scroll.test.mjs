// Кинетическая прокрутка: перетаскивание, инерция, границы, упругий возврат.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScroll, setRange, dragStart, dragMove, dragEnd, update, wheel, reveal } from '../src/ui/scroll.js';

function settle(s, seconds = 6, dt = 1 / 60) {
  let t = 0;
  while (t < seconds && update(s, dt)) t += dt;
  return t;
}

test('диапазон: max = содержимое − окно, не меньше нуля', () => {
  const s = createScroll();
  setRange(s, 1000, 300);
  assert.equal(s.max, 700);
  setRange(s, 100, 300);
  assert.equal(s.max, 0);
});

test('перетаскивание сдвигает содержимое вслед за пальцем', () => {
  const s = createScroll();
  setRange(s, 1000, 300);
  dragStart(s);
  dragMove(s, -50, 0.01); // палец вверх на 50 px → смещение растёт
  dragMove(s, -30, 0.02);
  assert.equal(s.offset, 80);
});

test('инерция: быстрый бросок продолжает движение и затухает до остановки', () => {
  const s = createScroll();
  setRange(s, 5000, 300);
  dragStart(s);
  for (let i = 1; i <= 8; i++) dragMove(s, -30, i * 0.01); // 3000 px/с
  const before = s.offset;
  dragEnd(s);
  assert.ok(s.vel > 1500, `скорость отпускания ${s.vel}`);
  const t = settle(s);
  assert.ok(s.offset > before + 200, 'содержимое проехало по инерции');
  assert.ok(t < 5, 'инерция затухла');
  assert.equal(s.vel, 0);
});

test('медленное отпускание не даёт инерции', () => {
  const s = createScroll();
  setRange(s, 5000, 300);
  dragStart(s);
  dragMove(s, -10, 0);
  dragMove(s, 0, 0.2);
  dragEnd(s);
  assert.equal(s.vel, 0);
});

test('граница: смещение внутри диапазона после броска к краю', () => {
  const s = createScroll();
  setRange(s, 600, 300);
  dragStart(s);
  for (let i = 1; i <= 8; i++) dragMove(s, -60, i * 0.01);
  dragEnd(s);
  settle(s);
  assert.ok(s.offset >= 0 && s.offset <= 300 + 0.5, `offset ${s.offset}`);
  assert.ok(Math.abs(s.offset - 300) < 0.5, 'упёрлись в нижний край');
});

test('выход за верхнюю границу при перетаскивании сопротивляется и пружинит обратно', () => {
  const s = createScroll();
  setRange(s, 1000, 300);
  dragStart(s);
  dragMove(s, 100, 0.01);
  assert.ok(s.offset < 0 && s.offset > -100, `резина ${s.offset}`);
  dragEnd(s);
  settle(s);
  assert.equal(s.offset, 0);
});

test('если содержимое помещается, перетаскивание игнорируется', () => {
  const s = createScroll();
  setRange(s, 100, 300);
  dragStart(s);
  dragMove(s, -50, 0.01);
  assert.equal(s.offset, 0);
});

test('колесо мыши: сдвиг в пределах диапазона', () => {
  const s = createScroll();
  setRange(s, 1000, 300);
  wheel(s, 120);
  assert.equal(s.offset, 120);
  wheel(s, 5000);
  assert.equal(s.offset, 700);
  wheel(s, -9000);
  assert.equal(s.offset, 0);
});

test('reveal показывает элемент целиком', () => {
  const s = createScroll();
  setRange(s, 1000, 300);
  reveal(s, 600, 60, 300);
  assert.ok(s.offset + 300 >= 660);
  reveal(s, 10, 60, 300);
  assert.ok(s.offset <= 10);
});
