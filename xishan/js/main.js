// 溪山行旅：主程式
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as L from "./layout.js";
import { Batch, M, mat, tube } from "./geo.js";
import * as TX from "./tex.js";
import { buildBuilding, buildTerrace, buildWall, buildPavilion, buildStall } from "./build.js";
import { buildBridge, buildSmallBridge } from "./bridge.js";
import { wupeng, huafang, cargo } from "./boats.js";
import { buildTrees, buildReeds, wind } from "./plants.js";
import { person, Crowd } from "./people.js";
import { buildTerrain, buildRoads, buildEmbankment, buildDocks, buildMountains, buildSky, buildMist, Water } from "./env.js";
import { drawMap, MAP_BOUNDS } from "./map.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOW = params.has("low") || /Mobi|Android|iPad|iPhone/.test(navigator.userAgent);

/* ---------------- 渲染器、場景 ---------------- */
const canvas = $("#c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance", preserveDrawingBuffer: params.has("shot") });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe0e0d0, 0.00105);
scene.background = new THREE.Color(0xe0e0d0);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 6000);

// 晨光：從東南側低角度照過來
const sunDir = new THREE.Vector3(260, 120, 90).normalize();
const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
sun.position.copy(sunDir).multiplyScalar(400);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
const sc = sun.shadow.camera;
sc.left = -260; sc.right = 260; sc.top = 220; sc.bottom = -220; sc.near = 10; sc.far = 1200;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xd6e4df, 0x8c7c5c, 1.05));
// 陰影範圍跟著鏡頭
function followShadow(p) {
  const c = new THREE.Vector3(p.x, 0, p.z);
  c.x = Math.round(c.x / 4) * 4; c.z = Math.round(c.z / 4) * 4;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sunDir, 400);
}

/* ---------------- 建立世界 ---------------- */
const progress = (t, msg) => { $("#loadbar").style.width = `${Math.round(t * 100)}%`; $("#loadmsg").textContent = msg; };
const tick = () => new Promise((r) => setTimeout(r, 0));
const world = { boats: [], bridgeMeshes: [], water: null, crowd: null, mist: [] };

function ground(x, z) { return L.terrainH(x, z); }

