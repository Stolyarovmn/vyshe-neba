# B03 — Система посадочного наведения (`landing_guidance`)

B03 производится по `ref2game` и `art/docs/ASSET_PRODUCTION_PIPELINE.md`. Покупка ставит симметричную пару, но production-арт всегда описывает **один** маяк.

## Текущий статус

Автоматический production pass для E0–E5 завершился технически успешно: Pixel Snapper, common-scale normalization, Aseprite indexed/no-dither и per-file QA проходят. Однако обязательный gameplay-size visual gate **не пройден**.

Текущая lineage слишком широкая и низкая для authored footprint `46×82 LP`: при почти заполненной допустимой ширине (`31–41 LP`) видимая высота составляет только `35–42 LP`, тогда как production prompt требует примерно `70–76 LP`. Это невозможно исправить простым масштабированием без выхода по ширине — нужна новая исходная геометрия.

Поэтому:

- processed E0–E5 остаются в `art/gen/` только как QA/rejection evidence;
- runtime-копии удалены и не считаются опубликованными;
- part extraction / pivots / rig для этой lineage не выполняются;
- следующий шаг — **перегенерация E0** как высокого узкого посадочного маяка по текущему `art/prompts/b03_landing_guidance.md`, затем E1→E5 последовательно от утверждённого predecessor.

Подробная причина и измерения: `visual_qa.json`.

## Runtime contract после новой lineage

- canvas: `46×82 LP`;
- registration: `(23,78)` bottom-center;
- visible target: примерно `38–42 LP` wide × `70–76 LP` high;
- parts: `base` static, `head` pan/tilt, `lamp` state;
- код владеет corridor / touchdown marker / beam / glow / HUD / dynamic light;
- whole-sprite fake motion запрещён;
- pivots измеряются только по утверждённому processed art.
