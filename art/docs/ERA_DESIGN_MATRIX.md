# «Выше неба» — Canonical Era Design Matrix E0–E5

## Status and purpose

Этот документ — **канонический art-direction contract для различимости эпох E0–E5**. Он описывает не историческую реконструкцию реального мира, а целевой визуально-инженерный язык игры «Выше неба».

Он используется вместе с:

- `art/placeables/PRODUCTION_MANIFEST.md` — gameplay role, физические части и lineage конкретного объекта;
- `art/docs/PRODUCTION_CONTRACT_V2.md` — обязательные design/projection/runtime gates;
- `art/style_bible.txt` — общий визуальный язык, свет и pixel-art правила;
- asset brief/prompt — конкретная реализация выбранной эпохи.

Если краткое описание эпохи в старом prompt/manifest противоречит этой матрице по **era visual/engineering language**, эта матрица имеет приоритет. Gameplay role, footprint, parts, sockets и конкретная lineage объекта остаются за `PRODUCTION_MANIFEST.md`.

Эпоха не является recolor/filter. Каждый объект должен выглядеть так, будто его действительно спроектировали, изготовили, обслуживали и использовали именно в этой стадии мира игры.

---

# 1. Обязательные оси различия

Для каждого E0–E5 варианта в brief и review должны быть явно определены следующие восемь осей:

1. **Manufacturing / способ изготовления** — кустарная сварка, промышленная серия, модульная сборка, роботизированное производство, интегрированные системы.
2. **Materials / материалы и отделка** — сталь, дерево, пластик, композиты, стекло, smart materials и т.д.
3. **Drive / механика и привод** — ручной, ременной/цепной, гидравлика, электромеханика, servo/robotics, magnetic/contactless systems.
4. **Interface / управление и диагностика** — рычаги, лампы, CRT, flat display, glass interface, spatial/holographic interface.
5. **Lighting / сигналы** — тип источника света, температура, размеры/плотность индикаторов, назначение сигналов.
6. **Infrastructure / кабели, трубы и коммуникации** — открытая проводка, лотки, трассы, закрытые каналы, интегрированные сети.
7. **Autonomy / эксплуатация и сервис** — ручное обслуживание, сервисная бригада, диагностика, modular replacement, autonomous/robotic/self-calibrating operation.
8. **Silhouette / архитектура и форма** — тяжёлая открытая механика, индустриальная коробчатость, чистая модульность, glass/robotic architecture, sterile integrated form.

## Lineage gate

Переход `E(n) → E(n+1)` должен:

- заметно изменить **минимум 3 из 8** осей выше;
- сохранить **минимум 2 узнаваемых family-признака** конкретного объекта, если физическая функция позволяет;
- записать `preserved / replaced / added / why / player signal`;
- объяснить функциональную причину изменений, а не только эстетическое желание.

Между E0 и E5 должны радикально отличаться **минимум 6 из 8** осей.

Если соседние эпохи различаются только цветом, количеством лампочек, формой кожуха или уровнем glow — lineage gate не пройден.

## Blind-order test

Если убрать подписи `E0…E5` и годы, reviewer должен уметь расположить варианты в правильном технологическом порядке **по конструкции, материалам, интерфейсу и силуэту**, а не только по палитре.

---

# 2. Сводная матрица

