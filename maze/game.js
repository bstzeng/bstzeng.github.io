// 霓虹滾球 — 畫面、陀螺儀、介面、音效
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LEVELS } from "./levels.js";
import { P, createWorld, newBall, respawn, step } from "./physics.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("maze." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("maze." + k, JSON.stringify(v)); } catch {} },
};
const portrait = () => window.innerHeight > window.innerWidth;
const settings = Object.assign({ tilt: 66, zoom: portrait() ? 15 : 11, yaw: 0, sens: 1, ghost: false, low: false, sound: true }, store.get("settings", {}));
const progress = Object.assign({ unlocked: 1, best: {} }, store.get("progress", {}));
const WALL_H = 0.55;

/* ================= 渲染器 ================= */
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.Fog(0x07051a, 18, 45);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.35, 0.93);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x8090ff, 0x200a24, 0.7));
const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const ballLight = new THREE.PointLight(0xff2bd6, 3, 3.5, 1.8);
scene.add(ballLight);

/* ================= 貼圖（程式產生的龐克風材質）================= */
function canvasTex(size, draw, repeat) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const floorTex = canvasTex(256, (g, s) => {
  g.fillStyle = "#1a1830"; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  g.strokeStyle = "#0c0b18"; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
  g.strokeStyle = "rgba(0,240,255,0.35)"; g.lineWidth = 2; g.strokeRect(9, 9, s - 18, s - 18);
  for (const [x, y] of [[22, 22], [s - 22, 22], [22, s - 22], [s - 22, s - 22]]) { g.fillStyle = "#3a3858"; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = "#77749a"; g.beginPath(); g.arc(x - 2, y - 2, 3, 0, 7); g.fill(); }
});
const floorEmis = canvasTex(256, (g, s) => { g.fillStyle = "#000"; g.fillRect(0, 0, s, s); g.strokeStyle = "rgba(0,240,255,0.5)"; g.lineWidth = 2; g.strokeRect(9, 9, s - 18, s - 18); });
const wallTex = canvasTex(256, (g, s) => {
  g.fillStyle = "#2a2840"; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
  g.save(); g.beginPath(); g.rect(0, s * 0.72, s, s * 0.28); g.clip();
  for (let x = -s; x < s * 2; x += 40) { g.fillStyle = "#fcee0a"; g.beginPath(); g.moveTo(x, s); g.lineTo(x + 20, s); g.lineTo(x + 20 + s * 0.28, s * 0.72); g.lineTo(x + s * 0.28, s * 0.72); g.fill(); }
  g.restore();
  g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, s * 0.72, s, s * 0.28);
  g.strokeStyle = "#141225"; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
  for (const [x, y] of [[18, 18], [s - 18, 18], [18, s * 0.6], [s - 18, s * 0.6]]) { g.fillStyle = "#8a87aa"; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
});
const hazardTex = canvasTex(128, (g, s) => {
  g.fillStyle = "#111"; g.fillRect(0, 0, s, s);
  g.fillStyle = "#fcee0a";
  for (let x = -s; x < s * 2; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 - s, s); g.lineTo(x - s, s); g.fill(); }
}, true);
const arrowTex = canvasTex(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = "#ff7a1a"; g.lineWidth = 12; g.lineCap = "round"; g.lineJoin = "round"; g.shadowColor = "#ff7a1a"; g.shadowBlur = 10;
  for (const y of [0.3, 0.75]) { g.beginPath(); g.moveTo(s * 0.25, s * (y - 0.18)); g.lineTo(s * 0.5, s * (y - 0.36) + s * 0.18 * 0); g.stroke(); }
  g.clearRect(0, 0, s, s);
  for (const off of [0, 0.5]) { g.beginPath(); g.moveTo(s * 0.2, s * (0.35 + off)); g.lineTo(s * 0.5, s * (0.12 + off)); g.lineTo(s * 0.8, s * (0.35 + off)); g.stroke(); }
}, true);
const gridTex = canvasTex(512, (g, s) => {
  g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
  g.strokeStyle = "rgba(255,43,214,.6)"; g.lineWidth = 2;
  for (let i = 0; i <= s; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
}, true);
gridTex.repeat.set(10, 10);

const neon = (c, i = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i });
const M = {
  floor: new THREE.MeshStandardMaterial({ map: floorTex, emissiveMap: floorEmis, emissive: 0xffffff, emissiveIntensity: 0.22, metalness: 0.6, roughness: 0.5 }),
  wall: new THREE.MeshStandardMaterial({ map: wallTex, metalness: 0.7, roughness: 0.45 }),
  base: new THREE.MeshStandardMaterial({ color: 0x14122a, metalness: 0.85, roughness: 0.35 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc9cfdc, metalness: 1, roughness: 0.1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x050409, roughness: 1, side: THREE.BackSide }),
  hazard: new THREE.MeshStandardMaterial({ map: hazardTex, metalness: 0.5, roughness: 0.4, emissive: 0xfcee0a, emissiveMap: hazardTex, emissiveIntensity: 0.25 }),
};

