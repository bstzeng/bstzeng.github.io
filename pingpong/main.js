// 公仔桌球：滑鼠控制球拍（只在桌面高度的平面上移動），擊球瞬間的球拍速度決定旋轉
import * as THREE from "three";
import { toon, outline, blob, makeChibi, animChibi, Sfx, makeRenderer, fitRenderer, clamp, lerp, rand, makeBall, Trail, ui } from "../sportkit/kit.js";

// ---------- 常數（公尺、秒） ----------
const TY = 0.76;            // 桌面高
const HW = 0.7625;          // 桌半寬
const HL = 1.37;            // 桌半長
const NET = 0.1525;         // 網高
const R = 0.02;             // 球半徑
const G = 9.81;
const KD = 0.12;            // 空氣阻力係數
const KM = 0.005;           // 馬格努斯（旋轉造成的偏移）
const E_T = 0.88;           // 桌面反彈
const DT = 1 / 240;
const PLANE_Y = TY + 0.12;  // 球拍移動平面

const DIFF = {
  easy:   { name: "低", aiSpeed: 1.7, react: 0.3, err: 0.1, miss: 0.1, read: 0.1, shotT: [0.74, 0.88], aiSpin: 0, hitR: 0.18, aiHitR: 0.16 },
  normal: { name: "中", aiSpeed: 2.5, react: 0.18, err: 0.05, miss: 0.05, read: 0.5, shotT: [0.54, 0.68], aiSpin: 70, hitR: 0.155, aiHitR: 0.17 },
  hard:   { name: "高", aiSpeed: 3.6, react: 0.08, err: 0.02, miss: 0.02, read: 0.85, shotT: [0.4, 0.52], aiSpin: 140, hitR: 0.14, aiHitR: 0.19 },
};

// ---------- 場景 ----------
const canvas = document.getElementById("c");
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2350);
scene.fog = new THREE.Fog(0x2b2350, 9, 22);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
const CAM_POS = new THREE.Vector3(0, 1.85, 3.15), CAM_LOOK = new THREE.Vector3(0, 0.78, -0.55);
camera.position.copy(CAM_POS);
camera.lookAt(CAM_LOOK);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a8a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 6, 3);
scene.add(sun);

// 地板與場邊
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 16).rotateX(-Math.PI / 2), toon(0xd9925a));
scene.add(floor);
const court = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 9).rotateX(-Math.PI / 2), toon(0xc4473f));
court.position.y = 0.002; scene.add(court);
{
  const boardCols = [0x2f6fd6, 0xffd84d, 0xff6f91, 0x3ac99a];
  const bg = new THREE.BoxGeometry(1.3, 0.55, 0.06);
  let k = 0;
  for (let i = -2; i <= 2; i++) {
    const b = outline(new THREE.Mesh(bg, toon(boardCols[k++ % 4])), 0.03);
    b.position.set(i * 1.32, 0.275, -4.6); scene.add(b);
  }
  for (const sx of [-1, 1]) for (let i = -3; i <= 2; i++) {
    const b = outline(new THREE.Mesh(bg, toon(boardCols[k++ % 4])), 0.03);
    b.rotation.y = Math.PI / 2; b.position.set(sx * 2.7, 0.275, i * 1.32 - 0.6); scene.add(b);
  }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), toon(0x3b2f6e));
  wall.position.set(0, 3, -7.5); scene.add(wall);
  // 掛旗
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 3), toon(boardCols[i % 4]));
    f.rotation.z = Math.PI; f.position.set(-3.6 + i * 1.2, 3.2, -7.4); scene.add(f);
  }
}

// 球桌
const tableGroup = new THREE.Group();
scene.add(tableGroup);
{
  const top = outline(new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.03, HL * 2), toon(0x1f62c9)), 0.006);
  top.position.y = TY - 0.015; tableGroup.add(top);
  const white = toon(0xffffff);
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, d), white); m.position.set(x, TY + 0.001, z); tableGroup.add(m); };
  line(HW * 2, 0.02, 0, HL - 0.01); line(HW * 2, 0.02, 0, -HL + 0.01);
  line(0.02, HL * 2, HW - 0.01, 0); line(0.02, HL * 2, -HW + 0.01, 0);
  line(0.004, HL * 2, 0, 0);
  const legM = toon(0x2a2a3a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, TY - 0.03, 8), legM);
    l.position.set(sx * (HW - 0.12), (TY - 0.03) / 2, sz * (HL - 0.25)); tableGroup.add(l);
  }
  // 網
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 0.3, NET), new THREE.MeshBasicMaterial({ color: 0x1a1a2a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(0, TY + NET / 2, 0); tableGroup.add(net);
  const band = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.3, 0.018, 0.008), white);
  band.position.set(0, TY + NET - 0.009, 0); tableGroup.add(band);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NET + 0.02, 6), legM);
    p.position.set(sx * (HW + 0.15), TY + NET / 2, 0); tableGroup.add(p);
  }
  const sh = blob(3.6, 0.6); sh.scale.set(2.2, 1, 3.6); sh.position.y = 0.004; tableGroup.add(sh);
}

