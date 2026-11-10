"""Проба открытого шлагбаума у восточного въезда на стартовую площадку."""

from math import cos, hypot, radians, sin

from PIL import Image

from E0_rigid_scene import RigidScene


scale = 96
pixels_per_meter = 47 / 6.5
surface = ("#8e8c7e", "#67675d", "#575a54")
metal = ("#677272", "#465254", "#374547")
warning = ("#e4c07a", "#c79851", "#a47a41")
pedestal = RigidScene(width=180, height=340, scale=scale, origin=(90, 282), taper=0.045)
pedestal.box(-0.36, 0.36, -0.30, 0.30, 0, 0.08, surface)
pedestal.box(-0.14, 0.14, -0.13, 0.13, 0.08, 1.04, metal)
# Ось вдоль дороги. Стопор держит стрелу за вертикалью, над обочиной.
angle = radians(18)
pivot_y, pivot_z = 0.13, 1.01


def boom_point(x, side, distance):
    return (x, pivot_y + side * cos(angle) - distance * sin(angle),
            pivot_z + side * sin(angle) + distance * cos(angle))

for index in reversed(range(8)):
    lo, hi = index * 4.37 / 8, (index + 1) * 4.37 / 8
    palette = warning if index % 2 == 0 else metal
    pedestal.polygon([boom_point(x, 0.065, d) for x, d in
                      ((-.10, lo), (.10, lo), (.10, hi), (-.10, hi))], palette[0], stroke=0)
    pedestal.polygon([boom_point(.10, side, d) for side, d in
                      ((-.065, lo), (.065, lo), (.065, hi), (-.065, hi))], palette[2], stroke=0)
pedestal.box(-0.17, 0.17, 0.04, 0.22, 0.84, 1.11, metal)
pedestal.disc(0.175, pivot_y, pivot_z, 0.10, "#c9b58a", normal="x")
pedestal.mark("ground", (0, 0, 0))
pedestal.mark("hinge", (0.175, pivot_y, pivot_z))
pedestal.mark("boom_tip", boom_point(0, 0, 4.37))
tip = boom_point(0, 0, 4.37)
assert abs(hypot(tip[1] - pivot_y, tip[2] - pivot_z) - 4.37) < 1e-9
assert tip[1] < pivot_y
assert abs(pivot_y + 4.37 - 31 / (pixels_per_meter * sin(pedestal.angle))) < 0.05
pedestal.save("E0_pad_gate_pedestal", "Поднятая стрела у въезда на площадку E0")

receiver = RigidScene(width=180, height=160, scale=scale, origin=(90, 100), taper=0.045)
receiver.box(-0.28, 0.28, -0.24, 0.24, 0, 0.06, surface)
receiver.box(-0.08, 0.08, -0.08, 0.08, 0.06, 0.94, metal)
receiver.box(-0.16, 0.16, -0.10, 0.10, 0.84, 0.94, warning)
receiver.box(-0.16, -0.10, -0.10, 0.10, 0.94, 1.04, warning)
receiver.box(0.10, 0.16, -0.10, 0.10, 0.94, 1.04, warning)
receiver.mark("ground", (0, 0, 0))
receiver.mark("boom_rest", (0, 0, 0.94))
receiver.save("E0_pad_gate_receiver", "Опора конца стрелы на противоположной обочине")

scene = Image.open("E0_ALL14_current_TEST_ONLY.png").convert("RGBA")
for part, (x, y) in ((pedestal, (580, 376)), (receiver, (580, 407))):
    bounds = part.image.getchannel("A").getbbox()
    sprite = part.image.crop(bounds)
    ratio = pixels_per_meter / scale
    sprite = sprite.resize(tuple(round(v * ratio) for v in sprite.size), Image.Resampling.NEAREST)
    ground_x, ground_y = part.origin
    scene.alpha_composite(sprite, (round(x - (ground_x - bounds[0]) * ratio),
                                   round(y - (ground_y - bounds[1]) * ratio)))
scene.crop((543, 342, 625, 436)).resize((492, 564), Image.Resampling.NEAREST).save(
    "E0_pad_gate_scene_TEST_ONLY.png"
)