| Ось | E0 / 1978 — Гаражная мечта | E1 / 1986 — Своя мастерская | E2 / 1998 — Испытательный центр | E3 / 2015 — Космический порт | E4 / 2035 — Орбитальная эра | E5 / 2060 — Горизонт будущего |
| --- | --- | --- | --- | --- | --- | --- |
| Образ | полукустарная государственно/военно-инженерная утилитарность | стандартизованная промышленная мастерская | электронный испытательный комплекс | зрелая современная аэрокосмическая инфраструктура | автономная роботизированная инфраструктура со стеклянной архитектурой | стерильная постэкранная интегрированная космическая инфраструктура |
| Производство | ручная сборка, сварка, локальный ремонт | серийные узлы, стандартные шкафы/крепёж | CNC/серийная электромеханика, racks | модульное производство | robotic assembly, autonomous modules | высокоинтегрированное автоматизированное производство |
| Материалы | сварная сталь, трубы, уголок, дерево, резина | окрашенная сталь, алюминий, ранние промышленные пластики | сталь/алюминий + бежево-серый пластик | композиты, алюминий, engineering plastics | лёгкие сплавы, композиты, **панорамное/витражное стекло** | smart materials, glass-ceramic, seamless composites, integrated surfaces |
| Механика | ручная, винтовая, ременная, цепная | гидравлика + электромоторы | motorized/servo, редукторы | enclosed precision servos | robotics, autonomous manipulators/gimbals | magnetic/contactless actuation, integrated actuators |
| UI | аналоговые шкалы, тумблеры, редкие monochrome CRT | кнопки, лампы, ранняя электроника, ранние color CRT где оправдано | CRT/racks/diagnostics | flat displays, digital panels | glass/transparent contextual panels | **spatial 3D holographic interfaces; permanent screens largely disappear** |
| Свет | тусклый тёплый incandescent, red/amber, редкий green | ярче, больше red/amber/green indicators | fluorescent/neutral white + early LEDs | neutral/cool white LEDs | cool white + controlled blue/cyan architectural/status light | cold clean white/blue-white + integrated functional light lines |
| Кабели/трубы | открытые | жгуты, лотки, pipe racks | организованные трассы, connectors | в основном внутри модулей | почти скрытые, внешние service points | почти полностью интегрированы |
| Автономность | человек делает почти всё | машина помогает оператору | автоматизированы отдельные операции | оператор управляет цифровой системой | система сама выполняет значительную часть работы | self-calibrating / highly autonomous system |
| Мобильность | колёса, рельсы, тележки | forklifts/cranes/wheels | специализированные vehicles/electric carts | low-profile service vehicles | autonomous wheeled/robotic platforms | **hover/levitation/magnetic pads или иной физически объяснимый contactless transport вместо обычной езды** |
| Архитектура | металл, бетон, ангары | функциональные индустриальные корпуса | лаборатории/испытательные здания | современный commercial/institutional spaceport | **крупное остекление, curtain-wall/витражные фасады, прозрачные переходы** | sterile seamless structures, transparent/smart surfaces, minimal visible infrastructure |
| Цвет | olive, gray-green, steel, dirty beige | industrial gray + safety yellow/orange/red | beige, gray, dark gray | off-white, light gray, graphite | white/light metal/glass + restrained cold accents | sterile white/light metal + cold blue-white functional accents |

---

# 3. E0 / 1978 — «Гаражная мечта»

## Design thesis

Функция важнее внешнего вида. Техника выглядит собранной небольшой инженерной командой из доступных деталей, ремонтируется на месте и сохраняет культурный язык ранней государственно/военно-инженерной космической инфраструктуры. Это **art-direction target**, а не утверждение, что вся реальная космическая техника 1978 года выглядела одинаково.

## Required signals

- грубые или хорошо читаемые сварные швы;
- трубы, уголок, листовая сталь, видимый крепёж;
- открытые шарниры, подшипники, редукторы и service points;
- ручные маховики, рычаги, тумблеры, механические стопоры;
- ременные, цепные, винтовые или ручные приводы там, где функция их допускает;
- стрелочные приборы и механические шкалы;
- редкие большие indicator lamps;
- открытая проводка и кабельные жгуты допустимы, если они реально соединяют узлы;
- матовые olive/gray-green/steel/dirty-beige материалы; safety red/yellow используются функционально;
- дерево допустимо для ящиков, настилов, временных/простых элементов, но не добавляется без инженерной причины.

## Displays and light

- display необязателен: большинство простых объектов обходится без экрана;
- если дисплей нужен функции — небольшой monochrome CRT/осциллографический тип, выпуклое стекло, массивный корпус;
- свет: тёплый incandescent/amber, красный аварийный, редкий зелёный `ready`;
- световых точек мало, они крупнее и физически заметнее.

## Forbidden shorthand

- современный чистый plastic enclosure;
- flat screen;
- thin LED strips;
- декоративный cyan;
- стерильная бесшовная форма;
- скрытая магическая механика без сервисного доступа.

