/* Shared floating ghosts for Halloween RO and GR, with a mischievous grin. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const THREE_VERSION = '0.170.0';
const greek = document.documentElement.lang === 'el';
const STORE_KEY = greek ? 'hb-ghosts-off' : 'ro-ghosts-off';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const readOff = () => { try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; } };
const writeOff = v => { try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

const draco = new DRACOLoader().setDecoderPath(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/libs/draco/gltf/`);
const loader = new GLTFLoader().setDRACOLoader(draco);

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}
function addEnvironment(renderer, scene, intensity) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = intensity;
}

/* ============================================================
   1. GHOSTS
   ============================================================ */
const style = document.createElement('style');
style.textContent = `
  .ghosts-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 60; pointer-events: none; }
  .ghosts-toggle {
    position: fixed; left: ${greek ? 72 : 16}px; bottom: 16px; z-index: 61;
    width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    background: rgba(20,10,34,.85); border: 1px solid rgba(255,60,60,.55); color: #e8eeff;
    box-shadow: 0 8px 20px rgba(0,0,0,.5), 0 0 18px rgba(255,40,40,.25);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    transition: transform .25s cubic-bezier(.2,.9,.3,1.25), opacity .25s;
  }
  .ghosts-toggle:hover { transform: scale(1.08) rotate(-8deg); }
  .ghosts-toggle:focus-visible { outline: 3px solid #ffd23a; outline-offset: 3px; }
  .ghosts-toggle svg { width: 22px; height: 26px; fill: currentColor; }
  .ghosts-toggle[aria-pressed="false"] { opacity: .55; }
  .ghosts-toggle[aria-pressed="false"]::after { content: ""; position: absolute; width: 30px; height: 2px; border-radius: 2px; background: #ff4d4d; rotate: -45deg; }
`;
document.head.appendChild(style);

const toggle = document.createElement('button');
toggle.className = 'ghosts-toggle';
toggle.type = 'button';
toggle.innerHTML = '<svg viewBox="0 0 22 26" aria-hidden="true"><path fill-rule="evenodd" d="M11 0C5 0 1 4.5 1 10v14l3-2.5L7 24l2-2.5L11 24l2-2.5 2 2.5 3-2.5 3 2.5V10C21 4.5 17 0 11 0zM7.5 8a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zm7 0a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM6.5 14Q11 20 15.5 14Q11 16 6.5 14Z"/></svg>';
document.body.appendChild(toggle);

let ghosts = null;
let ghostsOn = !readOff() && !reduceMotion;
function syncToggle() {
  toggle.setAttribute('aria-pressed', String(ghostsOn));
  toggle.setAttribute('aria-label', greek ? (ghostsOn ? 'Απόκρυψη φαντασμάτων' : 'Εμφάνιση φαντασμάτων') : (ghostsOn ? 'Ascunde fantomele' : 'Arată fantomele'));
  toggle.title = toggle.getAttribute('aria-label');
}
syncToggle();
toggle.addEventListener('click', async () => {
  ghostsOn = !ghostsOn;
  writeOff(!ghostsOn);
  syncToggle();
  if (ghostsOn) { ghosts ??= await createGhosts().catch(() => null); ghosts?.show(); }
  else ghosts?.hide();
});
if (ghostsOn) {
  const start = () => createGhosts().then(g => { ghosts = g; if (ghostsOn) g.show(); }).catch(err => console.warn('ghosts:', err));
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(start) : start()), 1600);
}

function giveGhostGrin(root) {
  // Reshape the existing face geometry; keep the animated sheet and rig.
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'Hole') return;
    mesh.geometry = mesh.geometry.clone();
    const points = mesh.geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i);
      const y = points.getY(i);
      if (y < 1.335) {
        const side = clamp(x / .1, -1, 1);
        points.setXY(i, x * 2.8, 1.12 + (y - 1.18) * .32 + .13 * side * side);
      } else {
        const side = Math.sign(x);
        points.setY(i, 1.5 + (y - 1.5) * .52 + side * (x - side * .2) * .45);
      }
    }
    points.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
  root.userData.devilishSmile = true;
}

