/* ============================================================
   NetBet RO Halloween — 3D (Three.js)
   1. GHOSTS — 2 translucent sheet ghosts (one large, one small) drift across the whole
               screen, bob, wave, sometimes swoop at the viewer and
               vanish; they flee from the cursor. Fixed, click-through.
   2. WEB    — a swaying orb web between the wizard and the title, glued to
               the text, the input, the chips and his hand, with a 3D spider on it.
   Models: assets/ghost.glb (tools/build_ghost.py), assets/spider.glb (bigbass-banner/tools/build_spider.py)
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '../halloween-poster/ghosts.js';

const THREE_VERSION = '0.170.0';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
   2. WEB + SPIDER in the hero
   An orb web in the open sky between the wizard's hand and the title,
   glued by single silk lines to the text, the email field, his fingertips, the N chip and his hat. The strands are an SVG
   that sways in the wind and ripples when the cursor passes; a 3D spider
   (assets/spider.glb) sits on it and now and then walks along a strand.
   ============================================================ */
const webSvg = document.querySelector('.web-svg');
const spiderCanvas = document.querySelector('.spider-canvas');
if (webSvg && getComputedStyle(webSvg).display !== 'none') {
  createWeb(webSvg, spiderCanvas).catch(err => console.warn('web:', err));
}

