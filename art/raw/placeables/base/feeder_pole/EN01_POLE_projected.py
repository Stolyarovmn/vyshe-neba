import json
import argparse
from hashlib import sha256
from math import cos, hypot, radians, sin
from pathlib import Path

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("--feeder", action="store_true")
parser.add_argument("--processed", type=Path)
args = parser.parse_args()
if args.processed and not args.feeder:
    parser.error("--processed requires --feeder")
anchors = [(1514, 378), (1434, 378)] if args.feeder else [(1225, 313), (1272, 326)]
variant = "feeder" if args.feeder else "crossing"
angle = radians(73.44)
span = (anchors[1][0] - anchors[0][0], (anchors[1][1] - anchors[0][1]) / sin(angle))
length = hypot(*span)
normal = (-span[1] / length, span[0] / length)
scale = 72
image = Image.new("RGBA", (320, 360))
draw = ImageDraw.Draw(image)


def project(x, y, z):
    perspective = 1 + y * 0.045
    return (160 + scale * x * perspective,
            270 + scale * (y * sin(angle) - z * cos(angle)) * perspective)


base = [(-0.55, -0.55), (0.55, -0.55), (0.55, 0.55), (-0.55, 0.55)]
top = [project(x, y, 0.08) for x, y in base]
draw.polygon([top[3], top[2], project(*base[2], 0), project(*base[3], 0)], fill="#545a58")
draw.polygon(top, fill="#96958a", outline="#686c65")
draw.line([top[3], top[0], top[1]], fill="#b9b5a4", width=2)
draw.line([project(0, 0, 0.08), project(0, 0, 8.5)], fill="#70513b", width=21)
draw.line([project(-0.06, 0, 0.08), project(-0.06, 0, 8.5)], fill="#ab7e53", width=6)
draw.line([project(0.09, 0, 0.15), project(0.09, 0, 8.25)], fill="#514237", width=4)
cx, cy = project(0, 0, 8.5)
draw.ellipse((cx-10, cy-9, cx+10, cy+9), fill="#a9aeaa", outline="#606764")
terminals = [project(normal[0] * offset, normal[1] * offset, 7.7)
             for offset in (-0.43, 0, 0.43)]
draw.line(terminals, fill="#94704d", width=9)
draw.line([(x - 2, y - 1) for x, y in terminals], fill="#b58b5e", width=2)
bx, by = project(0.16, 0.16, 3.7)
draw.line([(bx, by), project(0.16, 0.16, 0.1)], fill="#657779", width=4)
for index, (x, y) in enumerate(terminals):
    draw.line([(x, y), (x + 3, y + 12), (bx - 5 + 5 * index, by)], fill="#343c42", width=3)
    draw.ellipse((x-4, y-4, x+4, y+4), fill="#d1cbbb", outline="#707771")
    draw.point((round(x), round(y)), fill="#474d4b")
draw.rectangle((bx-8, by, bx+8, by+12), fill="#77898b", outline="#3f5358")
for dx in (-5, 5):
    for dy in (3, 9):
        draw.point((round(bx + dx), round(by + dy)), fill="#c0bdb1")
visible = image.getchannel("A").getbbox()
candidate = Path(f"EN01_POLE_{variant}_candidate.png")
image.crop(visible).save(candidate)
registration = {
    "status": "candidate",
    "sprite": candidate.name,
    "sha256": sha256(candidate.read_bytes()).hexdigest(),
    "pixels_per_meter": scale,
    "pole_centers": anchors,
    "ground_anchor": [160 - visible[0], 270 - visible[1]],
    "wire_anchors": [[round(x - visible[0], 2), round(y - visible[1], 2)]
                     for x, y in terminals],
}
candidate.with_suffix(".json").write_text(json.dumps(registration, indent=2) + "\n", encoding="utf-8")
print("Foundation corners:", [tuple(map(round, point)) for point in top])
print("Projected terminals:", [tuple(map(round, point)) for point in terminals])

island = Image.open("b03-production/art/gen/environment/start_island_hd.png").convert("RGBA")
ratio = (47 / 6.5) / scale
origin = registration["ground_anchor"]
exported = Image.open(candidate).convert("RGBA")
for point in registration["wire_anchors"]:
    assert exported.getpixel(tuple(map(round, point)))[3] == 255, point
if args.processed:
    processed = Image.open(args.processed).convert("RGBA")
    left, top, right, bottom = processed.getchannel("A").getbbox()
    assert (right - left, bottom - top) == (exported.width + 1, exported.height + 1)
    aligned = processed.crop((left, top, left + exported.width, top + exported.height))
    assert aligned.getchannel("A").tobytes() == exported.getchannel("A").tobytes()
    exported = aligned
    exported.save(args.processed.with_name("e0_1978.runtime_candidate.png"))
    for point in registration["wire_anchors"]:
        assert exported.getpixel(tuple(map(round, point)))[3] == 255, point
runtime_size = (round(exported.width * ratio), round(exported.height * ratio))
sprite = exported.resize(runtime_size, Image.Resampling.NEAREST)
ratio_x = sprite.width / exported.width
ratio_y = sprite.height / exported.height
if args.feeder:
    for tx, ty in registration["wire_anchors"]:
        assert sprite.getpixel((int(tx * ratio_x), int(ty * ratio_y)))[3] == 255
    assert set(sprite.getchannel("A").tobytes()) == {0, 255}
    if not args.processed:
        sprite.save("EN01_POLE_feeder_grid_TEST_ONLY.png")

placements = [(round(x - origin[0] * ratio_x), round(y - origin[1] * ratio_y))
              for x, y in anchors]
scene_draw = ImageDraw.Draw(island)
for tx, ty in registration["wire_anchors"]:
    a, b = [(x + tx * ratio_x, y + ty * ratio_y) for x, y in placements]
    # For this short span the maximum visible sag is one island pixel.
    points = [
        (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 4 * t * (1 - t))
        for t in (i / 16 for i in range(17))
    ]
    scene_draw.line(points, fill="#514942")
for position in placements:
    island.alpha_composite(sprite, position)
bounds = (1415, 342, 1540, 402) if args.feeder else (1195, 245, 1305, 369)
suffix = "_processed" if args.processed else ""
island.crop(bounds).save(f"EN01_POLE_projected_{variant}{suffix}_TEST_ONLY.png")
