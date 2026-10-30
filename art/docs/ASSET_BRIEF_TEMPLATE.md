# Паспорт production asset / era / animation / projection

Создать копию для **каждой новой или изменяемой** asset family; ссылка на паспорт должна быть в prompt/tracker/PR. Неизвестное записывать `UNKNOWN`, не угадывать. Это шаблон **дизайна и QA**, не замена `PIPELINE_CONFIG.json` и не новый формат машинного tracker.

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

| Era | Сохранено от предыдущей | Заменено / почему | Добавлено / зачем | Материал, приборы, свет, интерфейс | Reference SHA / status |
| --- | --- | --- | --- | --- | --- |
| E0 / 1978 | базовая функция | — | конструкция | | |
| E1 / 1986 | | | | | |
| E2 / 1998 | | | | | |
| E3 / 2015 | | | | | |
| E4 / 2035 | | | | | |
| E5 / 2060 | | | | | |

## E. События, состояния, анимации, сигналы

| Trigger / precondition | State before → after | Parts / motion / limits | Termination, cancel, cooldown | Игровой результат и visual signal | Reduced-motion equivalent |
| --- | --- | --- | --- | --- | --- |
| `<event>` | `IDLE → NOTICE → WORK → FINISH` | | | | |

- Источник значений для индикаторов и смысл цвета/паттерна: `<...>`
- Idle без ложной работы; ветер/погода/ночь/пауза (если есть): `<...>`
- Что рисует AI, что анимирует/подсвечивает код: `<...>`
- Rest reconstruction / motion sheet / event integration evidence: `<...>`

## F. Source, QA, promotion

- Prompt path + verbatim style bible check: `<...>`
- Source gen ID / exact original SHA / dimensions / Drive ID: `<...>`
- Previous-era + E0 reference IDs: `<...>`
- Pipeline config / tool revisions / candidate SHA: `<...>`
- Auto QA: `pending/pass/fail` + evidence URL
- Visual SHA-bound QA: `pending/approved/rejected` + reviewer + exact SHA
- Projection/scene QA: `pending/pass/fail` + evidence
- Rig/event QA: `not-applicable/pending/pass/fail` + evidence
- Runtime contract / game regression: `pending/pass/fail` + commit/run URL
- Open blockers / reason / owner / next action: `<...>`
- Rollback (previous approved version): `<...>`

**Ни одна строка `UNKNOWN` по обязательному runtime/approval контракту не превращается в `ready` молча.**
