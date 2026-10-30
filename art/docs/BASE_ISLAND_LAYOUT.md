# Стартовый остров и размещение расширений базы

Документ фиксирует геометрию стартового острова и канонические позиции покупок. Машиночитаемый источник геометрии — `art/placeables/BASE_ISLAND_LAYOUT.json` (version 3); при расхождении геометрических чисел прав JSON.

## Остров

Production/reference asset — `art/gen/environment/start_island_hd.png` (`1916×821`). Он **утверждён пользователем**, exact SHA-256 `2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997`, Git blob SHA-1 `382ab3fb2906152e2bc2a2616d794192904e7d68`. Approval: `art/gen/environment/start_island_hd.approval.json`; metadata: `art/gen/environment/start_island_hd.meta.json`; projection measurement: `art/gen/environment/start_island_hd.projection.json`.

Clean runtime path lives separately in `main`: `game/assets/shared/island/start-island.png`. The approved production reference and the verified runtime blob are byte-identical at the recorded evidence baseline. Production `art/gen/...` must not be described as the runtime path under the current branch contract.

Запечённая башня обслуживания удалена из HD reference; стартовая сцена содержит чистый пусковой стол, а покупаемая инфраструктура добавляется отдельно. Старый `start_island_e0.png` может оставаться только как production/history evidence; он не является второй active runtime copy or rollback mechanism.

- Система координат раскладки: пиксели HD-острова, начало слева сверху, Y вниз; placement anchor — низ спрайта по центру.
- Мировые единицы: `1 ед. = 10 м`; origin `(388,375)`; `units_per_px=0.665`.
- Остров: `1916×821 px`.
- Море вокруг острова рисует код; бирюзовая кайма мелководья входит в art.
- Маска суши: `art/gen/environment/start_island_hd.land.json`, cell 8 px.
- `sprite_px` — целевой видимый размер на острове; layout использует приблизительное соотношение `1 LP ≈ 1.45 island px`.

## Проекция

Camera family для наземных покупок — `island_top_3_4` по exact approved reference.

Число **47° не подтверждено** и не используется как факт. Реальный исходный 3D camera angle остаётся `UNKNOWN`.

Из жёлтой пунктирной окружности площадки измерен только generation proxy:

- ground-circle compression `0.958515`;
- orthographic-equivalent elevation `73.4386°`, production control `73.44°`;
- tilt from straight top-down `16.5614°`, production control `16.56°`.

Это proxy для генерации, а не восстановленный угол камеры. Exact SHA-bound reference имеет приоритет. Любой generated ground asset должен дополнительно пройти visual source/scene QA; если он визуально читается ниже/front-side, numeric prompt сам по себе не считается доказательством совпадения.

## Зоны и покупки

| Покупка | Ключ | Зона | Якорь (px острова) | Мир (ед.) | Спрайт (px) | След (px) |
| --- | --- | --- | --- | --- | --- | --- |
| Стартовые маяки | `beacons` | `launch_core` | `(283,395)`; `(493,395)` | `(-69.83,13.3)`; `(69.83,13.3)` | `100×77` | `90×26` |
| Башня обслуживания | `gantry` | `launch_core` | `(480,305)` | `(61.18,-46.55)` | `113×190` | `102×34` |
| Охлаждение площадки | `deluge` | `launch_core` | `(492,452)` | `(69.16,51.21)` | `130×118` | `117×32` |
| Сервисная команда | `service` | `service_central` | `(640,395)` | `(167.58,13.3)` | `120×102` | `108×30` |
| Спасательная станция | `rescue` | `service_central` | `(740,340)` | `(234.08,-23.28)` | `125×115` | `112×30` |
| Топливный комплекс | `fuel` | `fuel_east` | `(870,470)` | `(320.53,63.18)` | `170×93` | `153×32` |
| Логистический терминал | `logistics` | `logistics_east` | `(1200,470)` | `(539.98,63.18)` | `190×105` | `171×34` |
| Производственный цех | `factory` | `industrial_east` | `(920,255)` | `(353.78,-79.8)` | `190×145` | `171×34` |
| Метеостанция | `weather` | `command_north` | `(1000,350)` | `(406.98,-16.62)` | `142×180` | `100×28` |
| Центр управления | `control` | `command_north` | `(1320,250)` | `(619.78,-83.12)` | `170×135` | `153×34` |
| Радар слежения | `radar` | `command_north` | `(860,170)` | `(313.88,-136.33)` | `170×190` | `140×34` |
| Энергетический узел | `energy` | `utility_east` | `(1500,380)` | `(739.48,3.33)` | `200×115` | `180×36` |
| Наблюдательный комплекс | `observation` | `perimeter_east` | `(1380,320)` | `(659.68,-36.58)` | `150×175` | `120×34` |
| Система возврата | `recovery` | `recovery_east` | `(1610,478)` | `(812.63,68.5)` | `200×112` | `180×34` |

Reason/UV values are machine-readable in `BASE_ISLAND_LAYOUT.json` and are not duplicated here as an independent source of truth.

## Объекты-входы

| Объект | Ключ | Якорь (px) | Мир (ед.) | Спрайт (px) | След (px) |
| --- | --- | --- | --- | --- | --- |
| Мастерская | `workshop` | `(330,262)` | `(-38.57,-75.15)` | `130×157` | `114×28` |
| Памятник эпох | `monument` | `(232,276)` | `(-103.74,-65.84)` | `50×120` | `44×22` |
| Доска контрактов | `board` | `(210,352)` | `(-118.37,-15.3)` | `78×72` | `60×20` |
| Лавка | `shop` | `(578,352)` | `(126.35,-15.3)` | `120×98` | `110×30` |

## Связь с asset families

| Семейство | Purchase key | Зона |
| --- | --- | --- |
| `B01_weather_complex` | `weather` | `command_north` |
| `B02_tracking_radar` | `radar` | `command_north` |
| `B03_landing_guidance` | `beacons` | `launch_core` |
| `B04_recovery_complex` | `recovery` | `recovery_east` |
| `B05_fuel_depot` | `fuel` | `fuel_east` |
| `B06_deep_comms` | `control` | `command_north` |
| `B07_cargo_terminal` | `logistics` | `logistics_east` |

Placement rule: у каждой покупки зарезервирован anchor на суше; footprint не должен выходить за остров, пересекать ракету/пламенный канал или конфликтовать с другими объектами.

## Проверка сцены

`BASE_ISLAND_LAYOUT.json` задаёт геометрию, но сам по себе не доказывает текущий runtime render/interaction behavior.

Старые документы ссылались на `game/test/render.island.test.mjs`. На проверенном текущем `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` каталога `game/test` **нет**, поэтому этот test path нельзя называть текущим пройденным gate. Текущий `Game runtime build` проверяет clean runtime tree, разрешение manifest assets и standalone build/checksum; asset-specific island/B03 scene regression нужно выполнять отдельно, когда такой test/QA path реально существует.

## Портретный режим

Любые утверждения о конкретном runtime zoom/pan/hit-test поведении проверяются по коду на pinned `main` commit. Layout geometry не пересчитывается между layout modes; если runtime реализует иное, код на pinned commit имеет приоритет над этим design/layout документом.