---

# 4. E1 / 1986 — «Своя мастерская»

## Design thesis

Главный переход: **самоделка → промышленный стандарт**. Функция уже оформляется как серийное оборудование единого предприятия.

## Required signals

- стандартизованные сварные/штампованные узлы;
- окрашенные metal cabinets и service covers;
- гидравлика и более уверенные электромеханические приводы;
- унифицированные разъёмы, выключатели, кнопки;
- кабельные лотки, жгуты, аккуратные pipe racks;
- safety colors начинают помогать навигации и обслуживанию;
- больше небольших indicator lamps и status groups;
- защитные кожухи вокруг опасной механики, но принцип работы всё ещё видим.

## Displays and light

- monochrome CRT остаётся нормой там, где нужен экран;
- ранний color CRT допустим для информационно насыщенных систем, но не обязателен для каждого объекта;
- red/amber/green indicators становятся плотнее и ярче;
- рабочее освещение остаётся утилитарным, не декоративным.

## Palette

Industrial gray/olive, painted steel, safety yellow/orange/red, небольшие функциональные green/blue accents.

---

# 5. E2 / 1998 — «Испытательный центр»

## Design thesis

**Промышленная механика → сложная электромеханическая система с диагностикой.** Визуально E2 может быть сложнее и «загруженнее» E3, потому что электроника ещё не успела полностью интегрироваться.

## Required signals

- electric motors, servo drives, motor-reducers;
- cable loops и организованные cable routes;
- electronic racks, ventilation grilles, service panels;
- diagnostic connectors и replaceable electronics;
- CRT-based operator/diagnostic stations, если объект их требует;
- beige/gray plastics alongside steel/aluminium;
- маркированные кабели/трубопроводы и развитая сервисная инфраструктура;
- больше мелких LEDs, но они сгруппированы по функции.

## Displays and light

- CRT dominates screen-based equipment;
- LCD допустим как ранний специализированный элемент, но не должен превращать E2 в E3;
- fluorescent/neutral work light;
- red/green/amber LEDs, occasional blue service indicator.

## Silhouette signal

Больше box/rack/modules и внешних service connections, чем в E3.

---

# 6. E3 / 2015 — «Космический порт»

## Design thesis

**Испытательная электромеханика → зрелая современная модульная инфраструктура.** Это первая эпоха, которая может уверенно выглядеть как современный коммерческий/институциональный spaceport, а не закрытый испытательный полигон.

## Required signals

- modular replaceable assemblies;
- composites, aluminium, engineering plastics;
- enclosed precision servos;
- hidden/organized cabling;
- clean service doors and standardized modules;
- flat LCD/OLED-style displays where an interface is required;
- меньше exposed mechanism, но физические joints/actuators всё ещё читаются;
- neutral/off-white/light-gray/graphite palette.

## Light

- neutral/cool white LED work light;
- compact status indicators;
- accent color is functional, not decorative.

## Silhouette signal

Чище и проще E2: меньше внешних коробок/кабелей, больше крупных спокойных поверхностей и понятных модулей.

---

# 7. E4 / 2035 — «Орбитальная эра»

## Design thesis

**Цифровая инфраструктура → автономная роботизированная инфраструктура с выраженным архитектурным языком стекла.** E4 обязана отличаться от E3 не только сенсорами и цветом.

## Buildings — required E4 architectural signal

Для зданий и крупных стационарных сооружений, где это физически/функционально уместно, E4 SHOULD использовать:

- крупное панорамное/витражное остекление;
- curtain-wall glass facades;
- прозрачные service galleries / переходы;
- стеклянные диспетчерские и наблюдательные объёмы;
- светлую металлическую несущую структуру, видимую рядом со стеклом;
- прозрачные protective enclosures вокруг части оборудования.

`Витражное` здесь означает **крупное архитектурное остекление**, а не декоративные цветные церковные витражи.

Стекло не добавляется туда, где оно ухудшает физическую безопасность или не имеет функции. Маленький технический маяк не обязан внезапно становиться стеклянным зданием.

## Machines and mechanisms

