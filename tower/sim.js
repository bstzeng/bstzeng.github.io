// 機關塔 3D — 物理模擬核心（Rapier 剛體物理）
// 這個檔案只負責「物理世界」與幾何資料，不依賴 three.js，所以也能在 Node 裡跑自動測試。
// 所有東西都是真實剛體：球靠重力滾、分球器靠球的重量翻、翻斗靠槓桿、水車靠球推、升降機靠旋轉的推桿把球推上螺旋軌道。

export const CFG = {
  ballR: 0.12,
  railR: 0.025,
  railS: 0.08, // 底軌左右間距的一半
  railH: 0.1209, // 底軌在球心下方的距離 (sqrt((r+rr)^2 - s^2))
  guardS: 0.165,
  guardZ: 0.03,
  capZ: 0.172,
  ballDamping: 0.3, // 空氣阻力 + 滾動損耗（等效線性阻尼）
  dt: 1 / 240,
  liftR: 0.5,
  liftY0: 0.42,
  liftTop: 10.6,
  liftTurns: 10,
  liftOmega: 2.2, // rad/s
  towerR: 4.9,
  floorR: 5.2,
};

const G = 9.81;
const UP = [0, 1, 0];

/* ---------------- 向量 / 四元數小工具 ---------------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const reject = (v, n) => sub(v, mul(n, dot(v, n)));
const dist = (a, b) => len(sub(a, b));
const deg = Math.PI / 180;

function qAxisAngle(ax, ang) { const s = Math.sin(ang / 2); const a = norm(ax); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; }
function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qFromBasis(x, y, z) { // 旋轉矩陣欄向量 = x,y,z
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = s / 4; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = s / 4; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = s / 4; qz = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = s / 4; }
  return [qx, qy, qz, qw];
}
function qFromUnitVectors(u, v) {
  const d = dot(u, v);
  if (d < -0.999999) { let ax = cross([1, 0, 0], u); if (len(ax) < 1e-6) ax = cross([0, 1, 0], u); return qAxisAngle(ax, Math.PI); }
  const c = cross(u, v);
  const q = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
const Q = (q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
const V = (v) => ({ x: v[0], y: v[1], z: v[2] });

/* ---------------- 曲線：向心 Catmull-Rom ---------------- */
function crSample(ctrl, per = 20) {
  // ctrl: [{p, v2, flags}] → 細分點 [{p, v2, flags}]
  const n = ctrl.length;
  const P = ctrl.map((c) => c.p);
  const ext0 = sub(mul(P[0], 2), P[1]);
  const extN = sub(mul(P[n - 1], 2), P[n - 2]);
  const get = (i) => (i < 0 ? ext0 : i >= n ? extN : P[i]);
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t0 = 0, t1 = t0 + Math.pow(dist(p0, p1), 0.5) + 1e-6, t2 = t1 + Math.pow(dist(p1, p2), 0.5) + 1e-6, t3 = t2 + Math.pow(dist(p2, p3), 0.5) + 1e-6;
    for (let k = 0; k < per; k++) {
      const u = k / per;
      const t = t1 + (t2 - t1) * u;
      const A1 = add(mul(p0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0)));
      const A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1)));
      const A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(p3, (t - t2) / (t3 - t2)));
      const B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0)));
      const B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)));
      const C = add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1)));
      out.push({ p: C, v2: ctrl[i].v2 + (ctrl[i + 1].v2 - ctrl[i].v2) * u, flags: ctrl[i].flags.split("").filter((f) => ctrl[i + 1].flags.includes(f)).join("") });
    }
  }
  out.push({ p: P[n - 1], v2: ctrl[n - 1].v2, flags: ctrl[n - 1].flags });
  return out;
}

function resample(dense, step) {
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = dense[i - 1], b = dense[i];
    let d = dist(a.p, b.p);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const np = { p: lerp(a.p, b.p, t), v2: a.v2 + (b.v2 - a.v2) * t, flags: t < 0.5 ? a.flags : b.flags };
      out.push(np);
      a = np; d = dist(a.p, b.p); acc = 0;
    }
    acc += d;
  }
  const last = dense[dense.length - 1];
  if (dist(out[out.length - 1].p, last.p) > step * 0.3) out.push(last); else out[out.length - 1] = last;
  return out;
}

function smoothVecs(arr, w) {
  return arr.map((_, i) => {
    let s = [0, 0, 0];
    for (let k = -w; k <= w; k++) s = add(s, arr[Math.min(arr.length - 1, Math.max(0, i + k))]);
    return s;
  });
}

