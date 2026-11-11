#!/usr/bin/env python3
"""Выгрузка раскладки полёта из закреплённого main:manifest.js в JSON v4.

Пример: python tools/hd_pixel/export_island_layout.py ../vn-clean/game/src/render/manifest.js
Разбирается только декларативное подмножество JS: объекты и числовые массивы.
Неизвестные выражения в обязательных полях вызывают ошибку, а не догадку.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / 'art/placeables/BASE_ISLAND_LAYOUT.json'
NUMBER = r'-?\d+(?:\.\d+)?'


def object_body(text: str, start: int) -> tuple[str, int]:
    """Найти парную скобку, учитывая вложенные объекты и строки."""
    depth, quote, escape = 0, None, False
    for i in range(start, len(text)):
        char = text[i]
        if quote:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i + 1
    raise ValueError('Незакрытый объект JS')


def constant(text: str, name: str) -> str | None:
    match = re.search(r'\b(?:export\s+)?const\s+' + re.escape(name) + r'\s*=\s*\{', text)
    return object_body(text, match.end() - 1)[0] if match else None


def records(body: str) -> dict[str, str]:
    out, pos = {}, 0
    while match := re.search(r'\b(\w+)\s*:\s*\{', body[pos:]):
        key = match.group(1)
        value, end = object_body(body, pos + match.end() - 1)
        if key in out:
            raise ValueError(f'Повторный ключ: {key}')
        out[key], pos = value, end
    return out


def array(body: str, key: str, optional: bool = False):
    match = re.search(r'\b' + key + r'\s*:\s*(\[(?:\s|[\d.,\[\]-])*\])', body)
    if not match:
        if optional:
            return None
        raise ValueError(f'Отсутствует числовой массив {key}')
    return json.loads(match.group(1))


def scalar(body: str, key: str):
    match = re.search(r'\b' + key + r'\s*:\s*(' + NUMBER + r')(?=\s*[,}])', body + '}')
    if not match:
        raise ValueError(f'Отсутствует число {key}')
    return json.loads(match.group(1))


def placement(body: str, world: dict, *, entry: bool = False) -> dict:
    nested = re.search(r'\be0\s*:\s*\{', body)
    e0_body = None
    if nested:
        e0_body, end = object_body(body, nested.end() - 1)
        body = body[:nested.start()] + body[end:]
    zone = re.search(r"\bzone\s*:\s*['\"]([^'\"]+)['\"]", body)
    if not zone:
        raise ValueError('Отсутствует zone')
    anchors = array(body, 'anchors')
    size, footprint = array(body, 'size'), array(body, 'footprint')
    if not anchors or any(len(p) != 2 for p in anchors) or len(size) != 2 or len(footprint) != 2:
        raise ValueError('Неверная форма якоря, размера или следа')
    width, height = world['island_size_px']
    ox, oy = world['launch_origin_px']
    scale = world['units_per_px']
    result = {
        'zone': zone.group(1), 'anchors': anchors,
        'anchors_uv': [[round(x / width, 5), round(y / height, 5)] for x, y in anchors],
        'anchors_world': [[round((x - ox) * scale, 5), round((y - oy) * scale, 5)] for x, y in anchors],
        'sprite_px': size, 'footprint_px': footprint,
    }
    if e0_body is not None:
        result['e0'] = placement('zone: ' + repr(zone.group(1)) + ', ' + e0_body, world)
    if entry:
        # Старый формат WORLD_ENTRIES хранит E0-поля плоско; сохраняем их без выдуманного footprint.
        for key in ('e0Anchor', 'e0Size'):
            value = array(body, key, optional=True)
            if value is not None:
                result[key] = value
        if re.search(r'\be0Scale\s*:', body):
            result['e0Scale'] = scalar(body, 'e0Scale')
        if match := re.search(r"\be0Sprite\s*:\s*['\"]([^'\"]+)['\"]", body):
            result['e0Sprite'] = match.group(1)
    return result


def parse_manifest(text: str) -> dict:
    text = re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)
    island = constant(text, 'ISLAND')
    buildings = constant(text, 'BUILDING_ANCHORS')
    if island is None or buildings is None:
        raise ValueError('Нужны ISLAND и BUILDING_ANCHORS')
    world = {
        'island_asset': 'game/assets/shared/island/start-island.png',
        'land_mask': 'game/assets/shared/island/start-island.land.json',
        'island_size_px': [scalar(island, 'width'), scalar(island, 'height')],
        'launch_origin_px': array(island, 'launchOrigin'),
        'units_per_px': scalar(island, 'unitsPerPx'),
        'coordinates': 'Пиксели острова: начало слева сверху, Y вниз; якорь — низ спрайта по центру. Мир: (px − launch_origin_px) × units_per_px. UV: px / размер острова.',
        'sea': 'Море рисует код; бирюзовая кайма входит в арт острова.',
    }
    if match := re.search(r'\bpadCore\s*:\s*\{', island):
        core, _ = object_body(island, match.end() - 1)
        world['pad_core'] = {'center_px': array(core, 'center'), 'radius_px': scalar(core, 'radius'), 'trench_px': array(core, 'trench')}
    purchases = {key: placement(body, world) for key, body in records(buildings).items()}
    entries_body = constant(text, 'ENTRY_ANCHORS') or constant(text, 'WORLD_ENTRIES')
    entries = {key: placement(body, world, entry=True) for key, body in records(entries_body or '').items()}
    if not entries_body:
        for key in ('workshop', 'monument', 'board', 'shop'):
            if match := re.search(r'\b' + key + r'\s*:\s*\{', text):
                body, _ = object_body(text, match.end() - 1)
                entries[key] = placement(body, world, entry=True)
    family_keys = {'B01_weather_complex': 'weather', 'B02_tracking_radar': 'radar', 'B03_landing_guidance': 'beacons', 'B04_recovery_complex': 'recovery', 'B05_fuel_depot': 'fuel', 'B06_deep_comms': 'logistics', 'B07_cargo_terminal': 'logistics'}
    return {
        'version': 4, 'world': world,
        'rules': {
            'starter_scene': 'Покупаемые постройки появляются после покупки.',
            'placement': 'Координаты и размеры выгружаются из manifest.js; геометрическую допустимость проверяют в игре.',
            'water': 'Море и реакция на погоду — код.',
            'sprite_scale': 'sprite_px = size, footprint_px = footprint; e0 содержит отдельные переопределения из manifest.js.',
        },
        'purchases': purchases, 'entries': entries,
        'asset_families': {key: {'purchase': purchase, 'zone': purchases[purchase]['zone']} for key, purchase in family_keys.items() if purchase in purchases},
    }


def export(manifest: Path, output: Path) -> dict:
    manifest = manifest.resolve()
    repo = manifest.parents[3]
    git = ['git', '-c', f'safe.directory={repo.as_posix()}', '-C', str(repo)]
    sha = subprocess.check_output(git + ['rev-parse', 'HEAD'], text=True).strip()
    branch = subprocess.check_output(git + ['branch', '--show-current'], text=True).strip()
    if branch != 'main':
        raise ValueError(f'Ожидалась ветка main, получена {branch}')
    relative = manifest.relative_to(repo).as_posix()
    source = manifest.read_bytes()
    committed = subprocess.check_output(git + ['show', f'{sha}:{relative}'])
    if source.replace(b'\r\n', b'\n') != committed.replace(b'\r\n', b'\n'):
        raise ValueError('Рабочий manifest.js отличается от закреплённого SHA')
    result = parse_manifest(source.decode('utf-8-sig'))
    result['source'] = {'branch': 'main', 'file': relative, 'sha': sha}
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, help='Путь к main:game/src/render/manifest.js')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='Выходной JSON')
    parser.add_argument('--markdown', type=Path, help='Одновременно обновить таблицу документации')
    args = parser.parse_args()
    result = export(args.manifest, args.output)
    if args.markdown:
        args.markdown.write_text(render_markdown(result), encoding='utf-8')
    print(f"Выгружено построек: {len(result['purchases'])}; входов: {len(result['entries'])}; SHA: {result['source']['sha']}")


def render_markdown(data: dict) -> str:
    sha = data['source']['sha']
    text = f'''# Раскладка острова

Источник истины сцены полёта — [main:manifest.js](https://github.com/Stolyarovmn/vyshe-neba/blob/{sha}/game/src/render/manifest.js), `ISLAND` и `BUILDING_ANCHORS`. [BASE_ISLAND_LAYOUT.json](../placeables/BASE_ISLAND_LAYOUT.json) версии 4 — воспроизводимая выгрузка из манифеста. SHA источника: `{sha}`.

Пиксели острова {data['world']['island_size_px']}: начало слева сверху, Y вниз; якорь — низ спрайта по центру. Начало мира — {data['world']['launch_origin_px']}; `world = (px − launch_origin_px) × {data['world']['units_per_px']}`. `anchors_uv` — доли ширины и высоты острова. `sprite_px` соответствует `size`, `footprint_px` — следу на земле; `e0` хранит отдельные значения E0.

Выгрузка из корня production проверяет ветку `main` и совпадение файла с HEAD:

```powershell
python tools/hd_pixel/export_island_layout.py ../vn-clean/game/src/render/manifest.js --markdown art/docs/BASE_ISLAND_LAYOUT.md
```

Изометрическая база имеет собственную раскладку [локальный base-iso.json в vn-slice](../../../vn-slice/game/assets/shared/island/base-iso.json). На 2026-11-11 этот файл и iso/ — незакоммиченный кандидат в рабочем дереве `slice/e0-hd-pixel`, а не содержимое HEAD ветки. Ссылка доступна при соседнем размещении рабочих копий. Приёмка владельцем не подтверждена; изометрические координаты не подменяют сцену полёта.

| Постройка | Якоря | size | footprint | Якоря E0 | size E0 | footprint E0 |
| --- | --- | --- | --- | --- | --- | --- |
'''
    for key, value in data['purchases'].items():
        e0 = value.get('e0', value)
        values = [f'`{key}`', value['anchors'], value['sprite_px'], value['footprint_px'], e0['anchors'], e0['sprite_px'], e0['footprint_px']]
        text += '| ' + ' | '.join(map(str, values)) + ' |\n'
    return text


if __name__ == '__main__':
    main()
