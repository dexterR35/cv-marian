"""
Rotten zombie hand + forearm that claws out of the cemetery dirt.

Run headless:
  blender --background --factory-startup --python tools/build_hand.py -- <out_dir> [--preview]

Writes <out_dir>/hand.glb with one looping animation "Claw".
Blender Z-up: the arm points up (+Z), wrist at the origin, palm facing -Y.
After glTF export: arm along +Y, palm facing +Z (toward a camera on +Z).
creatures3d.js raises it through a clipping plane so it appears from the ground.
"""
import bpy
import math
import os
import random
import sys
from mathutils import Vector, Quaternion, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(argv[0] if argv else ".")
PREVIEW = "--preview" in argv
os.makedirs(OUT_DIR, exist_ok=True)
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def make_mat(name, color, rough=0.6, coat=0.0):
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
    return m


def painted(name, rough=0.65, coat=0.15):
    m = make_mat(name, (1, 1, 1), rough=rough, coat=coat)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    return m


M_SKIN = painted("RottenSkin", rough=0.82, coat=0.0)
M_CLAW = make_mat("Claw", (0.06, 0.05, 0.02), rough=0.35, coat=0.6)
M_CLOTH = make_mat("Sleeve", (0.045, 0.035, 0.04), rough=0.95)
M_BONE = make_mat("Bone", (0.55, 0.5, 0.38), rough=0.5)

parts = []


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def skin_color(p):
    """Rotten green skin: mottled, bruised, darker in creases, dirty toward the arm."""
    n1 = 0.5 + 0.5 * noise.noise(p * 5.0)
    n2 = 0.5 + 0.5 * noise.noise(p * 13.0 + Vector((4, 2, 7)))
    c = mix((0.035, 0.06, 0.018), (0.09, 0.13, 0.04), n1)         # sick green
    c = mix(c, (0.08, 0.03, 0.06), max(0.0, n2 - 0.6) * 2.4)         # purple bruises
    c = mix(c, (0.015, 0.02, 0.008), max(0.0, 0.4 - n1) * 2.0)       # dark rot patches
    c = mix(c, (0.06, 0.04, 0.02), max(0.0, -p.z - 0.1) * 1.2)       # dirt up the forearm
    return c


def paint(obj):
    attr = obj.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in obj.data.vertices:
        attr.data[v.index].color = (*skin_color(obj.location + v.co), 1)


def finish(obj, mat, bone, skin=False):
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    if skin:
        paint(obj)
    parts.append((obj, bone))
    return obj


def sphere(loc, scale, mat, bone, skin=False, seg=20, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bone, skin)


def tube(a, b, r1, r2, mat, bone, skin=False, verts=12):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return finish(o, mat, bone, skin)


# ---------------------------------------------------------------- forearm + sleeve
tube((0, 0, -1.7), (0, 0, -0.05), 0.2, 0.15, M_SKIN, "forearm", skin=True, verts=20)
sphere((0, 0.0, -0.05), (0.17, 0.12, 0.12), M_SKIN, "forearm", skin=True)          # wrist bump
# torn sleeve: open cylinder with a ragged top edge
bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.235, depth=0.55, location=(0, 0, -0.95), end_fill_type="NOTHING")
sleeve = bpy.context.active_object
for v in sleeve.data.vertices:
    if v.co.z > 0:
        v.co.z += random.uniform(-0.18, 0.08)
        v.co.x *= random.uniform(0.95, 1.12)
        v.co.y *= random.uniform(0.95, 1.12)
finish(sleeve, M_CLOTH, "forearm")
for i in range(6):                                    # dangling threads
    a = random.uniform(0, math.tau)
    p = Vector((math.cos(a) * 0.24, math.sin(a) * 0.24, -0.68))
    tube(p, p + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -random.uniform(0.12, 0.25))), 0.01, 0.003, M_CLOTH, "forearm", verts=5)

# ---------------------------------------------------------------- palm
palm = sphere((0, 0, 0.36), (0.3, 0.11, 0.36), M_SKIN, "hand", skin=True, seg=28, rings=14)
for v in palm.data.vertices:                          # squarer, flatter palm, knuckle ridge at the top
    nx, nz = v.co.x / 0.3, v.co.z / 0.36
    v.co.x = math.copysign(abs(nx) ** 0.6, nx) * 0.3 * (0.92 + 0.08 * max(0.0, nz))
    v.co.z = math.copysign(abs(nz) ** 0.75, nz) * 0.36
    if v.co.y < 0:
        v.co.y *= 0.7
    if v.co.z > 0.2:
        v.co.y += 0.02

# ---------------------------------------------------------------- fingers
FINGERS = [  # name, base x, length, spread angle (deg)
    ("index", 0.21, 0.6, 8),
    ("middle", 0.07, 0.68, 2),
    ("ring", -0.07, 0.62, -4),
    ("pinky", -0.2, 0.48, -12),
]
finger_bones = {}
for name, x, ln, spread in FINGERS:
    a = math.radians(spread)
    d = Vector((math.sin(a), 0, math.cos(a)))
    base = Vector((x, 0.0, 0.66))
    seg_len = [ln * 0.42, ln * 0.32, ln * 0.26]
    r = [0.052, 0.044, 0.037, 0.028]
    p = base.copy()
    chain = []
    for k in range(3):
        q = p + d * seg_len[k]
        bone = f"{name}_{k + 1}"
        tube(p, q, r[k], r[k + 1], M_SKIN, bone, skin=True)
        sphere(p, (r[k] * 1.02,) * 3, M_SKIN, bone, skin=True, seg=14, rings=7)
        chain.append((bone, p.copy(), q.copy()))
        p = q
    # long, curved claw
    tip = p + d * 0.13 + Vector((0, -0.05, 0))
    tube(p, tip, 0.03, 0.004, M_CLAW, chain[-1][0], verts=8)
    finger_bones[name] = chain

