// 機關塔 3D — 視覺層（three.js）。物理全部在 sim.js（Rapier），這裡只負責把物理世界畫出來。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import RAPIER from "../lib/rapier.es.js";
import { createTower, CFG, floorHeight } from "./sim.js";

const $ = (id) => document.getElementById(id);
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ================= 渲染器 / 場景 ================= */
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSmall, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.FogExp2(0x07051a, 0.018);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 200);
const HOME_POS = new THREE.Vector3(10.2, 8.6, 11.8);
const HOME_TARGET = new THREE.Vector3(0, 5.0, 0);
camera.position.copy(isSmall ? HOME_POS.clone().multiplyScalar(1.35) : HOME_POS);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.2;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;
controls.addEventListener("start", () => { controls.autoRotate = false; $("hint").style.opacity = 0; });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* 燈光 */
scene.add(new THREE.HemisphereLight(0x6b7cff, 0x1a0820, 0.55));
const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
key.position.set(7, 18, 9);
key.castShadow = true;
key.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 8, bottom: -6, near: 4, far: 40 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
key.target.position.set(0, 4, 0);
scene.add(key, key.target);
for (const [c, p, i] of [[0xff2bd6, [-5, 3, 4], 30], [0x00f0ff, [5, 6, -4], 30], [0xfcee0a, [-4, 9, -5], 18], [0x7cff6b, [4, 2, 5], 16]]) {
  const l = new THREE.PointLight(c, i, 14, 1.6);
  l.position.set(...p);
  scene.add(l);
}

/* ================= 材質 ================= */
const M = {
  chrome: new THREE.MeshStandardMaterial({ color: 0xb4bccc, metalness: 1, roughness: 0.24 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x24263a, metalness: 0.85, roughness: 0.38 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.28 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc8704a, metalness: 1, roughness: 0.3 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
};
const neon = (c, i = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i, metalness: 0.2, roughness: 0.5 });
const anodized = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.3, emissive: c, emissiveIntensity: 0.12 });

/* ================= 啟動物理 ================= */
await RAPIER.init();
const sim = await createTower(RAPIER, { balls: isSmall ? 30 : 42 });

/* ================= 軌道 ================= */
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function tube(points, radius, radial = 6, every = 2) {
  const pts = [];
  for (let i = 0; i < points.length; i += every) pts.push(v3(points[i]));
  if ((points.length - 1) % every) pts.push(v3(points[points.length - 1]));
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(2, pts.length), radius, radial, false);
}
function rodMatrix(a, b, r) {
  const A = v3(a), B = v3(b);
  const d = B.clone().sub(A); const L = d.length();
  tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), tmpQ, new THREE.Vector3(r, L, r));
}

{
  const chromeGeos = [], accentGeos = new Map();
  const tieMats = [], rodMats = [];
  for (const tr of sim.tracks) {
    for (const rail of tr.bottom) { const g = tube(rail, CFG.railR); g && chromeGeos.push(g); }
    const col = tr.color ?? 0xffffff;
    if (!accentGeos.has(col)) accentGeos.set(col, []);
    for (const run of tr.guardRuns) for (const side of [run.l, run.r]) { const g = tube(side, CFG.railR * 0.85); g && accentGeos.get(col).push(g); }
    for (const run of tr.capRuns) { const g = tube(run, CFG.railR * 0.85); g && accentGeos.get(col).push(g); }
    // 枕木 + 護欄支架
    for (let i = 2; i < tr.P.length - 2; i += 5) {
      const P = tr.P[i], N = tr.N[i], S = tr.S[i], T = tr.T[i];
      const c = [P[0] - N[0] * (CFG.railH + 0.035), P[1] - N[1] * (CFG.railH + 0.035), P[2] - N[2] * (CFG.railH + 0.035)];
      tmpM.makeBasis(v3(S), v3(N), v3(T));
      tmpQ.setFromRotationMatrix(tmpM);
      tieMats.push(new THREE.Matrix4().compose(v3(c), tmpQ.clone(), new THREE.Vector3(0.25, 0.022, 0.035)));
      if (tr.hasGuard[i] && i % 10 === 2) {
        for (const sgn of [-1, 1]) {
          const g = [P[0] + S[0] * sgn * CFG.guardS + N[0] * CFG.guardZ, P[1] + S[1] * sgn * CFG.guardS + N[1] * CFG.guardZ, P[2] + S[2] * sgn * CFG.guardS + N[2] * CFG.guardZ];
          const e = [c[0] + S[0] * sgn * 0.125, c[1] + S[1] * sgn * 0.125, c[2] + S[2] * sgn * 0.125];
          rodMats.push(rodMatrix(g, e, 0.009));
        }
      }
    }
  }
  const rails = new THREE.Mesh(mergeGeometries(chromeGeos), M.chrome);
  rails.castShadow = true; rails.receiveShadow = true;
  scene.add(rails);
  for (const [col, geos] of accentGeos) { if (!geos.length) continue; const m = new THREE.Mesh(mergeGeometries(geos), anodized(col)); m.castShadow = true; scene.add(m); }
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.darkMetal, tieMats.length);
  tieMats.forEach((m, i) => ties.setMatrixAt(i, m));
  ties.castShadow = true;
  scene.add(ties);
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), M.darkMetal, rodMats.length);
  rodMats.forEach((m, i) => rods.setMatrixAt(i, m));
  scene.add(rods);
}

