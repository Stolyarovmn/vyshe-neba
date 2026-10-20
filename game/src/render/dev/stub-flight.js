// Заглушка (будет заменена полным стендом).
export function createStubFlight() {
  return {
    last: null,
    reset() {},
    update() {
      return { flight: { alt: 0, speed: 0, body: 'earth', phase: 'pad' }, config: {}, events: [] };
    },
  };
}
