/* ==========================================================================
   Give And Take — "The Digital Table" WebGL entry scene
   --------------------------------------------------------------------------
   The subject is the game itself, not a generic 3D object:

     • the 44-space board track (S00–S43) rendered as a floating ring of
       markers in shallow perspective — the physical path, seen from above;
     • a QR-derived tile field (21x21 module grid with the three finder
       squares) drifting behind it — the bridge from printed board to app;
     • four pawn markers travelling the track, and a warm brass light pool.

   Everything is points and hairlines: no textures, no model downloads, tiny
   payload. Best effort only — any failure leaves the app on the static
   gradient fallback (`html.no-webgl`) and never blocks boot.
   ========================================================================== */
import * as THREE from "https://esm.sh/three@0.160.0";

const root = document.documentElement;
const done = () => window.GTLoader && window.GTLoader.ready("webgl");

function fail(err) {
  root.classList.add("no-webgl");
  if (err) console.warn("[gt] WebGL entry disabled:", err.message ?? err);
  done();
}

try {
  const canvas = document.getElementById("gt-webgl");
  if (!canvas) throw new Error("no canvas");

  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) throw new Error("no webgl context");

  const reducedMotion = () =>
    root.classList.contains("reduced-motion") ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---- quality budget ------------------------------------------------- */
  const smallScreen = window.innerWidth < 900;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
  const maxDpr = smallScreen || lowPower ? 1.25 : 1.75;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !smallScreen && !lowPower,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4.4, 13.6);

  const BRASS = new THREE.Color("#b18a43");
  const PARCHMENT = new THREE.Color("#e8e1d2");
  const SIGNAL = new THREE.Color("#c8f04a");
  const MOSS = new THREE.Color("#3c5847");

  /* Round sprite so points read as physical markers, not square pixels. */
  function dotTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const sprite = dotTexture();

  const world = new THREE.Group();
  world.rotation.x = -0.62; // shallow tabletop perspective
  // Sit the table behind the story column so the entry console stays quiet.
  world.position.set(-1.6, -0.6, 0);
  scene.add(world);

  /* ---- 1. the board track: 44 spaces around a square perimeter --------- */
  const TRACK_SPACES = 44; // S00–S43
  const SIDE = 11;
  const HALF = 3.0;
  const trackPoints = [];
  for (let i = 0; i < TRACK_SPACES; i++) {
    const side = Math.floor(i / SIDE);
    const t = (i % SIDE) / SIDE;
    const p = -HALF + t * (HALF * 2);
    if (side === 0) trackPoints.push(new THREE.Vector3(p, -HALF, 0));
    else if (side === 1) trackPoints.push(new THREE.Vector3(HALF, p, 0));
    else if (side === 2) trackPoints.push(new THREE.Vector3(-p, HALF, 0));
    else trackPoints.push(new THREE.Vector3(-HALF, -p, 0));
  }

  const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
  const trackColors = new Float32Array(TRACK_SPACES * 3);
  const trackSizes = new Float32Array(TRACK_SPACES);
  trackPoints.forEach((_, i) => {
    // every 11th space is a corner: brass. Others alternate parchment / moss.
    const corner = i % SIDE === 0;
    const c = corner ? BRASS : i % 3 === 0 ? PARCHMENT : MOSS;
    trackColors[i * 3] = c.r;
    trackColors[i * 3 + 1] = c.g;
    trackColors[i * 3 + 2] = c.b;
    trackSizes[i] = corner ? 0.3 : 0.18;
  });
  trackGeo.setAttribute("color", new THREE.BufferAttribute(trackColors, 3));
  const track = new THREE.Points(
    trackGeo,
    new THREE.PointsMaterial({
      size: 0.3,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  );
  world.add(track);

  // hairline square that reads as the printed board edge
  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALF, -HALF, 0),
      new THREE.Vector3(HALF, -HALF, 0),
      new THREE.Vector3(HALF, HALF, 0),
      new THREE.Vector3(-HALF, HALF, 0)
    ]),
    new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0.34 })
  );
  world.add(edge);

  /* ---- 2. QR module field (21x21) sitting under the track -------------- */
  const MODULES = 21;
  const qrPoints = [];
  const qrColors = [];
  // deterministic pseudo-random so the pattern is stable across reloads
  const rand = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const inFinder = (x, y) => {
    const f = (ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    return f(0, 0) || f(MODULES - 7, 0) || f(0, MODULES - 7);
  };
  const finderOn = (x, y) => {
    const lx = x % (MODULES - 7 || 1);
    const ring = (v) => v === 0 || v === 6;
    const cx = x < 7 ? x : x - (MODULES - 7);
    const cy = y < 7 ? y : y - (MODULES - 7);
    return ring(cx) || ring(cy) || (cx > 1 && cx < 5 && cy > 1 && cy < 5) || lx < 0;
  };
  for (let y = 0; y < MODULES; y++) {
    for (let x = 0; x < MODULES; x++) {
      const on = inFinder(x, y) ? finderOn(x, y) : rand(x, y) > 0.52;
      if (!on) continue;
      const s = 0.235;
      qrPoints.push(
        new THREE.Vector3((x - (MODULES - 1) / 2) * s, (y - (MODULES - 1) / 2) * s, -2.6)
      );
      const c = inFinder(x, y) ? BRASS : PARCHMENT;
      qrColors.push(c.r, c.g, c.b);
    }
  }
  const qrGeo = new THREE.BufferGeometry().setFromPoints(qrPoints);
  qrGeo.setAttribute("color", new THREE.Float32BufferAttribute(qrColors, 3));
  const qrField = new THREE.Points(
    qrGeo,
    new THREE.PointsMaterial({
      size: 0.13,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  world.add(qrField);

  /* ---- 3. four pawns travelling the track ------------------------------ */
  const pawnGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
  const pawnColors = new Float32Array(12);
  [SIGNAL, BRASS, PARCHMENT, SIGNAL].forEach((c, i) => {
    pawnColors[i * 3] = c.r;
    pawnColors[i * 3 + 1] = c.g;
    pawnColors[i * 3 + 2] = c.b;
  });
  pawnGeo.setAttribute("color", new THREE.BufferAttribute(pawnColors, 3));
  const pawns = new THREE.Points(
    pawnGeo,
    new THREE.PointsMaterial({
      size: 0.62,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  world.add(pawns);
  const pawnOffsets = [0, 9, 19, 31];
  const pawnPos = pawnGeo.attributes.position;

  function placePawns(t) {
    for (let i = 0; i < 4; i++) {
      const idx = (pawnOffsets[i] + t * (0.9 + i * 0.12)) % TRACK_SPACES;
      const a = trackPoints[Math.floor(idx)];
      const b = trackPoints[(Math.floor(idx) + 1) % TRACK_SPACES];
      const f = idx - Math.floor(idx);
      pawnPos.setXYZ(i, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 0.12);
    }
    pawnPos.needsUpdate = true;
  }
  placePawns(0);

  /* ---- 4. the light pool: a soft brass glow behind the table ----------- */
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 256;
  const gctx = glowCanvas.getContext("2d");
  const gGrad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gGrad.addColorStop(0, "rgba(177,138,67,.55)");
  gGrad.addColorStop(0.45, "rgba(120,95,48,.16)");
  gGrad.addColorStop(1, "rgba(0,0,0,0)");
  gctx.fillStyle = gGrad;
  gctx.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glow.position.set(0, 0, -4.2);
  world.add(glow);

  /* ---- interaction + render loop -------------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
    },
    { passive: true }
  );

  let scrollShift = 0;
  window.addEventListener(
    "scroll",
    () => {
      scrollShift = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 2.4);
    },
    { passive: true }
  );

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  window.addEventListener("resize", resize, { passive: true });

  const clock = new THREE.Clock();
  let firstDrawn = false;
  let raf = null;

  function draw() {
    const t = clock.getElapsedTime();
    const still = reducedMotion();

    if (still) {
      world.rotation.z = 0.1;
      world.rotation.x = -0.62;
      placePawns(0);
    } else {
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;
      world.rotation.z = t * 0.014 + pointer.x * 0.12;
      world.rotation.x = -0.62 + pointer.y * 0.08 - scrollShift * 0.14;
      qrField.rotation.z = -t * 0.02;
      qrField.material.opacity = 0.34 + Math.sin(t * 0.5) * 0.07;
      placePawns(t * 0.55);
      camera.position.y = 3.1 + scrollShift * 1.5;
      camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.04;
    }
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    if (!firstDrawn) {
      firstDrawn = true;
      done();
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    // Pause all GPU work when the light classroom theme is on, when the tab is
    // hidden, or after the first frame under reduced motion.
    if (document.hidden) return;
    if (root.dataset.pageTheme === "classroom") return;
    if (reducedMotion() && firstDrawn) return;
    draw();
  }
  frame();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) clock.getDelta();
  });

  window.addEventListener("pagehide", () => {
    if (raf) cancelAnimationFrame(raf);
  });

  // Release the loader even if the first frame is delayed by a slow GPU.
  window.setTimeout(done, 1200);
} catch (err) {
  fail(err);
}