/* ================= 地板 / 塔身 ================= */
function gridTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = "rgba(255,43,214,0.55)"; g.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  g.strokeStyle = "rgba(0,240,255,0.9)"; g.lineWidth = 3;
  for (let r = 64; r < 512; r += 96) { g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
{
  const f = sim.floor;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(f.verts), uv = new Float32Array((f.verts.length / 3) * 2);
  for (let i = 0; i < f.verts.length / 3; i++) { uv[2 * i] = f.verts[3 * i] / (2 * CFG.floorR) + 0.5; uv[2 * i + 1] = f.verts[3 * i + 2] / (2 * CFG.floorR) + 0.5; }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(f.idx); geo.computeVertexNormals();
  const tex = gridTexture();
  const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x15132a, metalness: 0.6, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  floor.receiveShadow = true;
  scene.add(floor);
  // 外圍擋牆與底座
  const rimPts = [];
  for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; const x = CFG.floorR * Math.cos(a), z = CFG.floorR * Math.sin(a); rimPts.push(new THREE.Vector3(x, floorHeight(x, z) + 0.4, z)); }
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 256, 0.035, 8, true), neon(0x00f0ff, 1.8));
  scene.add(rim);
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(CFG.floorR, CFG.floorR, 1.0, 128, 1, true), new THREE.MeshStandardMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, emissive: 0x00f0ff, emissiveIntensity: 0.15 }));
  fence.position.y = 1.0; scene.add(fence);
  const fenceTop = new THREE.Mesh(new THREE.TorusGeometry(CFG.floorR, 0.015, 6, 160), neon(0xff2bd6, 1.4));
  fenceTop.rotation.x = Math.PI / 2; fenceTop.position.y = 1.5; scene.add(fenceTop);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(CFG.floorR + 0.25, CFG.floorR + 0.6, 0.35, 96, 1, true), M.darkMetal);
  base.position.y = 0.15; scene.add(base);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x07061a, metalness: 0.3, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(CFG.floorR + 0.7, CFG.floorR + 0.78, 128), neon(0xff2bd6, 2));
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.0; scene.add(glowRing);

  // 塔身：8 根柱子 + 5 層霓虹環
  const R = CFG.towerR, H = 11.4;
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4);
    const x = R * Math.cos(a), z = R * Math.sin(a);
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, H, 10), M.darkMetal);
    pil.position.set(x, H / 2, z); pil.castShadow = true; scene.add(pil);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.015, H - 0.4, 0.015), neon(k % 2 ? 0xff2bd6 : 0x00f0ff, 1.2));
    strip.position.set(x * 0.985, H / 2, z * 0.985); scene.add(strip);
  }
  const levels = [2.2, 4.4, 6.6, 8.8, 11.0];
  levels.forEach((y, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 8, 160), new THREE.MeshStandardMaterial({ color: 0x1a1b2e, metalness: 0.9, roughness: 0.3, emissive: i % 2 ? 0xff2bd6 : 0x00f0ff, emissiveIntensity: i % 2 ? 1.6 : 1.0 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = y; scene.add(ring);
    scene.add(makeLabel(`${i + 1}F`, [R * Math.cos(Math.PI / 8) * 1.04, y - 0.25, R * Math.sin(Math.PI / 8) * 1.04], 0.5, "#fcee0a"));
  });
}