// 球拍
function makePaddle(rubber) {
  const g = new THREE.Group();
  const face = new THREE.Group(); g.add(face);
  const wood = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24), toon(0xe7c08a)), 0.05);
  face.add(wood);
  const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.096, 0.006, 24), toon(rubber));
  r1.position.y = 0.008; face.add(r1);
  const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.096, 0.006, 24), toon(0x222230));
  r2.position.y = -0.008; face.add(r2);
  const handle = outline(new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.11), toon(0xb07a45)), 0.08);
  handle.position.z = 0.15; face.add(handle);
  // 預設：拍面立起來朝 -z（對手方向），握把朝下
  face.rotation.x = Math.PI / 2;
  face.rotation.z = 0;
  return g;
}
const paddle = makePaddle(0xe8333f);
paddle.scale.setScalar(1.05);
scene.add(paddle);
const paddleShadow = blob(0.28, 0.5); scene.add(paddleShadow);

// 對手公仔
const ai = {
  c: makeChibi({ shirt: 0x3d8bff, shorts: 0x22305a, hair: 0x3a2418, style: "spiky", stripe: 0xffffff, band: 0xff4d6d }),
  x: 0, z: -1.75, tx: 0, tz: -1.75, py: PLANE_Y, plan: 0, pending: false, whiff: false, swing: 0, mood: 0,
};
ai.c.g.scale.setScalar(1.45);
scene.add(ai.c.g);
const aiPaddle = makePaddle(0xe8333f);
aiPaddle.scale.setScalar(1.15);
scene.add(aiPaddle);
const aiArm = outline(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1, 4, 8), toon(0x3d8bff)), 0.06);
scene.add(aiArm);
ai.c.armR.visible = false;
const aiShadow = blob(0.9, 0.7); scene.add(aiShadow);

// 球
const ballMesh = makeBall(R * 1.45, "#ff9a2e", "#fff4dc");
scene.add(ballMesh);
const ballShadow = blob(0.07, 0.8); scene.add(ballShadow);
const trail = new Trail(scene, 12);

// ---------- 物理 ----------
const ball = { p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), simple: false, until: null };
function copyBall(b) { return { p: b.p.clone(), v: b.v.clone(), w: b.w.clone(), simple: b.simple, until: b.until }; }

function stepBall(b, dt) {
  const v = b.v;
  let ax = 0, ay = -G, az = 0;
  if (!b.simple) {
    const s = v.length();
    ax -= KD * s * v.x; ay -= KD * s * v.y; az -= KD * s * v.z;
    ax += KM * (b.w.y * v.z - b.w.z * v.y);
    ay += KM * (b.w.z * v.x - b.w.x * v.z);
    az += KM * (b.w.x * v.y - b.w.y * v.x);
  }
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  b.p.x += v.x * dt; b.p.y += v.y * dt; b.p.z += v.z * dt;
  b.w.multiplyScalar(1 - 0.2 * dt);
}

function tableBounce(b, side) {
  b.v.y = -b.v.y * E_T;
  if (b.simple && side !== b.until) { b.v.x *= 0.8; b.v.z *= 0.8; return; }
  b.simple = false;
  // 旋轉與桌面摩擦：上旋往前衝、下旋煞住
  const re = 0.05;
  const ux = b.v.x + b.w.z * re, uz = b.v.z - b.w.x * re;
  b.v.x -= 0.2 * ux; b.v.z -= 0.2 * uz;
  b.w.multiplyScalar(0.6);
}

