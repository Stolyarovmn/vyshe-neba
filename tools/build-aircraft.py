"""Normalize measured pixel anchors and package the same prepared art used by QA.

Run ref2game prep first. This script never generates or paints imagery.
"""
import hashlib
import json
from pathlib import Path
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'art/aircraft'
RUNTIME = ROOT / 'outputs/rocket/dist/assets/aircraft'
PREPARED = RUNTIME.parent / 'world'
YEARS = [1978, 1986, 1998, 2015, 2035, 2060]
LINEAGES = ['low_primary', 'low_multiwing', 'medium_passenger', 'medium_cargo',
            'high_fighter', 'high_experimental']
KINDS = ['propellers', 'engines', 'fans', 'navLights', 'contrailPoints']


def main():
    candidates = json.loads((ART / 'anchor-candidates-r2.json').read_text())
    source = candidates['profiles']
    effects = {'version': 2, 'coordinateSpace': 'normalized full prepared image',
               'source': 'art/aircraft/anchor-candidates-r2.json',
               'profiles': {}, 'sprites': {}}
    provenance = {'version': 1, 'prep': 'tools/ref2game/prep.py', 'sprites': {}}
    expected = [f'{lineage}_{year}' for lineage in LINEAGES for year in YEARS]
    assert set(source) == set(expected), 'All 36 individual profiles required'
    RUNTIME.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(RUNTIME / 'aircraft-sprites-36.zip', 'w', zipfile.ZIP_STORED) as archive:
        for name in expected:
            data = source[name]
            raw_source = ROOT / 'art/gen' / f'{name}.png'
            assert data['sha256'] == hashlib.sha256(raw_source.read_bytes()).hexdigest(), (name, 'stale source landmarks')
            prepared = PREPARED / f'{name}.png'
            im = Image.open(prepared).convert('RGBA')
            w, h = im.size
            assert data['sourceSize'] == [w, h], (name, data['sourceSize'], im.size)
            alpha = im.getchannel('A')
            profile = {'engineType': data['engineType'], 'sourceSize': [w, h],
                       'sourcePixels': {}, 'measurementNotes': data.get('notes', ''),
                       'uncertaintyPx': data.get('uncertaintyPx', 3)}
            for kind in KINDS:
                points = data.get(kind, [])
                profile['sourcePixels'][kind] = points
                profile[kind] = []
                for point in points:
                    x, y = point[:2]
                    assert 0 <= x < w and 0 <= y < h, (name, kind, point)
                    # Source landmark must be on or immediately next to physical material.
                    box = (max(0, int(x) - 4), max(0, int(y) - 4),
                           min(w, int(x) + 5), min(h, int(y) + 5))
                    assert alpha.crop(box).getextrema()[1] > 128, (name, kind, point, 'off material')
                    normalized = [round(x / w, 8), round(y / h, 8)]
                    if kind == 'propellers':
                        assert len(point) == 3 and point[2] > 0
                        normalized.append(round(point[2] / h, 8))
                    elif len(point) > 2:
                        normalized.extend(point[2:])
                    profile[kind].append(normalized)
            effects['profiles'][name] = profile
            effects['sprites'][name] = name
            content = prepared.read_bytes()
            # Fixed timestamps make repeated builds byte-identical.
            entry = zipfile.ZipInfo(f'{name}.png', date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED
            archive.writestr(entry, content)
            provenance['sprites'][name] = {
                'source': f'art/gen/{name}.png',
                'prepared': f'outputs/rocket/dist/assets/world/{name}.png',
                'size': [w, h], 'preparedSha256': hashlib.sha256(content).hexdigest(),
            }
    with zipfile.ZipFile(RUNTIME / 'aircraft-sprites-36.zip') as archive:
        assert archive.testzip() is None and len(archive.namelist()) == 36
    text = json.dumps(effects, indent=2) + '\n'
    (ART / 'effects.json').write_text(text)
    (RUNTIME / 'effects.json').write_text(text)
    (ART / 'prepared-manifest.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print('36 prepared aircraft, individual anchor profiles and ZIP CRC verified')


if __name__ == '__main__':
    main()
