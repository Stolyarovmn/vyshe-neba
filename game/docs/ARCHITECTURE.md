# Архитектура новой редакции

Читать вместе с `DESIGN.md`. Этот документ — контракт между модулями: каждый работает в своей папке и не трогает чужие. Любое изменение контракта вносится сюда первым.

## 1. Принципы

- Чистый ES-модульный JavaScript без зависимостей в рантайме. Одна dev-зависимость — `esbuild` (сборка в один автономный HTML) и существующий `playwright` (браузерные проверки).
- Читаемый код (не минифицированный), короткие функции, имена на английском, строки интерфейса только через `t('ключ')` из `src/i18n/ru.js`. Комментарии — только там, где причина неочевидна.
- Симуляция, данные и правила — чистые функции без DOM, `Math.random`, `Date.now`; случайность только из `sim/rng.js` (mulberry32) с seed. Всё JSON-сериализуемо.
- Время симуляции: фиксированный шаг `DT = 1/120` с, накопление в `main.js`. Рендер интерполирует.
- Координаты мира: ось X вправо, ось Y **вниз** (как в старой игре и в `canvas`), высота `alt = -y` над поверхностью текущего тела (в игровых единицах, 1 ед. = 10 м). Угол `angle` в радианах: 0 — нос вверх, положительный — по часовой.

## 2. Структура

```
game/
  index.html            dev-вход (ES-модули, без сборки)
  src/
    main.js             приложение: цикл, состояния, переходы
    i18n/ru.js          все строки
    data/               чистые данные (эпохи, тела, модули, постройки, контракты, достижения)
    rules/              чистые функции над Profile: покупки, требования, эффекты, награды
    state/              Profile, сохранение, миграции
    sim/                симуляция полёта
    audio/              процедурный звук
    input/              клавиатура, касания, геймпад → ControlState
    render/             загрузка ассетов, камера, сцены мира (хаб, полёт), частицы
    ui/                 UI-тулкит на canvas, экраны, HUD
  tools/
    build.mjs           сборка в один HTML
    economy-bot.mjs     проверка баланса
  test/                 *.test.mjs (node:test) и *.browser.cjs (playwright)
  docs/
```

Владельцы папок во время разработки: `sim` — агент A; `data`, `rules`, `state`, `tools/economy-bot.mjs` — агент B; `audio` — агент C; `ui`, `input`, `main.js`, `i18n` — агент D; `render` — агент E; `tools/build.mjs`, workflow, `index.html`, браузерные тесты — лидер.

## 3. Profile (состояние сохранения)

```js
Profile = {
  v: 1,
  coins: 0, data: 0,
  era: 0,                          // 0..5
  parts:     { engine:0, tank:0, hull:0, booster:0, capsule:0, legs:0, fins:0, avionics:0 }, // уровни 0..18, 8 модулей (парашют — расходник inventory.chute)
  buildings: { beacons:0, gantry:0, deluge:0, service:0, rescue:0, fuel:0, logistics:0, factory:0,
               weather:0, control:0, radar:0, energy:0, observation:0, recovery:0 },                   // уровни 0..6
  inventory: { chute:0, repair:0, canister:0, magnet:0 },
  skins: ['classic'], skin: 'classic',
  milestones: { maxAlt:0, softLandings:0, moonLanding:false, marsLanding:false },
  stats: { flights:0, landings:0, crashes:0, perfect:0, streak:0, bestStreak:0, distance:0, earned:0,
           rings:0, pickups:0, near:0, storm:0, moon:0, mars:0, parachutes:0, saved:0, airtime:0 },
  achievements: [],               // id выполненных
  contracts: { active: [], done: [], seed: 1 },
  settings: { master:0.8, music:0.6, sfx:0.9, controlMode:'arcade', reduceMotion:false, textScale:1,
              colorblind:false, vibrate:true, touchLayout:'right', tutorial:{ done:false, step:0 } }
}
```

## 4. Data (агент B)

`src/data/index.js` экспортирует:

