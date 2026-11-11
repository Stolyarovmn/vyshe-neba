import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fresh } from '../src/state/profile.js';
import { PARTS, BUILDINGS, ERAS, DESTINATIONS, SHOP, CONTRACT_TEMPLATES } from '../src/data/index.js';
import { runFlight, createAutopilot } from '../src/sim/index.js';
import * as rules from '../src/rules/index.js';

const out = fileURLToPath(new URL('./_out/', import.meta.url));
const limit = Number(process.env.BALANCE_FLIGHTS || 600);
const perEraLimit = Number(process.env.BALANCE_ERA_FLIGHTS || 180);
const variants = [
  { id: 'careful', name: 'Осторожный', skill: 1, reserve: 0.35, order: ['legs', 'fins', 'engine', 'tank', 'booster', 'capsule', 'hull'] },
  { id: 'greedy', name: 'Жадный', skill: 0.9, reserve: 0.1, order: ['booster', 'engine', 'tank', 'capsule', 'fins', 'legs'] },
  { id: 'engine', name: 'Только двигатель', skill: 1, reserve: 0.25, order: ['engine'] },
];
const round = (n, digits = 0) => Number(n.toFixed(digits));
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const label = (kind, id, level) => `${kind === 'part' ? PARTS[id].name : BUILDINGS[id].name} ${level}`;
function targetLevels(profile, variant) {
  const cap = (profile.era + 1) * 3;
  if (variant.id === 'engine') return { engine: cap };
  const careful = variant.id === 'careful';
  return {
    engine: cap, tank: cap, booster: cap,
    capsule: profile.era >= 3 ? (profile.era === 3 ? 10 : 13) : Math.max(1, Math.ceil(cap / 2)),
    fins: careful ? Math.min(cap, 4) : 1,
    legs: careful ? Math.ceil(cap / 2) : 1,
    hull: careful ? Math.ceil(cap / 2) : 0,
  };
}
// Одна ближайшая покупка с рекурсивным раскрытием требований. Никаких бесплатных ресурсов.
function resolvePurchase(profile, kind, id, seen = new Set()) {
  const token = `${kind}:${id}`;
  if (seen.has(token)) return null;
  seen.add(token);
  const state = kind === 'part' ? rules.getPartState(profile, id) : rules.getBuildingState(profile, id);
  if (!state.next || state.locked.some((r) => r.kind === 'era')) return null;
  for (const reason of state.locked) {
    if (reason.kind === 'building') return resolvePurchase(profile, 'building', reason.building, seen);
  }
  return { kind, id, state };
}
function nextPurchase(profile, variant) {
  const targets = targetLevels(profile, variant);
  // Сначала первый уровень каждого целевого модуля, затем их уровни по очереди.
  const wanted = variant.order.filter((id) => profile.parts[id] < (targets[id] || 0));
  wanted.sort((a, b) => profile.parts[a] - profile.parts[b] || variant.order.indexOf(a) - variant.order.indexOf(b));
  for (const id of wanted) {
    const next = resolvePurchase(profile, 'part', id);
    if (next) return next;
  }
  if (profile.era >= 3 && variant.id !== 'engine') {
    const dest = profile.era === 3 ? 'moon' : 'mars';
    for (const req of DESTINATIONS[dest].requires) {
      if (req.building && profile.buildings[req.building] < req.level) return resolvePurchase(profile, 'building', req.building);
    }
  }
  const advance = ERAS[profile.era].advance;
  if (!advance) return null;
  const { count, level } = advance.buildings;
  if (rules.countBuildingsAtLevel(profile, level) >= count) return null;
  const candidates = Object.keys(BUILDINGS).filter((id) => profile.buildings[id] < level).map((id) => {
    let cost = 0;
    for (let i = profile.buildings[id]; i < level; i++) cost += BUILDINGS[id].levels[i].cost;
    return { id, cost };
  }).sort((a, b) => a.cost - b.cost);
  for (const candidate of candidates) {
    const next = resolvePurchase(profile, 'building', candidate.id);
    if (next) return next;
  }
  return null;
}
function fly(profile, variant, seed) {
  let destination = 'earth';
  if (variant.id !== 'engine' && profile.era >= 3) {
    const desired = profile.era === 3 ? 'moon' : 'mars';
    if (rules.isDestinationOpen(profile, desired)) destination = desired;
  }
  const needed = profile.era === 0 ? 3200 : profile.era === 1 ? 30000 : 100000;
  const chasing = profile.milestones.maxAlt < needed;
  const targetM = chasing ? needed + 500 : profile.era === 0 ? 4000 : profile.era === 1 ? 18000 : 45000;
  const mission = destination === 'earth' ? 'hop' : 'space';
  const config = rules.makeFlightConfig(profile, { destination, seed });
  const pilot = createAutopilot({ skill: variant.skill, mission, targetAlt: targetM / 10, seed });
  let descent;
  const driver = (state, dt) => {
    // На Земле над линией космоса с ограниченным углом нет разворота вниз.
    // Выжигаем остаток, чтобы sim завершила попытку штатной потерей в космосе.
    if (destination === 'earth' && state.phase === 'space') return { throttle: 1, tilt: 0 };
    if (destination === 'earth' && !descent && state.climb > 0 && state.fuel01 < variant.reserve) descent = createAutopilot({ skill: variant.skill, mission: 'land', seed });
    const input = (descent || pilot).next(state, dt);
    if (config.consumables.canister && state.fuel01 < 0.3) input.canister = true;
    return input;
  };
  return { config, ...runFlight(config, { driver, maxTime: 1250 }) };
}
async function model(variant) {
  let profile = rules.refillContracts(fresh());
  const rows = [], eras = [];
  let eraStart = 0, eraSpent = 0, totalSpent = 0, eraData = 0, emptyStreak = 0;
  for (let n = 1; n <= limit; n++) {
    const eraBefore = profile.era;
    const before = profile;
    const flight = fly(profile, variant, 1000 + n);
    const settled = rules.settleFlight(profile, flight.result, flight.config);
    profile = settled.profile;
    const flightNet = profile.coins - before.coins;
    const dataNet = profile.data - before.data;
    const bought = [];
    let spent = 0, dataSpent = 0;
    for (let i = 0; i < 200; i++) {
      if (rules.getEraState(profile).ok) {
        const advance = ERAS[profile.era].advance;
        spent += advance.coins; dataSpent += advance.data;
        bought.push(`Эпоха ${profile.era + 1} (${advance.coins})`);
        profile = rules.advanceEra(profile).profile;
        break;
      }
      const next = nextPurchase(profile, variant);
      if (!next || !next.state.canBuy) break;
      const result = next.kind === 'part' ? rules.buyPart(profile, next.id) : rules.buyBuilding(profile, next.id);
      if (!result.ok) throw new Error('Покупка, разрешённая rules, не прошла');
      spent += next.state.next.cost; dataSpent += next.state.next.data;
      bought.push(`${label(next.kind, next.id, next.state.next.level)} (${next.state.next.cost})`);
      profile = result.profile;
    }
    eraSpent += spent; totalSpent += spent; eraData += dataSpent;
    emptyStreak = bought.length ? 0 : emptyStreak + 1;
    rows.push({ n, era: eraBefore, altitudeM: round(flight.result.maxAlt * 10), destination: flight.config.destination, body: flight.result.body, outcome: flight.result.outcome, reason: flight.result.reason, time: round(flight.result.time, 1), flightNet, gross: settled.report.coins.gross, charged: settled.report.coins.charged, dataNet, bought, spent, coins: profile.coins, data: profile.data, emptyStreak, ended: flight.state.ended });
    if (profile.era !== eraBefore) {
      eras.push({ era: eraBefore, entered: profile.era, flights: n - eraStart, totalFlights: n, spent: eraSpent, totalSpent, dataSpent: eraData });
      eraStart = n; eraSpent = 0; eraData = 0;
      console.log(`${variant.name}: E${profile.era}, запуск ${n}, потрачено ${totalSpent}`);
      if (profile.era === 5) break;
    }
    if (n - eraStart >= perEraLimit) break;
    if (n % 40 === 0) console.log(`${variant.name}: запуск ${n}, E${profile.era}, кошелёк ${profile.coins}, данные ${profile.data}`);
  }
  const pending = nextPurchase(profile, variant);
  return { variant, rows, eras, profile, totalSpent, pending: pending ? { name: label(pending.kind, pending.id, pending.state.next.level), cost: pending.state.next.cost, data: pending.state.next.data, locks: pending.state.locked } : null, eraState: rules.getEraState(profile) };
}

