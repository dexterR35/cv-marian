"""
Procedural, rigged + animated spider for the Big Bass Halloween page.

Run headless:
  blender --background --factory-startup --python tools/build_spider.py -- <out_dir> [--preview]

Writes <out_dir>/spider.glb with two animations ("Walk", "Idle").
With --preview it also renders spider_top.png and spider_34.png into <out_dir>.

Conventions: Blender Z-up, spider faces +Y. glTF export turns that into
Y-up with the spider facing -Z, which is what assets/spider3d.js expects.
"""
import bpy
import math
import random
import sys
import os
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(argv[0] if argv else ".")
PREVIEW = "--preview" in argv
os.makedirs(OUT_DIR, exist_ok=True)

random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

# ---------------------------------------------------------------- materials
def make_mat(name, color, rough=0.45, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    return m

def make_painted_mat(name, rough=0.62, coat=0.15):
    """Base colour comes from the per-vertex 'Col' attribute (exported as glTF COLOR_0)."""
    m = make_mat(name, (1, 1, 1), rough=rough, coat=coat)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return m

M_CHITIN = make_mat("Chitin", (0.022, 0.014, 0.010), rough=0.55, coat=0.2)
M_HAIR   = make_mat("Hair", (0.11, 0.075, 0.05), rough=0.85, spec=0.3)
M_HAIR_D = make_mat("HairDark", (0.03, 0.02, 0.015), rough=0.85, spec=0.3)
M_BAND   = make_mat("Band", (0.10, 0.055, 0.025), rough=0.7)
M_ABD    = make_painted_mat("Abdomen")
M_CEPH   = make_painted_mat("Cephalothorax", rough=0.5, coat=0.3)
M_EYE    = make_mat("Eye", (0.004, 0.004, 0.005), rough=0.04, coat=1.0, spec=1.0)
M_FANG   = make_mat("Fang", (0.09, 0.03, 0.02), rough=0.3, coat=0.6)

from mathutils import noise

def paint(obj, fn):
    """Fill a 'Col' point attribute on obj from fn(local_co) -> (r, g, b)."""
    attr = obj.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in obj.data.vertices:
        attr.data[v.index].color = (*fn(v.co), 1.0)

def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))

