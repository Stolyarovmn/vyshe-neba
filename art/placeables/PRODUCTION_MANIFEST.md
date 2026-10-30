# «Выше неба» — Production Manifest: Placeables

Канонический production-документ для покупаемых и расставляемых объектов базы и мастерской.

> Это **design target**, а не описание уже реализованной механики. Размеры, сокеты и эффекты ниже — решения для следующего production pass.
>
> Дополнительный обязательный дизайн/проекция/runtime контракт: [`art/docs/PRODUCTION_CONTRACT_V2.md`](../docs/PRODUCTION_CONTRACT_V2.md). Для новых/изменяемых семейств — [`ASSET_BRIEF_TEMPLATE.md`](../docs/ASSET_BRIEF_TEMPLATE.md). Угол камеры острова не подтверждён: не подставлять 47° без измерения и approval. Механики и размеры ниже не считаются реализованными, пока их не подтвердил runtime на проверенном commit.

## Источники истины

1. `art/style_bible.txt` — визуальный язык; добавляется **дословно** к каждому image-generation prompt.
2. Этот manifest — роль объекта, целевой размер, состав частей, характер движения и технологическая эволюция.
3. Утверждённый anchor-art в `art/gen/` — фактическая геометрия.
4. Runtime metadata — реальные pivot/anchor, **измеренные по утверждённому арту**, а не угаданные заранее.

Правило ref2game: AI рисует физические части; код управляет движением, состоянием, FX, светом, частицами и реакцией на события. Нельзя изображать работу механизма покачиванием/вращением целого PNG, если у него есть реальные движущиеся части.

---

## 1. Эпохи

| id | год | база | визуальная логика |
|---|---:|---|---|
| E0 | 1978 | Гаражная мечта | ручная сборка, открытая механика, сварная сталь, дерево, стрелочные приборы |
| E1 | 1986 | Своя мастерская | промышленная мастерская, гидравлика, окрашенные шкафы, ранняя электроника |
| E2 | 1998 | Испытательный центр | CRT, стойки аппаратуры, сервоприводы, кабельные трассы, моторизация |
| E3 | 2015 | Космический порт | модульное оборудование, композиты, плоские дисплеи, аккуратные закрытые приводы |
| E4 | 2035 | Орбитальная эра | роботизированные ячейки, автономные манипуляторы, закрытая механика |
| E5 | 2060 | Горизонт будущего | лёгкие интегрированные системы и умные материалы, но физическая функция остаётся читаемой |

Каждый объект имеет E0–E5 и должен восприниматься как **одна инженерная родословная**, а не шесть несвязанных картинок.

Будущее не означает «залить cyan и добавить голограмму». Если функцию выполняет механизм, его физическая логика должна оставаться видимой.

---

## 2. Runtime contract

- Координаты: текущая логическая сцена `960×600`.
- Размеры ниже заданы в **LP**.
- `footprint` — целевой видимый envelope без временных FX.
- До проверки в сцене допустимо `±10%`; после утверждения `±5%`.
- Наземные объекты по умолчанию используют placement anchor `bottom-center`.
- Указанные ниже pivot — **design intent**. Финальные координаты измеряются на импортированном спрайте.
- Все независимо движущиеся части рисуются как отдельные полные детали, включая обычно скрытые области.
- Glow, экранные данные, лазеры, дым, искры, лучи, траектории, тени и частицы — код.
- Все части одной линейки сохраняют масштаб и registration при смене эпохи.

### Runtime atlas после утверждения

```text
E0 | E1 | E2
E3 | E4 | E5
```

Каждая независимо движущаяся деталь получает собственный era-atlas. Если детали в ранней эпохе нет — соответствующая cell прозрачная, размер atlas не меняется.

### Production workflow

```text
E0 full anchor
→ review
→ E0 part sheet
→ E1 variant from approved E0
→ E2 variant from approved E1 + E0 reference
→ ... → E5
→ normalize
→ measure real pivots
→ pack era atlases
→ rig in code
→ render motion sheet
→ QA
```

Не генерировать все несвязанные объекты одним листом.

---

## 3. Animation state contract

Все живые placeables используют причинную машину состояний:

```text
OFF → IDLE → NOTICE → WORK → FINISH → COOLDOWN → IDLE
```

