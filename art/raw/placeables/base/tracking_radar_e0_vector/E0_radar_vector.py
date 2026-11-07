"""Радар E0 с парой направленных решёток и ручным наведением."""

import argparse
from pathlib import Path

from PIL import Image

from E0_rigid_scene import RigidScene

parser = argparse.ArgumentParser()
parser.add_argument("--processed", type=Path)
args = parser.parse_args()


scene = RigidScene(width=480, height=460, scale=100, origin=(240, 350), taper=.035)
slab = ("#96917d", "#726e60", "#5f6053")
paint = ("#86918a", "#5c6b66", "#475751")
steel = "#9da79b"
scene.box(-.74, .74, -.59, .59, 0, .11, slab)
scene.box(-.23, .23, -.24, .24, .11, .16, paint)
for x in (-.17, .17):
    for y in (-.17, .17):
        scene.disc(x, y, .17, .037, "#c6baa0")
scene.box(-.12, .12, -.13, .13, .16, 1.83, paint)
scene.disc(0, 0, 1.09, .25, "#596762")
scene.disc(0, 0, 1.13, .20, "#8b9686")
# Рукоять на оси червячного редуктора, доступ со стороны южного края плиты.
scene.box(.12, .34, .06, .28, .91, 1.14, paint)
scene.line([(.28, .25, 1.03), (.28, .58, 1.03), (.50, .58, 1.03)], "#aa9d80", 9)
scene.line([(.50, .58, 1.03), (.50, .68, 1.03)], "#424b44", 13)
scene.box(-.24, .24, -.16, .16, 1.69, 1.99, paint)
scene.disc(.245, 0, 1.85, .10, "#b2a78c", normal="x")
# Пара синфазных антенн по обе стороны от оси подвеса. Директоры смотрят на север.
scene.line([(-.96, .18, 1.98), (.96, .18, 1.98)], "#64736c", 13)
for x in (-.96, .96):
    scene.line([(x, .54, 2.07), (x, -1.13, 2.07)], "#65756e", 10)
    for y, span in ((.49, .86), (.12, .72), (-.32, .61), (-.77, .52), (-1.10, .45)):
        if y == .12:
            for side in (-1, 1):
                scene.line([(x + side * .06, y, 2.07), (x + side * span, y, 2.07)], "#a7a78d", 8)
        else:
            scene.line([(x - span, y, 2.07), (x + span, y, 2.07)], steel, 7)
    scene.line([(x, .12, 2.03), (x, .19, 1.96), (0, .19, 1.96)], "#3d4b46", 5)
scene.mark("ground", (0, 0, 0))
scene.mark("azimuth", (0, 0, 1.09))
scene.mark("elevation", (.245, 0, 1.85))
scene.mark("crank", (.50, .68, 1.03))
far = scene.project(.74, -.59, 0)[0] - scene.project(-.74, -.59, 0)[0]
near = scene.project(.74, .59, 0)[0] - scene.project(-.74, .59, 0)[0]
assert .94 < far / near < .98
assert 3.5 < 2 * (.96 + .86) < 3.9
scene.save("E0_radar_vector", "Радар E0 с двумя направленными антеннами на ручном подвесе")

island = Image.open("E0_ALL14_current_TEST_ONLY.png").convert("RGBA")
terrain = Image.open("b03-production/art/gen/environment/start_island_hd.png").convert("RGBA")
site = (808, 242, 851, 271)
island.paste(terrain.crop(site), site[:2])
bounds = scene.image.getchannel("A").getbbox()
sprite = scene.image.crop(bounds)
if args.processed:
    candidate = Image.open(args.processed).convert("RGBA")
    left, top, right, bottom = candidate.getchannel("A").getbbox()
    assert right - left in (sprite.width, sprite.width + 1)
    assert bottom - top in (sprite.height, sprite.height + 1)
    aligned = candidate.crop((left, top, left + sprite.width, top + sprite.height))
    assert aligned.getchannel("A").tobytes() == sprite.getchannel("A").tobytes()
    sprite = aligned
ratio = 44 / (6 * scene.scale)
size = tuple(round(dimension * ratio) for dimension in sprite.size)
sprite = sprite.resize(size, Image.Resampling.BOX)
sprite.putalpha(sprite.getchannel("A").point(lambda alpha: 255 if alpha >= 40 else 0))
if args.processed:
    sprite.save(args.processed.with_name("e0_1978.runtime_candidate.png"))
island.alpha_composite(sprite, (830 - round((scene.origin[0] - bounds[0]) * ratio),
                               261 - round((scene.origin[1] - bounds[1]) * ratio)))
suffix = "_processed" if args.processed else ""
island.crop((798, 230, 865, 282)).resize((469, 364), Image.Resampling.NEAREST).save(
    f"E0_radar_vector{suffix}_scene_TEST_ONLY.png"
)
print("Габарит на острове", size, "отношение кромок", round(far / near, 4))
