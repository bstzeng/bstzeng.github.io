// 塞車模擬器：路網幾何 + 微觀車流模擬（IDM 跟車 + MOBIL 變換車道）
// 座標單位：公尺；x 向東、y 向南（與畫面相同）

export const LW = 3.5;           // 車道寬
export const KMH = 1 / 3.6;
const LC_DUR = 2.6;              // 變換車道動畫秒數

/* ================= 幾何 ================= */
export class Path {
  constructor(pts) {
    this.x = []; this.y = []; this.s = [];
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d < 1e-6) continue;
        s += d;
      }
      this.x.push(pts[i][0]); this.y.push(pts[i][1]); this.s.push(s);
    }
    this.len = s;
    this.n = this.s.length;
  }
  seg(s) {
    const S = this.s;
    if (s <= 0) return 0;
    if (s >= this.len) return this.n - 2;
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  /** 回傳 s 處、往右偏 lat 公尺的位置與方向 */
  at(s, lat = 0) {
    const i = this.seg(s);
    const x0 = this.x[i], y0 = this.y[i], x1 = this.x[i + 1], y1 = this.y[i + 1];
    const L = this.s[i + 1] - this.s[i];
    const t = (s - this.s[i]) / L;
    const h = Math.atan2(y1 - y0, x1 - x0);
    const sn = Math.sin(h), cs = Math.cos(h);
    return { x: x0 + (x1 - x0) * t - sn * lat, y: y0 + (y1 - y0) * t + cs * lat, h };
  }
}

/** 海龜筆：畫出道路中線 / 左緣 */
export class Pen {
  constructor(x, y, h = 0) { this.x = x; this.y = y; this.h = h; this.pts = [[x, y]]; }
  line(L) {
    const n = Math.max(1, Math.ceil(L / 5));
    const cs = Math.cos(this.h), sn = Math.sin(this.h), x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) this.pts.push([x0 + cs * L * i / n, y0 + sn * L * i / n]);
    this.x = x0 + cs * L; this.y = y0 + sn * L;
    return this;
  }
  /** deg > 0 右轉（畫面上順時針） */
  arc(R, deg) {
    const a = deg * Math.PI / 180, sg = Math.sign(a) || 1;
    const n = Math.max(3, Math.ceil(Math.abs(a) * R / 3));
    const rn = (h) => [-Math.sin(h), Math.cos(h)];
    const [nx, ny] = rn(this.h);
    const cx = this.x + sg * R * nx, cy = this.y + sg * R * ny;
    const h0 = this.h;
    for (let i = 1; i <= n; i++) {
      const hh = h0 + a * i / n;
      const [mx, my] = rn(hh);
      this.pts.push([cx - sg * R * mx, cy - sg * R * my]);
    }
    this.h = h0 + a;
    const last = this.pts[this.pts.length - 1];
    this.x = last[0]; this.y = last[1];
    return this;
  }
  bezierTo(x, y, h, k1 = 0.4, k2 = 0.4) {
    const d = Math.hypot(x - this.x, y - this.y);
    const c1x = this.x + Math.cos(this.h) * d * k1, c1y = this.y + Math.sin(this.h) * d * k1;
    const c2x = x - Math.cos(h) * d * k2, c2y = y - Math.sin(h) * d * k2;
    const n = Math.max(4, Math.ceil(d / 3));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ]);
    }
    this.x = x; this.y = y; this.h = h;
    return this;
  }
  path() { return new Path(this.pts); }
}

/* ================= 號誌 ================= */
export class Signal {
  /** phases: [{g: ['A','B'], dur: 秒}]；每個時相後接黃燈與全紅 */
  constructor(phases, { yellow = 3, allRed = 2, offset = 0 } = {}) {
    this.phases = phases; this.Y = yellow; this.AR = allRed; this.offset = offset;
    this.recalc();
  }
  recalc() { this.cycle = this.phases.reduce((a, p) => a + p.dur + this.Y + this.AR, 0); }
  state(group, t) {
    let tp = ((t + this.offset) % this.cycle + this.cycle) % this.cycle;
    for (const p of this.phases) {
      const L = p.dur + this.Y + this.AR;
      if (tp < L) {
        if (!p.g.includes(group)) return "R";
        if (tp < p.dur) return "G";
        if (tp < p.dur + this.Y) return "Y";
        return "R";
      }
      tp -= L;
    }
    return "R";
  }
}

/* ================= 道路 ================= */
export class Road {
  constructor(id, path, lanes, o = {}) {
    this.id = id; this.path = path; this.len = path.len; this.lanes = lanes;
    this.off0 = o.center ? 0 : LW / 2;          // 車道 0 中心距路徑的偏移
    this.segs = Array.from({ length: lanes }, () => [[0, this.len]]);
    this.outs = []; this.blocks = []; this.zones = []; this.noLC = [];
    this.vmax = (o.vmax ?? 100) * KMH;
    this.kind = o.kind || "freeway";
    this.name = o.name || "";
    this.laneSignal = null;   // [{sig, group}] 每車道
    this.yieldEnd = !!o.yieldEnd;
    this.gate = null;         // {rate 輛/時, next}
    this.src = null;          // {flow 輛/時, name}
    this.split = {};          // 中途出口：to.id -> 機率
    this.endW = {};           // 道路終點：to.id -> 權重
    this.truckBan = new Set();
    this.dropAware = o.dropAware ?? 300;
    this.draw = o.draw !== false;
    this.bridge = !!o.bridge;
    this.edgeColor = o.edgeColor;
    this.buckets = [];
  }
  lat(L) { return this.off0 + L * LW; }
  aux(L, s0, s1) {
    while (this.lanes <= L) { this.segs.push([]); this.lanes++; }
    this.segs[L].push([s0, s1]);
    this.segs[L].sort((a, b) => a[0] - b[0]);
    return L;
  }
  setLane(L, s0, s1) { while (this.lanes <= L) { this.segs.push([]); this.lanes++; } this.segs[L] = [[s0, s1]]; }
  laneSeg(L, s) {
    const sg = this.segs[L];
    if (!sg) return null;
    for (const g of sg) if (s >= g[0] - 0.01 && s <= g[1] + 0.01) return g;
    return null;
  }
  nextSeg(L, s) {
    const sg = this.segs[L];
    if (!sg) return null;
    for (const g of sg) if (g[1] > s) return g;
    return null;
  }
  zoneAt(s) {
    let vm = this.vmax, tm = 1, grade = 0, tv = Infinity, cap = Infinity;
    for (const z of this.zones) if (s >= z.s0 && s <= z.s1 && z.on !== false) {
      if (z.vmax) vm = Math.min(vm, z.vmax * KMH);
      if (z.tmul) tm = Math.max(tm, z.tmul);
      if (z.grade) grade = z.grade;
      if (z.truckVmax) tv = Math.min(tv, z.truckVmax * KMH);
      if (z.cap) cap = Math.min(cap, z.cap * KMH);
    }
    return { vm, tm, grade, tv, cap };
  }
  noLCAt(s) { for (const z of this.noLC) if (s >= z[0] && s <= z[1]) return true; return false; }
}