`WORK` всегда запускается игровым событием. Idle-анимация редкая, несинхронная и вторичная.

Основные события:

```text
workshop_enter
safe_landing
perfect_landing
crash_return
upgrade_purchased
loadout_changed
item_fabricated
launch_prepare
flight_return
contract_complete
era_changed
```

Мастерская должна рассказывать историю последнего полёта, а не быть комнатой с десятью одинаковыми бесконечными loop-анимациями.

---

# 4. BASE PLACEABLES

## B01 — Метеокомплекс (`weather_complex`)

- **socket:** `roof | yard`
- **footprint:** `96×122 LP`
- **value:** Information
- **cost target:** M ≈ 4 успешных полёта
- **mechanic:** показывает два заранее сгенерированных погодных окна следующего запуска. Игрок выбирает стартовать сейчас или один раз переключиться на второе окно. Без бесконечного reroll.
- **parts:** `body` static; `sensor` rotary; `vane` wind-reactive; `indicator` state.
- **pivot intent:** body bottom-center; sensor head center; vane mast attachment.
- **motion:** preview — полный проход сенсора; vane/cups следуют общей силе ветра; выбор окна подтверждается коротким механическим/световым откликом.
- **lineage:** E0 трубная мачта + чашечный анемометр + флюгер → E1 промышленная мачта и механический погодный радар → E2 моторизованная radar-head + CRT cabinet → E3 модульная цифровая станция → E4 lidar-head → E5 компактный многоспектральный атмосферный узел.

## B02 — Радар сопровождения (`tracking_radar`)

- **socket:** `tower | roof | yard`
- **footprint:** `134×118 LP`
- **value:** Information
- **cost target:** L ≈ 6–7 полётов
- **mechanic:** раньше предупреждает об опасностях/полезных объектах; развитый вариант показывает предполагаемую точку сближения. Физику ракеты не меняет.
- **parts:** `pedestal`; `azimuth`; `dish`; `feed`.
- **pivot intent:** vertical axis над pedestal; dish yoke center.
- **motion:** sector search → detect/track target → return to search.
- **lineage:** E0 грубая направленная антенна → E1 параболическая тарелка → E2 моторизованная компактная РЛС → E3 phased-array panel → E4 distributed sensor head → E5 многоспектральный массив на точной поворотной рамке.

## B03 — Система посадочного наведения (`landing_guidance`)

- **socket:** `pad_left | pad_right`
- **footprint одного маяка:** `46×82 LP`; покупка ставит симметричную пару.
- **value:** Information / Capability
- **cost target:** M
- **mechanic:** показывает прогноз точки касания, безопасный коридор и состояние захода; не управляет ракетой.
- **parts:** `base`; `head` aiming; `lamp` state.
- **motion:** head отслеживает ракету; safe/unsafe меняют pattern; touchdown даёт короткое подтверждение.
- **lineage:** E0 тренога + визир + лампа → E1 секционный радиомаяк → E2 моторизованный tracker → E3 laser-optical beacon → E4 autonomous tracker → E5 компактный распределённый directional beacon.

## B04 — Аварийно-спасательный комплекс (`recovery_complex`)

- **socket:** `service_road | yard`
- **footprint:** `164×92 LP`
- **value:** Economy
- **cost target:** L
- **mechanic:** после аварии возвращает часть rebuild-cost как спасённые компоненты. Первичная balance target: около 15%; будущий потолок 30–35%.
- **parts:** `vehicle`; `boom_lower`; `boom_upper`; `hook`; `salvage` payload.
- **pivot intent:** wheel contact center; crane root; elbow; hook cable end.
- **motion:** crash_return → подъезд → разворот стрелы → захват → подъём → укладка.
- **lineage:** E0 старый грузовик + ручная лебёдка → E1 автокран → E2 специализированная recovery-машина → E3 низкий service tug → E4 автономный эвакуатор → E5 беспилотная recovery-platform с компактным многозвенным манипулятором.

## B05 — Топливное хозяйство (`fuel_depot`)