# thumb: out to the side and forward
t_base = Vector((0.29, -0.05, 0.22))
t_dir = Vector((0.75, -0.25, 0.62)).normalized()
p = t_base.copy()
chain = []
for k, (ln, r1, r2) in enumerate([(0.24, 0.065, 0.055), (0.2, 0.055, 0.047), (0.16, 0.047, 0.036)]):
    q = p + t_dir * ln
    bone = f"thumb_{k + 1}"
    tube(p, q, r1, r2, M_SKIN, bone, skin=True)
    sphere(p, (r1 * 1.1,) * 3, M_SKIN, bone, skin=True, seg=14, rings=7)
    chain.append((bone, p.copy(), q.copy()))
    t_dir = (t_dir + Vector((-0.15, -0.1, 0.1))).normalized()
    p = q
tube(p, p + t_dir * 0.11 + Vector((0, -0.04, 0)), 0.03, 0.004, M_CLAW, chain[-1][0], verts=8)
finger_bones["thumb"] = chain

# ---------------------------------------------------------------- join
for obj, bone in parts:
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
bpy.ops.object.select_all(action="DESELECT")
for obj, _ in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0][0]
bpy.ops.object.join()
mesh = bpy.context.active_object
mesh.name = "HandMesh"

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "ZombieHand"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
fa = eb[0]
fa.name = "forearm"
fa.head, fa.tail = (0, 0, -1.7), (0, 0, -0.05)
hb = eb.new("hand")
hb.head, hb.tail = (0, 0, -0.05), (0, 0, 0.62)
hb.parent = fa
for name, chain in finger_bones.items():
    parent = hb
    for bone, a, b in chain:
        e = eb.new(bone)
        e.head, e.tail = a, b
        e.roll = 0
        e.parent = parent
        parent = e
bpy.ops.object.mode_set(mode="OBJECT")
mesh.parent = arm
mesh.modifiers.new("Armature", "ARMATURE").object = arm

pose = arm.pose.bones
for pb in pose:
    pb.rotation_mode = "QUATERNION"


def local_axis(pb, world_axis):
    return (pb.bone.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()


def key_rot(pb, q, f):
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)


arm.animation_data_create()
claw = bpy.data.actions.new("Claw")
arm.animation_data.action = claw

# 90 frames: fingers curl toward the viewer in a ripple, wrist and arm sway like it's grasping for air
L = 90
PHASE = {"index": 0.0, "middle": 0.12, "ring": 0.24, "pinky": 0.36, "thumb": 0.5}
for f in range(0, L + 1, 3):
    t = f / L
    for name, chain in finger_bones.items():
        c = 0.5 - 0.5 * math.cos(2 * math.pi * (t * 2 + PHASE[name]))        # two grabs per loop
        c = c ** 1.4
        for k, (bone, a, b) in enumerate(chain):
            amt = (0.15 + 0.85 * c) * [0.55, 0.8, 0.7][k]
            if name == "thumb":
                q = Quaternion(local_axis(pose[bone], (0.62, 0, -0.75)), amt * 0.6)   # curls in toward the palm
            else:
                q = Quaternion(local_axis(pose[bone], (1, 0, 0)), amt)        # + about X: tips toward -Y (palm/viewer)
            key_rot(pose[bone], q, f)
    sway = math.sin(2 * math.pi * t)
    key_rot(pose["hand"], Quaternion(local_axis(pose["hand"], (0, 1, 0)), 0.22 * sway)
            @ Quaternion(local_axis(pose["hand"], (1, 0, 0)), 0.18 * math.sin(4 * math.pi * t + 0.6)), f)
    key_rot(pose["forearm"], Quaternion(local_axis(pose["forearm"], (0, 1, 0)), 0.07 * math.sin(2 * math.pi * t + 1.2)), f)

ad = arm.animation_data
tr = ad.nla_tracks.new()
tr.name = "Claw"
st = tr.strips.new("Claw", 0, claw)
st.name = "Claw"
ad.action = None

glb = os.path.join(OUT_DIR, "hand.glb")
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
    scene.render.resolution_x, scene.render.resolution_y = 700, 800
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.08, 0.05, 0.1, 1)
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 6), rotation=(math.radians(50), math.radians(10), math.radians(20)))
    bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type="POINT", location=(1.5, -1.5, 0.2))
    bpy.context.active_object.data.energy = 300
    bpy.context.active_object.data.color = (1.0, 0.5, 0.15)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(frame, loc, target, name):
        scene.frame_set(frame)
        cam.location = loc
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")
        scene.render.filepath = os.path.join(OUT_DIR, name)
        bpy.ops.render.render(write_still=True)

    shoot(0, (0.4, -4.2, 0.6), (0, 0, 0.4), "hand_open.png")
    shoot(22, (0.4, -4.2, 0.6), (0, 0, 0.4), "hand_claw.png")
    shoot(22, (2.8, -2.6, 1.0), (0, 0, 0.3), "hand_34.png")
    print("PREVIEWS DONE")