/* ================= 路網 ================= */
export class Net {
  constructor() { this.roads = []; this.map = {}; this.signals = []; this.deco = []; this.labels = []; }
  road(id, path, lanes, o) {
    const r = new Road(id, path, lanes, o);
    this.roads.push(r); this.map[id] = r;
    return r;
  }
  link(a, la, b, lb, at = a.len, toS = 0) {
    a.outs.push({ from: a, lane: la, at, to: b, toLane: lb, toS });
  }
  signal(phases, o) { const s = new Signal(phases, o); this.signals.push(s); return s; }
  finalize() {
    const groups = {};
    for (const r of this.roads) {
      r.outsByLane = Array.from({ length: r.lanes }, () => []);
      for (const o of r.outs) r.outsByLane[o.lane].push(o);
      for (const a of r.outsByLane) a.sort((p, q) => p.at - q.at);
      r.buckets = Array.from({ length: r.lanes }, () => []);
      r.targets = [...new Set(r.outs.map((o) => o.to))];
      r.midIn = Array.from({ length: r.lanes }, () => []);
      r.midTargets = r.targets
        .map((t) => ({ to: t, at: Math.max(...r.outs.filter((o) => o.to === t).map((o) => o.at)) }))
        .filter((c) => c.at < r.len - 0.5)
        .sort((p, q) => p.at - q.at);
      r.endTargets = r.targets.filter((t) => r.outs.some((o) => o.to === t && o.at >= r.len - 0.5));
      for (const o of r.outs) {
        const k = `${o.to.id}|${o.toLane}|${Math.round(o.toS)}`;
        (groups[k] = groups[k] || []).push(o);
      }
    }
    for (const g of Object.values(groups)) for (const o of g) o.sibs = g.filter((x) => x !== o);
    for (const r of this.roads) for (const o of r.outs) {
      if (o.toS > 1 && o.to.laneSeg(o.toLane, o.toS - 2)) { o.midMerge = true; o.to.midIn[o.toLane].push(o); }
    }
  }
}

/* ================= 車種 ================= */
export const TYPES = {
  car:   { len: 4.6, wid: 1.8, a: 1.5, b: 2.2, T: 1.3, s0: 2.0, vcap: 999, kind: "car" },
  truck: { len: 12,  wid: 2.5, a: 0.75, b: 1.6, T: 1.7, s0: 3.0, vcap: 88, kind: "truck" },
  bus:   { len: 11.5, wid: 2.5, a: 0.9, b: 1.7, T: 1.6, s0: 3.0, vcap: 88, kind: "bus" },
  ems:   { len: 6.0, wid: 2.1, a: 2.6, b: 3.0, T: 0.8, s0: 2.0, vcap: 135, kind: "car" },
};

/* ================= 工具 ================= */
function firstAfter(arr, s, skip) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s <= s) lo = m + 1; else hi = m; }
  for (let i = lo; i < arr.length; i++) if (arr[i] !== skip) return arr[i];
  return null;
}
function lastAtOrBefore(arr, s, skip) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s <= s) lo = m + 1; else hi = m; }
  for (let i = lo - 1; i >= 0; i--) if (arr[i] !== skip) return arr[i];
  return null;
}
function insSort(a) {
  for (let i = 1; i < a.length; i++) {
    const x = a[i]; let j = i - 1;
    while (j >= 0 && a[j].s > x.s) { a[j + 1] = a[j]; j--; }
    a[j + 1] = x;
  }
}
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }

/* ================= 模擬 ================= */
export class Sim {
  constructor(net, o = {}) {
    this.net = net;
    this.t = 0;
    this.vs = [];
    this.nid = 1;
    this.truckPct = o.truckPct ?? 0.1;
    this.busPct = o.busPct ?? 0;
    this.noise = o.noise ?? 0.15;
    this.courtesy = o.courtesy ?? 0.5;
    this.mainIds = o.main || [];
    this.ems = [];
    this.emsYield = true;
    this.onStep = o.onStep || null;
    this.st = {
      emsLog: [],
      exited: 0, missed: 0, collisions: 0, ttSum: 0, delaySum: 0,
      bySink: {}, bySrc: {}, exitTimes: [], series: [], heat: [], lastSample: -999, lastHeat: -999,
    };
    for (const r of net.roads) if (r.src) {
      r.src.queue = 0; r.src.entered = 0; r.src.nextT = 0; r.src.enterTimes = [];
    }
    this.buildMainMap();
  }

  buildMainMap() {
    let off = 0;
    this.mainOff = {};
    for (const id of this.mainIds) { const r = this.net.map[id]; this.mainOff[id] = off; off += r.len; }
    this.mainLen = off;
  }

