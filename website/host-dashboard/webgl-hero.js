/* ==========================================================================
   Give And Take — "The Board Awakens" (Digital Table v2)
   --------------------------------------------------------------------------
   One persistent authored scene. The subject is the real printed board:
   `give_and_take_board_web_640.webp` is sampled on a canvas and emitted as a
   ~14k point cloud lying on a shallow-perspective plane, each point taking its
   colour from the board pixel beneath it. The particles ARE the board — not
   decoration around it. The S00-S43 perimeter is re-emphasised with brighter
   track markers and travelling pawns, and a faint brass grid gives the void a
   floor.

   Scroll drives three camera / light / point-state chapters:
     0  set the table   — high and wide, pool tight on the start corner
     1  play physically — lowered toward the deck edge, pawns advancing
     2  track digitally — lifts and squares up, points rise into layers

   Best effort only. Any failure adds `html.no-webgl`, which switches the entry
   to a fully composed CSS fallback. Nothing here ever blocks boot or input.
   ========================================================================== */
import * as THREE from "https://esm.sh/three@0.160.0";

const root = document.documentElement;
const done = () => window.GTLoader && window.GTLoader.ready("webgl");

/* Written by ui-refresh.js as the chapter track scrolls. */
window.GTScene = window.GTScene || { progress: 0 };

function fail(err) {
  root.classList.add("no-webgl");
  if (err) console.warn("[gt] WebGL entry disabled:", err.message ?? err);
  done();
}

const BOARD_SRC = "../../outputs/final_assets/board/give_and_take_board_web_640.webp";