// 背景：板子下方的霓虹地面
const under = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.55 }));
under.rotation.x = -Math.PI / 2; under.position.y = -4; scene.add(under);

/* ================= 球 ================= */
const ball = new THREE.Mesh(new THREE.SphereGeometry(P.R, 48, 32), M.chrome);
ball.castShadow = true;
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(P.R * 0.95, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2;

/* ================= 關卡建構 ================= */
let board = null, W = null, B = null, lvIndex = 0, lv = {};
const disposables = [];

function buildLevel() {
  if (board) { scene.remove(board); disposables.forEach((d) => d.dispose && d.dispose()); disposables.length = 0; }
  board = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.set(-W.w / 2, 0, -W.h / 2);
  board.add(inner);
  scene.add(board);
  lv = { inner, holes: [], cps: [], bumpers: [], doors: [], switches: [], movers: [], spinners: [], boosts: [], goalFx: null, wallGroup: null };

  // 地板：一般格子合併成一塊，洞的格子挖圓孔
  const floorGeos = [];
  const holeShape = (() => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1, 0); s.lineTo(1, 1); s.lineTo(0, 1); s.lineTo(0, 0);
    const h = new THREE.Path(); h.absarc(0.5, 0.5, P.HOLE_R, 0, Math.PI * 2, true); s.holes.push(h);
    return s;
  })();
  for (let j = 0; j < W.h; j++) for (let i = 0; i < W.w; i++) {
    const c = W.map[j][i];
    if (c === "#") continue;
    let g;
    if (c === "O" || c === "G") {
      g = new THREE.ShapeGeometry(holeShape, 32);
      g.rotateX(-Math.PI / 2); g.translate(i, 0, j + 1); // (x,y)→(x,0,-y)，三角形朝上
    } else {
      g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(i + 0.5, 0, j + 0.5);
    }
    floorGeos.push(g.index ? g.toNonIndexed() : g);
  }
  // 法線一致朝上
  const floorGeo = mergeGeometries(floorGeos);
  floorGeo.computeVertexNormals();
  const n = floorGeo.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  const floor = new THREE.Mesh(floorGeo, M.floor); floor.receiveShadow = true; inner.add(floor); disposables.push(floorGeo);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W.w + 0.4, 0.5, W.h + 0.4), M.base);
  base.position.set(W.w / 2, -0.27, W.h / 2); inner.add(base);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W.w + 0.4, 0.5, W.h + 0.4)), new THREE.LineBasicMaterial({ color: 0xff2bd6 }));
  outline.position.copy(base.position); inner.add(outline);

  // 牆：方塊 + 牆頂朝向通道那一側的霓虹邊條
  const wallGroup = new THREE.Group(); inner.add(wallGroup); lv.wallGroup = wallGroup;
  const wallGeos = [], stripGeos = [];
  const isWall = (i, j) => (W.map[j]?.[i] ?? "#") === "#";
  for (let j = 0; j < W.h; j++) for (let i = 0; i < W.w; i++) {
    if (!isWall(i, j)) continue;
    // 完全被牆包住的格子不用畫
    if (isWall(i + 1, j) && isWall(i - 1, j) && isWall(i, j + 1) && isWall(i, j - 1) && isWall(i + 1, j + 1) && isWall(i - 1, j - 1) && isWall(i + 1, j - 1) && isWall(i - 1, j + 1)) continue;
    const g = new THREE.BoxGeometry(1, WALL_H, 1);
    // 牆頂用貼圖上半部（沒有警示條紋的鋼板區）
    const uv = g.attributes.uv; for (let k = 8; k < 12; k++) uv.setY(k, 0.35 + uv.getY(k) * 0.55);
    g.translate(i + 0.5, WALL_H / 2, j + 0.5); wallGeos.push(g);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWall(i + di, j + dj) || i + di < 0 || j + dj < 0 || i + di >= W.w || j + dj >= W.h) continue;
      const s = new THREE.BoxGeometry(di ? 0.04 : 1, 0.04, di ? 1 : 0.04);
      s.translate(i + 0.5 + di * 0.48, WALL_H + 0.01, j + 0.5 + dj * 0.48); stripGeos.push(s);
    }
  }
  const wallGeo = mergeGeometries(wallGeos); disposables.push(wallGeo);
  const walls = new THREE.Mesh(wallGeo, M.wall); walls.castShadow = true; walls.receiveShadow = true; wallGroup.add(walls);
  if (stripGeos.length) { const sg = mergeGeometries(stripGeos); disposables.push(sg); wallGroup.add(new THREE.Mesh(sg, neon(lvIndex % 2 ? 0xff2bd6 : 0x00f0ff, 1.5))); }

  // 洞 / 終點
  const holeGeo = new THREE.CylinderGeometry(P.HOLE_R, P.HOLE_R, 1.4, 32, 1, true);
  const mkHole = (h, color, goal) => {
    const g = new THREE.Group(); g.position.set(h.x, 0, h.z);
    const pit = new THREE.Mesh(holeGeo, M.dark); pit.position.y = -0.7; g.add(pit);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(P.HOLE_R + 0.015, 0.025, 8, 40), neon(color, goal ? 3 : 2.4));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.01; g.add(rim);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(P.HOLE_R, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: goal ? 0.55 : 0.25 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -1.35; g.add(glow);
    inner.add(g);
    return { g, rim };
  };
  for (const h of W.holes) lv.holes.push(mkHole(h, 0xff2a2a, false));
  const goal = mkHole(W.goal, 0xfcee0a, true);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(P.HOLE_R * 0.9, P.HOLE_R * 0.6, 3, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfcee0a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 1.5; goal.g.add(beam);
  const rings = [];
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(P.HOLE_R * (0.5 + k * 0.2), 0.012, 6, 32), neon(0xfcee0a, 3)); r.rotation.x = Math.PI / 2; goal.g.add(r); rings.push(r); }
  lv.goalFx = { ...goal, beam, rings };

  // 暫存點
  for (const cp of W.checkpoints) {
    const g = new THREE.Group(); g.position.set(cp.x, 0.012, cp.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 40), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    pillar.position.y = 0.6; g.add(pillar);
    inner.add(g); lv.cps.push({ cp, ring, pillar });
  }
  // 彈簧柱
  for (const bp of W.bumpers) {
    const g = new THREE.Group(); g.position.set(bp.x, 0, bp.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(P.bumperR, P.bumperR * 1.1, 0.42, 32), M.chrome); post.position.y = 0.21; post.castShadow = true; g.add(post);
    const mat = neon(0xff2bd6, 2);
    for (const y of [0.12, 0.3]) { const r = new THREE.Mesh(new THREE.TorusGeometry(P.bumperR + 0.01, 0.03, 8, 32), mat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
    const cap = new THREE.Mesh(new THREE.CircleGeometry(P.bumperR * 0.7, 24), mat); cap.rotation.x = -Math.PI / 2; cap.position.y = 0.425; g.add(cap);
    inner.add(g); lv.bumpers.push({ bp, g, mat });
  }
  // 加速帶
  const rot = { ">": -Math.PI / 2, "<": Math.PI / 2, "^": 0, v: Math.PI };
  for (const bo of W.boosts) {
    const t = arrowTex.clone(); t.needsUpdate = true; disposables.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: 0xffffff }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot[bo.dir]; m.position.set(bo.i + 0.5, 0.008, bo.j + 0.5);
    inner.add(m); lv.boosts.push(t);
  }
  // 開關 + 閘門
  for (const sw of W.switches) {
    const g = new THREE.Group(); g.position.set(sw.x, 0, sw.z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.04, 32), M.base); pad.position.y = 0.02; g.add(pad);
    const btnMat = neon(0xff2a2a, 2.5);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 32), btnMat); btn.position.y = 0.07; g.add(btn);
    inner.add(g); lv.switches.push({ sw, btn, btnMat });
  }
  for (const d of W.doors) {
    const g = new THREE.Group(); g.position.set(d.i + 0.5, 0, d.j + 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x330008, emissive: 0xff2a2a, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, metalness: 0.3, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, WALL_H, 0.98), mat); body.position.y = WALL_H / 2; g.add(body);
    for (let k = 0; k < 4; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 1.0), neon(0xff2a2a, 3)); bar.position.y = 0.1 + k * 0.13; g.add(bar); }
    inner.add(g); lv.doors.push(g);
  }
  // 推擠牆
  for (const m of W.movers) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.5, 0.94), M.hazard); box.position.y = 0.25; box.castShadow = true; g.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.5, 0.94)), new THREE.LineBasicMaterial({ color: 0xfcee0a }));
    edges.position.y = 0.25; g.add(edges);
    inner.add(g); lv.movers.push({ m, g });
  }
  // 旋轉臂
  for (const s of W.spinners) {
    const g = new THREE.Group(); g.position.set(s.cx, 0, s.cz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(P.hubR, P.hubR, 0.45, 24), M.chrome); hub.position.y = 0.22; g.add(hub);
    const arm = new THREE.Group(); g.add(arm);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.16, P.spinR * 2), new THREE.MeshStandardMaterial({ color: 0x400010, emissive: 0xff2a2a, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }));
    bar.position.y = 0.2; bar.castShadow = true; arm.add(bar);
    for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), neon(0xfcee0a, 3)); tip.position.set(sx * s.len, 0.2, 0); arm.add(tip); }
    inner.add(g); lv.spinners.push({ s, arm });
  }
  inner.add(ball); inner.add(ballShadow);

  // 光源跟著關卡大小
  sun.position.set(W.w * 0.3, 14, W.h * 0.2); sun.target.position.set(0, 0, 0);
  const span = Math.max(W.w, W.h) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  applyWallSettings();
}