  /* ---------- 路線 ---------- */
  route(road, s, v) {
    if (road.routeFn) { const r = road.routeFn(v, s); if (r !== undefined) return r; }
    for (const c of road.midTargets) {
      if (c.at < s + 60) continue;
      const p = road.split[c.to.id] ?? 0;
      if (Math.random() < p) return c.to;
    }
    const ends = road.endTargets;
    if (!ends.length) return null;
    if (ends.length === 1) return ends[0];
    let tot = 0;
    for (const t of ends) tot += road.endW[t.id] ?? 1;
    let r = Math.random() * tot;
    for (const t of ends) { r -= road.endW[t.id] ?? 1; if (r <= 0) return t; }
    return ends[ends.length - 1];
  }

  /** 每條車道能不能到達下一段路；deadline = 最晚必須在幾公尺內換好 */
  desired(v) {
    const road = v.road, n = road.lanes;
    const ok = new Array(n).fill(false);
    let deadline = Infinity;
    if (v.next) {
      for (const o of road.outs) if (o.to === v.next && o.at >= v.s - 0.5) {
        const g = road.laneSeg(o.lane, o.at - 0.5);
        if (!g) continue;
        ok[o.lane] = true;
        deadline = Math.min(deadline, o.at - v.s);
      }
    } else {
      for (let L = 0; L < n; L++) if (road.laneSeg(L, road.len - 0.5)) ok[L] = true;
      deadline = road.len - v.s;
    }
    // 車道中途結束（縮減、加速車道）→ 不能用
    for (let L = 0; L < n; L++) if (ok[L]) {
      const g = road.laneSeg(L, v.s) || road.nextSeg(L, v.s);
      if (!g) { ok[L] = false; continue; }
      const need = v.next ? Math.min(...road.outs.filter((o) => o.to === v.next && o.lane === L).map((o) => o.at)) : road.len;
      if (g[1] < need - 1) {
        ok[L] = false;
      } else if (g[1] < road.len - 0.5 && !road.outs.some((o) => o.lane === L && Math.abs(o.at - g[1]) < 1)) {
        // 車道結束且沒有出口
        if (g[1] - v.s < road.dropAware) ok[L] = false;
      }
    }
    // 公車靠站（站牌前沒有被擋住才靠過去）
    const stop = v.stops && v.stops[0];
    if (stop && stop.road === road && stop.s > v.s && stop.s - v.s < 350) {
      const clear = !road.blocks.some((b) => b.on && b.lane === stop.lane && b.s1 > v.s && b.s0 < stop.s);
      if (clear) { ok.fill(false); ok[stop.lane] = true; deadline = Math.min(deadline, stop.s - v.s); }
    }
    // 前方封閉（事故、施工）
    for (const b of road.blocks) if (b.on && b.s1 > v.s && b.s0 - v.s < (b.warn ?? 600) && ok[b.lane]) {
      ok[b.lane] = false;
      deadline = Math.min(deadline, b.s0 - v.s);
    }
    // 大車禁行
    if (v.p.kind !== "car") for (const L of road.truckBan) ok[L] = false;
    // 出口標示不清：太晚才知道要下交流道
    if (v.next && road.signDist && deadline > road.signDist && road.midTargets.some((c) => c.to === v.next)) {
      for (let L = 0; L < n; L++) ok[L] = !!(road.laneSeg(L, v.s) && road.laneSeg(L, Math.min(road.len - 0.5, v.s + 300)));
      deadline = Infinity;
    }
    // 救護車：讓出它所在的車道
    if (this.ems.length && v.type !== "ems") {
      for (const e of this.ems) {
        if (e.road !== road) continue;
        const d = v.s - e.s;
        if (d > 0 && d < (this.emsYield ? 220 : 0)) {
          if (ok.filter(Boolean).length > 1 || !ok[e.lane]) { ok[e.lane] = false; if (e.lcFrom >= 0) ok[e.lcFrom] = false; }
          if (v.lane === e.lane) deadline = Math.min(deadline, Math.max(30, d));
        }
      }
    }
    if (!ok.some(Boolean)) ok.fill(true);
    const curOk = ok[v.lane];
    if (!curOk) {
      const g = road.laneSeg(v.lane, v.s);
      if (g && g[1] < road.len - 0.5) deadline = Math.min(deadline, g[1] - v.s);
    }
    return { ok, deadline };
  }