- **socket:** `yard | pad_right`
- **footprint:** `150×128 LP`
- **value:** Economy / Capability
- **cost target:** L
- **mechanic:** после безопасной посадки часть остатка топлива можно сохранить в наземный резерв; перед следующим стартом — оставить резерв или долить его в ракету. Начальная balance target: до 25% остатка.
- **parts:** `tank`; `pump`; `transfer_boom`; `nozzle`; `level`.
- **motion:** recovery/refuel — boom реально подключается к ракете; level меняется по фактическому объёму.
- **lineage:** E0 бочки + ручной насос → E1 вертикальная цистерна → E2 промышленный узел с поворотной стрелой → E3 модульные изолированные баки → E4 robotic cryogenic arm → E5 компактный замкнутый fuel-cycle.

## B06 — Центр дальней связи (`deep_comms`)

- **socket:** `roof | tower | background`
- **footprint:** `122×142 LP`
- **value:** Capability
- **cost target:** M
- **mechanic:** активных незавершённых контрактов становится 4 вместо 3; также открывается ограниченная замена одного нежелательного контракта другим без покупки награды.
- **parts:** `station`; `azimuth`; `dish`; `status`.
- **motion:** contract_complete/reroll вызывает реальное наведение и короткую передачу.
- **lineage:** E0 радиомачта → E1 satellite dish → E2 motorized communications dish → E3 digital hub → E4 combined laser/radio head → E5 distributed directional comm array.

## B07 — Грузовой терминал (`cargo_terminal`)

- **socket:** `yard | service_road`
- **footprint:** `178×126 LP`
- **value:** Capability
- **cost target:** XL ≈ 9–12 полётов
- **mechanic:** открывает cargo contracts. Лёгкий/средний/тяжёлый груз меняет массу/инерцию и сложность посадки, увеличивая награду.
- **parts:** `gantry`; `trolley`; `hoist`; `hook`; `container` payload.
- **motion:** физическая погрузка/разгрузка контейнера; trolley и hoist движутся независимо.
- **lineage:** E0 ручная таль + ящики → E1 погрузчик/малый портал → E2 моторизованный складской кран → E3 container terminal → E4 autonomous cargo gantry → E5 high-precision logistics node с физическим адаптивным захватом.

---

# 5. WORKSHOP PLACEABLES

## W01 — Сервисный подъёмник (`service_lift`)

- **socket:** `rocket_left | rocket_right | floor_back`
- **footprint:** `190×230 LP`
- **value:** Capability
- **cost target:** M
- **mechanic:** сохраняет несколько loadout-пресетов и применяет выбранную конфигурацию одним действием.
- **parts:** `frame`; `carriage`; `arm_upper`; `arm_lower`; `gripper`; `tool` variant.
- **pivot intent:** carriage rail; shoulder; elbow; wrist.
- **motion:** workshop_enter — подходит к ракете; loadout_changed — реально снимает/ставит модуль; launch_prepare — парковка.
- **lineage:** E0 chain hoist + welded frame → E1 hydraulic lift → E2 bridge service frame → E3 modular service rig → E4 dual robotic arms → E5 ring service system с несколькими реальными jointed manipulators.

## W02 — Испытательный стенд двигателя (`engine_test_stand`)

- **socket:** `floor | floor_back`
- **footprint:** `190×126 LP`
- **value:** Capability
- **cost target:** L
- **mechanic:** перед полётом позволяет испытать и выбрать один временный режим: тяга / экономия / охлаждение. Initial effect target: 5–8%, чтобы не заменить постоянные upgrades.
- **parts:** `frame`; `clamp_left`; `clamp_right`; `mount`; `instrument`.
- **motion:** clamps close → burn → instruments react/vibration → shutdown → clamps open. Flame/heat are code FX.
- **lineage:** E0 грубая огневая рама → E1 промышленный стенд → E2 sensor/CRT test stand → E3 enclosed modular test-cell → E4 robotic self-positioning stand → E5 adaptive real-time test-cell.

## W03 — Телеметрический пост (`telemetry_post`)

- **socket:** `wall | floor_back`
- **footprint:** `156×124 LP`
- **value:** Information
- **cost target:** M
- **mechanic:** показывает траекторию, скорость, расход, повреждения и события; развитый вариант сравнивает последний полёт с лучшим и позволяет ghost-траекторию.
- **parts:** `desk`; `display`; `recorder`; `indicator`.
- **motion:** flight_return — данные постепенно приезжают на приборы; idle почти статичен.
- **lineage:** E0 бумажный самописец → E1 oscilloscopes/printer → E2 multi-CRT telemetry rack → E3 digital telemetry desk → E4 projected trajectory surface → E5 spatial interactive flight model над физической workstation.