/* ================= 升降機：集球槽、中央柱、旋轉推板、齒輪組 ================= */
function gearGeometry(teeth, module, thickness, holeR = 0) {
  const pr = (module * teeth) / 2, rt = pr + module * 0.8, rr = pr - module * 0.9;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, s = (Math.PI * 2) / teeth;
    const p = [[a, rr], [a + s * 0.12, rr], [a + s * 0.27, rt], [a + s * 0.48, rt], [a + s * 0.63, rr], [a + s, rr]];
    p.forEach(([ang, r], j) => { const x = r * Math.cos(ang), y = r * Math.sin(ang); if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
  }
  if (holeR) { const h = new THREE.Path(); h.absarc(0, 0, holeR, 0, Math.PI * 2, true); shape.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -thickness / 2);
  return { geo: g, pr };
}
function spokedGear(teeth, module, thickness, mat) {
  const grp = new THREE.Group();
  const { geo, pr } = gearGeometry(teeth, module, thickness, pr0(teeth, module) * 0.7);
  grp.add(new THREE.Mesh(geo, mat));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.18, pr * 0.18, thickness * 1.6, 16), M.darkMetal);
  hub.rotation.x = Math.PI / 2; grp.add(hub);
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(pr * 0.62, thickness * 0.7, thickness * 0.7), mat);
    const a = (k / 5) * Math.PI * 2; sp.position.set(Math.cos(a) * pr * 0.45, Math.sin(a) * pr * 0.45, 0); sp.rotation.z = a; grp.add(sp);
  }
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { grp, pr };
}
const pr0 = (t, m) => (m * t) / 2;