def smooth01(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

parts = []   # (object, bone_name)

def finish(obj, mat, bone):
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    parts.append((obj, bone))
    return obj

def sphere(loc, scale, mat, bone, seg=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bone)

def tube(a, b, r1, r2, mat, bone, verts=14):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length,
                                    location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return finish(o, mat, bone)

def spines(a, b, r, count, bone, length=0.11, up_bias=0.6):
    """Hairs along a segment, swept toward the tip so they lie on the leg like real setae."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(axis).normalized()
    for _ in range(count):
        t = random.uniform(0.1, 0.95)
        ang = random.uniform(-math.pi * 0.85, math.pi * 0.85)
        n = (up * math.cos(ang) + side * math.sin(ang)).normalized()
        n = (n + Vector((0, 0, up_bias))).normalized()
        base = a.lerp(b, t) + n * r * 0.85
        tip = base + (n * 0.45 + axis * 0.85).normalized() * length * random.uniform(0.6, 1.25)
        tube(base, tip, 0.008, 0.001, M_HAIR if random.random() < 0.6 else M_HAIR_D, bone, verts=4)

# ---------------------------------------------------------------- body
CEPH = Vector((0, 0.22, 0.48))
ABD = Vector((0, -0.95, 0.56))

# cephalothorax: flattened, slightly narrower toward the front (vertex co is local to CEPH)
ceph = sphere(CEPH, (0.50, 0.62, 0.30), M_CEPH, "body")
for v in ceph.data.vertices:
    fy = v.co.y / 0.62
    if fy > 0:
        v.co.x *= 1 - 0.18 * fy
    if v.co.z > 0.18:                                  # raised head region
        v.co.z += 0.05 * max(0.0, fy)

def ceph_color(co):
    x, y, z = co.x / 0.5, co.y / 0.62, co.z / 0.3
    base = mix((0.022, 0.014, 0.01), (0.055, 0.035, 0.022), 0.5 + 0.5 * noise.noise(co * 9))
    stripe = 1 - smooth01(0.08, 0.16, abs(x) - 0.06 * (1 - y))               # pale median band
    base = mix(base, (0.14, 0.08, 0.035), stripe * (1 - smooth01(0.35, 0.6, y)) * 0.85)
    ang = math.atan2(x, y + 0.2)                                              # radial striations
    base = mix(base, (0.015, 0.01, 0.008), smooth01(0.6, 0.95, math.cos(ang * 9)) * 0.5)
    base = mix(base, (0.10, 0.065, 0.04), smooth01(0.78, 0.95, math.hypot(x, y * 0.9)) * 0.7)  # pale rim
    return mix(base, (0.015, 0.01, 0.008), smooth01(0.1, -0.4, z))            # dark underside
paint(ceph, ceph_color)

# pedicel
tube((0, -0.25, 0.5), (0, -0.05, 0.48), 0.11, 0.13, M_CHITIN, "body")

# abdomen: egg shaped, wider at the back third
abd = sphere(ABD, (0.70, 0.98, 0.62), M_ABD, "abdomen", seg=96, rings=48)
for v in abd.data.vertices:
    t = v.co.y / 0.98                                   # -1 back .. +1 front
    v.co.x *= 1.0 + 0.10 * (-t) - 0.12 * max(0.0, t) ** 2
    v.co.z *= 0.95 + 0.05 * -t

def abd_color(co):
    u, v, z = co.x / 0.74, co.y / 0.98, co.z / 0.62
    base = mix((0.018, 0.012, 0.008), (0.065, 0.04, 0.024), 0.5 + 0.6 * noise.noise(co * 7))
    base = mix(base, (0.02, 0.013, 0.01), smooth01(0.4, 0.9, noise.noise(co * 22 + Vector((3, 1, 2)))) * 0.6)
    # lanceolate "heart" mark at the front
    w = 0.17 * max(0.0, 1 - abs(v - 0.45) / 0.55)
    base = mix(base, (0.17, 0.09, 0.035), (1 - smooth01(w - 0.04, w + 0.03, abs(u))) * smooth01(-0.15, 0.05, v))
    # chevron ladder toward the spinnerets
    vc = v + 0.45 * abs(u)
    band = ((vc + 1) * 3.4) % 1.0
    chev = smooth01(0.0, 0.04, band) * (1 - smooth01(0.13, 0.22, band))
    chev *=(1 - smooth01(0.55, 0.75, abs(u))) * smooth01(0.1, -0.05, v) * smooth01(-1.0, -0.85, v)
    base = mix(base, (0.34, 0.13, 0.03), chev * 0.9)
    # paired pale spots
    for v0 in (0.25, -0.15, -0.5):
        d = math.hypot(abs(u) - 0.42 + 0.08 * v0, v - v0)
        base = mix(base, (0.36, 0.24, 0.12), 1 - smooth01(0.03, 0.12, d))
    return mix(base, (0.018, 0.012, 0.009), smooth01(0.05, -0.35, z))       # dark underside
paint(abd, abd_color)

# fuzz: short hairs lying back along the abdomen
for _ in range(420):
    th = random.uniform(0, math.tau)
    ph = random.uniform(0.1, 1.45)
    n = Vector((math.cos(th) * math.sin(ph), math.sin(th) * math.sin(ph), math.cos(ph)))
    tv = n.y
    surf = Vector((n.x * 0.70 * (1.0 + 0.10 * -tv - 0.12 * max(0.0, tv) ** 2), n.y * 0.98, n.z * 0.62 * (0.95 + 0.05 * -tv)))
    base = ABD + surf * 0.99
    back = Vector((0, -1, 0))
    tang = (back - n * back.dot(n)).normalized()
    tip = base + (tang * 0.85 + n * 0.4).normalized() * random.uniform(0.05, 0.11)
    tube(base, tip, 0.007, 0.001, M_HAIR if random.random() < 0.55 else M_HAIR_D, "abdomen", verts=4)

# fuzz on the cephalothorax rim
for _ in range(90):
    th = random.uniform(0, math.tau)
    n = Vector((math.cos(th), math.sin(th), 0.35)).normalized()
    base = CEPH + Vector((n.x * 0.47, n.y * 0.58, 0.08))
    tip = base + (n + Vector((0, 0, 0.6))).normalized() * random.uniform(0.04, 0.08)
    tube(base, tip, 0.006, 0.001, M_HAIR, "body", verts=4)

# eyes: two big front ones + a ring of smaller ones
eye_z = CEPH.z + 0.24
for s in (-1, 1):
    sphere((s * 0.07, CEPH.y + 0.50, eye_z + 0.02), (0.055, 0.055, 0.055), M_EYE, "body", 16, 8)
    sphere((s * 0.17, CEPH.y + 0.44, eye_z - 0.01), (0.035, 0.035, 0.035), M_EYE, "body", 12, 6)
    sphere((s * 0.12, CEPH.y + 0.36, eye_z + 0.04), (0.03, 0.03, 0.03), M_EYE, "body", 12, 6)
    sphere((s * 0.20, CEPH.y + 0.30, eye_z + 0.01), (0.028, 0.028, 0.028), M_EYE, "body", 12, 6)

# chelicerae + fangs
for s in (-1, 1):
    base = Vector((s * 0.08, CEPH.y + 0.55, CEPH.z - 0.02))
    tip = base + Vector((s * 0.01, 0.16, -0.20))
    tube(base, tip, 0.075, 0.05, M_CHITIN, "body")
    tube(tip, tip + Vector((-s * 0.04, 0.02, -0.10)), 0.03, 0.004, M_FANG, "body", 8)

# ---------------------------------------------------------------- legs
# (forward angle from the side axis in degrees, length scale)
LEG_LAYOUT = [(58, 1.18), (22, 1.0), (-18, 0.92), (-52, 1.12)]
legs = []   # dicts with bone name, side, horizontal direction

for side_name, s in (("L", -1), ("R", 1)):
    for k, (ang, ln) in enumerate(LEG_LAYOUT):
        a = math.radians(ang)
        d = Vector((s * math.cos(a), math.sin(a), 0)).normalized()
        root = CEPH + Vector((s * 0.36, 0.22 - k * 0.15, -0.05))
        p1 = root + d * 0.75 * ln + Vector((0, 0, 0.58))          # femur up to the "knee"
        p2 = p1 + d * 0.78 * ln + Vector((0, 0, -0.18))           # patella + tibia
        p3 = p2 + d * 0.62 * ln + Vector((0, 0, -0.62))           # metatarsus down
        p4 = p3 + d * 0.22 * ln + Vector((0, 0, -0.26))           # tarsus to the ground
        bone = f"leg_{side_name}{k + 1}"
        r = 0.065
        tube(root, p1, r * 1.1, r * 0.9, M_CHITIN, bone)
        sphere(p1, (r * 0.95,) * 3, M_BAND, bone, 14, 8)
        tube(p1, p2, r * 0.85, r * 0.7, M_CHITIN, bone)
        tube(p2 - (p2 - p1).normalized() * 0.12, p2, r * 0.72, r * 0.72, M_BAND, bone)
        sphere(p2, (r * 0.72,) * 3, M_CHITIN, bone, 14, 8)
        tube(p2, p3, r * 0.6, r * 0.45, M_CHITIN, bone)
        tube(p3 - (p3 - p2).normalized() * 0.1, p3, r * 0.47, r * 0.47, M_BAND, bone)
        tube(p3, p4, r * 0.42, r * 0.18, M_CHITIN, bone)
        sphere(root, (r * 1.2,) * 3, M_CHITIN, bone, 14, 8)
        spines(root, p1, r, 16, bone, 0.10)
        spines(p1, p2, r * 0.8, 14, bone, 0.09)
        spines(p2, p3, r * 0.55, 10, bone, 0.07)
        spines(p3, p4, r * 0.35, 4, bone, 0.05)
        legs.append({"bone": bone, "side": s, "dir": d, "root": root, "group": (k + (0 if s < 0 else 1)) % 2})

# pedipalps
for side_name, s in (("L", -1), ("R", 1)):
    root = CEPH + Vector((s * 0.13, 0.55, -0.04))
    p1 = root + Vector((s * 0.12, 0.25, 0.12))
    p2 = p1 + Vector((s * 0.05, 0.22, -0.16))
    bone = f"palp_{side_name}"
    tube(root, p1, 0.05, 0.042, M_CHITIN, bone)
    tube(p1, p2, 0.042, 0.05, M_CHITIN, bone)
    sphere(p2, (0.055, 0.07, 0.05), M_BAND, bone, 12, 6)
    spines(root, p1, 0.045, 3, bone, 0.07)

# ---------------------------------------------------------------- join + vertex groups
for obj, bone in parts:
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")

bpy.ops.object.select_all(action="DESELECT")
for obj, _ in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0][0]
bpy.ops.object.join()
spider = bpy.context.active_object
spider.name = "SpiderMesh"

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "Spider"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
root_b = eb[0]
root_b.name = "root"
root_b.head, root_b.tail = (0, 0, 0), (0, 0.4, 0)

body_b = eb.new("body")
body_b.head, body_b.tail = CEPH, CEPH + Vector((0, 0.4, 0))
body_b.parent = root_b

abd_b = eb.new("abdomen")
abd_b.head, abd_b.tail = Vector((0, -0.15, 0.52)), Vector((0, -0.6, 0.52))
abd_b.parent = body_b

for L in legs:
    b = eb.new(L["bone"])
    b.head = L["root"]
    b.tail = L["root"] + Vector((0, 0, 0.25))
    b.parent = body_b
for side_name, s in (("L", -1), ("R", 1)):
    b = eb.new(f"palp_{side_name}")
    b.head = CEPH + Vector((s * 0.13, 0.55, -0.04))
    b.tail = b.head + Vector((0, 0, 0.15))
    b.parent = body_b
bpy.ops.object.mode_set(mode="OBJECT")

spider.parent = arm
mod = spider.modifiers.new("Armature", "ARMATURE")
mod.object = arm

# ---------------------------------------------------------------- animation helpers
def local_axis(pb, world_axis):
    return (pb.bone.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()

pose = arm.pose.bones
for pb in pose:
    pb.rotation_mode = "QUATERNION"

def key_rot(pb, q, f):
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)

def leg_quat(L, swing, lift):
    pb = pose[L["bone"]]
    d = L["dir"]
    q_swing = Quaternion(local_axis(pb, (0, 0, 1)), L["side"] * swing)       # + = foot forward
    q_lift = Quaternion(local_axis(pb, (-d.y, d.x, 0)), -lift)                 # + lift = foot up
    return q_swing @ q_lift

def new_action(name):
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    return act

def push_to_nla(act):
    ad = arm.animation_data
    track = ad.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, int(act.frame_range[0]), act)
    strip.name = act.name
    ad.action = None

# ---------------------------------------------------------------- WALK (30 frames loop)
WALK_LEN = 30
walk = new_action("Walk")
A, LIFT, SWING_FRAC = 0.30, 0.42, 0.42
for f in range(0, WALK_LEN + 1, 2):
    u0 = f / WALK_LEN
    for L in legs:
        u = (u0 + 0.5 * L["group"]) % 1.0
        if u < SWING_FRAC:
            t = u / SWING_FRAC
            e = t * t * (3 - 2 * t)
            swing = -A + 2 * A * e
            lift = math.sin(math.pi * t) * LIFT
        else:
            t = (u - SWING_FRAC) / (1 - SWING_FRAC)
            swing = A - 2 * A * t
            lift = 0.0
        key_rot(pose[L["bone"]], leg_quat(L, swing, lift), f)
    # body bobs twice per cycle, abdomen lags and sways
    pb = pose["body"]
    pb.location = (0, 0, 0.035 * math.sin(4 * math.pi * u0))
    pb.keyframe_insert("location", frame=f)
    key_rot(pose["abdomen"], Quaternion(local_axis(pose["abdomen"], (0, 0, 1)), 0.05 * math.sin(2 * math.pi * u0 - 0.6)), f)
    for s_name, s in (("L", -1), ("R", 1)):
        key_rot(pose[f"palp_{s_name}"], Quaternion(local_axis(pose[f"palp_{s_name}"], (1, 0, 0)), 0.25 * math.sin(2 * math.pi * u0 + (0 if s < 0 else math.pi))), f)
push_to_nla(walk)

# ---------------------------------------------------------------- IDLE (90 frames loop)
IDLE_LEN = 90
idle = new_action("Idle")
twitchers = {legs[0]["bone"]: 0.0, legs[4]["bone"]: 0.45}   # front legs feel the surface
for f in range(0, IDLE_LEN + 1, 3):
    u0 = f / IDLE_LEN
    for L in legs:
        if L["bone"] in twitchers:
            ph = (u0 + twitchers[L["bone"]]) % 1.0
            tap = max(0.0, math.sin(2 * math.pi * ph * 2)) ** 3
            key_rot(pose[L["bone"]], leg_quat(L, 0.06 * tap, 0.30 * tap), f)
        else:
            key_rot(pose[L["bone"]], leg_quat(L, 0.015 * math.sin(2 * math.pi * u0 + L["root"].y), 0.0), f)
    pb = pose["abdomen"]
    pb.scale = (1, 1 + 0.025 * math.sin(2 * math.pi * u0 * 2), 1 + 0.02 * math.sin(2 * math.pi * u0 * 2))
    pb.keyframe_insert("scale", frame=f)
    pb = pose["body"]
    pb.location = (0, 0, 0.01 * math.sin(2 * math.pi * u0))
    pb.keyframe_insert("location", frame=f)
    for s_name, s in (("L", -1), ("R", 1)):
        key_rot(pose[f"palp_{s_name}"], Quaternion(local_axis(pose[f"palp_{s_name}"], (1, 0, 0)), 0.35 * math.sin(2 * math.pi * u0 * 3 + (0 if s < 0 else math.pi))), f)
push_to_nla(idle)

# ---------------------------------------------------------------- export
glb = os.path.join(OUT_DIR, "spider.glb")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=glb,
    export_format="GLB",
    export_animation_mode="NLA_TRACKS",
    export_skins=True,
    export_yup=True,
    export_apply=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
)
print("EXPORTED", glb, os.path.getsize(glb))

# ---------------------------------------------------------------- previews
if PREVIEW:
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    world = bpy.data.worlds.new("W")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.05, 0.03, 0.08, 1)
    bg.inputs[1].default_value = 0.6

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(make_mat("Floor", (0.35, 0.33, 0.38), rough=0.6))

    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6), rotation=(math.radians(35), math.radians(-25), 0))
    bpy.context.active_object.data.energy = 3.5
    bpy.ops.object.light_add(type="AREA", location=(-3, 3, 4))
    bpy.context.active_object.data.energy = 600
    bpy.context.active_object.data.color = (1.0, 0.6, 0.3)

    # play the walk for the preview
    arm.animation_data.nla_tracks["Idle"].mute = True
    scene.frame_set(7)

    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(loc, target, name):
        cam.location = loc
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")
        scene.render.filepath = os.path.join(OUT_DIR, name)
        bpy.ops.render.render(write_still=True)

    shoot((0, -0.3, 8.0), (0, -0.3, 0), "spider_top.png")
    shoot((0.2, -1.0, 3.2), (0, -0.7, 0.6), "spider_close.png")
    shoot((4.2, -5.0, 3.4), (0, -0.2, 0.4), "spider_34.png")
    print("PREVIEWS DONE")