  /* ---------- 前方阻礙 ---------- */
  /**
   * 回傳 {g: 與前方阻礙的距離, vl: 阻礙速度}
   * base: 從自己車頭到 sFront 的距離
   */
  scan(v, road, lane, sFront, base, maxD, depth, next) {
    let g = Infinity, vl = 0;
    const bucket = road.buckets[lane];
    if (!bucket) return { g, vl };
    const seg = road.laneSeg(lane, sFront) || road.nextSeg(lane, sFront);
    const segEnd = seg ? seg[1] : sFront;

    // 這條車道要從哪裡離開
    let tr = null;
    const outs = road.outsByLane[lane];
    for (const o of outs) if (o.at >= sFront - 0.01 && o.at <= segEnd + 0.5 && (!next || o.to === next)) { tr = o; break; }
    if (!tr) for (const o of outs) if (Math.abs(o.at - segEnd) < 0.6) { tr = o; break; }
    const limit = tr ? tr.at : segEnd;

    // 前車
    const u = firstAfter(bucket, sFront, v);
    if (u && u.s - u.len < limit + 0.01) { g = base + (u.s - u.len) - sFront; vl = u.v; }
    // 正要從旁邊匯入這條車道的車
    const mi = road.midIn && road.midIn[lane];
    if (mi && mi.length) for (const o of mi) {
      if (o.toS < sFront - 1 || o.toS > limit) continue;
      const w = lastAtOrBefore(o.from.buckets[o.lane], o.at + 0.01, v);
      if (!w || !w.committed || w.next !== road) continue;
      const proj = o.toS - (o.at - w.s);
      if (proj < sFront - 0.5 && o.toS - sFront > 0) {
        // 已經和自己並排：在匯入點前停住
        const d = base + o.toS - sFront - 1;
        if (d < g) { g = Math.max(0, d); vl = 0; }
      } else if (proj >= sFront - 0.5) {
        const d = base + proj - w.len - sFront;
        if (d < g) { g = d; vl = w.v; }
      }
    }

    // 封閉區
    for (const b of road.blocks) if (b.on && b.lane === lane && b.s1 > sFront && b.s0 < limit + 0.01) {
      const d = base + b.s0 - sFront;
      if (d < g) { g = d; vl = b.v || 0; }
    }

    const dEnd = base + limit - sFront;
    const atRoadEnd = limit >= road.len - 0.5;

    if (!tr && !(atRoadEnd && road.endTargets.length === 0)) {
      // 車道結束、沒有路可走
      if (dEnd < g) { g = dEnd; vl = 0; }
      return { g, vl };
    }
    if (dEnd > maxD) return { g, vl };

    // 道路終點的號誌、閘門、讓路
    if (atRoadEnd && depth <= 1) {
      let wall = false;
      if (road.laneSignal && road.laneSignal[lane]) {
        const ls = road.laneSignal[lane];
        const st = ls.sig.state(ls.group, this.t);
        if (st === "R") wall = dEnd > -0.5 && !(depth === 0 && v.passing === road);
        else if (st === "Y") wall = depth === 0 ? (v.passing !== road && dEnd > v.v * v.v / (2 * 3.2) + 1) : true;
        if (!wall && depth === 0 && dEnd < 3) v.passing = road;
      }
      if (road.gate && this.t < road.gate.next) wall = true;
      // 路口淨空：橫向車道上還有車，或路口另一邊沒有空間
      if (tr && tr.to.box && depth === 0 && !wall && v.passing !== road && dEnd > Math.min(4, v.v * v.v / 8)) {
        for (const c of tr.to.conflicts) if (c.buckets.some((b) => b.length)) { wall = true; break; }
        if (!wall && road.keepClear) {
          const o2 = tr.to.outsByLane[tr.toLane][0];
          if (o2) {
            const bk = o2.to.buckets[o2.toLane];
            const u2 = bk && bk[0];
            if (u2 && u2.s - u2.len - o2.toS < v.len + 3 && u2.v < 4) wall = true;
          }
          // 路口裡同車道已經有車在等
          const inBox = tr.to.buckets[tr.toLane];
          if (inBox && inBox.some((w) => w.v < 2)) wall = true;
        }
        if (!wall && dEnd < 3) v.passing = road;
      }
      if (tr && road.yieldEnd && depth === 0 && !v.committed) {
        if (this.yieldOk(v, tr, dEnd)) { if (dEnd < 6 + v.v * 1.2) v.committed = true; }
        else wall = true;
      }
      if (wall && dEnd < g) { g = dEnd; vl = 0; }
    }

    if (!tr) return { g, vl };

    // 從車道中間匯入（例如匯入路肩車道）：先讓已經在車道上的車
    if (tr.midMerge && depth === 0 && !v.committed) {
      if (this.midMergeOk(v, tr, dEnd)) { if (dEnd < 6 + v.v * 1.2) v.committed = true; }
      else if (dEnd < g) { g = dEnd; vl = 0; }
    }

    // 匯流：別條路正要進入同一車道的車
    if (tr.sibs && tr.sibs.length && depth <= 1) {
      for (const sb of tr.sibs) {
        const bk = sb.from.buckets[sb.lane];
        if (!bk) continue;
        const w = lastAtOrBefore(bk, sb.at + 0.01, v);
        if (!w || w.next !== sb.to || w.lane !== sb.lane) continue;
        if (sb.from.yieldEnd && !w.committed && !road.yieldEnd) continue;
        const r = sb.at - w.s;
        if (r > 120) continue;
        if (r < dEnd || (Math.abs(r - dEnd) < 0.01 && w.id < v.id)) {
          const d = dEnd - r - w.len;
          if (d < g) { g = d; vl = w.v; }
        }
      }
    }

    // 看到下一段路
    if (g === Infinity && depth < 2) {
      const r2 = this.scan(v, tr.to, tr.toLane, tr.toS, dEnd, maxD, depth + 1, depth === 0 ? (v.next2 || null) : null);
      if (r2.g < g) { g = r2.g; vl = r2.vl; }
    }
    return { g, vl };
  }

  midMergeOk(v, tr, dEnd) {
    const bk = tr.to.buckets[tr.toLane];
    const ahead = firstAfter(bk, tr.toS - 0.01, v);
    if (ahead && ahead.s - ahead.len < tr.toS + 4) return false;
    const myT = dEnd / Math.max(v.v, 2);
    let cnt = 0;
    for (let i = bk.length - 1; i >= 0 && cnt < 4; i--) {
      const w = bk[i];
      if (w.s > tr.toS) continue;
      cnt++;
      const r = tr.toS - w.s;
      if (r > 120) break;
      const dv = Math.max(0, w.v - v.v);
      if (r < w.len + 8 + dv * 1.5 || r / Math.max(w.v, 0.5) < myT + 1.6) return false;
    }
    return true;
  }