async function buildWorld() {
  progress(0.05, "鋪地形、挖河道…"); await tick();
  buildTerrain(scene);
  buildSky(scene, sunDir);
  world.mountains = buildMountains(scene);
  world.mist = buildMist(scene);

  progress(0.2, "砌岸線、碼頭、鋪路…"); await tick();
  const bEnv = new Batch();
  buildEmbankment(bEnv);
  buildDocks(bEnv);
  buildRoads(bEnv, ground);
  const gEnv = new THREE.Group(); bEnv.build(gEnv); scene.add(gEnv);

  progress(0.32, "架虹橋…"); await tick();
  const bBr = new Batch();
  buildBridge(bBr);
  buildSmallBridge(bBr);
  const gBr = new THREE.Group(); world.bridgeMeshes = bBr.build(gBr); scene.add(gBr);

  progress(0.45, "蓋房子：商鋪、大殿、門樓…"); await tick();
  const bB = new Batch();
  const gSigns = new THREE.Group();
  buildTerrace(bB, gSigns);
  for (const B of L.buildings) {
    const y = B.type === "hall" || B.type === "side" ? L.terrace.top : ground(B.x, B.z);
    buildBuilding(bB, gSigns, B, B.type === "kiosk" ? ground(B.x, B.z) : y);
  }
  for (const W of L.walls) buildWall(bB, W, ground);
  buildPavilion(bB, L.pavilion.x, L.pavilion.z, ground(L.pavilion.x, L.pavilion.z), L.pavilion.r);
  for (const S of L.stalls) buildStall(bB, S, ground(S.x, S.z));
  // 宮苑：水池、假山
  const pond = new THREE.Mesh(new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f7f74, roughness: 0.15 }));
  pond.position.set(92, ground(92, -246) + 0.08, -246); pond.receiveShadow = true; scene.add(pond);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    bB.add("stoneDark", new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.5, 0), M([92 + Math.cos(a) * 10.5, ground(92, -246) + 0.4, -246 + Math.sin(a) * 10.5], [i, i * 2, 0], [1, 0.7 + (i % 2) * 0.8, 1]));
  }
  const gB = new THREE.Group(); bB.build(gB); scene.add(gB, gSigns);

  progress(0.62, "種柳樹、松柏、古樹、桃花…"); await tick();
  buildTrees(scene, L.trees, ground);
  const reeds = [];
  const rr = L.rng(3);
  for (let s = 10; s < L.river.len; s += 5) for (const side of [-1, 1]) {
    const p = L.river.at(s); if (L.embanked(s, side) || rr() < 0.55) continue;
    const off = L.RIVER_HW - 1 + rr() * 4;
    const x = p.x + side * p.nx * off, z = p.z + side * p.nz * off;
    reeds.push({ x, z, y: Math.max(-0.2, ground(x, z)) - 0.1, rot: rr() * 3, s: 0.9 + rr() * 0.8 });
  }
  buildReeds(scene, reeds);

  progress(0.75, "放水、行船…"); await tick();
  world.water = new Water(renderer, scene, { quality: LOW ? 0.6 : 1 });
  makeBoats();

  progress(0.88, "市集開張…"); await tick();
  world.crowd = new Crowd(scene);
  const paths = L.npcPaths();
  paths[0].oneWay = paths[1].oneWay = true;
  // 搬貨船工：貨運碼頭 ↔ 貨棧
  const d = L.docks[2], st = L.buildings.find((b) => b.id === "store");
  paths.push({ pts: [[d.x + d.inx * 5, d.z + d.inz * 5], [d.x + d.inx * 1, d.z + d.inz * 1], [d.x - d.inx * 4, d.z - d.inz * 4], [st.x - 2, st.z + 9], [st.x - 2, st.z + 6]], n: 4, off: 0.6, porter: true });
  world.crowd.addWalkers(paths);
  const idle = [];
  for (const S of L.stalls) idle.push({ x: S.x - Math.sin(S.rot) * 1.1, z: S.z - Math.cos(S.rot) * 1.1, y: ground(S.x, S.z), rot: S.rot, kind: "vendor" });
  for (const B of L.buildings) if (B.type === "shop" || B.type === "two") idle.push({ x: B.x + Math.sin(B.rot) * (B.d / 2 + 1.5), z: B.z + Math.cos(B.rot) * (B.d / 2 + 1.5), y: ground(B.x, B.z) + 0.45, rot: B.rot, kind: "vendor" });
  world.crowd.addIdle(idle);
  progress(1, "完成");
}

