# Недостающий арт: промпты для ручной генерации

Статус: постройки ниже пока рисуются в игре кодовыми заглушками (единый силуэт по эпохе). Когда будут готовы настоящие спрайты, они заменят заглушки без изменения логики. Остальной арт (ракеты, ступени, капсулы, самолёты, шары, монеты, кольца, площадки Луны и Марса, готовые постройки, остров) не перегенерируется.

## Что не хватает

| Постройка в игре | Ключ | Семейство | Footprint (LP) | Манифест |
| --- | --- | --- | --- | --- |
| Радар слежения | `radar` | B02 `tracking_radar` | 134×118 | `art/placeables/PRODUCTION_MANIFEST.md` |
| Система возврата | `recovery` | B04 `recovery_complex` | 164×92 | `art/placeables/PRODUCTION_MANIFEST.md` |
| Логистический терминал | `logistics` | B07 `cargo_terminal` | 178×126 | `art/placeables/PRODUCTION_MANIFEST.md` |
| Энергетический узел | `energy` | EN01 `power_node` | 120×110 | новая запись, описана в промптах |
| Наблюдательный комплекс | `observation` | OB01 `observatory` | 130×150 | новая запись, описана в промптах |

## Как генерировать

1. Один запрос = один объект = одна эпоха. Порядок внутри семейства строгий: E0 → E1 → E2 → E3 → E4 → E5. E1–E5 генерируются с прикреплённым утверждённым предыдущим изображением (и E0 для E2+), как требует `art/docs/ASSET_PRODUCTION_PIPELINE.md`.
2. Берите файл промпта целиком: в нём дословно вставлены `art/style_bible.txt` и строка освещения. Ничего не добавляйте и не сокращайте.
3. Результат: PNG с прозрачным фоном, квадратный холст. Отбраковывайте картинку, если на ней несколько объектов, сетка, подписи, цифры, фон, земля, тень, свечение или дым.
4. Сохраняйте файлы в `art/incoming/<slug>/eN_YEAR.png` (например `art/incoming/tracking_radar/e0_1978.png`) и сообщите мне. Я прогоню их через пайплайн (нормализация, QA, регистрация), проверю на сцене и заменю заглушки.
5. Оригиналы желательно положить на Google Drive в `vyshe-neba/art-originals/base/<код>_<slug>/` с именем `<код>_E0_1978_<id>.png`; id файла запишу в provenance. Если неудобно, достаточно `art/incoming/`: я зафиксирую SHA-256.
6. Можно начать с E0 каждого семейства, чтобы увидеть стиль; остальные эпохи генерируйте цепочкой после утверждения E0.

## Файлы промптов

| Семейство | E0 | E1 | E2 | E3 | E4 | E5 |
| --- | --- | --- | --- | --- | --- | --- |
| B02 Радар слежения | [`e0_1978`](../prompts/missing/tracking_radar_e0_1978.txt) | [`e1_1986`](../prompts/missing/tracking_radar_e1_1986.txt) | [`e2_1998`](../prompts/missing/tracking_radar_e2_1998.txt) | [`e3_2015`](../prompts/missing/tracking_radar_e3_2015.txt) | [`e4_2035`](../prompts/missing/tracking_radar_e4_2035.txt) | [`e5_2060`](../prompts/missing/tracking_radar_e5_2060.txt) |
| B04 Система возврата | [`e0_1978`](../prompts/missing/recovery_complex_e0_1978.txt) | [`e1_1986`](../prompts/missing/recovery_complex_e1_1986.txt) | [`e2_1998`](../prompts/missing/recovery_complex_e2_1998.txt) | [`e3_2015`](../prompts/missing/recovery_complex_e3_2015.txt) | [`e4_2035`](../prompts/missing/recovery_complex_e4_2035.txt) | [`e5_2060`](../prompts/missing/recovery_complex_e5_2060.txt) |
| B07 Логистический терминал | [`e0_1978`](../prompts/missing/cargo_terminal_e0_1978.txt) | [`e1_1986`](../prompts/missing/cargo_terminal_e1_1986.txt) | [`e2_1998`](../prompts/missing/cargo_terminal_e2_1998.txt) | [`e3_2015`](../prompts/missing/cargo_terminal_e3_2015.txt) | [`e4_2035`](../prompts/missing/cargo_terminal_e4_2035.txt) | [`e5_2060`](../prompts/missing/cargo_terminal_e5_2060.txt) |
| EN01 Энергетический узел | [`e0_1978`](../prompts/missing/power_node_e0_1978.txt) | [`e1_1986`](../prompts/missing/power_node_e1_1986.txt) | [`e2_1998`](../prompts/missing/power_node_e2_1998.txt) | [`e3_2015`](../prompts/missing/power_node_e3_2015.txt) | [`e4_2035`](../prompts/missing/power_node_e4_2035.txt) | [`e5_2060`](../prompts/missing/power_node_e5_2060.txt) |
| OB01 Наблюдательный комплекс | [`e0_1978`](../prompts/missing/observatory_e0_1978.txt) | [`e1_1986`](../prompts/missing/observatory_e1_1986.txt) | [`e2_1998`](../prompts/missing/observatory_e2_1998.txt) | [`e3_2015`](../prompts/missing/observatory_e3_2015.txt) | [`e4_2035`](../prompts/missing/observatory_e4_2035.txt) | [`e5_2060`](../prompts/missing/observatory_e5_2060.txt) |

## Что делает код

Свечение, лучи радара, огни, дым, искры, вращение и движение подвижных частей — на стороне кода. В картинке только физическая конструкция.

## Позже

Для подвижных частей (азимут радара, стрела эвакуатора, тележка крана, купол) понадобится отдельный лист частей по эпохе (один вызов — один лист). Для первой версии игры достаточно якорного арта целого объекта.

## Битые файлы мастерской (нужна перегенерация)

Пять спрайтов мастерской повреждены прямо в коммите `11d4e32` (ошибка контрольных сумм потока PNG, часть данных потеряна, восстановить без исходника нельзя). Игра подменяет их ближайшей целой эпохой (`BROKEN_PLACEABLE_ERAS` в `game/src/render/manifest.js`); тест `render.manifest` проверяет целостность каждого PNG. Когда будут новые файлы, замените их и уберите запись из `BROKEN_PLACEABLE_ERAS`.

| Семейство | Эпоха | Файл | Промпт-основа |
| --- | --- | --- | --- |
| W01 service_lift | E2 1998 | `art/gen/placeables/workshop/service_lift/e2_1998.png` | `art/prompts/w01_service_lift.txt` |
| W01 service_lift | E3 2015 | `art/gen/placeables/workshop/service_lift/e3_2015.png` | `art/prompts/w01_service_lift.txt` |
| W01 service_lift | E5 2060 | `art/gen/placeables/workshop/service_lift/e5_2060.png` | `art/prompts/w01_service_lift.txt` |
| W05 manufacturing_cell | E1 1986 | `art/gen/placeables/workshop/manufacturing_cell/e1_1986.png` | запись W05 в `art/placeables/PRODUCTION_MANIFEST.md` + рецепт промпта (раздел 6) |
| W03 telemetry_post | E2 1998 | `art/gen/placeables/workshop/telemetry_post/e2_1998.png` | запись W03 в `art/placeables/PRODUCTION_MANIFEST.md` + рецепт промпта (раздел 6) |

Генерируйте эпоху по цепочке от соседних целых эпох того же семейства (они лежат рядом в `art/gen/placeables/workshop/<семейство>/`), как для остальных семейств.
