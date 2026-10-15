"""
Skeleton hand + forearm (radius and ulna) that claws its way out of the fog.

Run headless:
  blender --background --factory-startup --python tools/build_skeleton_hand.py -- <out_dir> [--preview]

Writes <out_dir>/skeleton_hand.glb with one looping animation "Claw".
Blender Z-up: the arm points up (+Z), wrist at the origin, palm facing -Y.
After glTF export: arm along +Y, palm toward a camera on +Z.
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
random.seed(5)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def painted(name, rough=0.6):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    return m


M_BONE = painted("Bone")


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def bone_color(p):
    """Old bone: ivory with brown grime in the cracks and dirt toward the arm."""
    n1 = 0.5 + 0.5 * noise.noise(p * 7.0)
    n2 = 0.5 + 0.5 * noise.noise(p * 19.0 + Vector((3, 1, 4)))
    c = mix((0.52, 0.47, 0.36), (0.78, 0.72, 0.58), n1)
    c = mix(c, (0.24, 0.17, 0.1), max(0.0, n2 - 0.62) * 2.2)          # stains
    c = mix(c, (0.15, 0.11, 0.08), max(0.0, -p.z - 0.4) * 0.9)        # grave dirt up the forearm
    return c


parts = []


def finish(obj, bone):
    obj.data.materials.append(M_BONE)
    for p in obj.data.polygons:
        p.use_smooth = True
    attr = obj.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in obj.data.vertices:
        attr.data[v.index].color = (*bone_color(obj.location + v.co), 1)
    parts.append((obj, bone))
    return obj


def sphere(loc, scale, bone, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, bone)


def shaft(a, b, r, bone, waist=0.62, verts=10):
    """A bone shaft: knobbly ends, thinner waist (built from a lathe profile)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=L, location=(a + b) / 2, end_fill_type="NOTHING")
    o = bpy.context.active_object
    me = o.data
    for v in me.vertices:
        t = (v.co.z / L) + 0.5                      # 0 .. 1 along the bone
        k = waist + (1 - waist) * (abs(t - 0.5) * 2) ** 2
        v.co.x *= k
        v.co.y *= k
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    sub = o.modifiers.new("S", "SUBSURF")
    sub.levels = 1
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o.select_set(False)
    sphere(a, (r * 1.15,) * 3, bone, 12, 6)       # knobbly joint at each end
    sphere(b, (r * 1.1,) * 3, bone, 12, 6)
    return finish(o, bone)


# ---------------------------------------------------------------- forearm: radius + ulna
shaft((0.09, 0.0, -1.75), (0.08, -0.02, -0.02), 0.07, "forearm", waist=0.55)
shaft((-0.1, 0.03, -1.75), (-0.09, 0.02, -0.04), 0.06, "forearm", waist=0.5)
sphere((0.08, -0.01, 0.0), (0.11, 0.08, 0.08), "forearm")
sphere((-0.09, 0.02, -0.02), (0.09, 0.07, 0.07), "forearm")

# ---------------------------------------------------------------- carpals: a cluster of small bones
for _ in range(9):
    sphere((random.uniform(-0.17, 0.17), random.uniform(-0.04, 0.04), random.uniform(0.02, 0.18)),
           (random.uniform(0.05, 0.075),) * 3, "hand", 12, 6)

# ---------------------------------------------------------------- metacarpals + phalanges
FINGERS = [("index", 0.17, 0.62, 9), ("middle", 0.055, 0.7, 2), ("ring", -0.06, 0.64, -5), ("pinky", -0.17, 0.5, -13)]
finger_bones = {}
for name, x, ln, spread in FINGERS:
    a = math.radians(spread)
    d = Vector((math.sin(a), 0, math.cos(a)))
    mc0 = Vector((x * 0.6, 0.0, 0.2))
    base = Vector((x, -0.01, 0.62))
    shaft(mc0, base, 0.034, "hand", waist=0.6)         # metacarpal (part of the palm)
    seg = [ln * 0.42, ln * 0.32, ln * 0.26]
    r = [0.03, 0.026, 0.022]
    p = base.copy()
    chain = []
    for k in range(3):
        q = p + d * seg[k]
        bone = f"{name}_{k + 1}"
        shaft(p, q, r[k], bone)
        chain.append((bone, p.copy(), q.copy()))
        p = q
    # pointed tip of the last bone
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.022, radius2=0.004, depth=0.07, location=p + d * 0.035)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(rotation=True)
    finish(o, chain[-1][0])
    finger_bones[name] = chain