async function createWeb(svg, canvas) {
  const STAGE_W = 2000, STAGE_H = 1006;
  const stage = svg.closest('.stage');
  const $ = sel => svg.querySelector(sel);
  const pMoor = $('.web-moor'), pRad = $('.web-radial'), pSpi = $('.web-spiral'), gDew = $('.web-dew');

  /* ---------- geometry (image px, y down) ---------- */
  const HUB = { x: 960, y: 470 };                 // right up against the wizard's hand, between it and the title
  const N_RAD = 20, N_RING = 15, R = 240;
  // the web may spread over the claw hand, but keeps off the red chip and the gold coins (image px circles)
  const KEEP_OUT = [
    { x: 770, y: 615, r: 86 },    // big N chip (measured from the picture): silk runs onto its rim
    { x: 935, y: 775, r: 85 },    // gold coin below the chip
  ];
  const blocked = (x, y) => KEEP_OUT.some(k => Math.hypot(x - k.x, y - k.y) < k.r);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // stable shape on every load

  const radials = Array.from({ length: N_RAD }, (_, i) => {
    const a = (i / N_RAD) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    let len = R * (0.88 + rnd() * 0.24);
    // keep the frame inside the picture (top and left edges)
    const dx = Math.cos(a), dy = Math.sin(a);
    if (dy < 0) len = Math.min(len, (HUB.y - 6) / -dy);
    if (dx < 0) len = Math.min(len, (HUB.x - 6) / -dx);
    // stop each strand before it reaches the hand, chips or coins
    for (let t = 8; t <= len; t += 2) {
      if (blocked(HUB.x + dx * t, HUB.y + dy * t)) { len = Math.max(40, t); break; }
    }
    return { a, dx, dy, len };
  });
  const RINGS = Array.from({ length: N_RING }, (_, k) => 0.16 + (k / (N_RING - 1)) * 0.8);

  // base positions + mobility (frame barely moves, the middle of the web breathes most)
  const node = (ri, f) => ({ x: HUB.x + radials[ri].dx * radials[ri].len * f, y: HUB.y + radials[ri].dy * radials[ri].len * f, m: f >= 0.99 ? 0.3 : 0.45 + 0.55 * Math.sin(Math.PI * Math.min(f, 0.95)) });
  const hub = { x: HUB.x, y: HUB.y, m: 0.5 };
  const frame = radials.map((_, i) => node(i, 1));
  const rings = RINGS.map(f => radials.map((_, i) => node(i, f)));

  // mooring lines: one silk line each to the title, the email field, the chips and the wizard's fingers
  const nearestFrame = (ang) => {
    let best = 0, bd = Infinity;
    radials.forEach((r, i) => { const d = Math.abs(Math.atan2(Math.sin(r.a - ang), Math.cos(r.a - ang))); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const toward = p => nearestFrame(Math.atan2(p.y - HUB.y, p.x - HUB.x));
  function domAnchors() {
    const s = stage.getBoundingClientRect(), u = s.width / STAGE_W;
    const at = (el, fx, fy) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width * fx - s.left) / u, y: (r.top + r.height * fy - s.top) / u }; };
    const lines = document.querySelectorAll('.title .line');
    return [
      at(document.querySelector('.title .big'), 0.1, 0.45),              // 313
      at(document.querySelector('.title .big'), 0.05, 0.85),
      at(lines[0], 0.02, 0.5),                                           // ROTIRI GRATIS
      at(lines[1], 0.04, 0.55),                                          // BÂNTUITE
      at(document.querySelector('.cd-box'), 0.0, 0.4),                   // first countdown tile
      at(document.querySelector('.signup input[type="email"]'), 0.04, 0.35),   // the email field
    ];
  }
  // the hero's visible top and bottom edges, in image px
  function edges() {
    const s = stage.getBoundingClientRect(), u = s.width / STAGE_W;
    const frameBox = stage.parentElement.getBoundingClientRect();
    // threads run all the way to the top of the hero (the screen top), not just to the header
    return { top: (frameBox.top - s.top) / u - 4, bottom: (frameBox.bottom - s.top) / u - 2 };
  }
  // fixed spots in the picture (image px)
  // single silk threads glued to the wizard's fingertips, the N chip and his hat
  const PIC = [
    { x: 800, y: 455 },    // index fingertip
    { x: 812, y: 398 },    // middle fingertip
    { x: 772, y: 338 },    // top finger
    { x: 845, y: 590 },    // top rim of the big N chip
    { x: 880, y: 650 },    // right rim of the N chip
    { x: 640, y: 300 },    // brim of the hat
    { x: 560, y: 215 },    // hat band
  ];
  let moors = [];
  function buildMoors() {
    moors = [...domAnchors(), ...PIC].map(p => ({ from: p, to: toward(p) }));
    // every other corner of the web is tied straight up to the header or down to the bottom of the hero
    const used = new Set(moors.map(m => m.to));
    const { top, bottom } = edges();
    radials.forEach((r, i) => {
      if (used.has(i)) return;
      const f = frame[i];
      const fx = f.x + r.dx * 60;
      if (r.dy < -0.3) moors.push({ from: { x: fx, y: top }, to: i });
      // threads to the bottom only where they don't cross the chips and coins
      else if (r.dy > 0.3 && fx > 1030) moors.push({ from: { x: fx, y: bottom }, to: i });
    });
  }
  buildMoors();
  addEventListener('resize', () => requestAnimationFrame(buildMoors));
  // the title animates in: re-anchor once it has landed
  setTimeout(buildMoors, 1600);

  // dew drops on a few crossings
  const dew = Array.from({ length: 26 }, () => ({ k: 2 + Math.floor(rnd() * (N_RING - 3)), i: Math.floor(rnd() * N_RAD), r: 1.6 + rnd() * 1.8, d: rnd() * 3.4 }));
  gDew.innerHTML = dew.map(d => `<circle r="${d.r.toFixed(1)}" style="animation-delay:-${d.d.toFixed(2)}s"/>`).join('');
  const dewEls = [...gDew.children];

  /* ---------- motion ---------- */
  const pointer = { x: -9999, y: -9999, t: 0, speed: 0 };       // speed: how fast the cursor moves (image px/s)
  addEventListener('pointermove', e => {
    const s = stage.getBoundingClientRect(), u = s.width / STAGE_W;
    const x = (e.clientX - s.left) / u, y = (e.clientY - s.top) / u, now = performance.now();
    const dtm = Math.max(8, now - pointer.t) / 1000;
    if (pointer.t) pointer.speed += (Math.hypot(x - pointer.x, y - pointer.y) / dtm - pointer.speed) * 0.35;
    pointer.x = x; pointer.y = y; pointer.t = now;
  }, { passive: true });

  let T = 0;
  let shake = 0;                                  // 0 calm .. 1 the spider is fighting
  const disp = (n) => {
    const A = 10 * n.m * (1 + shake * 0.25);
    let x = n.x + Math.sin(T * 0.7 + n.y * 0.006) * A + Math.sin(T * 1.9 + n.x * 0.01) * A * 0.25;
    let y = n.y + Math.sin(T * 0.95 + n.x * 0.005 + 1) * A * 0.55;
    const dx = x - pointer.x, dy = y - pointer.y, d = Math.hypot(dx, dy);
    if (d < 140) { const k = (1 - d / 140) * (16 + shake * 6) * n.m; x += (dx / (d || 1)) * k; y += (dy / (d || 1)) * k; }
    if (shake > 0) { x += Math.sin(T * 14 + n.y * 0.05) * 0.8 * shake * n.m; y += Math.cos(T * 12 + n.x * 0.05) * 0.8 * shake * n.m; }
    return { x, y };
  };
  const f1 = v => v.toFixed(1);

  function draw() {
    const H = disp(hub);
    const F = frame.map(disp);
    const RG = rings.map(r => r.map(disp));
    // radials: hub -> frame, framing threads between neighbours
    let d = '';
    for (let i = 0; i < N_RAD; i++) d += `M${f1(H.x)} ${f1(H.y)}L${f1(F[i].x)} ${f1(F[i].y)}`;
    for (let i = 0; i < N_RAD; i++) { const a = F[i], b = F[(i + 1) % N_RAD]; d += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`; }
    pRad.setAttribute('d', d);
    // capture spiral: each ring sags a little toward the hub between strands
    d = '';
    for (const ring of RG) {
      d += `M${f1(ring[0].x)} ${f1(ring[0].y)}`;
      for (let i = 1; i <= N_RAD; i++) {
        const a = ring[i - 1], b = ring[i % N_RAD];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        d += `Q${f1(mx + (H.x - mx) * 0.07)} ${f1(my + (H.y - my) * 0.07)} ${f1(b.x)} ${f1(b.y)}`;
      }
    }
    pSpi.setAttribute('d', d);
    // mooring lines: slight catenary sag
    d = '';
    for (const mo of moors) {
      const b = F[mo.to], a = mo.from;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * 0.035 + Math.sin(T * 0.8) * 3;
      d += `M${f1(a.x)} ${f1(a.y)}Q${f1(mx)} ${f1(my)} ${f1(b.x)} ${f1(b.y)}`;
    }
    pMoor.setAttribute('d', d);
    dew.forEach((dw, j) => { const p = RG[dw.k][dw.i]; dewEls[j].setAttribute('cx', f1(p.x)); dewEls[j].setAttribute('cy', f1(p.y)); });
    return { H, RG };
  }

  /* ---------- the spider (3D) ---------- */
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  addEnvironment(renderer, scene, 0.4);
  const camera = new THREE.OrthographicCamera(0, STAGE_W, STAGE_H, 0, -3000, 3000);  // image px, y up
  camera.position.z = 1000;
  scene.add(new THREE.HemisphereLight(0xd8ccff, 0x200510, 1.5));
  const moon = new THREE.DirectionalLight(0xbfd0ff, 2.0);
  moon.position.set(300, 500, 600);
  const ember = new THREE.DirectionalLight(0xff6a2a, 1.2);
  ember.position.set(400, -300, 300);
  scene.add(moon, ember);

  const gltf = await loader.loadAsync('assets/spider.glb');
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  const box = new THREE.Box3().setFromObject(model);
  const SPAN = 145;
  const sc = SPAN / Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  model.scale.setScalar(sc);
  model.rotation.x = Math.PI / 2;                 // back to the viewer, head pointing up the screen
  const rig = new THREE.Group();
  rig.add(model);
  scene.add(rig);
  const mixer = new THREE.AnimationMixer(model);
  const clip = name => gltf.animations.find(a => a.name.toLowerCase().includes(name)) ?? gltf.animations[0];
  const walk = mixer.clipAction(clip('walk')), idle = mixer.clipAction(clip('idle'));
  walk.play(); idle.play();

  const RI = nearestFrame(-Math.PI * 0.6);       // the strand reaching up toward the moonlit clouds
  // rest: lives on a strand, now and then walks a little; alert: the cursor touched the web, it
  // freezes and turns for 0.3 s; rush: it hunts the cursor (fast start, easing in); fight: lunges and bites with legs thrashing; back: walks home again
  const sp = { f: 0.55, target: 0.55, wait: 2.5, speed: 0, mode: 'rest', x: 0, y: 0, away: 0, lunge: 0 };
  { const p0 = node(RI, sp.f); sp.x = p0.x; sp.y = p0.y; }
  // the web's real outline: how far silk reaches from the hub in a given direction
  function reach(x, y) {
    const ang = Math.atan2(y - HUB.y, x - HUB.x);
    const i = nearestFrame(ang);
    return radials[i].len;
  }
  // keep a point on the silk (a little inside the frame)
  function keepOnWeb(x, y, k = 0.9) {
    const dx = x - HUB.x, dy = y - HUB.y, d = Math.hypot(dx, dy) || 1;
    const lim = reach(x, y) * k;
    return d <= lim ? { x, y } : { x: HUB.x + dx / d * lim, y: HUB.y + dy / d * lim };
  }
  const onWeb = () => Math.hypot(pointer.x - HUB.x, pointer.y - HUB.y) < reach(pointer.x, pointer.y) * 1.02;

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
  }
  resize();
  addEventListener('resize', resize);

  function face(tx, ty, jitter = 0) {             // turn the head toward a point (image px, y down)
    const dx = tx - sp.x, dy = -(ty - sp.y);
    const want = Math.atan2(-dx, dy) + jitter;
    rig.rotation.z += Math.atan2(Math.sin(want - rig.rotation.z), Math.cos(want - rig.rotation.z)) * 0.35;
  }

  function update(dt) {
    T += dt;
    const { H } = draw();
    const touching = onWeb();
    // it notices you first (0.3 s), then hunts
    if (touching && (sp.mode === 'rest' || sp.mode === 'back')) { sp.mode = 'alert'; sp.alert = 0.3; sp.v = 0; }
    if (!touching && (sp.mode === 'alert' || sp.mode === 'rush' || sp.mode === 'fight')) { sp.away += dt; if (sp.away > 0.6) { sp.mode = 'back'; sp.away = 0; } }
    else sp.away = 0;

    let moving = 0, legRate = 1.2, x = sp.x, y = sp.y, scale = 1;
    if (sp.mode === 'rest') {
      // wander up and down its strand now and then
      sp.wait -= dt;
      if (sp.wait <= 0 && Math.abs(sp.target - sp.f) < 0.01) { sp.target = 0.32 + Math.random() * 0.45; sp.wait = 2.5 + Math.random() * 4; }
      const want = Math.sign(sp.target - sp.f) * Math.min(0.16, Math.abs(sp.target - sp.f) * 2);
      sp.speed += (want - sp.speed) * Math.min(1, dt * 5);
      sp.f += sp.speed * dt;
      const p = disp(node(RI, sp.f));
      sp.x = x = p.x; sp.y = y = p.y;
      face(H.x, H.y);
      moving = clamp(Math.abs(sp.speed) / 0.05, 0, 1);
      legRate = sp.speed < 0 ? 1.2 : -1.2;
    } else if (sp.mode === 'alert') {
      // freezes, turns toward the cursor, legs twitching... then goes
      sp.alert -= dt;
      face(pointer.x, pointer.y);
      moving = 0.35; legRate = Math.sin(T * 30) > 0 ? 2 : -2;
      if (sp.alert <= 0) sp.mode = 'rush';
    } else if (sp.mode === 'rush' || sp.mode === 'back') {
      const home = disp(node(RI, sp.f));
      const goal = sp.mode === 'rush' ? keepOnWeb(pointer.x, pointer.y) : home;    // never leaves its web
      const tx = goal.x, ty = goal.y;
      const dx = tx - sp.x, dy = ty - sp.y, d = Math.hypot(dx, dy);
      // hunting: as fast as the cursor moves (fast mouse = fast spider, slow mouse = it creeps),
      // easing off as it closes in; home: a calm walk
      const chase = clamp(70 + pointer.speed * 0.9, 70, 620);
      const top = sp.mode === 'rush' ? Math.min(chase, 40 + d * 3) : 200;
      sp.v = (sp.v ?? 0) + (top - (sp.v ?? 0)) * Math.min(1, dt * (sp.mode === 'rush' ? 9 : 4));
      const step = Math.min(d, sp.v * dt);
      sp.x += (dx / (d || 1)) * step; sp.y += (dy / (d || 1)) * step;
      x = sp.x; y = sp.y;
      face(tx, ty);
      moving = 1; legRate = clamp(sp.v / 120, 1.2, 4);
      if (sp.mode === 'rush' && d < 46) { sp.mode = 'fight'; sp.v = 0; }
      if (sp.mode === 'back' && d < 4) { sp.mode = 'rest'; sp.speed = 0; sp.target = sp.f; sp.v = 0; }
    } else if (sp.mode === 'fight') {
      // stays at the cursor's edge, lunging in and out, twisting, legs flailing
      const dx = pointer.x - sp.x, dy = pointer.y - sp.y, d = Math.hypot(dx, dy) || 1;
      const hold = 42;
      if (d > hold + 60) { sp.mode = 'rush'; }                           // the cursor got away: chase again
      const keepUp = Math.min(Math.abs(d - hold), clamp(70 + pointer.speed * 0.9, 70, 620) * dt);
      sp.x += (dx / d) * Math.sign(d - hold) * keepUp;
      sp.y += (dy / d) * Math.sign(d - hold) * keepUp;
      sp.lunge += dt;
      const strike = Math.max(0, Math.sin(sp.lunge * 4.5)) ** 4;         // a slow, deliberate bite now and then
      { const held = keepOnWeb(sp.x, sp.y, 0.88); sp.x = held.x; sp.y = held.y; }
      const hit = keepOnWeb(sp.x + (dx / d) * strike * 9, sp.y + (dy / d) * strike * 9, 0.95);
      x = hit.x; y = hit.y;
      face(pointer.x, pointer.y, Math.sin(T * 2.5) * 0.08);
      scale = 1 + strike * 0.04;
      moving = keepUp > 0.5 ? 1 : 0.3; legRate = keepUp > 0.5 ? clamp(keepUp / dt / 120, 1, 4) : 1.2;   // legs only move when it moves
    }
    shake += ((sp.mode === 'fight' ? 1 : 0) - shake) * Math.min(1, dt * 4);

    rig.position.set(x, STAGE_H - y, 50);
    rig.scale.setScalar(scale);
    walk.setEffectiveWeight(moving); idle.setEffectiveWeight(1 - moving);
    walk.timeScale = legRate;
    mixer.update(dt);
  }

  if (reduceMotion) { update(0); renderer.render(scene, camera); return; }

  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(svg);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!onScreen) return;
    update(dt);
    renderer.render(scene, camera);
  });
}

/* ============================================================
   3. PHONE: a corner web in the top-right of the hero, hanging
      down to the 313 title, with the spider sitting in it.
   ============================================================ */
const mWeb = document.querySelector('.m-web');
if (mWeb && getComputedStyle(mWeb).display !== 'none') {
  createMobileWeb(mWeb, document.querySelector('.m-spider')).catch(err => console.warn('mobile web:', err));
}

async function createMobileWeb(svg, canvas) {
  const stage = svg.closest('.stage');
  const pMoor = svg.querySelector('.web-moor'), pRad = svg.querySelector('.web-radial'), pSpi = svg.querySelector('.web-spiral');
  const N_RAD = 8, N_RING = 9;
  let W = 0, C = { x: 0, y: 0 }, L = 0, anchors = [];

  function layout() {
    const s = stage.getBoundingClientRect();
    W = s.width;
    C = { x: W - 2, y: 64 };                                  // top-right corner, just under the header
    L = Math.min(W * 0.5, 200);
    const big = document.querySelector('.title .big').getBoundingClientRect();
    const line = document.querySelector('.title .line').getBoundingClientRect();
    anchors = [
      { x: big.right - s.left - big.width * 0.08, y: big.top - s.top + big.height * 0.25 },   // the 313
      { x: line.right - s.left - 6, y: line.top - s.top + line.height * 0.4 },               // ROTIRI GRATIS
    ];
    svg.setAttribute('viewBox', `0 0 ${W} ${s.height}`);
    renderer.setSize(W, s.height, false);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -s.height;
    camera.updateProjectionMatrix();
  }

  // fan of strands from the corner, down and to the left
  const ang = i => Math.PI * (0.52 + (i / (N_RAD - 1)) * 0.46);
  let T = 0;
  const pt = (i, f) => {
    const a = ang(i), sway = Math.sin(T * 0.9 + i * 0.6) * 4 * f;
    return { x: C.x + Math.cos(a) * L * f + sway, y: C.y + Math.sin(a) * L * f + Math.sin(T * 1.1 + f * 3) * 3 * f };
  };
  const f1 = v => v.toFixed(1);

  function draw() {
    let d = '';
    for (let i = 0; i < N_RAD; i++) { const e = pt(i, 1); d += `M${f1(C.x)} ${f1(C.y)}L${f1(e.x)} ${f1(e.y)}`; }
    pRad.setAttribute('d', d);
    d = '';
    for (let k = 1; k <= N_RING; k++) {
      const f = k / N_RING * 0.95;
      const a0 = pt(0, f);
      d += `M${f1(a0.x)} ${f1(a0.y)}`;
      for (let i = 1; i < N_RAD; i++) {
        const a = pt(i - 1, f), b = pt(i, f);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        d += `Q${f1(mx + (C.x - mx) * 0.08)} ${f1(my + (C.y - my) * 0.08)} ${f1(b.x)} ${f1(b.y)}`;
      }
    }
    pSpi.setAttribute('d', d);
    // long threads hanging down to the title
    d = '';
    const ends = [pt(1, 1), pt(3, 1)];
    anchors.forEach((a, j) => {
      const e = ends[j];
      const mx = (a.x + e.x) / 2 + Math.sin(T * 0.8 + j) * 4, my = (a.y + e.y) / 2;
      d += `M${f1(e.x)} ${f1(e.y)}Q${f1(mx)} ${f1(my)} ${f1(a.x)} ${f1(a.y)}`;
    });
    pMoor.setAttribute('d', d);
  }

  /* the spider */
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  addEnvironment(renderer, scene, 0.4);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);     // CSS px, y down -> world -y
  camera.position.z = 1000;
  scene.add(new THREE.HemisphereLight(0xd8ccff, 0x200510, 1.6));
  const moon = new THREE.DirectionalLight(0xbfd0ff, 2.0);
  moon.position.set(300, 500, 600);
  scene.add(moon);
  const gltf = await loader.loadAsync('assets/spider.glb');
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  const box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(62 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
  model.rotation.x = Math.PI / 2;
  const rig = new THREE.Group();
  rig.add(model);
  scene.add(rig);
  const mixer = new THREE.AnimationMixer(model);
  const clip = name => gltf.animations.find(a => a.name.toLowerCase().includes(name)) ?? gltf.animations[0];
  const walk = mixer.clipAction(clip('walk')), idle = mixer.clipAction(clip('idle'));
  walk.play(); idle.play();

  layout();
  addEventListener('resize', () => requestAnimationFrame(layout));
  setTimeout(layout, 1600);                                   // after the title has animated in

  const sp = { f: 0.55, target: 0.55, wait: 2, speed: 0 };
  const RI = 3;
  function update(dt) {
    T += dt;
    draw();
    sp.wait -= dt;
    if (sp.wait <= 0 && Math.abs(sp.target - sp.f) < 0.01) { sp.target = 0.3 + Math.random() * 0.5; sp.wait = 2 + Math.random() * 4; }
    const want = Math.sign(sp.target - sp.f) * Math.min(0.18, Math.abs(sp.target - sp.f) * 2);
    sp.speed += (want - sp.speed) * Math.min(1, dt * 5);
    sp.f += sp.speed * dt;
    const p = pt(RI, sp.f);
    rig.position.set(p.x, -p.y, 0);
    rig.rotation.z = Math.atan2(-(C.x - p.x), -(C.y - p.y));   // head toward the corner
    const w = clamp(Math.abs(sp.speed) / 0.05, 0, 1);
    walk.setEffectiveWeight(w); idle.setEffectiveWeight(1 - w);
    walk.timeScale = sp.speed < 0 ? 1.4 : -1.4;
    mixer.update(dt);
    renderer.render(scene, camera);
  }
  if (reduceMotion) { update(0); return; }
  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(stage);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (onScreen) update(dt);
  });
}
