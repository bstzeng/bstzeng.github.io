// 霓虹滾球 — 物理（純計算，不依賴 three.js，可在 Node 測試）
// 座標：格子 (i, j) 佔 x∈[i, i+1]、z∈[j, j+1]；球在 xz 平面上滾動。
export const P = {
  R: 0.3,            // 球半徑（格）
  HOLE_R: 0.36,      // 洞半徑
  G: 24,             // 重力（格/s²），換算後手感接近真實的小鋼珠迷宮
  maxTilt: 0.44,     // 最大傾角 ~25°
  roll: 0.32,        // 滾動阻力
  maxV: 11,
  wallE: 0.42,       // 撞牆恢復係數
  bumperR: 0.26,
  bumperKick: 3.2,
  boost: 10,
  spinR: 0.09,
  hubR: 0.17,
  sub: 1 / 240,
};

export function createWorld(def) {
  const map = def.map.map((r) => [...r]);
  const h = map.length, w = map[0].length;
  const W = { def, map, w, h, t: 0, holes: [], goal: null, start: null, checkpoints: [], bumpers: [], boosts: [], doors: [], switches: [], doorsOpen: false, doorAnim: 0 };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = map[j][i], cx = i + 0.5, cz = j + 0.5;
    if (c === "S") W.start = { x: cx, z: cz };
    else if (c === "G") W.goal = { x: cx, z: cz };
    else if (c === "O") W.holes.push({ x: cx, z: cz });
    else if (c === "C") W.checkpoints.push({ x: cx, z: cz, i, j, on: false });
    else if (c === "B") W.bumpers.push({ x: cx, z: cz, flash: 0 });
    else if (">< ^v".includes(c) && c !== " ") W.boosts.push({ i, j, dir: c });
    else if (c === "D") W.doors.push({ i, j });
    else if (c === "K") W.switches.push({ x: cx, z: cz, i, j, on: false });
  }
  W.movers = (def.movers || []).map((m) => ({ ...m, pos: 0, vel: 0 }));
  W.spinners = (def.spinners || []).map((s) => ({ ...s, cx: s.x + 0.5, cz: s.z + 0.5, angle: 0 }));
  updateDynamic(W);
  return W;
}

const BOOST = { ">": [1, 0], "<": [-1, 0], "^": [0, -1], v: [0, 1] };

export function charAt(W, i, j) { return W.map[j]?.[i] ?? "#"; }
function solid(W, i, j) {
  const c = charAt(W, i, j);
  return c === "#" || (c === "D" && W.doorAnim < 0.6);
}

function updateDynamic(W) {
  for (const m of W.movers) {
    const L = m.max - m.min;
    const start = (m.axis === "x" ? m.x : m.z) - m.min;
    let s = (start + Math.abs(m.speed) * W.t) % (2 * L);
    const dir = s < L ? 1 : -1;
    m.pos = m.min + (s < L ? s : 2 * L - s);
    m.vel = dir * Math.abs(m.speed);
  }
  for (const s of W.spinners) s.angle = s.speed * W.t;
}

export function newBall(W) {
  return { x: W.start.x, z: W.start.z, vx: 0, vz: 0, state: "spawn", t: 0, cp: { ...W.start }, spin: { x: 0, z: 0 } };
}

export function respawn(W, b) {
  Object.assign(b, { x: b.cp.x, z: b.cp.z, vx: 0, vz: 0, state: "spawn", t: 0 });
}

/* ---------- 碰撞 ---------- */
function hitBox(b, minx, minz, maxx, maxz, svx, svz, e, ev, kind) {
  const R = P.R;
  const cx = Math.max(minx, Math.min(b.x, maxx)), cz = Math.max(minz, Math.min(b.z, maxz));
  let dx = b.x - cx, dz = b.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return 0;
  let nx, nz, pen;
  if (d2 < 1e-10) { // 球心在方塊內：沿最短方向推出
    const l = b.x - minx, r = maxx - b.x, u = b.z - minz, d = maxz - b.z;
    const m = Math.min(l, r, u, d);
    if (m === l) { nx = -1; nz = 0; } else if (m === r) { nx = 1; nz = 0; } else if (m === u) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
    pen = m + R;
  } else {
    const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = R - d;
  }
  b.x += nx * pen; b.z += nz * pen;
  resolveVel(b, nx, nz, svx, svz, e, ev, kind);
  return pen;
}
function hitCircle(b, cx, cz, r, svx, svz, e, ev, kind, kick = 0) {
  const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz), min = P.R + r;
  if (d >= min || d < 1e-9) return 0;
  const nx = dx / d, nz = dz / d, pen = min - d;
  b.x += nx * pen; b.z += nz * pen;
  const hit = resolveVel(b, nx, nz, svx, svz, e, ev, kind);
  if (kick && hit > 0.3) { b.vx += nx * kick; b.vz += nz * kick; }
  return pen;
}
function resolveVel(b, nx, nz, svx, svz, e, ev, kind) {
  const rvx = b.vx - svx, rvz = b.vz - svz;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0;
  b.vx = rvx - (1 + e) * vn * nx + svx;
  b.vz = rvz - (1 + e) * vn * nz + svz;
  ev && ev.onHit && ev.onHit(-vn, kind);
  return -vn;
}
function hitSegment(b, ax, az, bx, bz, r, cx, cz, omega, e, ev) {
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
  const t = Math.max(0, Math.min(1, ((b.x - ax) * ex + (b.z - az) * ez) / L2));
  const px = ax + ex * t, pz = az + ez * t;
  // 旋轉臂上該點的線速度 ω × r
  const svx = -omega * (pz - cz), svz = omega * (px - cx);
  return hitCircle(b, px, pz, r, svx, svz, e, ev, "spinner");
}

