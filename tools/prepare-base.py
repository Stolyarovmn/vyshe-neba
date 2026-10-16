"""Prepare the imagegen base atlas without trimming its six-cell registration."""
import importlib.util
import json
import hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ref2game_prep', root / 'tools/ref2game/prep.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
source = root / 'art/gen/base_static_sheet.png'
image, metadata = prep.prep_one(source, 'base_static_sheet', dict(prep.DEF, notrim=['*'], max=4096))
assert image.getchannel('A').getextrema() == (255, 255), 'Base must be opaque'
image.save(root / 'outputs/rocket/dist/assets/base-static.png')
metadata.update(source='art/gen/base_static_sheet.png', sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(), grid=[3, 2])
(root / 'art/base-prepared.json').write_text(json.dumps(metadata, indent=2) + '\n')
print('Opaque base prepared with six-cell registration:', image.size)