const _prev = new THREE.Vector3();
/** 一個物理步，回傳碰撞事件 */
function physStep(b) {
  _prev.copy(b.p);
  stepBall(b, DT);
  const p = b.p;
  if (b.v.y < 0 && p.y - R <= TY && _prev.y - R >= TY - 0.03 && Math.abs(p.x) <= HW + R * 0.5 && Math.abs(p.z) <= HL + R * 0.5) {
    p.y = TY + R;
    const side = p.z > 0 ? "P" : "A";
    tableBounce(b, side);
    return { type: "table", side };
  }
  if ((_prev.z > 0) !== (p.z > 0) && p.y < TY + NET + R && p.y > TY - 0.02 && Math.abs(p.x) < HW + 0.15) {
    p.z = _prev.z > 0 ? R : -R;
    b.v.z *= -0.15; b.v.x *= 0.5; b.v.y *= 0.3; b.w.multiplyScalar(0.3);
    return { type: "net" };
  }
  if (p.y - R <= 0 && b.v.y < 0) {
    p.y = R; b.v.y = -b.v.y * 0.6; b.v.x *= 0.8; b.v.z *= 0.8; b.w.multiplyScalar(0.5);
    return { type: "floor" };
  }
  return null;
}

/** 模擬到落在桌面高度為止：回傳落點、時間、過網高度 */
function simLanding(p0, v0, w, simple = false) {
  const b = { p: p0.clone(), v: v0.clone(), w: w.clone(), simple, until: null };
  let netY = null;
  for (let i = 1; i < 900; i++) {
    const pz = b.p.z;
    stepBall(b, DT);
    if (netY === null && (pz > 0) !== (b.p.z > 0)) netY = b.p.y;
    if (b.v.y < 0 && b.p.y <= TY + R) return { x: b.p.x, z: b.p.z, t: i * DT, netY };
  }
  return null;
}

/** 解出擊球初速：讓球（含旋轉、空氣阻力）落在目標點，必要時拉高弧線過網 */
function solveShot(p0, tx, tz, T, w) {
  let best = null;
  for (let tries = 0; tries < 6; tries++) {
    const v = new THREE.Vector3((tx - p0.x) / T, (TY + R - p0.y + 0.5 * G * T * T) / T, (tz - p0.z) / T);
    let land = null;
    for (let it = 0; it < 6; it++) {
      land = simLanding(p0, v, w);
      if (!land) { v.y += 0.4; continue; }
      const ex = tx - land.x, ez = tz - land.z;
      if (Math.abs(ex) < 0.006 && Math.abs(ez) < 0.006) break;
      v.x += ex / land.t; v.z += ez / land.t;
    }
    best = v;
    if (land && land.netY !== null && land.netY > TY + NET + R + 0.025) return v;
    T += 0.06;
  }
  return best;
}

/** 發球：在拋球最高點擊出，先在自己這邊彈一次再過網 */
function serveVelocity(p0, tx, tz) {
  const H = p0.y - (TY + R);
  const t1 = Math.sqrt(2 * H / G), V = G * t1, vy2 = E_T * V, t2 = 2 * vy2 / G;
  const dx = tx - p0.x, dz = tz - p0.z, D = Math.hypot(dx, dz);
  const u = D / (t1 + 0.8 * t2);
  return new THREE.Vector3(dx / D * u, 0, dz / D * u);
}

/** 預測：球在 side 這邊彈一次後，適合擊球的位置 */
function predictHit(src, side, spinScale) {
  const b = copyBall(src);
  b.w.multiplyScalar(spinScale);
  const sz = side === "A" ? -1 : 1;
  let bounced = false;
  for (let i = 1; i < 240 * 3; i++) {
    const ev = physStep(b);
    if (ev) {
      if (ev.type === "table") {
        if (ev.side === side) { if (bounced) return null; bounced = true; }
        else if (bounced) return null;
      } else if (ev.type === "floor") return bounced ? { x: b.p.x, z: b.p.z, y: b.p.y, t: i * DT } : null;
    }
    if (bounced && (b.p.z * sz > HL + 0.12 || (b.v.y < 0 && b.p.y < TY + 0.2))) return { x: b.p.x, z: b.p.z, y: b.p.y, t: i * DT };
  }
  return null;
}

