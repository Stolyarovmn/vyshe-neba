"""Карта высот острова из start-island.png: море 0, пляж низко, плато с обрывом к морю, скалы и горы выше,
грунтовые поляны и бетон площадки ровные. Пишет height.png (16 бит) и маски для проверки. argv: island.png outdir"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

src = Path(sys.argv[1]); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx = a.max(-1); mn = a.min(-1)
sat = (mx - mn) / np.maximum(mx, 1)
lum = a @ np.array([0.299, 0.587, 0.114])

black = mx < 12
water = ((b > r + 18) & (b >= g - 8)) | black          # море, пена у берега светлая, её добавим ниже
foam = (lum > 200) & (sat < 0.18)                       # белая пена/прибой
sand = (r > 150) & (g > 120) & (b < 150) & (r > b + 40) & (sat > 0.2)
rock = (sat < 0.22) & (lum > 45) & (lum < 190) & ~water
grass = (g > r - 5) & (g > b + 5) & ~water
land = ~water & ~foam

def blur(m, rad):
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255

# очистить маску суши от мелочи: открытие/закрытие
L = Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(7))
land = np.asarray(L) > 127
# море — только вода, связанная с краем кадра; синие тени в лесу остаются сушей
from PIL import ImageDraw
W8 = Image.fromarray(np.where(land, 255, 0).astype(np.uint8))
for seed in [(0, 0), (W8.width - 1, 0), (0, W8.height - 1), (W8.width - 1, W8.height - 1)]:
    ImageDraw.floodfill(W8, seed, 128)
land = np.asarray(W8) != 128
# бетон стартовой площадки ровный: скалы там не считаем
yy, xx = np.mgrid[0:land.shape[0], 0:land.shape[1]]
pad_zone = (xx > 130) & (xx < 720) & (yy > 230) & (yy < 520)
rock &= ~pad_zone

# плато: «расстояние до моря» через несколько размытий; обрыв крутой на первых ~20 px
d = blur(land.astype(np.float32), 10)
plateau = np.clip((d - 0.55) / 0.35, 0, 1) ** 0.7       # 0 у кромки, 1 на плато
# пляж низко: где песок у воды, плато меньше
sandy = blur(sand.astype(np.float32), 4)
plateau *= 1 - 0.75 * np.clip(sandy * 1.5, 0, 1) * (1 - np.clip((d - 0.8) / 0.2, 0, 1))
# скалы: доп. высота, сглаженная; на севере горы
rocky = blur((rock & land).astype(np.float32), 6)
H = 34 * plateau + 26 * np.clip(rocky * 1.3, 0, 1) * plateau
hm = float(H.max()) or 1.0
H = blur(H / hm, 2) * hm
H[~land] = 0
np.save(out / 'height.npy', H.astype(np.float32))
Image.fromarray((np.clip(H / H.max(), 0, 1) * 255).astype(np.uint8)).save(out / 'height_preview.png')
Image.fromarray((land * 255).astype(np.uint8)).save(out / 'land.png')
print('H max', float(H.max()), 'shape', H.shape)
