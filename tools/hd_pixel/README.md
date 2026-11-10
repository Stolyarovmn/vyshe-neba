# tools/hd_pixel — перевод картинок в стиль HD-острова

Скрипты, которыми в ноябре 2026 сделаны все спрайты E0 ветки `slice/e0-hd-pixel`. Правила — `art/docs/ART_DIRECTION_HD_PIXEL.md`. Зависимости: Python 3.11, numpy, Pillow; для изометрии — Blender 5.2 (`iso_render.py` запускается внутри Blender).

Аргумент `root` везде — корень дерева с runtime (`game/assets/...`), обычно worktree ветки `main`.

| Скрипт | Что делает | Вызов |
| --- | --- | --- |
| `hdpixel.py` | библиотека: палитра острова, хромакей `#FF00FF`, разрез листа на ячейки, уменьшение с премультипликацией, акценты эпохи, перевод в палитру, альфа 0/255 | импортируется остальными |
| `measure_style.py` | замер «пиксельности»: размер, шаг сетки, число цветов, полупрозрачный край, насыщенность/яркость, цвет контура, направление света | `python measure_style.py a.png b.png …` → JSON |
| `palette_remap_demo.py` | лист сравнения: куски острова ×3, спрайты как есть и в палитре острова | `python palette_remap_demo.py <root> <outdir>` |
| `bake_seq.py` | общий запекатель листа: ячейки слева направо → файлы, спецификация `путь:ширина` или `путь:ШxВ` (точный холст) | `python bake_seq.py <root> sheet.png "aircraft/low-primary.png:224,…"` |
| `bake_rocket.py` | три ступени одного диаметра → `rocket/stack_{booster,core,capsule}.png`, корпус 120 px | `python bake_rocket.py <root> sheet.png <outdir>` |
| `bake_ring.py` | горизонтальное кольцо → `pickups/ring_h_back.png` + `ring_h_front.png` на общем холсте, центр отверстия в центре | `python bake_ring.py <root> ring.png <outdir>` |
| `bake_icons.py` | иконки 96×96 (монета 64×64) из ряда ячеек | `python bake_icons.py <root> sheet.png <outdir> <coin.png> key1,key2,…` |
| `bake_items.py` | парашют, бонусы и иконки расходников из одного листа | `python bake_items.py <root> sheet.png` |
| `bake_map.py` | радар и метеостанция для карты полёта | `python bake_map.py <root> sheet.png` |
| `bake_buildings.py` | пересборка старых зданий 73° крупнее (×1,6–3) 1:1 с пикселем острова, с ON-кадрами; печатает новые `e0.size/footprint` | `python bake_buildings.py <root> <ref_root>` |
| `heightmap.py` | карта высот острова из `start-island.png` (море, пляж, плато, скалы) | `python heightmap.py start-island.png <outdir>` |
| `iso_render.py` | Blender: рельеф + текстура острова, ортокамера под углом ELEV, прозрачное поле; проекция якорей → `layout_proj.json` | `blender -b -P iso_render.py -- island_alpha.png height.npy anchors.json <outdir> 40` |
| `write_layout.py` | `base-iso.json` из проекции якорей и размеров `iso/<key>.png`; ручные поправки — `OVERRIDES` | `python write_layout.py <root> layout_proj.json` |
| `composite.py` | примерка: остров изометрии + постройки + ракета-стек по `base-iso.json` | `python composite.py <root> out.png` |

Порядок для новой постройки E0: запрос по `art/docs/templates/SPRITE_REQUEST.md` в двух камерах → `bake_seq.py` в `base/` (полёт) и `iso/` (база) → иконка через `bake_icons.py` → `write_layout.py` → `composite.py` → размеры в `manifest.js` → сборка и скриншоты.