  yieldOk(v, tr, dEnd) {
    const tb = tr.to.buckets[tr.toLane];
    for (const w of tb) {
      if (w.s > tr.toS + 40) break;
      if (w.s - w.len < tr.toS + 3 && w.s > tr.toS - 1) return false;
    }
    const tc = tr.to.kind === "urban" ? 3.2 : 3.8;
    const myT = dEnd / Math.max(v.v, 2);
    for (const sb of tr.sibs) {
      if (sb.from.yieldEnd) {
        // 其他讓路車已經決定進入
        const bk = sb.from.buckets[sb.lane];
        const w = lastAtOrBefore(bk, sb.at + 0.01, v);
        if (w && w.committed) return false;
        continue;
      }
      const bk = sb.from.buckets[sb.lane];
      let cnt = 0;
      for (let i = bk.length - 1; i >= 0 && cnt < 4; i--) {
        const w = bk[i];
        if (w.s > sb.at + 0.01) continue;
        if (w.next !== sb.to) continue;
        cnt++;
        const r = sb.at - w.s;
        if (r > 90) break;
        const tt = r / Math.max(w.v, 0.5);
        if (tt < tc + myT * 0.5 || r < w.len + 6) return false;
      }
      // 上一段路上也可能有車快到了
      if (cnt === 0 && sb.from.length !== undefined) { /* noop */ }
    }
    return true;
  }

  /* ---------- 加速度 ---------- */
  idm(v, vel, v0, gap, vl, tm = 1) {
    const p = v.p;
    let free = vel <= v0 ? p.a * (1 - Math.pow(vel / Math.max(v0, 0.1), 4)) : -Math.min(3, (vel - v0) * 0.9 + 0.3);
    if (gap === Infinity) return free;
    const T = p.T * v.tf * tm;
    const ss = p.s0 + Math.max(0, vel * T + vel * (vel - vl) / (2 * Math.sqrt(p.a * p.b)));
    const gg = Math.max(gap, 0.05);
    let a = (vel <= v0 ? free : Math.min(free, 0)) - p.a * (ss / gg) * (ss / gg);
    return Math.max(-9, Math.min(p.a, a));
  }

  v0of(v, road, s) {
    const z = road.zoneAt(s), z2 = road.zoneAt(Math.min(road.len, s + Math.max(30, v.v * 2.5)));
    let vm = Math.min(z.vm, z2.vm);
    let v0 = vm * v.vf;
    let cap = v.p.vcap * KMH;
    const grade = Math.max(z.grade, z2.grade);
    if (grade > 0 && v.p.kind !== "car") cap = Math.min(cap, (75 - grade * 7) * KMH);
    if (grade > 0 && v.p.kind === "car") cap = Math.min(cap, (115 - grade * 3) * KMH);
    if (v.p.kind !== "car") cap = Math.min(cap, z.tv, z2.tv);
    if (v.type !== "ems") cap = Math.min(cap, z.cap, z2.cap);
    v0 = Math.min(v0, cap);
    return { v0, tm: Math.max(z.tm, z2.tm) };
  }

  accelFor(v, lane, s0 = v.s) {
    const road = v.road;
    const { v0, tm } = this.v0of(v, road, s0);
    let { g, vl } = this.scan(v, road, lane, s0, 0, 260, 0, v.next);
    // 公車停靠
    const st = v.stops && v.stops[0];
    if (st && st.road === road && st.lane === lane && st.s >= s0 - 0.5) {
      const d = st.s - s0;
      if (d < g) { g = Math.max(0, d); vl = 0; }
    }
    return { a: this.idm(v, v.v, v0, g, vl, tm), g, vl };
  }

  /* ---------- 一步 ---------- */
  step(dt) {
    const net = this.net, vs = this.vs;
    this.t += dt;
    if (this.onStep) this.onStep(this, dt);

    this.ems = vs.filter((v) => v.type === "ems");
    // 分車道排序（變換車道中的車同時佔兩條車道）
    for (const r of net.roads) for (const b of r.buckets) b.length = 0;
    for (const v of vs) {
      v.road.buckets[v.lane].push(v);
      if (v.lcFrom >= 0) v.road.buckets[v.lcFrom].push(v);
    }
    for (const r of net.roads) for (const b of r.buckets) insSort(b);

    // 加速度
    for (const v of vs) {
      let r = this.accelFor(v, v.lane);
      if (v.lcFrom >= 0) {
        const r2 = this.accelFor(v, v.lcFrom);
        if (r2.a < r.a) r = r2;
      }
      let a = r.a;
      // 禮讓：旁邊車道有車急著切進來
      // 停太久就不再禮讓／對空隙，避免互相等待
      if (this.courtesy > 0 && v.stuck < 12) a = Math.min(a, this.courteous(v));
      // 急著換車道：配合目標車道的車速，對準空隙
      if (v.urgent && v.want && v.stuck < 12) a = Math.min(a, this.alignTo(v, v.want.lane));
      // 隨機擾動（造成幽靈塞車）
      if (this.noise > 0 && v.v > 3) a += gauss() * this.noise;
      if (v.brakeUntil && this.t < v.brakeUntil) a = Math.min(a, -4);
      v.acc = a; v.gmin = r.g;
      if (v.v < 0.3) v.stuck += dt; else v.stuck = 0;
    }

    // 變換車道
    for (const v of vs) {
      if (this.t >= v.lcNext) {
        v.lcNext = this.t + (v.urgent ? 0.3 : 0.6 + Math.random() * 0.4);
        this.laneChange(v);
      }
    }

    // 位置更新
    const remove = [];
    for (const v of vs) {
      let a = v.acc, vel = v.v;
      let nv = vel + a * dt, ds;
      if (nv < 0) { ds = a < 0 ? -vel * vel / (2 * a) : 0; nv = 0; }
      else ds = vel * dt + 0.5 * a * dt * dt;
      const lim = Math.max(0, v.gmin - 0.25);
      if (ds > lim) { ds = lim; nv = Math.min(nv, lim / dt); }
      const sOld = v.s;
      v.s += ds; v.v = nv; v.dist += ds;
      if (v.lcFrom >= 0) {
        v.lcT += dt / LC_DUR;
        if (v.lcT >= 1) { v.lcT = 1; v.lcFrom = -1; }
      }
      // 公車停靠
      const st = v.stops && v.stops[0];
      if (st && st.road === v.road && st.lane === v.lane && Math.abs(v.s - st.s) < 3 && v.v < 0.4) {
        st.wait = (st.wait || 0) + dt;
        if (st.wait >= st.dwell) v.stops.shift();
      }
      if (this.transfer(v, sOld)) remove.push(v);
    }
    if (remove.length) {
      const set = new Set(remove);
      this.vs = this.vs.filter((v) => !set.has(v));
    }

    this.spawn(dt);
    this.check();
    this.sample();
  }