function applyWallSettings() {
  if (!lv.wallGroup) return;
  lv.wallGroup.scale.y = settings.low ? 0.45 : 1;
  M.wall.transparent = settings.ghost; M.wall.opacity = settings.ghost ? 0.35 : 1; M.wall.depthWrite = !settings.ghost; M.wall.needsUpdate = true;
  for (const d of lv.doors) d.scale.y = settings.low ? 0.45 : 1;
}

/* ================= 音效 ================= */
let ac = null, rollGain = null, rollFilter = null;
function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  rollFilter = ac.createBiquadFilter(); rollFilter.type = "bandpass"; rollFilter.frequency.value = 300; rollFilter.Q.value = 0.8;
  rollGain = ac.createGain(); rollGain.gain.value = 0;
  src.connect(rollFilter).connect(rollGain).connect(ac.destination); src.start();
}
function tone(f, dur, type = "sine", vol = 0.15, f2) {
  if (!ac || !settings.sound) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
}
let lastHit = 0;
const vib = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const events = {
  onHit(v, kind) {
    const now = performance.now();
    if (v < 0.9 || now - lastHit < 45) return;
    lastHit = now;
    if (kind === "bumper") { tone(520, 0.25, "sine", 0.22, 1300); vib(20); return; }
    const vol = Math.min(0.22, v * 0.035);
    tone(1500 + Math.random() * 600, 0.08, "triangle", vol); tone(180, 0.06, "square", vol * 0.4);
    if (v > 3) vib(12);
  },
  onFall() { tone(700, 0.6, "sine", 0.2, 70); vib([30, 40, 60]); falls++; },
  onCrush() { tone(120, 0.35, "sawtooth", 0.2, 50); vib(80); falls++; toast("被夾扁了！回到暫存點"); },
  onCheckpoint() { tone(880, 0.15, "triangle", 0.18); setTimeout(() => tone(1320, 0.3, "triangle", 0.18), 110); toast("✔ 已存檔：暫存點"); },
  onSwitch() { tone(220, 0.2, "square", 0.12); setTimeout(() => tone(440, 0.3, "square", 0.1), 150); toast("閘門開啟！"); vib(40); },
  onWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, "triangle", 0.18), i * 110)); vib([40, 50, 40]); },
};