t_dir = Vector((0.75, -0.25, 0.6)).normalized()
p = Vector((0.22, -0.04, 0.16))
chain = []
for k, (ln, r) in enumerate([(0.26, 0.036), (0.2, 0.03), (0.16, 0.025)]):
    q = p + t_dir * ln
    bone = f"thumb_{k + 1}"
    shaft(p, q, r, bone)
    chain.append((bone, p.copy(), q.copy()))
    t_dir = (t_dir + Vector((-0.15, -0.1, 0.12))).normalized()
    p = q
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

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "SkeletonHand"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
fa = eb[0]
fa.name = "forearm"
fa.head, fa.tail = (0, 0, -1.75), (0, 0, -0.08)
hb = eb.new("hand")
hb.head, hb.tail = (0, 0, -0.08), (0, 0, 0.6)
hb.parent = fa
for name, chain in finger_bones.items():
    parent = hb
    for bone, a, b in chain:
        e = eb.new(bone)
        e.head, e.tail = a, b
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


def key(pb, q, f):
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)


arm.animation_data_create()
act = bpy.data.actions.new("Claw")
arm.animation_data.action = act
L = 90
PHASE = {"index": 0.0, "middle": 0.1, "ring": 0.2, "pinky": 0.3, "thumb": 0.45}
for f in range(0, L + 1, 3):
    t = f / L
    for name, chain in finger_bones.items():
        c = (0.5 - 0.5 * math.cos(2 * math.pi * (t * 2 + PHASE[name]))) ** 1.3
        for k, (bone, a, b) in enumerate(chain):
            amt = (0.1 + 0.9 * c) * [0.6, 0.85, 0.75][k]
            axis = (0.62, 0, -0.75) if name == "thumb" else (1, 0, 0)
            key(pose[bone], Quaternion(local_axis(pose[bone], axis), amt * (0.6 if name == "thumb" else 1)), f)
    sway = math.sin(2 * math.pi * t)
    key(pose["hand"], Quaternion(local_axis(pose["hand"], (0, 1, 0)), 0.25 * sway)
        @ Quaternion(local_axis(pose["hand"], (1, 0, 0)), 0.2 * math.sin(4 * math.pi * t + 0.5)), f)
    key(pose["forearm"], Quaternion(local_axis(pose["forearm"], (0, 1, 0)), 0.08 * math.sin(2 * math.pi * t + 1.1)), f)
tr = arm.animation_data.nla_tracks.new()
tr.name = "Claw"
st = tr.strips.new("Claw", 0, act)
st.name = "Claw"
arm.animation_data.action = None

glb = os.path.join(OUT_DIR, "skeleton_hand.glb")
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
    scene.render.resolution_x, scene.render.resolution_y = 600, 760
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.08, 0.04, 0.08, 1)
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 6), rotation=(math.radians(50), math.radians(10), math.radians(20)))
    bpy.context.active_object.data.energy = 4
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for f, name, loc in ((0, "skel_open.png", (0.3, -4.0, 0.5)), (22, "skel_claw.png", (2.4, -3.0, 0.8))):
        scene.frame_set(f)
        cam.location = loc
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (Vector((0, 0, 0.3)) - Vector(loc)).to_track_quat("-Z", "Y")
        scene.render.filepath = os.path.join(OUT_DIR, name)
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS DONE")
