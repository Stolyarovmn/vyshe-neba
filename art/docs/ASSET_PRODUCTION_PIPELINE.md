# «Выше неба» — Reproducible 2D Asset Production Pipeline

Этот документ фиксирует production-процесс 2D-ассетов проекта и правила, которые дали наиболее качественный и воспроизводимый результат. Он обязателен для workshop/base placeables и используется вместе с `ref2game` при каждом запросе по игре и ассетам.

**Текущий нормативный слой после migration production/runtime:** branch/storage/publication semantics определяет [`RUNTIME_BRANCH_CONTRACT.md`](RUNTIME_BRANCH_CONTRACT.md), tracker order — `art/placeables/PIPELINE_CONFIG.json` version 3, а исполнимый imagegen порядок — [`ASSET_GENERATION_RUNBOOK.md`](ASSET_GENERATION_RUNBOOK.md). Поэтому более старые примеры ниже, где `art/gen` называется runtime-геометрией, упоминаются build-time `outputs/rocket` mirror, production-side `game-ci.yml`, обновление `runtime-assets.json` внутри `promote` или единая граница `promotion → game-ci`, являются **historical pre-split notes**, а не текущей публикационной схемой. Канонически: `promote` создаёт production PR только в `game-production`; отдельный `publish_runtime` заменяет exact approved bytes в существующем `main:game/assets/...` path; rollback runtime идёт через Git history/revert, без backup-копий. Для receipt-based generation фактический request собирает `build_generation_request.py`; его порядок `scope → canonical asset prompt → art/style_bible.txt verbatim` имеет приоритет над иллюстративным prompt formatting в старых секциях. Перед каждым действием branch SHA и runtime paths проверяются заново.

**Совместимое нормативное расширение:** [`PRODUCTION_CONTRACT_V2.md`](PRODUCTION_CONTRACT_V2.md) добавляет design/era/projection/runtime preflight и QA gates. Шаблон паспорта: [`ASSET_BRIEF_TEMPLATE.md`](ASSET_BRIEF_TEMPLATE.md); инструкции для ChatGPT Project «Games»: [`GAMES_PROJECT_INSTRUCTIONS.md`](GAMES_PROJECT_INSTRUCTIONS.md).

## 1. Источники истины и порядок приоритета

1. **`ref2game`** — обязательный workflow для каждого запроса по 2D-игре и ассетам.
2. **`art/style_bible.txt`** — канонический визуальный язык. Он добавляется к каждому production generation prompt без пересказа.
3. **`art/placeables/PRODUCTION_MANIFEST.md`** — gameplay role, footprint, sockets, parts, motion contract и era lineage.
4. **Google Drive `vyshe-neba/art-originals/`** — канонический архив нетронутых полноразмерных image-generation originals.
5. **Утверждённый art в `art/gen/`** — канонический production art/history; active runtime bytes публикуются отдельно в `main:game/assets/...` через Boundary B.
6. **Runtime metadata** — только измеренные по утверждённому art anchor/pivot. Координаты не угадываются заранее.

При конфликте технического шаблона и явно более сильного художественного решения допускается осознанное отклонение, но artistic freedom нельзя использовать для маскировки технических дефектов, случайной механики, плохой читаемости или нарушения lineage.

## 2. Главный production pipeline

Главное правило `ref2game`: **один generation call = один самостоятельный asset или один part sheet**. Не просить генератор одновременно делать «6 эпох + части + анимации + подписи + UI».

**Перед первым production generation** выполняется G0 из `PRODUCTION_CONTRACT_V2.md`: паспорт объекта, назначение и инженерная причинность, референс и его статус, камера/проекция, epoch lineage, runtime target и blockers. При receipt-based generation сначала выполняются `validate_generation_preflight.py` и `build_generation_request.py`. PASS generation-preflight разрешает только isolated generation stage и не означает scene/promotion/runtime approval.

Канонический поток после migration:

```text
ref2game + contracts/checkpoint
→ deterministic request
→ E0: one isolated asset
→ save untouched high-quality original to Google Drive
→ write source provenance in GitHub
→ source review / E0 review
→ E0 part sheet when needed
→ E1 from approved E0
→ archive E1 original
→ E2 from approved E1 + E0 reference
→ archive E2 original
→ E3 → archive original
→ E4 → archive original
→ E5 → archive original
→ SpriteFusion Pixel Snapper
→ normalize to canonical LP canvas
→ Aseprite indexed/no-dither export
→ automatic QA
→ candidate artifact
→ visual QA bound to exact candidate SHA-256
→ scene/projection QA
→ promote: production PR → game-production/art/gen
→ measure real pivots on approved parts
→ pack era atlases from approved files
→ rig in code
→ motion sheet
→ event/state integration
→ publish_runtime: exact approved bytes → replacement PR → main/game/assets
→ applicable runtime build/tests
```

Финальный era-atlas **собирается нами** из утверждённых E0–E5. Image generator не должен рисовать production atlas целиком.

Candidate и production — разные состояния. Production и runtime publication тоже разные состояния: успешный `promote` не означает, что asset уже опубликован в `main`.

## 3. Generation / prompt contract

Для receipt-based generation фактический request строит `tools/art_pipeline/build_generation_request.py`; ручное перефразирование/перестановка canonical request запрещены. Иллюстративный asset prompt начинается с конкретного объекта и эпохи, например:

```text
W04 / flight_simulator / E0 1978
Create ONE isolated workshop flight simulator, and nothing else.
```

Production request обязательно фиксирует:

- одну функциональную сущность;
- конкретную эпоху и инженерную логику из manifest;
- физически читаемые moving parts;
- прозрачный фон;
- полный не обрезанный silhouette с padding;
- отсутствие людей, текста, логотипов, UI и pseudo-writing;
- отсутствие baked FX;
- одну согласованную projection/camera внутри asset family;
- `art/style_bible.txt`, добавленный дословно ровно один раз.

Обязательная lighting sentence:

> One consistent key light comes from the upper-left, with warm light on upper-left planes and cool blue-gray shadow on lower-right planes; use no baked cast shadow.

### AI рисует

Физическую конструкцию: корпус, раму, кресло, актуаторы, механические приборы, дверцы, кабели, крепления, инструменты и другие реальные детали.

### Код управляет

Движением, состояниями, screen data, glow/bloom, динамическим светом, cast shadow, частицами, дымом, sparks, beams, trajectories, vibration, heat haze и другими временными FX.

Нельзя изображать работу механизма bob/rotate/scale всего PNG, если у него существуют реальные движущиеся части.

## 4. Почему качественный результат воспроизводим

Качество получилось не за счёт огромного prompt, а за счёт ограничения задачи:

- один asset за call, а не infographic/board;
- понятная инженерная функция;
- moving parts читаются физически;
- прозрачный фон и отсутствие UI;
- canonical style bible;
- одинаковые lighting/projection rules;
- detail концентрируется вокруг функции, а не случайного micro-noise;
- каждая следующая эпоха развивается от утверждённой предыдущей;
- destructive processing начинается только после сохранения original.

## 5. Original source archive: Google Drive

Google Drive является каноническим долговременным хранилищем полноразмерных original image-generation files.

Структура:

```text
vyshe-neba/
  art-originals/
    workshop/
      W03_telemetry_post/
      W04_flight_simulator/
      W05_manufacturing_cell/
      ...
    base/
      B01_weather_complex/
      ...
```

Правила:

1. Каждый production generation output сохраняется **до** Pixel Snapper, crop, resize, quantize, alpha cleanup и Aseprite.
2. Сохраняется максимальное доступное качество и исходное разрешение.
3. Если генератор вернул PNG, original остаётся PNG; не перекодировать в JPEG.
4. Original не перезаписывается производной версией.
5. Имя содержит asset id, era/year и source generation id.
6. Перед destructive processing вычисляется SHA-256 exact original bytes и original загружается в Drive.
7. Drive file id/URL, SHA-256, original size и source generation id записываются в GitHub provenance.
8. Любой original, который использовался как reference для следующей эпохи, архивируется обязательно.
9. Значимые rejected candidates могут храниться в `_rejected/` с причиной отклонения; approved и rejected не смешиваются.
10. GitHub не обязан содержать многомегабайтный original PNG, если это мешает connector/API/code review.