const lift = new THREE.Group();
scene.add(lift);
const gearsToSpin = []; // { obj, ratio, src: 'lift' | wheel }
{
  const T = sim.trough;
  // 槽底與槽牆
  const troughFloor = new THREE.Mesh(new THREE.RingGeometry(T.rIn, 0.76, 64), new THREE.MeshStandardMaterial({ color: 0x1b1d33, metalness: 0.7, roughness: 0.4 }));
  troughFloor.rotation.x = -Math.PI / 2; troughFloor.position.y = T.y + 0.002; troughFloor.receiveShadow = true; scene.add(troughFloor);
  // 開口：世界角度 = -θ
  // CylinderGeometry 的角度 θ 與世界角度 φ 的關係：θ = π/2 − φ；開口在 φ ∈ [−openB, −openA]
  const gapLen = T.openB - T.openA;
  const wallGeo = new THREE.CylinderGeometry(T.rOut, T.rOut, T.wallTop - T.y + 0.05, 64, 1, true, Math.PI / 2 + T.openB - 2 * Math.PI, 2 * Math.PI - gapLen);
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c48, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
  wall.position.y = (T.wallTop + T.y) / 2 - 0.025; scene.add(wall);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(T.rOut, 0.02, 6, 64, 2 * Math.PI - gapLen), neon(0xff7a1a, 2.6));
  lip.rotation.x = Math.PI / 2; lip.rotation.z = -T.openA; lip.position.y = T.wallTop; scene.add(lip);
  // 中央柱
  const post = new THREE.Mesh(new THREE.CylinderGeometry(T.rIn, T.rIn, 11.25, 32), new THREE.MeshStandardMaterial({ color: 0x16172a, metalness: 0.9, roughness: 0.3 }));
  post.position.y = 11.25 / 2; post.castShadow = true; scene.add(post);
  for (let y = 0.9; y < 11; y += 0.55) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(T.rIn + 0.004, 0.01, 6, 40), neon(y % 1.1 < 0.55 ? 0x00f0ff : 0xff7a1a, 1.4));
    band.rotation.x = Math.PI / 2; band.position.y = y; scene.add(band);
  }
  // 旋轉推板（與物理的運動學剛體同步）
  const cage = sim.cage;
  const paddleMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00c8ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.18, metalness: 0.2, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < cage.bars; k++) {
    const a = (k / cage.bars) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.29, cage.y1 - cage.y0, 0.024), paddleMat);
    p.position.set(CFG.liftR * Math.cos(a), (cage.y0 + cage.y1) / 2, -CFG.liftR * Math.sin(a));
    p.rotation.y = a;
    lift.add(p);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.01, cage.y1 - cage.y0, 0.026), neon(0x00f0ff, 0.9));
    edge.position.set((CFG.liftR + 0.145) * Math.cos(a), (cage.y0 + cage.y1) / 2, -(CFG.liftR + 0.145) * Math.sin(a));
    edge.rotation.y = a;
    lift.add(edge);
  }
  // 頂部大齒輪 + 馬達小齒輪 + 惰輪
  const m = 0.045;
  const big = spokedGear(36, m, 0.07, M.brass);
  big.grp.rotation.x = -Math.PI / 2; big.grp.position.y = 11.02;
  const bigHolder = new THREE.Group(); bigHolder.add(big.grp); lift.add(bigHolder);
  const hubDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.05, 48), M.darkMetal);
  hubDisc.position.y = 10.88; lift.add(hubDisc);
  const pin = spokedGear(12, m, 0.08, M.copper);
  const pinHolder = new THREE.Group(); pinHolder.position.set(big.pr + pin.pr, 11.02, 0); pin.grp.rotation.x = -Math.PI / 2; pinHolder.add(pin.grp); scene.add(pinHolder);
  gearsToSpin.push({ obj: pinHolder, axis: "y", ratio: -36 / 12, phase: Math.PI / 12, src: "lift" });
  const idl = spokedGear(20, m, 0.07, M.brass);
  const idlHolder = new THREE.Group(); idlHolder.position.set(big.pr + pin.pr * 2 + idl.pr, 11.02, 0); idl.grp.rotation.x = -Math.PI / 2; idlHolder.add(idl.grp); scene.add(idlHolder);
  gearsToSpin.push({ obj: idlHolder, axis: "y", ratio: (36 / 12) * (12 / 20), phase: 0, src: "lift" });
  // 馬達
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 24), new THREE.MeshStandardMaterial({ color: 0x30324f, metalness: 0.8, roughness: 0.3, emissive: 0xff2bd6, emissiveIntensity: 0.15 }));
  motor.position.set(big.pr + pin.pr, 11.3, 0); motor.castShadow = true; scene.add(motor);
  const motorRing = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.012, 6, 32), neon(0xff2bd6, 3));
  motorRing.rotation.x = Math.PI / 2; motorRing.position.set(big.pr + pin.pr, 11.42, 0); scene.add(motorRing);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(big.pr + pin.pr * 2 + idl.pr * 2 + 0.3, 0.06, 0.16), M.darkMetal);
  beam.position.set((big.pr + pin.pr * 2 + idl.pr * 2) / 2, 11.12, 0); scene.add(beam);
}