await mkdir(out, { recursive: true });
const models = [];
for (const variant of variants) models.push(await model(variant));

// Изолированные диагностические полёты: одинаковые начальные условия и семена,
// покупка влияет только одним уровнем; эти профили не выдаются за прохождение.
const sensitivity = [];
for (const era of [0, 1, 2, 3, 4]) {
  const base = fresh(); base.era = era;
  for (const id in base.parts) base.parts[id] = era * 3;
  for (const id in base.buildings) base.buildings[id] = era + 1;
  const results = (p) => [17, 29, 53].map((seed) => runFlight(rules.makeFlightConfig(p, { seed }), { mission: 'hop', targetAlt: 1e7, rings: false, maxTime: 1250 }).result.maxAlt * 10);
  const original = results(base);
  for (const id of Object.keys(PARTS)) {
    const upgraded = structuredClone(base); upgraded.parts[id]++;
    const heights = results(upgraded);
    const delta = heights.reduce((sum, h, i) => sum + (h - original[i]) / original[i] * 100, 0) / heights.length;
    sensitivity.push({ era, id, level: upgraded.parts[id], cost: rules.getPartState(base, id).next.cost, baseM: round(original.reduce((a, b) => a + b) / 3), deltaPercent: round(delta, 2) });
  }
  console.log(`Диагностика отдельных покупок: E${era}`);
}
const audit = { limit, perEraLimit, models, sensitivity };
await writeFile(`${out}/BALANCE_RUNS.json`, JSON.stringify(audit, null, 2) + '\n', 'utf8');

