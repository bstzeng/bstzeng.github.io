// 公仔網球：小人以固定速度跑向滑鼠游標，球進到手臂範圍就自動回擊
import * as THREE from "three";
import { toon, outline, blob, makeChibi, animChibi, Sfx, makeRenderer, fitRenderer, clamp, lerp, rand, makeBall, Trail, ui } from "../sportkit/kit.js";

// ---------- 常數（公尺、秒） ----------
const HL = 11.885;      // 半場長
const SW = 4.115;       // 單打半寬
const DW = 5.485;       // 雙打半寬
const SL = 6.4;         // 發球線
const R = 0.0335;
const G = 9.81;
const KD = 0.016, KM = 0.0011;
const DT = 1 / 240;
const REACH = 1.65;     // 手臂＋球拍範圍
const RUN = 6.2;        // 小人跑速（固定）
const netH = (x) => 0.914 + 0.156 * Math.min(1, (x / (DW + 0.914)) ** 2);

const DIFF = {
  easy:   { name: "低", aiSpeed: 4.3, react: 0.32, err: 1.0, miss: 0.13, speed: [14, 17], fault: [0.3, 0.06], corner: 2.4 },
  normal: { name: "中", aiSpeed: 5.4, react: 0.2, err: 0.6, miss: 0.07, speed: [18, 22], fault: [0.2, 0.03], corner: 3.0 },
  hard:   { name: "高", aiSpeed: 6.6, react: 0.1, err: 0.3, miss: 0.035, speed: [22, 27], fault: [0.12, 0.01], corner: 3.5 },
};

// ---------- 場景 ----------
const canvas = document.getElementById("c");
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 45, 90);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 150);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a7a5a, 1.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
sun.position.set(-10, 30, 12);
scene.add(sun);

{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2), toon(0x3d9a5c));
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(DW * 2 + 8, HL * 2 + 12).rotateX(-Math.PI / 2), toon(0x3a8f6a));
  apron.position.y = 0.002; scene.add(apron);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(DW * 2, HL * 2).rotateX(-Math.PI / 2), toon(0x3f7fd0));
  inner.position.y = 0.004; scene.add(inner);
  const white = toon(0xffffff);
  const lw = 0.06;
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), white); m.position.set(x, 0.007, z); scene.add(m); };
  line(DW * 2, lw, 0, HL); line(DW * 2, lw, 0, -HL);
  for (const sx of [-1, 1]) { line(lw, HL * 2, sx * DW, 0); line(lw, HL * 2, sx * SW, 0); }
  line(SW * 2, lw, 0, SL); line(SW * 2, lw, 0, -SL);
  line(lw, SL * 2, 0, 0);
  line(lw, 0.3, 0, HL - 0.15); line(lw, 0.3, 0, -HL + 0.15);

  // 網：依下垂曲線做成格子
  const NW = DW + 0.914, seg = 24;
  const g = new THREE.BufferGeometry();
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const x = -NW + (2 * NW * i) / seg;
    pos.push(x, 0, 0, x, netH(x), 0);
    if (i < seg) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const net = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1a1f2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(net);
  const tape = [];
  for (let i = 0; i <= seg; i++) { const x = -NW + (2 * NW * i) / seg; tape.push(new THREE.Vector3(x, netH(x), 0)); }
  const tapeM = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tape), 32, 0.035, 5), white);
  scene.add(tapeM);
  for (const sx of [-1, 1]) {
    const p = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), toon(0x2a5a3a)), 0.1);
    p.position.set(sx * NW, 0.55, 0); scene.add(p);
  }

  // 看台＋觀眾（一次畫完，InstancedMesh）
  const standMat = toon(0x6a7fa8), standMat2 = toon(0x8296bd);
  const seats = [];
  const stand = (cx, cz, w, rows, rotY) => {
    for (let r = 0; r < rows; r++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6 * (r + 1), 1.2), r % 2 ? standMat : standMat2);
      const grp = new THREE.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = rotY; scene.add(grp);
      b.position.set(0, 0.3 * (r + 1), r * 1.2); grp.add(b);
      for (let i = 0; i < w / 0.9 - 1; i++) {
        if (Math.random() < 0.18) continue;
        const v = new THREE.Vector3(-w / 2 + 0.6 + i * 0.9 + rand(-0.1, 0.1), 0.6 * (r + 1), r * 1.2);
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(new THREE.Vector3(cx, 0, cz));
        seats.push(v);
      }
    }
  };
  stand(0, -HL - 7.5, 30, 6, Math.PI);
  stand(-DW - 8, -2, 34, 5, -Math.PI / 2);
  stand(DW + 8, -2, 34, 5, Math.PI / 2);
  const bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), toon(0xffffff), seats.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 8), toon(0xffffff), seats.length);
  const shirts = [0xff6f91, 0xffd84d, 0x3ac99a, 0xffffff, 0xff9a2e, 0xb04dff, 0x3d8bff], skins = [0xffdcc0, 0xf1c39b, 0xd9a378, 0xffe8d6];
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  seats.forEach((v, i) => {
    m4.makeScale(1, 1.1, 1).setPosition(v.x, v.y + 0.3, v.z); bodies.setMatrixAt(i, m4); bodies.setColorAt(i, c.setHex(shirts[i % shirts.length]));
    m4.makeTranslation(v.x, v.y + 0.8, v.z); heads.setMatrixAt(i, m4); heads.setColorAt(i, c.setHex(skins[(i * 7) % skins.length]));
  });
  scene.add(bodies, heads);
  crowd = { heads, bodies, seats, cheer: 0 };

  // 廣告圍板
  const cols = [0xff6f91, 0xffd84d, 0x2f6fd6, 0xffffff];
  for (let i = -3; i <= 3; i++) {
    const b = outline(new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.9, 0.12), toon(cols[(i + 3) % 4])), 0.02);
    b.position.set(i * 4, 0.45, -HL - 5.2); scene.add(b);
  }
  for (const sx of [-1, 1]) for (let i = -4; i <= 4; i++) {
    const b = outline(new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.9, 0.12), toon(cols[(i + 4) % 4])), 0.02);
    b.rotation.y = Math.PI / 2; b.position.set(sx * (DW + 4.6), 0.45, i * 4 - 2); scene.add(b);
  }
  // 裁判椅
  const chair = outline(new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), toon(0x2a5a3a)), 0.03);
  chair.position.set(-DW - 2.2, 1, 0); scene.add(chair);
  const ump = makeChibi({ shirt: 0xffffff, shorts: 0x22305a, hair: 0x6b4a2a, style: "short" });
  ump.g.scale.setScalar(1.5); ump.g.position.set(-DW - 2.2, 2, 0); ump.g.rotation.y = Math.PI / 2;
  scene.add(ump.g);
  umpire = ump;
}
var crowd, umpire;