## W04 — Пилотажный тренажёр (`flight_simulator`)

- **socket:** `floor | floor_front`
- **footprint:** `172×160 LP`
- **value:** Capability
- **cost target:** XL
- **mechanic:** тренировочные полёты без rebuild-cost, расходников, наград и влияния на основную статистику.
- **parts:** `base`; `pod`; `actuator_left`; `actuator_right`; `canopy`.
- **motion:** pod движется по реальному simulated flight state; canopy открывается только enter/exit.
- **lineage:** E0 карданное кресло → E1 hydraulic training cabin → E2 CRT motion simulator → E3 panoramic electric simulator → E4 robotic/VR capsule → E5 lightweight adaptive multi-axis simulation cell.

## W05 — Производственный участок (`manufacturing_cell`)

- **socket:** `floor_back | wall`
- **footprint:** `176×134 LP`
- **value:** Economy / Capability
- **cost target:** L
- **mechanic:** производит выбранный существующий расходник за несколько завершённых полётов. Начальная цель: 1 предмет за 3–4 полёта. Никакого real-time timer.
- **parts:** `machine`; `workhead`; `spindle`; `door`; `part` payload.
- **motion:** после завершённых полётов — короткие производственные сессии; finish физически перемещает готовую деталь в output tray.
- **lineage:** E0 workbench + lathe → E1 industrial lathe/mill → E2 CNC → E3 enclosed machining center → E4 robotic manufacturing cell → E5 autonomous multi-head fabricator.

## W06 — Стенд диагностики корпуса (`hull_diagnostics`)

- **socket:** `rocket_left | rocket_right | floor_back`
- **footprint:** `184×220 LP`
- **value:** Information / Capability
- **cost target:** M
- **mechanic:** показывает текущие реальные пределы безопасной посадки/прочность; после scan можно поставить одноразовую защитную накладку, снижающую первый удар.
- **parts:** `arch`; `scan_carriage`; `scanner`; `pad_unit`.
- **motion:** scanner проходит вдоль корпуса и замедляется у фактической damage-zone.
- **lineage:** E0 ручная measuring frame → E1 motorized measurement arch → E2 ultrasound rig → E3 laser scanner → E4 robotic inspection frame → E5 lightweight multisensor structural scanner.

## W07 — Стенд авионики (`avionics_bench`)

- **socket:** `wall | floor_back`
- **footprint:** `156×118 LP`
- **value:** Capability
- **cost target:** M
- **mechanic:** выбирается один пакет HUD-информации: Поиск / Навигация / Безопасность. Одновременно активен только один.
- **parts:** `bench`; `panel`; `probe_arm`; `probe`; `module` variant.
- **motion:** panel open → probe connects → diagnostics → disconnect → park.
- **lineage:** E0 radio-tube bench → E1 instrument desk → E2 electronics rack → E3 calibration station → E4 robotic electronics lab → E5 self-configuring avionics cell с физическими сменными модулями.

## W08 — Покрасочная камера (`paint_booth`)

- **socket:** `floor_back | rocket_right`
- **footprint:** `194×228 LP`
- **value:** Expression
- **cost target:** L
- **mechanic:** основной/вторичный/акцентный цвет, сохранённые схемы и позднее материалы. **Игровых бонусов нет**.
- **parts:** `booth`; `rail_carriage`; `arm_upper`; `arm_lower`; `nozzle`.
- **motion:** carriage и arm проходят вдоль корпуса; код применяет окраску за фронтом инструмента.
- **lineage:** E0 curtain + suspended spray gun → E1 ventilated booth → E2 motorized paint booth → E3 clean robotic booth → E4 smart-coating robot → E5 programmable material booth с видимым физическим applicator.

## W09 — Карусель быстрого снаряжения (`equipment_carousel`)

- **socket:** `floor_front | wall`
- **footprint:** `126×176 LP`
- **value:** Capability
- **cost target:** L
- **mechanic:** дополнительная единица **одного** выбранного расходника на следующий полёт; не удваивает весь инвентарь.
- **parts:** `rack`; `carousel`; `picker`; `gripper`; `crate` payload.
- **motion:** carousel индексируется до нужной ячейки → picker забирает контейнер → передача к ракете → park.
- **lineage:** E0 open manual rack → E1 chain-driven carousel → E2 automatic parts magazine → E3 closed vertical robotic carousel → E4 autonomous inventory cell → E5 compact dynamic-storage ring с физическими контейнерами.

