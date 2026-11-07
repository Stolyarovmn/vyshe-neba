"""Проверка проекции лавки и стенда контрактов E0."""

import argparse
from pathlib import Path

from PIL import Image

from E0_rigid_scene import RigidScene

parser = argparse.ArgumentParser()
parser.add_argument("--processed", action="store_true")
args = parser.parse_args()


wood = ("#a2825d", "#765438", "#523d2d")
steel = ("#929688", "#6b7568", "#47544c")
stone = ("#a29c8a", "#777464", "#5b5a50")
canvas = ("#c3b69a", "#a3967c", "#857863")
shop = RigidScene(width=470, height=380, scale=95, origin=(235, 215), taper=.025)
shop.box(-2.0, 2.0, -.95, .95, 0, .09, stone)
shop.box(-1.79, 1.79, .29, .74, .09, 1.04, wood)
for x in (-1.72, 1.72):
    shop.box(x - .055, x + .055, -.70, -.58, .09, 2.51, steel)
    shop.box(x - .055, x + .055, .24, .36, .09, 2.16, steel)
shop.box(-1.74, 1.74, -.70, -.53, .09, 1.64, wood)
shop.box(-1.61, 1.61, -.53, -.19, 1.35, 1.43, wood)
for x, height, colors in (
    (-1.25, .24, ("#9a5940", "#784731", "#624633")),
    (-.64, .30, ("#9b8d52", "#6f663c", "#554e35")),
    (.70, .23, ("#9d9f91", "#69776a", "#536159")),
):
    shop.box(x - .14, x + .14, -.46, -.23, 1.43, 1.43 + height, colors)
shop.box(-1.88, 1.88, .23, .80, 1.04, 1.12, wood)
# Навес закрывает полку и оставляет переднюю часть прилавка открытой.
shop.polygon([(-1.96, -.82, 2.51), (1.96, -.82, 2.51),
              (1.96, .36, 2.16), (-1.96, .36, 2.16)], canvas[0])
for x in (-1.94, -.96, .02, 1.0):
    shop.polygon([(x, -.82, 2.515), (x + .48, -.82, 2.515),
                  (x + .48, .36, 2.165), (x, .36, 2.165)], "#9c5140", stroke=0)
# Канистра на свободном краю прилавка обозначает выдачу расходников.
shop.box(.92, 1.19, .53, .73, 1.12, 1.45, ("#a6a079", "#706b49", "#53553d"))
shop.line([(.96, .59, 1.45), (.96, .59, 1.50), (1.13, .59, 1.50), (1.13, .59, 1.45)],
          "#4e5039", 4)
shop.mark("counter", (0, .8, 1.12))
shop.mark("ground", (0, .95, 0))
shop.save("E0_shop_vector", "Лавка расходников E0 с навесом и прилавком")

board = RigidScene(width=260, height=170, scale=95, origin=(130, 114), taper=.045)
board.box(-.89, .89, -.34, .34, 0, .06, stone)
for x in (-.71, .71):
    board.box(x - .04, x + .04, -.13, .04, .06, 1.62, wood)
# Верх отнесён от оператора, чтобы бумага была доступна с южного подхода.
board.polygon([(-.78, .15, .89), (.78, .15, .89),
               (.78, -.24, 1.61), (-.78, -.24, 1.61)], "#806145")
for x, color in ((-.62, "#d8c8a1"), (-.18, "#b9c5b9"), (.25, "#ddd1af")):
    board.polygon([(x, .09, 1.00), (x + .30, .09, 1.00),
                   (x + .30, -.16, 1.46), (x, -.16, 1.46)], color, stroke=0)
board.mark("ground", (0, .34, 0))
board.save("E0_contract_board_vector", "Наклонный стенд бумажных контрактов E0")

island = Image.open("E0_ALL14_current_TEST_ONLY.png").convert("RGBA")
panels = Image.new("RGBA", (640, 240), "#222830")
entries = (("shop", shop, 542, 369, .95), ("contract_board", board, 225, 360, .34))
for index, (key, part, x, y, depth) in enumerate(entries):
    bounds = part.image.getchannel("A").getbbox()
    sprite = part.image.crop(bounds)
    if args.processed:
        directory = Path(f"E0_entry_{key}_processed")
        candidate = Image.open(directory / "e0_1978.png").convert("RGBA")
        left, top, right, bottom = candidate.getchannel("A").getbbox()
        assert right - left in (sprite.width, sprite.width + 1)
        assert bottom - top in (sprite.height, sprite.height + 1)
        aligned = candidate.crop((left, top, left + sprite.width, top + sprite.height))
        assert aligned.getchannel("A").tobytes() == sprite.getchannel("A").tobytes()
        sprite = aligned
    ratio = 44 / (6 * part.scale)
    sprite = sprite.resize(tuple(round(n * ratio) for n in sprite.size), Image.Resampling.BOX)
    sprite.putalpha(sprite.getchannel("A").point(lambda alpha: 255 if alpha >= 48 else 0))
    if args.processed:
        sprite.save(directory / "e0_1978.runtime_candidate.png")
    gx, gy = part.project(0, depth, 0)
    island.alpha_composite(sprite, (x - round((gx - bounds[0]) * ratio),
                                   y - round((gy - bounds[1]) * ratio)))
    crop = island.crop((x - 40, y - 42, x + 40, y + 18))
    panels.alpha_composite(crop.resize((320, 240), Image.Resampling.NEAREST), (index * 320, 0))
    print("Размер на острове", sprite.size)
for part, half_width, half_depth in ((shop, 2.0, .95), (board, .89, .34)):
    far = part.project(half_width, -half_depth, 0)[0] - part.project(-half_width, -half_depth, 0)[0]
    near = part.project(half_width, half_depth, 0)[0] - part.project(-half_width, half_depth, 0)[0]
    assert .94 < far / near < .99
    print("Отношение кромок основания", round(far / near, 4))
suffix = "_processed" if args.processed else ""
panels.save(f"E0_entry_vector{suffix}_scene_TEST_ONLY.png")