// 球拍
function makeRacket(frame) {
  const g = new THREE.Group();
  const grip = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 8), toon(0x2a2a3a)), 0.1);
  grip.position.y = 0.1; g.add(grip);
  const head = outline(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 24), toon(frame)), 0.06);
  head.scale.set(1, 1.3, 1); head.position.y = 0.39; g.add(head);
  const str = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), new THREE.MeshBasicMaterial({ color: 0xf6f6e8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  str.scale.set(1, 1.3, 1); str.position.y = 0.39; g.add(str);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.13, 5), toon(frame));
    t.position.set(sx * 0.03, 0.24, 0); t.rotation.z = sx * 0.25; g.add(t);
  }
  return g;
}

const SCALE = 2.05;
function makePlayer(look, frame) {
  const c = makeChibi(look);
  c.g.scale.setScalar(SCALE);
  const rk = makeRacket(frame);
  rk.scale.setScalar(1.15 / SCALE);
  rk.rotation.x = Math.PI;
  c.handR.add(rk);
  scene.add(c.g);
  const sh = blob(1.3, 0.7); scene.add(sh);
  return { c, rk, sh, x: 0, z: 0, tx: 0, tz: 0, face: 0, speed: 0, swing: 0, back: false, mood: 0 };
}
const me = makePlayer({ shirt: 0xffd84d, shorts: 0xffffff, hair: 0x2a1a12, style: "pony", band: 0xff4d6d, stripe: 0xff6f91 }, 0xff4d6d);
const foe = makePlayer({ shirt: 0x3d8bff, shorts: 0x22305a, hair: 0xd9a04a, style: "spiky", band: 0xffffff, stripe: 0xffffff }, 0x2a2a3a);
// 手臂範圍圈（顯示多近才打得到）
const reachRing = new THREE.Mesh(new THREE.RingGeometry(REACH - 0.06, REACH, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
reachRing.position.y = 0.012; scene.add(reachRing);
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9, depthWrite: false }));
aimRing.position.y = 0.014; scene.add(aimRing);
const cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.8, depthWrite: false }));
cursorRing.position.y = 0.013; scene.add(cursorRing);
const landMark = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
landMark.position.y = 0.015; scene.add(landMark);

const ballMesh = makeBall(R * 3.2, "#d7f04a", "#ffffff");
scene.add(ballMesh);
const ballShadow = blob(0.25, 0.8); scene.add(ballShadow);
const trail = new Trail(scene, 10);

