/* ==========================================================================
   Give And Take — WebGL entry scene
   A refractive glass die (chromatic dispersion) drifting on warm near-black,
   with a few smaller glass shards for depth. Inspired by agencidev /
   visualidentity.studio. Best-effort: failure never blocks the app.
   ========================================================================== */
import * as THREE from "https://esm.sh/three@0.160.0";

const done = () => window.GTLoader && window.GTLoader.ready("webgl");

try {
  const canvas = document.getElementById("gt-webgl");
  if (!canvas) throw new Error("no canvas");

  const reduced =
    document.documentElement.classList.contains("reduced-motion") ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.5);

  /* ---- procedural environment (warm studio) for reflections/refraction */
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 512;
  envCanvas.height = 256;
  const ctx = envCanvas.getContext("2d");
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#1c170f");
  grd.addColorStop(0.5, "#0a0806");
  grd.addColorStop(1, "#000000");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 256);
  // a tight warm key highlight + cool rim so the glass catches sharp edges
  const glow = ctx.createRadialGradient(370, 60, 4, 370, 60, 120);
  glow.addColorStop(0, "rgba(240,208,150,1)");
  glow.addColorStop(1, "rgba(240,208,150,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 256);
  const rim = ctx.createRadialGradient(110, 210, 4, 110, 210, 120);
  rim.addColorStop(0, "rgba(150,185,205,0.7)");
  rim.addColorStop(1, "rgba(150,185,205,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, 512, 256);

  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffe6b8, 2.2);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0x9fb8c8, 1.1);
  rimLight.position.set(-5, -2, -4);
  scene.add(rimLight);

  /* ---- the glass die -------------------------------------------------- */
  const glass = new THREE.MeshPhysicalMaterial({
    transmission: 1,
    thickness: 0.85,
    roughness: 0.03,
    metalness: 0,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.5,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
    attenuationColor: new THREE.Color("#8fa6a8"),
    attenuationDistance: 6,
    specularIntensity: 1,
    envMapIntensity: 1.1,
    transparent: true
  });

  const die = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.65, 1.65, 1, 1, 1), glass);
  die.position.set(1.15, 0.25, 0);
  scene.add(die);

  // a subtle bright edge frame so the cube reads even on pure black
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(die.geometry),
    new THREE.LineBasicMaterial({ color: 0xdcc189, transparent: true, opacity: 0.22 })
  );
  die.add(edges);

  /* ---- drifting glass shards ----------------------------------------- */
  const shards = new THREE.Group();
  const shardGeo = new THREE.TetrahedronGeometry(0.36, 0);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(shardGeo, glass);
    const a = Math.random() * Math.PI * 2;
    const rad = 3.4 + Math.random() * 3.2;
    m.position.set(Math.cos(a) * rad, (Math.random() - 0.5) * 5.5, Math.sin(a) * rad - 2);
    const s = 0.4 + Math.random() * 0.8;
    m.scale.setScalar(s);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.userData.spin = (Math.random() - 0.5) * 0.006;
    m.userData.drift = 0.1 + Math.random() * 0.2;
    m.userData.phase = Math.random() * Math.PI * 2;
    shards.add(m);
  }
  scene.add(shards);

  /* ---- interaction + loop -------------------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5);
      pointer.ty = (e.clientY / window.innerHeight - 0.5);
    },
    { passive: true }
  );

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  let firstDrawn = false;

  function frame() {
    // Pause heavy work when the light classroom theme is active.
    const active = document.documentElement.dataset.pageTheme !== "classroom";
    const t = clock.getElapsedTime();

    if (active) {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      if (!reduced) {
        die.rotation.y = t * 0.28 + pointer.x * 0.8;
        die.rotation.x = Math.sin(t * 0.35) * 0.28 + pointer.y * 0.6;
        die.position.y = 0.25 + Math.sin(t * 0.6) * 0.16;
        shards.children.forEach((m) => {
          m.rotation.x += m.userData.spin;
          m.rotation.y += m.userData.spin * 1.3;
          m.position.y += Math.sin(t * m.userData.drift + m.userData.phase) * 0.002;
        });
        shards.rotation.y = t * 0.02 + pointer.x * 0.3;
      } else {
        die.rotation.set(-0.35, 0.6, 0);
      }
      camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.05;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      if (!firstDrawn) {
        firstDrawn = true;
        done();
      }
    }
    requestAnimationFrame(frame);
  }
  frame();

  // Ensure the loader is released even if the first active frame is delayed.
  window.setTimeout(done, 1500);
} catch (err) {
  // No WebGL / import failure: let the app proceed on the flat dark background.
  console.warn("[gt] WebGL entry disabled:", err && err.message);
  done();
}