Текущий W04 archive path:

```text
vyshe-neba/art-originals/workshop/W04_flight_simulator/
```

W03 и W05 high-quality originals уже архивированы. Для W04 уже сохранены high-quality source/reference files; отдельные выбранные E0–E5 originals должны быть добавлены и связаны provenance до статуса `ready`.

## 6. GitHub: что хранится в репозитории

Текущая branch model определена `RUNTIME_BRANCH_CONTRACT.md`:

- `game-production` хранит production instructions, reproducibility metadata, QA и canonical approved production art под `art/gen/...`;
- `main` хранит clean runtime/build tree и active runtime assets только по canonical `game/assets/...` paths;
- `art/runtime/RUNTIME_EXPORTS.json` описывает явное production source → runtime target mapping для Boundary B;
- `outputs/rocket/*` ниже является **legacy pre-split example** и не должно приниматься за текущий `main` runtime без отдельной проверки.

```text
art/docs/ASSET_PRODUCTION_PIPELINE.md
art/style_bible.txt
art/placeables/PRODUCTION_MANIFEST.md
art/placeables/PIPELINE_CONFIG.json
art/prompts/<asset>_eN.*
art/raw/placeables/<zone>/<asset>/eN_YEAR_presnap.json
art/gen/placeables/<zone>/<asset>/eN_YEAR.png
art/gen/placeables/<zone>/<asset>/eN_YEAR.qa.json
art/gen/placeables/<zone>/<asset>/eN_YEAR.pipeline.json
art/runtime/RUNTIME_EXPORTS.json
```

High-quality raw PNG может дополнительно храниться в `art/raw/`, если размер позволяет, но это optional. Канонический source binary находится в Google Drive.

Runtime publication **не** делает build-time mirror из `art/gen` в том же production tree. Отдельный `publish_runtime` берёт exact approved production bytes и заменяет существующий canonical `main:game/assets/...` target. Старый runtime file не сохраняется второй копией; rollback — Git history/revert.

Минимальный provenance JSON:

```json
{
  "asset_id": "W04",
  "asset": "flight_simulator",
  "era": "E0",
  "year": 1978,
  "source_gen_id": "...",
  "source_size": [1254, 1254],
  "source_sha256": "...",
  "source_storage": {
    "provider": "google_drive",
    "drive_file_id": "...",
    "drive_url": "...",
    "original_filename": "W04_E0_1978_<source_gen_id>.png"
  },
  "prompt_file": "art/prompts/w04_flight_simulator.md",
  "target_canvas": [172, 160],
  "registration_target": [86, 156],
  "required_pipeline": ["SpriteFusion Pixel Snapper", "Aseprite"],
  "output_sha256": "...",
  "reproducibility": {
    "style_bible_sha256": "...",
    "production_manifest_sha256": "...",
    "prompt_sha256": "...",
    "pipeline_config_sha256": "...",
    "processor_sha256": "...",
    "git_commit": "..."
  }
}
```

## 7. SpriteFusion Pixel Snapper

Используется официальный upstream:

```text
Hugo-Dz/spritefusion-pixel-snapper
```

Pinned revision:

```text
ae20461f60fb39e75d15f184bab1ebec1219511c
```

Установка:

```bash
cargo install --git https://github.com/Hugo-Dz/spritefusion-pixel-snapper \
  --rev ae20461f60fb39e75d15f184bab1ebec1219511c \
  --locked spritefusion-pixel-snapper
```

Назначение:

- привязка AI pixel-look к строгой pixel grid;
- устранение плавающего размера pixel clusters;
- palette reduction;
- предсказуемая nearest-neighbor дальнейшая обработка.