- autonomous sensor-rich equipment;
- robotic cells и manipulators;
- enclosed precision drives;
- automatic calibration mechanisms;
- unmanned service vehicles/platforms;
- conventional wheels/tracks/rails ещё допустимы и могут доминировать у mobile equipment E4;
- кабины оператора могут исчезать, если машина автономна.

## Interface and light

- glass/transparent contextual panels допустимы;
- physical screens ещё существуют;
- cool white light + restrained blue/cyan status accents;
- architectural light lines уже возможны, но остаются локальными и функциональными.

## Forbidden shorthand

E4 нельзя получать из E3 простой заменой серого на белый и добавлением cyan glow. Должна читаться автономность/robotics и, для архитектуры, новый glass language.

---

# 8. E5 / 2060 — «Горизонт будущего»

## Design thesis

**Автономная роботизированная инфраструктура → стерильная постэкранная интегрированная система.** E5 должна быть с первого взгляда отличима от E4 даже в grayscale.

## Overall material/silhouette language

- sterile white/light-metal surfaces;
- seamless or nearly seamless smart/composite materials;
- very low exposed-cable density;
- минимальное число случайных крышек, болтов и внешних boxes;
- large calm surfaces;
- embedded sensors и actuators;
- transparent/smart-glass elements where they serve function;
- cold blue-white functional accents;
- silhouette должен оставаться физически объяснимым, а не превращаться в абстрактную sci-fi форму.

## Post-screen interface

Для систем, которым нужен сложный интерфейс:

- постоянный physical rectangular screen **обычно исчезает**;
- основной advanced UI — spatial/volumetric 3D holographic interface, projected into space;
- physical object должен содержать читаемый emitter/projector/aperture/interface node, объясняющий появление UI;
- AI source art рисует **физический emitter/hardware**, а active hologram content, volumetric graphics, glow and animation принадлежат коду;
- если конкретный объект вообще не требует интерфейса, голограмма не добавляется только ради эпохи.

## Mobility — E5 default

Для мобильной наземной техники E5 базовая art-direction установка:

- обычная езда на колёсах/гусеницах **заменяется** hover/levitation/contactless locomotion;
- предпочтительные физически объяснимые решения: magnetic/field lift pads, electromagnetic lift modules, directed lift/other documented mechanism;
- sprite обязан показывать physical lift modules / magnetic plates / stabilizers / emitters;
- объект нельзя просто поднять над землёй без объясняющего hardware;
- само hovering motion, field glow, distortion и lift FX — code-owned;
- исключение допускается для объекта, где обязательный контакт с поверхностью является частью функции; причина должна быть записана в brief.

## Light language

E5 характерны:

- integrated light lines;
- embedded status paths;
- cold clean white and blue-white illumination;
- thin directional emitters;
- luminous routing/status surfaces;
- spatial indicators.

Каждая световая линия должна иметь назначение: state, path, load, lock, routing, warning, transfer, navigation и т.п. Пустая поверхность не украшается cyan strip только потому, что это E5.

## Holograms / cyan / levitation rule

E5 **может и должен** использовать holographic/spatial interfaces, levitation systems, integrated light lines и cold blue-white accents как характерные технологии эпохи, когда они соответствуют функции объекта.

Одновременно запрещено использовать hologram/cyan glow/levitation/light strips:

- как generic decoration;
- как замену реального механизма, который должен иметь физические части;
- без emitter/actuator/lift hardware;
- как одинаковый stamp на каждом объекте;
- как baked active FX в production source, если состояние должен контролировать код.

Mood target — стерильная высокотехнологичная инфраструктура с функциональными luminous paths и минимальной визуальной грязью. Не копировать узнаваемые proprietary designs из внешних игр/фильмов.

---

# 9. Эволюция света и индикации

