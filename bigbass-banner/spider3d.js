/* ============================================================
   3D spider that crawls on the screen glass, over the whole page.
   - assets/spider.glb is built by tools/build_spider.py (Blender)
   - a fixed, click-through WebGL canvas; the camera looks straight
     down at a plane that matches the viewport 1:1 (1 unit = 1 CSS px),
     so the spider lives "on the display", not in the page
   - two spiders, each with its own route and temperament; they stay on
     screen, wander in bursts, pause, avoid each other and run from the cursor
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const THREE_VERSION = '0.170.0';
const MODEL_URL = 'assets/spider.glb';
const STORE_KEY = 'bb-spider-off';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const readOff = () => { try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; } };
const writeOff = v => { try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/* ---------- styles + on/off toggle (arachnophobia friendly) ---------- */
const style = document.createElement('style');
style.textContent = `
  .spider-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 60; pointer-events: none; }
  .spider-cta {
    position: fixed; left: 0; top: 0; z-index: 61;
    height: 46px; padding: 0 22px; font-size: 16px;
    transform-origin: 50% 0; will-change: transform;
  }
  .spider-cta::before {                 /* silk knot */
    content: ""; position: absolute; left: 50%; top: -3px; width: 7px; height: 7px; margin-left: -3.5px;
    border-radius: 50%; background: #f1ecff; box-shadow: 0 0 6px rgba(255,255,255,.8);
  }
  .spider-toggle {
    position: fixed; left: 16px; bottom: 16px; z-index: 61;
    width: 44px; height: 44px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer;
    background: rgba(20,10,34,.85); border: 1px solid rgba(255,138,28,.5);
    box-shadow: 0 8px 20px rgba(0,0,0,.5), 0 0 18px rgba(255,110,0,.25);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    transition: transform .25s cubic-bezier(.2,.9,.3,1.25), opacity .25s;
  }
  .spider-toggle:hover { transform: scale(1.08) rotate(-8deg); }
  .spider-toggle:focus-visible { outline: 3px solid #b45cff; outline-offset: 3px; }
  .spider-toggle svg { width: 26px; height: 22px; filter: brightness(0) invert(.9) sepia(.5) drop-shadow(0 0 4px rgba(255,140,40,.8)); }
  .spider-toggle[aria-pressed="false"] { opacity: .55; }
  .spider-toggle[aria-pressed="false"]::after {
    content: ""; position: absolute; width: 30px; height: 2px; border-radius: 2px;
    background: #ff8a1c; rotate: -45deg;
  }
`;
document.head.appendChild(style);

const toggle = document.createElement('button');
toggle.className = 'spider-toggle';
toggle.type = 'button';
toggle.innerHTML = '<svg viewBox="0 0 60 50" aria-hidden="true"><use href="#spider"/></svg>';
document.body.appendChild(toggle);

let crawler = null;
let enabled = !readOff() && !reduceMotion;

function syncToggle() {
  toggle.setAttribute('aria-pressed', String(enabled));
  toggle.setAttribute('aria-label', enabled ? 'Απόκρυψη αραχνών' : 'Εμφάνιση αραχνών');
  toggle.title = toggle.getAttribute('aria-label');
}
syncToggle();

toggle.addEventListener('click', async () => {
  enabled = !enabled;
  writeOff(!enabled);
  syncToggle();
  if (enabled) {
    crawler ??= await createCrawler().catch(() => null);
    crawler?.show();
  } else {
    crawler?.hide();
  }
});

if (enabled) {
  // let the hero animations play first, then load the model while the browser is idle
  const start = () => createCrawler().then(c => { crawler = c; if (enabled) c.show(); }).catch(err => console.warn('spider:', err));
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(start) : start()), 2500);
}