  alignTo(v, L) {
    const road = v.road;
    if (L < 0 || L >= road.lanes) return Infinity;
    const bk = road.buckets[L];
    // 只對準「車頭在我前面」的車，退到它後面；並排時用編號決定誰讓
    let u = firstAfter(bk, v.s, v);
    if (u && Math.abs(u.s - v.s) < 0.3 && u.id > v.id) u = firstAfter(bk, u.s, v);
    if (!u || u.s - v.s > 40) return Infinity;
    const gap = u.s - u.len - v.s;
    const { v0 } = this.v0of(v, road, v.s);
    return Math.max(-3, this.idm(v, v.v, v0, Math.max(0.3, gap), u.v));
  }

  courteous(v) {
    let a = Infinity;
    if (!v.polite) return a;
    const road = v.road;
    for (const L of [v.lane - 1, v.lane + 1]) {
      if (L < 0 || L >= road.lanes) continue;
      const bk = road.buckets[L];
      const u = firstAfter(bk, v.s, v);
      if (!u || u.s - v.s > 45 || !u.want || u.want.lane !== v.lane || u.lcFrom >= 0) continue;
      if (u.s - u.len - v.s < 1) continue;
      const gap = u.s - u.len - v.s;
      const { v0 } = this.v0of(v, road, v.s);
      a = Math.min(a, Math.max(-3, this.idm(v, v.v, v0, gap, u.v)));
    }
    return a;
  }

  laneChange(v) {
    const road = v.road;
    v.want = null; v.urgent = false;
    if (v.lcFrom >= 0) return;
    if (road.lanes < 2) return;
    if (road.noLCAt(v.s)) return;
    if (v.lcCool > this.t) return;
    const { ok, deadline } = this.desired(v);
    const cur = v.lane;
    let target = -1;
    if (!ok[cur]) {
      let best = 1e9;
      for (let L = 0; L < road.lanes; L++) if (ok[L] && Math.abs(L - cur) < best) { best = Math.abs(L - cur); target = L; }
    }
    const nCross = target >= 0 ? Math.abs(target - cur) : 0;
    const urgency = target >= 0 ? Math.max(0, Math.min(1, 1 - (deadline - 40) / (350 + 300 * nCross))) : 0;
    v.urgent = target >= 0 && deadline < 120 + 130 * nCross;
    let bestL = -1, bestInc = 0;
    for (const dir of [-1, 1]) {
      const L = cur + dir;
      if (L < 0 || L >= road.lanes) continue;
      const g = road.laneSeg(L, v.s);
      if (!g || v.s - v.len < g[0] + 0.5) continue;
      const roomAhead = g[1] - v.s;
      if (roomAhead < (ok[L] ? 8 : 40)) continue;
      if (v.p.kind !== "car" && road.truckBan.has(L)) continue;
      let blocked = false;
      for (const b of road.blocks) if (b.on && b.lane === L && v.s > b.s0 - 2 && v.s - v.len < b.s1 + 2) blocked = true;
      if (blocked) continue;

      let bias = 0;
      if (target >= 0) bias = Math.sign(target - cur) === dir ? 0.4 + urgency * 4 : -3;
      else if (!ok[L]) bias = deadline < 1000 ? -4 : -0.6;
      if (target < 0 && ok[L]) bias += dir > 0 ? v.keepRight : -v.keepRight;

      const lead = this.scan(v, road, L, v.s, 0, 200, 0, v.next);
      if (lead.g < 1.5) { if (target >= 0 && Math.sign(target - cur) === dir) v.want = { lane: L }; continue; }
      const f = lastAtOrBefore(road.buckets[L], v.s, v);
      const fGap = f ? v.s - v.len - f.s : Infinity;
      const forced = v.stuck > 5 && target >= 0 && Math.sign(target - cur) === dir;
      if (f && fGap < (forced ? 1.2 : 2.5)) { if (target >= 0 && Math.sign(target - cur) === dir) v.want = { lane: L }; continue; }
      const { v0, tm } = this.v0of(v, road, v.s);
      const aNew = this.idm(v, v.v, v0, lead.g, lead.vl, tm);
      let aF = 0, aFold = 0;
      if (f) {
        const fv0 = this.v0of(f, road, f.s).v0;
        aF = this.idm(f, f.v, fv0, fGap, v.v, tm);
        aFold = f.acc ?? 0;
      }
      const bsafe = forced ? 9 : (v.urgent ? 4.5 : 3);
      if (aF < -bsafe || aNew < -bsafe) { if (target >= 0 && Math.sign(target - cur) === dir) v.want = { lane: L }; continue; }
      const pol = target >= 0 ? 0.1 : v.politeness;
      const inc = aNew - v.acc + pol * (aF - aFold) + bias;
      const th = target >= 0 && Math.sign(target - cur) === dir ? 0 : 0.3;
      if (inc > th && inc > bestInc) { bestInc = inc; bestL = L; }
    }
    if (bestL >= 0) {
      // 新車道的後車立刻把我當成前車（這一步就不能往前衝）
      const f = lastAtOrBefore(road.buckets[bestL], v.s, v);
      if (f) f.gmin = Math.min(f.gmin, Math.max(0, v.s - v.len - f.s));
      v.lcFrom = cur; v.lane = bestL; v.lcT = 0; v.lcCool = this.t + 3.5; v.want = null; v.stuck = 0;
      // 立刻加入新車道，避免兩台車同時切進同一個空位
      const bk = road.buckets[bestL];
      bk.push(v); insSort(bk);
    } else if (target >= 0 && !v.want) {
      v.want = { lane: cur + Math.sign(target - cur) };
    }
  }