/* ================= 動態零件（分球器、翻斗、水車）================= */
const parts = [];
function partGroup(body, shapes, matFor) {
  const g = new THREE.Group();
  for (const s of shapes) {
    let mesh;
    if (s.type === "box") mesh = new THREE.Mesh(new THREE.BoxGeometry(s.half[0] * 2, s.half[1] * 2, s.half[2] * 2), matFor(s));
    else mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.hh * 2, 40), matFor(s));
    mesh.position.set(...s.pos);
    mesh.quaternion.set(...s.q);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  scene.add(g);
  parts.push({ body, g });
  return g;
}
const seesawMats = { plate: anodized(0xff2bd6), ridge: neon(0xfcee0a, 2.5), wall: M.glass, lip: anodized(0xff2bd6) };
for (const ss of sim.seesaws) {
  partGroup(ss.body, ss.shapes, (s) => seesawMats[s.role]);
  // 支點座
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), M.darkMetal);
  stand.position.set(ss.pivot[0], ss.pivot[1] - 0.25, ss.pivot[2]); scene.add(stand);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 12), M.brass);
  axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(ss.lz)); axle.position.set(...ss.pivot); scene.add(axle);
}
const trayMats = { floor: anodized(0x00f0ff), wall: anodized(0x00f0ff), side: M.glass, arm: M.darkMetal, weight: M.copper };
for (const tr of sim.trays) {
  partGroup(tr.body, tr.shapes, (s) => trayMats[s.role]);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 12), M.brass);
  axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(tr.lz)); axle.position.set(...tr.pivot); scene.add(axle);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), M.darkMetal);
  stand.position.set(tr.pivot[0], tr.pivot[1] - 0.45, tr.pivot[2]); scene.add(stand);
}
const wheelMats = { hub: M.brass, disc: new THREE.MeshPhysicalMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false, emissive: 0x7cff6b, emissiveIntensity: 0.25 }), paddle: anodized(0x7cff6b) };
for (const w of sim.wheels) {
  partGroup(w.body, w.shapes, (s) => wheelMats[s.role]);
  // 齒輪組：輪軸上的齒輪帶動兩個齒輪
  const basis = new THREE.Matrix4().makeBasis(v3(w.lx), new THREE.Vector3(0, 1, 0), v3(w.lz));
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  const m = 0.04;
  const g1 = spokedGear(16, m, 0.05, M.brass), g2 = spokedGear(10, m, 0.05, M.copper), g3 = spokedGear(22, m, 0.05, M.brass);
  const off = 0.3;
  const mk = (gear, local) => { const h = new THREE.Group(); h.quaternion.copy(q); h.position.copy(v3(w.center).add(v3(w.lx).multiplyScalar(local[0])).add(new THREE.Vector3(0, local[1], 0)).add(v3(w.lz).multiplyScalar(off))); const inner = new THREE.Group(); inner.add(gear.grp); h.add(inner); scene.add(h); return inner; };
  const i1 = mk(g1, [0, 0]);
  const d12 = g1.pr + g2.pr, d23 = g2.pr + g3.pr;
  const i2 = mk(g2, [-d12, 0]);
  const i3 = mk(g3, [-d12, -d23]);
  gearsToSpin.push({ obj: i1, axis: "z", ratio: 1, phase: 0, src: w });
  gearsToSpin.push({ obj: i2, axis: "z", ratio: -16 / 10, phase: Math.PI / 10, src: w });
  gearsToSpin.push({ obj: i3, axis: "z", ratio: (16 / 10) * (10 / 22), phase: 0, src: w });
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), M.chrome);
  axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(w.lz)); axle.position.copy(v3(w.center).add(v3(w.lz).multiplyScalar(0.12))); scene.add(axle);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), M.darkMetal);
  stand.position.copy(v3(w.center).add(v3(w.lz).multiplyScalar(0.42)).add(new THREE.Vector3(0, -0.6, 0))); scene.add(stand);
}

/* ================= 漏斗 / 集球斗 / 彈跳板 ================= */
for (const f of sim.funnels) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(f.verts, 3));
  geo.setIndex(f.idx); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, M.glass));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: f.kind === "hopper" ? 0xfcee0a : 0x7cff6b, transparent: true, opacity: 0.9 }));
  scene.add(edges);
}
const plateMeshes = sim.plates.map((p) => {
  const mat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2, emissive: 0xfcee0a, emissiveIntensity: 0.35 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2), mat);
  m.position.set(...p.center); m.quaternion.set(...p.q); m.castShadow = true; scene.add(m);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), M.darkMetal);
  post.position.set(p.center[0], p.center[1] - 0.32, p.center[2]); scene.add(post);
  return { m, mat, flash: 0 };
});

/* ================= 球 ================= */
const ballGeo = new THREE.SphereGeometry(CFG.ballR, isSmall ? 18 : 28, isSmall ? 12 : 20);
const ballMeshes = [];
function syncBallMeshes() {
  while (ballMeshes.length < sim.balls.length) {
    const b = sim.balls[ballMeshes.length];
    const mat = new THREE.MeshStandardMaterial({ color: b.color, metalness: 0.6, roughness: 0.15, emissive: b.color, emissiveIntensity: 0.9 });
    const mesh = new THREE.Mesh(ballGeo, mat);
    mesh.castShadow = true;
    scene.add(mesh);
    ballMeshes.push(mesh);
  }
}
syncBallMeshes();

