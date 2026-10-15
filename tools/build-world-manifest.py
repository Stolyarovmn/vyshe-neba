"""Rebuild metadata from prepared artwork; artwork lives in art/gen, not dist."""
import json
import numpy as np
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
dest = root / 'outputs/rocket/dist/assets/world'
parts = json.loads((root / 'art/balloon-parts.json').read_text())
sprites = {}
for p in sorted(dest.glob('*.png')):
    im = Image.open(p)
    entry = {'width': im.width, 'height': im.height, 'anchor': [0.5, 0.5]}
    if p.stem in parts:
        entry.update(parts[p.stem])
    if p.stem.startswith(('core_', 'booster_', 'capsule_')):
        entry['anchor'] = [0.5, 1]
        entry['exhaust'] = [0.5, 1]
    if p.stem in ('terrain_moon', 'terrain_mars') or p.stem.startswith(('pad_moon_', 'pad_mars_')):
        alpha = np.array(im.convert('RGBA'))[:, :, 3]
        rows = [np.where(alpha[:, x] > 128)[0] for x in range(im.width * 2 // 5, im.width * 3 // 5)]
        deck = float(np.median([r[0] for r in rows if len(r)]))
        entry['landingAnchor'] = [0.5, deck / im.height]
    if p.stem.startswith('satellite_'):
        entry['panelJoints'] = [[0.08, 0.5], [0.92, 0.5]]
    sprites[p.stem] = entry
manifest = {
    'version': 1, 'eras': [1978, 1986, 1998, 2015, 2035, 2060],
    'altitudeUnit': 'world units; 1 world unit = 10 game meters',
    'selection': 'Technology uses base era; nature has no era. Existing Journey.objectKind controls hazard altitude.',
    'sprites': sprites,
}
(dest / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'{len(sprites)} prepared sprites in manifest')