/* ================= 輸入：陀螺儀 / 鍵盤 / 拖曳 ================= */
const input = { tx: 0, tz: 0, gx: 0, gz: 0, gyro: false, base: null, keys: new Set(), drag: null };
function screenAngle() { return (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0; }
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  input.gyro = true;
  if (!input.base) input.base = { beta: e.beta, gamma: e.gamma };
  let gx = e.gamma - input.base.gamma, gz = e.beta - input.base.beta;
  // 依螢幕方向旋轉（橫放手機也能用）
  const a = (-screenAngle() * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  [gx, gz] = [gx * c - gz * s, gx * s + gz * c];
  const dz = (v) => (Math.abs(v) < 0.6 ? 0 : v - Math.sign(v) * 0.6);
  input.gx = (dz(gx) * Math.PI) / 180; input.gz = (dz(gz) * Math.PI) / 180;
}
async function enableGyro() {
  // 一律先掛上監聽器；iPhone（iOS 13+）另外需要在點擊時請求權限
  window.addEventListener("deviceorientation", onOrient);
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== "granted" && !input.gyro) toast("沒有取得陀螺儀權限，改用拖曳操作");
    }
  } catch { /* 不支援就用拖曳 / 鍵盤 */ }
}
const KEYMAP = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
window.addEventListener("keydown", (e) => { if (KEYMAP[e.code]) { input.keys.add(e.code); e.preventDefault(); } if (e.code === "KeyR") restartLevel(); });
window.addEventListener("keyup", (e) => input.keys.delete(e.code));
const joy = $("joy");
canvas.addEventListener("pointerdown", (e) => {
  if (input.gyro && e.pointerType === "touch") return;
  input.drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  canvas.setPointerCapture(e.pointerId);
  joy.style.display = "block"; joy.style.left = e.clientX + "px"; joy.style.top = e.clientY + "px";
});
canvas.addEventListener("pointermove", (e) => {
  if (!input.drag) return;
  input.drag.dx = e.clientX - input.drag.x; input.drag.dy = e.clientY - input.drag.y;
  const l = Math.hypot(input.drag.dx, input.drag.dy), k = l > 50 ? 50 / l : 1;
  joy.firstElementChild.style.transform = `translate(${input.drag.dx * k}px, ${input.drag.dy * k}px)`;
});
const endDrag = () => { input.drag = null; joy.style.display = "none"; joy.firstElementChild.style.transform = ""; };
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

