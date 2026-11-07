"""Схема массы объекта E0 в проекции island_top_3_4 (TEST_ONLY, не источник стиля).

Проекция (см. art/docs/E0_CLAUDE_PROMPT_STYLE.md):
    sx = cx + k * X * f(Y)          f — линейно от 1 (ближний край) до FAR (дальний край)
    sy = cy + k * (Y * sin(e) - Z * cos(e))
e = 73.44 градуса над горизонтом: земля сжата в sin(e) = 0.9585, высота проецируется с cos(e) = 0.285.
Y растёт к зрителю (вниз по экрану). Единицы — метры; k — пикселей на метр.

Запуск:  python e0_massing.py control  <out.png>  [out.json]
Скрипт рисует плоскую заливку: верх светлее фронта, цвета частей — только для опознавания частей генератором.
"""
import json
import math
import sys

from PIL import Image, ImageDraw

E = math.radians(73.44)
S, C = math.sin(E), math.cos(E)
FAR = 0.955


class Scene:
    def __init__(self, depth_total, k=110, size=(1536, 1024), center=(768, 560)):
        self.k = k
        self.size = size
        self.cx, self.cy = center
        self.D = depth_total  # полная глубина основания, м (для коэффициента трапеции)
        self.items = []
        self.base = []

    def f(self, y):
        t = (y + self.D / 2) / self.D  # 0 — дальний край, 1 — ближний
        return FAR + (1 - FAR) * max(0.0, min(1.0, t))

    def p(self, x, y, z):
        return (self.cx + self.k * x * self.f(y), self.cy + self.k * (y * S - z * C))

    def quad(self, pts, color, order):
        self.items.append((order, [self.p(*q) for q in pts], color))

    def box(self, x0, x1, y0, y1, z0, z1, top, front, order=None):
        """Верхняя и фронтальная грани коробки (боковые при камере сверху не видны)."""
        o = (y1 if order is None else order, z1)
        self.quad([(x0, y1, z1), (x1, y1, z1), (x1, y0, z1), (x0, y0, z1)], top, o)
        self.quad([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], front, (o[0] + 0.001, z1))

    def front_decal(self, x0, x1, y, z0, z1, color, order):
        self.quad([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], color, (order, 99))

    def render(self, path):
        im = Image.new('RGB', self.size, (126, 126, 130))
        d = ImageDraw.Draw(im)
        for _, pts, color in sorted(self.items, key=lambda i: i[0]):
            d.polygon(pts, fill=color, outline=(60, 60, 66))
        im.save(path)


def control(path, jpath=None):
    """BI-CONTROL E0: низкое здание центра управления, дверь, окно, жалюзи, кабельный ввод, лампа над дверью."""
    W, Dp = 6.0, 4.2          # здание, м
    ap_d = 1.6                # бетонная площадка перед дверью
    Dt = Dp + ap_d + 0.4
    sc = Scene(Dt)
    yf, yb = Dp / 2, -Dp / 2  # передняя/задняя стена
    # бетонная площадка (проход оператора) и цоколь
    sc.box(-W / 2 - 0.4, W / 2 + 0.4, yb - 0.2, yf + ap_d, 0, 0.08, (178, 176, 168), (150, 148, 140), order=-5)
    sc.box(-W / 2 - 0.1, W / 2 + 0.1, yb - 0.1, yf + 0.1, 0.08, 0.30, (168, 166, 158), (140, 138, 132), order=-4)
    # стены
    sc.box(-W / 2, W / 2, yb, yf, 0.30, 2.95, (206, 206, 196), (150, 158, 138), order=-3)
    # односкатная кровля: задняя кромка выше передней на 0.5 м, свес 0.3 м
    ov = 0.3
    sc.quad([(-W / 2 - ov, yf + ov, 3.00), (W / 2 + ov, yf + ov, 3.00), (W / 2 + ov, yb - ov, 3.50), (-W / 2 - ov, yb - ov, 3.50)], (222, 222, 214), (yf + 1, 3.0))
    sc.quad([(-W / 2 - ov, yf + ov, 2.92), (W / 2 + ov, yf + ov, 2.92), (W / 2 + ov, yf + ov, 3.00), (-W / 2 - ov, yf + ov, 3.00)], (120, 118, 112), (yf + 1.001, 3.0))
    # вытяжная труба на крыше (дальний левый угол)
    sc.box(-1.9, -1.4, -1.7, -1.2, 3.30, 4.0, (196, 196, 190), (140, 140, 134), order=-1.2)
    # фронтальная стена: дверь, окно, жалюзи
    sc.front_decal(1.0, 1.9, yf + 0.01, 0.30, 2.30, (100, 80, 60), yf)           # дверь 0.9 x 2.0
    sc.front_decal(-0.6, 0.4, yf + 0.01, 1.2, 2.0, (70, 90, 110), yf)             # окно с решёткой
    sc.front_decal(-2.4, -1.1, yf + 0.01, 1.8, 2.5, (96, 96, 96), yf)             # жалюзи
    # лампа над дверью (защитная сетка)
    sc.box(1.25, 1.65, yf, yf + 0.3, 2.45, 2.75, (240, 190, 90), (210, 160, 70), order=yf + 0.3)
    # кабельный ввод справа от двери: соединительная коробка и вертикальный короб от грунта
    sc.box(2.15, 2.65, yf, yf + 0.18, 1.10, 1.70, (214, 190, 80), (180, 160, 64), order=yf + 0.18)
    sc.box(2.32, 2.48, yf, yf + 0.10, 0.30, 1.10, (190, 170, 70), (160, 144, 60), order=yf + 0.1)
    sc.render(path)
    if jpath:
        corners = {
            'apron_far_left': sc.p(-W / 2 - 0.4, yb - 0.2, 0.08), 'apron_far_right': sc.p(W / 2 + 0.4, yb - 0.2, 0.08),
            'apron_near_left': sc.p(-W / 2 - 0.4, yf + ap_d, 0.08), 'apron_near_right': sc.p(W / 2 + 0.4, yf + ap_d, 0.08),
            'wall_base_far_left': sc.p(-W / 2, yb, 0.30), 'wall_base_far_right': sc.p(W / 2, yb, 0.30),
            'wall_base_near_left': sc.p(-W / 2, yf, 0.30), 'wall_base_near_right': sc.p(W / 2, yf, 0.30),
        }
        far = corners['apron_far_right'][0] - corners['apron_far_left'][0]
        near = corners['apron_near_right'][0] - corners['apron_near_left'][0]
        depth = corners['apron_near_left'][1] - corners['apron_far_left'][1]
        meta = {'projection': 'island_top_3_4 proxy 73.44deg', 'k_px_per_m': sc.k, 'corners_px': corners,
                'far_over_near': far / near, 'depth_over_width': depth / ((far + near) / 2),
                'expected_depth_over_width': ((Dp + 0.2 + ap_d) * S) / (((W + 0.8) * (1 + FAR)) / 2)}
        json.dump(meta, open(jpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    kind, out = sys.argv[1], sys.argv[2]
    {'control': control}[kind](out, sys.argv[3] if len(sys.argv) > 3 else None)