// ---------- 遊戲狀態 ----------
const U = ui();
const sfx = new Sfx();
let diff = DIFF.normal, diffKey = "normal";
const st = {
  phase: "menu",       // menu | serve | rally | point | over
  score: { P: 0, A: 0 },
  firstServer: "P",
  server: "P",
  last: "P",           // 最後擊球者
  bounces: { P: 0, A: 0 },
  serving: false,
  ownBounce: false,
  timer: 0,
  lastHitTime: 0,
  rallyLen: 0,
};
const other = (s) => (s === "P" ? "A" : "P");

// 滑鼠 → 球拍
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLANE_Y);
const hitPt = new THREE.Vector3();
const pad = { x: 0, z: 1.55, y: PLANE_Y, tx: 0, tz: 1.55, hist: [], vx: 0, vz: 0, swing: 0 };
let pointerIn = false;
function onPointer(e) {
  pointerIn = true;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hitPt)) {
    pad.tx = clamp(hitPt.x, -1.4, 1.4);
    pad.tz = clamp(hitPt.z, 0.12, 2.3);
  } else if (ndc.y > 0) pad.tz = 0.12;
}
window.addEventListener("pointermove", onPointer);
window.addEventListener("pointerdown", (e) => {
  sfx.ensure();
  onPointer(e);
  if (st.phase === "serve" && st.server === "P" && e.target === canvas) playerServe();
});

function paddleVelocity() {
  // 用最近 ~70 毫秒的移動算球拍速度
  const h = pad.hist;
  if (h.length < 2) return { vx: 0, vz: 0 };
  const now = h[h.length - 1];
  let o = h[0];
  for (let i = h.length - 1; i >= 0; i--) { o = h[i]; if (now.t - h[i].t >= 0.07) break; }
  const dt = Math.max(0.016, now.t - o.t);
  return { vx: (now.x - o.x) / dt, vz: (now.z - o.z) / dt };
}

// ---------- 旋轉標示 ----------
function spinInfo(w, dirZ) {
  const top = w.x * Math.sign(dirZ);   // >0 上旋
  const side = w.y;
  const a = Math.abs(top), s = Math.abs(side);
  if (Math.max(a, s) < 45) return null;
  if (s > a * 1.1) return { label: side > 0 ? "側旋 ↶" : "側旋 ↷", amt: s / 170, cls: "side", color: 0xc06bff };
  return top > 0 ? { label: "上旋 ⤵ 又快又沉", amt: a / 170, cls: "top", color: 0xff7a1a } : { label: "下旋 ⤴ 會往回縮", amt: a / 170, cls: "back", color: 0x4d9bff };
}

// ---------- 擊球 ----------
function playerHit() {
  const pv = paddleVelocity();
  const fwd = Math.max(0, -pv.vz), back = Math.max(0, pv.vz);
  const w = new THREE.Vector3(clamp(pv.vz * 30, -170, 170), clamp(pv.vx * 32, -170, 170), 0);
  const power = clamp(fwd / 7, 0, 1.4);
  // 對方打來的旋轉，若不處理會讓回球偏掉一點
  const inTop = ball.w.x * Math.sign(ball.v.z), inSide = ball.w.y;
  const off = clamp((ball.p.x - pad.x) / diff.hitR, -1.1, 1.1);
  let tx = off * 0.72 + ball.p.x * 0.12 + inSide * 0.0012;
  let tz = -lerp(0.7, 1.24, power) - Math.max(0, inTop) * 0.0012 + Math.max(0, -inTop) * 0.001;
  const wild = Math.hypot(pv.vx, pv.vz);
  if (wild > 7) { tx += rand(-1, 1) * (wild - 7) * 0.03; tz += rand(-1, 1) * (wild - 7) * 0.02; }
  let T = lerp(0.72, 0.36, Math.min(power, 1)) + back * 0.03;
  T = clamp(T, 0.34, 0.95);
  ball.w.copy(w);
  ball.v.copy(solveShot(ball.p, tx, tz, T, w));
  ball.simple = false;
  afterHit("P");
  pad.swing = 1;
  const si = spinInfo(w, -1);
  if (si) { U.spin(si.label, si.amt, si.cls); trail.mat.color.setHex(si.color); }
  else { U.spin(null); trail.mat.color.setHex(0xffffff); }
  sfx.tone(power > 0.7 ? 1500 : 1150, 0.06, "square", 0.22, 600);
  sfx.noise(0.05, 0.25, 3000, 2);
}

