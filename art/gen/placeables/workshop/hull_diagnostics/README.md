# W06 — Стенд диагностики корпуса (`hull_diagnostics`)

Производственный пакет покупаемого объекта мастерской по `art/style_bible.txt`, `art/placeables/PRODUCTION_MANIFEST.md` и `ref2game`.

## Эпохи

| cell | era | year | lineage |
|---:|---|---:|---|
| 0 | E0 | 1978 | ручная измерительная рама, открытая механика, аналоговый pad |
| 1 | E1 | 1986 | моторизованный промышленный портал, гидравлика |
| 2 | E2 | 1998 | ультразвуковой стенд + CRT/rack |
| 3 | E3 | 2015 | модульный лазерно-оптический портал |
| 4 | E4 | 2035 | роботизированная inspection-frame |
| 5 | E5 | 2060 | лёгкая multisensor scanner-арка |

Каждый atlas имеет фиксированную раскладку `3×2`: `E0 E1 E2 / E3 E4 E5`, cell `184×220 LP`.

## Файлы

- `frame_eras.png` — статическая несущая конструкция;
- `pad_unit_eras.png` — физический наземный диагностический блок;
- `scan_carriage_eras.png` — линейная каретка;
- `scanner_head_eras.png` — отдельная поворотная сенсорная головка;
- runtime `e0_1978.png` … `e5_2060.png` — собранные anchor sprites.

## Animation

Whole-sprite motion запрещён. Реальная работа:

`NOTICE → SCAN_DOWN → [PAUSE_ON_DAMAGE] → SCAN_UP → FINISH`

Каретка движется только по измеренному вертикальному rail. Scanner head может отдельно менять угол вокруг указанного pivot. Луч сканирования, маркер дефекта, экранные данные и indicator light — code-owned FX.

Поскольку W06 создан прямо на `1 LP` сетке, rail/pivot coordinates в manifest — фактические координаты art, а не design-intent.
