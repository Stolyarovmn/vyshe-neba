# Шаблон запроса на спрайт (HD-пиксель, генератор изображений)

Построен по официальному руководству OpenAI к моделям изображений (Cookbook «GPT Image Generation Models Prompting Guide», 2026): один порядок «сцена → объект → детали → ограничения», короткие помеченные блоки вместо абзаца, референсы по номеру с ролью, литеральные запреты в конце, при правке — «change only X, keep everything else the same» с повторением инвариантов. Целевая длина запроса 60–120 слов; лист из 5 ячеек — до 160.

Один запрос = один объект или один ряд одинаковых ячеек одной камеры. Первому запросу в чате прикладываются референсы; дальше стиль держится контекстом чата, но блок «Стиль» всё равно повторяется.

```
Purpose: game sprite sheet for a pixel-art rocket game (runtime asset).

Image 1: style reference — HD pixel art island. Take only the pixel style, palette and lighting.
Image 2: subject reference — current <object>. Take only the subject and its colors; do not copy its outline or gloss.
[Image 3: era reference sheet E<n> — materials and mechanics vocabulary only.]

Camera: <one of:
  "strict top-down 3/4 like the island (flight scene)" |
  "front view from the south, 40° above the horizon, orthographic, no rotation (base scene)" |
  "front three-quarter view, large bold silhouette (shop icon)" |
  "strict side view, nose pointing right (aircraft)">

Subject: <one object> | <N objects in one row, left to right: 1) … 2) … N) …; each centered in its own equal cell, same scale>.
Scale: <a person ≈ 1/12 of the fuel tank height>.
Era: E0 1978 — welded steel, pipes, angle iron, wood where justified, dial gauges, incandescent lamps (ERA_DESIGN_MATRIX).

Style (keep every time): HD pixel art, dense hand-placed pixels, muted earthy palette, shadows dark navy-teal,
colored (not black) outlines, light from the top-left, hard pixel edges.

Composition: flat solid magenta #FF00FF background, wide margins.
Do not: text, letters, numbers, frames, cast shadows on the background, glow, blur, gradients, anti-aliasing.
```

Правка после генерации (тот же чат):

```
Change only <что именно>. Keep everything else the same: camera, scale, palette, lighting, magenta background, no text, no shadows.
```

После генерации:

- оригинал сохранить нетронутым (Drive, если объект идёт в production history);
- `python tools/hd_pixel/bake_seq.py <root> <png> "<путь:ширина>,…"` или специализированный `bake_*.py`;
- `python tools/hd_pixel/measure_style.py <выход.png>` — цветов ≤ 300, полупрозрачных 0, контур не `#000000`;
- примерка в сцене (`composite.py` для базы) и скриншот из игры для приёмки владельцем.

Записать в паспорт объекта (`ASSET_BRIEF_TEMPLATE.md`): дата, чат, номер попытки, что отклонено и почему.

Проверено на практике (ноябрь 2026, 11 листов E0): ряд из 4–6 ячеек с «same scale» держит масштаб; «magenta background» надёжнее прозрачности для последующей обработки; указание «no black outlines» работает только вместе с референсом стиля; большие сцены (весь остров) генерируются дольше 2 минут и расходятся с раскладкой — их не заказывать, остров делается рендером рельефа.