function aiHit() {
  const inTop = ball.w.x * Math.sign(ball.v.z), inSide = ball.w.y;
  const misread = 1 - diff.read;
  const corner = diffKey === "hard" ? 0.66 : diffKey === "normal" ? 0.55 : 0.4;
  let tx = rand(-corner, corner);
  if (diffKey !== "easy" && Math.random() < 0.5) tx = Math.sign(-pad.x || rand(-1, 1)) * rand(corner * 0.7, corner); // 打空檔
  let tz = rand(0.55, 1.2);
  let T = rand(diff.shotT[0], diff.shotT[1]);
  // 讀錯旋轉：上旋回太長、下旋回太短（掛網）、側旋往旁邊偏
  tz += inTop * misread * 0.0032;
  tx -= inSide * misread * 0.0032;
  if (inTop < 0) T -= -inTop * misread * 0.0012;
  if (Math.random() < diff.miss) { if (Math.random() < 0.5) tx = Math.sign(tx || 1) * rand(0.8, 1.0); else tz = rand(1.4, 1.6); }
  tx += rand(-1, 1) * diff.err; tz += rand(-1, 1) * diff.err;
  const w = new THREE.Vector3(diff.aiSpin ? rand(0.2, 1) * diff.aiSpin : 0, diff.aiSpin ? rand(-0.6, 0.6) * diff.aiSpin : 0, 0);
  if (diffKey === "hard" && Math.random() < 0.25) w.x = -rand(60, 120); // 偶爾切下旋
  ball.w.copy(w);
  ball.v.copy(solveShot(ball.p, tx, tz, clamp(T, 0.36, 1), w));
  if (inTop < 0 && misread * -inTop > 70) ball.v.y *= 0.82; // 下旋吃不住 → 掛網
  ball.simple = false;
  afterHit("A");
  ai.swing = 1;
  const si = spinInfo(w, 1);
  trail.mat.color.setHex(si ? si.color : 0xffffff);
  sfx.tone(1050, 0.06, "square", 0.18, 550);
  sfx.noise(0.05, 0.2, 2800, 2);
}

function afterHit(who) {
  st.last = who;
  st.bounces.P = st.bounces.A = 0;
  st.serving = false;
  st.lastHitTime = clock.elapsedTime;
  st.rallyLen++;
  if (who === "P") planAI();
  else ai.pending = false;
}

function planAI() {
  ai.pending = true;
  ai.plan = diff.react;
  const top = Math.abs(ball.w.x) + Math.abs(ball.w.y);
  ai.whiff = Math.random() < (top / 170) * (1 - diff.read) * 0.45;
}

function doPlanAI() {
  ai.pending = false;
  const h = predictHit(ball, "A", diff.read + (1 - diff.read) * 0.3);
  if (!h) { ai.tx = clamp(ball.p.x * 0.5, -0.5, 0.5); ai.tz = -1.75; return; }
  ai.tx = clamp(h.x + rand(-1, 1) * diff.err * 0.4 + (ai.whiff ? Math.sign(rand(-1, 1)) * 0.35 : 0), -1.5, 1.5);
  ai.tz = clamp(h.z, -2.6, -0.5);
}

// ---------- 發球 ----------
function setupServe() {
  const total = st.score.P + st.score.A;
  const deuce = st.score.P >= 10 && st.score.A >= 10;
  const k = deuce ? total : Math.floor(total / 2);
  st.server = k % 2 === 0 ? st.firstServer : other(st.firstServer);
  st.phase = "serve";
  st.timer = 0;
  st.bounces.P = st.bounces.A = 0;
  st.rallyLen = 0;
  ai.tx = 0; ai.tz = -1.75;
  ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
  trail.mat.color.setHex(0xffffff);
  U.$("hint").textContent = st.server === "P" ? "點一下滑鼠發球（點的同時移動球拍可以加旋轉）" : "對手發球，準備接球！";
  updateScore();
}

function serveSpot(side) {
  if (side === "P") return new THREE.Vector3(clamp(pad.x, -0.65, 0.65), TY + R + 0.28, clamp(pad.z, 1.45, 1.95));
  return new THREE.Vector3(clamp(ai.x, -0.6, 0.6), TY + R + 0.28, -1.6);
}

