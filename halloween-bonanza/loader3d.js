/* ============================================================
   Loading screen with an animated 3D Halloween model.
   Shown until the page's pictures, 3D models, fonts and scripts have
   downloaded, then 1 more second, then it fades away and the hero's
   entrance animations start.
   Configure on #loader:  data-model="assets/x.glb"  data-mode="pumpkin|hand|ghost"
                          data-assets="comma,separated,urls to download first"
   ============================================================ */
// A classic (non-module) script so the progress bar starts at once; Three.js is
// pulled in with import() only for the 3D model, and never holds the loader up.
(() => {
const el = document.getElementById('loader');
const root = document.documentElement;
if (el) start();

function start() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bar = el.querySelector('.loader-bar i');
  const pct = el.querySelector('.loader-pct');
  const assets = (el.dataset.assets || '').split(',').map(s => s.trim()).filter(Boolean);
  let shown = 0;
  const setProgress = p => {
    shown = Math.max(shown, p);                          // never go backwards
    bar.style.transform = `scaleX(${shown})`;
    pct.textContent = `${Math.round(shown * 100)}%`;
  };

  /* ---------- download the page's heavy files, counting bytes ---------- */
  async function fetchAll() {
    const size = assets.map(() => 0), got = assets.map(() => 0);
    const update = () => {
      const total = size.reduce((a, b) => a + b, 0);
      if (total) setProgress(Math.min(0.95, got.reduce((a, b) => a + b, 0) / total));
    };
    await Promise.all(assets.map(async (url, i) => {
      try {
        const res = await fetch(url);
        size[i] = +res.headers.get('content-length') || 0;
        if (!res.body) { await res.arrayBuffer(); got[i] = size[i]; return update(); }
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          got[i] += value.length;
          if (!size[i]) size[i] = got[i];
          update();
        }
      } catch { /* a missing file must not keep the loader up */ }
    }));
  }

  const pageLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(r => addEventListener('load', r, { once: true }));
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const safety = new Promise(r => setTimeout(r, 10000));   // never trap the visitor

  let modelShown;
  const modelReady = new Promise(r => { modelShown = r; });
  // content first; then give the 3D model at most 1.5 s more
  const waitModel = () => Promise.race([modelReady, new Promise(r => setTimeout(r, 1500))]);
  Promise.race([Promise.all([fetchAll(), pageLoaded, fontsReady]).then(waitModel), safety]).then(() => {
    setProgress(1);
    if (new URLSearchParams(location.search).has('loader-hold')) return;   // keep it up to look at / tweak it
    setTimeout(() => {                                    // + 1 second, as asked
      el.classList.add('done');
      root.classList.remove('is-loading');
      dispatchEvent(new Event('loader:done'));
      setTimeout(() => { stop3d?.(); el.remove(); }, 700);
    }, 1000);
  });

  /* ---------- the 3D model ---------- */
  let stop3d = null;
  if (!reduce) build3d().then(s => { stop3d = s; }).catch(() => {}).finally(() => modelShown());
  else modelShown();

  async function build3d() {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    if (!el.isConnected || el.classList.contains('done')) return null;
    const canvas = el.querySelector('.loader-3d');
    const accent = new THREE.Color(getComputedStyle(el).getPropertyValue('--la').trim() || '#ff8a1c');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.2, 7);
    scene.add(new THREE.HemisphereLight(0xe0d4ff, 0x2a1018, 2.2));
    const key = new THREE.DirectionalLight(0xffe0c0, 3.6);
    key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight(accent, 3);
    rim.position.set(3, 1, -4);
    const front = new THREE.PointLight(accent, 8, 12, 1.5);   // a warm glow from the front in the page colour
    front.position.set(0, 0.5, 4);
    scene.add(key, rim, front);

    const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(el.dataset.model);
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    // fit the model to ~2.6 units tall, centred
    const box = new THREE.Box3().setFromObject(model);
    const sizeV = box.getSize(new THREE.Vector3());
    const mode = el.dataset.mode;
    const s = mode === 'hand' ? 4.4 / Math.max(sizeV.y, sizeV.x * 0.8)    // the hand: big, only the top shows
            : mode === 'spider' ? 3.4 / Math.max(sizeV.x, sizeV.z)
            : 2.6 / Math.max(sizeV.y, sizeV.x * 0.8);
    model.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    model.position.sub(c);
    const pivot = new THREE.Group();
    pivot.add(model);
    scene.add(pivot);

    const mixer = new THREE.AnimationMixer(model);
    const walk = mode === 'spider'
      ? (gltf.animations.find(a => /idle/i.test(a.name)) ?? gltf.animations[0])   // breathing, front legs tapping
      : (gltf.animations.find(a => /walk/i.test(a.name)) ?? gltf.animations[0]);
    if (walk) { const a = mixer.clipAction(walk); a.timeScale = mode === 'spider' ? 1.7 : 1.3; a.play(); }
    const mouse = { x: 0, y: 0 };
    if (mode === 'spider') {                             // low, front-on: it rears up and stares at you
      camera.position.set(0, 1.5, 6.2);
      camera.lookAt(0, 0.2, 0);
      model.rotation.y = Math.PI;
      addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; }, { passive: true });
    }
    let glow = null;
    model.traverse(o => { if (o.isMesh && o.material.name === 'Glow') glow = o.material; });
    if (mode === 'hand') {                                // it claws up out of the bottom edge
      renderer.localClippingEnabled = true;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.75);   // the ground line, just above the logo
      model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = [plane]; } });
    }

    const resize = () => { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); };
    resize();
    addEventListener('resize', resize);
    canvas.classList.add('ready');

    const clock = new THREE.Clock();
    let T = 0, flick = 1;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 1 / 20);
      T += dt;
      mixer.update(dt);
      if (mode === 'pumpkin') {
        pivot.rotation.set(0.15, T * 0.9, Math.sin(T * 1.3) * 0.08);
        pivot.position.y = Math.sin(T * 1.8) * 0.12;
        if (Math.random() < 0.1) flick = 0.5 + Math.random() * 0.8;
        if (glow) glow.emissiveIntensity += (flick * 8 - glow.emissiveIntensity) * Math.min(1, dt * 14);
      } else if (mode === 'hand') {
        const k = Math.min(1, T / 0.45);                    // bursts up out of the edge in under half a second
        const up = 1 - (1 - k) ** 3 + Math.sin(T * 3) * 0.04;
        pivot.position.y = -3.6 + up * 2.6;             // a little lower than before, whole hand still out
        pivot.rotation.set(0, Math.sin(T * 1.6) * 0.35, Math.sin(T * 3) * 0.06);
      } else if (mode === 'spider') {
        // front end raised toward you, breathing, turning a little to follow the mouse
        pivot.rotation.x += ((0.5 + mouse.y * 0.25 + Math.sin(T * 1.8) * 0.03) - pivot.rotation.x) * Math.min(1, dt * 4);
        pivot.rotation.y += ((mouse.x * 0.7) - pivot.rotation.y) * Math.min(1, dt * 4);
        pivot.position.y = -0.15 + Math.sin(T * 1.8) * 0.03;
      } else {                                             // ghost: pops in, then floats
        const k = Math.min(1, T / 0.35);
        const pop = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k) + (k - 1) * 0 : 1;
        pivot.scale.setScalar(Math.max(0.01, k * pop));
        pivot.position.y = Math.sin(T * 3) * 0.18;
        pivot.rotation.set(0, Math.sin(T * 2) * 0.45, Math.sin(T * 2.4) * 0.1);
      }
      renderer.render(scene, camera);
    });
    return () => { renderer.setAnimationLoop(null); renderer.dispose(); };
  }
}
})();