try {
  // QA flag: ?nogl=1 forces the composed non-WebGL hero so the fallback can be
  // captured and compared without disabling WebGL browser-wide.
  if (/[?&]nogl=1\b/.test(window.location.search)) throw new Error("forced fallback (?nogl=1)");

  const canvas = document.getElementById("gt-webgl");
  if (!canvas) throw new Error("no canvas");
  if (!(canvas.getContext("webgl2") || canvas.getContext("webgl"))) {
    throw new Error("no webgl context");
  }

  const reducedMotion = () =>
    root.classList.contains("reduced-motion") ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---- quality budget -------------------------------------------------- */
  const small = window.innerWidth < 900;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
  const maxDpr = small || lowPower ? 1.25 : 1.5;
  const GRID = small || lowPower ? 92 : 124; // board sample resolution

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 200);

  const BRASS = new THREE.Color("#b18a43");
  const SIGNAL = new THREE.Color("#c8f04a");
  const PARCHMENT = new THREE.Color("#e8e1d2");

  const world = new THREE.Group();
  scene.add(world);

  const HALF = 4.2; // board half-extent in world units

  /* ---- floor grid: gives the void a room ------------------------------- */
  {
    const lines = [];
    const span = 16;
    const step = 1.6;
    for (let i = -span; i <= span; i += step) {
      lines.push(-span, i, 0, span, i, 0);
      lines.push(i, -span, 0, i, span, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    const grid = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0.05 })
    );
    grid.position.z = -0.9;
    world.add(grid);
  }

  /* ---- the light pool -------------------------------------------------- */
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = poolCanvas.height = 256;
  {
    const c = poolCanvas.getContext("2d");
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(190,150,78,.60)");
    g.addColorStop(0.4, "rgba(120,95,48,.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }
  const poolTex = new THREE.CanvasTexture(poolCanvas);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  pool.position.set(0, 0, -1.4);
  world.add(pool);

  /* ---- shared point shader --------------------------------------------- */
  const uniforms = {
    uSize: { value: 26.0 },
    uDpr: { value: renderer.getPixelRatio() },
    uLift: { value: 0 }, // chapter 3: points rise into information layers
    uGlow: { value: 1 }
  };

  const VERT = `
    attribute vec3 color;
    attribute float aRand;
    uniform float uSize;
    uniform float uDpr;
    uniform float uLift;
    varying vec3 vColor;
    varying float vFade;
    void main() {
      vColor = color;
      vec3 p = position;
      // chapter 3 lifts the board off its plane into stacked layers
      float layer = floor(aRand * 4.0);
      p.z += uLift * (0.35 + layer * 0.55);
      p.xy *= 1.0 + uLift * 0.06;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * uDpr * (1.0 / max(-mv.z, 0.4));
      vFade = clamp(1.0 - (-mv.z - 6.0) / 26.0, 0.15, 1.0);
    }
  `;
  const FRAG = `
    precision mediump float;
    uniform float uGlow;
    varying vec3 vColor;
    varying float vFade;
    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r = dot(d, d);
      if (r > 0.25) discard;
      float a = smoothstep(0.25, 0.02, r);
      gl_FragColor = vec4(vColor * uGlow, a * vFade);
    }
  `;

  function pointMaterial(extra) {
    return new THREE.ShaderMaterial(
      Object.assign(
        {
          uniforms,
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        },
        extra || {}
      )
    );
  }

  /* ---- 1. the board, sampled into points -------------------------------- */
  let boardPoints = null;

  function buildBoard(image) {
    const c = document.createElement("canvas");
    c.width = c.height = GRID;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, GRID, GRID);
    const data = ctx.getImageData(0, 0, GRID, GRID).data;

    const pos = [];
    const col = [];
    const rnd = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = (y * GRID + x) * 4;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 0.1) continue; // let the dark board ground fall away into the void
        const wx = (x / (GRID - 1) - 0.5) * HALF * 2;
        const wy = -(y / (GRID - 1) - 0.5) * HALF * 2;
        pos.push(wx, wy, 0);
        // lift saturation a little so the artwork still reads as points
        col.push(Math.min(1, r * 1.1), Math.min(1, g * 1.1), Math.min(1, b * 1.1));
        rnd.push(Math.random());
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("aRand", new THREE.Float32BufferAttribute(rnd, 1));
    boardPoints = new THREE.Points(geo, pointMaterial());
    world.add(boardPoints);
  }

  /* ---- 2. S00-S43 track markers + pawns --------------------------------- */
  const TRACK = 44;
  const SIDE = 11;
  const EDGE = HALF * 0.94;
  const trackPos = [];
  for (let i = 0; i < TRACK; i++) {
    const side = Math.floor(i / SIDE);
    const t = (i % SIDE) / SIDE;
    const p = -EDGE + t * (EDGE * 2);
    if (side === 0) trackPos.push(new THREE.Vector3(p, -EDGE, 0.06));
    else if (side === 1) trackPos.push(new THREE.Vector3(EDGE, p, 0.06));
    else if (side === 2) trackPos.push(new THREE.Vector3(-p, EDGE, 0.06));
    else trackPos.push(new THREE.Vector3(-EDGE, -p, 0.06));
  }
  {
    const pos = [];
    const col = [];
    const rnd = [];
    trackPos.forEach((v, i) => {
      pos.push(v.x, v.y, v.z);
      const corner = i % SIDE === 0;
      const c = corner ? BRASS : PARCHMENT;
      const k = corner ? 1 : 0.55;
      col.push(c.r * k, c.g * k, c.b * k);
      rnd.push(0);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("aRand", new THREE.Float32BufferAttribute(rnd, 1));
    const track = new THREE.Points(geo, pointMaterial());
    track.material.uniforms = uniforms;
    world.add(track);
  }

  const PAWNS = 4;
  const pawnGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(PAWNS * 3);
    const col = new Float32Array(PAWNS * 3);
    const rnd = new Float32Array(PAWNS);
    [SIGNAL, BRASS, PARCHMENT, SIGNAL].forEach((c, i) => {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    });
    pawnGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pawnGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pawnGeo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 1));
  }
  const pawnUniforms = Object.assign({}, uniforms, { uSize: { value: 78.0 } });
  const pawns = new THREE.Points(
    pawnGeo,
    new THREE.ShaderMaterial({
      uniforms: pawnUniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  world.add(pawns);
  const pawnStart = [0, 10, 21, 32];
  function placePawns(t, pointerLead) {
    const a = pawnGeo.attributes.position;
    for (let i = 0; i < PAWNS; i++) {
      const idx = (pawnStart[i] + t * (0.75 + i * 0.1)) % TRACK;
      const p0 = trackPos[Math.floor(idx)];
      const p1 = trackPos[(Math.floor(idx) + 1) % TRACK];
      const f = idx - Math.floor(idx);
      a.setXYZ(
        i,
        p0.x + (p1.x - p0.x) * f + pointerLead * 0.35,
        p0.y + (p1.y - p0.y) * f,
        0.22
      );
    }
    a.needsUpdate = true;
  }
  placePawns(0, 0);

  /* ---- chapter keyframes ----------------------------------------------- */
  /* `shift` slides the whole board laterally so it vacates the side the
     chapter copy occupies: 01 and 03 keep type on the left, 02 on the right. */
  const CHAPTERS = [
    { cam: [0.0, 5.6, 13.4], tgt: [0, 0.1, 0], rot: -0.55, lift: 0, shift: 2.6, pool: [-2.2, -2.0, 0.95], poolScale: 0.7 },
    { cam: [1.3, 2.9, 10.2], tgt: [0.5, -0.5, 0], rot: -0.74, lift: 0, shift: -3.0, pool: [0.6, -1.4, 1.0], poolScale: 1.0 },
    { cam: [0.0, 8.2, 11.6], tgt: [0, 0.6, 0], rot: -0.30, lift: 1, shift: 2.2, pool: [0, 0.4, 0.7], poolScale: 1.5 }
  ];

  function sampleChapters(p) {
    const x = Math.max(0, Math.min(1, p)) * (CHAPTERS.length - 1);
    const i = Math.min(CHAPTERS.length - 2, Math.floor(x));
    const f = x - i;
    const e = f * f * (3 - 2 * f); // smoothstep
    const a = CHAPTERS[i];
    const b = CHAPTERS[i + 1];
    const mix = (u, v) => u + (v - u) * e;
    return {
      cam: [mix(a.cam[0], b.cam[0]), mix(a.cam[1], b.cam[1]), mix(a.cam[2], b.cam[2])],
      tgt: [mix(a.tgt[0], b.tgt[0]), mix(a.tgt[1], b.tgt[1]), mix(a.tgt[2], b.tgt[2])],
      rot: mix(a.rot, b.rot),
      lift: mix(a.lift, b.lift),
      shift: mix(a.shift, b.shift),
      pool: [mix(a.pool[0], b.pool[0]), mix(a.pool[1], b.pool[1]), mix(a.pool[2], b.pool[2])],
      poolScale: mix(a.poolScale, b.poolScale)
    };
  }

  /* ---- interaction ------------------------------------------------------ */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      ptr.tx = e.clientX / window.innerWidth - 0.5;
      ptr.ty = e.clientY / window.innerHeight - 0.5;
    },
    { passive: true }
  );

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    uniforms.uDpr.value = renderer.getPixelRatio();
    pawnUniforms.uDpr.value = renderer.getPixelRatio();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  window.addEventListener("resize", resize, { passive: true });

  /* ---- context loss ----------------------------------------------------- */
  let contextLost = false;
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      contextLost = true;
      root.classList.add("no-webgl");
    },
    false
  );
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    root.classList.remove("no-webgl");
    resize();
  });

  /* ---- loop -------------------------------------------------------------- */
  const clock = new THREE.Clock();
  const cur = { camX: 0, camY: 5.6, camZ: 13.4, tx: 0, ty: 0.1, rot: -0.55, lift: 0, shift: 2.6 };
  let firstDrawn = false;
  let raf = null;
  let lastConsoleDraw = 0;

  function draw(now) {
    const t = clock.getElapsedTime();
    const still = reducedMotion();
    const target = sampleChapters(window.GTScene.progress || 0);

    if (!still) {
      ptr.x += (ptr.tx - ptr.x) * 0.045;
      ptr.y += (ptr.ty - ptr.y) * 0.045;
    } else {
      ptr.x = ptr.y = 0;
    }

    const k = still ? 1 : 0.055;
    cur.camX += (target.cam[0] + ptr.x * 0.9 - cur.camX) * k;
    cur.camY += (target.cam[1] - ptr.y * 0.7 - cur.camY) * k;
    cur.camZ += (target.cam[2] - cur.camZ) * k;
    cur.tx += (target.tgt[0] - cur.tx) * k;
    cur.ty += (target.tgt[1] - cur.ty) * k;
    cur.rot += (target.rot - cur.rot) * k;
    cur.lift += (target.lift - cur.lift) * k;
    cur.shift += (target.shift - cur.shift) * k;
    world.position.x = cur.shift;

    camera.position.set(cur.camX, cur.camY, cur.camZ);
    camera.lookAt(cur.tx, cur.ty, 0);

    // board tilt stays tiny; the pawns carry the pointer response
    world.rotation.x = cur.rot;
    world.rotation.z = still ? 0.06 : 0.06 + ptr.x * 0.052;
    uniforms.uLift.value = cur.lift;
    pawnUniforms.uLift.value = 0;

    pool.position.set(target.pool[0], target.pool[1], -1.4);
    pool.scale.setScalar(target.poolScale);
    pool.material.opacity = target.pool[2] * (still ? 0.8 : 0.8 + Math.sin(t * 0.35) * 0.08);

    placePawns(still ? 0 : t * 0.5, still ? 0 : ptr.x * 0.5);

    renderer.render(scene, camera);
    if (!firstDrawn) {
      firstDrawn = true;
      done();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (contextLost) return;
    if (document.hidden) return;
    if (root.dataset.pageTheme === "classroom") return;
    if (reducedMotion() && firstDrawn) return;
    // once a table exists the scene is background only: throttle hard
    if (root.dataset.appStage === "console") {
      if (now - lastConsoleDraw < 90) return;
      lastConsoleDraw = now;
    }
    draw(now);
  }

  /* ---- board texture load, then start ----------------------------------- */
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    try {
      buildBoard(img);
    } catch (err) {
      console.warn("[gt] board sampling failed, running without board points:", err.message);
    }
    frame(performance.now());
  };
  img.onerror = () => {
    // No board texture: still show track, pawns, grid and pool rather than nothing.
    frame(performance.now());
  };
  img.src = BOARD_SRC;

  window.addEventListener("pagehide", () => {
    if (raf) cancelAnimationFrame(raf);
  });

  // Release the loader even if decode or first paint is slow.
  window.setTimeout(done, 1200);
} catch (err) {
  fail(err);
}