/* ---------------- 船 ---------------- */
class BoatMover {
  constructor(group, line, { speed = 2.5, loop = true, stops = [], wait = 10, phase = 0, s0 = 0 }) {
    this.g = group; this.line = line; this.vmax = speed; this.loop = loop; this.stops = stops; this.wait = wait;
    this.s = s0; this.v = 0; this.hold = 0; this.ph = phase; this.stopIdx = -1; this.docked = false;
    this.heading = 0;
  }
  update(dt, t) {
    if (this.hold > 0) { this.hold -= dt; this.v = 0; this.docked = true; }
    else {
      this.docked = false;
      // 下一個停靠點
      let next = Infinity;
      for (const s of this.stops) if (s > this.s + 0.01) { next = Math.min(next, s); }
      const toStop = next - this.s;
      const want = Math.min(this.vmax, Math.sqrt(2 * 0.35 * Math.max(0, toStop)) + 0.15);
      this.v += Math.max(-0.6 * dt, Math.min(0.4 * dt, want - this.v));
      this.s += this.v * dt;
      if (toStop < 0.3 && next < Infinity) { this.s = next; this.hold = this.wait; this.stopIdx = this.stops.indexOf(next); }
      if (this.s >= this.line.len) { this.s -= this.line.len; if (this.stops.includes(0)) { this.s = 0; this.hold = this.wait; this.stopIdx = 0; } }
    }
    this.pose(t);
  }
  pose(t) {
    const p = this.line.at(this.s), p2 = this.line.at(Math.min(this.line.len, this.s + 4));
    const tx = p2.x - p.x, tz = p2.z - p.z, L2 = Math.hypot(tx, tz) || 1;
    const h = Math.atan2(-tz / L2, tx / L2);
    let dh = h - this.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    this.heading += dh * 0.08;
    this.g.position.set(p.x, Math.sin(t * 1.3 + this.ph) * 0.045 - 0.02, p.z);
    this.g.rotation.set(Math.sin(t * 0.9 + this.ph) * 0.018 - dh * 0.4, this.heading, Math.sin(t * 1.1 + this.ph) * 0.012, "YXZ");
  }
  wake() { const c = Math.cos(this.heading), s = -Math.sin(this.heading); return { x: this.g.position.x, z: this.g.position.z, heading: Math.atan2(c, s), speed: this.v }; }
}
function attachBoatman(g, at, rot = Math.PI / 2) {
  const p = person(Math.floor(at[0] * 100 + 7), "boatman");
  p.position.set(...at); p.rotation.y = rot;
  g.add(p);
  world.idleBoatmen = world.idleBoatmen || [];
  world.idleBoatmen.push(p);
  return p;
}
function makeBoats() {
  const tour = L.tourRoute();
  // 遊河的烏篷客船（玩家搭這艘）
  const g = wupeng();
  attachBoatman(g, [g.userData.stern[0] + 0.3, g.userData.stern[1] - 0.05, 0.25], Math.PI / 2);
  scene.add(g);
  world.tour = new BoatMover(g, tour.line, { speed: 3.0, loop: true, stops: tour.stops.slice(0, 2), wait: 14, phase: 0.3 });
  world.tour.routeInfo = tour;
  // 開場停在北岸渡口，讓人有時間走過去上船
  world.tour.hold = 14; world.tour.stopIdx = 0; world.tour.docked = true;
  world.tour.pose(0);
  world.boats.push(world.tour);
  const bs = L.bridge.s;
  // 上游、下游來回的船
  const up = wupeng({ L: 8 }); attachBoatman(up, [up.userData.stern[0] + 0.3, up.userData.stern[1] - 0.05, 0.25]); scene.add(up);
  world.boats.push(new BoatMover(up, L.loopRoute(bs - 360, bs - 215, 9), { speed: 2.0, phase: 1.1, s0: 40 }));
  const down = wupeng(); attachBoatman(down, [down.userData.stern[0] + 0.3, down.userData.stern[1] - 0.05, 0.25]); scene.add(down);
  world.boats.push(new BoatMover(down, L.loopRoute(bs + 330, bs + 600, 9), { speed: 2.2, phase: 2.0, s0: 120 }));
  // 停泊的船（畫舫、貨船、烏篷）
  const moor = (grp, d, along, gap = 1.6) => {
    const x = d.x + d.inx * (d.out + gap + grp.userData.B / 2) + d.tx * along, z = d.z + d.inz * (d.out + gap + grp.userData.B / 2) + d.tz * along;
    grp.position.set(x, 0, z);
    grp.rotation.y = Math.atan2(-d.tz, d.tx);
    scene.add(grp);
    world.boats.push({ g: grp, static: true, ph: x * 0.1, update(dt, t) { grp.position.y = Math.sin(t * 1.2 + this.ph) * 0.04 - 0.03; grp.rotation.x = Math.sin(t * 0.8 + this.ph) * 0.015; }, wake: () => null });
    // 纜繩
    const post = [d.x + d.inx * (d.out - 0.5) + d.tx * along, d.top + 0.7, d.z + d.inz * (d.out - 0.5) + d.tz * along];
    const bow = [x - d.inx * (grp.userData.B / 2 - 0.2), 0.9, z - d.inz * (grp.userData.B / 2 - 0.2)];
    const mid = [(post[0] + bow[0]) / 2, 0.5, (post[2] + bow[2]) / 2];
    const rope = new THREE.Mesh(tube([post, mid, bow], 0.03, 12, 4), mat("rope"));
    scene.add(rope);
    return grp;
  };
  const c1 = cargo(3), c2 = cargo(8);
  moor(c1, L.docks[2], -4.5); moor(c2, L.docks[2], 7.5);
  attachBoatman(c1, [-4.5, 0.9, 0.6], 0);
  const hf = huafang();
  const n = L.river.near(110, 2);
  const qd = { x: n.x - L.river.at(n.s).nx * (L.RIVER_HW - 0.2), z: n.z - L.river.at(n.s).nz * (L.RIVER_HW - 0.2), inx: L.river.at(n.s).nx, inz: L.river.at(n.s).nz, tx: L.river.at(n.s).tx, tz: L.river.at(n.s).tz, out: 0, top: 1.9 };
  moor(hf, qd, 0, 0.6);
  moor(wupeng({ L: 7.5 }), L.docks[1], -6.5);
  moor(wupeng({ L: 8 }), L.docks[0], 7.2);
}