function collideAll(W, b, ev) {
  const R = P.R;
  let maxPen = 0;
  const i0 = Math.floor(b.x - R), i1 = Math.floor(b.x + R), j0 = Math.floor(b.z - R), j1 = Math.floor(b.z + R);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (solid(W, i, j)) maxPen = Math.max(maxPen, hitBox(b, i, j, i + 1, j + 1, 0, 0, P.wallE, ev, "wall"));
  for (const m of W.movers) {
    const [minx, minz] = m.axis === "x" ? [m.pos + 0.03, m.z + 0.03] : [m.x + 0.03, m.pos + 0.03];
    const svx = m.axis === "x" ? m.vel : 0, svz = m.axis === "z" ? m.vel : 0;
    maxPen = Math.max(maxPen, hitBox(b, minx, minz, minx + 0.94, minz + 0.94, svx, svz, 0.3, ev, "mover"));
  }
  for (const s of W.spinners) {
    const ux = Math.cos(s.angle) * s.len, uz = Math.sin(s.angle) * s.len;
    maxPen = Math.max(maxPen, hitSegment(b, s.cx - ux, s.cz - uz, s.cx + ux, s.cz + uz, P.spinR, s.cx, s.cz, s.speed, 0.5, ev));
    maxPen = Math.max(maxPen, hitCircle(b, s.cx, s.cz, P.hubR, 0, 0, 0.5, ev, "spinner"));
  }
  for (const bp of W.bumpers) if (Math.abs(bp.x - b.x) < 1 && Math.abs(bp.z - b.z) < 1) {
    const p = hitCircle(b, bp.x, bp.z, P.bumperR, 0, 0, 0.9, ev && { onHit: (v) => { bp.flash = 1; ev.onHit && ev.onHit(v, "bumper"); } }, "bumper", P.bumperKick);
    maxPen = Math.max(maxPen, p);
  }
  return maxPen;
}

function overlapDepth(W, b) {
  // 解完碰撞後還剩多少重疊：太大代表球被夾住（被推擠牆壓到牆上）
  const probe = { x: b.x, z: b.z, vx: 0, vz: 0 };
  return collideAll(W, probe, null);
}

/* ---------- 主步進 ---------- */
// ax, az：螢幕/世界方向上的傾角（rad），正 x = 右邊低、正 z = 靠近玩家那邊低
export function step(W, b, tiltX, tiltZ, dt, ev = {}) {
  const n = Math.max(1, Math.ceil(dt / P.sub));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    W.t += h;
    if (W.doorsOpen && W.doorAnim < 1) W.doorAnim = Math.min(1, W.doorAnim + h * 1.4);
    updateDynamic(W);
    b.t += h;
    if (b.state === "spawn") { if (b.t > 0.55) { b.state = "roll"; b.t = 0; } continue; }
    if (b.state !== "roll") continue;

    const A = P.G * (5 / 7);
    let ax = A * Math.sin(tiltX), az = A * Math.sin(tiltZ);
    const ti = Math.floor(b.x), tj = Math.floor(b.z), c = charAt(W, ti, tj);
    if (BOOST[c]) { ax += BOOST[c][0] * P.boost; az += BOOST[c][1] * P.boost; }
    // 洞口邊緣：球心越過洞緣時會被拉進去
    for (const hole of [...W.holes, W.goal]) {
      const dx = hole.x - b.x, dz = hole.z - b.z, d = Math.hypot(dx, dz);
      if (d < P.HOLE_R + 0.1 && d > 1e-6) { const f = 5 * (1 - (d - P.HOLE_R) / 0.1); ax += (dx / d) * f; az += (dz / d) * f; }
    }
    b.vx += ax * h; b.vz += az * h;
    const damp = Math.max(0, 1 - P.roll * h);
    b.vx *= damp; b.vz *= damp;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > P.maxV) { b.vx *= P.maxV / sp; b.vz *= P.maxV / sp; }
    b.x += b.vx * h; b.z += b.vz * h;
    b.spin.x += b.vx * h; b.spin.z += b.vz * h;

    collideAll(W, b, ev);
    if (overlapDepth(W, b) > 0.08) { b.state = "crush"; b.t = 0; ev.onCrush && ev.onCrush(); continue; }

    // 掉洞 / 進終點
    for (const hole of W.holes) if (Math.hypot(hole.x - b.x, hole.z - b.z) < P.HOLE_R - 0.03) { b.state = "fall"; b.t = 0; b.fallTo = hole; ev.onFall && ev.onFall(); break; }
    if (b.state !== "roll") continue;
    if (Math.hypot(W.goal.x - b.x, W.goal.z - b.z) < P.HOLE_R - 0.03) { b.state = "win"; b.t = 0; b.fallTo = W.goal; ev.onWin && ev.onWin(); continue; }
    // 暫存點 / 開關
    for (const cp of W.checkpoints) if (!cp.on && ti === cp.i && tj === cp.j) {
      for (const o of W.checkpoints) o.on = false;
      cp.on = true; b.cp = { x: cp.x, z: cp.z }; ev.onCheckpoint && ev.onCheckpoint(cp);
    }
    for (const sw of W.switches) if (!sw.on && Math.hypot(sw.x - b.x, sw.z - b.z) < 0.35) { sw.on = true; W.doorsOpen = true; ev.onSwitch && ev.onSwitch(sw); }
  }
}