function targetTilt() {
  const max = P.maxTilt;
  let sx = 0, sz = 0;
  if (input.keys.size) { for (const k of input.keys) { sx += KEYMAP[k][0]; sz += KEYMAP[k][1]; } sx *= max * 0.75; sz *= max * 0.75; }
  else if (input.drag) { sx = (input.drag.dx / 50) * max; sz = (input.drag.dy / 50) * max; }
  else if (input.gyro) { sx = input.gx * settings.sens; sz = input.gz * settings.sens; }
  const cl = (v) => Math.max(-max, Math.min(max, v));
  sx = cl(sx); sz = cl(sz);
  // 鏡頭有旋轉時，把「螢幕方向」轉成「世界方向」
  const y = (settings.yaw * Math.PI) / 180, c = Math.cos(y), s = Math.sin(y);
  return [sx * c + sz * s, -sx * s + sz * c];
}

/* ================= 介面 ================= */
let started = false, timeRun = 0, falls = 0, clearShown = false, toastT = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function loadLevel(i) {
  lvIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  W = createWorld(LEVELS[lvIndex]);
  B = newBall(W);
  buildLevel();
  timeRun = 0; falls = 0; clearShown = false;
  $("lvNo").textContent = `STAGE ${String(lvIndex + 1).padStart(2, "0")}/${String(LEVELS.length).padStart(2, "0")}`;
  $("lvName").textContent = LEVELS[lvIndex].name;
  $("tip").textContent = LEVELS[lvIndex].tip; $("tip").style.opacity = 1;
  setTimeout(() => ($("tip").style.opacity = 0.55), 5000);
  $("falls").textContent = "掉落 0";
  camSnap = true;
}
function restartLevel() { loadLevel(lvIndex); }