async function createGhosts() {
  const canvas = document.createElement('canvas');
  canvas.className = 'ghosts-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  addEnvironment(renderer, scene, 0.4);
  // orthographic camera in CSS px: x right, y down (world y = -screen y)
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -3000, 3000);
  camera.position.z = 1000;

  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a0a14, 1.6));
  const moon = new THREE.DirectionalLight(0xbfd0ff, 1.6);
  moon.position.set(-300, 600, 800);
  const ember = new THREE.DirectionalLight(0xff4a2a, 1.1);        // red underglow from the page
  ember.position.set(200, -500, 400);
  scene.add(moon, ember);

  const gltf = await loader.loadAsync(new URL('../halloween-ro/assets/ghost.glb', import.meta.url).href);
  giveGhostGrin(gltf.scene);
  const clip = gltf.animations[0];
  const MODEL_H = 2.1;

  const MAX = 2;
  const pool = Array.from({ length: MAX }, () => {
    const model = SkeletonUtils.clone(gltf.scene);
    const mats = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.depthWrite = false;
      mats.push({ m: o.material, base: o.material.opacity * (o.material.name === 'Sheet' ? 0.55 : 0.9) });   // see-through sheet
    });
    const rig = new THREE.Group();
    rig.add(model);
    rig.visible = false;
    scene.add(rig);
    const mixer = new THREE.AnimationMixer(model);
    const act = mixer.clipAction(clip);
    act.play();
    return { model, rig, mats, mixer, act, active: false };
  });

  let W = 0, H = 0;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  const pointer = { x: -9999, y: -9999 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  function launch(g) {
    g.h = g.big ? (small ? 120 : 190) : (small ? 60 : 85);       // one large ghost, one small
    const fromLeft = Math.random() < 0.5;
    g.dir = fromLeft ? 1 : -1;
    g.x = fromLeft ? -g.h : W + g.h;
    g.y0 = rand(H * 0.12, H * 0.8);
    g.vx = g.dir * rand(35, 130);                                 // lazy drifting
    g.amp = rand(18, 60);
    g.freq = rand(0.6, 1.4);
    g.t = rand(0, 10);
    g.life = 0;
    g.fade = 0;                                                   // 0..1 visibility
    g.swoop = Math.random() < 0.3 ? rand(3, 7) : Infinity;        // seconds until it flies at the viewer
    g.swoopK = 0;
    g.scared = 0;
    g.model.scale.setScalar(g.h / MODEL_H);
    g.model.position.y = -(g.h / 2);                              // pivot in the middle of the body
    g.act.timeScale = rand(0.8, 1.3);
    g.act.time = rand(0, 2);
    g.rig.visible = true;
    g.active = true;
  }

  let target = 2;
  let spawnIn = 0;
  pool.forEach((g, i) => { g.big = i === 0; });

  function setOpacity(g, k) {
    for (const { m, base } of g.mats) m.opacity = base * k;
  }

  function update(dt) {
    spawnIn -= dt;
    const active = pool.filter(g => g.active);
    if (active.length < target && spawnIn <= 0) {
      const free = pool.find(g => !g.active);
      if (free) launch(free);
      spawnIn = rand(0.6, 2.2);
    }
    for (const g of pool) {
      if (!g.active) continue;
      g.t += dt;
      g.life += dt;

      // the cursor scares a ghost: it bolts and turns see-through
      const d = Math.hypot(pointer.x - g.x, pointer.y - g.y);
      if (d < g.h * 0.8 + 50 && !g.scared) { g.scared = 1; g.vx = Math.sign(g.x - pointer.x || g.dir) * rand(380, 520); g.dir = Math.sign(g.vx); }

      g.x += g.vx * dt;
      g.y = g.y0 + Math.sin(g.t * g.freq * 2) * g.amp;
      const vy = Math.cos(g.t * g.freq * 2) * g.amp * g.freq * 2;

      // swoop toward the viewer: grows, then fades out
      g.swoop -= dt;
      if (g.swoop <= 0) g.swoopK = Math.min(1, g.swoopK + dt / 1.6);

      let vis = Math.min(1, g.life / 1.2);
      if (g.scared) vis *= 0.45;
      if (g.swoopK > 0) vis *= 1 - Math.max(0, (g.swoopK - 0.5) * 2);
      g.fade += (vis - g.fade) * Math.min(1, dt * 4);
      setOpacity(g, g.fade);

      const scale = 1 + g.swoopK * 1.8;
      g.rig.scale.setScalar(scale);
      g.rig.position.set(g.x, -g.y, 0);
      g.rig.rotation.set(clamp(vy / 600, -0.25, 0.25), g.dir * 0.45, -g.dir * clamp(g.vx / 900, -0.2, 0.2));
      g.mixer.update(dt);

      const gone = (g.dir > 0 && g.x > W + g.h * scale) || (g.dir < 0 && g.x < -g.h * scale) || (g.swoopK >= 1);
      if (gone) {
        g.active = false;
        g.rig.visible = false;
      }
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

  if (new URLSearchParams(location.search).has('creature-debug')) window.__ghosts = pool;

  return {
    show() { if (!canvas.isConnected) document.body.appendChild(canvas); visible = true; clock.getDelta(); },
    hide() { visible = false; canvas.remove(); pool.forEach(g => { g.active = false; g.rig.visible = false; }); },
  };
}

