# Структурный проход 2026-11-11

**Изменено:** документы и производственные инструменты в `docs/structure-20261111`, без коммита и пуша. Основание — [ревью 2026-11-10](REVIEW_OPINION_20261110.md) и решение владельца «всё исправь и сделай как надо».

Закреплённые источники: `main@da026dc9fddbb49b7804b4cfbc9b61dec2541dd0`, `game-production@544c5379b151c8c3c4e70fb4cb383054309a1283`. HEAD папки `vn-slice`: `slice/e0-hd-pixel@e473b2e051f2ce37397496c9e0db56b557cb7172`, но изометрические PNG и base-iso.json — локальные незакоммиченные файлы, не содержимое этого коммита. Обе соседние папки использовались только для чтения; main чистый, сторонние изменения vn-slice сохранены.

## 1. Манифест → банк идей

`art/placeables/PRODUCTION_MANIFEST.md` переименован в [IDEA_BANK_PLACEABLES.md](../placeables/IDEA_BANK_PLACEABLES.md). Сохранены и сокращены правила эпох, rig/pivot/атласов, состояний, запроса, QA и слоёв рендера. Семейства B01–B07 и W01–W10 сведены в таблицу применения идей: игровые ключи, конкретные эффекты и ссылки на код либо BALANCE_PASS_1, статусы и суть. Сохранены все 17 коротких родословных E0–E5. Для пресетов, тренажёра, покраски и карусели явно записано «не делать, пока E0 не принята и баланс не сведён».

Все прежние указатели на имя манифеста в Markdown и Python заменены, включая документы, производственный скилл и инструменты; список `REQUIRED` обновлён. Исторические JSON происхождения в art/raw не переписывались. Соседние документы больше не назначают банк идей источником игровых ролей: эффекты — `buildings.js`/DESIGN §4.4, геометрия — `manifest.js`, части — паспорт.

## 2. Паспорта и журналы

14 паспортов в `art/briefs/` сокращены до 27–30 строк: ключ и роль из кода, все номинальные эффекты уровней 1–6, части, состояния, фактические пути main, клипы и решения владельца. В каждом — одна ссылка на журнал и критерий «скриншот из игры принят владельцем». [Шаблон паспорта](ASSET_BRIEF_TEMPLATE.md) и последняя инструкция [шаблона запроса](templates/SPRITE_REQUEST.md) согласованы с разделением.

Полные прежние тексты сохранены в `art/review/<ключ>/LOG.md`, а не удалены выборочно. Сверка с HEAD подтвердила сохранение всех исходных текстов; единственная общая текстовая замена до разделения — имя банка идей, при сравнении нормализованы переводы строк. SHA, замеры и описания отклонений сохранены. Для `E0_POWER_ROUTE.md` и `E0_base_infrastructure.md` добавлены только статусные строки; это не паспорта.

| Паспорт | Журнал |
| --- | --- |
| B01_weather_complex_E0 | [weather](../review/weather/LOG.md) |
| B02_tracking_radar_E0 | [radar](../review/radar/LOG.md) |
| B03_landing_guidance_E0 | [beacons](../review/beacons/LOG.md) |
| B05_FUEL_E0 | [fuel](../review/fuel/LOG.md) |
| B07_CARGO_E0 | [logistics](../review/logistics/LOG.md) |
| BI_CONTROL_E0 | [control](../review/control/LOG.md) |
| BI_DELUGE_E0 | [deluge](../review/deluge/LOG.md) |
| BI_FACTORY_E0 | [factory](../review/factory/LOG.md) |
| BI_GANTRY_E0 | [gantry](../review/gantry/LOG.md) |
| BI_RESCUE_E0 | [rescue](../review/rescue/LOG.md) |
| BI_RETURN_E0 | [recovery](../review/recovery/LOG.md) |
| BI_SERVICE_E0 | [service](../review/service/LOG.md) |
| EN01_ENERGY_E0 | [energy](../review/energy/LOG.md) |
| OB01_OBSERVATION_E0 | [observation](../review/observation/LOG.md) |

## 3. Две камеры и клипы