function playerServe() {
  const pv = paddleVelocity();
  const p0 = serveSpot("P");
  const power = clamp(Math.max(0, -pv.vz) / 7, 0, 1);
  const tx = clamp(-p0.x * 0.6 + pv.vx * 0.05, -0.62, 0.62);
  const tz = -lerp(0.75, 1.15, power);
  ball.p.copy(p0);
  ball.v.copy(serveVelocity(p0, tx, tz));
  ball.w.set(clamp(pv.vz * 30, -170, 170), clamp(pv.vx * 32, -170, 170), 0);
  ball.simple = true; ball.until = "A";
  startRally("P");
  pad.swing = 1;
  const si = spinInfo(ball.w, -1);
  if (si) { U.spin(si.label, si.amt, si.cls); trail.mat.color.setHex(si.color); }
  sfx.tone(1200, 0.06, "square", 0.2, 600);
  planAI();
}

function aiServe() {
  const p0 = serveSpot("A");
  const tx = rand(-0.55, 0.55), tz = rand(0.7, 1.1);
  ball.p.copy(p0);
  ball.v.copy(serveVelocity(p0, tx, tz));
  const sp = diff.aiSpin;
  ball.w.set(sp ? rand(-1, 1) * sp : 0, sp ? rand(-0.7, 0.7) * sp : 0, 0);
  ball.simple = true; ball.until = "P";
  startRally("A");
  ai.swing = 1;
  const si = spinInfo(ball.w, 1);
  if (si) trail.mat.color.setHex(si.color);
  sfx.tone(1000, 0.06, "square", 0.18, 550);
}

function startRally(who) {
  st.phase = "rally";
  st.last = who;
  st.serving = true;
  st.ownBounce = false;
  st.bounces.P = st.bounces.A = 0;
  st.lastHitTime = clock.elapsedTime;
  U.$("hint").textContent = "";
  trail.reset(ball.p);
}

// ---------- 規則 ----------
function onEvent(ev) {
  if (ev.type === "net") { sfx.tone(180, 0.08, "triangle", 0.2); return; }
  if (ev.type === "table") {
    sfx.tone(st.bounces[ev.side] ? 700 : 820, 0.05, "square", 0.12, 400);
    if (st.phase !== "rally") return;
    const S = ev.side, hitter = st.last;
    if (st.serving) {
      if (!st.ownBounce) {
        if (S === hitter) { st.ownBounce = true; return; }
        return lose(hitter, "發球要先在自己這邊彈一次");
      }
      if (S === hitter) return lose(hitter, "發球沒過網");
      st.serving = false;
      st.bounces[S] = 1;
      return;
    }
    if (S === hitter) return lose(hitter, hitter === "P" ? "球沒過網" : "對手掛網");
    st.bounces[S]++;
    if (st.bounces[S] >= 2) lose(S, S === "P" ? "沒接到" : "對手沒接到");
    return;
  }
  if (ev.type === "floor") {
    sfx.tone(380, 0.05, "square", 0.08, 250);
    if (st.phase !== "rally") return;
    const recv = other(st.last);
    if (st.bounces[recv] >= 1) lose(recv, recv === "P" ? "沒接到" : "對手沒接到");
    else lose(st.last, st.last === "P" ? (st.serving ? "發球失誤" : "出界") : "對手出界");
  }
}

function lose(who, reason) {
  const win = other(who);
  st.score[win]++;
  st.phase = "point";
  st.timer = 0;
  const good = win === "P";
  U.toast((good ? "得分！" : "失分") + (reason ? "　" + reason : ""), good ? "good" : "bad");
  sfx.point(good);
  ai.mood = good ? -1 : 1;
  updateScore();
}

function updateScore() {
  U.$("pMe").textContent = st.score.P;
  U.$("pAi").textContent = st.score.A;
  U.$("sMe").classList.toggle("serve", st.server === "P" && st.phase !== "over");
  U.$("sAi").classList.toggle("serve", st.server === "A" && st.phase !== "over");
  U.$("sDiff").textContent = "難度 " + diff.name;
}

function checkGameOver() {
  const { P, A } = st.score;
  if ((P >= 11 || A >= 11) && Math.abs(P - A) >= 2) {
    st.phase = "over";
    document.body.classList.remove("playing");
    const won = P > A;
    U.$("oTitle").textContent = won ? "🏆 你贏了！" : "再接再厲！";
    U.$("oScore").textContent = `${P} : ${A}`;
    U.$("oSub").textContent = `難度：${diff.name}　${won ? (diffKey === "hard" ? "旋球大師！" : "試試更高難度？") : "多用旋球，對手會接不好喔"}`;
    U.show("over", true);
    U.$("hint").textContent = "";
    won ? sfx.win() : sfx.lose();
    return true;
  }
  return false;
}