/* ---------------- 玩家 ---------------- */
const player = { x: 0, z: 0, y: 2, yaw: 0, pitch: -0.05, mode: "orbit", onBoat: false, kind: "ground", vel: 0 };
const keys = new Set();
let controls;
function setupOrbit() {
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 20; controls.maxDistance = 900;
  controls.autoRotateSpeed = 0.25;
}
export const VIEWS = {
  // 開場：從河對岸稍高處斜看市鎮
  panorama: { pos: [46, 27, 112], target: [-14, 7, -96] },
};
function setView(v) {
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  camera.lookAt(...v.target);
  controls.update();
}

function setMode(m, opt = {}) {
  player.mode = m;
  document.body.dataset.mode = m;
  controls.enabled = m === "orbit";
  controls.autoRotate = m === "orbit" && !!opt.auto;
  $("#menu").hidden = true;
  if (m === "orbit") { setView(opt.view || VIEWS.panorama); hint("拖曳旋轉 · 滾輪縮放 · 右鍵平移"); }
  if (m === "walk") {
    const s = opt.at || startPoint();
    player.x = s.x; player.z = s.z; player.yaw = s.yaw ?? player.yaw; player.pitch = -0.05; player.onBoat = false;
    const g = L.topSurface(s.x, s.z);
    player.y = g ? g.y : ground(s.x, s.z);
    player.kind = g ? g.kind : "ground"; player.dock = g && g.dock;
    hint("WASD／方向鍵移動 · 拖曳看四周 · Shift 快跑 · M 地圖 · E 登船");
  }
  if (m === "boat") {
    player.onBoat = true; player.yaw = 0; player.pitch = -0.04;
    hint("拖曳看四周 · 船停靠碼頭時按 E 下船");
  }
}
function startPoint() {
  // 門樓前（西岸），面向主橋
  const p = L.bridge.toWorld(-L.bridge.half - 24, 0);
  return { x: p.x, z: p.z, yaw: Math.atan2(-L.bridge.ax, -L.bridge.az) + Math.PI };
}
let hintTimer;
function hint(t) { const el = $("#hint"); el.textContent = t; el.classList.add("show"); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove("show"), 6000); }