// ---------- 物理 ----------
const ball = { p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3() };
const copyBall = (b) => ({ p: b.p.clone(), v: b.v.clone(), w: b.w.clone() });
function stepBall(b, dt) {
  const v = b.v, s = v.length();
  const ax = -KD * s * v.x + KM * (b.w.y * v.z - b.w.z * v.y);
  const ay = -G - KD * s * v.y + KM * (b.w.z * v.x - b.w.x * v.z);
  const az = -KD * s * v.z + KM * (b.w.x * v.y - b.w.y * v.x);
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  b.p.x += v.x * dt; b.p.y += v.y * dt; b.p.z += v.z * dt;
  b.w.multiplyScalar(1 - 0.1 * dt);
}
const _prev = new THREE.Vector3();
function physStep(b) {
  _prev.copy(b.p);
  stepBall(b, DT);
  const p = b.p;
  if ((_prev.z > 0) !== (p.z > 0) && Math.abs(p.x) < DW + 0.914 && p.y < netH(p.x) + R) {
    p.z = _prev.z > 0 ? R * 2 : -R * 2;
    b.v.z *= -0.12; b.v.x *= 0.4; b.v.y = Math.min(b.v.y, 0) * 0.3; b.w.multiplyScalar(0.2);
    return { type: "net" };
  }
  if (p.y <= R && b.v.y < 0) {
    p.y = R;
    b.v.y = -b.v.y * 0.74;
    // 上旋讓球彈地後往前竄
    const top = b.w.x * Math.sign(b.v.z || 1);
    const f = 0.7 + clamp(top / 900, -0.08, 0.12);
    b.v.x *= f; b.v.z *= f;
    b.w.multiplyScalar(0.5);
    return { type: "ground", x: p.x, z: p.z };
  }
  return null;
}
function simLanding(p0, v0, w) {
  const b = { p: p0.clone(), v: v0.clone(), w: w.clone() };
  let netY = null;
  for (let i = 1; i < 240 * 5; i++) {
    const pz = b.p.z;
    stepBall(b, DT);
    if (netY === null && (pz > 0) !== (b.p.z > 0)) netY = b.p.y - netH(b.p.x);
    if (b.v.y < 0 && b.p.y <= R) return { x: b.p.x, z: b.p.z, t: i * DT, netY };
  }
  return null;
}
function solveShot(p0, tx, tz, T, w, clearance = 0.2) {
  let best = null;
  for (let tries = 0; tries < 8; tries++) {
    const v = new THREE.Vector3((tx - p0.x) / T, (R - p0.y + 0.5 * G * T * T) / T, (tz - p0.z) / T);
    let land = null;
    for (let it = 0; it < 7; it++) {
      land = simLanding(p0, v, w);
      if (!land) { v.y += 1; continue; }
      const ex = tx - land.x, ez = tz - land.z;
      if (Math.abs(ex) < 0.03 && Math.abs(ez) < 0.03) break;
      v.x += ex / land.t; v.z += ez / land.t;
    }
    best = v;
    if (land && land.netY !== null && land.netY > clearance) return v;
    T *= 1.1;
  }
  return best;
}
/** 預測球在 side 那邊彈地一次後，適合擊球的位置 */
function predictHit(src, side, mustBounce = true) {
  const b = copyBall(src);
  const sz = side === "A" ? -1 : 1;
  let bounced = false;
  for (let i = 1; i < 240 * 4; i++) {
    const ev = physStep(b);
    if (ev && ev.type === "ground") {
      if (ev.z * sz < 0) return null;
      if (bounced) return { x: b.p.x, z: b.p.z, y: b.p.y, t: i * DT, late: true };
      bounced = true;
    }
    if (ev && ev.type === "net") return null;
    if ((bounced || !mustBounce) && b.p.z * sz > 0 && ((b.v.y < 0 && b.p.y < 1.15) || b.p.z * sz > HL + 1.6)) return { x: b.p.x, z: b.p.z, y: b.p.y, t: i * DT };
  }
  return null;
}

// ---------- 遊戲狀態 ----------
const U = ui();
const sfx = new Sfx();
let diff = DIFF.normal, diffKey = "normal";
const PT = ["0", "15", "30", "40"];
const st = {
  phase: "menu",     // menu | serve | rally | point | over
  pts: { P: 0, A: 0 }, games: { P: 0, A: 0 },
  server: "P", first: "P", faults: 0,
  last: "P", bounces: { P: 0, A: 0 }, serving: false,
  timer: 0, toss: 0, tossing: false, aiPlan: 0, aiPending: false, aiWhiff: false,
};
const other = (s) => (s === "P" ? "A" : "P");
const deuceSide = () => (st.pts.P + st.pts.A) % 2 === 0;

// 滑鼠 → 地面
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
const mouse = { x: 0, z: 12, nx: 0 };
function onPointer(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.nx = ndc.x;
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(ground, hit)) { mouse.x = clamp(hit.x, -9, 9); mouse.z = clamp(hit.z, 0.8, 16.5); }
  else mouse.z = 0.8;
}
window.addEventListener("pointermove", onPointer);
window.addEventListener("pointerdown", (e) => {
  sfx.ensure();
  onPointer(e);
  if (st.phase === "serve" && st.server === "P" && e.target === canvas) {
    if (!st.tossing) { st.tossing = true; st.toss = 0; }
    else playerServe();
  }
});

// ---------- 擊球 ----------
function swingAnim(pl, bx) {
  pl.swing = 1;
  // 拿拍的手在小人的左邊（從後面看），球在那邊就是正手
  const local = (bx - pl.x) * (pl === me ? -1 : 1);
  pl.back = local < 0;
}