function startGame(k) {
  diffKey = k; diff = DIFF[k];
  st.score.P = st.score.A = 0;
  st.firstServer = "P";
  U.show("menu", false); U.show("over", false);
  document.body.classList.add("playing");
  ai.x = 0; ai.z = -1.75;
  setupServe();
}

document.querySelectorAll(".diffs button").forEach((b) => b.addEventListener("click", () => { sfx.ensure(); startGame(b.dataset.d); }));
U.$("bAgain").onclick = () => { st.firstServer = other(st.firstServer); const f = st.firstServer; startGame(diffKey); st.firstServer = f; setupServe(); };
U.$("bDiff").onclick = U.$("bMenu").onclick = () => { st.phase = "menu"; document.body.classList.remove("playing"); U.show("over", false); U.show("menu", true); };
U.$("bSound").onclick = () => { sfx.on = !sfx.on; U.$("bSound").textContent = sfx.on ? "🔊" : "🔇"; };

// ---------- 每幀 ----------
const clock = new THREE.Clock();
let acc = 0;
const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function update(dt) {
  const t = clock.elapsedTime;
  // 球拍跟隨游標（幾乎即時，帶一點點平滑）
  const k = 1 - Math.exp(-dt * 40);
  pad.x += (pad.tx - pad.x) * k;
  pad.z += (pad.tz - pad.z) * k;
  pad.hist.push({ t, x: pad.tx, z: pad.tz });
  while (pad.hist.length > 2 && t - pad.hist[0].t > 0.2) pad.hist.shift();

  // 對手
  if (ai.pending) { ai.plan -= dt; if (ai.plan <= 0) doPlanAI(); }
  if (st.phase === "serve" && st.server === "A") { ai.tx = 0.15; ai.tz = -1.7; }
  const sp = diff.aiSpeed * (st.phase === "rally" ? 1 : 0.6);
  const dx = ai.tx - ai.x, dz = ai.tz - ai.z, d = Math.hypot(dx, dz);
  const mv = Math.min(d, sp * dt);
  if (d > 1e-4) { ai.x += dx / d * mv; ai.z += dz / d * mv; }
  ai.speed = d > 0.02 ? sp : 0;

  // 物理
  acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 12) {
    acc -= DT; steps++;
    if (st.phase === "rally" || st.phase === "point") {
      const ev = physStep(ball);
      if (ev) onEvent(ev);
      if (st.phase === "rally") {
        if (Math.abs(ball.p.z) > 6 || Math.abs(ball.p.x) > 5) onEvent({ type: "floor" });
        // 你擊球：球已在你這邊彈一次，且碰到球拍
        if (st.last === "A" && !st.serving && st.bounces.P === 1 && ball.p.y > TY - 0.3 && ball.p.y < TY + 0.7) {
          if (Math.hypot(ball.p.x - pad.x, ball.p.z - pad.z) < diff.hitR) playerHit();
        }
        if (st.phase === "rally" && st.last === "P" && !st.serving && st.bounces.A === 1 && !ai.whiff && ball.p.y > TY - 0.3 && ball.p.y < TY + 0.7) {
          if (Math.hypot(ball.p.x - ai.x, ball.p.z - ai.z) < diff.aiHitR) aiHit();
        }
      }
    }
  }
  if (steps >= 12) acc = 0;

  if (st.phase === "serve") {
    st.timer += dt;
    const p0 = serveSpot(st.server);
    const bob = Math.abs(Math.sin(st.timer * 3)) * 0.06;
    ball.p.set(p0.x, p0.y - 0.06 + bob, p0.z);
    if (st.server === "A" && st.timer > 1.3) aiServe();
  } else if (st.phase === "point") {
    st.timer += dt;
    if (st.timer > 1.7 && !checkGameOver()) setupServe();
  }
}