/* ============================================================ */
async function createCrawler() {
  const canvas = document.createElement('canvas');
  canvas.className = 'spider-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  // camera looks straight down at the y = 0 plane; screen (x, y) == world (x, 0, y)
  const camera = new THREE.PerspectiveCamera(38, 1, 10, 20000);
  camera.up.set(0, 0, -1);

  scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x1a0d10, 1.4));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.6);          // warm moon/lantern light, upper left
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rim = new THREE.PointLight(0xff7a1a, 1.2, 0, 0);          // pumpkin glow from below right
  scene.add(rim);

  // the glass: shows only the spider's shadow over the page
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42 }));
  glass.rotation.x = -Math.PI / 2;
  glass.receiveShadow = true;
  scene.add(glass);

  /* ---------- model (loaded once, cloned per spider) ---------- */
  const draco = new DRACOLoader().setDecoderPath(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/libs/draco/gltf/`);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(MODEL_URL);
  const baseBox = new THREE.Box3().setFromObject(gltf.scene);
  const baseSpan = Math.max(baseBox.max.x - baseBox.min.x, baseBox.max.z - baseBox.min.z);
  const clip = name => gltf.animations.find(a => a.name.toLowerCase().includes(name)) ?? gltf.animations[0];

  /* Routes are loops of waypoints in 0..1 screen space, so they scale with the viewport.
     A: big and calm, patrols clockwise around the edges of the screen.
     B: smaller and twitchy, zig-zags through the middle. */
  const PROFILES = [
    {
      span: coarse ? 110 : 160, cruise: [70, 140], slow: [10, 30], pauseChance: 0.35, pause: [1.5, 3.5],
      route: [[0.12, 0.2], [0.5, 0.12], [0.88, 0.2], [0.9, 0.55], [0.85, 0.86], [0.5, 0.9], [0.12, 0.84], [0.1, 0.5]],
    },
    {
      span: coarse ? 80 : 115, cruise: [110, 210], slow: [15, 45], pauseChance: 0.25, pause: [0.6, 2.0],
      route: [[0.7, 0.75], [0.3, 0.35], [0.55, 0.55], [0.25, 0.7], [0.68, 0.3], [0.45, 0.5]],
    },
  ];

  const spiders = PROFILES.map((profile, idx) => {
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;   // skinned bounds don't follow the animation
      }
    });
    const scale = profile.span / baseSpan;
    model.scale.setScalar(scale);
    model.position.y = -baseBox.min.y * scale;   // feet on the glass
    const rig = new THREE.Group();
    rig.add(model);
    scene.add(rig);

    const mixer = new THREE.AnimationMixer(model);
    const walk = mixer.clipAction(clip('walk'));
    const idle = mixer.clipAction(clip('idle'));
    walk.play();
    idle.play();
    idle.time = idx * 1.3;   // don't breathe in sync

    return {
      profile, model, rig, mixer, walk, idle,
      radius: profile.span / 2,
      stride: profile.span * 0.36,       // px covered by one walk cycle
      x: 0, y: 0, heading: 0, speed: 0,
      mode: 'route',                     // route | pause | flee
      wp: 0, target: { x: 0, y: 0 },
      timer: 0, burst: 0, burstSpeed: 80,
    };
  });


  /* ---------- the CTA the big spider drags on a silk thread ---------- */
  // a real, clickable link (not part of the WebGL scene); the silk is drawn in 3D
  const ROPE = coarse ? 55 : 85;
  const cta = document.createElement('a');
  cta.className = 'btn-pumpkin spider-cta';
  cta.href = '#';
  cta.innerHTML = '<span>ΠΑΡΕ ΤΑ ΔΩΡΑ</span> <b aria-hidden="true">›</b>';
  let ctaW = 0, ctaH = 0;

  const silk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 1, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xeee8ff, transparent: true, opacity: 0.85 }),
  );
  scene.add(silk);

  const hook = { x: 0, y: 0, angle: 0 };
  const carrier = spiders[0];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  // hovering the button makes the spider hold still so it is easy to click
  cta.addEventListener('pointerenter', () => { carrier.held = true; });
  cta.addEventListener('pointerleave', () => { carrier.held = false; });
  cta.addEventListener('focus', () => { carrier.held = true; });
  cta.addEventListener('blur', () => { carrier.held = false; });
  const nearCta = (x, y) => Math.hypot(x - hook.x, y - (hook.y + ctaH / 2)) < ctaW * 0.85;

  function measureCta() {
    ctaW = cta.offsetWidth;
    ctaH = cta.offsetHeight;
  }
  function resetSign() {
    hook.x = carrier.x - Math.cos(carrier.heading) * (carrier.radius + ROPE);
    hook.y = carrier.y - Math.sin(carrier.heading) * (carrier.radius + ROPE);
    hook.angle = 0;
  }

  function dragSign(dt) {
    // silk leaves the spinnerets at the tip of the abdomen
    const ax = carrier.x - Math.cos(carrier.heading) * carrier.radius * 0.72;
    const ay = carrier.y - Math.sin(carrier.heading) * carrier.radius * 0.72;
    let dx = ax - hook.x, dy = ay - hook.y;
    const d = Math.hypot(dx, dy);
    if (d > ROPE) {                                  // taut: the spider pulls the button along
      hook.x = ax - (dx / d) * ROPE;
      hook.y = ay - (dy / d) * ROPE;
    }
    // keep the button on the glass
    hook.x = clamp(hook.x, ctaW / 2 + 8, W - ctaW / 2 - 8);
    hook.y = clamp(hook.y, TOP, H - ctaH - 10);

    // it swings toward the pull but stays readable
    dx = ax - hook.x; dy = ay - hook.y;
    const want = clamp(Math.atan2(dx, -dy), -0.3, 0.3);
    hook.angle += (want - hook.angle) * Math.min(1, dt * 4);
    cta.style.transform = `translate(${hook.x - ctaW / 2}px, ${hook.y}px) rotate(${-hook.angle}rad)`;

    // stretch the silk between spinnerets and the button's knot
    _a.set(ax, carrier.radius * 0.35, ay);
    _b.set(hook.x, 0, hook.y + 3);
    silk.position.copy(_a).add(_b).multiplyScalar(0.5);
    silk.scale.set(1, Math.max(_a.distanceTo(_b), 0.001), 1);
    silk.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
  }

  /* ---------- layout ---------- */
  let W = 0, H = 0;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(W / 2, dist, H / 2);
    camera.lookAt(W / 2, 0, H / 2);
    camera.near = dist * 0.5;
    camera.far = dist * 1.5;
    camera.updateProjectionMatrix();
    glass.scale.set(W * 3, H * 3, 1);
    glass.position.set(W / 2, 0, H / 2);

    // one shadow camera covering the whole screen, light from the upper left
    key.position.set(W / 2 - 260, 700, H / 2 - 340);
    key.target.position.set(W / 2, 0, H / 2);
    const sc = key.shadow.camera;
    const half = Math.max(W, H) * 0.62;
    sc.left = sc.bottom = -half;
    sc.right = sc.top = half;
    sc.near = 100; sc.far = 2000;
    sc.updateProjectionMatrix();
    rim.position.set(W * 0.85, 160, H * 0.9);

    for (const sp of spiders) clampToScreen(sp);
    if (cta.isConnected) measureCta();
  }

  /* ---------- behaviour ---------- */
  const pointer = { x: -9999, y: -9999, t: 0 };
  const TOP = 50;                                   // keep clear of the header
  const margin = sp => sp.radius * 0.55;
  function clampToScreen(sp) {
    const m = margin(sp);
    sp.x = clamp(sp.x, m, Math.max(m, W - m));
    sp.y = clamp(sp.y, m + TOP, Math.max(m + TOP, H - m));
  }
  function waypoint(sp, i) {
    const [u, v] = sp.profile.route[i % sp.profile.route.length];
    const m = sp.radius + 20;
    return {
      x: clamp(u * W + rand(-40, 40), m, W - m),
      y: clamp(v * H + rand(-30, 30), m + TOP, H - m),
    };
  }
  function nextWaypoint(sp) {
    sp.wp = (sp.wp + 1) % sp.profile.route.length;
    sp.target = waypoint(sp, sp.wp);
    sp.mode = 'route';
  }
  function nearestWaypoint(sp) {
    let best = 0, bestD = Infinity;
    sp.profile.route.forEach(([u, v], i) => {
      const d = Math.hypot(u * W - sp.x, v * H - sp.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    sp.wp = best;
    sp.target = waypoint(sp, best);
    sp.mode = 'route';
  }
  function scare(sp, fromX, fromY) {
    sp.mode = 'flee';
    sp.timer = rand(0.6, 1.0);
    const a = Math.atan2(sp.y - fromY, sp.x - fromX) + rand(-0.5, 0.5);
    sp.target = { x: sp.x + Math.cos(a) * 400, y: sp.y + Math.sin(a) * 400 };
  }
  function place() {
    spiders.forEach((sp, i) => {
      sp.wp = i === 0 ? 0 : 1;
      const p = waypoint(sp, sp.wp);
      sp.x = p.x; sp.y = p.y;
      sp.speed = 0;
      nextWaypoint(sp);
      sp.heading = Math.atan2(sp.target.y - sp.y, sp.target.x - sp.x);
    });
    resetSign();
  }

  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now(); }, { passive: true });
  addEventListener('pointerdown', e => {
    for (const sp of spiders) {
      if (Math.hypot(e.clientX - sp.x, e.clientY - sp.y) < sp.radius * 1.5) scare(sp, e.clientX, e.clientY);
    }
  }, { passive: true });

  resize();
  addEventListener('resize', resize);

  function step(sp, other, dt) {
    const p = sp.profile;
    let desired = sp.speed;
    let turnRate = 3.2;

    if (sp.held) {                                     // someone is about to click the CTA
      sp.speed += (0 - sp.speed) * Math.min(1, dt * 12);
      return;
    }
    const pd = Math.hypot(pointer.x - sp.x, pointer.y - sp.y);
    const reaching = sp === carrier && nearCta(pointer.x, pointer.y);
    if (sp.mode !== 'flee' && !reaching && pd < sp.radius + 70 && performance.now() - pointer.t < 600) scare(sp, pointer.x, pointer.y);

    if (sp.mode === 'route') {
      // spiders move in bursts: run, slow down, run
      sp.burst -= dt;
      if (sp.burst <= 0) {
        const fast = Math.random() < 0.65;
        sp.burst = fast ? rand(0.35, 1.0) : rand(0.2, 0.6);
        sp.burstSpeed = fast ? rand(...p.cruise) : rand(...p.slow);
      }
      desired = sp.burstSpeed;
      if (Math.hypot(sp.target.x - sp.x, sp.target.y - sp.y) < 26) {
        if (Math.random() < p.pauseChance) { sp.mode = 'pause'; sp.timer = rand(...p.pause); }
        else nextWaypoint(sp);
      }
    } else if (sp.mode === 'pause') {
      desired = 0;
      sp.timer -= dt;
      if (sp.timer <= 0) nextWaypoint(sp);
    } else if (sp.mode === 'flee') {
      desired = 340;
      turnRate = 7;
      sp.timer -= dt;
      if (sp.timer <= 0) nearestWaypoint(sp);
    }

    // steer toward the target, bending away from the other spider when close
    let want = Math.atan2(sp.target.y - sp.y, sp.target.x - sp.x);
    const od = Math.hypot(other.x - sp.x, other.y - sp.y);
    const personal = (sp.radius + other.radius) * 1.15;
    if (od < personal * 1.6) {
      const away = Math.atan2(sp.y - other.y, sp.x - other.x);
      const t = 1 - clamp((od - personal) / (personal * 0.6), 0, 1);
      want += angleDiff(want, away) * t * 0.85;
      if (sp.mode === 'pause' && od < personal) nextWaypoint(sp);   // shuffle aside
    }
    if (sp.mode !== 'pause') {
      const diff = angleDiff(sp.heading, want);
      sp.heading += clamp(diff, -turnRate * dt, turnRate * dt);
      desired *= 1 - Math.min(0.75, Math.abs(diff) / Math.PI);       // slow down for sharp turns
    }
    sp.speed += (desired - sp.speed) * Math.min(1, dt * (desired > sp.speed ? 7 : 10));
    sp.x += Math.cos(sp.heading) * sp.speed * dt;
    sp.y += Math.sin(sp.heading) * sp.speed * dt;

    // always on the glass: hitting an edge sends it back onto its route
    const m = margin(sp);
    if (sp.x < m || sp.x > W - m || sp.y < m + TOP || sp.y > H - m) {
      clampToScreen(sp);
      if (sp.mode === 'flee') nearestWaypoint(sp);
    }
  }

  function animate(sp, dt) {
    // blend idle <-> walk by speed and match leg speed to ground speed
    const w = clamp(sp.speed / 30, 0, 1);
    sp.walk.setEffectiveWeight(w);
    sp.idle.setEffectiveWeight(1 - w);
    sp.walk.timeScale = Math.max(0.35, sp.speed / sp.stride);
    sp.mixer.update(dt);
    sp.rig.position.set(sp.x, 0, sp.y);
    // model faces -Z; screen heading a -> rotation.y = atan2(-cos a, -sin a)
    sp.rig.rotation.y = Math.atan2(-Math.cos(sp.heading), -Math.sin(sp.heading));
  }

  // ?spider-debug exposes the state so it can be inspected from the console
  if (new URLSearchParams(location.search).has('spider-debug')) Object.assign(window, { __spiders: spiders, __cta: { cta, hook } });

  const clock = new THREE.Clock();
  let visible = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!visible) return;
    step(spiders[0], spiders[1], dt);
    step(spiders[1], spiders[0], dt);
    for (const sp of spiders) animate(sp, dt);
    dragSign(dt);
    renderer.render(scene, camera);
  });

  return {
    show() {
      if (!canvas.isConnected) document.body.appendChild(canvas);
      if (!cta.isConnected) document.body.appendChild(cta);
      measureCta();
      visible = true;
      clock.getDelta();
      place();
    },
    hide() {
      visible = false;
      canvas.remove();
      cta.remove();
    },
  };
}