function playerHit() {
  const dx = ball.p.x - me.x, dz = ball.p.z - me.z;
  const dist = Math.hypot(dx, dz);
  const q = clamp(1 - Math.abs(dist - 0.85) / 1.0, 0, 1);           // 甜蜜點
  const early = clamp((me.z - ball.p.z) / 1.4, -0.6, 1);            // 早擊 → 斜線
  const volley = st.bounces.P === 0;
  const off = clamp(dx / REACH, -1, 1);
  let tx = -off * 3.1 - Math.sign(dx || 1) * early * 1.2 + rand(-0.5, 0.5) * (1.2 - q);
  let tz = -lerp(6.8, 10.6, q) + rand(-0.6, 0.6) * (1 - q);
  if (volley) tz = -lerp(5.5, 9, q);
  tx = clamp(tx, -4.4, 4.4);
  const smash = ball.p.y > 2.0;
  let speed = lerp(15, 24, q) * (volley ? 0.85 : 1) + (smash ? 8 : 0);
  const w = new THREE.Vector3(-lerp(60, 170, q) * (smash ? 0.3 : 1), 0, 0);
  const D = Math.hypot(tx - ball.p.x, tz - ball.p.z);
  ball.w.copy(w);
  ball.v.copy(solveShot(ball.p, tx, tz, D / speed, w, smash ? 0.1 : 0.25));
  afterHit("P");
  swingAnim(me, ball.p.x);
  if (q > 0.8) U.spin(smash ? "殺球！" : "完美擊球！", q, "top");
  else if (smash) U.spin("殺球！", q, "top");
  else if (volley) U.spin("截擊", q, "side");
  else U.spin(q > 0.45 ? "好球" : "勉強救到", q, q > 0.45 ? "back" : "side");
  sfx.noise(0.06, 0.4, 1600 + q * 800, 1.5);
  sfx.tone(300 + q * 200, 0.08, "triangle", 0.2, 150);
}

function aiHit() {
  const volley = st.bounces.A === 0;
  let tx = rand(-diff.corner, diff.corner);
  if (diffKey !== "easy" && Math.random() < 0.55) tx = (me.x > 0 ? -1 : 1) * rand(diff.corner * 0.6, diff.corner); // 打空檔
  let tz = rand(6.5, 10.8);
  if (Math.random() < diff.miss) { if (Math.random() < 0.5) tx = Math.sign(tx || 1) * rand(4.4, 5.4); else tz = rand(12.2, 13.5); }
  tx += rand(-1, 1) * diff.err; tz += rand(-1, 1) * diff.err * 0.6;
  const speed = rand(diff.speed[0], diff.speed[1]) * (volley ? 0.85 : 1);
  const w = new THREE.Vector3(rand(60, 160), diffKey === "hard" ? rand(-40, 40) : 0, 0);
  const D = Math.hypot(tx - ball.p.x, tz - ball.p.z);
  ball.w.copy(w);
  ball.v.copy(solveShot(ball.p, tx, tz, D / speed, w, Math.random() < diff.miss * 0.4 ? -0.3 : 0.25));
  afterHit("A");
  swingAnim(foe, ball.p.x);
  sfx.noise(0.06, 0.3, 1800, 1.5);
  sfx.tone(320, 0.08, "triangle", 0.16, 150);
}

function afterHit(who) {
  st.last = who;
  st.bounces.P = st.bounces.A = 0;
  st.serving = false;
  trail.mat.color.setHex(who === "P" ? 0xffe96a : 0xffffff);
  if (who === "P") { st.aiPending = true; st.aiPlan = diff.react; }
}

function planAI() {
  st.aiPending = false;
  const h = predictHit(ball, "A");
  if (!h) { foe.tx = clamp(ball.p.x * 0.5, -3, 3); foe.tz = -HL - 0.5; return; }
  // 站到球的側面（拿拍那一手），留一點距離
  const side = h.x > 0 ? 1 : -1;
  foe.tx = h.x - side * 0.7 + rand(-0.3, 0.3) * diff.err;
  foe.tz = Math.min(h.z - 0.2, -1.5);
}

// ---------- 發球 ----------
function servePos(who) {
  const ds = deuceSide();
  if (who === "P") return { x: ds ? 0.9 : -0.9, z: HL + 0.35 };
  return { x: ds ? -0.9 : 0.9, z: -HL - 0.35 };
}
function serveBox(who) { // 發球要落的區域
  const ds = deuceSide();
  if (who === "P") return ds ? { x0: -SW, x1: 0, z0: -SL, z1: 0 } : { x0: 0, x1: SW, z0: -SL, z1: 0 };
  return ds ? { x0: 0, x1: SW, z0: 0, z1: SL } : { x0: -SW, x1: 0, z0: 0, z1: SL };
}