```js
ERAS    // [{ id:0, year:1978, name, desc, cap:{ part:3, building:2 }, bonus:{ fuel, income, discount } }, ...]  cap = макс. уровень на эпоху (part: 3*(id+1), building: id+1 (+1 для постройки с «опережением»))
BODIES  // { earth:{ gravity, atmo:{ ceiling, curve }, surface }, moon:{...}, mars:{...} }  + transferCost по цели
PARTS   // { engine:{ id, name, desc, levels:[{ cost, data, stats:{...}, requires:[{ building, level }] }] }, ... }  по 18 уровней
BUILDINGS // { beacons:{ id, name, desc, levels:[{ cost, data, power, effects:{...}, requires:[{ building, level }|{ era }] }] }, ... }
CONTRACT_TEMPLATES, ACHIEVEMENTS, SHOP, SKINS
```

Эффекты построек и статы модулей — плоские числа с понятными именами (см. таблицы DESIGN 4.3 и 4.4).

## 5. Rules (агент B)

```js
getPartState(profile, id)        // { level, max, next:{ cost, data, stats }|null, locked:[{ kind:'building'|'era'|'coins'|'data', ... , text }] }
buyPart(profile, id)             // -> { ok, reasons[], profile }  (иммутабельно, возвращает новый Profile)
getBuildingState(profile, key)   // то же + { power:{ use, supply } }
buyBuilding(profile, key)
getEraState(profile)             // условия перехода: монеты, данные, веха, число построек
advanceEra(profile)
powerBalance(profile)            // { supply, demand, ratio }  ratio<1 уменьшает эффекты построек
deriveRocket(profile)            // агрегированные статы ракеты (для UI «было → станет»)
deriveBase(profile)              // агрегированные эффекты построек с учётом powerBalance
makeFlightConfig(profile, { destination, consumables, seed })  // -> FlightConfig (см. §6)
settleFlight(profile, result)    // применить итог полёта (награды, статистика, вехи, контракты, достижения) -> { profile, report }
availableDestinations(profile)   // [{ id, ok, reasons[] }]
listContracts(profile)
```

Все функции чистые, возвращают новый объект и никогда не мутируют аргументы.

## 6. Sim (агент A)

### 6.1 FlightConfig

```js
FlightConfig = {
  seed: 1, era: 0, destination: 'earth'|'moon'|'mars', skin: 'classic',
  stages: [ { id:'booster'|'core'|'capsule', thrust, fuel, burnRate, mass, turn } ],  // порядок: сначала сбрасываемая
  hull:   { hp, debrisResist },
  legs:   { vTol, hTol, angTol },       // допуски посадки (ед./с, ед./с, рад)
  fins:   { turn, dragCut, maxTilt },   // turn — множитель скорости поворота; maxTilt — мягкий предел наклона, рад (π — свободное вращение)
  avionics:  { predict:0|1|2, assist:0|1 },
  base:   { radar:0..1, beacons:0..1, weather:0..1, income:1, fuelDropRate:1, repairOnLand:0..1, rescueRefund:0..1,
            padSafety:0..1, dataMult:1, perfectBonus:1 },
  consumables: { chute:0|1, repair:0|1, canister:0|1, magnet:0|1 },
  transferCost: { moon:..., mars:... }   // доля топлива маршевой ступени
}
```

### 6.2 API

```js
createFlight(config)           // -> FlightState (JSON-сериализуемо)
step(state, input, dt)         // -> Event[]; мутирует state (внутри sim допустима мутация)
summarize(state)               // -> FlightResult
```

```js
Input = { throttle: 0..1 /*цель*/, tilt: -1..1, stabilize: bool, boost: bool,
          parachute: bool, canister: bool, repair: bool, transfer: bool, pause: bool }
```

Основные поля `FlightState`, на которые опираются рендер, HUD и звук: `phase`, `time`, `body`, `x`, `y`, `vx`, `vy`, `angle`, `av`, `throttle` (фактическая), `alt`, `speed`, `stageIndex`, `stages[]` (топливо каждой), `fuel`, `maxFuel`, `hp`, `maxHp`, `coins`, `rcs` ({left,right}), `atmo` (0..1), `weather` ({ kind, wind, storm }), `objects` (самолёты, шары, обломки, астероиды, монеты, топливо, кольца, ремкомплекты), `particles` не хранится в sim (это рендер), `pad` (положение и ширина площадки при приближении), `landing` ({ vTol, hTol, angTol, ok }), `canTransfer`, `predict` (опорные точки линии прогноза, если открыта авионикой), `zone` (id высотной зоны).