function render(dt) {
  const t = clock.elapsedTime;
  // 球
  ballMesh.position.copy(ball.p);
  const wl = ball.w.length();
  if (wl > 1) ballMesh.rotateOnWorldAxis(tmp.copy(ball.w).normalize(), Math.min(wl * dt * 0.35, 0.9));
  else ballMesh.rotation.y += dt * 2;
  if (st.phase === "rally" || st.phase === "point") trail.push(ball.p);
  trail.line.visible = st.phase === "rally" || st.phase === "point";
  const onTable = Math.abs(ball.p.x) < HW && Math.abs(ball.p.z) < HL && ball.p.y > TY - 0.01;
  const gy = onTable ? TY + 0.002 : 0.004;
  ballShadow.position.set(ball.p.x, gy, ball.p.z);
  const hh = Math.max(0, ball.p.y - gy);
  ballShadow.scale.set(0.06 + hh * 0.05, 1, 0.06 + hh * 0.05);
  ballShadow.material.opacity = clamp(0.9 - hh * 0.8, 0.2, 0.9);

  // 你的球拍：球靠近時跟著球的高度
  let targetY = PLANE_Y;
  const near = Math.hypot(ball.p.x - pad.x, ball.p.z - pad.z);
  if (st.phase === "rally" && st.last === "A" && near < 0.7) targetY = clamp(ball.p.y, TY + 0.06, TY + 0.45);
  if (st.phase === "serve" && st.server === "P") targetY = TY + 0.16;
  pad.y += (targetY - pad.y) * (1 - Math.exp(-dt * 14));
  pad.swing = Math.max(0, pad.swing - dt * 4);
  const pv = paddleVelocity();
  paddle.position.set(pad.x, pad.y, pad.z);
  paddle.rotation.set(-0.35 - Math.sin(pad.swing * Math.PI) * 0.6 + clamp(pv.vz, -4, 4) * 0.04, clamp(-pad.x * 0.25, -0.35, 0.35), clamp(-pv.vx * 0.05, -0.5, 0.5));
  paddleShadow.position.set(pad.x, (Math.abs(pad.x) < HW && pad.z < HL) ? TY + 0.003 : 0.005, pad.z);

  // 對手公仔與球拍
  ai.swing = Math.max(0, ai.swing - dt * 4);
  let aiY = PLANE_Y;
  if (st.phase === "rally" && st.last === "P" && Math.hypot(ball.p.x - ai.x, ball.p.z - ai.z) < 0.7) aiY = clamp(ball.p.y, TY + 0.06, TY + 0.45);
  ai.py += (aiY - ai.py) * (1 - Math.exp(-dt * 12));
  aiPaddle.position.set(ai.x, ai.py, ai.z);
  aiPaddle.rotation.set(0.35 + Math.sin(ai.swing * Math.PI) * 0.6, Math.PI, 0);
  const bx = ai.x - 0.28, bz = Math.min(ai.z - 0.38, -HL - 0.28);
  const body = ai.c.g;
  body.position.set(bx, 0, bz);
  body.rotation.y = Math.atan2(ball.p.x - bx, ball.p.z - bz) * 0.3;
  animChibi(ai.c, t, ai.speed || 0);
  ai.c.head.rotation.z = ai.mood ? Math.sin(t * 10) * 0.08 * ai.mood : 0;
  ai.c.armL.rotation.z = -0.3 - (ai.mood < 0 ? 0 : ai.mood) * 2.4;
  if (st.phase !== "point") ai.mood = 0;
  aiShadow.position.set(bx, 0.006, bz);
  // 手臂：肩膀 → 球拍握把
  ai.c.armR.getWorldPosition(tmp);
  tmp2.set(ai.x, ai.py - 0.16, ai.z);
  const len = tmp.distanceTo(tmp2);
  aiArm.position.copy(tmp).add(tmp2).multiplyScalar(0.5);
  aiArm.scale.set(1, len / 1.09, 1);
  aiArm.quaternion.setFromUnitVectors(up, tmp2.sub(tmp).normalize());

  // 鏡頭微微跟球拍
  camera.position.x = CAM_POS.x + pad.x * 0.18;
  camera.lookAt(CAM_LOOK.x + pad.x * 0.1, CAM_LOOK.y, CAM_LOOK.z);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  render(dt);
  renderer.render(scene, camera);
  renderer.tick(dt);
  requestAnimationFrame(frame);
}
fitRenderer(renderer, camera);
window.addEventListener("resize", () => fitRenderer(renderer, camera));
trail.reset(ball.p);
ball.p.set(0, TY + 0.3, 1.6);
requestAnimationFrame(frame);

// 給測試用
window.pingpong = { st, ball, pad, ai, DIFF, startGame, physStep, solveShot, simLanding, predictHit, serveVelocity, playerServe, aiServe, consts: { TY, HW, HL, NET, R } };
