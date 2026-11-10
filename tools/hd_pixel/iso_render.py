"""Blender: рельеф острова из height.npy, текстура — start-island.png, ортокамера с углом места ELEV.
Рендер base_iso_raw.png и проекция якорей построек/стола в layout_proj.json.
Запуск: blender -b -P iso_render.py -- island.png height.npy anchors.json outdir ELEV"""
import bpy, json, math, sys
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
island_png, height_npy, anchors_json, outdir = argv[:4]
ELEV = float(argv[4]) if len(argv) > 4 else 35.0
STEP = 2
MARGIN = 40

bpy.ops.wm.read_factory_settings(use_empty=True)
H = np.load(height_npy)
h, w = H.shape

# сетка
nx, ny = w // STEP + 1, h // STEP + 1
xs = np.minimum(np.arange(nx) * STEP, w - 1)
ys = np.minimum(np.arange(ny) * STEP, h - 1)
X, Y = np.meshgrid(xs, ys)
Z = H[Y, X]
verts = np.stack([X.ravel(), -Y.ravel(), Z.ravel()], 1).astype(np.float32)
quads = []
for j in range(ny - 1):
    base = j * nx
    for i in range(nx - 1):
        a = base + i
        quads.append((a, a + 1, a + nx + 1, a + nx))
mesh = bpy.data.meshes.new('island')
mesh.from_pydata(verts.tolist(), [], quads)
uv = mesh.uv_layers.new()
uvs = np.stack([X.ravel() / (w - 1), 1 - Y.ravel() / (h - 1)], 1)
loop_uv = np.empty((len(mesh.loops), 2), np.float32)
vi = np.empty(len(mesh.loops), np.int32)
mesh.loops.foreach_get('vertex_index', vi)
loop_uv[:] = uvs[vi]
uv.data.foreach_set('uv', loop_uv.ravel())
mesh.update()
obj = bpy.data.objects.new('island', mesh)
bpy.context.scene.collection.objects.link(obj)
for p in mesh.polygons:
    p.use_smooth = True

# материал: картинка как свечение + немного освещения для рельефа
mat = bpy.data.materials.new('island')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(island_png)
tex.interpolation = 'Closest'
emit = nt.nodes.new('ShaderNodeEmission')
diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
mix = nt.nodes.new('ShaderNodeMixShader')
mix.inputs[0].default_value = 0.28
out = nt.nodes.new('ShaderNodeOutputMaterial')
# чёрное поле за краем острова -> прозрачность (под ним игра рисует своё море)
transp = nt.nodes.new('ShaderNodeBsdfTransparent')
mix2 = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(tex.outputs['Alpha'], mix2.inputs[0])
nt.links.new(transp.outputs[0], mix2.inputs[1])
nt.links.new(mix.outputs[0], mix2.inputs[2])
if hasattr(mat, 'surface_render_method'):
    mat.surface_render_method = 'BLENDED'
nt.links.new(tex.outputs['Color'], emit.inputs['Color'])
nt.links.new(tex.outputs['Color'], diff.inputs['Color'])
nt.links.new(emit.outputs[0], mix.inputs[1])
nt.links.new(diff.outputs[0], mix.inputs[2])
nt.links.new(mix2.outputs[0], out.inputs['Surface'])
obj.data.materials.append(mat)

sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 3.0
so = bpy.data.objects.new('sun', sun)
so.rotation_euler = (math.radians(40), math.radians(-25), math.radians(-35))
bpy.context.scene.collection.objects.link(so)

# камера
e = math.radians(ELEV)
cam = bpy.data.cameras.new('cam')
cam.type = 'ORTHO'
co = bpy.data.objects.new('cam', cam)
bpy.context.scene.collection.objects.link(co)
bpy.context.scene.camera = co
co.rotation_euler = (math.pi / 2 - e, 0, 0)
d = Vector((0, math.cos(e), -math.sin(e)))
center = Vector((w / 2, -h / 2, H.max() / 2))
co.location = center - d * 4000
cam.clip_end = 10000
resx = w + 2 * MARGIN
resy = int(math.ceil(h * math.sin(e) + H.max() * math.cos(e))) + 2 * MARGIN
cam.ortho_scale = max(resx, resy)
scene = bpy.context.scene
scene.render.resolution_x = resx
scene.render.resolution_y = resy
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items} else 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = outdir + '/base_iso_raw.png'
# сдвиг кадра: центр острова по вертикали в центре кадра
bpy.ops.render.render(write_still=True)

# проекция якорей
src = json.load(open(anchors_json, encoding='utf-8'))
def proj(x, y):
    xi, yi = int(min(max(x, 0), w - 1)), int(min(max(y, 0), h - 1))
    p = world_to_camera_view(scene, co, Vector((x, -y, float(H[yi, xi]))))
    return [round(p.x * resx, 1), round((1 - p.y) * resy, 1)]
res = {'size': [resx, resy], 'elev': ELEV, 'points': {k: proj(*v) for k, v in src['points'].items()},
       'scale_y': math.sin(e)}
json.dump(res, open(outdir + '/layout_proj.json', 'w'), indent=1)
print('RENDERED', resx, resy)