События (`Event.type`): `liftoff`, `stage-sep`, `fuel-empty`, `pickup` (coin|fuel|repair), `ring`, `near-miss`, `hit`, `zone`, `storm`, `thrust-cut`, `parachute`, `transfer-start`, `transfer-done`, `touch`, `landed` ({ perfect }), `crashed` ({ reason }), `low-fuel`, `warn` ({ kind }).

`FlightResult`: `{ outcome:'landed'|'crashed'|'abandoned', perfect, destination, maxAlt, distance, time, fuelLeft01, hpLeft01, coinsPicked, rings, pickups, near, stormTime, usedChute, reason, landing:{ v, h, ang } }`.

### 6.3 Цели настройки

Стартовая ракета (все модули 0): тяга чуть выше веса; полный бак даёт ~3–4 мин активной работы на подъём ~900 м и посадку с запасом; без тяги ракета падает; на Луне/Марсе — гравитация и атмосфера из `BODIES`. Мягкая посадка без улучшений возможна, но требует аккуратной работы с тягой. Допуски растут с `legs`.

## 7. Audio (агент C)

```js
const audio = createAudio();
audio.unlock();                                  // по первому жесту
audio.setVolumes({ master, music, sfx });  audio.setMuted(bool);
audio.update(dt, frame);                         // frame: { throttle, atmo, alt01, speed01, stage, rcs:{left,right}, fuel01, danger01, body, phase, paused }
audio.sfx(name, params?);                        // имена в src/audio/names.js
audio.music.set({ scene:'hub'|'flight'|'results', zone, intensity });
audio.suspend(); audio.resume();
audio.renderOffline({ seconds, script })         // для тестов (OfflineAudioContext)
```

## 8. Input (агент D)

`createInput(canvas, getLayout)` возвращает объект с `poll()` → `Input` (см. 6.2) и событиями интерфейса (`tap`, `press`, `drag`, `wheel`) в координатах интерфейса. Касательные элементы управления (диск наклона, рычаг тяги, кнопки) рисует UI/HUD, а их геометрию отдаёт `layout`.

## 9. Render (агент E)

```js
const assets = await loadAssets(manifest);       // assets.get('core_1978') -> { img, w, h, anchor? }
const renderer = createRenderer(canvas, assets);
renderer.hub.draw(ctx, { profile, time, layout })        // остров, постройки по якорям, ракета на столе
renderer.flight.draw(ctx, { flight, config, time, layout, settings })   // фон, мир, объекты, ракета, частицы
renderer.events(flightEvents)                    // частицы/тряска по событиям sim
renderer.layout(w, h, dpr, safeInsets)           // -> Layout
```

`Layout`: `{ w, h, dpr, orientation:'portrait'|'landscape', ui, safe:{t,r,b,l}, rocketAnchor:{x,y}, hud:{ ... } }`. Камера в полёте использует `rocketAnchor` (в портрете — нижняя треть, в ландшафте — левая треть при вертикальном движении и центр при горизонтальном).

## 10. UI (агент D)

Тулкит (`src/ui/kit.js`): `panel`, `button`, `iconButton`, `meter`, `statDelta`, `scrollList` (кинетическая прокрутка), `tabs`, `toast`, `tooltip`, `progress`, `costChip`; тема в `theme.js`; текст в `text.js` (кэш растеризации, перенос слов). Экраны: `hub`, `rocket`, `base`, `journal`, `launch`, `flight-hud`, `results`, `settings`, `onboarding`. Оба макета (портрет/ландшафт) в каждом экране, без прокрутки страницы.

## 11. Сборка и проверки (лидер)

- `npm run game:build` → `game/dist/vyshe-neba.html` (один файл, ассеты встроены, не коммитится).
- `npm run game:test` → `node --test game/test/*.test.mjs` (sim, data, rules, economy-bot, audio offline render) затем `node game/test/browser.cjs` (оба макета, сценарий «первый полёт», ноль ошибок консоли, скриншоты в `work/`).
- Отдельный workflow `game-next-ci.yml`; существующий `game-ci.yml` не меняется.
- Ассеты берутся из утверждённых каталогов (`outputs/rocket/dist/assets`, `art/gen`) на этапе сборки; копий в `game/` не хранится.

## 12. Ассеты в dev и в сборке

