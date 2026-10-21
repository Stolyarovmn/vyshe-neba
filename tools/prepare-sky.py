"""Prepare the opaque imagegen sky separately from the world sprite registry."""
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ref2game_prep', root / 'tools/ref2game/prep.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
cfg = dict(prep.DEF, notrim=['sky_color_plate'], max=4096)
image, metadata = prep.prep_one(root / 'art/gen/sky_color_plate.png', 'sky_color_plate', cfg)
image.save(root / 'outputs/rocket/dist/assets/sky-color-plate.png')
(root / 'art/sky-prepared.json').write_text(json.dumps(metadata, indent=2) + '\n')
print('Opaque sky prepared without trimming or changing aspect:', image.size)
