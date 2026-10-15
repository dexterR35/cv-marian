"""
Floating sheet ghost for the NetBet RO Halloween page.

Run headless:
  blender --background --factory-startup --python tools/build_ghost.py -- <out_dir> [--preview]

Writes <out_dir>/ghost.glb with one looping animation "Float":
the skirt ripples in a wave down a bone chain and the stubby arms wave.
Blender Z-up, face toward -Y; after glTF export the ghost stands up (+Y)
and looks at a camera on +Z.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(argv[0] if argv else ".")
PREVIEW = "--preview" in argv
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def make_mat(name, color, rough=0.5, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
    return m


M_SHEET = make_mat("Sheet", (0.86, 0.9, 1.0), rough=0.65, emit=(0.55, 0.7, 1.0), strength=0.35, alpha=0.88)
M_HOLE = make_mat("Hole", (0.01, 0.0, 0.02), rough=0.9)
M_GLOW = make_mat("EyeGlow", (1.0, 0.25, 0.1), rough=0.2, emit=(1.0, 0.2, 0.05), strength=4.0)

# ---------------------------------------------------------------- body (revolved profile + wavy hem)
SEG, RINGS = 48, 28
H_TOP, H_BOTTOM = 2.0, 0.0


def radius(z):
    """Dome head that flares into a skirt."""
    if z > 1.2:
        t = (z - 1.2) / 0.8                         # 0 at neck line .. 1 at the top
        return 0.62 * math.sqrt(max(0.0, 1 - t * t))
    t = (1.2 - z) / 1.2                             # 0 at neck line .. 1 at the hem
    return 0.62 + 0.18 * t ** 1.4


bm = bmesh.new()
rings = []
for i in range(RINGS + 1):
    z = H_TOP - (H_TOP - H_BOTTOM) * i / RINGS
    ring = []
    for j in range(SEG):
        a = 2 * math.pi * j / SEG
        r = radius(z)
        zz = z
        if i == RINGS:                               # scalloped hem
            zz += 0.12 * math.sin(5 * a)
        elif i == RINGS - 1:
            zz += 0.06 * math.sin(5 * a)
        ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), zz)))
    rings.append(ring)
top = bm.verts.new((0, 0, H_TOP))
for j in range(SEG):
    bm.faces.new((top, rings[1][j], rings[1][(j + 1) % SEG])) if False else None
for i in range(RINGS):
    for j in range(SEG):
        a, b = rings[i][j], rings[i][(j + 1) % SEG]
        c, d = rings[i + 1][(j + 1) % SEG], rings[i + 1][j]
        if i == 0:
            bm.faces.new((top, d, c)) if False else None
        try:
            bm.faces.new((a, d, c, b))
        except ValueError:
            pass
# the first ring collapses to (almost) a point at the top; cap it with the top vertex
for j in range(SEG):
    try:
        bm.faces.new((top, rings[0][(j + 1) % SEG], rings[0][j]))
    except ValueError:
        pass
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Ghost")
bm.to_mesh(me)
bm.free()
body = bpy.data.objects.new("Ghost", me)
scene.collection.objects.link(body)
sol = body.modifiers.new("Thick", "SOLIDIFY")
sol.thickness = 0.03
body.modifiers.new("Smooth", "SUBSURF").levels = 1
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.convert(target="MESH")
body.select_set(False)
body.data.materials.append(M_SHEET)
for p in body.data.polygons:
    p.use_smooth = True

parts = [(body, None)]


def add_sphere(loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    parts.append((o, "head"))
    return o


# face on the -Y side: hollow eyes with a faint ember inside, a wailing "O" mouth
for s in (-1, 1):
    add_sphere((s * 0.2, -0.56, 1.5), (0.11, 0.06, 0.16), M_HOLE)
    add_sphere((s * 0.2, -0.6, 1.48), (0.035, 0.02, 0.04), M_GLOW)
add_sphere((0, -0.6, 1.18), (0.1, 0.05, 0.14), M_HOLE)

# stubby arms
for s, side in ((-1, "L"), (1, "R")):
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.16, radius2=0.07, depth=0.55,
                                    location=(s * 0.82, -0.05, 1.05), rotation=(0, s * math.radians(70), 0))
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(M_SHEET)
    for p in o.data.polygons:
        p.use_smooth = True
    parts.append((o, f"arm_{side}"))

# ---------------------------------------------------------------- weights
# skirt: blend down a chain of 3 tail bones by height; head and above -> "head"
TAIL = [("tail_1", 1.2, 0.8), ("tail_2", 0.8, 0.4), ("tail_3", 0.4, -0.2)]
groups = {n: body.vertex_groups.new(name=n) for n in ["head"] + [t[0] for t in TAIL]}
for v in body.data.vertices:
    z = v.co.z
    if z >= 1.2:
        groups["head"].add([v.index], 1.0, "REPLACE")
        continue
    for name, z0, z1 in TAIL:
        mid = (z0 + z1) / 2
        w = max(0.0, 1 - abs(z - mid) / ((z0 - z1) * 0.9))
        if w > 0:
            groups[name].add([v.index], w, "REPLACE")
    if z > 0.95:
        groups["head"].add([v.index], (z - 0.95) / 0.25, "REPLACE")
for o, bone in parts[1:]:
    vg = o.vertex_groups.new(name=bone)
    vg.add([v.index for v in o.data.vertices], 1.0, "REPLACE")

bpy.ops.object.select_all(action="DESELECT")
for o, _ in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
mesh = bpy.context.active_object

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "GhostRig"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
root = eb[0]
root.name = "root"
root.head, root.tail = (0, 0, 1.2), (0, 0, 1.0)
head = eb.new("head")
head.head, head.tail = (0, 0, 1.2), (0, 0, 2.0)
head.parent = root
prev = root
for name, z0, z1 in TAIL:
    b = eb.new(name)
    b.head, b.tail = (0, 0, z0), (0, 0, z1)
    b.parent = prev
    prev = b
for s, side in ((-1, "L"), (1, "R")):
    b = eb.new(f"arm_{side}")
    b.head, b.tail = (s * 0.6, 0, 1.12), (s * 1.05, 0, 0.98)
    b.parent = root
bpy.ops.object.mode_set(mode="OBJECT")
mesh.parent = arm
mesh.modifiers.new("Armature", "ARMATURE").object = arm

pose = arm.pose.bones
for pb in pose:
    pb.rotation_mode = "QUATERNION"


def local_axis(pb, world_axis):
    return (pb.bone.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()


def key(pb, q, f):
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)


arm.animation_data_create()
act = bpy.data.actions.new("Float")
arm.animation_data.action = act
L = 60
for f in range(0, L + 1, 2):
    t = 2 * math.pi * f / L
    for k, (name, _, _) in enumerate(TAIL):           # a wave travelling down the skirt
        q = Quaternion(local_axis(pose[name], (0, 1, 0)), 0.16 * math.sin(t - k * 0.9)) @ \
            Quaternion(local_axis(pose[name], (1, 0, 0)), 0.12 * math.sin(t * 2 - k * 0.7))
        key(pose[name], q, f)
    key(pose["head"], Quaternion(local_axis(pose["head"], (0, 1, 0)), 0.08 * math.sin(t + 1.0)), f)
    for s, side in ((-1, "L"), (1, "R")):
        key(pose[f"arm_{side}"], Quaternion(local_axis(pose[f"arm_{side}"], (0, 1, 0)), s * 0.45 * math.sin(t * 2 + (0 if s < 0 else 1.2))), f)
tr = arm.animation_data.nla_tracks.new()
tr.name = "Float"
st = tr.strips.new("Float", 0, act)
st.name = "Float"
arm.animation_data.action = None

glb = os.path.join(OUT_DIR, "ghost.glb")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
print("EXPORTED", glb, os.path.getsize(glb))

if PREVIEW:
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 600, 700
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.03, 0.02, 0.06, 1)
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 6), rotation=(math.radians(40), 0, math.radians(20)))
    bpy.context.active_object.data.energy = 3
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for f, name, loc in ((0, "ghost_front.png", (0, -6, 1.1)), (15, "ghost_34.png", (3.5, -4.5, 1.6))):
        scene.frame_set(f)
        cam.location = loc
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y")
        scene.render.filepath = os.path.join(OUT_DIR, name)
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS DONE")