`src/render/manifest.js` экспортирует `ASSET_FILES = { logicalName: 'путь/от/корня/репозитория.png', ... }` плюс данные обрезки и масштаба из `live/world-assets.js`. Загрузчик берёт адрес как `globalThis.__GAME_ASSETS__?.[path] ?? '/' + path`: в dev файлы раздаёт статический сервер из корня репозитория (`/game/index.html`), при сборке `tools/build.mjs` подставляет `data:`-адреса в `__GAME_ASSETS__`. Каждый логический ассет перечислен в манифесте ровно один раз; неиспользуемые файлы в сборку не попадают.

## 13. Фактические API и отличия от контракта (после реализации)

Источник правды — код; здесь собраны отличия, которые нужно знать при доработке.

**Sim** (`game/src/sim`): `createFlight`, `step`, `summarize`, `createAutopilot({skill, mission:'hop'|'space'|'land', targetAlt, seed}).next(state, dt)`, `runFlight`, `advance`. В `FlightConfig` добавлены `start` ({body, alt, x, vx, vy, angle, stageIndex, fuel01}), `limits` ({speed, fall}) и фиксированная `weather`. В `FlightState` добавлены `climb`, `fuelTotal`, `fuel01`, `weightless`, `transferCostFuel`, `approach`, `chute`, `boost`, `maxAccel`, `turnRate`. `reason` — код (`landing-speed`, `landing-drift`, `landing-tilt`, `hull-destroyed`, `lost-in-space`, `lost-contact`), виновник в `killer`. `FlightResult.landing` содержит фактические допуски (`vTol`, `hTol`, `angTol`, `onPad`). Событие `storm` имеет `phase`, событие `warn` — `kind`. Опасности и предметы: `objects[].kind` (`coin|fuel|ring|repair|plane|balloon|asteroid|debris`).

**Rules/Data/State**: `cap.building = id + 1`; `milestones.maxAlt` и `stats.distance` хранятся в метрах, а `FlightResult.maxAlt`/`distance` — в единицах игры (×10). `settleFlight(profile, result, config?)` принимает конфиг для списания расходников. Покупки возвращают `awarded`. Дополнительно: `refillContracts`, `buyConsumable`, `buySkin`, `selectSkin`, `checkAchievements`. Веха E0 → E1: одна мягкая посадка и высота 3 км. Парашют — только расходник из лавки (`inventory.chute`, бесплатный с 3-го уровня спасательной станции); в `FlightConfig` нет `parachute.level`. `fins.maxTilt` — мягкий предел наклона (рад), растёт с уровнем стабилизаторов до π на уровне 12.

**Render**: `renderer.flight.start(flight, config)`, `renderer.events(list, flight?)`, `renderer.flight.timeScale` (замедление после касания/аварии), `hub.hitTest(x, y)` (ключ постройки, `'rocket'` или `null`), `hub.screenPos`, `hub.pan`, `hub.focus`, `hub.setSelected`. Все `draw` рисуют в пикселях устройства (`canvas.width = w·dpr`). Спрайты построек radar/recovery/logistics/energy/observation пока программные; спрайт `bld_<ключ>_<год>` в `ASSET_FILES` подхватывается автоматически (см. `art/docs/MISSING_ASSETS_PROMPTS.md`).

**Audio**: `createAudio()` по §7, плюс `event(ev)`, `events(list)`, `getVolumes`, `isMuted`, `dispose`, `renderOffline`. В кадре допустимы `phase:'hub'` и `storm`; `music.set` принимает `mood:'win'|'fail'`; `alt01 = высота / 100 км`.

**UI/Input**: id кнопок для тестов — `dock-*`, `launch-start`, `launch-dest-<id>`, `part-<id>`, `results-*`, `flight-*`, `back`. Хук `globalThis.__VN_TEST__` и `__VN_APP__`. Настройки касаний хранятся в `localStorage` под ключом `vyshe-neba:ui` вне Profile.

**Инструменты**: `game/tools/economy-bot.mjs` (проверка баланса, `--real` — через sim и автопилот), `game/tools/probe-landing.mjs` (успешность посадок на Луну/Марс). Юнит-тесты запускаются шаблоном `node --test "game/test/**/*.test.mjs"` (форма `node --test game/test/` в Node 24 не работает).