  transfer(v, sOld) {
    for (let guard = 0; guard < 3; guard++) {
      const road = v.road;
      const outs = road.outsByLane[v.lane];
      let tr = null;
      for (const o of outs) if (o.at > sOld - 0.01 && o.at <= v.s + 1e-6 && o.to === v.next) { tr = o; break; }
      if (!tr) {
        const g = road.laneSeg(v.lane, Math.min(sOld, road.len)) || road.laneSeg(v.lane, Math.min(v.s, road.len));
        const end = g ? g[1] : sOld;
        if (v.s >= end - 1e-6) for (const o of outs) if (Math.abs(o.at - end) < 0.6) { tr = o; break; }
        // 保險：車道已經不存在 → 卡在車道終點
        if (!tr && g && v.s > end && end < road.len - 0.5) v.s = end;
      }
      if (!tr) {
        if (v.s >= road.len && road.endTargets.length === 0) { this.exit(v); return true; }
        if (v.s > road.len + 5) { this.exit(v); return true; } // 保險
        // 錯過出口：重新決定要去哪裡
        if (v.next) {
          const mt = road.midTargets.find((c) => c.to === v.next);
          if (mt && v.s > mt.at + 0.5) { this.st.missed++; v.next = this.route(road, v.s, v); }
        }
        return false;
      }
      if (tr.to !== v.next) this.st.missed++;
      if (road.gate) road.gate.next = this.t + 3600 / road.gate.rate;
      const over = v.s - tr.at;
      v.road = tr.to; v.lane = tr.toLane; v.s = tr.toS + over; sOld = tr.toS - 0.01;
      v.lcFrom = -1; v.lcT = 1; v.committed = false; v.passing = null;
      v.next = v.next2 && v.next2.from === v.road ? v.next2.to : this.route(v.road, v.s, v);
      v.next2 = null;
      if (v.road.onEnter) v.road.onEnter(v);
    }
    return false;
  }

  exit(v) {
    const st = this.st;
    st.exited++;
    const tt = this.t - v.t0;
    st.ttSum += tt;
    st.delaySum += Math.max(0, tt - v.dist / v.vff);
    st.exitTimes.push(this.t);
    if (v.type === "ems") { st.emsLog.push({ t: this.t, tt, ff: v.dist / (120 * KMH) }); if (st.emsLog.length > 8) st.emsLog.shift(); }
    const k = v.road.name || v.road.id;
    const b = st.bySink[k] || (st.bySink[k] = { n: 0, tt: 0 });
    b.n++; b.tt += tt;
  }

  /* ---------- 產生車輛 ---------- */
  spawn(dt) {
    for (const r of this.net.roads) {
      const src = r.src;
      if (!src) continue;
      if (src.flow > 0 && this.t >= src.nextT) {
        const mean = 3600 / src.flow;
        const minH = Math.min(mean * 0.9, 1.0);
        src.queue++;
        src.nextT = this.t + minH + (-Math.log(1 - Math.random()) * (mean - minH));
      } else if (src.flow <= 0) src.nextT = this.t;
      let tries = 0;
      while (src.queue > 0 && tries < 3) {
        tries++;
        if (!this.tryInsert(r)) break;
        src.queue--; src.entered++;
        src.enterTimes.push(this.t);
      }
      while (src.enterTimes.length && src.enterTimes[0] < this.t - 300) src.enterTimes.shift();
    }
  }

  makeVehicle(road) {
    const rnd = Math.random();
    let type = road.src.types ? road.src.types() :
      rnd < this.busPct ? "bus" : rnd < this.busPct + this.truckPct ? "truck" : "car";
    if (road.src.nextType) { type = road.src.nextType; road.src.nextType = null; }
    const p = TYPES[type];
    const v = {
      id: this.nid++, p, type, len: p.len, wid: p.wid, road, lane: 0, s: p.len, v: 0, acc: 0,
      vf: Math.max(0.78, Math.min(1.18, 1 + gauss() * 0.07)),
      tf: Math.max(0.75, Math.min(1.4, 1 + gauss() * 0.12)),
      politeness: 0.2 + Math.random() * 0.4,
      keepRight: type === "car" ? 0.12 : 0.6,
      polite: Math.random() < this.courtesy,
      lcFrom: -1, lcT: 1, lcNext: this.t + Math.random(), lcCool: 0, stuck: 0,
      t0: this.t, dist: 0, gmin: Infinity, want: null, urgent: false, committed: false,
      hue: Math.floor(Math.random() * 360),
    };
    v.vff = Math.max(5, Math.min(road.vmax * v.vf, p.vcap * KMH));
    if (type === "bus" && road.src.busStops) v.stops = road.src.busStops().map((x) => ({ ...x }));
    if (type === "car" && road.src.stopper && Math.random() < road.src.stopper.p) { v.stops = road.src.stopper.make(); v.stopper = true; }
    if (type === "ems") { v.vf = 1.3; v.keepRight = 0; v.politeness = 0; }
    return v;
  }