| Era | Рабочий свет | Status / indication | Обязательный характер |
| --- | --- | --- | --- |
| E0 | тёплый incandescent | крупные red/amber, редкий green | мало источников, крупные физические лампы |
| E1 | incandescent/fluorescent industrial | red/amber/green groups | больше сигналов, стандартизация |
| E2 | fluorescent/neutral white | lamps + early LEDs | плотная diagnostic indication |
| E3 | neutral/cool white LED | compact status LEDs | чистая локальная индикация |
| E4 | cool white + architectural light | glass-panel/edge status segments | интеграция света в architecture/modules |
| E5 | cold clean white/blue-white | embedded light lines + spatial indicators | свет становится частью интерфейса и маршрутизации |

Эта таблица описывает **собственные физические источники света объекта и их art-direction**. Она не заменяет общую lighting sentence из `art/style_bible.txt`: global upper-left key light остаётся обязательным.

---

# 10. Причинный контракт объекта

До generation каждый объект обязан отвечать:

1. Почему он существует в gameplay/world?
2. Почему он расположен именно здесь?
3. Почему его функция нужна игроку/базе/ракете?
4. Почему эта функция в данной эпохе реализована именно такими материалами, приводами и интерфейсами?
5. Какие детали являются обязательными следствиями функции, а какие были бы случайным decoration?
6. Что сохраняет identity family между эпохами?
7. Что изменяется технологически и почему?
8. Как игрок визуально понимает upgrade без подписи года?

Нет причинного ответа → соответствующий design/generation gate `BLOCKED`.

---

# 11. Причинный контракт движения, индикации и FX

Любая анимация/индикация/искрение/утечка/луч/голограмма/hovering обязана иметь:

- trigger;
- precondition;
- affected physical part или emitter;
- state before/after;
- физическую/игровую причину;
- termination/cancel/cooldown;
- visual signal для игрока.

Примеры допустимой эволюции одного и того же сигнала:

- E0: одна крупная incandescent lamp;
- E1: группа стандартизованных signal lamps;
- E2: diagnostic LED bank;
- E3: compact digital status module;
- E4: glass/edge status segment;
- E5: embedded light path + optional spatial state indicator.

Это не означает, что каждый объект обязан иметь все перечисленные элементы. Сигнал появляется только при функциональной необходимости.

AI рисует физические lamp housings, projectors, emitters, lift modules, joints и другие hardware parts. Code owns active light, glow, holographic content, field visualization, levitation motion, particles, beams, sparks, leaks and other stateful FX.

---

# 12. Brief / prompt requirements

Для каждой генерируемой эпохи brief/prompt обязан зафиксировать:

- выбранный era profile из этого документа;
- минимум 2 family traits, которые должны сохраниться от предыдущей approved эпохи;
- минимум 3 axis changes относительно предыдущей эпохи (для E0 — исходное состояние всех применимых осей);
- materials/manufacturing;
- drive/mechanics;
- interface/display;
- light/signals;
- cabling/piping/infrastructure;
- autonomy/service;
- silhouette/architecture;
- причинный gameplay role;
- что рисует AI и что остаётся code-owned.

Нельзя просить image generator просто «make it more futuristic / more modern».

Для E1–E5 используется предыдущая exact-approved era как основной lineage reference; E0 остаётся family anchor reference, если это помогает не потерять identity.

---

# 13. Review checklist

Era review блокирует approval, если выполняется хотя бы одно:

- соседние эпохи выглядят как recolor;
- не выполнен minimum 3-axis transition;
- потеряна identity family без записанной причины;
- объект содержит периодически неуместный UI/material/drive без обоснования;
- E4 не показывает robotics/autonomy, а крупная E4 architecture игнорирует glass language без причины;
- E5 mobile vehicle просто имеет скрытые колёса, хотя brief не документирует исключение;
- E5 hologram висит в воздухе без physical emitter;
- light strips/cyan/glow используются как generic decoration;
- active hologram/glow/field baked into source вместо code-owned state;
- future variant становится физически непонятным;
- camera/projection family нарушена ради более эффектной формы.

---

# 14. Exceptions

Матрица задаёт язык мира, но не должна ломать физическую функцию.

Осознанное отклонение разрешено только когда brief явно фиксирует:

- какое правило не применяется;
- почему функция/безопасность/gameplay требуют исключение;
- какой другой сильный era signal компенсирует исключение;
- reviewer acceptance.

`Artistic freedom` не является достаточным объяснением сама по себе.
