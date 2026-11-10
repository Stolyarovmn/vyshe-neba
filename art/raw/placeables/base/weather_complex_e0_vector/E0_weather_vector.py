"""Метеостанция E0 с раздельными узлами на общей мачте."""

import argparse
from math import cos, pi, sin
from pathlib import Path

from PIL import Image

from E0_rigid_scene import RigidScene

parser = argparse.ArgumentParser()
parser.add_argument("--processed", type=Path)
args = parser.parse_args()


scene = RigidScene(width=250, height=290, scale=120, origin=(115, 220), taper=0.045)
steel = ("#93988a", "#626e65", "#48554d")
concrete = ("#9a9685", "#777467", "#5b5c51")
scene.box(-.45, .45, -.32, .32, 0, .07, concrete)
scene.box(-.14, .14, -.14, .14, .07, .10, steel)
for x in (-.10, .10):
    for y in (-.10, .10):
        scene.disc(x, y, .107, .022, "#b1ab94")
scene.box(-.038, .038, -.038, .038, .1, 3.55, steel)
scene.line([(.025, .03, 3.15), (.025, .03, 1.01), (.21, .075, 1.01)], "#3e4940", 3)
scene.box(.08, .45, .03, .25, .84, 1.20, ("#818875", "#53604e", "#424c41"))
scene.disc(.29, .253, 1.04, .09, "#c8c2a2", normal="y")
scene.line([(.29, .256, 1.04), (.32, .256, 1.09)], "#514b3e", 2)

# Флюгер на отдельной оси под чашечным ротором.
scene.disc(0, 0, 2.80, .074, "#848879")
scene.line([(-.34, .06, 2.86), (0, 0, 2.86), (.43, -.08, 2.86)], "#515d51", 10)
scene.polygon([(-.48, .085, 2.86), (-.27, .13, 2.86), (-.30, -.015, 2.86)],
              "#c4ba91")
scene.polygon([(.24, -.045, 2.86), (.49, -.09, 2.86), (.47, -.09, 3.08),
               (.29, -.054, 3.03)], "#a3a38a")

for angle in (-pi / 2, pi / 6, 5 * pi / 6):
    ux, uy = cos(angle), sin(angle)
    x, y = .45 * ux, .45 * uy
    scene.line([(0, 0, 3.57), (x, y, 3.57)], "#657164", 12)
    # У всех чашек отверстие обращено по касательной в одном направлении.
    rim = []
    for index in range(16):
        theta = index * pi / 8
        rim.append((x + .085 * ux * cos(theta), y + .085 * uy * cos(theta),
                    3.57 + .085 * sin(theta)))
    back = (x + .07 * uy, y - .07 * ux, 3.57)
    for index, point in enumerate(rim):
        scene.polygon([back, point, rim[index - 1]], "#939783", stroke=0)
    if ux > 0:
        scene.polygon(rim, "#555f54", outline="#b0ad96")
scene.disc(0, 0, 3.61, .075, "#a4a390")
scene.mark("ground", (0, 0, 0))
scene.mark("rotor_pivot", (0, 0, 3.57))
scene.mark("vane_pivot", (0, 0, 2.86))
scene.mark("dial", (.29, .253, 1.04))
scene.save("E0_weather_vector", "Чашечный датчик, флюгер и приборный ящик метеостанции E0")

island = Image.open("E0_ALL14_current_TEST_ONLY.png").convert("RGBA")
terrain = Image.open("b03-production/art/gen/environment/start_island_hd.png").convert("RGBA")
site = (1048, 262, 1072, 285)
island.paste(terrain.crop(site), site[:2])
bounds = scene.image.getchannel("A").getbbox()
sprite = scene.image.crop(bounds)
if args.processed:
    processed = Image.open(args.processed).convert("RGBA")
    processed = processed.crop(processed.getchannel("A").getbbox())
    assert processed.size == sprite.size
    assert processed.getchannel("A").tobytes() == sprite.getchannel("A").tobytes()
    sprite = processed
ratio = 44 / (6 * scene.scale)
sprite = sprite.resize(tuple(round(size * ratio) for size in sprite.size), Image.Resampling.BOX)
mask = sprite.getchannel("A").point(lambda alpha: 255 if alpha >= 32 else 0)
sprite.putalpha(mask)
opaque = {(x, y) for y in range(sprite.height) for x in range(sprite.width) if mask.getpixel((x, y))}
connected = {next(iter(opaque))}
while True:
    adjacent = {(x + dx, y + dy) for x, y in connected for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}
    added = (opaque & adjacent) - connected
    if not added:
        break
    connected.update(added)
assert connected == opaque, "Датчики должны оставаться соединёнными с мачтой"
export = args.processed.with_name("e0_1978.runtime_candidate.png") if args.processed else Path("E0_weather_grid_TEST_ONLY.png")
sprite.save(export)
island.alpha_composite(sprite, (1060 - round((scene.origin[0] - bounds[0]) * ratio),
                               278 - round((scene.origin[1] - bounds[1]) * ratio)))
crop = island.crop((1028, 251, 1092, 302))
suffix = "_processed" if args.processed else ""
crop.resize((448, 357), Image.Resampling.NEAREST).save(f"E0_weather_vector{suffix}_scene_TEST_ONLY.png")