/* ================= 文字標籤 ================= */
function makeLabel(text, pos, h = 0.3, color = "#00f0ff") {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const fs = 64;
  g.font = `900 ${fs}px "Noto Sans TC", sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 48;
  c.width = w; c.height = fs + 36;
  g.font = `900 ${fs}px "Noto Sans TC", sans-serif`;
  g.fillStyle = "rgba(8,6,20,0.72)"; g.fillRect(0, 0, w, c.height);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, c.height - 4);
  g.fillStyle = color; g.textBaseline = "middle"; g.shadowColor = color; g.shadowBlur = 12;
  g.fillText(text, 24, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set((h * w) / c.height, h, 1);
  sp.position.set(...pos);
  return sp;
}
const labels = new THREE.Group();
for (const l of sim.labels) labels.add(makeLabel(l.text, l.p));
scene.add(labels);

/* ================= 音效（WebAudio 合成）================= */
let audio = null;
function tone(freq, dur = 0.4, type = "sine", vol = 0.18) {
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const NOTES = [523.25, 659.25, 783.99, 1046.5];
sim.onPlateHit = (i) => { plateMeshes[i].flash = 1; tone(NOTES[sim.plates[i].note % 4] ?? 660, 0.6, "triangle", 0.2); tone((NOTES[sim.plates[i].note % 4] ?? 660) * 2, 0.25, "sine", 0.05); };
sim.onSeesawFlip = () => tone(240, 0.06, "square", 0.04);
let lastDumps = 0;

/* ================= UI ================= */
let paused = false, slow = false, follow = null;
const setPressed = (el, on) => el.setAttribute("aria-pressed", on ? "true" : "false");
$("bAdd").onclick = () => {
  for (let i = 0; i < 5 && sim.balls.length < 90; i++) { const p = sim.randomFloorPos(); p[1] += 2.5 + i * 0.4; sim.addBall(p); }
  syncBallMeshes();
};
$("bPause").onclick = (e) => { paused = !paused; setPressed(e.currentTarget, paused); e.currentTarget.textContent = paused ? "▶ 繼續" : "⏸ 暫停"; };
$("bSlow").onclick = (e) => { slow = !slow; setPressed(e.currentTarget, slow); };
$("bSound").onclick = (e) => {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  else if (audio.state === "running") { audio.suspend(); setPressed(e.currentTarget, false); e.currentTarget.textContent = "🔇 音效"; return; }
  audio.resume(); setPressed(e.currentTarget, true); e.currentTarget.textContent = "🔊 音效"; tone(784, 0.3, "triangle", 0.15);
};
$("bLabels").onclick = (e) => { labels.visible = !labels.visible; setPressed(e.currentTarget, labels.visible); };
$("bView").onclick = () => { follow = null; setPressed($("bFollow"), false); camera.position.copy(isSmall ? HOME_POS.clone().multiplyScalar(1.35) : HOME_POS); controls.target.copy(HOME_TARGET); controls.enabled = true; };
$("bFollow").onclick = (e) => {
  if (follow) { follow = null; setPressed(e.currentTarget, false); controls.enabled = true; return; }
  const cands = sim.balls.filter((b) => { const t = b.body.translation(); return t.y > 2 && Math.hypot(t.x, t.z) > 0.8; });
  const pick = cands.length ? cands[(Math.random() * cands.length) | 0] : sim.balls.find((b) => Math.hypot(b.body.translation().x, b.body.translation().z) < 0.8) || sim.balls[0];
  follow = pick; setPressed(e.currentTarget, true); controls.autoRotate = false; controls.enabled = false;
};
$("panelToggle").onclick = (e) => { const p = $("panel"); p.classList.toggle("collapsed"); e.currentTarget.setAttribute("aria-expanded", !p.classList.contains("collapsed")); e.currentTarget.textContent = p.classList.contains("collapsed") ? "即時數據 ▸" : "即時數據 ▾"; };
if (isSmall) $("panelToggle").click();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= 主迴圈 ================= */
let acc = 0, last = performance.now(), simAdvanced = 0, realElapsed = 0, stepCount = 0;
const followPos = new THREE.Vector3(), followLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
const trail = { pts: [], line: null };
{
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(120 * 3), 3));
  trail.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  trail.line.frustumCulled = false; scene.add(trail.line);
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += realDt * (slow ? 0.2 : 1);
    const t0 = performance.now();
    let steps = 0;
    while (acc >= CFG.dt && steps < 16) {
      sim.step(); acc -= CFG.dt; steps++; stepCount++;
      if (stepCount % 12 === 0) sim.track();
      if (performance.now() - t0 > 12) break;
    }
    if (acc > CFG.dt * 4) acc = 0; // 跟不上就放慢（物理照樣正確，只是時間變慢）
    simAdvanced += steps * CFG.dt; realElapsed += realDt;
  }

  // 同步物理 → 畫面
  sim.balls.forEach((b, i) => { const t = b.body.translation(), r = b.body.rotation(); ballMeshes[i].position.set(t.x, t.y, t.z); ballMeshes[i].quaternion.set(r.x, r.y, r.z, r.w); });
  for (const p of parts) { const t = p.body.translation(), r = p.body.rotation(); p.g.position.set(t.x, t.y, t.z); p.g.quaternion.set(r.x, r.y, r.z, r.w); }
  lift.rotation.y = sim.liftAngle;
  for (const gs of gearsToSpin) {
    const src = gs.src === "lift" ? sim.liftAngle : gs.src.angle || 0;
    gs.obj.rotation[gs.axis] = src * gs.ratio + gs.phase;
  }
  for (const pm of plateMeshes) { pm.flash *= 0.9; pm.mat.emissiveIntensity = 0.35 + pm.flash * 4; }
  if (labels.visible) for (const sp of labels.children) { const d = sp.position.distanceTo(camera.position); sp.material.opacity = Math.min(1, Math.max(0, (d - 2.2) / 3)); }
  const tr = sim.trays[0];
  if (tr && tr.dumps !== lastDumps) { lastDumps = tr.dumps; tone(98, 0.5, "sine", 0.3); tone(147, 0.4, "triangle", 0.12); }

  // 跟隨鏡頭
  if (follow) {
    const t = follow.body.translation(), v = follow.body.linvel();
    const sp = Math.hypot(v.x, v.z);
    const dir = sp > 0.3 ? tmpV.set(v.x / sp, 0, v.z / sp) : tmpV.set(1, 0, 0);
    followPos.set(t.x - dir.x * 1.9, t.y + 0.95, t.z - dir.z * 1.9);
    const k1 = 1 - Math.exp(-realDt * 3.5), k2 = 1 - Math.exp(-realDt * 12);
    camera.position.lerp(followPos, k1);
    followLook.lerp(tmpV.set(t.x, t.y, t.z), k2);
    camera.lookAt(followLook);
    controls.target.copy(followLook);
    trail.pts.push(t.x, t.y, t.z); if (trail.pts.length > 360) trail.pts.splice(0, 3);
    const arr = trail.line.geometry.attributes.position.array; arr.fill(0); arr.set(trail.pts);
    trail.line.geometry.setDrawRange(0, trail.pts.length / 3); trail.line.geometry.attributes.position.needsUpdate = true;
    trail.line.material.color.set(follow.color);
    trail.line.visible = true;
  } else {
    trail.pts.length = 0; trail.line.visible = false;
    controls.update();
  }
  composer.render();
}

/* 數據面板 */
setInterval(() => {
  const c = sim.counters;
  $("sBalls").textContent = sim.balls.length;
  $("sLift").textContent = c["升降機頂"] || 0;
  $("sSplit").textContent = `${c["S1→左"] || 0} / ${c["S1→右"] || 0}`;
  $("sTray").textContent = c["翻斗"] || 0;
  if (sim.trays[0]) {
    const tr = sim.trays[0], p = tr.pivot;
    const n = sim.balls.filter((b) => { const t = b.body.translation(); return Math.hypot(t.x - (p[0] + tr.lx[0] * 0.55), t.z - (p[2] + tr.lx[2] * 0.55)) < 0.55 && Math.abs(t.y - p[1] - 0.25) < 0.25; }).length;
    $("sTrayN").textContent = `${Math.min(n, 4)} / 4`;
  }
  $("sBounce").textContent = c["彈跳"] || 0;
  $("sSpeed").textContent = realElapsed > 0.5 ? `${(simAdvanced / realElapsed).toFixed(2)}×` : "—";
  simAdvanced = 0; realElapsed = 0;
}, 1000);

window.__tower = { sim, renderer, camera, controls };
$("loading").classList.add("done");
requestAnimationFrame((t) => { last = t; frame(t); });
