# «Выше неба» — Reproducible 2D Asset Production Pipeline

Этот документ фиксирует production-процесс, который дал наиболее качественный результат для workshop assets, и делает его воспроизводимым для следующих спрайтов.

## 1. Источники истины и порядок приоритета

1. **`ref2game`** — обязательный workflow для каждого запроса по 2D-игре и ассетам.
2. **`art/style_bible.txt`** — канонический визуальный язык. Его правила и обязательная lighting sentence добавляются к каждому generation prompt.
3. **`art/placeables/PRODUCTION_MANIFEST.md`** — gameplay role, footprint, sockets, parts, motion contract и era lineage.
4. **Утверждённый anchor-art в `art/gen/`** — источник фактической геометрии.
5. **Runtime metadata** — только измеренные по утверждённому арту anchor/pivot. Координаты не угадываются заранее.

При конфликте технического шаблона и явно более сильного художественного решения допускается осознанное отклонение, но нельзя использовать artistic freedom для маскировки технических дефектов, случайных деталей, неправильной механики или нарушенной читаемости.

## 2. Главный принцип: один generation call = один самостоятельный asset

Запрещено просить image generation одновременно нарисовать production-board вида «6 эпох + части + анимации + подписи + UI».

Правильная последовательность:

```text
E0 full anchor
→ review
→ E0 part sheet
→ E1 from approved E0
→ E2 from approved E1 + E0 reference
→ E3
→ E4
→ E5
→ SpriteFusion Pixel Snapper
→ normalize to canonical LP canvas
→ Aseprite indexed export
→ measure real pivots
→ pack atlases from approved files
→ rig in code
→ motion sheet
→ QA
```

Каждая эпоха генерируется отдельной картинкой. Финальный era-atlas **собирается** из утверждённых файлов; image generator не рисует atlas целиком.

## 3. Prompt contract

Каждый prompt начинается с конкретного объекта, кода и эпохи, например:

```text
W04 / flight_simulator / E0 1978
Create ONE isolated workshop flight simulator, and nothing else.
```

Далее обязательно фиксируются:

- одна функциональная сущность;
- конкретная эпоха и её инженерная логика из production manifest;
- перечень реально существующих частей, которые позднее должны отделяться для rig;
- прозрачный фон;
- полный не обрезанный silhouette с padding;
- отсутствие людей, текста, логотипов, UI и pseudo-writing;
- отсутствие baked FX;
- одна согласованная projection/camera внутри asset family;
- полный `art/style_bible.txt`, добавленный **дословно**; сокращённая или пересказанная версия не является production prompt.

Обязательная lighting sentence:

> One consistent key light comes from the upper-left, with warm light on upper-left planes and cool blue-gray shadow on lower-right planes; use no baked cast shadow.

### Что рисует AI

AI рисует только физический объект и его материалы: корпус, раму, кресло, актуаторы, механические приборы, дверцы, кабели, крепления, инструмент и другие реальные детали.

### Что принадлежит коду

Код владеет движением, состояниями, screen data, glow/bloom, динамическим светом, cast shadow, частицами, дымом, sparks, beams, trajectories, vibration, heat haze, motion blur и другими временными эффектами.

Нельзя изображать работу механизма bob/rotate/scale всего PNG, если у объекта есть реальные moving parts.

## 4. Почему качественный raw получился лучше ранних листов

Качественный результат получен не за счёт более длинного prompt, а за счёт ограничения задачи:

1. генератору дали **один объект**, а не infographic/sprite board;
2. была явно описана инженерная функция и конструкция;
3. движущиеся части требовались физически читаемыми;
4. фон был полностью исключён;
5. визуальный язык брался из canonical style bible;
6. lighting и projection были фиксированы;
7. мелкая декоративная случайность была запрещена, а detail концентрировался вокруг функциональных узлов;
8. era evolution строится последовательно от уже утверждённой предыдущей эпохи.

## 5. Raw provenance

Непосредственный результат image generation никогда не считается runtime art.

Raw сохраняется в:

```text
art/raw/placeables/<zone>/<asset>/eN_YEAR_presnap.png
art/raw/placeables/<zone>/<asset>/eN_YEAR_presnap.json
```

