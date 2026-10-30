#!/usr/bin/env python3
"""Генерирует art/placeables/BASE_ISLAND_LAYOUT.json (version 3) — раскладку построек на HD-острове.

Таблица ниже — единственный источник правды: якоря в пикселях HD-острова (start_island_hd.png, 1916x821,
ось Y вниз), размер видимого спрайта и «след» на земле. Скрипт считает uv и мировые координаты, проверяет
по маске суши (start_island_hd.land.json), что след каждой постройки целиком на земле, не пересекает
другие постройки и стартовую площадку, и записывает JSON. Тот же набор правил проверяет game/test/render.layout-island.test.mjs.

Запуск: python game/tools/island-layout.py   (numpy не нужен)
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LAYOUT = os.path.join(ROOT, 'art', 'placeables', 'BASE_ISLAND_LAYOUT.json')
LAND = os.path.join(ROOT, 'art', 'gen', 'environment', 'start_island_hd.land.json')
DOC = os.path.join(ROOT, 'art', 'docs', 'BASE_ISLAND_LAYOUT.md')

NAMES = {
    'beacons': 'Стартовые маяки', 'gantry': 'Башня обслуживания', 'deluge': 'Охлаждение площадки',
    'service': 'Сервисная команда', 'rescue': 'Спасательная станция', 'fuel': 'Топливный комплекс',
    'logistics': 'Логистический терминал', 'factory': 'Производственный цех', 'weather': 'Метеостанция',
    'control': 'Центр управления', 'radar': 'Радар слежения', 'energy': 'Энергетический узел',
    'observation': 'Наблюдательный комплекс', 'recovery': 'Система возврата',
}

ISLAND_SIZE = (1916, 821)
LAUNCH_ORIGIN = (388, 375)      # центр стартовой площадки: здесь стоит ракета, это нуль мировых координат
UNITS_PER_PX = 0.665            # 1 ед. мира (10 м) = 1/0.665 пикселя острова: октагон 256 px = 170 ед. (ширина посадочной зоны sim)
PAD_CORE = {'center_px': [388, 375], 'radius_px': 52, 'trench_px': [372, 403, 405, 486]}  # ракета, мачта и пламенный канал
WATER_SURFACE = 'код рисует море вокруг острова; бирюзовая кайма входит в арт острова'

# ключ: (зона, [якоря (x, y) — низ по центру], размер спрайта (w, h) px, след на земле (w, d) px, причина)
PURCHASES = {
    'beacons': ('launch_core', [(284, 396), (492, 396)], (72, 140), (62, 22), 'По обе стороны стартовой площадки, на уровне ракеты.'),
    'gantry': ('launch_core', [(484, 267)], (125, 190), (108, 32), 'У северо-восточного края площадки, вне траектории ракеты.'),
    'deluge': ('launch_core', [(526, 528)], (122, 150), (105, 30), 'У юго-восточного края площадки, рядом с пламенным каналом.'),
    'service': ('service_central', [(656, 423)], (140, 96), (120, 28), 'На бетонной дороге к востоку от площадки.'),
    'rescue': ('service_central', [(740, 340)], (139, 84), (120, 26), 'Конец бетонной дороги: быстрый выезд к старту.'),
    'fuel': ('fuel_east', [(870, 470)], (160, 82), (138, 26), 'Грунтовая площадка, отделена от старта сервисной зоной.'),
    'logistics': ('logistics_east', [(1200, 470)], (141, 125), (121, 30), 'Центральная грунтовая площадка с выездом к берегу.'),
    'factory': ('industrial_east', [(920, 255)], (190, 145), (171, 34), 'Большая площадка вверху, дальше от старта.'),
    'weather': ('command_north', [(1000, 350)], (142, 180), (100, 28), 'Вершина скального холма без экранирования.'),
    'control': ('command_north', [(1320, 250)], (170, 135), (153, 34), 'Площадка вверху справа с прямой видимостью старта.'),
    'radar': ('command_north', [(798, 174)], (124, 170), (107, 30), 'Высокая гряда на северо-западе с открытым горизонтом.'),
    'energy': ('utility_east', [(1500, 380)], (139, 125), (120, 30), 'Большая площадка справа, между потребителями.'),
    'observation': ('perimeter_east', [(1378, 378)], (138, 150), (119, 30), 'Скальный холм справа с обзором стартовой площадки.'),
    'recovery': ('recovery_east', [(1610, 478)], (140, 95), (120, 28), 'Берег справа внизу, у дальней береговой логистики.'),
}
# Объекты-входы в мире: не покупаются, открывают экраны (хаб.hitTest возвращает эти ключи).
# ключ: (зона, [якоря], размер спрайта (w, h) px, след на земле (w, d) px, название, причина)
ENTRIES = {
    'workshop': ('launch_core', [(330, 262)], (130, 157), (114, 28), 'Мастерская', 'Сервисный подъёмник эпохи к северу от площадки: отсюда собирают ракету.'),
    'monument': ('launch_core', [(232, 276)], (50, 120), (44, 22), 'Памятник эпох', 'Обелиск на северо-западной косе: лампы по пройденным эпохам; спрайт не заходит на доску контрактов.'),
    'board': ('launch_core', [(210, 352)], (78, 72), (60, 20), 'Доска контрактов', 'У западного края площадки, рядом со стартовой зоной, ниже памятника.'),
    'shop': ('launch_core', [(578, 352)], (120, 98), (110, 30), 'Лавка', 'Прилавок у начала дороги, между площадкой и сервисным двором.'),
}

ASSET_FAMILIES = {
    'B01_weather_complex': {'purchase': 'weather', 'zone': 'command_north'},
    'B02_tracking_radar': {'purchase': 'radar', 'zone': 'command_north'},
    'B03_landing_guidance': {'purchase': 'beacons', 'zone': 'launch_core'},
    'B04_recovery_complex': {'purchase': 'recovery', 'zone': 'recovery_east'},
    'B05_fuel_depot': {'purchase': 'fuel', 'zone': 'fuel_east'},
    'B06_deep_comms': {'purchase': 'control', 'zone': 'command_north'},
    'B07_cargo_terminal': {'purchase': 'logistics', 'zone': 'logistics_east'},
}


def load_land():
    with open(LAND, encoding='utf-8') as f:
        data = json.load(f)
    rows = []
    for row in data['land_hex_rows']:
        bits = ''.join(format(int(c, 16), '04b') for c in row)[: data['cols']]
        rows.append([b == '1' for b in bits])
    return rows, data['cell_px']


def footprint_rect(anchor, footprint):
    x, y = anchor
    w, d = footprint
    return (x - w / 2, y - d, x + w / 2, y)


def land_fraction(rect, land, cell):
    x0, y0, x1, y1 = rect
    total = hit = 0
    for cy in range(int(y0 // cell), int(y1 // cell) + 1):
        for cx in range(int(x0 // cell), int(x1 // cell) + 1):
            total += 1
            if 0 <= cy < len(land) and 0 <= cx < len(land[0]) and land[cy][cx]:
                hit += 1
    return hit / total if total else 0


def overlap(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def circle_hits_rect(center, radius, rect):
    cx = min(max(center[0], rect[0]), rect[2])
    cy = min(max(center[1], rect[1]), rect[3])
    return (cx - center[0]) ** 2 + (cy - center[1]) ** 2 < radius ** 2


def validate(land, cell):
    errors = []
    rects = []
    trench = PAD_CORE['trench_px']
    items = [(key, anchors, footprint) for key, (zone, anchors, size, footprint, reason) in PURCHASES.items()]
    items += [(key, anchors, footprint) for key, (zone, anchors, size, footprint, name, reason) in ENTRIES.items()]
    for key, anchors, footprint in items:
        for index, anchor in enumerate(anchors):
            rect = footprint_rect(anchor, footprint)
            tag = f'{key}[{index}]'
            if rect[0] < 0 or rect[2] > ISLAND_SIZE[0] or rect[1] < 0 or rect[3] > ISLAND_SIZE[1]:
                errors.append(f'{tag}: след выходит за остров')
            if land_fraction(rect, land, cell) < 0.9:
                errors.append(f'{tag}: след не на суше ({land_fraction(rect, land, cell):.2f})')
            if circle_hits_rect(PAD_CORE['center_px'], PAD_CORE['radius_px'], rect):
                errors.append(f'{tag}: пересекает ракету на площадке')
            if overlap(rect, tuple(trench)):
                errors.append(f'{tag}: пересекает пламенный канал')
            for other_tag, other in rects:
                if overlap(rect, other):
                    errors.append(f'{tag} пересекается с {other_tag}')
            rects.append((tag, rect))
    return errors


def build():
    purchases = {}
    for key, (zone, anchors, size, footprint, reason) in PURCHASES.items():
        purchases[key] = {
            'name': NAMES[key],
            'zone': zone,
            'anchors': [list(a) for a in anchors],
            'anchors_uv': [[round(a[0] / ISLAND_SIZE[0], 5), round(a[1] / ISLAND_SIZE[1], 5)] for a in anchors],
            'anchors_world': [[round((a[0] - LAUNCH_ORIGIN[0]) * UNITS_PER_PX, 2), round((a[1] - LAUNCH_ORIGIN[1]) * UNITS_PER_PX, 2)] for a in anchors],
            'sprite_px': list(size),
            'footprint_px': list(footprint),
            'reason': reason,
        }
    entries = {}
    for key, (zone, anchors, size, footprint, name, reason) in ENTRIES.items():
        entries[key] = {
            'name': name,
            'zone': zone,
            'anchors': [list(a) for a in anchors],
            'anchors_uv': [[round(a[0] / ISLAND_SIZE[0], 5), round(a[1] / ISLAND_SIZE[1], 5)] for a in anchors],
            'anchors_world': [[round((a[0] - LAUNCH_ORIGIN[0]) * UNITS_PER_PX, 2), round((a[1] - LAUNCH_ORIGIN[1]) * UNITS_PER_PX, 2)] for a in anchors],
            'sprite_px': list(size),
            'footprint_px': list(footprint),
            'reason': reason,
        }
    return {
        'version': 3,
        'world': {
            'island_asset': 'art/gen/environment/start_island_hd.png',
            'land_mask': 'art/gen/environment/start_island_hd.land.json',
            'island_size_px': list(ISLAND_SIZE),
            'launch_origin_px': list(LAUNCH_ORIGIN),
            'units_per_px': UNITS_PER_PX,
            'pad_core': PAD_CORE,
            'coordinates': 'px: пиксели HD-острова, начало слева сверху, ось Y вниз; якорь — низ спрайта по центру. world: единицы мира относительно launch_origin_px (1 ед. = 10 м), ось Y вниз; uv: доли размера острова.',
            'sea': WATER_SURFACE,
        },
        'rules': {
            'starter_scene': 'Есть только стартовая площадка с чистым столом; башня и все покупаемые расширения появляются после покупки.',
            'placement': 'У каждой покупки зарезервирован якорь на суше. След (footprint_px) не выходит за остров, не пересекает ракету, пламенный канал и другие постройки.',
            'water': 'Море вокруг острова рисует код с подобранным цветом и реакцией на погоду; бирюзовая кайма мелководья — часть арта острова.',
            'sprite_scale': 'sprite_px — целевой видимый размер спрайта в пикселях острова (пропорционален footprint из art/placeables/PRODUCTION_MANIFEST.md, 1 LP ≈ 1.45 px).',
        },
        'purchases': purchases,
        'entries': entries,
        'asset_families': ASSET_FAMILIES,
    }


def doc_text(layout):
    rows = []
    for key, purchase in layout['purchases'].items():
        anchors = '; '.join(f'({a[0]}, {a[1]})' for a in purchase['anchors'])
        world = '; '.join(f'({w[0]:.0f}, {w[1]:.0f})' for w in purchase['anchors_world'])
        size = '×'.join(str(v) for v in purchase['sprite_px'])
        rows.append(f"| {NAMES[key]} | `{key}` | `{purchase['zone']}` | {anchors} | {world} | {size} | {purchase['reason']} |")
    table = '\n'.join(rows)
    entry_rows = []
    for key, entry in layout['entries'].items():
        anchors = '; '.join(f'({a[0]}, {a[1]})' for a in entry['anchors'])
        world = '; '.join(f'({w[0]:.0f}, {w[1]:.0f})' for w in entry['anchors_world'])
        size = '×'.join(str(v) for v in entry['sprite_px'])
        entry_rows.append(f"| {entry['name']} | `{key}` | {anchors} | {world} | {size} | {entry['reason']} |")
    entry_table = '\n'.join(entry_rows)
    families ='\n'.join(f"| `{k}` | `{v['purchase']}` | `{v['zone']}` |" for k, v in layout['asset_families'].items())
    return f'''# Стартовый остров и размещение расширений базы

Документ фиксирует геометрию стартового острова и канонические позиции покупок. Машиночитаемый источник — `art/placeables/BASE_ISLAND_LAYOUT.json` (version 3); при расхождении прав JSON. Файл и эта таблица генерируются скриптом `game/tools/island-layout.py` (таблица якорей лежит в нём же).

## Остров

Рантайм-ассет — `art/gen/environment/start_island_hd.png` ({ISLAND_SIZE[0]}×{ISLAND_SIZE[1]}, вид сверху-3/4, оригинал в высоком разрешении с Google Drive; происхождение, хеши и статус «ждёт утверждения» — в `start_island_hd.meta.json`). Запечённая башня удалена скриптом `game/tools/prepare-island-hd.py`: башня — это покупаемая «Башня обслуживания», ракета стоит на чистом пусковом столе в центре площадки. Предыдущий остров (`start_island_e0.png`, 384×166) остаётся резервом.

- Система координат раскладки: пиксели острова (начало слева сверху, ось Y вниз). Якорь постройки — низ спрайта по центру.
- Мировые единицы (1 ед. = 10 м) отсчитываются от центра стартовой площадки {LAUNCH_ORIGIN}; масштаб {UNITS_PER_PX} ед. на пиксель (октагон площадки 256 px = 170 ед. — ширина посадочной зоны sim). Остров {ISLAND_SIZE[0] * UNITS_PER_PX:.0f}×{ISLAND_SIZE[1] * UNITS_PER_PX:.0f} ед.
- Море вокруг острова рисует код (цвет по погоде, штормовое затемнение поверх); бирюзовая кайма мелководья — часть арта острова.
- Маска суши для проверок: `art/gen/environment/start_island_hd.land.json` (ячейка 8 px).

## Зоны и покупки

| Покупка | Ключ | Зона | Якорь (px острова) | Мир (ед.) | Спрайт (px) | Причина позиции |
| --- | --- | --- | --- | --- | --- | --- |
{table}

## Объекты-входы

Не покупаются, открывают экраны; `hub.hitTest` возвращает их ключи. Лежат в JSON в разделе `entries` с теми же полями, что у покупок.

| Объект | Ключ | Якорь (px острова) | Мир (ед.) | Спрайт (px) | Причина позиции |
| --- | --- | --- | --- | --- | --- |
{entry_table}

«Спрайт» — целевой видимый размер в пикселях острова (пропорционален footprint из `art/placeables/PRODUCTION_MANIFEST.md`, 1 LP ≈ 1,45 px). След на земле (`footprint_px`) лежит в JSON.

## Связь с семействами объектов

| Семейство | Покупка | Зона |
| --- | --- | --- |
{families}

Правило размещения: у каждой покупки зарезервирован якорь на суше; след не выходит за остров, не пересекает ракету на столе, пламенный канал и другие постройки.

## Проверка полностью развитой базы

Тест `game/test/render.island.test.mjs` проверяет по маске суши и раскладке:

1. у всех 14 покупок есть якорь, зона и размер;
2. след каждой постройки целиком (≥ 90 %) на суше и внутри острова;
3. постройки не перекрываются между собой;
4. пусковой стол (ракета, пламенный канал) свободен;
5. ни одна покупка не рисуется до покупки (хаб рисует только `profile.buildings[key] > 0`).

## Портретный режим

Хаб показывает остров крупно у площадки (≈ 300 ед. по ширине), перетаскивание двигает карту, щипок и двойной тап меняют зум; в ландшафте стартовый кадр шире (≈ 760 ед.). Геометрия не пересчитывается между раскладками — меняются только зум и центр вида.
'''


def main():
    land, cell = load_land()
    errors = validate(land, cell)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    layout = build()
    with open(LAYOUT, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)
        f.write('\n')
    with open(DOC, 'w', encoding='utf-8') as f:
        f.write(doc_text(layout))
    print(f'{os.path.relpath(LAYOUT, ROOT)} и {os.path.relpath(DOC, ROOT)}: {len(PURCHASES)} покупок, раскладка проверена')
    return 0


if __name__ == '__main__':
    sys.exit(main())
