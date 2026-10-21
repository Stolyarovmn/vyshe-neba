// Consumables for the next flight and cosmetic skins. Ported from the previous edition.
// Consumable ids match Profile.inventory and FlightConfig.consumables.

export const SHOP = [
  { id: 'chute', name: 'Аварийный парашют', desc: 'Один полёт. X: безопасный спуск. На Луне не работает.', price: 80 },
  { id: 'repair', name: 'Ремкомплект', desc: 'Один полёт. R: восстановить 80 единиц обшивки.', price: 60 },
  { id: 'canister', name: 'Запасная канистра', desc: 'Один полёт. F: добавить 50 единиц топлива.', price: 120 },
  { id: 'magnet', name: 'Магнитный импульс', desc: 'Весь следующий полёт: радиус сбора +90.', price: 100 },
];

export const SKINS = [
  { id: 'classic', name: 'Классика', color: '#b63c43', price: 0 },
  { id: 'wasp', name: 'Шершень', color: '#e6b742', price: 250 },
  { id: 'arctic', name: 'Арктика', color: '#52b9bc', price: 350 },
  { id: 'cosmos', name: 'Космос', color: '#7c6bbe', price: 500 },
];
