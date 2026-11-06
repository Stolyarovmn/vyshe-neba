import argparse
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument("sprite")
parser.add_argument("--preview", required=True)
args = parser.parse_args()

with Image.open(args.sprite) as source:
    sprite = source.convert("RGBA")
alpha = sprite.getchannel("A")
histogram = alpha.histogram()
mask = alpha.point(lambda value: 255 if value >= 128 else 0)
interior = mask.filter(ImageFilter.MinFilter(7))
samples = alpha.histogram(mask=interior)
total = sum(samples)
print(f"Пиксели внутри силуэта: {total}")
if total:
    print(f"Альфа 250–255 внутри силуэта: {sum(samples[250:]) / total:.2%}")
print(f"Промежуточная альфа по всему PNG: {sum(histogram[1:255])}")
sprite.thumbnail((500, 400), Image.Resampling.LANCZOS)
width, height = sprite.size
preview = Image.new("RGB", (2 * width, height), "white")
preview.paste("#206db5", (width, 0, 2 * width, height))
for x in (0, width):
    preview.paste(sprite, (x, 0), sprite)
preview.save(args.preview)