Используются только upstream-supported options: `COLORS`, `--pixel-size`, optionally `--palette`. Fork-only параметры запрещены в canonical pipeline.

Для текущего W04 baseline:

```bash
spritefusion-pixel-snapper input.png snapped.png 32 --pixel-size 8
```

`pixel-size` — параметр asset family и записывается в `*.pipeline.json`. Его нельзя менять молча между эпохами одной lineage.

## 8. Normalize to canonical LP canvas

После snap объект помещается в канонический logical-pixel canvas.

Правила:

- aspect ratio сохраняется;
- runtime resampling только nearest-neighbor;
- ground object по умолчанию bottom-center registration;
- scale/registration одинаковы во всей era family;
- final visible bbox помещается в target footprint;
- padding сохраняется для moving parts.

Для W04:

```text
canvas: 172×160 LP
registration target: (86,156) bottom-center
```

Это placement registration, а не measured mechanism pivot. Moving-part pivots остаются `null/pending` до part-sheet pass и измерения по фактическому арту.

## 9. Aseprite

Используется официальный `aseprite/aseprite`, собранный из официальных исходников. Бинарник в репозиторий не коммитится.

Canonical CI configuration: официальный batch CLI с `LAF_BACKEND=none`. Все asset workflows используют один `tools/art_pipeline/setup_art_tools.sh`; отдельные workflow не имеют права незаметно собирать другой backend/tool revision.

Production-задачи:

- Indexed Color export;
- no-dither conversion;
- layer/frame organization;
- animation tags;
- part-sheet cleanup;
- visual QA на 1:1 logical-pixel scale;
- sprite-sheet/PNG sequence export.

Baseline batch export:

```bash
aseprite -b normalized.png \
  --dithering-algorithm none \
  --color-mode indexed \
  --save-as final.png
```

Moving parts для rig должны существовать как отдельные полные детали, включая скрытые области, которые становятся видны при движении.

## 10. Measured rig and animation contract

После утверждения anchor-art:

```text
isolated part sheet
→ validate every moving part
→ reconstruct rest pose
→ measure actual joints/pivots
→ write runtime metadata
→ rig in code
→ render motion sheet
→ inspect frame-by-frame
```

До измерения pivot запрещено записывать приблизительным числом.

Для W04 минимальный rig:

```text
base
pod
actuator_left
actuator_right
canopy
```

`pod` двигается через реальную геометрию актуаторов, canopy физически открывается/закрывается. Whole-sprite fake motion запрещён.

Живые placeables работают по causal state model:

```text
OFF → IDLE → NOTICE → WORK → FINISH → COOLDOWN → IDLE
```

`WORK` запускается игровым событием, а не вечным декоративным loop.

## 11. QA gates

Ассет не получает статус `ready`, пока не пройдены automatic, visual и применимые scene/rig checks.

### Automatic

- exact canvas WxH;
- binary/valid alpha;
- no fringe;
- palette не превышает установленный limit;
- no accidental dithering;
- bbox inside canvas;
- registration inside canvas;
- source SHA/provenance recorded;
- Google Drive source link/id recorded;
- pipeline/tool revisions recorded.

### Visual

- silhouette читается на gameplay size;
- E0→E5 — одна инженерная lineage;
- scale/registration не прыгают;
- no text/pseudo-text/logo/UI;
- no baked screen data/particles/glow/cast shadow;
- moving parts конструктивно возможны;
- future era не сводится к «cyan + hologram»;
- нет бессмысленного micro-detail;
- materials/light/projection соответствуют style bible и approved camera family.

Visual verdict обязан быть **hash-bound**: `visual_qa.json` должен содержать approval exact SHA-256 каждого production candidate. Изменение PNG после review автоматически инвалидирует approval.

### Rig

- rest reconstruction совпадает с anchor-art;
- pivots действительно измерены;
- moving parts не растягиваются и не открывают пустоты;
- whole-sprite fake motion отсутствует;
- motion sheet проверен покадрово.

## 12. GitHub CI

Canonical automation после production/runtime split разделена минимум на четыре ответственности:

```text
Candidate (read-only)
.github/workflows/asset-candidate.yml
art/placeables/PIPELINE_CONFIG.json
tools/art_pipeline/process_asset.py

Production promotion / Boundary A
.github/workflows/asset-promote.yml
tools/art_pipeline/verify_visual_gate.py
tools/art_pipeline/promote_asset.py

Runtime publication / Boundary B
.github/workflows/asset-publish-runtime.yml
art/runtime/RUNTIME_EXPORTS.json
tools/art_pipeline/publish_runtime_asset.py

Runtime build gate (clean main)
main:.github/workflows/game-ci.yml
```

`art-pipeline.yml` (W04) и asset-specific trigger wrappers остаются trigger wrappers, а не отдельными processing implementations.

Candidate workflow:

- использует pinned canonical toolchain;
- создаёт PNG + `*.qa.json` + `*.pipeline.json` + `candidate-manifest.json`;
- имеет `contents: read`;
- не пишет production/runtime;
- публикует Actions artifact для QA/review.

Production promotion:

- rebuild/verify exact candidate;
- требует hash-bound approval;
- переносит approved files только в canonical `game-production:art/gen` + allowed provenance/QA;
- создаёт PR targeting `game-production`;
- не обновляет `main` runtime paths.

Runtime publication:

- pins exact production commit + exact runtime base;
- requires explicit `RUNTIME_EXPORTS.json` mapping, approved SHA and semantics compatibility;
- replaces only declared existing `main:game/assets/...` targets;
- rejects unrelated files/history copies;
- runs available runtime build/checks;
- creates separate PR targeting `main`;
- is not final until merge/resulting runtime SHA is confirmed.

`pipeline.json` фиксирует source gen id/SHA, Drive source reference, Pixel Snapper revision, Aseprite version, pixel size, palette limit, canvas, registration target, output SHA и reproducibility hashes.

Failed candidate никогда не становится runtime asset только потому, что pipeline технически смог его обработать.

На проверенном текущем `main@af80ce810fbdc5088cfa01d8a193f94ddbcd2721` каталога `game/test` нет. `Game runtime build` проверяет clean-tree policy, manifest resolution, standalone build/checksum и отсутствие tracked mutation; это не full B03 gameplay regression.

## 13. W04 / flight_simulator reference lineage

W04 строится шестью независимыми generation calls:

| era | year | source gen id | design stage |
|---|---:|---|---|
| E0 | 1978 | `155ad5c7-2e21-4bb6-811b-e42ed21ee5e7` | exposed analog seat/gimbal frame |
| E1 | 1986 | `77e671d8-6aa9-4aee-8389-7b3bf26271f2` | enclosed hydraulic cabin |
| E2 | 1998 | `57f0cda3-c37e-489e-bdc5-404c89c935a9` | heavy CRT motion platform |
| E3 | 2015 | `c0dbb3e2-65b1-4b2a-8358-3deeb36a45f4` | panoramic cockpit / electric actuators |
| E4 | 2035 | `ac153f0a-25ca-4f5a-9865-4949c355fb4a` | compact VR/robotic capsule |
| E5 | 2060 | `b2916572-5c28-4dbe-9461-e3dd65786da8` | adaptive multi-axis simulation cell |

Manifest parts: `base`, `pod`, `actuator_left`, `actuator_right`, `canopy`.

Перед финальным статусом W04 каждый реально выбранный E0–E5 source должен иметь exact original на Google Drive и GitHub provenance с SHA + Drive id/URL.

## 14. Definition of Done

Production-approved placeable/era считается завершённым только когда:

```text
prompt/preflight saved and valid
+ untouched high-quality original archived to Google Drive
+ source generation id recorded
+ source SHA-256 recorded
+ Drive file id/URL recorded in GitHub provenance
+ source gate passed
+ Pixel Snapper completed
+ normalized to canonical LP canvas
+ Aseprite indexed/no-dither export completed
+ automatic QA passed
+ candidate artifact produced
+ visual/scene QA passed for exact candidate SHA-256
+ promotion PR merged into game-production
+ canonical approved PNG lives in game-production:art/gen
```