/* ---------------- 軌道：四根軌條（兩根底軌 + 兩根護欄），必要時加頂軌 ---------------- */
// ctrl 每個點：[x, y, z, v2?, flags?]   v2 = 設計速度平方（決定傾斜角），flags: 'c' 頂軌、'n' 無護欄
export function buildTrackGeometry(ctrlRaw, opt = {}) {
  const v2d = opt.v2 ?? 3;
  const maxBank = opt.maxBank ?? 0.75;
  const ctrl = ctrlRaw.map((c) => ({ p: [c[0], c[1], c[2]], v2: c[3] ?? v2d, flags: c[4] ?? "" }));
  const step = 0.05;
  const S0 = resample(crSample(ctrl, 24), step);
  const n = S0.length;
  const P = S0.map((s) => s.p);
  const T = P.map((_, i) => norm(sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)])));
  let K = T.map((_, i) => {
    const a = T[Math.max(0, i - 1)], b = T[Math.min(n - 1, i + 1)];
    const ds = dist(P[Math.max(0, i - 1)], P[Math.min(n - 1, i + 1)]) || step;
    return mul(sub(b, a), 1 / ds);
  });
  K = smoothVecs(K, 4).map((k) => mul(k, 1 / 9));
  let N = [];
  let prev = UP;
  for (let i = 0; i < n; i++) {
    const t = T[i];
    let want = reject(add(mul(UP, G), mul(K[i], S0[i].v2)), t);
    if (len(want) < 1e-4) want = reject(prev, t);
    want = norm(want);
    const base0 = reject(UP, t);
    if (len(base0) > 0.05 && maxBank < 3 && !S0[i].flags.includes("c")) {
      const base = norm(base0);
      const ang = Math.acos(Math.min(1, Math.max(-1, dot(want, base))));
      if (ang > maxBank) {
        const ax = cross(base, want);
        if (len(ax) > 1e-6) want = norm(rotateAround(base, norm(ax), maxBank));
      }
    }
    N.push(want);
    prev = want;
  }
  N = smoothVecs(N, 3).map((v, i) => norm(reject(v, T[i])));
  const Sd = N.map((nv, i) => norm(cross(T[i], nv)));

  const { railH, railS, guardS, guardZ, capZ } = CFG;
  const bl = [], br = [], gl = [], gr = [], hasGuard = [];
  const guardRuns = [], capRuns = [];
  let gRun = null, cRun = null;
  for (let i = 0; i < n; i++) {
    const p = P[i], nv = N[i], s = Sd[i];
    const down = mul(nv, -railH);
    bl.push(add(add(p, down), mul(s, -railS)));
    br.push(add(add(p, down), mul(s, railS)));
    const hg = !S0[i].flags.includes("n") && opt.guards !== false;
    hasGuard.push(hg);
    if (hg) {
      if (!gRun) { gRun = { l: [], r: [] }; guardRuns.push(gRun); }
      gRun.l.push(add(add(p, mul(s, -guardS)), mul(nv, guardZ)));
      gRun.r.push(add(add(p, mul(s, guardS)), mul(nv, guardZ)));
    } else gRun = null;
    if (S0[i].flags.includes("c")) {
      if (!cRun) { cRun = []; capRuns.push(cRun); }
      cRun.push(add(p, mul(nv, capZ)));
    } else cRun = null;
  }
  return { P, T, N, S: Sd, bottom: [bl, br], guardRuns, capRuns, hasGuard, name: opt.name || "", color: opt.color };
}

