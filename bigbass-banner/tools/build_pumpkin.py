"""
Carved jack-o'-lantern for the corner of the Big Bass offer card.

Run headless:
  blender --background --factory-startup --python tools/build_pumpkin.py -- <out_dir> [--preview]

Writes <out_dir>/pumpkin.glb (static; the page wobbles it and flickers the glow).
Blender Z-up, face toward -Y; after glTF export the face looks at a camera on +Z.
The glowing face uses the material "Glow" (emissive) so the page can flicker it.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(argv[0] if argv else ".")
PREVIEW = "--preview" in argv
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mat(name, color, rough=0.5, emit=None, strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


M_SKIN = mat("Skin", (1, 1, 1), rough=0.5, coat=0.3)
_nt = M_SKIN.node_tree
_vc = _nt.nodes.new("ShaderNodeVertexColor")
_vc.layer_name = "Col"
_nt.links.new(_vc.outputs["Color"], next(n for n in _nt.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"])
M_STEM = mat("Stem", (0.22, 0.28, 0.08), rough=0.8)
M_GLOW = mat("Glow", (1.0, 0.55, 0.06), rough=0.4, emit=(1.0, 0.42, 0.04), strength=6.0)
M_INNER = mat("Inner", (0.35, 0.08, 0.0), rough=0.9, emit=(1.0, 0.35, 0.05), strength=1.5)

# ---------------------------------------------------------------- ribbed body
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
body = bpy.context.active_object
RIBS = 10
for v in body.data.vertices:
    x, y, z = v.co
    a = math.atan2(y, x)
    lat = math.sqrt(max(0.0, 1 - z * z))
    rib = 1 - 0.07 * (0.5 - 0.5 * math.cos(a * RIBS)) ** 1.5 * lat      # grooves between the lobes
    bump = 1 + 0.015 * noise.noise(Vector((x, y, z)) * 4)
    v.co.x *= 1.18 * rib * bump
    v.co.y *= 1.18 * rib * bump
    v.co.z *= 0.86
    if z > 0.75:
        v.co.z -= (z - 0.75) * 0.6                                           # dimple round the stem
    if z < -0.8:
        v.co.z += (-z - 0.8) * 0.5
body.data.materials.append(M_SKIN)
col = body.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
for v in body.data.vertices:
    x, y, z = v.co
    a_ = math.atan2(y, x)
    groove = (0.5 - 0.5 * math.cos(a_ * RIBS)) ** 2                      # 1 in the grooves
    n = 0.5 + 0.5 * noise.noise(Vector((x, y, z)) * 6)
    base = (0.78 + 0.1 * n, 0.2 + 0.05 * n, 0.015)                       # deep Halloween orange
    t = min(1.0, groove * 0.85 + max(0.0, abs(z) - 0.45) * 1.3)          # darker grooves, burnt top/base
    c_ = tuple(bb + (dd - bb) * t for bb, dd in zip(base, (0.22, 0.04, 0.0)))
    col.data[v.index].color = (*c_, 1)
for p in body.data.polygons:
    p.use_smooth = True

# ---------------------------------------------------------------- carved face (glowing insets on the -Y side)
def surface_y(x, z):
    """Front surface of the ribbed body at (x, z): march in from the front until inside."""
    for k in range(400):
        y = -1.3 + k * 0.004
        # undo the body deformation to test against the unit sphere
        a = math.atan2(y, x)
        zz = z / 0.86
        lat = math.sqrt(max(0.0, 1 - zz * zz))
        rib = 1 - 0.07 * (0.5 - 0.5 * math.cos(a * RIBS)) ** 1.5 * lat
        sx, sy = x / (1.18 * rib), y / (1.18 * rib)
        if sx * sx + sy * sy + zz * zz <= 1:
            return y
    return 0.0


def carve(points2d, lift=0.02):
    """A glowing carved shape that hugs the curved front of the pumpkin."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z)) for (x, z) in points2d]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        v.co.y = surface_y(v.co.x, v.co.z) - lift
    me = bpy.data.meshes.new("cut")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("cut", me)
    scene.collection.objects.link(o)
    o.data.materials.append(M_GLOW)
    return o

def fang_segment(x0, x1, top, bot, fang=0.12, tooth=0.08):
    """Two convex halves so the skin between them reads as a fang (top) and a tooth (bottom)."""
    xm = (x0 + x1) / 2
    t0, t1, tm = top(x0), top(x1), top(xm) - fang
    b0, b1, bm = bot(x0), bot(x1), bot(xm) + tooth
    return [carve([(x0, t0), (xm, tm), (xm, bm), (x0, b0)], lift=0.025),
            carve([(xm, tm), (x1, t1), (x1, b1), (xm, bm)], lift=0.025)]


top = lambda x: -0.2 - 0.22 * (1 - (x / 0.8) ** 2)       # upper lip, a wide sneer
bot = lambda x: -0.32 - 0.36 * (1 - (x / 0.8) ** 2)       # lower lip

cuts = [
    # angry slanted eyes: high at the outside, sloping down toward the nose
    carve([(-0.7, 0.5), (-0.14, 0.24), (-0.52, 0.12)]),
    carve([(0.7, 0.5), (0.52, 0.12), (0.14, 0.24)]),
    carve([(-0.09, 0.0), (0.09, 0.0), (0.0, 0.16)]),        # nose
    # jagged grin: skin fangs bite down, teeth push up
    *[piece for (x0, x1) in [(-0.76, -0.46), (-0.4, -0.12), (-0.06, 0.22), (0.28, 0.56), (0.6, 0.78)]
      for piece in fang_segment(x0, x1, top, bot)],
]

# ---------------------------------------------------------------- curved stem
pts = [Vector((0, 0, 0.66)), Vector((0.04, 0, 0.88)), Vector((0.14, 0.02, 1.04)), Vector((0.3, 0.05, 1.12))]
curve = bpy.data.curves.new("stem", "CURVE")
curve.dimensions = "3D"
sp = curve.splines.new("BEZIER")
sp.bezier_points.add(len(pts) - 1)
for bp, p in zip(sp.bezier_points, pts):
    bp.co = p
    bp.handle_left_type = bp.handle_right_type = "AUTO"
curve.bevel_depth = 0.07
curve.bevel_resolution = 3
stem = bpy.data.objects.new("stem", curve)
scene.collection.objects.link(stem)
stem.data.materials.append(M_STEM)
# taper the stem toward its tip
for i, bp in enumerate(sp.bezier_points):
    bp.radius = 1.3 - i * 0.28
bpy.context.view_layer.objects.active = stem
stem.select_set(True)
bpy.ops.object.convert(target="MESH")
stem.select_set(False)
for p in stem.data.polygons:
    p.use_smooth = True

# ---------------------------------------------------------------- join + export
bpy.ops.object.select_all(action="DESELECT")
for o in [body, stem] + cuts:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = "Pumpkin"

glb = os.path.join(OUT_DIR, "pumpkin.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
print("EXPORTED", glb, os.path.getsize(glb))

if PREVIEW:
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 600, 560
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.05, 0.03, 0.08, 1)
    bpy.ops.object.light_add(type="AREA", location=(-2, -3, 3))
    bpy.context.active_object.data.energy = 400
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (1.2, -4.6, 1.2)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector((0, 0, 0.1)) - cam.location).to_track_quat("-Z", "Y")
    scene.render.filepath = os.path.join(OUT_DIR, "pumpkin.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEWS DONE")