function setupServe(keepFault = false) {
  if (!keepFault) st.faults = 0;
  const total = st.games.P + st.games.A;
  st.server = total % 2 === 0 ? st.first : other(st.first);
  st.phase = "serve";
  st.timer = 0; st.toss = 0; st.tossing = false;
  st.bounces.P = st.bounces.A = 0;
  const sp = servePos(st.server);
  const rp = servePos(other(st.server));
  const recvBox = serveBox(st.server);
  if (st.server === "P") {
    me.x = me.tx = sp.x; me.z = me.tz = sp.z;
    foe.x = foe.tx = (recvBox.x0 + recvBox.x1) / 2 * 1.1; foe.z = foe.tz = -HL - 0.6;
    U.$("hint").textContent = (st.faults ? "第二發球！" : "") + "點一下拋球，再在最高點點一下發球（游標左右選落點）";
  } else {
    foe.x = foe.tx = sp.x; foe.z = foe.tz = sp.z;
    me.x = me.tx = (recvBox.x0 + recvBox.x1) / 2 * 1.1; me.z = me.tz = HL + 0.6;
    mouse.x = me.x; mouse.z = me.z;
    U.$("hint").textContent = (st.faults ? "對手第二發球" : "對手發球") + "，球彈地一次後才能回擊";
  }
  ball.v.set(0, 0, 0); ball.w.set(0, 0, 0);
  landMark.material.opacity = 0;
  updateScore();
}

function tossHeight(t) { return 1.25 + 4.6 * t - 0.5 * G * t * t; } // 拋到約 2.33m 高（t≈0.47 最高）

function playerServe() {
  const t = st.toss;
  const apex = 4.6 / G;
  const q = clamp(1 - Math.abs(t - apex) / 0.35, 0, 1);
  const box = serveBox("P");
  const k = clamp((mouse.nx + 1) / 2, 0, 1);
  let tx = lerp(box.x0 + 0.35, box.x1 - 0.35, k);
  let tz = -lerp(4.3, 5.9, q);
  tx += rand(-1, 1) * (1 - q) * 1.6; tz += rand(-1, 1) * (1 - q) * 1.4;
  const p0 = new THREE.Vector3(me.x - 0.25, Math.max(1.9, tossHeight(t)) + 0.35, me.z);
  ball.p.copy(p0);
  const speed = lerp(17, 30, q);
  const w = new THREE.Vector3(-60, 0, 0);
  ball.w.copy(w);
  const D = Math.hypot(tx - p0.x, tz - p0.z);
  ball.v.copy(solveShot(p0, tx, tz, D / speed, w, q < 0.25 ? -0.2 : 0.12));
  startRally("P");
  swingAnim(me, me.x - 1);
  me.swing = 1; me.back = false;
  U.spin(q > 0.85 ? "愛司級發球！" : q > 0.5 ? "好發球" : "時機不太對", q, q > 0.5 ? "top" : "side");
  sfx.noise(0.07, 0.45, 2000, 1.5);
  sfx.tone(260 + q * 220, 0.08, "triangle", 0.2, 140);
  st.aiPending = true; st.aiPlan = diff.react;
}

function aiServe() {
  const box = serveBox("A");
  const second = st.faults > 0;
  let tx = rand(box.x0 + 0.4, box.x1 - 0.4), tz = rand(4.2, 5.9);
  const fault = Math.random() < diff.fault[second ? 1 : 0];
  if (fault) { if (Math.random() < 0.5) tz = rand(6.7, 7.5); else tx += Math.sign(tx) * 2.4; }
  const p0 = new THREE.Vector3(foe.x + 0.25, 2.7, foe.z);
  ball.p.copy(p0);
  const speed = second ? rand(15, 19) : rand(diff.speed[0] + 4, diff.speed[1] + 6);
  const w = new THREE.Vector3(60, 0, 0);
  ball.w.copy(w);
  const D = Math.hypot(tx - p0.x, tz - p0.z);
  ball.v.copy(solveShot(p0, tx, tz, D / speed, w, 0.12));
  startRally("A");
  foe.swing = 1; foe.back = false;
  sfx.noise(0.07, 0.4, 1900, 1.5);
}

function startRally(who) {
  st.phase = "rally";
  st.last = who;
  st.serving = true;
  st.bounces.P = st.bounces.A = 0;
  U.$("hint").textContent = "";
  trail.reset(ball.p);
  trail.mat.color.setHex(who === "P" ? 0xffe96a : 0xffffff);
}