$("bStart").onclick = async () => {
  initAudio(); if (ac.state === "suspended") ac.resume();
  await enableGyro();
  try { await navigator.wakeLock?.request("screen"); } catch {}
  input.base = null;
  $("start").hidden = true; started = true;
  setTimeout(() => { if (!input.gyro) toast("沒有偵測到陀螺儀：用拖曳或方向鍵操作"); else toast("已校正水平，開始傾斜吧！"); }, 900);
};
if (!("ontouchstart" in window)) $("deskHint").style.display = "block"; else $("deskHint").style.display = "none";

$("bRestart").onclick = restartLevel;
const bindRange = (id, key, fmtv) => { const el = $(id), out = $(id + "V"); el.value = settings[key]; out.textContent = fmtv(settings[key]); el.oninput = () => { settings[key] = +el.value; out.textContent = fmtv(settings[key]); store.set("settings", settings); }; };
bindRange("vTilt", "tilt", (v) => `${v}°`);
bindRange("vZoom", "zoom", (v) => v.toFixed(1));
bindRange("vYaw", "yaw", (v) => `${v}°`);
bindRange("vSens", "sens", (v) => `${(+v).toFixed(2)}×`);
const bindCheck = (id, key, fn) => { const el = $(id); el.checked = settings[key]; el.onchange = () => { settings[key] = el.checked; store.set("settings", settings); fn && fn(); }; };
bindCheck("vGhost", "ghost", applyWallSettings);
bindCheck("vLow", "low", applyWallSettings);
bindCheck("vSound", "sound", () => { if (!settings.sound && rollGain) rollGain.gain.value = 0; });
$("bSettings").onclick = () => ($("settings").hidden = false);
$("bClose").onclick = () => ($("settings").hidden = true);
$("settings").onclick = (e) => { if (e.target.id === "settings") $("settings").hidden = true; };
$("bCalib").onclick = () => { input.base = null; toast(input.gyro ? "已重新校正水平" : "目前沒有陀螺儀訊號"); };
function renderLevelGrid() {
  const grid = $("lvGrid"); grid.innerHTML = "";
  LEVELS.forEach((L, i) => {
    const b = document.createElement("button");
    const best = progress.best[i];
    b.innerHTML = `${String(i + 1).padStart(2, "0")}<small>${best ? fmt(best) : L.name}</small>`;
    if (i + 1 > progress.unlocked) b.disabled = true;
    if (best) b.classList.add("done");
    if (i === lvIndex) b.classList.add("cur");
    b.onclick = () => { $("levels").hidden = true; loadLevel(i); };
    grid.appendChild(b);
  });
}
$("bLevels").onclick = () => { renderLevelGrid(); $("levels").hidden = false; };
$("bLvClose").onclick = () => ($("levels").hidden = true);
$("levels").onclick = (e) => { if (e.target.id === "levels") $("levels").hidden = true; };
$("bNext").onclick = () => { $("clear").hidden = true; loadLevel(lvIndex + 1 < LEVELS.length ? lvIndex + 1 : 0); };
$("bAgain").onclick = () => { $("clear").hidden = true; restartLevel(); };