/* 走路一步（也給測試用） */
function walkStep(dt, fwd, strafe, run) {
  const sp = (run ? 4.6 : 2.1) * dt;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let dx = (fx * fwd - fz * -strafe) * sp, dz = (fz * fwd + fx * -strafe) * sp;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  dx /= n; dz /= n;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    let r = L.tryMove(player.x, player.z, player.y, dx, dz);
    if (!r) r = L.tryMove(player.x, player.z, player.y, dx, 0) || L.tryMove(player.x, player.z, player.y, 0, dz);
    if (!r) break;
    player.x = r.x; player.z = r.z; player.y = r.y; player.kind = r.kind; player.dock = r.dock; moved++;
  }
  return moved;
}

/* 互動：上下船 */
function nearDockedTour() {
  const b = world.tour;
  if (!b.docked) return null;
  const d = L.docks[b.routeInfo.docks[b.stopIdx]];
  return d;
}
function interact() {
  if (player.mode === "walk") {
    const d = nearDockedTour();
    if (d && player.kind === "dock" && player.dock === d && Math.hypot(player.x - world.tour.g.position.x, player.z - world.tour.g.position.z) < 12) { setMode("boat"); return "board"; }
    return null;
  }
  if (player.mode === "boat") {
    const d = nearDockedTour();
    if (!d) { hint("船還在行駛，靠岸後才能下船"); return null; }
    // 下到碼頭上，面向岸
    const x = d.x + d.inx * (d.out - 1.5), z = d.z + d.inz * (d.out - 1.5);
    setMode("walk", { at: { x, z, yaw: Math.atan2(d.inx, d.inz) } });
    return "leave";
  }
  return null;
}

/* ---------------- 輸入 ---------------- */
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyE") interact();
  if (e.code === "KeyM") toggleMap();
  if (e.code === "Escape") { $("#bigmap").hidden = true; }
});
addEventListener("keyup", (e) => keys.delete(e.code));
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (player.mode === "orbit") return;
  if (e.pointerType === "touch" && e.clientX < innerWidth * 0.4 && player.mode === "walk") return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  player.yaw -= (e.clientX - drag.x) * 0.0042;
  player.pitch = Math.max(-1.2, Math.min(1.1, player.pitch - (e.clientY - drag.y) * 0.0035));
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
// 觸控搖桿
const joy = { x: 0, y: 0, id: null };
const pad = $("#joy");
pad.addEventListener("pointerdown", (e) => { joy.id = e.pointerId; pad.setPointerCapture(e.pointerId); moveJoy(e); });
pad.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; $("#joy i").style.transform = ""; } };
pad.addEventListener("pointerup", endJoy); pad.addEventListener("pointercancel", endJoy);
function moveJoy(e) {
  const r = pad.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y;
  $("#joy i").style.transform = `translate(${x * 34}px, ${y * 34}px)`;
}

/* ---------------- 地圖 ---------------- */
function toggleMap(force) {
  const m = $("#bigmap");
  m.hidden = force === undefined ? !m.hidden : !force;
  if (!m.hidden) drawMap($("#bigmapc"), mapState(), { big: true });
}
function mapState() { return { player: player.mode === "orbit" ? null : { x: player.mode === "boat" ? world.tour.g.position.x : player.x, z: player.mode === "boat" ? world.tour.g.position.z : player.z, yaw: player.yaw + (player.mode === "boat" ? world.tour.heading - Math.PI / 2 : 0) }, boat: world.tour ? { x: world.tour.g.position.x, z: world.tour.g.position.z } : null }; }
$("#bigmapc").addEventListener("click", (e) => {
  if (player.mode !== "walk") return;
  const c = e.currentTarget, r = c.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
  const x = MAP_BOUNDS.x0 + u * (MAP_BOUNDS.x1 - MAP_BOUNDS.x0), z = MAP_BOUNDS.z0 + v * (MAP_BOUNDS.z1 - MAP_BOUNDS.z0);
  const g = L.topSurface(x, z);
  if (g && !L.blocked(x, z, 0.4, g.y)) { player.x = x; player.z = z; player.y = g.y; player.kind = g.kind; player.dock = g.dock; toggleMap(false); hint("已移動到地圖上的位置"); }
  else hint("那裡不能站（水裡或房子裡）");
});