// ---------- 規則 ----------
function inBox(x, z, b) { return x >= b.x0 - R && x <= b.x1 + R && z >= b.z0 - R && z <= b.z1 + R; }
function onEvent(ev) {
  if (ev.type === "net") { sfx.tone(140, 0.12, "triangle", 0.2); if (st.phase === "rally" && st.serving) return fault("觸網"); return; }
  if (ev.type !== "ground") return;
  sfx.tone(st.phase === "rally" ? 220 : 180, 0.05, "sine", 0.18, 120);
  if (st.phase !== "rally") return;
  const hitter = st.last, recv = other(hitter);
  const recvSide = recv === "P" ? 1 : -1;
  showLand(ev.x, ev.z);
  if (st.serving) {
    if (!inBox(ev.x, ev.z, serveBox(hitter))) return fault("出界");
    st.serving = false;
    st.bounces[recv] = 1;
    return;
  }
  const onRecvSide = ev.z * recvSide > 0;
  if (st.bounces[recv] === 0) {
    if (!onRecvSide) return lose(hitter, "沒過網");
    if (Math.abs(ev.x) > SW + R || Math.abs(ev.z) > HL + R) return lose(hitter, hitter === "P" ? "出界" : "對手出界");
    st.bounces[recv] = 1;
    return;
  }
  st.bounces[recv]++;
  if (st.bounces[recv] >= 2) lose(recv, recv === "P" ? "沒追到" : "對手沒追到");
}
function showLand(x, z) { landMark.position.set(x, 0.015, z); landMark.material.opacity = 0.9; }

function fault(why) {
  st.faults++;
  st.phase = "point";
  st.timer = 0;
  if (st.faults >= 2) {
    st.pendingLose = { who: st.last, reason: "雙發失誤" };
    return lose(st.last, "雙發失誤");
  }
  st.secondServe = true;
  U.toast("發球失誤（" + why + "）", st.last === "P" ? "bad" : "good", 1100);
  sfx.tone(240, 0.15, "triangle", 0.15);
}

function lose(who, reason) {
  const win = other(who);
  st.secondServe = false;
  st.phase = "point";
  st.timer = 0;
  st.pts[win]++;
  let msg = "", gameWon = null;
  const a = st.pts[win], b = st.pts[who];
  if (a >= 4 && a - b >= 2) gameWon = win;
  if (gameWon) {
    st.games[win]++;
    st.pts.P = st.pts.A = 0;
    msg = win === "P" ? "拿下這局！" : "對手拿下這局";
    crowd.cheer = 2;
    sfx.cheer();
  } else {
    msg = win === "P" ? "得分！" : "失分";
    if (win === "P") crowd.cheer = 1;
  }
  const good = win === "P";
  U.toast(msg + "　" + reason, good ? "good" : "bad", 1500);
  sfx.point(good);
  me.mood = good ? 1 : -1; foe.mood = good ? -1 : 1;
  updateScore();
}

function pointText(me_, op) {
  if (me_ >= 3 && op >= 3) return me_ === op ? "40" : me_ > op ? "AD" : "40";
  return PT[Math.min(me_, 3)];
}
function updateScore() {
  const { P, A } = st.pts;
  U.$("pMe").textContent = P >= 3 && A >= 3 && P === A ? "平" : pointText(P, A);
  U.$("pAi").textContent = P >= 3 && A >= 3 && P === A ? "平" : pointText(A, P);
  U.$("games").textContent = `${st.games.P} : ${st.games.A}`;
  U.$("sMe").classList.toggle("serve", st.server === "P" && st.phase !== "over");
  U.$("sAi").classList.toggle("serve", st.server === "A" && st.phase !== "over");
  U.$("sDiff").textContent = `局數・難度${diff.name}`;
}

function checkOver() {
  const { P, A } = st.games;
  if (P >= 4 || A >= 4) {
    st.phase = "over";
    document.body.classList.remove("playing");
    const won = P > A;
    U.$("oTitle").textContent = won ? "🏆 冠軍是你！" : "再接再厲！";
    U.$("oScore").textContent = `${P} : ${A}`;
    U.$("oSub").textContent = `難度：${diff.name}　${won ? (diffKey === "hard" ? "職業級！" : "試試更高難度？") : "提早跑位，讓球落在手臂範圍正中間"}`;
    U.show("over", true);
    U.$("hint").textContent = "";
    won ? sfx.win() : sfx.lose();
    crowd.cheer = won ? 3 : 0;
    return true;
  }
  return false;
}

function startGame(k) {
  diffKey = k; diff = DIFF[k];
  st.pts.P = st.pts.A = 0; st.games.P = st.games.A = 0;
  U.show("menu", false); U.show("over", false);
  document.body.classList.add("playing");
  setupServe();
}
document.querySelectorAll(".diffs button").forEach((b) => b.addEventListener("click", () => { sfx.ensure(); startGame(b.dataset.d); }));
U.$("bAgain").onclick = () => { st.first = other(st.first); startGame(diffKey); };
U.$("bDiff").onclick = U.$("bMenu").onclick = () => { st.phase = "menu"; document.body.classList.remove("playing"); U.show("over", false); U.show("menu", true); };
U.$("bSound").onclick = () => { sfx.on = !sfx.on; U.$("bSound").textContent = sfx.on ? "🔊" : "🔇"; };

// ---------- 每幀 ----------
const clock = new THREE.Clock();
let acc = 0;

function movePlayer(pl, tx, tz, speed, dt) {
  const dx = tx - pl.x, dz = tz - pl.z, d = Math.hypot(dx, dz);
  const mv = Math.min(d, speed * dt);
  if (d > 0.05) { pl.x += dx / d * mv; pl.z += dz / d * mv; pl.speed = speed; pl.dir = Math.atan2(dx, dz); }
  else pl.speed = 0;
}

