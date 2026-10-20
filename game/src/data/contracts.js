// Contract templates ported from the 30 missions of the previous edition. Rewards are scaled like the
// old file did at its end: max(15, round(reward * 0.55)). A template is offered when its `from` holds:
//   { era }          minimum era id
//   { destination }  the destination is open (Moon, Mars)
//   { part, level }  the rocket module has at least this level
// `until` ({ era }) hides goals about the current era once it has been left.
// `cargo` contracts get the logistics terminal bonus. Goals are evaluated by rules/goals.js.

const scale = (reward) => Math.max(15, Math.round(reward * 0.55));

function template(tier, id, name, desc, reward, goal, from, extra = {}) {
  return { id, tier, name, desc, reward: scale(reward), goal, from, ...extra };
}

const era0 = { era: 0 };
const era1 = { era: 1 };
const era2 = { era: 2 };
const era3 = { era: 3 };
const alt = (min) => ({ type: 'flightAlt', min });

export const CONTRACT_TEMPLATES = [
  template(1, 'm01', 'Проба двигателя', 'Достигни высоты 800 м', 60, alt(800), era0),
  template(2, 'm02', 'Возвращение домой', 'Сохрани ракету посадкой', 90, { type: 'land' }, era0),
  template(3, 'm03', 'Первый маршрут', 'Пролети за запуск 2 км', 75, { type: 'flightDistance', min: 2000 }, era0),
  template(4, 'm04', 'Облачный потолок', 'Поднимись на 3 000 м', 100, alt(3000), era0),
  template(5, 'm05', 'Сборщик', 'Собери 3 предмета за полёт', 100, { type: 'pickups', min: 3 }, era0),
  template(6, 'm06', 'Сквозь кольцо', 'Пройди одно кольцо за полёт', 100, { type: 'rings', min: 1 }, era0),
  template(7, 'm07', 'Лунный билет', 'Посади ракету на Луну', 200, { type: 'landOn', body: 'moon' }, { destination: 'moon' }, { cargo: true }),
  template(8, 'm08', 'Мягкое касание', 'Выполни идеальную посадку', 180, { type: 'perfect' }, era0),
  template(9, 'm09', 'Дальняя разведка', 'Пролети за запуск 10 км', 150, { type: 'flightDistance', min: 10000 }, era1),
  template(10, 'm10', 'Выросли из гаража', 'Улучши базу до 1986 года', 150, { type: 'era', min: 1 }, era0, { until: era0 }),
  template(11, 'm11', 'Трижды точно', 'Пройди 3 кольца за полёт', 200, { type: 'rings', min: 3 }, era0),
  template(12, 'm12', 'Тихая погода не нужна', 'Посади ракету после шторма', 220, { type: 'stormLand', min: 5 }, era1),
  template(13, 'm13', 'Новый слой', 'Достигни стратосферы: 12 км', 220, alt(12000), era1),
  template(14, 'm14', 'Чистая работа', 'Вернись с целой обшивкой', 180, { type: 'cleanLand' }, era0),
  template(15, 'm15', 'Красная планета', 'Успешно сядь на Марс', 250, { type: 'landOn', body: 'mars' }, { destination: 'mars' }, { cargo: true }),
  template(16, 'm16', 'Золотой дождь', 'Собери 8 предметов за полёт', 200, { type: 'pickups', min: 8 }, era1),
  template(17, 'm17', 'Воздушная минута', 'Проведи в воздухе 60 секунд', 200, { type: 'flightTime', min: 60 }, era0),
  template(18, 'm18', 'Новый век', 'Развей базу до 1998 года', 300, { type: 'era', min: 2 }, era1, { until: era1 }),
  template(19, 'm19', 'Искусство экономии', 'Сядь с 20% основного топлива', 250, { type: 'fuelLand', min: 0.2 }, era1),
  template(20, 'm20', 'Рядом с опасностью', 'Дважды разминись с обломком за полёт', 220, { type: 'near', min: 2 }, era0),
  template(21, 'm21', 'Лунный ювелир', 'Идеально сядь на Луну', 350, { type: 'perfectOn', body: 'moon' }, { destination: 'moon' }, { cargo: true }),
  template(22, 'm22', 'Мезосфера ждёт', 'Поднимись на 50 км', 400, alt(50000), era2),
  template(23, 'm23', 'На мягком куполе', 'Вернись на парашюте', 250, { type: 'chuteLand' }, { part: 'parachute', level: 1 }),
  template(24, 'm24', 'Свой космопорт', 'Развей базу до 2015 года', 450, { type: 'era', min: 3 }, era2, { until: era2 }),
  template(25, 'm25', 'Пять ворот', 'Пройди 5 колец за полёт', 400, { type: 'rings', min: 5 }, era1),
  template(26, 'm26', 'Возвращение с края', 'Сядь после подъёма на 30 км', 500, { type: 'landAlt', min: 30000 }, era1),
  template(27, 'm27', 'Почти космос', 'Поднимись на 85 км', 600, alt(85000), era2),
  template(28, 'm28', 'Орбитальная цивилизация', 'Развей базу до 2035 года', 600, { type: 'era', min: 4 }, era3, { until: era3 }),
  template(29, 'm29', 'За линией неба', 'Поднимись на 120 км', 800, alt(120000), era3),
  template(30, 'm30', 'Горизонт будущего', 'Развей базу до 2060 года', 1000, { type: 'era', min: 5 }, { era: 4 }, { until: { era: 4 } }),
];

// Three contracts are always open; the logistics terminal adds more, up to this cap.
export const BASE_CONTRACT_SLOTS = 3;
export const MAX_CONTRACT_SLOTS = 5;