/* ---------------- 主迴圈 ---------------- */
const clock = new THREE.Clock();
let T = 0, mapT = 0;
const tmpV = new THREE.Vector3();
function update(dt) {
  T += dt;
  wind.value = T;
  for (const b of world.boats) b.update(dt, T);
  world.water.uniforms.uTime.value = T;
  world.water.setBoats(world.boats.map((b) => b.wake && b.wake()).filter(Boolean));
  world.crowd.update(dt, T);
  for (const p of world.idleBoatmen || []) { const a = p.userData.arms; a[0].rotation.x = a[1].rotation.x = -1.1 + Math.sin(T * 1.7 + p.userData.phase) * 0.45; p.userData.body.rotation.z = Math.sin(T * 1.7 + p.userData.phase) * 0.05; }
  for (const s of world.mist) s.position.x = s.userData.x0 + Math.sin(T * 0.02 * s.userData.sp + s.userData.ph) * 30;
  if (player.mode === "walk") {
    let fwd = 0, str = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyA")) str -= 1;
    if (keys.has("KeyD")) str += 1;
    if (keys.has("ArrowLeft")) player.yaw += dt * 1.8;
    if (keys.has("ArrowRight")) player.yaw -= dt * 1.8;
    fwd += -joy.y; str += joy.x;
    if (fwd || str) walkStep(dt, fwd, str, keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(joy.x, joy.y) > 0.92);
  }
}
function placeCamera() {
  if (player.mode === "walk") {
    camera.position.set(player.x, player.y + 1.62, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  } else if (player.mode === "boat") {
    const g = world.tour.g;
    g.updateMatrixWorld();
    tmpV.set(...g.userData.seat).applyMatrix4(g.matrixWorld);
    camera.position.copy(tmpV);
    camera.rotation.set(player.pitch, g.rotation.y - Math.PI / 2 + player.yaw, 0, "YXZ");
  } else controls.update();
}
function updateUI() {
  let msg = "";
  if (player.mode === "walk") {
    const d = nearDockedTour();
    if (d && player.kind === "dock" && player.dock === d && Math.hypot(player.x - world.tour.g.position.x, player.z - world.tour.g.position.z) < 12) msg = "按 E（或點這裡）登船";
    else if (player.kind === "dock" && !d) msg = "等渡船靠岸…";
    const near = L.buildings.find((b) => Math.hypot(b.x - player.x, b.z - player.z) < Math.max(b.w, b.d) * 0.6 + 4);
    $("#place").textContent = near ? near.name : player.kind === "bridge" ? "虹橋" : "";
  } else if (player.mode === "boat") {
    msg = nearDockedTour() ? "已靠岸：按 E（或點這裡）下船" : "";
    $("#place").textContent = "烏篷客船";
  } else $("#place").textContent = "";
  const pr = $("#prompt");
  pr.textContent = msg; pr.hidden = !msg;
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  placeCamera();
  followShadow(player.mode === "orbit" ? controls.target : camera.position);
  world.water.render(camera);
  renderer.render(scene, camera);
  mapT += dt;
  if (mapT > 0.25) {
    mapT = 0; updateUI();
    if (!$("#minimap").hidden) drawMap($("#minimap"), mapState(), { big: false });
    if (!$("#bigmap").hidden) drawMap($("#bigmapc"), mapState(), { big: true });
  }
  requestAnimationFrame(frame);
}

/* ---------------- 選單 ---------------- */
$("#bOrbit").onclick = () => setMode("orbit", { auto: true });
$("#bWalk").onclick = () => setMode("walk");
function startRide() {
  // 從北岸渡口開船
  const b = world.tour;
  if (!(b.docked && b.stopIdx === 0)) { b.s = 0; b.v = 0; b.hold = 4; b.stopIdx = 0; b.docked = true; b.pose(T); }
  setMode("boat");
}
$("#bBoat").onclick = startRide;
$("#tabOrbit").onclick = () => setMode("orbit");
$("#tabWalk").onclick = () => setMode("walk", player.mode === "boat" ? {} : {});
$("#tabBoat").onclick = () => (player.mode === "boat" ? null : startRide());
$("#tabMap").onclick = () => toggleMap();
$("#bigmap").addEventListener("click", (e) => { if (e.target.id === "bigmap") toggleMap(false); });
$("#prompt").onclick = () => interact();
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (world.water) world.water.resize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), LOW ? 0.6 : 1);
});
document.querySelector(".paper").style.backgroundImage = `url(${TX.paperDataURL()})`;