function canHit(who) {
  if (st.phase !== "rally" || st.last === who) return false;
  if (st.serving) return false;            // 發球一定要先落地
  if (st.bounces[who] > 1) return false;
  const pl = who === "P" ? me : foe;
  const side = who === "P" ? 1 : -1;
  if (ball.p.z * side < 0.3) return false;
  if (ball.p.y < 0.12 || ball.p.y > 2.7) return false;
  if (who === "A" && st.bounces.A === 0) return false;   // 電腦不截擊
  if (who === "A" && st.aiWhiff) return false;
  const d = Math.hypot(ball.p.x - pl.x, ball.p.z - pl.z);
  if (d > REACH) return false;
  // 等球跑到身邊再打（越接近越好），球要離開範圍前一定出手
  const ahead = (pl.z - ball.p.z) * side;
  const nx = ball.p.x + ball.v.x * DT * 4, nz = ball.p.z + ball.v.z * DT * 4;
  const leaving = Math.hypot(nx - pl.x, nz - pl.z) > REACH;
  return ahead < 0.35 || leaving || ball.v.z * side <= 0;
}

function update(dt) {
  const t = clock.elapsedTime;
  // 玩家：跟著游標（發球時不動）
  if (st.phase === "rally" || st.phase === "point" || (st.phase === "serve" && st.server === "A")) {
    movePlayer(me, mouse.x, Math.max(mouse.z, 0.8), RUN, dt);
  } else me.speed = 0;
  // 電腦
  if (st.aiPending) { st.aiPlan -= dt; if (st.aiPlan <= 0) planAI(); }
  if (st.phase === "rally" && st.last === "A") { foe.tx = clamp(-ball.p.x * 0.25 + rand(-0.02, 0.02), -2.5, 2.5); foe.tz = -HL - 0.8; }
  if (st.phase !== "serve" || st.server === "P") movePlayer(foe, foe.tx, foe.tz, st.phase === "rally" ? diff.aiSpeed : 3, dt);
  else foe.speed = 0;

  acc += dt;
  let n = 0;
  while (acc >= DT && n < 12) {
    acc -= DT; n++;
    if (st.phase === "rally" || st.phase === "point") {
      const ev = physStep(ball);
      if (ev) onEvent(ev);
      if (st.phase === "rally") {
        if (Math.abs(ball.p.z) > HL + 12 || Math.abs(ball.p.x) > 16) onEvent({ type: "ground", x: ball.p.x, z: ball.p.z });
        if (canHit("P")) playerHit();
        else if (canHit("A")) aiHit();
      }
    }
  }
  if (n >= 12) acc = 0;

  if (st.phase === "serve") {
    st.timer += dt;
    if (st.server === "P") {
      if (st.tossing) {
        st.toss += dt;
        if (st.toss > 1.15) { st.tossing = false; st.toss = 0; U.$("hint").textContent = "太慢了，再拋一次！點一下拋球"; }
      }
      const h = st.tossing ? tossHeight(st.toss) : 1.05;
      ball.p.set(me.x - 0.25, h, me.z - 0.1);
    } else {
      const tt = Math.max(0, st.timer - 0.8);
      const h = st.timer > 0.8 ? tossHeight(tt) : 1.05;
      ball.p.set(foe.x + 0.25, h, foe.z + 0.1);
      if (tt > 0.45) aiServe();
    }
  } else if (st.phase === "point") {
    st.timer += dt;
    if (st.timer > 1.6) {
      if (st.secondServe) { st.secondServe = false; setupServe(true); }
      else if (!checkOver()) setupServe();
    }
  }
}

const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 8.6, HL + 11), camLook = new THREE.Vector3(0, 0, -0.5);
function poseRacketArm(pl, t) {
  const c = pl.c;
  const s = 1 - pl.swing;                 // 0 → 1
  if (pl.swing > 0) {
    if (!pl.back) { c.armR.rotation.set(0, lerp(1.6, -1.7, s), 1.15); }
    else { c.armR.rotation.set(0, lerp(-2.6, -0.2, s), 1.0); }
    c.g.rotation.y = pl.face + (pl.back ? -1 : 1) * Math.sin(s * Math.PI) * 0.5;
  } else {
    c.armR.rotation.set(0, 0.5 + Math.sin(t * 2) * 0.05, 0.55);
  }
  pl.rk.rotation.set(Math.PI - 0.3, 0, 0);
}

