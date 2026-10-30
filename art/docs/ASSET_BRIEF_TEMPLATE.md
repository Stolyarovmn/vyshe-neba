# Паспорт production asset / era / animation / projection

Создать копию для **каждой новой или изменяемой** asset family; ссылка на паспорт должна быть в prompt/tracker/PR. Неизвестное записывать `UNKNOWN`, не угадывать. Это шаблон **дизайна и QA**, не замена `PIPELINE_CONFIG.json` и не новый формат машинного tracker.

Перед заполнением раздела D обязательно прочитать `art/docs/ERA_DESIGN_MATRIX.md`. Этот документ задаёт канонический visual/engineering language E0–E5; `PRODUCTION_MANIFEST.md` задаёт gameplay role, parts, footprint и lineage конкретного объекта.

## A. Identity и gameplay

- Asset ID / slug / family / zone: `<...>`
- Type: `world | base | workshop | environment | UI | FX`
- Owner / reviewer / branch / commit SHA: `<...>`
- Status: `design | candidate | blocked | approved | integrated`
- Gameplay role / видимый результат: `<...>`
- Почему существует; почему здесь; почему в этой эпохе: `<...>`
- Реализовано в runtime? `yes/no/UNKNOWN`; ссылка на код/тест: `<...>`
- Зависимости: покупка, прогресс, ресурсы, связи, событие: `<...>`
- Что **не** входит в scope / новые механики запрещены: `<...>`

## B. Физическая конструкция

- Опора, нагрузка, материал, габарит, способ изготовления: `<...>`
- Питание/топливо/данные/кабели/трубы (если нужны), доступ/обслуживание: `<...>`
- Parts (полные физические детали): `<...>`
- Joints / rails / sockets; pivot intent: `<...>`
- Measured pivots: `pending` до exact approved art; источник измерений: `<...>`
- Физическая безопасность, траектория ракеты, коллизии: `<...>`

## C. Camera, scene и runtime

- Reference asset URL / SHA-256 / approval status: `<...>`
- Camera family: `island_top_3_4 | interior | aircraft_side | other`
- Projection angle: `UNKNOWN` до измерения; evidence (плоскости, сравнение): `<...>`
- World space / LP / px conversion: `<...>`
- Layout key, anchor, footprint, visible bbox, sprite_px, layers, occlusion: `<...>`
- Gameplay-size, reduced zoom, portrait scene screenshots: `<...>`
- Runtime logical name / path / consumer / fallback: `<...>`
- E0–E5 mapping и размер/registration: `<...>`
- Отклонения от утверждённого reference: `<...>`

## D. Эпохи: непрерывная lineage

Каждая строка должна применять `ERA_DESIGN_MATRIX.md`, а не ограничиваться общей фразой вроде «более современный». Для каждой эпохи фиксируются applicable axes: manufacturing, materials, drive/mechanics, interface/display, lighting/signals, infrastructure/cabling/piping, autonomy/service, silhouette/architecture.

| Era | Сохранено от предыдущей | Заменено / почему | Добавлено / зачем | Manufacturing / materials | Drive / mechanics | Interface / light | Infrastructure / autonomy / silhouette | Reference SHA / status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E0 / 1978 | базовая функция | — | исходная конструкция | | | | | |
| E1 / 1986 | | | | | | | | |
| E2 / 1998 | | | | | | | | |
| E3 / 2015 | | | | | | | | |
| E4 / 2035 | | | | | | | | |
| E5 / 2060 | | | | | | | | |

### Era transition gate

- `E(n)→E(n+1)` меняет минимум **3 из 8** era axes;
- сохраняет минимум **2 family traits**, если физическая функция это допускает;
- E0→E5 радикально различаются минимум по **6 из 8** axes;
- recolor / cyan / glow без инженерного изменения не считается переходом;
- reviewer должен суметь упорядочить варианты без подписей по технологической эволюции.

### E4/E5 mandatory interpretation

- Для E4 явно проверить robotics/autonomy; для подходящих крупных зданий — glass/curtain-wall/panoramic glazing language либо записанную причину исключения.
- Для E5 mobile equipment — hover/levitation/contactless locomotion как default, либо записанное функциональное исключение; physical lift hardware обязательно.
- Для E5 сложного UI — spatial/holographic 3D interface как default вместо постоянного прямоугольного экрана, если UI вообще нужен функции; physical projector/emitter рисует AI, active holographic content/FX делает код.
- E5 light lines допустимы только как functional state/path/routing/load/navigation signal, не decoration.

## E. События, состояния, анимации, сигналы

| Trigger / precondition | State before → after | Parts / motion / limits | Termination, cancel, cooldown | Игровой результат и visual signal | Reduced-motion equivalent |
| --- | --- | --- | --- | --- | --- |
| `<event>` | `IDLE → NOTICE → WORK → FINISH` | | | | |

- Источник значений для индикаторов и смысл цвета/паттерна: `<...>`
- Как выбранная эпоха влияет на физический тип индикатора/эмиттера: `<...>`
- Idle без ложной работы; ветер/погода/ночь/пауза (если есть): `<...>`
- Что рисует AI, что анимирует/подсвечивает код: `<...>`
- Для E5: physical emitter/lift hardware отдельно от code-owned hologram/glow/field/hover motion: `<...>`
- Rest reconstruction / motion sheet / event integration evidence: `<...>`

## F. Source, QA, promotion

- Prompt path + verbatim style bible check: `<...>`
- Era matrix profile applied + transition evidence: `<...>`
- Source gen ID / exact original SHA / dimensions / Drive ID: `<...>`
- Previous-era + E0 reference IDs: `<...>`
- Pipeline config / tool revisions / candidate SHA: `<...>`
- Auto QA: `pending/pass/fail` + evidence URL
- Visual SHA-bound QA: `pending/approved/rejected` + reviewer + exact SHA
- Projection/scene QA: `pending/pass/fail` + evidence
- Era distinctness/blind-order QA: `pending/pass/fail` + evidence
- Rig/event QA: `not-applicable/pending/pass/fail` + evidence
- Runtime contract / game regression: `pending/pass/fail` + commit/run URL
- Open blockers / reason / owner / next action: `<...>`
- Rollback (previous approved version): `<...>`

**Ни одна строка `UNKNOWN` по обязательному runtime/approval контракту не превращается в `ready` молча.**