const eraCosts = ERAS.filter((e) => e.advance).map((e) => {
  const { advance } = e;
  const sorted = Object.entries(BUILDINGS).map(([id, b]) => ({ id, coins: b.levels.slice(0, advance.buildings.level).reduce((s, l) => s + l.cost, 0), data: b.levels.slice(0, advance.buildings.level).reduce((s, l) => s + l.data, 0) })).sort((a, b) => a.coins - b.coins);
  const selected = sorted.slice(0, advance.buildings.count);
  return [ `E${e.id} → E${e.id + 1}`, advance.coins, advance.data, `${advance.buildings.count} × ур. ${advance.buildings.level}`, selected.reduce((s, b) => s + b.coins, 0), selected.reduce((s, b) => s + b.coins, advance.coins), advance.milestone.text ];
});
const sections = [
  '# Баланс прокачки: измерения без изменения данных',
  '## Метод и ограничения',
  `Команда: \`node game/tools/analyze-balance.mjs\`. Все покупки и расчёты наград выполняют настоящие rules, полёты — sim с шагом 1/120 с. Начало: fresh(), 0 монет, 0 данных, контракты seed=1. Семена полётов 1001, 1002 и далее одинаковы между стратегиями. Лимит ${limit} запусков, не более ${perEraLimit} в одной эпохе; непройденные этапы не экстраполируются как состоявшиеся. Полные входы, строки и конечные профили: BALANCE_RUNS.json.`,
  'У осторожного skill=1 и резерв на снижение 35%; у жадного skill=0.9 и 10%; у двигателя skill=1 и 25%. Резерв переключает автопилот на посадку. Автопилот избегает опасностей и может собирать кольца; это модель поведения, а не статистика живых игроков. Расходники за деньги не покупаются; бесплатные от базы используются. До выполнения высотного условия цель равна порогу +500 м, затем 4/18/45 км для E0/E1/E2+. На Луне/Марсе используется штатная миссия space. На Земле после выхода в космос остаток топлива выжигается до штатной потери: без свободного разворота автопилот сам не возвращается. Это ограничение явно входит в цену риска.',
  'Порядок покупок: сначала первый уровень нужных модулей, затем выравнивание их уровней с раскрытием зависимостей; после модулей — самые дешёвые здания до требования эпохи, затем накопление на модернизацию. Осторожный берёт двигатель/бак/блок до потолка, капсулу до половины потолка (10/13 для экспедиций), опоры и корпус до половины, стабилизаторы до 4. Жадный берёт двигатель/бак/блок до потолка, капсулу как выше, опоры/стабилизаторы до 1, корпус не берёт. Двигатель покупает только уровни двигателя и нужную для них/эпохи инфраструктуру. Ни один алгоритм не претендует на оптимальное прохождение.',
  '## Обязательные пороги эпох',
  table(['Переход', 'Только проект, монет', 'Данных проекта', 'Зданий', 'База с нуля, без скидок', 'База + проект с нуля', 'Условие полёта'], eraCosts),
  'Стоимость базы — сумма самых дешёвых требуемых зданий с нуля по номиналу, без модулей, скидок и проверки дополнительных зависимостей. Это ориентир объёма экономики, не точный минимум прохождения. Фактические траты со скидками и зависимостями ниже. E5 — финальная эпоха, отдельного перехода из неё нет.',
  '## Кривые цен',
  'Модули: 0.5 × базовая цена × рост^(уровень−1), затем округление. Рост 1.32–1.34: каждые три уровня цена примерно ×2.30–2.41. Здания: 0.58 × база ×2.85^(уровень−1): уровни 1→6 отличаются примерно в 188 раз. Скидка эпохи достигает 10%, сумма скидок модулей ограничена 50%. Полная таблица ниже — номинал без скидок.',
  table(['Модуль', 'Ур.1', 'Ур.3', 'Ур.6', 'Ур.9', 'Ур.12', 'Ур.15', 'Ур.18', 'Всего 1–18', 'Данных 1–18'], Object.values(PARTS).map((p) => [p.name, ...[1,3,6,9,12,15,18].map((n) => p.levels[n-1].cost), p.levels.reduce((s,l) => s+l.cost,0), p.levels.reduce((s,l) => s+l.data,0)])),
  table(['Здание', '1', '2', '3', '4', '5', '6', 'Всего'], Object.values(BUILDINGS).map((b) => [b.name, ...b.levels.map((l) => l.cost), b.levels.reduce((s,l) => s+l.cost,0)])),
  '## Модельные прохождения',
];
for (const m of models) {
  const total = m.rows.length;
  const maxEmpty = Math.max(...m.rows.map((r) => r.emptyStreak));
  const crashes = m.rows.filter((r) => r.outcome === 'crashed').length;
  sections.push(`### ${m.variant.name}`, `Запусков ${total}, достигнута E${m.profile.era}; потрачено ${m.totalSpent} монет. Аварий ${crashes}, незавершённых к лимиту времени ${m.rows.filter((r) => !r.ended).length}. Максимальная серия без покупок: ${maxEmpty} запусков. Остаток ${m.profile.coins} монет, ${m.profile.data} данных; рекорд ${m.profile.milestones.maxAlt} м.`, table(['Выход из', 'В', 'Запусков в эпохе', 'Запусков суммарно', 'Потрачено в эпохе', 'Потрачено суммарно', 'Данных потрачено'], m.eras.map((r) => [`E${r.era}`,`E${r.entered}`,r.flights,r.totalFlights,r.spent,r.totalSpent,r.dataSpent])));
  if (m.profile.era < 5) sections.push(`Остановка: ${m.eraState.reasons.map((r) => `${r.text}; есть ${r.have ?? r.items?.map((i)=>i.have).join(',')}, нужно ${r.need ?? r.items?.map((i)=>i.need).join(',')}`).join(' / ')}. Следующая плановая покупка: ${m.pending ? `${m.pending.name}, ${m.pending.cost} монет, ${m.pending.data} данных; ${m.pending.locks.map((r) => r.text).join('; ')}` : 'нет: копим на проект или ждём условие полёта'}.`);
  sections.push('Доход — чистое изменение кошелька при settleFlight, включая разовые контракты/достижения и штраф; награды за покупки входят в остаток, но не в этот столбец. Высота в метрах; покупки перечислены после расчёта этого запуска.', table(['Запуск', 'Эпоха', 'Высота, м', 'Исход', 'Доход', 'Данные', 'Что купил (цена)', 'Кошелёк'], m.rows.map((r) => [r.n,`E${r.era}`,r.altitudeM,`${r.body}: ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`,r.flightNet,r.dataNet,r.bought.join('; ') || '—',r.coins])));
}
sections.push('## Что почти не повышает высоту',
  'Контроль: профили E0–E4, все модули на уровне 3×E, все здания на E+1. По одному уровню каждого модуля, одинаковые семена 17/29/53, полный расход топлива, без наведения на кольца. Это измерение предельной высоты, не выгодности покупки и не безопасности посадки. Профили созданы диагностически; цена рассчитана rules со скидками, требования покупки здесь намеренно не проверяются. Средний относительный прирост по трём полётам:',
  table(['Эпоха', 'Модуль', 'Новый уровень', 'Цена', 'Исходная высота, м', 'Изменение, %'], sensitivity.map((s) => [`E${s.era}`,PARTS[s.id].name,s.level,s.cost,s.baseM,s.deltaPercent])),
  'Опоры, корпус и авионика в основном дают безопасность, управление и допуск к экспедициям. Их нулевой прирост высоты ожидаем; проблема в обещании и обратной связи. Авионика 1 даёт прогноз, 3 — помощь, 6 — улучшенный прогноз; последующие уровни прежде всего экономят по 1.2 п.п. топлива перелёта. Ускорение от стабилизаторов зависит от сопротивления и управления. У зданий factory/service/logistics/control/weather/radar/observation/recovery нет прямой прибавки к маршевой тяге; fuel и gantry влияют на запас топлива/блок, energy снимает дефицит питания.',
  '## Стены и разовые награды',
  '1. Проект E2→E3 стоит 2490 монет, следующий E3→E4 — 28500 (×11.45), затем 105500 (×3.70). Бонус дохода эпохи растёт всего на 5 п.п.; travelPay зависит от высоты с показателем 0.85, поэтому не компенсирует такой скачок. При условном чистом доходе 300/1000 монет только эти два проекта требуют соответственно 95/29 и 352/106 запусков, без зданий и модулей. Это арифметические сценарии, не измеренная средняя выручка.',
  '2. Данные расходуются на модули с уровня 7, здания с 5. Проекты требуют 8/40/150/300/800. Данные зон одноразовые; спокойные низкие посадки дают примерно 1–3 без наблюдательного комплекса. Поэтому кошелёк может расти, а покупка оставаться закрытой.',
  '3. Начальные монеты включают разовые достижения и контракты. Контрактов всего '+CONTRACT_TEMPLATES.length+', пройденные id не повторяются. Их нельзя считать бесконечным источником для поздних цен. Приоритет первого окна контрактов зависит от seed и результатов.',
  '4. Магазин: '+SHOP.map((s)=>`${s.name} ${s.price}`).join(', ')+'. Парашют за 80 соперничает с первым двигателем за 75 по номиналу; канистра за 120 — с несколькими ранними уровнями бака. Бесплатный парашют появляется у rescue 3, канистра у fuel 4 при достаточном питании.',
  '5. Авария сохраняет 50% выплаты за путь и вычитает max(12, 4.5% номинальной стоимости купленных модулей) с поправкой спасателей, не более половины кошелька после выплаты. Потери растут с прокачкой. Точная измеренная серия ожидания и причины остановки приведены у каждой модели; это верхняя граница только данной стратегии, а не доказательство невозможности эпохи.',
  '## Предложения для отдельного согласования',
  'Ни одна из следующих цифр не применена к игре. Это кандидаты для следующего прогона тех же стратегий; критерий — заметный эффект либо новая возможность после покупки и не более 2–4 пустых запусков в ранней игре.',
  '1. Сгладить стоимость проектов: 560/2140/2490/28500/105500 → 560/1800/4000/12000/36000. Самые поздние проекты сократятся на 58% и 66%; затем проверить полный суммарный бюджет со зданиями, а не только ценник проекта.',
  '2. Снизить рост зданий с 2.85 до 2.25. Множитель цены уровня 6 относительно 1 уменьшится с 188 до 58; дорогую обязательную инфраструктуру оплачивать по одному полезному улучшению за 2–4 успешных рейса.',
  '3. Разбить условие 8/8/10/12/14 зданий на функциональные задачи: 5/6/8/10/12 обязательных плюс 2 дополнительных по выбору; каждое из дополнительных зданий даёт скидку 5% на проект, максимум 10%. Сначала измерить, какие зависимости уже входят в обязательную цепочку.',
  '4. Дать ранним покупкам топлива более крупные ступени: tank 1–3 по +22% базового бака вместо +16%, дальше по +12%; engine 1–3 по +10% базовой тяги вместо +8.33%. Цель контрольного прогона — медианный прирост высоты 8–15% после покупки, без обязательного обещания точного эффекта.',
  '5. Для безопасных модулей в отчёте сравнивать измеримую пользу: опоры 0→1 повышают допуск вертикальной скорости 13→15.2 (+16.9%), корпус 100→135 (+35%). Для авионики объединить уровни 2 и 3 в один заметный порог помощи, сохранив общий бюджет первых трёх уровней; убрать уровни с одной только невидимой экономией.',
  '6. Данные за успешный рейс: минимум 2 вместо 1; за новый личный рекорд +2 при приросте не менее 5%, не чаще одного бонуса за запуск. Стоимость проектов по данным 8/40/150/300/800 → 8/30/90/220/500; повторные экспедиции 12/26 → 18/36 до повторной оценки темпа.',
  '7. Первый страховочный парашют выдавать бесплатно после первой аварии (один раз); цену покупки снизить 80→30 до E1. Канистру 120→60 в E0–E1. Проверить, не становится ли расходник выгоднее постоянного бака на серии из 3 запусков.',
  '8. Добавить повторяемый контракт каждые 3 полёта после исчерпания доступных: награда 40×(эпоха+1) и 2 данных, без обязательного рекорда. Бонус за идеальную посадку поднять 20→30, но не начислять за отказ от полёта; это даст ясную альтернативу бессмысленному выжиганию топлива.',
  '9. Для цены риска ограничить аварийный штраф 3% стоимости модулей вместо 4.5% и максимумом 25% кошелька вместо 50%; отдельно сравнить чистый доход рискованного и безопасного маршрута на 30 одинаковых семенах. В модели это особенно существенно для стратегии одного двигателя.',
  '10. Перед следующей покупкой показывать цель в запусках по медиане последних 5 обычных выплат без разовых достижений. Если покупка оценивается дороже 4 запусков в E0–E1 или 8 в E2+, выдавать ближайшую альтернативу с эффектом; интерфейс здесь не менялся.',
);
await writeFile(`${out}/BALANCE_REPORT.md`, sections.join('\n\n')+'\n', 'utf8');
console.log(`Готово: ${out}/BALANCE_REPORT.md и BALANCE_RUNS.json`);