function rotateAround(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

/* ---------------- 幾何產生器 ---------------- */
// 平面螺旋（局部座標 x,z）：a 為角度（度）
function spiral(c, R, a0, a1, y0, y1, stepDeg = 20, extra) {
  const pts = [];
  const nSeg = Math.max(1, Math.round(Math.abs(a1 - a0) / stepDeg));
  for (let k = 0; k <= nSeg; k++) {
    const t = k / nSeg;
    const a = (a0 + (a1 - a0) * t) * deg;
    const p = [c[0] + R * Math.cos(a), y0 + (y1 - y0) * t, c[1] + R * Math.sin(a)];
    pts.push(extra ? [...p, ...extra] : p);
  }
  return pts;
}

// 水滴形迴圈：底部曲率小（進場平順）、頂部曲率大（頂端速度低也撐得住），跟真實雲霄飛車一樣
function loopPts(bottom, r, fwd, lat, latShift, v2, rBot = r * 2) {
  const pts = [];
  for (let d = 15; d <= 345; d += 15) {
    const f = d * deg;
    const c = Math.cos(f / 2) ** 2;
    const rr = r + (rBot - r) * c;
    const p = add(add(add(bottom, mul(fwd, rr * Math.sin(f))), mul(UP, r * (1 - Math.cos(f)))), mul(lat, latShift * (d / 360)));
    pts.push([...p, v2, "c"]);
  }
  return pts;
}

/* ---------------- 地板：漏斗形，所有掉下來的球都會流回升降機底部的集球槽 ---------------- */
export const TROUGH = { y: 0.30, rIn: 0.28, rOut: 0.715, wallTop: 0.62, openA: 3.0, openB: 4.2 }; // openA/B：開口的螺旋角 θ 範圍
const OPEN_MID = (TROUGH.openA + TROUGH.openB) / 2;
const OPEN_WA = -OPEN_MID; // 開口中心的世界角度
// 地板：往中心的徑向坡 + 沿著圓周流向開口的環向坡（球會繞著升降機底座滾到開口、掉進集球槽）
export function floorHeight(x, z) {
  const r = Math.hypot(x, z);
  let d = Math.atan2(z, x) - OPEN_WA;
  d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  return TROUGH.y + 0.02 + 0.06 * Math.max(0, r - 0.73) + 0.065 * d * Math.min(r, 1.5);
}

/* ---------------- 主建構 ---------------- */
export async function createTower(RAPIER, opts = {}) {
  const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
  world.timestep = CFG.dt;
  world.numSolverIterations = 4;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const events = new RAPIER.EventQueue(true);

  const out = {
    RAPIER, world, fixed,
    tracks: [], seesaws: [], trays: [], wheels: [], funnels: [], plates: [],
    statics: [], // 其他靜態裝飾/碰撞物描述
    balls: [], checkpoints: [], counters: {}, time: 0,
    cage: null, liftAngle: 0,
    onPlateHit: null, onSeesawFlip: null,
  };

  /* --- 碰撞體輔助 --- */
  const railCount = { n: 0 };
  function capsule(a, b, r, fric = 0.22) {
    const d = sub(b, a); const l = len(d);
    if (l < 1e-5) return;
    const q = qFromUnitVectors(UP, mul(d, 1 / l));
    const c = mul(add(a, b), 0.5);
    world.createCollider(RAPIER.ColliderDesc.capsule(l / 2, r).setTranslation(c[0], c[1], c[2]).setRotation(Q(q)).setFriction(fric).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), fixed);
    railCount.n++;
  }
  function polylineColliders(pts, r, tol = 0.004) {
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length) {
        const cand = j + 1;
        if (dist(pts[i], pts[cand]) > 1.6) break;
        let ok = true;
        const ab = sub(pts[cand], pts[i]); const L2 = dot(ab, ab);
        for (let k = i + 1; k < cand; k++) {
          const t = Math.max(0, Math.min(1, dot(sub(pts[k], pts[i]), ab) / L2));
          if (dist(pts[k], add(pts[i], mul(ab, t))) > tol) { ok = false; break; }
        }
        if (!ok) break;
        j = cand;
      }
      capsule(pts[i], pts[j], r);
      i = j;
    }
  }
  function addTrack(ctrl, opt) {
    const g = buildTrackGeometry(ctrl, opt);
    const tol = opt.tol ?? 0.004;
    for (const rail of g.bottom) polylineColliders(rail, CFG.railR, tol);
    for (const run of g.guardRuns) { polylineColliders(run.l, CFG.railR, tol * 1.5); polylineColliders(run.r, CFG.railR, tol * 1.5); }
    for (const run of g.capRuns) polylineColliders(run, CFG.railR, tol);
    out.tracks.push(g);
    return g;
  }
  function trimesh(verts, idx, fric = 0.3, rest = 0.15) {
    return world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(fric).setRestitution(rest), fixed);
  }
  function box(center, half, q, o = {}) {
    const d = RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2]).setTranslation(center[0], center[1], center[2]).setRotation(Q(q)).setFriction(o.fric ?? 0.3).setRestitution(o.rest ?? 0.1);
    if (o.maxRest) d.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    if (o.events) d.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    return world.createCollider(d, fixed);
  }

  /* --- 漏斗 --- */
  function addFunnel(top, rTop = 0.45, rBot = 0.16, h = 0.45, pipe = 0.08) {
    const seg = 40, verts = [], idx = [];
    const rings = [[rTop, 0], [rBot, -h], [rBot, -h - pipe]];
    for (const [r, y] of rings) for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; verts.push(top[0] + r * Math.cos(a), top[1] + y, top[2] + r * Math.sin(a)); }
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < seg; k++) {
      const a = ri * seg + k, b = ri * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
    trimesh(verts, idx, 0.2, 0.2);
    const f = { top, rTop, rBot, h, pipe, verts, idx, kind: "funnel" };
    out.funnels.push(f);
    return f;
  }
  // 長方形集球斗：沿彈跳方向拉長，內壁不反彈，底下接直管讓球垂直落下
  function addHopper(top, dirX, L = 1.0, W = 0.8, o = 0.15, h = 0.42, pipe = 0.45) {
    const ax = norm([dirX[0], 0, dirX[2]]), az = cross(ax, UP);
    const P = (x, y, z) => add(add(add(top, mul(ax, x)), mul(UP, y)), mul(az, z));
    const rings = [[L / 2, W / 2, 0], [o, o, -h], [o, o, -h - pipe]];
    const verts = [], idx = [];
    for (const [hx, hz, y] of rings) for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) verts.push(...P(sx * hx, y, sz * hz));
    for (let ri = 0; ri < 2; ri++) for (let k = 0; k < 4; k++) {
      const a = ri * 4 + k, b = ri * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(0.5).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), fixed);
    const f = { top, verts, idx, kind: "hopper", h, pipe };
    out.funnels.push(f);
    return f;
  }

  /* --- 彈跳板 --- */
  function addPlate(center, towardDir, tiltDeg, note) {
    const d = norm([towardDir[0], 0, towardDir[2]]);
    const q = qAxisAngle(cross(UP, d), tiltDeg * deg);
    const half = [0.27, 0.025, 0.27];
    const c = box(center, half, q, { rest: 0.85, maxRest: true, fric: 0.25, events: true });
    const pl = { center, half, q, handle: c.handle, note, lastHit: -1 };
    out.plates.push(pl);
    return pl;
  }

  /* --- 動態零件：以世界對齊座標描述形狀，關節軸在兩個剛體座標系中一致 --- */
  function dynamicPart(pivot, shapes, density = {}) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pivot[0], pivot[1], pivot[2]).setCanSleep(false));
    for (const s of shapes) {
      let d;
      if (s.type === "box") d = RAPIER.ColliderDesc.cuboid(s.half[0], s.half[1], s.half[2]);
      else if (s.type === "cyl") d = RAPIER.ColliderDesc.cylinder(s.hh, s.r);
      d.setTranslation(s.pos[0], s.pos[1], s.pos[2]).setRotation(Q(s.q)).setMass(s.mass).setFriction(s.fric ?? 0.35).setRestitution(s.rest ?? 0.1);
      world.createCollider(d, body);
    }
    return body;
  }
  function revolute(body, pivot, axis, limits, damping) {
    const jd = RAPIER.JointData.revolute(V(pivot), { x: 0, y: 0, z: 0 }, V(axis));
    const j = world.createImpulseJoint(jd, fixed, body, true);
    j.setContactsEnabled(false);
    if (limits) j.setLimits(limits[0], limits[1]);
    if (damping) j.configureMotorVelocity(0, damping);
    return j;
  }
  const basisShape = (lx, ly, lz) => (type, local, extra) => {
    const pos = add(add(mul(lx, local[0]), mul(ly, local[1])), mul(lz, local[2]));
    const qb = qFromBasis(lx, ly, lz);
    return { type, pos, q: extra.qLocal ? qMul(qb, extra.qLocal) : qb, ...extra };
  };

  /* --- 分球器（蹺蹺板式翻板）：球落在高的那一側，壓下去後從那一側滾出，翻板停在另一側等下一顆 --- */
  function addSeesaw(pivot, dirIn) {
    const lz = norm(dirIn), lx = norm(cross(UP, lz)), ly = UP;
    const S = basisShape(lx, ly, lz);
    const shapes = [
      S("box", [0, 0.23, 0], { half: [0.62, 0.02, 0.16], mass: 0.22, role: "plate" }),
      S("box", [0, 0.305, 0], { half: [0.008, 0.055, 0.16], mass: 0.05, role: "ridge" }),
      S("box", [0, 0.40, 0.18], { half: [0.62, 0.17, 0.02], mass: 0.08, role: "wall" }),
      S("box", [0, 0.28, -0.175], { half: [0.62, 0.03, 0.015], mass: 0.02, role: "lip" }),
    ];
    const body = dynamicPart(pivot, shapes);
    const joint = revolute(body, pivot, lz, [-12 * deg, 12 * deg], 0.01);
    body.setAngvel(V(mul(lz, out.seesaws.length % 2 ? 0.3 : -0.3)), true);
    const ss = { body, joint, pivot, lx, lz, shapes, side: 0 };
    out.seesaws.push(ss);
    return {
      inEnd: add(add(pivot, mul(lz, -0.24)), mul(UP, 0.60)),
      inPrev: add(add(pivot, mul(lz, -0.58)), mul(UP, 0.62)),
      outA: [add(add(pivot, mul(lx, 0.70)), mul(UP, 0.21)), add(add(pivot, mul(lx, 1.05)), mul(UP, 0.18))],
      outB: [add(add(pivot, mul(lx, -0.70)), mul(UP, 0.21)), add(add(pivot, mul(lx, -1.05)), mul(UP, 0.18))],
    };
  }

  /* --- 翻斗（集球器）：配重讓斗子後傾存球，球累積到 4 顆，力矩超過配重就整斗翻倒、一起放出 --- */
  function addTray(pivot, front, capacityMass = 4.2) {
    const lx = norm(front), ly = UP, lz = norm(cross(lx, ly));
    const S = basisShape(lx, ly, lz);
    const shapes = [
      S("box", [0.55, 0.085, 0], { half: [0.5, 0.015, 0.17], mass: 0.15, role: "floor" }),
      S("box", [0.035, 0.205, 0], { half: [0.015, 0.12, 0.17], mass: 0.05, role: "wall" }),
      S("box", [0.55, 0.21, 0.182], { half: [0.5, 0.11, 0.012], mass: 0.05, role: "side" }),
      S("box", [0.55, 0.21, -0.182], { half: [0.5, 0.11, 0.012], mass: 0.05, role: "side" }),
      S("box", [-0.2, 0.0, 0], { half: [0.25, 0.02, 0.03], mass: 0.04, role: "arm" }),
      S("box", [-0.42, -0.02, 0], { half: [0.1, 0.1, 0.12], mass: capacityMass, role: "weight" }),
    ];
    const body = dynamicPart(pivot, shapes);
    const joint = revolute(body, pivot, lz, [-25 * deg, 8 * deg], 0.25);
    const tr = { body, joint, pivot, lx, lz, shapes, dumps: 0, tipped: false };
    out.trays.push(tr);
    const L = (x, y) => add(add(pivot, mul(lx, x)), mul(UP, y));
    return { feedEnd: L(0.97, 0.60), feedPrev: L(1.3, 0.62), out0: L(1.08, -0.30), out1: L(1.4, -0.36), tray: tr };
  }

  /* --- 水車（齒輪）：球掉進槽裡，重量讓輪子轉，帶動旁邊的齒輪組 --- */
  function addWheel(center, lx0) {
    const lx = norm(lx0), ly = UP, lz = norm(cross(lx, ly));
    const S = basisShape(lx, ly, lz);
    const toZ = qFromUnitVectors(UP, [0, 0, 1]); // 圓柱沿 Y → 轉到局部 Z（輪軸）
    const shapes = [
      S("cyl", [0, 0, 0], { hh: 0.2, r: 0.12, mass: 0.2, qLocal: toZ, role: "hub" }),
      S("cyl", [0, 0, 0.195], { hh: 0.012, r: 0.52, mass: 0.12, qLocal: toZ, role: "disc" }),
      S("cyl", [0, 0, -0.195], { hh: 0.012, r: 0.52, mass: 0.12, qLocal: toZ, role: "disc" }),
    ];
    for (let k = 0; k < 6; k++) {
      const a = k * 60 * deg + 15 * deg;
      shapes.push(S("box", [0.31 * Math.cos(a), 0.31 * Math.sin(a), 0], { half: [0.19, 0.015, 0.183], mass: 0.04, qLocal: qAxisAngle([0, 0, 1], a), role: "paddle" }));
    }
    const body = dynamicPart(center, shapes);
    const joint = revolute(body, center, lz, null, 0.06);
    const w = { body, joint, center, lx, lz, shapes, angle: 0 };
    out.wheels.push(w);
    const L = (x, y, z = 0) => add(add(add(center, mul(lx, x)), mul(UP, y)), mul(lz, z));
    return { feedEnd: L(0.62, 0.45), local: L };
  }

  /* ================= 佈局 ================= */
  const { liftR: R, liftY0: Y0, liftTop: YT, liftTurns } = CFG;
  const pitch = (YT - Y0) / liftTurns;
  const helixPt = (th, v2) => [R * Math.cos(th), 0.40 + (th / (2 * Math.PI)) * (YT - 0.40) / liftTurns, -R * Math.sin(th), v2];

  // 1) 升降機軌道 + 頂層環道 A → 分球器 S1
  const S1 = addSeesaw([0.5, 9.32, 2.3], [0, 0, -1]);
  {
    const pts = [];
    for (let th = -0.6; th < -0.01; th += 0.3) pts.push([R * Math.cos(th), 0.40 + 0.06 * th, -R * Math.sin(th), 1.2, "n"]);
    for (let th = 0; th <= liftTurns * 2 * Math.PI + 1e-6; th += 0.25) pts.push([...helixPt(th, 1.2), th < 0.6 ? "n" : ""]);
    pts.push([0.62, 10.62, -0.42], [0.95, 10.6, -0.83], [1.5, 10.57, -1.15]);
    const ph0 = -40, ph1 = -255;
    for (let ph = ph0; ph >= ph1; ph -= 15) {
      const t = (ph - ph0) / (ph1 - ph0);
      pts.push([2.95 * Math.cos(ph * deg), 10.53 + (10.06 - 10.53) * t, 2.95 * Math.sin(ph * deg)]);
    }
    pts.push([-0.2, 10.035, 3.05], [0.22, 10.01, 3.18], [0.47, 9.985, 3.08], S1.inPrev, S1.inEnd);
    addTrack(pts, { name: "lift", color: 0xff7a1a });
  }

  // 2) S1 → S2a / S2b
  const S2a = addSeesaw([2.2, 8.71, 0], [-1, 0, 0]);
  const S2b = addSeesaw([-2.2, 8.71, 0], [1, 0, 0]);
  // S1 的 lx = (-1,0,0)：outA 往 -x、outB 往 +x
  addTrack([...S1.outB, [1.6, 9.48, 2.3], [2.3, 9.45, 2.25], [2.85, 9.42, 1.9], [3.15, 9.39, 1.2], [3.15, 9.37, 0.5], [2.95, 9.355, 0.1], S2a.inPrev, S2a.inEnd], { name: "S1→S2a", color: 0xffffff });
  addTrack([...S1.outA, [-0.55, 9.495, 2.3], [-1.25, 9.47, 2.28], [-2.25, 9.44, 2.2], [-2.85, 9.415, 1.9], [-3.15, 9.39, 1.2], [-3.15, 9.37, 0.5], [-2.95, 9.355, 0.1], S2b.inPrev, S2b.inEnd], { name: "S1→S2b", color: 0xffffff });

  // 3) 四個象限（以 Q1 局部座標設計，鏡射到其他象限）
  const mir = (sx, sz) => (p) => [p[0] * sx, p[1], p[2] * sz, ...p.slice(3)];
  const E = [2.2, 8.92, 0.7];

  // S2a: lx = (0,0,1) → outA 往 +z (Q1)、outB 往 -z (Q4)
  // S2b: lx = (0,0,-1) → outA 往 -z (Q3)、outB 往 +z (Q2)

  // ---- Q1：大螺旋 → 水車齒輪 → 漏斗 → 小螺旋 ----
  {
    const m = mir(1, 1);
    const pts = [...S2a.outA, [1.75, 8.83, 1.5], [1.45, 8.80, 1.85], ...spiral([2.2, 2.2], 0.85, 190, -710, 8.76, 5.98), [3.04, 5.95, 2.1], [3.04, 5.93, 1.85]];
    addTrack(pts.map((p, i) => (i < 2 ? p : m(p))), { name: "Q1 螺旋", v2: 4, color: 0x00f0ff });
    const wheel = addWheel(m([3.04, 5.48, 1.23]), [0, 0, 1]);
    addFunnel(m([3.04, 4.53, 1.38]));
    const pts2 = [[3.12, 3.82, 1.38], [2.75, 3.78, 1.45], [2.3, 3.74, 1.58], ...spiral([2.2, 2.2], 0.6, -120, -1200, 3.70, 1.60), [1.6, 1.55, 1.85], [1.35, 1.52, 2.0]];
    addTrack(pts2.map(m), { name: "Q1 小螺旋", v2: 3, color: 0x00f0ff });
    out.checkpoints.push({ name: "Q1 進入", p: S2a.outA[1] }, { name: "Q1 水車", p: wheel.feedEnd }, { name: "Q1 底部", p: m([1.6, 1.55, 1.85]) });
  }

  // ---- Q2：螺旋 → 翻斗（存 4 顆一起放）→ 長螺旋 ----
  {
    const m = mir(-1, 1);
    const pts = [[1.75, 8.83, 1.5], [1.45, 8.80, 1.85], ...spiral([2.2, 2.2], 0.85, 190, -530, 8.76, 6.92)];
    const tr = addTray(m([1.36, 6.28, 3.15]), m([0, 0, -1]));
    addTrack([...S2b.outB, ...pts.map(m), tr.feedEnd], { name: "Q2 螺旋", v2: 4, color: 0xff2bd6 });
    const pts2 = [[1.36, 5.94, 1.72], [1.42, 5.89, 1.45], [1.65, 5.84, 1.33], [1.95, 5.81, 1.33], ...spiral([2.2, 2.2], 0.85, -90, 1440, 5.77, 1.68), [3.05, 1.64, 2.5], [3.0, 1.62, 2.75]];
    addTrack([tr.out0, tr.out1, ...pts2.slice(1).map(m)], { name: "Q2 長螺旋", v2: 4, color: 0xff2bd6 });
    out.checkpoints.push({ name: "Q2 進入", p: S2b.outB[1] }, { name: "Q2 翻斗出口", p: m([1.65, 5.84, 1.33]) }, { name: "Q2 底部", p: m([3.05, 1.64, 2.5]) });
  }

  // ---- Q3：漏斗 + 彈跳板連環（每次彈跳發出一個音） ----
  {
    const m = mir(-1, -1);
    const pts = [[1.85, 8.84, 1.65], [1.63, 8.82, 1.98]];
    addTrack([...S2b.outA, ...pts.map(m)], { name: "Q3 入口", color: 0xfcee0a });
    const A = [1.55, 2.15], B = [2.85, 2.15];
    const tops = [8.62, 7.17, 5.72, 4.27, 2.82];
    const PLATE_TILT = 21, PLATE_DROP = 1.25;
    const notes = [0, 2, 4, 7];
    tops.forEach((t, i) => {
      const at = i % 2 === 0 ? A : B;
      const prevAt = i === 0 ? null : (i % 2 === 0 ? B : A);
      const dirX = i === 0 ? [1, 0, 0] : m([at[0] - prevAt[0], 0, 0]);
      addHopper(m([at[0], t, at[1]]), dirX, i === 0 ? 0.8 : 1.0, 0.8, 0.15, 0.42, i < 4 ? 0.45 : 0.1);
      if (i < 4) {
        const to = i % 2 === 0 ? B : A;
        const plateTop = t - PLATE_DROP;
        addPlate(m([at[0], plateTop - 0.025, at[1]]), m([to[0] - at[0], 0, to[1] - at[1]]), PLATE_TILT, notes[i]);
      }
      out.checkpoints.push({ name: `Q3 漏斗${i}`, p: m([at[0], t - 0.3, at[1]]) });
    });
  }

  // ---- Q4：雲霄飛車（大落差 → 垂直迴圈 → 駝峰 → 長螺旋） ----
  {
    const m = mir(1, -1);
    const v2loop = 12;
    const loopBottom = [1.2, 6.35, 2.42];
    const pts = [[2.6, 8.84, 1.35], [3.1, 8.82, 1.42], [3.45, 8.8, 1.7], [3.45, 8.77, 2.15], [3.15, 8.74, 2.4], [2.85, 8.62, 2.42],
      [2.5, 8.12, 2.42], [2.15, 7.3, 2.42, 5], [1.85, 6.65, 2.42, 6], [1.6, 6.39, 2.42, 8, "c"], [1.4, 6.355, 2.42, v2loop, "c"], [...loopBottom, v2loop, "c"],
      ...loopPts(loopBottom, 0.25, [-1, 0, 0], [0, 0, 1], 0.42, v2loop, 0.45),
      [1.2, 6.35, 2.84, v2loop, "c"], [1.0, 6.32, 2.84, 8, "c"], [0.8, 6.28, 3.0, 5], [0.75, 6.23, 3.35], [1.0, 6.18, 3.65], [1.4, 6.12, 3.78], [1.8, 6.07, 3.78], [2.1, 6.04, 3.72], [2.45, 6.0, 3.55], [2.85, 5.97, 3.25], [3.25, 5.93, 2.8], [3.45, 5.9, 2.25],
      ...spiral([2.8, 1.6], 0.7, 0, -1980, 5.85, 1.72), [2.1, 1.68, 1.95], [2.1, 1.66, 2.2]];
    addTrack([...S2a.outB, ...pts.map(m)], { name: "Q4 雲霄飛車", v2: 4, maxBank: 0.9, tol: 0.0015, color: 0x7cff6b });
    out.checkpoints.push({ name: "Q4 進入", p: S2a.outB[1] }, { name: "Q4 迴圈頂", p: m([1.2, 6.35 + 0.48, 2.42 + 0.21]) }, { name: "Q4 底部", p: m([2.1, 1.68, 1.95]) });
  }

  out.checkpoints.push({ name: "升降機頂", p: [0.95, 10.6, -0.83] }, { name: "S1→右", p: S1.outB[1] }, { name: "S1→左", p: S1.outA[1] });

  /* --- 地板（漏斗形）、外圍擋牆、升降機外殼 --- */
  {
    const rings = 58, seg = 128, r0 = 0.73, r1 = CFG.floorR;
    const verts = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const r = r0 + (r1 - r0) * Math.pow(i / rings, 1.15);
      for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; const x = r * Math.cos(a), z = r * Math.sin(a); verts.push(x, floorHeight(x, z), z); }
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
    trimesh(verts, idx, 0.4, 0.1);
    out.floor = { verts, idx, rings, seg };
    // 外圍擋牆
    const wv = [], wi = [];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; const x = r1 * Math.cos(a), z = r1 * Math.sin(a); const h = floorHeight(x, z); wv.push(x, h - 0.05, z, x, h + 1.1, z); }
    for (let k = 0; k < seg; k++) { const a = 2 * k, b = 2 * ((k + 1) % seg); wi.push(a, b, a + 1, b, b + 1, a + 1); }
    trimesh(wv, wi, 0.3, 0.2);
    // 升降機底部集球槽：槽底、外牆（留一個開口讓地板的球流進來）、中央柱
    const T = TROUGH, hs = 72;
    const tv = [], ti = [];
    for (let k = 0; k <= hs; k++) { const a = (k / hs) * Math.PI * 2; for (const r of [T.rIn - 0.02, 0.76]) tv.push(r * Math.cos(a), T.y, r * Math.sin(a)); }
    for (let k = 0; k < hs; k++) { const a = 2 * k, b = 2 * (k + 1); ti.push(a, b, a + 1, b, b + 1, a + 1); }
    trimesh(tv, ti, 0.3, 0.1);
    const tw = [], twi = [];
    const inOpen = (wa) => { const th = ((-wa % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return th > T.openA && th < T.openB; };
    for (let k = 0; k <= hs; k++) { const a = (k / hs) * Math.PI * 2; tw.push(T.rOut * Math.cos(a), T.y - 0.05, T.rOut * Math.sin(a), T.rOut * Math.cos(a), T.wallTop, T.rOut * Math.sin(a)); }
    for (let k = 0; k < hs; k++) { if (inOpen(((k + 0.5) / hs) * Math.PI * 2)) continue; const a = 2 * k, b = 2 * (k + 1); twi.push(a, b, a + 1, b, b + 1, a + 1); }
    trimesh(tw, twi, 0.3, 0.1);
    world.createCollider(RAPIER.ColliderDesc.cylinder(5.6, T.rIn).setTranslation(0, 5.6, 0).setFriction(0.2), fixed);
    out.trough = { ...T, inOpen };
  }

  /* --- 升降機推桿籠（運動學剛體，馬達驅動） --- */
  {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
    const y0 = 0.33, y1 = 10.85, bars = 6;
    for (let k = 0; k < bars; k++) {
      const a = (k / bars) * Math.PI * 2;
      const q = qAxisAngle(UP, a);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.145, (y1 - y0) / 2, 0.012).setTranslation(R * Math.cos(a), (y0 + y1) / 2, -R * Math.sin(a)).setRotation(Q(q)).setFriction(0.15), body);
    }
    out.cage = { body, y0, y1, bars };
  }

  /* --- 球 --- */
  const palette = [0x00f0ff, 0xff2bd6, 0xfcee0a, 0x7cff6b, 0xff7a1a, 0xa77bff];
  out.addBall = (pos, color) => {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos[0], pos[1], pos[2]).setLinearDamping(CFG.ballDamping).setAngularDamping(0.05).setCcdEnabled(false).setCanSleep(false));
    const vol = (4 / 3) * Math.PI * CFG.ballR ** 3;
    world.createCollider(RAPIER.ColliderDesc.ball(CFG.ballR).setDensity(1 / vol).setFriction(0.3).setRestitution(0.35), b);
    const ball = { body: b, color: color ?? palette[out.balls.length % palette.length], id: out.balls.length, cp: {}, lastMove: 0, lastPos: pos.slice() };
    out.balls.push(ball);
    return ball;
  };
  out.randomFloorPos = (rnd = Math.random) => {
    for (let tries = 0; tries < 200; tries++) {
      const r = 1.3 + rnd() * 3.5, a = rnd() * Math.PI * 2;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const p = [x, floorHeight(x, z) + 0.16, z];
      if (out.balls.every((b) => { const t = b.body.translation(); return Math.hypot(t.x - p[0], t.y - p[1], t.z - p[2]) > 0.3; })) return p;
    }
    return [3, 2, 3];
  };
  const nBalls = opts.balls ?? 40;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < nBalls; i++) out.addBall(out.randomFloorPos(rnd));

  out.labels = [
    { text: "螺旋升降機", p: [0, 11.75, 0] },
    { text: "分球器 1→2", p: add(out.seesaws[0].pivot, [0, 1.05, 0]) },
    { text: "分球器 2→4", p: add(out.seesaws[1].pivot, [0, 1.0, 0]) },
    { text: "分球器 2→4", p: add(out.seesaws[2].pivot, [0, 1.0, 0]) },
    { text: "水車齒輪", p: add(out.wheels[0].center, [0, 0.95, 0]) },
    { text: "翻斗：存滿 4 顆一起放", p: add(out.trays[0].pivot, [0, 1.0, 0]) },
    { text: "彈跳連環", p: add(out.plates[1].center, [0, 1.25, 0]) },
    { text: "雲霄飛車迴圈", p: [1.2, 7.15, -2.63] },
  ];
  const plateByHandle = new Map(out.plates.map((p, i) => [p.handle, i]));
  out.colliderCount = railCount.n;

  /* --- 單步模擬 --- */
  out.step = () => {
    const dt = CFG.dt;
    out.time += dt;
    out.liftAngle += CFG.liftOmega * dt;
    out.cage.body.setNextKinematicRotation(Q(qAxisAngle(UP, out.liftAngle)));
    world.step(events);
    events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const i = plateByHandle.has(h1) ? plateByHandle.get(h1) : plateByHandle.get(h2);
      if (i === undefined) return;
      const pl = out.plates[i];
      if (out.time - pl.lastHit < 0.08) return;
      pl.lastHit = out.time;
      out.counters["彈跳"] = (out.counters["彈跳"] || 0) + 1;
      out.onPlateHit && out.onPlateHit(i, pl);
    });
    // 翻斗狀態、分球器狀態
    for (const tr of out.trays) {
      const ang = jointAngle(tr.body, tr.lz);
      tr.angle = ang;
      if (!tr.tipped && ang < -15 * deg) { tr.tipped = true; tr.dumps++; out.counters["翻斗"] = (out.counters["翻斗"] || 0) + 1; }
      if (tr.tipped && ang > 3 * deg) tr.tipped = false;
    }
    for (const ss of out.seesaws) {
      const ang = jointAngle(ss.body, ss.lz);
      const side = ang > 4 * deg ? 1 : ang < -4 * deg ? -1 : 0;
      if (side && side !== ss.side) { if (ss.side) out.onSeesawFlip && out.onSeesawFlip(ss); ss.side = side; }
      ss.angle = ang;
    }
    for (const w of out.wheels) w.angle = jointAngle(w.body, w.lz, true, w);
  };

  function jointAngle(body, axis, unwrap, store) {
    const r = body.rotation();
    const q = [r.x, r.y, r.z, r.w];
    let a = 2 * Math.atan2(dot([q[0], q[1], q[2]], axis), q[3]);
    if (unwrap && store) {
      const prev = store._raw ?? a; let d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      store._raw = a; store._acc = (store._acc ?? a) + d; return store._acc;
    }
    if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /* --- 球的檢查點 / 失控回收 --- */
  out.track = () => {
    for (const b of out.balls) {
      const t = b.body.translation();
      const p = [t.x, t.y, t.z];
      for (const cp of out.checkpoints) {
        if (dist(p, cp.p) < 0.3) {
          if (!b.cp[cp.name] || out.time - b.cp[cp.name] > 3) out.counters[cp.name] = (out.counters[cp.name] || 0) + 1;
          b.cp[cp.name] = out.time;
        }
      }
      if (dist(p, b.lastPos) > 0.25) { b.lastPos = p; b.lastMove = out.time; }
      if (t.y < -1 || Math.hypot(t.x, t.z) > CFG.floorR + 0.6) {
        if (globalThis.__logLost) console.log("lost ball", b.id, "at", t.x.toFixed(2), t.y.toFixed(2), t.z.toFixed(2), "t", out.time.toFixed(1));
        out.counters["回收"] = (out.counters["回收"] || 0) + 1;
        const np = out.randomFloorPos();
        b.body.setTranslation(V(np), true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  };

  return out;
}