В [ASSET_STATE_SPEC §6](ASSET_STATE_SPEC.md#6-решение-2026-11-11-где-клипы-нужны) записан утверждённый объём: новые `base/`-клипы не делать; `iso/` — стрела/вентиль gantry, ворота и машина rescue, ворота factory, тельфер logistics; вода deluge и остальные лампы/дым — кодом. Пять ожиданий слоёв закрыты в `states.json` статусом «не делать», прежние ON-записи сохранены вложенно как история. Трекер согласован.

[E0_COVERAGE §7](E0_COVERAGE_20261108.md#7-две-камеры-и-объём-клипов) содержит таблицу всех 14 построек. Проверено: `main` — 14 спрайтов полёта, восемь ON-клипов и 36 дополнительных кадров; `slice` — 14 изометрических PNG. Иконок в main нет. Исключение имени метеостанции — `base/weather-complex.png`, файла `base/weather.png` нет. Наличие изометрических PNG не объявлено приёмкой среза.

## 4. Раскладка из манифеста

Добавлен [export_island_layout.py](../../tools/hd_pixel/export_island_layout.py): разбор ISLAND, BUILDING_ANCHORS с вложенными E0, ENTRY_ANCHORS/WORLD_ENTRIES и отдельных записей входов. Экспортер проверяет ветку main и совпадение исходника с HEAD, пишет JSON v4 с полным SHA. [JSON](../placeables/BASE_ISLAND_LAYOUT.json) и [таблица](BASE_ISLAND_LAYOUT.md) обновлены из `vn-clean`.

Старый `game/tools/island-layout.py` заменён совместимым входом к экспортеру: независимая таблица координат больше не может перезаписать выгрузку. В README убрана «историческая выгрузка». Изометрия ссылается отдельно на локальный `vn-slice/game/assets/shared/island/base-iso.json`; файла в HEAD среза нет, поэтому ссылка на GitHub-коммит не используется.

```powershell
python tools/hd_pixel/export_island_layout.py ../vn-clean/game/src/render/manifest.js --markdown art/docs/BASE_ISLAND_LAYOUT.md
```

## 5. Публикация

[Контракт публикации](RUNTIME_BRANCH_CONTRACT.md) задаёт PR в main с заменёнными `game/assets/...`, скриншотом из игры и строкой «байты = SHA». Сохранены один активный файл, запрет `*_old`/backup и откат через Git. Четыре прежних исторических раздела перенесены дословно в [архив октября](../../archive/RUNTIME_BRANCH_CONTRACT_history_2026-10.md).

Из рабочего дерева удалены `.github/workflows/asset-promote.yml` и `.github/workflows/asset-publish-runtime.yml`. Помощник `publish_runtime_asset.py` сохранён, его назначение уточнено. [RUNTIME_EXPORTS.json](../runtime/RUNTIME_EXPORTS.json) — необязательная справочная карта; устаревшая блокировка B03 снята без выдумывания новой approval-записи. AGENTS §2, README, старые инструкции pipeline/tracker/Project согласованы; технические стадии старого трекера сохранены для совместимости.

## 6. Проверки и ограничения

Добавлена повторно запускаемая [проверка Markdown-ссылок](../../tools/art_pipeline/check_markdown_links.py). Она проверяет локальные назначения обычных ссылок, изображений и определений ссылок во всех отслеживаемых и новых Markdown-файлах ветки; HTTP(S), URI, внутристатейные якоря и примеры кода не обходятся. Проверено 189 Markdown-файлов и 125 локальных ссылок; отсутствующих локальных путей — **0**.

Реально запущены и прошли:

- `python tools/art_pipeline/validate_production_contract.py`;
- `python tools/art_pipeline/production_guard.py validate-tree`;
- `python tools/art_pipeline/check_markdown_links.py`;
- `python tools/hd_pixel/test_export_island_layout.py` — четыре проверки вложенной геометрии E0, форматов входов, отказа на неизвестном выражении и таблицы документации;
- независимая сверка через Node с выполненным `manifest.js`: все обычные/E0 anchors, size и footprint 14 построек, четыре входа и ISLAND совпадают с JSON;
- независимая сверка через Node с выполненным `buildings.js`: все 29 строк эффектов, по шесть значений в 14 паспортах совпадают;
- сверка полноты исходных текстов во всех 14 LOG и `git diff --check`.

**Не изменено:** preflight JSON, код и ассеты игры в `vn-clean`, кандидат в `vn-slice`, ветки, коммиты и удалённые refs. Пакеты не устанавливались. Игровые тесты, баланс, сборка и приёмка скриншотов в этом документальном проходе не запускались и не заявляются.

**Что не удалось:** `git mv` не смог создать `index.lock` в общем каталоге `.git/worktrees/vn-prod2` из-за файловых ограничений среды. Поэтому переименование и удаления workflow выполнены в рабочем дереве, без записи в индекс; `git rm` с тем же ограничением не выполнялся. Все результаты оставлены изменёнными и новыми файлами в текущей ветке; коммита и PR нет.