/* ---------------- 測試介面（自動測試會呼叫） ---------------- */
function simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) update(dt); }
const tests = {
  /** 橋面能走通：從門樓前走過虹橋到市街 */
  bridgeWalk() {
    // 從門樓後面出發，穿過門洞、走過虹橋、進到市街
    const a0 = -L.bridge.half - 26, a1 = L.bridge.half + 8;
    const s = L.bridge.toWorld(a0, 0);
    setMode("walk", { at: { x: s.x, z: s.z, yaw: Math.atan2(-L.bridge.ax, -L.bridge.az) } });
    const ys = [];
    let maxStep = 0, last = player.y, steps = 0, stuck = 0;
    for (let i = 0; i < 2400; i++) {
      const before = [player.x, player.z];
      walkStep(1 / 30, 1, 0, false);
      steps++;
      if (Math.hypot(player.x - before[0], player.z - before[1]) < 0.01) stuck++;
      maxStep = Math.max(maxStep, Math.abs(player.y - last)); last = player.y;
      ys.push(player.y);
      if (L.bridge.toLocal(player.x, player.z).a > a1) break;
    }
    const end = L.bridge.toLocal(player.x, player.z);
    return { ok: end.a > a1 && stuck === 0, startA: a0, reachedA: +end.a.toFixed(2), topY: +Math.max(...ys).toFixed(2), maxStepPerFrame: +maxStep.toFixed(3), framesStuck: stuck, route: "門樓後 → 穿過門洞 → 虹橋（最高點）→ 東岸市街", deckCenter: +L.bridge.deck(0).toFixed(2) };
  },
  /** 渡船穿橋不穿模：船身外框對立柱、船頂對橋底 */
  boatClearance() {
    const b = world.tour, route = b.line, g = b.g, ud = g.userData;
    const rayc = new THREE.Raycaster();
    let minPier = Infinity, minTop = Infinity, minRay = Infinity, samples = 0;
    const piers = [];
    for (const a of L.bridge.piers) for (const z of [-3.2, -1.1, 1.1, 3.2]) { const p = L.bridge.toWorld(a, z); piers.push(p); }
    const top = 2.55;   // 船夫斗笠頂（最高點）
    for (let s = 0; s < route.len; s += 0.5) {
      const p = route.at(s), q = route.at(Math.min(route.len, s + 1));
      const tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1;
      const fx = tx / l, fz = tz / l;
      const loc = L.bridge.toLocal(p.x, p.z);
      if (Math.abs(loc.b) > L.bridge.hw + ud.L) continue;
      samples++;
      // 船身外框的角點
      const corners = [];
      for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) for (const v of [-0.5, 0.5]) corners.push([p.x + fx * u * ud.L - fz * v * ud.B, p.z + fz * u * ud.L + fx * v * ud.B]);
      for (const c of corners) {
        for (const pp of piers) minPier = Math.min(minPier, Math.hypot(c[0] - pp.x, c[1] - pp.z) - 0.4);
        const cl = L.bridge.toLocal(c[0], c[1]);
        if (Math.abs(cl.b) <= L.bridge.hw && Math.abs(cl.a) <= L.bridge.half) {
          const under = L.bridge.deck(cl.a) - L.bridge.thick - 0.45 - 1.4 * Math.pow(Math.abs(cl.a) / 27, 2.2) - 0.17;
          minTop = Math.min(minTop, under - top);
          rayc.set(new THREE.Vector3(c[0], top, c[1]), new THREE.Vector3(0, 1, 0));
          rayc.far = 30;
          const hit = rayc.intersectObjects(world.bridgeMeshes, false)[0];
          if (hit) minRay = Math.min(minRay, hit.distance);
        }
      }
    }
    return { ok: minPier > 0.3 && minTop > 0.5 && minRay > 0.5, samplesUnderBridge: samples, minDistToPier: +minPier.toFixed(2), minHeadroomAnalytic: +minTop.toFixed(2), minHeadroomRaycast: +minRay.toFixed(2) };
  },
  /** 碼頭可以上下船：在北岸渡口等船、登船、坐到南岸、下船 */
  dock() {
    const log = [];
    const d0 = L.docks[0];
    setMode("walk", { at: { x: d0.x + d0.inx * 4, z: d0.z + d0.inz * 4, yaw: 0 } });
    log.push(`站在${d0.name}：surface=${player.kind}, y=${player.y.toFixed(2)}`);
    let t = 0;
    while (!(world.tour.docked && world.tour.stopIdx === 0) && t < 600) { simulate(0.5); t += 0.5; }
    log.push(`等了 ${t.toFixed(1)} 秒，渡船靠岸`);
    const r1 = interact();
    log.push(`按 E：${r1}，模式=${player.mode}`);
    t = 0;
    while (world.tour.docked && t < 60) { simulate(0.5); t += 0.5; }
    t = 0;
    let underBridge = false;
    while (!(world.tour.docked && world.tour.stopIdx === 1) && t < 900) { simulate(0.5); t += 0.5; if (Math.abs(L.bridge.toLocal(world.tour.g.position.x, world.tour.g.position.z).b) < 4) underBridge = true; }
    log.push(`航行 ${t.toFixed(0)} 秒（途中穿過虹橋：${underBridge}），靠岸 ${L.docks[1].name}`);
    const r2 = interact();
    log.push(`按 E：${r2}，模式=${player.mode}，站在 ${player.kind} y=${player.y.toFixed(2)}`);
    const ok = r1 === "board" && r2 === "leave" && player.mode === "walk" && player.kind === "dock" && player.dock === L.docks[1] && underBridge;
    // 從碼頭走上岸
    const yaw0 = player.yaw;
    let up = false;
    for (let i = 0; i < 300; i++) { walkStep(1 / 30, 1, 0, false); if (player.kind === "ground") { up = true; break; } }
    log.push(`沿石階走上岸：${up}，y=${player.yaw === yaw0 ? player.y.toFixed(2) : "?"}`);
    return { ok: ok && up, log };
  },
};
function setPose(name) {
  if (name === "panorama") { setMode("orbit"); setView(VIEWS.panorama); }
}
window.xishan = { L, world, player, camera, setMode, startRide, setView, VIEWS, simulate, tests, interact, walkStep, renderer, scene, frame: () => { placeCamera(); followShadow(player.mode === "orbit" ? controls.target : camera.position); world.water.render(camera); renderer.render(scene, camera); updateUI(); if (player.mode !== "orbit") drawMap($("#minimap"), mapState(), { big: false }); }, toggleMap, drawMap: (c, big) => drawMap(c, mapState(), { big }) };

/* ---------------- 開始 ---------------- */
setupOrbit();
await buildWorld();
setView(VIEWS.panorama);
document.body.classList.add("ready");
$("#loading").hidden = true;
$("#menu").hidden = false;
document.body.dataset.mode = "orbit";
clock.start();
// ?shot=1：自動測試用，不跑連續動畫，由測試程式一張一張畫
if (!params.has("shot")) frame();