function showClear() {
  clearShown = true;
  const t = timeRun, prevBest = progress.best[lvIndex];
  if (!prevBest || t < prevBest) progress.best[lvIndex] = t;
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, lvIndex + 2));
  store.set("progress", progress);
  const last = lvIndex === LEVELS.length - 1;
  $("clearTag").textContent = last ? "ALL STAGES CLEAR" : `STAGE ${String(lvIndex + 1).padStart(2, "0")} CLEAR`;
  $("clearTitle").textContent = last ? "全部通關！" : "過關！";
  $("clearStats").innerHTML = `時間 ${fmt(t)}${!prevBest || t < prevBest ? " ★新紀錄" : ""}<br>掉落 ${falls} 次`;
  $("bNext").textContent = last ? "從第一關再來 ↺" : "下一關 →";
  $("clear").hidden = false;
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
});

/* ================= 主迴圈 ================= */
let last = performance.now(), camSnap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
const spinAxis = new THREE.Vector3(), qTmp = new THREE.Quaternion();
let tiltX = 0, tiltZ = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const paused = !started || !$("settings").hidden || !$("levels").hidden || !$("clear").hidden;
  const [txT, tzT] = targetTilt();
  const k = 1 - Math.exp(-dt * 14);
  tiltX += (txT - tiltX) * k; tiltZ += (tzT - tiltZ) * k;

  if (!paused) {
    const px = B.spin.x, pz = B.spin.z;
    step(W, B, tiltX, tiltZ, dt, events);
    if (B.state === "roll") timeRun += dt;
    // 滾動旋轉：依位移量轉動球（純滾動，不打滑）
    const mx = B.spin.x - px, mz = B.spin.z - pz, d = Math.hypot(mx, mz);
    if (d > 1e-6) { spinAxis.set(mz, 0, -mx).normalize(); qTmp.setFromAxisAngle(spinAxis, d / P.R); ball.quaternion.premultiply(qTmp); }
    if ((B.state === "fall" || B.state === "crush") && B.t > 0.6) { respawn(W, B); $("falls").textContent = `掉落 ${falls}`; }
    if (B.state === "win" && B.t > 0.7 && !clearShown) showClear();
  }

  // 球的位置與掉落 / 重生動畫
  let y = P.R, s = 1, bx = B.x, bz = B.z;
  if (B.state === "fall" || B.state === "win") {
    const f = Math.min(1, B.t / 0.55);
    bx += (B.fallTo.x - B.x) * f; bz += (B.fallTo.z - B.z) * f;
    y = P.R - f * f * 1.4; s = 1 - f * 0.25;
  } else if (B.state === "crush") { s = Math.max(0.05, 1 - B.t * 2); y = P.R * s; }
  else if (B.state === "spawn") { const f = Math.min(1, B.t / 0.55); y = P.R + (1 - f * f) * 2.5; }
  ball.position.set(bx, y, bz); ball.scale.setScalar(s);
  if (B.state === "crush") ball.scale.set(1.3, s, 1.3);
  ballShadow.position.set(bx, 0.005, bz); ballShadow.visible = y > -0.05 && B.state !== "fall";
  ballShadow.material.opacity = 0.35 / (1 + Math.max(0, y - P.R) * 1.5);

  // 動態零件
  const t = W.t;
  for (const m of lv.movers) { const mm = m.m; m.g.position.set(mm.axis === "x" ? mm.pos + 0.5 : mm.x + 0.5, 0, mm.axis === "z" ? mm.pos + 0.5 : mm.z + 0.5); }
  for (const sp of lv.spinners) sp.arm.rotation.y = -sp.s.angle;
  for (const b of lv.bumpers) { b.bp.flash *= Math.exp(-dt * 6); b.mat.emissiveIntensity = 2 + b.bp.flash * 6; b.g.scale.setScalar(1 + b.bp.flash * 0.15); }
  for (const c of lv.cps) { c.ring.material.color.set(c.cp.on ? 0x7cff6b : 0x00f0ff); c.pillar.material.opacity = c.cp.on ? 0.18 + Math.sin(t * 4) * 0.06 : 0; }
  for (const s2 of lv.switches) s2.btnMat.emissive.set(s2.sw.on ? 0x7cff6b : 0xff2a2a);
  for (const d of lv.doors) d.position.y = -W.doorAnim * (WALL_H + 0.05) * (settings.low ? 0.45 : 1);
  for (const tx of lv.boosts) tx.offset.y = -(t * 1.6) % 1;
  for (const h of lv.holes) h.rim.material.emissiveIntensity = 2 + Math.sin(t * 5 + h.g.position.x) * 0.6;
  lv.goalFx.rings.forEach((r, i) => { r.position.y = -((t * 0.5 + i / 3) % 1) * 1.2; });
  lv.goalFx.beam.material.opacity = 0.1 + Math.sin(t * 3) * 0.04;

  // 板子跟著傾斜一點點（視覺回饋）
  const vis = input.gyro && !input.keys.size && !input.drag ? 0.25 : 0.6;
  board.rotation.set(tiltZ * vis, 0, -tiltX * vis);

  // 滾動聲
  if (rollGain && settings.sound) {
    const sp = B.state === "roll" ? Math.hypot(B.vx, B.vz) : 0;
    rollGain.gain.setTargetAtTime(Math.min(0.12, sp * 0.02), ac.currentTime, 0.05);
    rollFilter.frequency.setTargetAtTime(200 + sp * 120, ac.currentTime, 0.05);
  }

  // 鏡頭：跟著球，依設定的傾斜 / 距離 / 旋轉
  ball.getWorldPosition(tmp); tmp.y = 0;
  const el = (Math.min(89.5, settings.tilt) * Math.PI) / 180, yw = (settings.yaw * Math.PI) / 180, D = settings.zoom;
  // 鏡頭對準點限制在棋盤內：板子比畫面大就在邊界停住，比畫面小就置中
  const viewHalfZ = D * Math.tan((camera.fov * Math.PI) / 360) * 0.85, viewHalfX = viewHalfZ * camera.aspect / Math.max(0.5, Math.sin(el));
  const clampAxis = (v, boardHalf, viewHalf) => (boardHalf + 0.6 <= viewHalf ? 0 : Math.max(-(boardHalf + 0.6 - viewHalf), Math.min(boardHalf + 0.6 - viewHalf, v)));
  tmp.x = clampAxis(tmp.x, W.w / 2, viewHalfX);
  tmp.z = clampAxis(tmp.z, W.h / 2, viewHalfZ);
  const want = new THREE.Vector3(tmp.x + D * Math.cos(el) * Math.sin(yw), D * Math.sin(el), tmp.z + D * Math.cos(el) * Math.cos(yw));
  if (camSnap) { camPos.copy(want); camLook.copy(tmp); camSnap = false; }
  const kc = 1 - Math.exp(-dt * 4);
  camPos.lerp(want, kc); camLook.lerp(tmp, kc);
  camera.position.copy(camPos); camera.lookAt(camLook);
  ballLight.position.set(tmp.x + 0.6, 1.4, tmp.z + 0.4);

  $("timer").textContent = fmt(timeRun);
  composer.render();
}

loadLevel(Math.min(progress.unlocked - 1, store.get("last", 0)));
window.addEventListener("pagehide", () => store.set("last", lvIndex));
window.__maze = { get W() { return W; }, get B() { return B; }, loadLevel, camera, input, get tilt() { return [tiltX, tiltZ]; } };
requestAnimationFrame((t) => { last = t; frame(t); });