## W10 — Навигационный стол (`navigation_table`)

- **socket:** `floor_front | wall`
- **footprint:** `168×112 LP`
- **value:** Information
- **cost target:** M
- **mechanic:** задаёт личную цель следующего полёта: высота / кольца / пункт назначения / остаток топлива. Денежной награды не создаёт.
- **parts:** `table`; `plotter`; `projector`; `marker`.
- **motion:** plan строится по запросу; flight_return накладывает реальную траекторию на план.
- **lineage:** E0 paper map + mechanical coordinate plotter → E1 light table → E2 CRT plotting desk → E3 digital planning table → E4 volumetric trajectory projection → E5 spatial mission-planning table с физической sensor-frame.

---

# 6. Prompt recipe

Для каждой генерации:

```text
[VERBATIM art/style_bible.txt]

ASSET
<name + slug>

ROLE
<mechanic; what player understands by looking at it>

GAMEPLAY FOOTPRINT
<WxH LP target; final scale normalized by code>

RIG PART
<full object anchor OR exact isolated part>

ERA
<E0..E5 global era rule>

LINEAGE STAGE
<corresponding stage from object lineage above>

MOTION REQUIREMENT
<which parts must be visually separable, their rails/joints/attachment logic>

CONSTRAINTS
complete uncropped silhouette;
transparent background;
no text, numbers, logos or pseudo-writing;
no baked glow, smoke, particles, cast shadow or motion blur;
all mechanical parts physically plausible;
keep continuity with previous approved era;
artistic deviation is allowed when it clearly improves silhouette/readability/character without breaking function.
```

For E1–E5 use the previous approved era and the approved E0 anchor as visual references. The new era should evolve the same machine, not redesign its identity from scratch.

---

# 7. QA gates

Объект не считается готовым только потому, что PNG красивый.

1. **Anchor review:** стиль, функция, силуэт, масштаб.
2. **Part integrity:** moving pieces complete and separable.
3. **Measured pivots:** координаты измерены на реальном approved art.
4. **Rest reconstruction:** собранный rig в покое совпадает с утверждённым anchor.
5. **Motion contact sheet:** весь WORK-cycle проверяется покадрово.
6. **Transitions:** нет pop между IDLE/NOTICE/WORK/FINISH.
7. **Scene test:** реальная база/мастерская, 100% и уменьшенный масштаб.
8. **Era swap:** смена E0…E5 не ломает footprint, socket и attach points.
9. **Event causality:** WORK запускается реальным событием.
10. **No whole-sprite fake:** работа механизма идёт через его части.

---

# 8. Production order

## Batch A — vertical slice

1. `W01 service_lift`
2. `W02 engine_test_stand`
3. `W03 telemetry_post`
4. `W05 manufacturing_cell`
5. `B01 weather_complex`
6. `B03 landing_guidance`
7. `B05 fuel_depot`
8. `B04 recovery_complex`

Этот batch проверяет основные классы: articulated rig, machine state, information display, manufacturing, wind reaction, flight reaction, service process и crash recovery.

## Batch B

`W04`, `W06`, `W07`, `W08`, `W09`, `W10`, `B02`, `B06`, `B07`.

---

# 9. Economy

Цены пока задаются relative tiers, а не выдуманными coin-values:

- `S` ≈ 2 успешных полёта
- `M` ≈ 4
- `L` ≈ 6–7
- `XL` ≈ 9–12

Фиксированные цены выставляются только после симуляции текущего дохода и сравнения opportunity cost с апгрейдами ракеты.

---

# 10. Renderer requirement

Существующие цельные `base-eras.png` и `interior-eras.png` в будущем должны стать shell/reference, а покупаемая инфраструктура — отдельными слоями:

```text
BASE / INTERIOR SHELL
PLACEABLES BACK
ROCKET / VEHICLES
PLACEABLES FRONT
FX
UI
```

Пока shell extraction не сделан, новые placeables можно генерировать и принимать независимо, но их нельзя навсегда запекать в фон.