function render(dt) {
  const t = clock.elapsedTime;
  for (const pl of [me, foe]) {
    const fwd = pl === me ? Math.PI : 0;     // 面向球網
    // 跑步時身體朝移動方向轉一點
    const want = pl.speed > 0 ? fwd + clamp(Math.atan2(Math.sin(pl.dir - fwd), Math.cos(pl.dir - fwd)), -1.1, 1.1) * 0.6 : fwd;
    pl.face += (want - pl.face) * (1 - Math.exp(-dt * 10));
    pl.c.g.position.set(pl.x, 0, pl.z);
    pl.c.g.rotation.y = pl.face;
    animChibi(pl.c, t, pl.speed);
    pl.swing = Math.max(0, pl.swing - dt / 0.32);
    poseRacketArm(pl, t);
    if (st.phase === "point" || st.phase === "over") {
      pl.c.armL.rotation.z = pl.mood > 0 ? -2.6 + Math.sin(t * 14) * 0.25 : -0.2;
      pl.c.head.rotation.x = pl.mood < 0 ? 0.3 : 0;
      if (pl.mood > 0) pl.c.g.position.y = Math.abs(Math.sin(t * 9)) * 0.18;
    } else { pl.c.armL.rotation.z = -0.18; pl.c.head.rotation.x = 0; }
    pl.sh.position.set(pl.x, 0.01, pl.z);
  }
  // 拋球時拿球的手舉起來
  if (st.phase === "serve") {
    const srv = st.server === "P" ? me : foe;
    srv.c.armL.rotation.z = -(st.tossing || (st.server === "A" && st.timer > 0.8) ? 2.7 : 0.9);
  }
  umpire.head.rotation.y = clamp(ball.p.z * 0.06, -0.8, 0.8);

  ballMesh.position.copy(ball.p);
  const wl = ball.w.length();
  if (wl > 1) ballMesh.rotateOnWorldAxis(tmp.copy(ball.w).normalize(), Math.min(wl * dt * 0.2, 0.9));
  ballShadow.position.set(ball.p.x, 0.012, ball.p.z);
  const sc = 0.18 + ball.p.y * 0.05;
  ballShadow.scale.set(sc, 1, sc);
  ballShadow.material.opacity = clamp(0.85 - ball.p.y * 0.12, 0.25, 0.85);
  if (st.phase === "rally" || st.phase === "point") trail.push(ball.p);
  trail.line.visible = st.phase === "rally" || st.phase === "point";
  landMark.material.opacity = Math.max(0, landMark.material.opacity - dt * 0.6);

  reachRing.position.set(me.x, 0.012, me.z);
  const inR = st.phase === "rally" && st.last === "A" && Math.hypot(ball.p.x - me.x, ball.p.z - me.z) < REACH;
  reachRing.material.color.setHex(inR ? 0xffd84d : 0xffffff);
  reachRing.material.opacity = st.phase === "menu" ? 0 : inR ? 0.75 : 0.32;
  cursorRing.visible = st.phase === "rally" || st.phase === "point" || (st.phase === "serve" && st.server === "A");
  cursorRing.position.set(mouse.x, 0.013, Math.max(mouse.z, 0.8));
  aimRing.visible = st.phase === "serve" && st.server === "P";
  if (aimRing.visible) {
    const box = serveBox("P"), k = clamp((mouse.nx + 1) / 2, 0, 1);
    aimRing.position.set(lerp(box.x0 + 0.35, box.x1 - 0.35, k), 0.014, -5.1);
  }

  // 觀眾歡呼：跳一跳
  if (crowd.cheer > 0) {
    crowd.cheer = Math.max(0, crowd.cheer - dt);
    const m4 = new THREE.Matrix4();
    const amp = Math.min(1, crowd.cheer) * 0.25;
    for (let i = 0; i < crowd.seats.length; i += 1) {
      const v = crowd.seats[i], j = Math.max(0, Math.sin(t * 12 + i * 1.7)) * amp;
      m4.makeScale(1, 1.1, 1).setPosition(v.x, v.y + 0.3 + j, v.z); crowd.bodies.setMatrixAt(i, m4);
      m4.makeTranslation(v.x, v.y + 0.8 + j, v.z); crowd.heads.setMatrixAt(i, m4);
    }
    crowd.bodies.instanceMatrix.needsUpdate = crowd.heads.instanceMatrix.needsUpdate = true;
  }

  // 鏡頭：跟著玩家左右、前後移動一點
  const cx = clamp(me.x * 0.45, -4, 4), cz = HL + 11 + clamp((me.z - HL) * 0.6, -4, 3);
  camPos.x += (cx - camPos.x) * (1 - Math.exp(-dt * 3));
  camPos.z += (cz - camPos.z) * (1 - Math.exp(-dt * 3));
  camera.position.copy(camPos);
  camera.lookAt(camLook.x + camPos.x * 0.4, camLook.y, camLook.z);
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
me.x = me.tx = 0.9; me.z = me.tz = HL + 0.35; me.face = Math.PI;
foe.x = foe.tx = -0.9; foe.z = foe.tz = -HL - 0.35;
ball.p.set(0.65, 1.05, HL + 0.25);
camera.position.copy(camPos); camera.lookAt(camLook);
requestAnimationFrame(frame);

window.tennis = { st, ball, me, foe, mouse, DIFF, startGame, predictHit, solveShot, simLanding, playerServe, aiServe, canHit, consts: { HL, SW, SL, REACH } };
