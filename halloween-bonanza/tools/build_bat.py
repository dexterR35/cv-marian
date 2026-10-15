"""
Procedural, rigged + animated bat for the Halloween Bonanza page.

Run headless:
  blender --background --factory-startup --python tools/build_bat.py -- <out_dir> [--preview]

Writes <out_dir>/bat.glb with animations "Flap" and "Glide".
Blender Z-up, bat faces +Y with wings spread along X (seen from above).
glTF export makes that Y-up, facing -Z - what creatures3d.js expects.
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
random.seed(3)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def make_mat(name, color, rough=0.6, coat=0.0, emit=None, emit_strength=0.0, double=False):
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
        b.inputs["Emission Strength"].default_value = emit_strength
    m.use_backface_culling = not double
    return m


def painted(name, rough=0.7):
    m = make_mat(name, (1, 1, 1), rough=rough, double=True)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    return m


M_FUR = make_mat("Fur", (0.035, 0.022, 0.02), rough=0.85)
M_FUR_L = make_mat("FurLight", (0.08, 0.05, 0.04), rough=0.9)
M_SKIN = make_mat("Skin", (0.045, 0.025, 0.03), rough=0.5, coat=0.2)
M_MEMBRANE = painted("Membrane", rough=0.55)
M_BONE = make_mat("WingBone", (0.03, 0.018, 0.02), rough=0.5, double=True)
M_EYE = make_mat("Eye", (0.6, 0.05, 0.0), rough=0.1, coat=1, emit=(1.0, 0.15, 0.0), emit_strength=6)
M_FANG = make_mat("Fang", (0.85, 0.8, 0.7), rough=0.3)

parts = []


def finish(obj, mat, weights):
    """weights: bone name, or callable(local_co) -> {bone: w}."""
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    parts.append((obj, weights))
    return obj


def sphere(loc, scale, mat, bone, seg=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bone)


def tube(a, b, r1, r2, mat, bone, verts=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return finish(o, mat, bone)


# ---------------------------------------------------------------- body
BODY = Vector((0, 0, 0.2))
sphere(BODY, (0.2, 0.42, 0.17), M_FUR, "body")
sphere(BODY + Vector((0, 0.45, 0.04)), (0.17, 0.16, 0.15), M_FUR, "head")           # head
sphere(BODY + Vector((0, 0.6, 0.0)), (0.08, 0.08, 0.07), M_SKIN, "head", 16, 8)       # snout
for s in (-1, 1):
    tube(BODY + Vector((s * 0.08, 0.45, 0.12)), BODY + Vector((s * 0.2, 0.42, 0.42)), 0.07, 0.006, M_SKIN, "head")  # ears
    sphere(BODY + Vector((s * 0.07, 0.58, 0.09)), (0.032, 0.032, 0.032), M_EYE, "head", 12, 6)
    tube(BODY + Vector((s * 0.03, 0.66, -0.02)), BODY + Vector((s * 0.03, 0.66, -0.1)), 0.012, 0.002, M_FANG, "head", 6)
    # little feet trailing behind
    tube(BODY + Vector((s * 0.08, -0.38, 0.0)), BODY + Vector((s * 0.12, -0.6, -0.02)), 0.025, 0.012, M_SKIN, "body", 6)

# fur tufts
for _ in range(260):                     # short, swept-back fur (lies flat, reads as fuzz)
    th = random.uniform(0, math.tau)
    ph = random.uniform(0.2, 1.5)
    n = Vector((math.cos(th) * math.sin(ph), math.sin(th) * math.sin(ph), math.cos(ph)))
    base = BODY + Vector((n.x * 0.2, n.y * 0.42, n.z * 0.17)) * 0.98
    back = Vector((0, -1, 0))
    tang = (back - n * back.dot(n)).normalized()
    tip = base + (tang * 0.85 + n * 0.3).normalized() * random.uniform(0.025, 0.05)
    tube(base, tip, 0.008, 0.001, M_FUR_L if random.random() < 0.4 else M_FUR, "body", 4)

# ---------------------------------------------------------------- wings
# outline (right wing, x > 0) from the shoulder round the fingers back to the body
SHOULDER = Vector((0.16, 0.12, 0.24))
WRIST = Vector((0.95, 0.38, 0.26))
TIPS = [Vector((1.75, 0.05, 0.24)), Vector((1.6, -0.48, 0.23)), Vector((1.1, -0.78, 0.22)), Vector((0.62, -0.72, 0.22))]
BODY_EDGE = Vector((0.12, -0.42, 0.22))


def outline(side):
    pts = [SHOULDER, WRIST]
    chain = [WRIST] + TIPS + [BODY_EDGE]
    pts = [SHOULDER]
    # leading edge shoulder -> wrist -> first tip
    for t in [i / 6 for i in range(7)]:
        pts.append(SHOULDER.lerp(WRIST, t))
    for t in [i / 6 for i in range(1, 7)]:
        pts.append(WRIST.lerp(TIPS[0], t))
    # trailing edge: scalloped between finger tips
    seq = TIPS + [BODY_EDGE]
    for a, b in zip(seq, seq[1:]):
        for i in range(1, 9):
            t = i / 8
            p = a.lerp(b, t)
            inward = (WRIST - p)
            inward.z = 0
            p = p + inward.normalized() * math.sin(math.pi * t) * 0.22 * (a - b).length
            pts.append(p)
    return [Vector((side * p.x, p.y, p.z)) for p in pts]


def build_wing(side, bone_arm, bone_hand):
    rim = outline(side)
    hub = Vector((side * 0.3, 0.0, 0.24))                     # fan centre near the body
    rings = 6
    verts, faces = [], []
    for k in range(1, rings + 1):
        t = k / rings
        for p in rim:
            verts.append(hub.lerp(p, t))
    verts.append(hub)
    hub_i = len(verts) - 1
    n = len(rim)
    for k in range(rings - 1):
        for i in range(n - 1):
            a, b = k * n + i, k * n + i + 1
            c, d = (k + 1) * n + i + 1, (k + 1) * n + i
            faces.append((a, b, c, d) if side > 0 else (a, d, c, b))
    for i in range(n - 1):
        faces.append((hub_i, i, i + 1) if side > 0 else (hub_i, i + 1, i))
    me = bpy.data.meshes.new(f"wing_{bone_arm}")
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    o = bpy.data.objects.new(me.name, me)
    scene.collection.objects.link(o)
    # vein-ish colouring: darker near the bones, a little purple translucency look
    col = o.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in o.data.vertices:
        c = v.co
        n1 = 0.5 + 0.5 * noise.noise(c * 6)
        base = (0.07 + 0.03 * n1, 0.035 + 0.015 * n1, 0.05 + 0.025 * n1)
        col.data[v.index].color = (*base, 1)

    def ramp(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)

    def weights(co):
        # body -> arm -> hand blend, so the wing root stays glued to the body while the tips flap
        ax = abs(co.x)
        wb = 1 - ramp(0.2, 0.55, ax)
        wh = ramp(0.75, 1.25, ax)
        wa = max(0.0, 1 - wb - wh)
        return {"body": wb, bone_arm: wa, bone_hand: wh}
    return finish(o, M_MEMBRANE, weights)


build_wing(1, "arm_R", "hand_R")
build_wing(-1, "arm_L", "hand_L")
for s, arm, hand in ((1, "arm_R", "hand_R"), (-1, "arm_L", "hand_L")):
    m = Vector((s, 1, 1))
    sh = Vector((SHOULDER.x * s, SHOULDER.y, SHOULDER.z + 0.01))
    wr = Vector((WRIST.x * s, WRIST.y, WRIST.z + 0.01))
    tube(sh, wr, 0.035, 0.022, M_BONE, arm, 8)
    sphere(wr, (0.03, 0.03, 0.03), M_BONE, hand, 10, 6)
    tube(wr, wr + Vector((s * 0.06, 0.1, 0.02)), 0.02, 0.004, M_BONE, hand, 6)  # thumb claw
    for tp in TIPS:
        tube(wr, Vector((tp.x * s, tp.y, tp.z + 0.01)), 0.016, 0.004, M_BONE, hand, 6)

# ---------------------------------------------------------------- join with weights
for obj, w in parts:
    if callable(w):
        groups = {}
        for v in obj.data.vertices:
            for bone, val in w(v.co).items():
                groups.setdefault(bone, []).append((v.index, val))
        for bone, items in groups.items():
            vg = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            for i, val in items:
                if val > 0:
                    vg.add([i], val, "REPLACE")
    else:
        vg = obj.vertex_groups.new(name=w)
        vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")

bpy.ops.object.select_all(action="DESELECT")
for obj, _ in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0][0]
bpy.ops.object.join()
mesh = bpy.context.active_object
mesh.name = "BatMesh"

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "Bat"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
body = eb[0]
body.name = "body"
body.head, body.tail = BODY, BODY + Vector((0, 0.3, 0))
head = eb.new("head")
head.head, head.tail = BODY + Vector((0, 0.35, 0)), BODY + Vector((0, 0.6, 0))
head.parent = body
for s, side in ((1, "R"), (-1, "L")):
    a = eb.new(f"arm_{side}")
    a.head = Vector((SHOULDER.x * s, SHOULDER.y, SHOULDER.z))
    a.tail = Vector((WRIST.x * s, WRIST.y, WRIST.z))
    a.parent = body
    h = eb.new(f"hand_{side}")
    h.head = a.tail
    h.tail = Vector((TIPS[1].x * s, TIPS[1].y, TIPS[1].z))
    h.parent = a
bpy.ops.object.mode_set(mode="OBJECT")
mesh.parent = arm
mod = mesh.modifiers.new("Armature", "ARMATURE")
mod.object = arm

pose = arm.pose.bones
for pb in pose:
    pb.rotation_mode = "QUATERNION"


def local_axis(pb, world_axis):
    return (pb.bone.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()


def key_rot(pb, q, f):
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)


def new_action(name):
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    return act


def push(act):
    ad = arm.animation_data
    tr = ad.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    st.name = act.name
    ad.action = None


def wing_pose(side, up, fold):
    """up: shoulder angle (+ = wing up), fold: extra bend at the wrist (+ = tips up)."""
    s = 1 if side == "R" else -1
    pa, ph = pose[f"arm_{side}"], pose[f"hand_{side}"]
    # rotating about the body's forward axis (Y) lifts/lowers the wing; sign flips per side
    qa = Quaternion(local_axis(pa, (0, 1, 0)), -s * up)
    qh = Quaternion(local_axis(ph, (0, 1, 0)), -s * fold)
    return qa, qh


# ---------------- FLAP (16 frames, ~0.53 s)
L = 16
flap = new_action("Flap")
for f in range(0, L + 1):
    ph = 2 * math.pi * f / L
    up = math.radians(48) * math.cos(ph)
    fold = math.radians(32) * math.cos(ph - 0.9)
    for side in ("R", "L"):
        qa, qh = wing_pose(side, up, fold)
        key_rot(pose[f"arm_{side}"], qa, f)
        key_rot(pose[f"hand_{side}"], qh, f)
    pb = pose["body"]
    pb.location = (0, 0, -0.06 * math.cos(ph))          # body bobs opposite the wings
    pb.keyframe_insert("location", frame=f)
    key_rot(pose["head"], Quaternion(local_axis(pose["head"], (1, 0, 0)), 0.08 * math.sin(ph)), f)
push(flap)

# ---------------- GLIDE (60 frames): wings spread, small trembles
G = 60
glide = new_action("Glide")
for f in range(0, G + 1, 3):
    ph = 2 * math.pi * f / G
    for side in ("R", "L"):
        qa, qh = wing_pose(side, math.radians(6) + math.radians(3) * math.sin(ph * 2), math.radians(4) * math.sin(ph * 3 + 1))
        key_rot(pose[f"arm_{side}"], qa, f)
        key_rot(pose[f"hand_{side}"], qh, f)
    key_rot(pose["head"], Quaternion(local_axis(pose["head"], (0, 0, 1)), 0.15 * math.sin(ph)), f)
push(glide)

# ---------------------------------------------------------------- export
glb = os.path.join(OUT_DIR, "bat.glb")
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
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.25, 0.2, 0.3, 1)
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 6), rotation=(math.radians(25), math.radians(-20), 0))
    bpy.context.active_object.data.energy = 4
    arm.animation_data.nla_tracks["Glide"].mute = True
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

    shoot(4, (0, -0.1, 6.0), (0, -0.1, 0), "bat_top_mid.png")
    shoot(0, (0, -5.5, 0.3), (0, 0, 0.25), "bat_front_up.png")      # front view: both wings must mirror
    shoot(8, (0, -5.5, 0.3), (0, 0, 0.25), "bat_front_down.png")
    print("PREVIEWS DONE")
