/* ============================================================
   Halloween Bonanza creatures (Three.js)
   1. BATS  — 4-6 fast bats at a time (2-3 on phones) dart across the whole screen on
              erratic routes with flutter and speed bursts: small and large, fast and slow, flapping
              or gliding. Fixed, click-through canvas over the page;
              the camera looks straight down so 1 unit = 1 CSS px.
   2. GHOSTS — shared floating sheet ghosts with a devilish grin.
   Models: assets/bat.glb and ../halloween-ro/assets/ghost.glb
   ============================================================ */
import * as THREE from 'three';
import '../halloween-poster/ghosts.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const THREE_VERSION = '0.170.0';
const STORE_KEY = 'hb-bats-off';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const readOff = () => { try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; } };
const writeOff = v => { try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

const draco = new DRACOLoader().setDecoderPath(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/libs/draco/gltf/`);
const loader = new GLTFLoader().setDRACOLoader(draco);
const clipNamed = (gltf, name) => gltf.animations.find(a => a.name.toLowerCase().includes(name)) ?? gltf.animations[0];

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.2;
  return r;
}
function addEnvironment(renderer, scene, intensity) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = intensity;
}

/* ============================================================
   1. BATS
   ============================================================ */
const style = document.createElement('style');
style.textContent = `
  .bats-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 60; pointer-events: none; }
  .bats-toggle {
    position: fixed; left: 16px; bottom: 16px; z-index: 61;
    width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    background: rgba(20,10,34,.85); border: 1px solid rgba(98,209,79,.55); color: #c9f7a0;
    box-shadow: 0 8px 20px rgba(0,0,0,.5), 0 0 18px rgba(255,110,0,.25);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    transition: transform .25s cubic-bezier(.2,.9,.3,1.25), opacity .25s;
  }
  .bats-toggle:hover { transform: scale(1.08) rotate(-8deg); }
  .bats-toggle:focus-visible { outline: 3px solid #b45cff; outline-offset: 3px; }
  .bats-toggle svg { width: 28px; height: 16px; fill: currentColor; }
  .bats-toggle[aria-pressed="false"] { opacity: .55; }
  .bats-toggle[aria-pressed="false"]::after { content: ""; position: absolute; width: 30px; height: 2px; border-radius: 2px; background: #ff8a1c; rotate: -45deg; }
`;
document.head.appendChild(style);

const toggle = document.createElement('button');
toggle.className = 'bats-toggle';
toggle.type = 'button';
toggle.innerHTML = '<svg viewBox="0 0 100 50" aria-hidden="true"><path d="M50 18c-3-6-8-8-12-6 1-5-4-9-9-9 2 3 1 6-1 7-6-5-16-6-28 0 8 2 12 8 12 16 4-3 9-3 12 1 2-4 7-5 10-2 2-4 6-5 9-3 2-3 5-4 7-4 2 0 5 1 7 4 3-2 7-1 9 3 3-3 8-2 10 2 3-4 8-4 12-1 0-8 4-14 12-16-12-6-22-5-28 0-2-1-3-4-1-7-5 0-10 4-9 9-4-2-9 0-12 6z"/></svg>';
document.body.appendChild(toggle);

let bats = null;
let batsOn = !readOff() && !reduceMotion;
function syncToggle() {
  toggle.setAttribute('aria-pressed', String(batsOn));
  toggle.setAttribute('aria-label', batsOn ? 'Απόκρυψη νυχτερίδων' : 'Εμφάνιση νυχτερίδων');
  toggle.title = toggle.getAttribute('aria-label');
}
syncToggle();
toggle.addEventListener('click', async () => {
  batsOn = !batsOn;
  writeOff(!batsOn);
  syncToggle();
  if (batsOn) { bats ??= await createBats().catch(() => null); bats?.show(); }
  else bats?.hide();
});
if (batsOn) {
  const start = () => createBats().then(b => { bats = b; if (batsOn) b.show(); }).catch(err => console.warn('bats:', err));
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(start) : start()), 1800);
}

async function createBats() {
  const canvas = document.createElement('canvas');
  canvas.className = 'bats-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = makeRenderer(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  addEnvironment(renderer, scene, 0.3);
  const camera = new THREE.PerspectiveCamera(38, 1, 10, 20000);
  camera.up.set(0, 0, -1);                                    // screen up == -Z

  scene.add(new THREE.HemisphereLight(0xc9b6ff, 0x1a0d10, 0.7));
  const key = new THREE.DirectionalLight(0xffd6a8, 1.8);      // warm light from the upper left
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rim = new THREE.PointLight(0xff7a1a, 1.4, 0, 0);
  scene.add(rim);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3 }));
  glass.rotation.x = -Math.PI / 2;
  glass.receiveShadow = true;
  scene.add(glass);

  const gltf = await loader.loadAsync('assets/bat.glb');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const baseSpan = box.max.x - box.min.x;

  /* ---------- pool of bats (max 5 on screen) ---------- */
  const MAX = small ? 3 : 6;
  const pool = Array.from({ length: MAX }, () => {
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      // night-time bats: keep the membranes dark so they read as silhouettes against the sky
      o.material = o.material.clone();
      if (o.material.name !== 'Eye') o.material.color.multiplyScalar(o.material.vertexColors ? 0.16 : 0.5);
      if (o.material.vertexColors) o.material.roughness = 0.85;   // matte leather, no beige sheen from above
      o.material.envMapIntensity = 0.25;
    });
    const rig = new THREE.Group();
    rig.add(model);
    rig.visible = false;
    scene.add(rig);
    const mixer = new THREE.AnimationMixer(model);
    const flap = mixer.clipAction(clipNamed(gltf, 'flap'));
    const glide = mixer.clipAction(clipNamed(gltf, 'glide'));
    flap.play(); glide.play();
    return { model, rig, mixer, flap, glide, active: false };
  });

  let W = 0, H = 0;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(W / 2, dist, H / 2);
    camera.lookAt(W / 2, 0, H / 2);
    camera.near = dist * 0.3; camera.far = dist * 1.5;
    camera.updateProjectionMatrix();
    glass.scale.set(W * 3, H * 3, 1);
    glass.position.set(W / 2, 0, H / 2);
    key.position.set(W / 2 - 300, 900, H / 2 - 400);
    key.target.position.set(W / 2, 0, H / 2);
    const sc = key.shadow.camera, half = Math.max(W, H) * 0.65;
    sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.near = 100; sc.far = 2600;
    sc.updateProjectionMatrix();
    rim.position.set(W * 0.8, 260, H * 0.9);
  }
  resize();
  addEventListener('resize', resize);

  const pointer = { x: -9999, y: -9999 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  /* ---------- routes: a cubic curve from one screen edge to another ---------- */
  function edgePoint(side, m) {
    if (side === 0) return new THREE.Vector2(rand(-m, W + m), -m);
    if (side === 1) return new THREE.Vector2(W + m, rand(-m, H + m));
    if (side === 2) return new THREE.Vector2(rand(-m, W + m), H + m);
    return new THREE.Vector2(-m, rand(-m, H + m));
  }
  function launch(b) {
    const fast = true;                                        // bats are never slow: every one darts
    b.span = small ? rand(38, 100) : rand(50, 170);          // wingspan in px: small to large
    b.speed = rand(460, 860);                                 // px per second
    b.fast = fast;
    b.alt = rand(30, 240);                                    // height above the glass (closer = bigger)
    const m = b.span;
    const s0 = Math.floor(rand(0, 4));
    let s1 = Math.floor(rand(0, 4));
    if (s1 === s0) s1 = (s0 + 2) % 4;
    const p0 = edgePoint(s0, m), p3 = edgePoint(s1, m);
    // an erratic route: 2-5 random waypoints between the edges
    const inner = Array.from({ length: Math.floor(rand(2, 6)) }, () => new THREE.Vector2(rand(W * 0.05, W * 0.95), rand(H * 0.05, H * 0.95)));
    b.curve = new THREE.SplineCurve([p0, ...inner, p3]);
    b.flutterAmp = rand(6, fast ? 34 : 18);                   // side-to-side jitter of a real bat
    b.flutterFreq = rand(6, 15);
    b.burstT = 0; b.burstMul = 1;
    b.length = b.curve.getLength();
    b.u = 0;                                                  // arc-length progress 0..1
    b.boost = 0;
    b.mode = 'flap'; b.modeT = rand(0.6, 1.4);
    b.heading = 0; b.roll = 0; b.bob = rand(0, 10);
    b.model.scale.setScalar(b.span / baseSpan);
    b.rig.visible = true;
    b.active = true;
    const tan = b.curve.getTangentAt(0);
    b.heading = Math.atan2(tan.y, tan.x);
  }

  let target = small ? 2 : Math.floor(rand(4, 7));          // how many bats should be up right now
  let spawnIn = 0;

  function update(dt) {
    const active = pool.filter(b => b.active);
    spawnIn -= dt;
    if (active.length < target && spawnIn <= 0) {
      const free = pool.find(b => !b.active);
      if (free) launch(free);
      spawnIn = rand(0.05, 0.45);
    }

    for (const b of pool) {
      if (!b.active) continue;
      const pos = b.curve.getPointAt(b.u);
      // a hand reaching toward a bat makes it dart away faster
      if (Math.hypot(pointer.x - pos.x, pointer.y - pos.y) < b.span * 0.9 + 60) b.boost = 0.8;
      b.boost = Math.max(0, b.boost - dt);
      // random bursts: bats speed up and brake all the time
      b.burstT -= dt;
      if (b.burstT <= 0) { b.burstT = rand(0.25, 0.9); b.burstMul = rand(0.85, 1.5); }   // never drops to a crawl
      b.curMul = (b.curMul ?? 1) + (b.burstMul - (b.curMul ?? 1)) * Math.min(1, dt * 4);
      const v = b.speed * b.curMul * (b.boost > 0 ? 1.9 : 1);
      b.u += (v * dt) / b.length;
      if (b.u >= 1) {
        b.active = false;
        b.rig.visible = false;
        if (Math.random() < 0.4) target = small ? Math.floor(rand(2, 4)) : Math.floor(rand(4, 7));
        continue;
      }
      const p = b.curve.getPointAt(b.u);
      const tan = b.curve.getTangentAt(b.u);
      const h = Math.atan2(tan.y, tan.x);
      const turn = angleDiff(b.heading, h);
      b.heading = h;
      // a gentle bank into turns: enough to read as flight, never so much that one wing points up
      b.roll += (clamp(turn / Math.max(dt, 1e-3) * 0.06, -0.3, 0.3) - b.roll) * Math.min(1, dt * 3);

      // lazy bats alternate flapping and gliding; fast ones never stop flapping
      b.modeT -= dt;
      if (b.modeT <= 0) {
        b.mode = b.fast || b.mode === 'glide' ? 'flap' : (Math.random() < 0.5 ? 'glide' : 'flap');
        b.modeT = b.mode === 'glide' ? rand(0.5, 1.2) : rand(0.6, 1.6);
      }
      const gw = b.mode === 'glide' ? 1 : 0;
      const cur = b.glide.getEffectiveWeight();
      const w = cur + (gw - cur) * Math.min(1, dt * 6);
      b.glide.setEffectiveWeight(w);
      b.flap.setEffectiveWeight(1 - w);
      b.flap.timeScale = clamp(v / 220, 0.9, 2.4);
      b.mixer.update(dt);

      b.bob += dt * 3;
      const fl = Math.sin(b.bob * b.flutterFreq / 3) * b.flutterAmp;      // sideways flutter
      b.rig.position.set(p.x - tan.y * fl, b.alt + Math.sin(b.bob) * 14, p.y + tan.x * fl);
      // model faces -Z: screen heading a -> yaw = atan2(-cos a, -sin a); roll banks around the body
      b.rig.rotation.set(0, Math.atan2(-Math.cos(b.heading), -Math.sin(b.heading)), b.roll, 'YXZ');
    }
  }

  const clock = new THREE.Clock();
  let visible = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!visible) return;
    update(dt);
    renderer.render(scene, camera);
  });

  if (new URLSearchParams(location.search).has('creature-debug')) window.__bats = pool;

  return {
    show() { if (!canvas.isConnected) document.body.appendChild(canvas); visible = true; clock.getDelta(); },
    hide() { visible = false; canvas.remove(); pool.forEach(b => { b.active = false; b.rig.visible = false; }); },
  };
}
