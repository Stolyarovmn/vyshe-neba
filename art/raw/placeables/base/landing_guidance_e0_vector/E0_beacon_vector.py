"""Маяк E0 с оптической головкой, ручным шарниром и красной лампой."""

import argparse
import json
from pathlib import Path

from PIL import Image

from E0_rigid_scene import RigidScene

parser = argparse.ArgumentParser()
parser.add_argument("--processed", type=Path)
args = parser.parse_args()


scene = RigidScene(width=180, height=210, scale=150, origin=(78, 153), taper=.045)
steel = ("#95978b", "#616b61", "#48564d")
base = ("#938c78", "#6a6658", "#555749")
scene.box(-.27, .27, -.24, .24, 0, .055, base)
for x, y in ((0, -.17), (-.18, .14), (.18, .14)):
    scene.line([(0, 0, .34), (x, y, .062)], "#737d6f", 12)
    scene.disc(x, y, .067, .035, "#a5a28b")
scene.box(-.035, .035, -.035, .035, .06, 1.78, steel)
scene.box(-.09, .09, -.075, .075, 1.63, 1.72, steel)
# Прицел обращён к оси посадки. Правый маяк зеркален левому.
scene.box(-.09, .22, -.091, .091, 1.73, 1.91, steel)
scene.disc(.221, 0, 1.82, .069, "#2e4545", normal="x")
scene.disc(.226, 0, 1.82, .040, "#a9c3b9", normal="x")
scene.line([(-.065, .078, 1.69), (-.18, .14, 1.63)], "#545c50", 10)
scene.disc(-.18, .14, 1.64, .035, "#b4a483")
scene.box(-.075, .075, -.075, .075, 1.91, 1.98, steel)
scene.disc(0, 0, 1.99, .101, "#762f2a")
scene.disc(0, 0, 2.02, .092, "#d34c3d")
scene.mark("ground", (0, 0, 0))
scene.mark("lamp", (0, 0, 2.02))
scene.mark("tilt_pivot", (-.065, .078, 1.69))
scene.save("E0_beacon_vector", "Парный посадочный маяк E0 с ручной оптикой и физической лампой")

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
ratio = 47 / (6.5 * scene.scale)
size = tuple(round(dimension * ratio) for dimension in sprite.size)
sprite = sprite.resize(size, Image.Resampling.BOX)
sprite.putalpha(sprite.getchannel("A").point(lambda alpha: 255 if alpha >= 32 else 0))
lamp = tuple((coordinate - offset) / length for coordinate, offset, length in
             zip(scene.project(0, 0, 2.02), bounds[:2], (bounds[2]-bounds[0], bounds[3]-bounds[1])))
lx, ly = (int(coordinate * length) for coordinate, length in zip(lamp, size))
pixel = sprite.getpixel((lx, ly))
assert pixel[3] == 255 and pixel[0] > pixel[1] * 1.5, pixel
mirrored = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
assert mirrored.getpixel((size[0] - 1 - lx, ly)) == pixel
far = scene.project(.27, -.24, 0)[0] - scene.project(-.27, -.24, 0)[0]
near = scene.project(.27, .24, 0)[0] - scene.project(-.27, .24, 0)[0]
assert .95 < far / near < .99
registration = {
    "island_size": size, "lamp": lamp, "lamp_pixel": [lx, ly], "rgba": pixel,
    "ground_edge_ratio": far / near,
}
registration_path = Path("E0_beacon_registration.json")
if args.processed:
    sprite.save(args.processed.with_name("e0_1978.runtime_candidate.png"))
    registration["alpha_crop_bbox"] = [left, top, left + bounds[2] - bounds[0], top + bounds[3] - bounds[1]]
    registration_path = args.processed.with_name("registration.json")
registration_path.write_text(json.dumps(registration, indent=2) + "\n", encoding="utf-8")

island = Image.open("E0_ALL14_current_TEST_ONLY.png").convert("RGBA")
terrain = Image.open("b03-production/art/gen/environment/start_island_hd.png").convert("RGBA")
for x, mirrored in ((284, False), (492, True)):
    area = (x - 5, 386, x + 5, 400)
    island.paste(terrain.crop(area), area[:2])
    facing = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if mirrored else sprite
    island.alpha_composite(facing, (x - (size[0] + 1) // 2, 396 - size[1]))
suffix = "_processed" if args.processed else ""
island.crop((270, 375, 506, 417)).resize((944, 168), Image.Resampling.NEAREST).save(
    f"E0_beacon_vector{suffix}_scene_TEST_ONLY.png"
)