Это **не означает runtime publication**. Для integrated/runtime completion дополнительно:

```text
verified runtime logical name / consumer / semantics
+ explicit RUNTIME_EXPORTS mapping
+ existing canonical main:game/assets target
+ publish_runtime replacement PR merged to main
+ resulting runtime SHA confirmed
+ applicable runtime build/tests passed
```

Rigged object дополнительно требует:

```text
part sheet approved
+ complete moving parts
+ pivots measured
+ rest reconstruction passed
+ motion sheet passed frame-by-frame
+ event/state contract wired in code
```

## 15. Обязательное правило для всех следующих ассетов

Любой новый workshop/base asset начинается с `ref2game`, contracts/checkpoint, `art/style_bible.txt` и `PRODUCTION_MANIFEST.md`, генерируется по одной эпохе/одному asset за call, **сразу сохраняет нетронутый high-quality original в Google Drive**, затем проходит SpriteFusion Pixel Snapper → normalize → Aseprite → automatic QA → candidate → hash-bound visual/scene QA → production promotion → measured rig when applicable → separate runtime publication/integration.

Нельзя:

- объявлять raw AI image готовым runtime sprite;
- удалять original после получения derivative;
- заменять original обработанной копией;
- угадывать pivots;
- симулировать сложную механику движением целого PNG;
- генерировать production E0–E5 atlas одним AI board;
- публиковать candidate до hash-bound visual approval;
- push'ить generated production output прямо в `main`;
- хранить old/backup runtime copies вместо Git rollback;
- считать `promote` эквивалентом `publish_runtime`.

## 16. Interactive execution timeout / anti-hang contract

Эти правила обязательны для **каждого интерактивного хода** по игре и ассетам. Подробности также зафиксированы в `art/docs/EXECUTION_TIMEOUT_POLICY.md`.

### Hard wall-clock deadline

- Максимум одного непрерывного interactive attempt: **20 минут wall-clock**.
- Это ограничение относится не только к shell/CI-командам, но и к conversation/tool-loop.
- На **15-й минуте** запрещено запускать новую дорогую генерацию, полный rebuild или новый длинный CI run.
- На **18-й минуте** прекращаются необязательные polish/critic/retry действия.
- На **20-й минуте** текущий ход обязан завершиться checkpoint/status.

### No-progress watchdog

- **5 минут без проверяемого прогресса** означают, что текущий способ завис.
- После этого ожидание прекращается; допускается одна смена технического пути.
- Две одинаковые ошибки подряд одного API/tool/method запрещают третий идентичный retry.
- Для одного asset в одном интерактивном ходе максимум **2 production-generation attempts**.

### CI / GitHub Actions

Не держать текущий ответ открытым в polling-loop. После запуска/проверки значимой смены состояния сохранять branch/SHA/run/job как checkpoint. Следующий ход проверяет тот же run, а не запускает новый без причины.

### Checkpoint before return

```text
branch
commit SHA
asset/tracker state
source/candidate/intermediate paths
CI run id + job/state
точный blocker
точный следующий шаг
```

## 17. Governance, совместимость веток и ChatGPT Project «Games»

- Для новых/изменяемых ассетов применяются G0/G1/G6/G7 criteria из `PRODUCTION_CONTRACT_V2.md`.
- `RUNTIME_BRANCH_CONTRACT.md` имеет приоритет для branch/storage/publication semantics.
- `game-production` хранит production/history, `main` — clean runtime/build и canonical `game/assets/...`.
- Старые ссылки на `game-build`, `clean-src` или `outputs/rocket/*` проверяются, а не предполагаются текущим runtime.
- Настройки ChatGPT Project нельзя изменить коммитом: пользователь вручную копирует `GAMES_PROJECT_INSTRUCTIONS.md` в Project instructions.
- Изменения docs/art rules, CI/tooling и runtime integration делаются отдельными reviewable PR, если смешивание затрудняет диагностику/rollback.