JSON должен содержать минимум (for current W04, `source_size` records the untouched generator output and `source_sha256` identifies its exact bytes):

```json
{
  "asset_id": "W04",
  "asset": "flight_simulator",
  "era": "E0",
  "year": 1978,
  "source_gen_id": "...",
  "source_size": [1254, 1254],
  "source_sha256": "...",
  "target_canvas": [172, 160],
  "registration_target": [86, 156],
  "prompt_file": "art/prompts/w04_flight_simulator_e0.txt",
  "required_pipeline": ["SpriteFusion Pixel Snapper", "Aseprite"]
}
```

Для воспроизводимости SHA-256 raw PNG, source generation id, prompt file, exact tool revisions and pipeline parameters are mandatory. The generator output is provenance; it is never silently replaced by a different image.

## 6. SpriteFusion Pixel Snapper

Используется официальный проект:

`Hugo-Dz/spritefusion-pixel-snapper`

Назначение этапа:

- привязать AI-generated pixel-look к строгой pixel grid;
- устранить плавающий размер pixel clusters;
- ограничить палитру;
- сделать масштабирование nearest-neighbor предсказуемым.

Production baseline uses the official upstream pinned to an exact revision:

```bash
cargo install --git https://github.com/Hugo-Dz/spritefusion-pixel-snapper \
  --rev ae20461f60fb39e75d15f184bab1ebec1219511c \
  --locked spritefusion-pixel-snapper
```

The pinned upstream reports package version `1.0.0`. Only upstream-supported CLI options are used: `COLORS`, `--pixel-size`, and optionally `--palette`. Fork-only options such as `--grid-mode` or `--cell-method` are forbidden in the canonical pipeline.

`--pixel-size` is selected so Pixel Snapper emits roughly one logical pixel per target LP. For the current native W04 generations (`1254×1254` source, `172×160 LP` target), the family baseline is:

```bash
spritefusion-pixel-snapper input.png snapped.png 32 --pixel-size 8
```

`pixel-size` является параметром конкретной asset family и записывается в `*.pipeline.json`. Значение нельзя менять молча между эпохами одной линии. Если автоматическое или baseline-значение уничтожает значимые детали, делаются несколько QA-кандидатов и выбирается наименьший grid, при котором silhouette и functional detail читаются на gameplay size.

## 7. Нормализация canvas

После snap объект помещается в канонический LP canvas конкретного placeable.

Правила:

- aspect ratio сохраняется;
- ресэмплинг только nearest-neighbor для runtime pixel art;
- ground object использует bottom-center registration, если manifest не говорит иначе;
- scale/registration одинаковы во всей era family;
- final visible envelope должен укладываться в target footprint;
- padding сохраняется для moving attachments и rotation.

Для W04:

```text
canvas: 172×160 LP
registration target: bottom-center `(86,156)`

This is a placement/registration target, not a measured mechanism pivot. Final moving-part pivots remain `null/pending` until the approved cut-out parts are imported and measured.
```

## 8. Aseprite

Используется официальный `aseprite/aseprite`, собранный из исходников в CI; бинарник в репозиторий не коммитится.

Production-задачи Aseprite:

- Indexed Color export;
- no-dither palette conversion;
- layer/frame organization;
- animation tags;
- part-sheet cleanup;
- visual QA at 1:1 logical-pixel scale;
- sprite-sheet/PNG sequence export.

Baseline batch export:

```bash
aseprite -b normalized.png \
  --dithering-algorithm none \
  --color-mode indexed \
  --save-as final.png
```

Для rig-pass физические части хранятся отдельными слоями/спрайтами. Скрытые области moving parts должны быть дорисованы полностью, чтобы поворот не открывал пустоты.

## 9. Measured rig

После утверждения anchor-art:

1. создаётся isolated part sheet;
2. каждая moving part проверяется как полная деталь;
3. rest pose реконструируется из частей;
4. pivot/joint координаты измеряются по фактической геометрии;
5. только после этого координаты попадают в runtime metadata.

До измерения pivot должен быть `null`/`pending`, а не приблизительным числом.

Для W04 минимальный rig:

```text
base
pod
actuator_left
actuator_right
canopy
```