  tryInsert(road) {
    const v = road.src.pending || this.makeVehicle(road);
    road.src.pending = v;
    v.road = road; v.s = v.len;
    v.next = this.route(road, 0, v);
    const { ok } = this.desired(v);
    // 選空間最大的車道
    let bestL = -1, bestGap = -1, bestLead = null;
    for (let L = 0; L < road.lanes; L++) {
      const g = road.laneSeg(L, 0.5);
      if (!g) continue;
      if (v.p.kind !== "car" && road.truckBan.has(L)) continue;
      const bk = road.buckets[L];
      const u = bk.length ? bk[0] : null;
      const gap = u ? u.s - u.len - v.len : 1e9;
      const score = gap + (ok[L] ? 30 : 0) + Math.random() * 5;
      if (gap > v.len * 0.3 + 4 && score > bestGap) { bestGap = score; bestL = L; bestLead = u; }
    }
    if (bestL < 0) return false;
    const gap = bestLead ? bestLead.s - bestLead.len - v.s : 1e9;
    const { v0 } = this.v0of(v, road, v.s);
    const vl = bestLead ? bestLead.v : v0;
    let speed = Math.min(v0, vl + Math.max(0, gap - 8) / 2.5, Math.max(0, (gap - 3) / Math.max(0.8, v.p.T)));
    v.v = Math.max(0, speed);
    v.lane = bestL;
    road.buckets[bestL].unshift(v);
    road.src.pending = null;
    this.vs.push(v);
    return true;
  }

  /* ---------- 檢查與統計 ---------- */
  check() {
    for (const r of this.net.roads) for (let L = 0; L < r.buckets.length; L++) {
      const b = r.buckets[L];
      for (let i = 1; i < b.length; i++) {
        const a = b[i - 1], c = b[i];
        if (a === c) continue;
        if (a.road !== r || c.road !== r) continue;
        // 只檢查真正在這條車道上的車（不含變換中的影子）
        if (a.lane !== L || c.lane !== L) continue;
        if (a.lcFrom >= 0 || c.lcFrom >= 0) continue;
        if (a.s > c.s - c.len + 0.05) {
          const key = a.id < c.id ? a.id + "-" + c.id : c.id + "-" + a.id;
          this.colSeen = this.colSeen || new Set();
          if (!this.colSeen.has(key)) { this.colSeen.add(key); this.st.collisions++; }
        }
      }
    }
  }

  sample() {
    const st = this.st, t = this.t;
    while (st.exitTimes.length && st.exitTimes[0] < t - 300) st.exitTimes.shift();
    if (t - st.lastSample >= 10) {
      st.lastSample = t;
      let sv = 0;
      for (const v of this.vs) sv += v.v;
      const n = this.vs.length;
      const recent = st.exitTimes.filter((x) => x > t - 120).length;
      st.series.push({ t, speed: n ? sv / n / KMH : 0, n, flow: recent * 30 });
      if (st.series.length > 720) st.series.shift();
    }
    if (this.mainLen && t - st.lastHeat >= 5) {
      st.lastHeat = t;
      const BIN = 25, nb = Math.ceil(this.mainLen / BIN);
      const sum = new Float32Array(nb), cnt = new Uint16Array(nb);
      for (const v of this.vs) {
        const off = this.mainOff[v.road.id];
        if (off === undefined) continue;
        const i = Math.floor((off + v.s) / BIN);
        if (i >= 0 && i < nb) { sum[i] += v.v; cnt[i]++; }
      }
      const col = new Float32Array(nb);
      for (let i = 0; i < nb; i++) col[i] = cnt[i] ? sum[i] / cnt[i] / KMH : -1;
      st.heat.push(col);
      if (st.heat.length > 480) st.heat.shift();
    }
  }

  summary() {
    const st = this.st;
    let sv = 0;
    for (const v of this.vs) sv += v.v;
    const srcs = this.net.roads.filter((r) => r.src).map((r) => ({
      name: r.src.name || r.name || r.id, flow: r.src.flow, queue: r.src.queue,
      rate: Math.round(r.src.enterTimes.filter((x) => x > this.t - 300).length * 3600 / Math.min(300, Math.max(30, this.t))),
    }));
    return {
      t: this.t, n: this.vs.length,
      speed: this.vs.length ? sv / this.vs.length / KMH : 0,
      exited: st.exited,
      tt: st.exited ? st.ttSum / st.exited : 0,
      delay: st.exited ? st.delaySum / st.exited : 0,
      flow: Math.round(st.exitTimes.length * 3600 / Math.min(300, Math.max(30, this.t))),
      missed: st.missed, collisions: st.collisions,
      queue: srcs.reduce((a, s) => a + s.queue, 0),
      srcs, sinks: st.bySink, ems: st.emsLog[st.emsLog.length - 1] || null,
    };
  }

  /** 直接在某條路上放一台車（環狀道路用） */
  place(road, lane, s, type = "car", speed = 0) {
    const src = road.src;
    if (!road.src) road.src = { flow: 0, queue: 0, entered: 0, nextT: 1e9, enterTimes: [] };
    const v = this.makeVehicle(road);
    if (!src) road.src = null;
    v.type = type; v.p = TYPES[type]; v.len = v.p.len; v.wid = v.p.wid;
    v.road = road; v.lane = lane; v.s = s; v.v = speed;
    v.vff = Math.max(5, Math.min(road.vmax * v.vf, v.p.vcap * KMH));
    v.next = this.route(road, s, v);
    this.vs.push(v);
    return v;
  }

  /** 給畫面用：車子的位置與方向 */
  pose(v) {
    const r = v.road;
    let lat = r.lat(v.lane), yaw = 0;
    if (v.lcFrom >= 0) {
      const t = v.lcT, e = t * t * (3 - 2 * t);
      const l0 = r.lat(v.lcFrom);
      lat = l0 + (lat - l0) * e;
      const de = 6 * t * (1 - t) / LC_DUR;
      yaw = Math.max(-0.3, Math.min(0.3, Math.atan2((r.lat(v.lane) - l0) * de, Math.max(v.v, 6))));
    }
    const sc = Math.max(0, v.s - v.len / 2);
    const p = r.path.at(Math.min(sc, r.len), lat);
    if (sc > r.len) { p.x += Math.cos(p.h) * (sc - r.len); p.y += Math.sin(p.h) * (sc - r.len); }
    p.h += yaw;
    return p;
  }
}