Training motion: `pod` следует simulated trajectory, актуаторы решают положение относительно base/pod, canopy физически открывается на enter/exit. Idle полностью спокойный.

## 10. QA gates

Ассет не получает статус `ready`, пока не пройдены следующие проверки.

### Automatic

- точный canvas WxH;
- alpha присутствует;
- нет случайного fringe вокруг silhouette;
- palette <= заданного лимита (production baseline: 32 цвета);
- no dithering, если он не был осознанно разрешён style rule;
- visible bbox находится внутри canvas;
- anchor находится в canvas;
- SHA/provenance записаны.

### Visual

- silhouette читается в реальном gameplay size;
- одна и та же инженерная родословная E0→E5;
- scale и registration не прыгают между эпохами;
- нет текста/pseudo-text/logo/UI;
- нет baked screen data/particles/glow/shadow;
- moving parts конструктивно возможны;
- будущее не сводится к «cyan + hologram»;
- поверхность не забита бессмысленным micro-detail;
- материал, свет и projection соответствуют style bible.

### Rig

- rest reconstruction совпадает с anchor-art;
- pivots измерены;
- moving parts не растягиваются и не открывают пустоты;
- whole-sprite fake motion отсутствует;
- motion sheet просмотрен покадрово.

## 11. GitHub CI

Canonical pipeline живёт в:

```text
.github/workflows/art-pipeline.yml
tools/art_pipeline/normalize_sprite.py
tools/art_pipeline/qa_sprite.py
```

CI должен использовать pinned версии инструментов и создавать рядом с итогом:

```text
eN_YEAR.png
eN_YEAR.qa.json
eN_YEAR.pipeline.json
```

`pipeline.json` фиксирует source gen id/SHA, pinned Pixel Snapper revision, Aseprite version, pixel size, palette limit, canvas and registration target. Mechanism pivots are recorded separately only after measured rig QA.

Workflow может коммитить runtime output только после успешного QA. Raw input и failed candidates остаются provenance/reference, но не копируются в runtime assets.

## 12. Current W04 reference pass

The high-quality W04 lineage was generated as **six independent calls**, not as a 3×2 AI board. Canonical source generation ids are:

| era | year | source gen id | design stage |
|---|---:|---|---|
| E0 | 1978 | `155ad5c7-2e21-4bb6-811b-e42ed21ee5e7` | exposed analog seat/gimbal frame |
| E1 | 1986 | `77e671d8-6aa9-4aee-8389-7b3bf26271f2` | enclosed hydraulic cabin |
| E2 | 1998 | `57f0cda3-c37e-489e-bdc5-404c89c935a9` | heavy CRT motion platform |
| E3 | 2015 | `c0dbb3e2-65b1-4b2a-8358-3deeb36a45f4` | panoramic cockpit / electric actuators |
| E4 | 2035 | `ac153f0a-25ca-4f5a-9865-4949c355fb4a` | compact VR/robotic capsule |
| E5 | 2060 | `b2916572-5c28-4dbe-9461-e3dd65786da8` | adaptive multi-axis simulation cell |

This lineage follows the W04 manifest: `base`, `pod`, `actuator_left`, `actuator_right`, `canopy`. Runtime work animation must solve the pod pose through the real actuators; it must not rotate/bob the entire sprite.

## 13. Definition of Done

Placeable/era считается завершённым только когда:

```text
prompt saved
+ raw generation saved with provenance
+ Pixel Snapper completed
+ normalized to canonical LP canvas
+ Aseprite indexed export completed
+ automatic QA passed
+ visual QA passed
+ runtime PNG committed
```

Rigged object считается завершённым дополнительно только после:

```text
part sheet approved
+ pivots measured
+ rest reconstruction passed
+ motion sheet passed
+ event/state contract wired in code
```

## 14. Правило для всех следующих ассетов

Этот pipeline обязателен для дальнейшей 2D-ветки. Любой новый workshop/base placeable начинается с `ref2game`, style bible и production manifest, генерируется по одной эпохе/одному asset за call, а затем проходит Pixel Snapper → Aseprite → measured QA. Нельзя объявлять raw AI image готовым runtime sprite.
