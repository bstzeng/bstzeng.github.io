// 26 種道路情境
import { Net, Pen, Path, LW, KMH } from "./engine.js";

/* ================= 共用小工具 ================= */
const fw = (net, id, x, y, len, lanes, o = {}) => net.road(id, new Pen(x, y, o.h ?? 0).line(len).path(), lanes, o);

function frame(p) {
  const dx = Math.cos(p.h), dy = Math.sin(p.h);
  return { dx, dy, nx: -dy, ny: dx };
}

/** 入口匝道（含加速車道） */
function onRamp(net, main, o) {
  const { id, at, accel = 250, back = 380, side = 70, flow = 600, name = "入口匝道", lead = 150, vmax = 70, K, src = true } = o;
  const L = K ?? main.lanes;
  if (accel > 0) main.aux(L, at, at + accel);
  const tp = main.path.at(at, main.lat(L));
  const f = frame(tp);
  const sx = tp.x - f.dx * back + f.nx * side, sy = tp.y - f.dy * back + f.ny * side;
  const pen = new Pen(sx - f.dx * lead, sy - f.dy * lead, tp.h).line(lead).bezierTo(tp.x, tp.y, tp.h, 0.5, 0.5);
  const r = net.road(id, pen.path(), 1, { center: true, vmax, name, kind: "ramp" });
  net.link(r, 0, main, L, r.len, at);
  if (src) r.src = { flow, name };
  return r;
}

/** 出口匝道（含減速車道） */
function offRamp(net, main, o) {
  const { id, at, decel = 200, fwd = 340, side = 70, name = "出口匝道", tail = 120, vmax = 60, K, p = 0.2 } = o;
  const L = K ?? main.lanes;
  if (decel > 0) main.aux(L, at - decel, at);
  const sp = main.path.at(at, main.lat(L));
  const f = frame(sp);
  const pen = new Pen(sp.x, sp.y, sp.h).bezierTo(sp.x + f.dx * fwd + f.nx * side, sp.y + f.dy * fwd + f.ny * side, sp.h, 0.5, 0.5);
  if (tail > 0) pen.line(tail);
  const r = net.road(id, pen.path(), 1, { center: true, vmax, name, kind: "ramp" });
  net.link(main, L, r, 0, at, 0);
  main.split[r.id] = p;
  return r;
}

/** 把路徑在 s 處切成兩段 */
function cut(path, s) {
  const a = [], b = [];
  for (let i = 0; i < path.n; i++) {
    if (path.s[i] < s) a.push([path.x[i], path.y[i]]);
    else b.push([path.x[i], path.y[i]]);
  }
  const p = path.at(s);
  a.push([p.x, p.y]); b.unshift([p.x, p.y]);
  return [new Path(a), new Path(b)];
}

/** 一段一段串起來的直路（號誌路口用） */
function linkAll(net, a, b) { for (let L = 0; L < Math.min(a.lanes, b.lanes); L++) net.link(a, L, b, L); }

const flowCtl = (road, label, max = 7000, step = 100) => ({ type: "flow", road, label, max, step });
const splitCtl = (road, to, label, max = 60) => ({ type: "split", road, to, label, max });

/* ================= 十字路口產生器 ================= */
function crossroads(net, o) {
  const { cx = 0, cy = 0, arm = 260, inL = 3, outL = 2, bay = 110, flows = [700, 700, 700, 700], gNS = 28, gEW = 22, gL = 12 } = o;
  const m = 0.6, R = (inL + outL) * LW / 2 + 3.5;
  const dirs = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const names = { N: "北", E: "東", S: "南", W: "西" };
  const rn = (u) => [-u[1], u[0]];
  const sig = net.signal([
    { g: ["NS_T"], dur: gNS }, { g: ["NS_L"], dur: gL },
    { g: ["EW_T"], dur: gEW }, { g: ["EW_L"], dur: gL },
  ], { yellow: 3, allRed: 2 });
  const inb = {}, outb = {};
  for (const k of Object.keys(dirs)) {
    const d = dirs[k], u = [-d[0], -d[1]], r = rn(u), h = Math.atan2(u[1], u[0]);
    const p0 = [cx + d[0] * arm + r[0] * m, cy + d[1] * arm + r[1] * m];
    const rd = net.road("in" + k, new Pen(p0[0], p0[1], h).line(arm - R).path(), inL, { vmax: 50, kind: "urban", name: names[k] + "向入口" });
    rd.setLane(0, rd.len - bay, rd.len);
    rd.src = { flow: flows["NESW".indexOf(k)], name: names[k] + "邊進來" };
    const g = k === "N" || k === "S" ? "NS" : "EW";
    rd.laneSignal = [{ sig, group: g + "_L" }, { sig, group: g + "_T" }, { sig, group: g + "_T" }];
    inb[k] = rd;
    const r2 = rn(d), h2 = Math.atan2(d[1], d[0]);
    const q0 = [cx + d[0] * R + r2[0] * m, cy + d[1] * R + r2[1] * m];
    outb[k] = net.road("out" + k, new Pen(q0[0], q0[1], h2).line(arm - R).path(), outL, { vmax: 50, kind: "urban", name: "往" + names[k] });
  }
  const turnTo = (k, t) => {
    const d = dirs[k], u = [-d[0], -d[1]];
    let w;
    if (t === "T") w = u; else if (t === "R") w = rn(u); else w = [-rn(u)[0], -rn(u)[1]];
    return Object.keys(dirs).find((q) => dirs[q][0] === w[0] && dirs[q][1] === w[1]);
  };
  const conns = [];
  for (const k of Object.keys(dirs)) {
    const a = inb[k];
    // 直行（兩車道）
    const tk = turnTo(k, "T"), ob = outb[tk];
    const p = a.path.at(a.len, a.lat(1) - LW / 2), q = ob.path.at(0, ob.lat(0) - LW / 2);
    const th = net.road("T" + k, new Pen(p.x, p.y, p.h).bezierTo(q.x, q.y, q.h).path(), 2, { vmax: 50, kind: "urban", name: "路口" });
    net.link(a, 1, th, 0); net.link(a, 2, th, 1); net.link(th, 0, ob, 0); net.link(th, 1, ob, 1);
    // 右轉
    const rk = turnTo(k, "R"), orr = outb[rk];
    const p2 = a.path.at(a.len, a.lat(2)), q2 = orr.path.at(0, orr.lat(outL - 1));
    const rt = net.road("R" + k, new Pen(p2.x, p2.y, p2.h).bezierTo(q2.x, q2.y, q2.h, 0.55, 0.55).path(), 1, { center: true, vmax: 25, kind: "urban", name: "路口" });
    net.link(a, 2, rt, 0); net.link(rt, 0, orr, outL - 1);
    // 左轉
    const lk = turnTo(k, "L"), ol = outb[lk];
    const p3 = a.path.at(a.len, a.lat(0)), q3 = ol.path.at(0, ol.lat(0));
    const lt = net.road("L" + k, new Pen(p3.x, p3.y, p3.h).bezierTo(q3.x, q3.y, q3.h, 0.6, 0.6).path(), 1, { center: true, vmax: 30, kind: "urban", name: "路口" });
    net.link(a, 0, lt, 0); net.link(lt, 0, ol, 0);
    conns.push({ k, th, rt, lt });
  }
  const turns = { L: 20, R: 15 };
  const applyTurns = () => {
    for (const c of conns) {
      const a = inb[c.k];
      a.endW = { [c.lt.id]: turns.L, [c.rt.id]: turns.R, [c.th.id]: Math.max(1, 100 - turns.L - turns.R) };
    }
  };
  applyTurns();
  return { inb, outb, sig, turns, applyTurns, R };
}

/* ================= 情境 ================= */
export const SCENARIOS = [];
const add = (s) => SCENARIOS.push(s);

/* ---------- 高速公路基本 ---------- */
add({
  id: "phantom", group: "高速公路", name: "幽靈塞車",
  desc: "沒有事故、沒有車道縮減，車子一多，有人輕踩一下煞車，後面就一路傳下去，形成「走走停停」的波浪。試著把車流拉高，或按「製造急煞」。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 5400, name: "主線" };
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1500, y: 5, w: 273 }, noise: 0.45, truckPct: 0.08,
      controls: [
        flowCtl(m, "主線車流"),
        { type: "button", label: "🛑 製造一次急煞", act: (sim) => {
          const c = sim.vs.filter((v) => v.road === m && v.s > 1000 && v.s < 1700 && v.v > 10);
          if (c.length) c[Math.floor(Math.random() * c.length)].brakeUntil = sim.t + 3;
        } },
      ],
    };
  },
});

add({
  id: "merge", group: "高速公路", name: "入口匝道合流",
  desc: "匝道車輛在加速車道上找空隙切入主線。主線很滿時，切入的車會讓後面的車煞車，回堵就從合流點往上游長出來。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2600, 3, { name: "國道主線" });
    m.src = { flow: 4200, name: "主線" };
    const r = onRamp(net, m, { id: "on", at: 1300, accel: 250, flow: 900, name: "入口匝道" });
    net.finalize();
    return { net, main: ["m"], focus: { x: 1350, y: 20, w: 247 }, controls: [flowCtl(m, "主線車流"), flowCtl(r, "匝道車流", 2000)] };
  },
});

add({
  id: "lanedrop", group: "高速公路", name: "車道縮減（拉鍊式 vs 提早併入）",
  desc: "三線變兩線。「拉鍊式」是兩條車道都開到最後再一台一台輪流併入；「提早併入」是大家很早就擠到同一條車道。比較看看哪一種回堵比較短。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線", dropAware: 150 });
    m.setLane(2, 0, 1600);
    m.src = { flow: 3600, name: "主線" };
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1550, y: 5, w: 273 }, courtesy: 0.9,
      controls: [
        flowCtl(m, "主線車流"),
        { type: "select", label: "併入方式", options: ["拉鍊式（開到底再輪流）", "提早併入（很早就換車道）"], value: 0,
          set: (sim, i) => { m.dropAware = i === 0 ? 150 : 1300; sim.courtesy = i === 0 ? 0.9 : 0.25; for (const v of sim.vs) v.polite = Math.random() < sim.courtesy; } },
      ],
    };
  },
});

add({
  id: "innercrash", group: "高速公路", name: "內側車道事故",
  desc: "內側車道發生事故，車道被佔住。車子要提早往右換車道，旁邊車道的人還會放慢看熱鬧。把「事故還在現場」關掉，看回堵怎麼慢慢消散。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4300, name: "主線" };
    const crash = { lane: 0, s0: 1600, s1: 1630, on: true, kind: "crash", warn: 500 };
    m.blocks.push(crash);
    const look = { s0: 1520, s1: 1680, vmax: 55, on: true };
    m.zones.push(look);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1550, y: 5, w: 247 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "toggle", label: "事故還在現場", value: true, set: (sim, on) => { crash.on = on; look.on = on; } },
        { type: "range", label: "看熱鬧車速", min: 20, max: 100, step: 5, value: 55, unit: "km/h", set: (sim, v) => (look.vmax = v) },
      ],
    };
  },
});

add({
  id: "shouldercrash", group: "高速公路", name: "路肩事故（看熱鬧車潮）",
  desc: "事故車停在路肩，沒有擋到任何車道，但經過的駕駛都放慢看熱鬧，一樣會塞。調整「看熱鬧車速」看看影響有多大。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4800, name: "主線" };
    const look = { s0: 1520, s1: 1660, vmax: 50, on: true };
    m.zones.push(look);
    net.deco.push({ type: "crash", road: m, s: 1600, lat: m.lat(3) + 0.3 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1550, y: 5, w: 247 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "range", label: "看熱鬧車速", min: 20, max: 110, step: 5, value: 50, unit: "km/h", set: (sim, v) => (look.vmax = v) },
        { type: "toggle", label: "駕駛會看熱鬧", value: true, set: (sim, on) => (look.on = on) },
      ],
    };
  },
});

add({
  id: "workzone", group: "高速公路", name: "施工封閉兩車道",
  desc: "四車道封閉外側兩線施工，速限降到 60。車子要在三角錐前併到內側兩線，容量直接少一半。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3000, 4, { name: "國道主線" });
    m.src = { flow: 5000, name: "主線" };
    const b1 = { lane: 3, s0: 1500, s1: 2050, on: true, kind: "work", warn: 900 };
    const b2 = { lane: 2, s0: 1570, s1: 2050, on: true, kind: "work", warn: 800 };
    m.blocks.push(b1, b2);
    const z = { s0: 1350, s1: 2100, vmax: 60, on: true };
    m.zones.push(z);
    net.deco.push({ type: "sign", road: m, s: 1350, text: "60" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1500, y: 7, w: 273 },
      controls: [
        flowCtl(m, "主線車流", 9000),
        { type: "toggle", label: "施工中", value: true, set: (sim, on) => { b1.on = b2.on = z.on = on; } },
        { type: "range", label: "施工區速限", min: 40, max: 100, step: 10, value: 60, unit: "km/h", set: (sim, v) => (z.vmax = v) },
      ],
    };
  },
});

add({
  id: "movingwork", group: "高速公路", name: "移動式施工車",
  desc: "掃路車、標線車以時速 15 公里在外側車道慢慢前進，後面的車要一直繞過它，塞車的位置會跟著施工車移動。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const b = { lane: 2, s0: 500, s1: 530, on: true, kind: "mwork", warn: 450, v: 15 * KMH };
    m.blocks.push(b);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 900, y: 5, w: 260 }, follow: () => ({ road: m, s: b.s0 }),
      onStep: (sim, dt) => {
        if (!b.on) return;
        b.s0 += b.v * dt; b.s1 = b.s0 + 30;
        if (b.s1 > m.len - 50) { b.s0 = 400; b.s1 = 430; }
      },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "range", label: "施工車速度", min: 5, max: 60, step: 5, value: 15, unit: "km/h", set: (sim, v) => (b.v = v * KMH) },
        { type: "toggle", label: "施工車上路", value: true, set: (sim, on) => (b.on = on) },
      ],
    };
  },
});

add({
  id: "fog", group: "高速公路", name: "濃霧路段",
  desc: "濃霧區看不遠，駕駛自動放慢、拉長車距。路段容量下降，霧區入口就變成瓶頸。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 4400, name: "主線" };
    const z = { s0: 1100, s1: 2300, vmax: 60, tmul: 1.8, on: true };
    m.zones.push(z);
    net.deco.push({ type: "fog", road: m, s0: 1100, s1: 2300, zone: z });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1100, y: 5, w: 292 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "toggle", label: "起霧", value: true, set: (sim, on) => (z.on = on) },
        { type: "range", label: "霧中車速", min: 30, max: 100, step: 5, value: 60, unit: "km/h", set: (sim, v) => (z.vmax = v) },
      ],
    };
  },
});

add({
  id: "uphill", group: "高速公路", name: "上坡路段與爬坡道",
  desc: "長上坡大貨車爬不動，速度掉到 30 幾公里。有爬坡道時大車靠右慢慢爬，小車可以超過；關掉爬坡道看看差多少。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 2, { name: "國道主線" });
    m.src = { flow: 2600, name: "主線" };
    m.zones.push({ s0: 900, s1: 2300, grade: 6 });
    m.aux(2, 1000, 2350);
    net.deco.push({ type: "grade", road: m, s0: 900, s1: 2300, text: "上坡 6%" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1100, y: 5, w: 292 }, truckPct: 0.3,
      controls: [
        flowCtl(m, "主線車流", 5000),
        { type: "toggle", label: "有爬坡道", value: true, rebuild: true, set: (sim, on) => { m.segs[2] = on ? [[1000, 2350]] : []; } },
      ],
    };
  },
});

add({
  id: "tunnel", group: "高速公路", name: "長隧道",
  desc: "隧道內禁止變換車道、速限 80，而且很多人進隧道前會下意識踩煞車。隧道口常常就是塞車的起點（像雪隧）。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3400, 2, { name: "國道主線" });
    m.src = { flow: 3200, name: "主線" };
    m.noLC.push([1300, 2800]);
    const portal = { s0: 1250, s1: 1420, vmax: 65, on: true };
    m.zones.push(portal, { s0: 1420, s1: 2800, vmax: 80 });
    net.deco.push({ type: "tunnel", road: m, s0: 1300, s1: 2800 }, { type: "sign", road: m, s: 1250, text: "80" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1300, y: 4, w: 273 }, truckPct: 0.15,
      controls: [
        flowCtl(m, "主線車流", 5000),
        { type: "toggle", label: "進隧道會踩煞車", value: true, set: (sim, on) => (portal.on = on) },
        { type: "range", label: "隧道口車速", min: 40, max: 90, step: 5, value: 65, unit: "km/h", set: (sim, v) => (portal.vmax = v) },
      ],
    };
  },
});

/* ---------- 交流道 ---------- */
add({
  id: "exitqueue", group: "交流道", name: "出口匝道回堵主線",
  desc: "下交流道的車太多，匝道盡頭的紅綠燈消化不完，排隊一路回堵到主線外側車道，連直行的車也被拖累。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2600, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const off = offRamp(net, m, { id: "off", at: 1500, decel: 200, fwd: 300, side: 80, tail: 180, p: 0.25, name: "出口匝道" });
    const sig = net.signal([{ g: ["G"], dur: 18 }, { g: [], dur: 30 }], { yellow: 3, allRed: 2 });
    off.laneSignal = [{ sig, group: "G" }];
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1500, y: 40, w: 273 },
      controls: [
        flowCtl(m, "主線車流"), splitCtl(m, off, "下交流道比例"),
        { type: "range", label: "匝道綠燈秒數", min: 8, max: 50, step: 2, value: 18, unit: "秒", set: (sim, v) => { sig.phases[0].dur = v; sig.recalc(); } },
      ],
    };
  },
});

add({
  id: "weave", group: "交流道", name: "交織路段",
  desc: "入口匝道後面緊接著出口：要上來的車往左切、要下去的車往右切，兩股車流在短短 400 公尺內交叉，是最容易塞的設計之一。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2600, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const on = onRamp(net, m, { id: "on", at: 1100, accel: 400, flow: 900, name: "入口匝道" });
    const off = offRamp(net, m, { id: "off", at: 1500, decel: 0, K: 3, p: 0.2, name: "出口匝道" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1300, y: 25, w: 292 },
      controls: [flowCtl(m, "主線車流"), flowCtl(on, "入口匝道車流", 2000), splitCtl(m, off, "下交流道比例")],
    };
  },
});

add({
  id: "clover", group: "交流道", name: "苜蓿葉交流道（環圈匝道）",
  desc: "環圈匝道轉彎半徑小、車速慢。上一個環圈進來的車，和要去下一個環圈的車在橋下交織，速度差很大。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const K = 3, mergeAt = 1300, exitAt = 1600, y3 = m.lat(K);
    m.aux(K, mergeAt, exitAt);
    const loopIn = net.road("loopIn",
      new Pen(1438, 70, Math.PI / 2).line(30).bezierTo(1250, 165, Math.PI, 0.5, 0.5).arc(48, 180).bezierTo(mergeAt, y3, 0, 0.5, 0.5).path(),
      1, { center: true, vmax: 40, kind: "ramp", name: "環圈入口" });
    net.link(loopIn, 0, m, K, loopIn.len, mergeAt);
    loopIn.src = { flow: 700, name: "環圈入口" };
    const loopOut = net.road("loopOut",
      new Pen(exitAt, y3, 0).bezierTo(1680, 40, 0, 0.5, 0.5).arc(48, 180).bezierTo(1462, 75, -Math.PI / 2, 0.5, 0.5).line(40).path(),
      1, { center: true, vmax: 40, kind: "ramp", name: "環圈出口" });
    net.link(m, K, loopOut, 0, exitAt, 0);
    m.split[loopOut.id] = 0.15;
    net.deco.push({ type: "bridge", x: 1450, y0: -260, y1: 280, w: 22 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1450, y: 60, w: 600 },
      controls: [flowCtl(m, "主線車流"), flowCtl(loopIn, "環圈入口車流", 1500), splitCtl(m, loopOut, "走環圈出口比例")],
    };
  },
});

add({
  id: "system", group: "交流道", name: "系統交流道匯流",
  desc: "兩條國道合併成一條：三線＋兩線＝五線，但不久後最外側車道結束，五線變四線。兩條路的車都在搶位置。",
  build() {
    const net = new Net();
    const a = fw(net, "a", 0, 0, 1500, 3, { name: "國道 A" });
    a.src = { flow: 4000, name: "國道 A" };
    const c = fw(net, "c", 1500, 0, 1700, 5, { name: "合併後主線" });
    c.setLane(4, 0, 700);
    const end = c.path.at(0, c.lat(3) - LW / 2);
    const b = net.road("b", new Pen(200, 330, 0).line(500).bezierTo(end.x, end.y, 0, 0.5, 0.5).path(), 2, { name: "國道 B" });
    b.src = { flow: 2400, name: "國道 B" };
    for (let L = 0; L < 3; L++) net.link(a, L, c, L);
    net.link(b, 0, c, 3); net.link(b, 1, c, 4);
    net.finalize();
    return {
      net, main: ["a", "c"], focus: { x: 1450, y: 40, w: 292 },
      controls: [flowCtl(a, "國道 A 車流"), flowCtl(b, "國道 B 車流", 5000)],
    };
  },
});

add({
  id: "fork", group: "交流道", name: "國道分岔",
  desc: "四車道在前方分成兩條國道，左邊兩線往 A、右邊兩線往 B。要去另一邊的車得提早換到對的車道，不然就會在分岔前硬切。",
  build() {
    const net = new Net();
    const a = fw(net, "a", 0, 0, 1800, 4, { name: "國道主線" });
    a.src = { flow: 5200, name: "主線" };
    const b = net.road("b", new Pen(1800, 0, 0).bezierTo(2500, -170, 0, 0.5, 0.5).line(500).path(), 2, { name: "往 A 方向" });
    const p = a.path.at(a.len, a.lat(2) - LW / 2);
    const c = net.road("c", new Pen(p.x, p.y, 0).bezierTo(2500, 180, 0, 0.5, 0.5).line(500).path(), 2, { name: "往 B 方向" });
    net.link(a, 0, b, 0); net.link(a, 1, b, 1); net.link(a, 2, c, 0); net.link(a, 3, c, 1);
    a.endW = { b: 50, c: 50 };
    net.finalize();
    return {
      net, main: ["a", "b"], focus: { x: 1800, y: 0, w: 600 },
      controls: [flowCtl(a, "主線車流", 9000), { type: "endsplit", road: a, a: b, b: c, label: "往 A 方向比例" }],
    };
  },
});

add({
  id: "rampseq", group: "交流道", name: "連續入口匝道（快速道路）",
  desc: "都市快速道路只有兩線，每隔幾百公尺就有一個入口，加速車道又很短。每個入口都在往主線塞車，越下游越塞。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3000, 2, { name: "快速道路", vmax: 80 });
    m.src = { flow: 2000, name: "快速道路" };
    const r1 = onRamp(net, m, { id: "on1", at: 700, accel: 150, flow: 450, name: "入口 1", K: 2, back: 260, side: 55 });
    const off = offRamp(net, m, { id: "off", at: 1250, decel: 150, flow: 0, name: "出口", K: 2, p: 0.15, fwd: 260, side: 55 });
    const r2 = onRamp(net, m, { id: "on2", at: 1600, accel: 150, flow: 450, name: "入口 2", K: 2, back: 260, side: 55 });
    const r3 = onRamp(net, m, { id: "on3", at: 2200, accel: 150, flow: 450, name: "入口 3", K: 2, back: 260, side: 55 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1500, y: 20, w: 900 },
      controls: [flowCtl(m, "主線車流", 4000), flowCtl(r1, "入口 1", 1500), flowCtl(r2, "入口 2", 1500), flowCtl(r3, "入口 3", 1500), splitCtl(m, off, "下匝道比例")],
    };
  },
});

add({
  id: "meter", group: "交流道", name: "匝道儀控",
  desc: "匝道口的紅綠燈每隔幾秒放一台車上去，避免一次湧入把主線塞爆。打開／關掉儀控，比較主線速度與匝道排隊長度。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2600, 3, { name: "國道主線" });
    m.src = { flow: 4900, name: "主線" };
    const full = onRamp(net, m, { id: "tmp", at: 1300, accel: 250, flow: 0, src: false, lead: 300 });
    // 把匝道切成兩段：前段終點是儀控號誌
    const [p1, p2] = cut(full.path, full.len - 90);
    net.roads.splice(net.roads.indexOf(full), 1); delete net.map.tmp; m.outs.length = 0;
    const r1 = net.road("on1", p1, 1, { center: true, vmax: 60, kind: "ramp", name: "入口匝道" });
    const r2 = net.road("on2", p2, 1, { center: true, vmax: 60, kind: "ramp", name: "入口匝道" });
    net.link(r1, 0, r2, 0); net.link(r2, 0, m, 3, r2.len, 1300);
    r1.src = { flow: 900, name: "入口匝道" };
    const sig = net.signal([{ g: ["m"], dur: 1.8 }, { g: [], dur: 3.2 }], { yellow: 0, allRed: 0 });
    r1.laneSignal = [{ sig, group: "m" }];
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1250, y: 40, w: 292 },
      controls: [
        flowCtl(m, "主線車流"), flowCtl(r1, "匝道車流", 2000),
        { type: "toggle", label: "儀控開啟", value: true, set: (sim, on) => (r1.laneSignal = on ? [{ sig, group: "m" }] : null) },
        { type: "range", label: "儀控放行率", min: 300, max: 1500, step: 50, value: 720, unit: "輛/時", set: (sim, v) => { sig.phases[1].dur = Math.max(0.3, 3600 / v - 1.8); sig.recalc(); } },
      ],
    };
  },
});

add({
  id: "parking", group: "交流道", name: "連假景點停車場客滿",
  desc: "連假出遊，景點停車場進場很慢，排隊從停車場一路排到匝道、再排回國道外側車道。調整「停車場進場速度」。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 2, { name: "國道主線" });
    m.src = { flow: 2800, name: "主線" };
    const off = offRamp(net, m, { id: "off", at: 1500, decel: 150, fwd: 260, side: 70, tail: 420, p: 0.15, name: "往景點" });
    off.gate = { rate: 300, next: 0 };
    const e = off.path.at(off.len);
    net.deco.push({ type: "parking", x: e.x + 8, y: e.y - 28, w: 80, h: 56 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1700, y: 70, w: 600 },
      controls: [
        flowCtl(m, "主線車流", 5000), splitCtl(m, off, "去景點比例"),
        { type: "range", label: "停車場進場速度", min: 60, max: 1200, step: 20, value: 300, unit: "輛/時", set: (sim, v) => (off.gate.rate = v) },
      ],
    };
  },
});

add({
  id: "exitsplit", group: "交流道", name: "出口匝道分岔＋路口號誌",
  desc: "下交流道後分成左轉、右轉兩個車道，各有自己的燈號。左轉燈太短的話，左轉車排出單車道區，連右轉車也被卡住。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2600, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const off = offRamp(net, m, { id: "off", at: 1400, decel: 200, fwd: 260, side: 70, tail: 40, p: 0.22, name: "出口匝道" });
    const e = off.path.at(off.len);
    const r2 = net.road("off2", new Pen(e.x, e.y - LW / 2, 0).line(220).path(), 2, { vmax: 50, kind: "ramp", name: "匝道" });
    r2.setLane(1, 70, 220);
    net.link(off, 0, r2, 0);
    const x = e.x + 220, y = e.y - LW / 2;
    const left = net.road("left", new Pen(x, y + LW / 2, 0).bezierTo(x + 40, y - 40, -Math.PI / 2, 0.6, 0.6).line(150).path(), 1, { center: true, vmax: 40, kind: "urban", name: "左轉往市區" });
    const right = net.road("right", new Pen(x, y + LW * 1.5, 0).bezierTo(x + 25, y + 40, Math.PI / 2, 0.6, 0.6).line(150).path(), 1, { center: true, vmax: 40, kind: "urban", name: "右轉往郊區" });
    net.link(r2, 0, left, 0); net.link(r2, 1, right, 0);
    r2.endW = { left: 50, right: 50 };
    const sig = net.signal([{ g: ["R"], dur: 30 }, { g: ["L"], dur: 12 }, { g: [], dur: 18 }], { yellow: 3, allRed: 2 });
    r2.laneSignal = [{ sig, group: "L" }, { sig, group: "R" }];
    net.deco.push({ type: "street", x: x + 32, y0: y - 260, y1: y + 260, w: 16 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1850, y: 60, w: 292 },
      controls: [
        flowCtl(m, "主線車流"), splitCtl(m, off, "下交流道比例"),
        { type: "endsplit", road: r2, a: left, b: right, label: "左轉比例" },
        { type: "range", label: "左轉綠燈", min: 6, max: 40, step: 2, value: 12, unit: "秒", set: (sim, v) => { sig.phases[1].dur = v; sig.recalc(); } },
      ],
    };
  },
});

/* ---------- 交通管理 ---------- */
add({
  id: "shoulder", group: "交通管理", name: "尖峰開放路肩",
  desc: "尖峰時段把路肩當成第四條車道使用，入口匝道的車直接接上路肩車道。關掉路肩看回堵會長多少。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 5300, name: "主線" };
    const on = onRamp(net, m, { id: "on", at: 1200, accel: 0, flow: 800, K: 3, name: "入口匝道" });
    const off = offRamp(net, m, { id: "off", at: 2200, decel: 0, K: 3, p: 0.15, name: "出口匝道" });
    const open = [[600, 2200]], closed = [[1200, 1450], [2000, 2200]];
    m.aux(3, 600, 2200);
    net.deco.push({ type: "shoulderline", road: m, s0: 0, s1: 2800 });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1300, y: 10, w: 325 },
      controls: [
        flowCtl(m, "主線車流"), flowCtl(on, "入口匝道車流", 2000), splitCtl(m, off, "下交流道比例"),
        { type: "toggle", label: "開放路肩", value: true, rebuild: true, set: (sim, on2) => { m.segs[3] = (on2 ? open : closed).map((x) => [...x]); } },
      ],
    };
  },
});

add({
  id: "truckban", group: "交通管理", name: "大貨車禁行內側車道",
  desc: "大貨車又慢又長，如果開在內側車道，後面的小車就得一直變換車道超車。打開「禁行內側」比較車速與變換車道的混亂程度。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const on = onRamp(net, m, { id: "on", at: 1300, accel: 250, flow: 600 });
    m.truckBan.add(0);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1300, y: 15, w: 273 }, truckPct: 0.3,
      controls: [
        flowCtl(m, "主線車流"), flowCtl(on, "匝道車流", 2000),
        { type: "toggle", label: "大貨車禁行內側", value: true, set: (sim, on2) => { on2 ? m.truckBan.add(0) : m.truckBan.delete(0); } },
      ],
    };
  },
});

add({
  id: "holiday", group: "交通管理", name: "連假國道綜合狀況",
  desc: "長達 4 公里的國道：兩個入口、兩個出口、一處車道縮減，還可以隨時製造一場事故。看看各種瓶頸怎麼互相影響。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 4400, 3, { name: "國道主線", dropAware: 400 });
    m.src = { flow: 4200, name: "主線" };
    const on1 = onRamp(net, m, { id: "on1", at: 700, accel: 250, flow: 700, name: "入口 1" });
    const off1 = offRamp(net, m, { id: "off1", at: 1700, decel: 200, K: 3, p: 0.15, name: "出口 1", fwd: 260, side: 110, tail: 0 });
    const on2 = onRamp(net, m, { id: "on2", at: 2300, accel: 250, K: 3, flow: 800, name: "入口 2", back: 260, side: 50, lead: 100 });
    m.setLane(2, 0, 3100);
    const off2 = offRamp(net, m, { id: "off2", at: 3700, decel: 200, K: 2, p: 0.15, name: "出口 2" });
    const crash = { lane: 1, s0: 2900, s1: 2925, on: false, kind: "crash", warn: 450 };
    m.blocks.push(crash);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 2200, y: 10, w: 1400 },
      controls: [
        flowCtl(m, "主線車流"), flowCtl(on1, "入口 1", 2000), flowCtl(on2, "入口 2", 2000),
        splitCtl(m, off1, "出口 1 比例"), splitCtl(m, off2, "出口 2 比例"),
        { type: "toggle", label: "中線發生事故", value: false, set: (sim, on) => (crash.on = on) },
      ],
    };
  },
});

/* ---------- 市區 ---------- */
add({
  id: "crossroad", group: "市區道路", name: "十字路口號誌（含左轉專用道）",
  desc: "四向路口，每個方向都有左轉專用道和左轉專用時相。調整南北／東西綠燈秒數，或把左轉比例拉高，看哪個方向先排爆。",
  build() {
    const net = new Net();
    const X = crossroads(net, {});
    net.finalize();
    const sig = X.sig;
    return {
      net, main: ["inS", "TS", "outN"], focus: { x: 0, y: 0, w: 170 },
      controls: [
        flowCtl(X.inb.S, "南邊進來", 1500, 50), flowCtl(X.inb.N, "北邊進來", 1500, 50),
        flowCtl(X.inb.E, "東邊進來", 1500, 50), flowCtl(X.inb.W, "西邊進來", 1500, 50),
        { type: "range", label: "左轉比例", min: 0, max: 50, step: 5, value: 20, unit: "%", set: (sim, v) => { X.turns.L = v; X.applyTurns(); } },
        { type: "range", label: "南北向直行綠燈", min: 10, max: 60, step: 2, value: 28, unit: "秒", set: (sim, v) => { sig.phases[0].dur = v; sig.recalc(); } },
        { type: "range", label: "東西向直行綠燈", min: 10, max: 60, step: 2, value: 22, unit: "秒", set: (sim, v) => { sig.phases[2].dur = v; sig.recalc(); } },
        { type: "range", label: "左轉綠燈", min: 4, max: 30, step: 2, value: 12, unit: "秒", set: (sim, v) => { sig.phases[1].dur = sig.phases[3].dur = v; sig.recalc(); } },
      ],
    };
  },
});

add({
  id: "greenwave", group: "市區道路", name: "幹道連續號誌（綠波）",
  desc: "一條主幹道連續四個路口。綠波協調時，用速限開就能一路綠燈；不協調時，每個路口都要停。切換看看平均延誤差多少。",
  build() {
    const net = new Net();
    const xs = [320, 680, 1040, 1400], W2 = 2 * LW, total = 1750, speed = 50 * KMH;
    const sigs = [];
    let x = 0, prev = null;
    const main = [];
    xs.forEach((xc, i) => {
      const seg = fw(net, "a" + i, x, 0, xc - 3 - x, 3, { vmax: 50, kind: "urban", name: "主幹道" });
      if (prev) linkAll(net, prev, seg); else seg.src = { flow: 1800, name: "主幹道" };
      const box = fw(net, "x" + i, xc - 3, 0, W2 + 6, 3, { vmax: 50, kind: "urban", name: "路口" });
      linkAll(net, seg, box);
      const sig = net.signal([{ g: ["A"], dur: 32 }, { g: ["C"], dur: 18 }], { yellow: 3, allRed: 2 });
      sigs.push(sig);
      seg.laneSignal = [0, 1, 2].map(() => ({ sig, group: "A" }));
      // 南往北的側街
      const ap = net.road("c" + i, new Pen(xc, 260, -Math.PI / 2).line(260 - 3 * LW - 3).path(), 2, { vmax: 40, kind: "urban", name: "側街" });
      ap.src = { flow: 350, name: `側街 ${i + 1}` };
      ap.laneSignal = [0, 1].map(() => ({ sig, group: "C" }));
      const cb = net.road("cb" + i, new Pen(xc, 3 * LW + 3, -Math.PI / 2).line(3 * LW + 6).path(), 2, { vmax: 40, kind: "urban", name: "路口" });
      const ce = net.road("ce" + i, new Pen(xc, -3, -Math.PI / 2).line(250).path(), 2, { vmax: 40, kind: "urban", name: "側街出口" });
      linkAll(net, ap, cb); linkAll(net, cb, ce);
      main.push(seg.id, box.id);
      prev = box; x = xc + W2 + 3;
    });
    const last = fw(net, "aEnd", x, 0, total - x, 3, { vmax: 50, kind: "urban", name: "主幹道出口" });
    linkAll(net, prev, last);
    main.push(last.id);
    const setWave = (on) => {
      const rnd = [0, 37, 11, 48];
      sigs.forEach((s, i) => (s.offset = on ? -(xs[i] / speed) : rnd[i]));
    };
    setWave(true);
    net.finalize();
    return {
      net, main, focus: { x: 860, y: 40, w: 900 },
      controls: [
        flowCtl(net.map.a0, "主幹道車流", 3000, 50),
        { type: "range", label: "側街車流（每條）", min: 0, max: 900, step: 50, value: 350, unit: "輛/時",
          set: (sim, v) => xs.forEach((_, i) => (net.map["c" + i].src.flow = v)) },
        { type: "toggle", label: "綠波協調", value: true, set: (sim, on) => setWave(on) },
      ],
    };
  },
});

add({
  id: "roundabout", group: "市區道路", name: "單車道圓環",
  desc: "進圓環要讓環內的車先走，找到空隙才能進去。某一個方向車流特別大時，其他入口可能一直等不到空隙。",
  build() {
    const net = new Net();
    const R = 26, arm = 230, m = 4.2, d2 = Math.PI / 180;
    const arms = [
      { k: "E", a: 0 }, { k: "N", a: -90 }, { k: "W", a: 180 }, { k: "S", a: 90 },
    ]; // 逆時針（畫面上）順序
    const names = { N: "北", E: "東", S: "南", W: "西" };
    const pt = (deg) => ({ x: R * Math.cos(deg * d2), y: R * Math.sin(deg * d2), h: Math.atan2(-Math.cos(deg * d2), Math.sin(deg * d2)) });
    const arcPath = (a0, a1) => {
      const pts = [];
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 4));
      for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * d2; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
      return new Path(pts);
    };
    const segA = [], segB = [], ins = [], outs = [];
    arms.forEach((A, i) => {
      // 出口點 A.a+22、入口點 A.a-22（角度遞減的方向行駛）
      segA[i] = net.road("ra" + i, arcPath(A.a + 22, A.a - 22), 1, { center: true, vmax: 30, kind: "urban", name: "圓環" });
      const nextA = arms[(i + 1) % 4].a;
      let endA = nextA + 22; while (endA > A.a - 22) endA -= 360;
      segB[i] = net.road("rb" + i, arcPath(A.a - 22, endA), 1, { center: true, vmax: 30, kind: "urban", name: "圓環" });
    });
    arms.forEach((A, i) => {
      const d = [Math.cos(A.a * d2), Math.sin(A.a * d2)], u = [-d[0], -d[1]];
      const rnU = [-u[1], u[0]], rnD = [-d[1], d[0]];
      const P = pt(A.a - 22), Q = pt(A.a + 22);
      const inR = net.road("in" + A.k, new Pen(d[0] * arm + rnU[0] * m, d[1] * arm + rnU[1] * m, Math.atan2(u[1], u[0]))
        .line(arm - R - 26).bezierTo(P.x, P.y, P.h, 0.5, 0.5).path(), 1, { center: true, vmax: 50, kind: "urban", name: names[A.k] + "邊入口", yieldEnd: true });
      inR.src = { flow: 500, name: names[A.k] + "邊進來" };
      inR.routeFn = (v) => { v.exitArm = (i + 1 + Math.floor(Math.random() * 3)) % 4; return undefined; };
      const outR = net.road("out" + A.k, new Pen(Q.x, Q.y, Q.h).bezierTo(d[0] * (R + 26) + rnD[0] * m, d[1] * (R + 26) + rnD[1] * m, Math.atan2(d[1], d[0]), 0.5, 0.5)
        .line(arm - R - 26).path(), 1, { center: true, vmax: 50, kind: "urban", name: "往" + names[A.k] });
      ins[i] = inR; outs[i] = outR;
    });
    arms.forEach((A, i) => {
      net.link(segA[i], 0, segB[i], 0);
      net.link(ins[i], 0, segB[i], 0);
      const j = (i + 1) % 4;
      net.link(segB[i], 0, segA[j], 0);
      net.link(segB[i], 0, outs[j], 0);
      segB[i].routeFn = (v) => (v.exitArm === j ? outs[j] : segA[j]);
    });
    net.finalize();
    return {
      net, main: [], focus: { x: 0, y: 0, w: 115 },
      controls: ins.map((r, i) => flowCtl(r, names[arms[i].k] + "邊進來", 1200, 50)),
    };
  },
});

add({
  id: "busstop", group: "市區道路", name: "公車停靠與路邊違停",
  desc: "兩線道的市區道路，公車停靠時佔住外側車道，路邊又有違規停車，外側車道一直被卡，車子只好擠到內側。",
  build() {
    const net = new Net();
    const r = fw(net, "r", 0, 0, 1000, 2, { vmax: 50, kind: "urban", name: "市區道路" });
    r.src = {
      flow: 1100, name: "市區道路",
      busStops: () => [{ road: r, lane: 1, s: 300, dwell: 18 }, { road: r, lane: 1, s: 700, dwell: 18 }],
    };
    const sig = net.signal([{ g: ["G"], dur: 40 }, { g: [], dur: 25 }], { yellow: 3, allRed: 2 });
    r.laneSignal = [{ sig, group: "G" }, { sig, group: "G" }];
    const p1 = { lane: 1, s0: 470, s1: 484, on: true, kind: "park", warn: 150 };
    const p2 = { lane: 1, s0: 830, s1: 844, on: true, kind: "park", warn: 150 };
    r.blocks.push(p1, p2);
    net.deco.push({ type: "busstop", road: r, s: 300 }, { type: "busstop", road: r, s: 700 });
    net.finalize();
    return {
      net, main: ["r"], focus: { x: 520, y: 4, w: 273 }, busPct: 0.08, truckPct: 0.03,
      controls: [
        flowCtl(r, "車流", 2500, 50),
        { type: "range", label: "公車比例", min: 0, max: 30, step: 2, value: 8, unit: "%", set: (sim, v) => (sim.busPct = v / 100) },
        { type: "toggle", label: "路邊違停", value: true, set: (sim, on) => { p1.on = p2.on = on; } },
      ],
    };
  },
});

/* ---------- 補充：更多複雜情境 ---------- */
add({
  id: "brokentruck", group: "高速公路", name: "外側車道大貨車拋錨",
  desc: "一台大貨車在外側車道拋錨，後面又剛好是入口匝道。匝道上來的車和要繞過拋錨車的車搶同一條車道。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4000, name: "主線" };
    const on = onRamp(net, m, { id: "on", at: 1250, accel: 250, flow: 800 });
    const bk = { lane: 2, s0: 1650, s1: 1664, on: true, kind: "truck", warn: 350 };
    m.blocks.push(bk);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1500, y: 20, w: 260 },
      controls: [flowCtl(m, "主線車流"), flowCtl(on, "匝道車流", 2000), { type: "toggle", label: "拋錨車還在", value: true, set: (sim, o) => (bk.on = o) }],
    };
  },
});

add({
  id: "curve", group: "高速公路", name: "連續彎道下坡",
  desc: "山區國道的 S 型彎道，彎道速限 70，還有大貨車。大家在彎道前減速，直線再加速，車流像手風琴一樣伸縮。",
  build() {
    const net = new Net();
    const path = new Pen(0, 0, 0).line(700).arc(260, 50).arc(260, -100).arc(260, 50).line(900).path();
    const m = net.road("m", path, 2, { name: "山區國道" });
    m.src = { flow: 2800, name: "主線" };
    const z = { s0: 650, s1: 700 + 260 * Math.PI * 200 / 180 + 50, vmax: 70, on: true };
    m.zones.push(z);
    net.deco.push({ type: "sign", road: m, s: 650, text: "70" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1150, y: 120, w: 800 }, truckPct: 0.2,
      controls: [flowCtl(m, "主線車流", 5000), { type: "range", label: "彎道速限", min: 40, max: 110, step: 10, value: 70, unit: "km/h", set: (sim, v) => (z.vmax = v) }],
    };
  },
});

/* ================= 第二批：更多路上狀況 ================= */

/** 一條有好幾個路口的單向街道；回傳每個路口的進口段與路口方塊 */
function street(net, o) {
  const { id, horiz, fixed, dir, from, to, lanes = 2, cross = [], cw = 2 * LW, vmax = 50, name = "街道" } = o;
  const band = lanes * LW;
  const lat = horiz ? (dir > 0 ? fixed : fixed + band) : (dir > 0 ? fixed + band : fixed);
  const h = horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const pt = (u) => (horiz ? [u, lat] : [lat, u]);
  const cs = [...cross].sort((a, b) => (a - b) * dir);
  const mk = (rid, u0, u1, extra = {}) => {
    const [x, y] = pt(u0);
    return net.road(rid, new Pen(x, y, h).line(Math.abs(u1 - u0)).path(), lanes, { vmax, kind: "urban", name, ...extra });
  };
  const roads = [], xs = [];
  let u = from, prev = null;
  cs.forEach((c, i) => {
    const b0 = dir > 0 ? c - 2 : c + cw + 2, b1 = dir > 0 ? c + cw + 2 : c - 2;
    const ap = mk(`${id}s${i}`, u, b0);
    const bx = mk(`${id}b${i}`, b0, b1, { name: "路口" });
    bx.box = true; bx.conflicts = [];
    if (prev) linkAll(net, prev, ap);
    linkAll(net, ap, bx);
    roads.push(ap, bx); xs.push({ c, ap, bx });
    prev = bx; u = b1;
  });
  const last = mk(`${id}s${cs.length}`, u, to, { name: name + "出口" });
  if (prev) linkAll(net, prev, last);
  roads.push(last);
  roads[0].src = { flow: o.flow ?? 500, name: o.srcName || name };
  return { roads, xs, first: roads[0], last, ids: roads.map((r) => r.id) };
}

function crossAt(net, hx, vx, sig, groups = ["H", "V"]) {
  hx.bx.conflicts.push(vx.bx); vx.bx.conflicts.push(hx.bx);
  hx.ap.laneSignal = Array.from({ length: hx.ap.lanes }, () => ({ sig, group: groups[0] }));
  vx.ap.laneSignal = Array.from({ length: vx.ap.lanes }, () => ({ sig, group: groups[1] }));
}

add({
  id: "ambulance", group: "高速公路", name: "救護車要通過",
  desc: "按下「派出救護車」，後面會開來一台鳴笛的救護車。前面的車會往兩邊讓出它的車道。關掉「其他車會讓道」比較救護車要花多少時間才能通過。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 4800, name: "主線" };
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 900, y: 5, w: 300 },
      follow: (sim) => { const e = sim && sim.ems[sim.ems.length - 1]; return e ? { road: e.road, s: e.s } : null; },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "button", label: "🚑 派出救護車", act: (sim) => { m.src.nextType = "ems"; m.src.queue++; } },
        { type: "toggle", label: "其他車會讓道", value: true, set: (sim, on) => (sim.emsYield = on) },
      ],
    };
  },
});

add({
  id: "debris", group: "高速公路", name: "路面掉落物",
  desc: "前車掉下來的貨物擋在車道上，而且要很近才看得到。後面的車只能急煞、急切車道。可以一直按「再掉一個」增加掉落物。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4200, name: "主線" };
    const drop = (sim, lane, s) => {
      for (let tries = 0; tries < 40; tries++) {
        const L = lane ?? Math.floor(Math.random() * 3);
        const s0 = s ?? 1350 + Math.random() * 600;
        const busy = sim && sim.vs.some((v) => v.road === m && (v.lane === L || v.lcFrom === L) && v.s > s0 - 6 && v.s - v.len < s0 + 9);
        if (busy) { s = null; continue; }
        m.blocks.push({ lane: L, s0, s1: s0 + 3, on: true, kind: "debris", warn: 70 });
        return;
      }
    };
    drop(null, 1, 1600);
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1550, y: 5, w: 280 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "button", label: "📦 再掉一個", act: (sim) => drop(sim) },
        { type: "button", label: "🧹 清除全部掉落物", act: () => { m.blocks.length = 0; } },
      ],
    };
  },
});

add({
  id: "glare", group: "高速公路", name: "夕陽強光路段",
  desc: "傍晚往西開，太陽正對著擋風玻璃。駕駛看不清楚，會突然放慢、拉開車距，強光路段的入口就變成瓶頸。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3000, 3, { name: "國道主線" });
    m.src = { flow: 4600, name: "主線" };
    const z = { s0: 1300, s1: 1850, vmax: 70, tmul: 1.5, on: true };
    m.zones.push(z);
    net.deco.push({ type: "glare", road: m, s0: 1300, s1: 1850, zone: z });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1350, y: 5, w: 320 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "toggle", label: "太陽正刺眼", value: true, set: (sim, on) => (z.on = on) },
        { type: "range", label: "強光下車速", min: 40, max: 100, step: 5, value: 70, unit: "km/h", set: (sim, v) => (z.vmax = v) },
      ],
    };
  },
});

add({
  id: "downhill", group: "高速公路", name: "長下坡大貨車限速",
  desc: "長下坡怕煞車過熱，大貨車限速 60。小客車一直要從大貨車旁邊超過，大貨車也會互相超車，佔住兩條車道。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 4200, name: "主線" };
    const z = { s0: 900, s1: 2700, truckVmax: 60, on: true };
    m.zones.push(z);
    net.deco.push({ type: "grade", road: m, s0: 900, s1: 2700, text: "下坡 5%・大貨車限速 60" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1200, y: 5, w: 320 }, truckPct: 0.25,
      controls: [
        flowCtl(m, "主線車流"),
        { type: "range", label: "大貨車限速", min: 40, max: 100, step: 5, value: 60, unit: "km/h", set: (sim, v) => (z.truckVmax = v) },
        { type: "toggle", label: "大貨車只能走外側兩線", value: false, set: (sim, on) => { on ? m.truckBan.add(0) : m.truckBan.delete(0); } },
      ],
    };
  },
});

add({
  id: "chaincrash", group: "高速公路", name: "連環追撞",
  desc: "第一起事故造成回堵，排在車隊最後面的車又被追撞，形成第二個事故點。按「車隊尾端再發生追撞」，看回堵怎麼一段一段往後延伸。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線" });
    m.src = { flow: 4600, name: "主線" };
    m.blocks.push({ lane: 1, s0: 2300, s1: 2325, on: true, kind: "crash", warn: 400 });
    m.zones.push({ s0: 2200, s1: 2400, vmax: 50 });
    const crashTail = (sim) => {
      const q = sim.vs.filter((v) => v.road === m && v.v < 4 && v.s < 2300 && v.s > 300 && v.lcFrom < 0);
      if (!q.length) return;
      const tail = q.reduce((a, b) => (b.s < a.s ? b : a));
      const behind = sim.vs.find((v) => v !== tail && v.road === m && v.lane === tail.lane && v.s < tail.s - tail.len && v.s > tail.s - tail.len - 25);
      const gone = new Set([tail, behind].filter(Boolean));
      const s0 = Math.min(...[...gone].map((v) => v.s - v.len)) - 1;
      sim.vs = sim.vs.filter((v) => !gone.has(v));
      m.blocks.push({ lane: tail.lane, s0, s1: tail.s + 1, on: true, kind: "crash", warn: 150 });
    };
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1900, y: 5, w: 600 },
      controls: [
        flowCtl(m, "主線車流"),
        { type: "button", label: "💥 車隊尾端再發生追撞", act: crashTail },
        { type: "button", label: "🚓 全部事故處理完畢", act: () => { m.blocks.length = 0; m.zones.length = 0; } },
      ],
    };
  },
});

add({
  id: "camera", group: "高速公路", name: "測速照相 vs 區間測速",
  desc: "很多人平常開 110 以上，看到測速照相才急煞，過了又加速，反而製造出小小的幽靈塞車。改成「區間測速」比較看看。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 3200, 3, { name: "國道主線", vmax: 112 });
    m.src = { flow: 4600, name: "主線" };
    const spot = { s0: 1480, s1: 1620, cap: 100, on: true };
    const section = { s0: 700, s1: 2700, cap: 100, on: false };
    m.zones.push(spot, section);
    net.deco.push({ type: "camera", road: m, s: 1600, zone: spot }, { type: "section", road: m, s0: 700, s1: 2700, zone: section });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1450, y: 5, w: 320 }, noise: 0.2,
      controls: [
        flowCtl(m, "主線車流"),
        { type: "select", label: "測速方式", options: ["定點測速照相", "區間測速（整段平均）", "沒有測速"], value: 0,
          set: (sim, i) => { spot.on = i === 0; section.on = i === 1; } },
      ],
    };
  },
});

add({
  id: "ringroad", group: "高速公路", name: "環狀道路（沒有任何瓶頸）",
  desc: "日本做過的著名實驗：一群車在圓形跑道上繞圈，沒有紅綠燈、沒有匝道，只要車子夠多，幾分鐘後就會自己出現走走停停的塞車波，而且會一直往後傳。調整車輛數試試看。",
  build() {
    const net = new Net();
    const R = 60;
    const a = net.road("ringA", new Pen(-R, 0, -Math.PI / 2).arc(R, 180).path(), 1, { center: true, vmax: 50, name: "環狀道路" });
    const b = net.road("ringB", new Pen(R, 0, Math.PI / 2).arc(R, 180).path(), 1, { center: true, vmax: 50, name: "環狀道路" });
    net.link(a, 0, b, 0); net.link(b, 0, a, 0);
    net.finalize();
    const fill = (sim, n) => {
      sim.vs = [];
      const L = a.len + b.len;
      for (let k = 0; k < n; k++) {
        const pos = (k * L) / n + 5;
        const r = pos < a.len ? a : b, s = pos < a.len ? pos : pos - a.len;
        sim.place(r, 0, s, "car", 8);
      }
    };
    return {
      net, main: ["ringA", "ringB"], focus: { x: 0, y: 0, w: 150 }, noise: 0.35, truckPct: 0,
      controls: [
        { type: "range", label: "車輛數（越多越容易塞）", min: 8, max: 50, step: 1, value: 30, unit: "輛", set: (sim, v) => fill(sim, v) },
        { type: "button", label: "🛑 讓一台車踩一下煞車", act: (sim) => { const v = sim.vs[Math.floor(Math.random() * sim.vs.length)]; if (v) v.brakeUntil = sim.t + 2.5; } },
      ],
    };
  },
});

add({
  id: "toll", group: "交流道", name: "收費站 vs ETC",
  desc: "以前國道有收費站，每台車都要停下來繳費，三線道散開成六個收費亭，繳完費又要擠回三線。打開「ETC 計程收費」就不用停，比較兩種的回堵。",
  build() {
    const net = new Net();
    const A = fw(net, "a", 0, 0, 1200, 3, { name: "國道主線" });
    A.src = { flow: 3600, name: "主線" };
    const C = fw(net, "c", 1460, 0, 1200, 3, { name: "收費站後" });
    const mid = A.lat(1), booths = [], boothS = [];
    const service = { dwell: 6, etc: false };
    for (let k = 0; k < 6; k++) {
      const y = mid - 11.25 + k * 4.5, L = Math.floor(k / 2);
      const pa = A.path.at(A.len, A.lat(L)), pc = C.path.at(0, C.lat(L));
      const pen = new Pen(pa.x, pa.y, 0).bezierTo(1290, y, 0, 0.5, 0.5).line(50).bezierTo(pc.x, pc.y, 0, 0.5, 0.5);
      const r = net.road("booth" + k, pen.path(), 1, { center: true, vmax: 40, kind: "ramp", name: "收費亭" });
      const bs = r.len * 0.5;
      r.onEnter = (v) => { if (!service.etc && service.dwell > 0) v.stops = [{ road: r, lane: 0, s: bs, dwell: service.dwell }]; };
      net.link(A, L, r, 0); net.link(r, 0, C, L);
      A.endW[r.id] = 1;
      booths.push(r); boothS.push(bs);
    }
    net.deco.push({ type: "booths", roads: booths, s: boothS });
    net.finalize();
    return {
      net, main: ["a"], focus: { x: 1300, y: 5, w: 340 },
      controls: [
        flowCtl(A, "主線車流"),
        { type: "toggle", label: "ETC 計程收費（不用停）", value: false, set: (sim, on) => (service.etc = on) },
        { type: "range", label: "人工繳費時間", min: 2, max: 15, step: 1, value: 6, unit: "秒", set: (sim, v) => (service.dwell = v) },
      ],
    };
  },
});

add({
  id: "leftramp", group: "交流道", name: "左側入口匝道",
  desc: "少見的設計：匝道從內側（快車道）匯入。剛上來的車速度慢，卻要切進最快的車道，再一路往右換到慢車道，對主線干擾很大。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 4, { name: "國道主線" });
    m.segs[0] = [];
    m.src = { flow: 4300, name: "主線" };
    const on = onRamp(net, m, { id: "on", at: 1300, accel: 250, flow: 800, K: 0, side: -70, name: "左側入口" });
    net.finalize();
    return { net, main: ["m"], focus: { x: 1250, y: -30, w: 420 }, controls: [flowCtl(m, "主線車流"), flowCtl(on, "匝道車流", 2000)] };
  },
});

add({
  id: "closeexits", group: "交流道", name: "連續出口、標示不清",
  desc: "兩個出口只隔 300 公尺，標誌又放得太晚，駕駛很靠近才發現要下交流道，只好在最後一刻急切好幾個車道。把「看到出口標誌的距離」拉長，看看混亂會不會減少。",
  build() {
    const net = new Net();
    const m = fw(net, "m", 0, 0, 2800, 3, { name: "國道主線" });
    m.src = { flow: 4200, name: "主線" };
    m.signDist = 250;
    const o1 = offRamp(net, m, { id: "off1", at: 1500, decel: 150, K: 3, fwd: 200, side: 55, tail: 60, p: 0.15, name: "出口 A" });
    const o2 = offRamp(net, m, { id: "off2", at: 1800, decel: 150, K: 3, fwd: 260, side: 120, tail: 60, p: 0.15, name: "出口 B" });
    net.finalize();
    return {
      net, main: ["m"], focus: { x: 1550, y: 30, w: 380 },
      controls: [
        flowCtl(m, "主線車流"), splitCtl(m, o1, "下出口 A 比例"), splitCtl(m, o2, "下出口 B 比例"),
        { type: "range", label: "看到出口標誌的距離", min: 100, max: 1500, step: 50, value: 250, unit: "公尺", set: (sim, v) => (m.signDist = v) },
      ],
    };
  },
});

add({
  id: "school", group: "市區道路", name: "學校接送時段",
  desc: "放學時間，家長把車停在校門口外側車道等小孩，一台接一台，外側車道整條變成停車場，所有車都擠到內側。",
  build() {
    const net = new Net();
    const r = fw(net, "r", 0, 0, 900, 2, { vmax: 50, kind: "urban", name: "學校前道路" });
    const stopper = { p: 0.2, make: () => [{ road: r, lane: 1, s: 380 + Math.random() * 110, dwell: 20 + Math.random() * 50 }] };
    r.src = { flow: 1100, name: "學校前道路", stopper };
    const sig = net.signal([{ g: ["G"], dur: 40 }, { g: [], dur: 25 }], { yellow: 3, allRed: 2 });
    r.laneSignal = [{ sig, group: "G" }, { sig, group: "G" }];
    net.deco.push({ type: "place", road: r, s: 430, text: "🏫 校門口" });
    net.finalize();
    return {
      net, main: ["r"], focus: { x: 450, y: 4, w: 300 }, truckPct: 0.03,
      controls: [
        flowCtl(r, "車流", 2500, 50),
        { type: "range", label: "臨停接小孩的家長", min: 0, max: 50, step: 5, value: 20, unit: "%", set: (sim, v) => (stopper.p = v / 100) },
      ],
    };
  },
});

add({
  id: "nightmarket", group: "市區道路", name: "夜市路段",
  desc: "夜市旁邊的路，速限低、車子一直靠邊臨停買東西，外側車道幾乎不能走，兩線道實際上只剩一線在動。",
  build() {
    const net = new Net();
    const r = fw(net, "r", 0, 0, 1000, 2, { vmax: 30, kind: "urban", name: "夜市路段" });
    const stopper = { p: 0.3, make: () => [{ road: r, lane: 1, s: 250 + Math.random() * 500, dwell: 15 + Math.random() * 35 }] };
    r.src = { flow: 900, name: "夜市路段", stopper };
    net.deco.push({ type: "market", road: r, s0: 230, s1: 780 });
    net.finalize();
    return {
      net, main: ["r"], focus: { x: 500, y: 4, w: 320 }, truckPct: 0.02, noise: 0.25,
      controls: [
        flowCtl(r, "車流", 2000, 50),
        { type: "range", label: "臨停買東西的車", min: 0, max: 60, step: 5, value: 30, unit: "%", set: (sim, v) => (stopper.p = v / 100) },
      ],
    };
  },
});

add({
  id: "railway", group: "市區道路", name: "鐵路平交道",
  desc: "火車經過時柵欄放下，兩個方向的車都要停下來等。柵欄關越久、班次越密，排隊就越長，而且柵欄打開後要過很久隊伍才消化得完。",
  build() {
    const net = new Net();
    const sig = net.signal([{ g: ["open"], dur: 120 }, { g: [], dur: 70 }], { yellow: 5, allRed: 0 });
    const E = street(net, { id: "e", horiz: true, fixed: 0, dir: 1, from: 0, to: 900, cross: [450], cw: 10, name: "平交道東向", srcName: "往東", flow: 900 });
    const Wd = street(net, { id: "w", horiz: true, fixed: -2 * LW - 1, dir: -1, from: 900, to: 0, cross: [450], cw: 10, name: "平交道西向", srcName: "往西", flow: 900 });
    for (const st of [E, Wd]) st.xs[0].ap.laneSignal = [0, 1].map(() => ({ sig, group: "open" }));
    net.deco.push({ type: "rail", x: 450, w: 10, sig });
    net.finalize();
    return {
      net, main: E.ids, focus: { x: 450, y: 0, w: 380 },
      controls: [
        flowCtl(E.first, "往東車流", 2000, 50), flowCtl(Wd.first, "往西車流", 2000, 50),
        { type: "range", label: "柵欄放下時間", min: 20, max: 180, step: 10, value: 70, unit: "秒", set: (sim, v) => { sig.phases[1].dur = v; sig.recalc(); } },
        { type: "range", label: "柵欄打開時間", min: 30, max: 400, step: 10, value: 120, unit: "秒", set: (sim, v) => { sig.phases[0].dur = v; sig.recalc(); } },
      ],
    };
  },
});

add({
  id: "concert", group: "市區道路", name: "演唱會散場",
  desc: "演唱會結束，停車場一次湧出大量車輛，要擠進外面的大馬路。按「散場！」開始，比較有沒有交管人員指揮（輪流放行）的差別。",
  build() {
    const net = new Net();
    const a1 = fw(net, "a1", 0, 0, 500, 2, { vmax: 50, kind: "urban", name: "大馬路" });
    const a2 = fw(net, "a2", 500, 0, 600, 2, { vmax: 50, kind: "urban", name: "大馬路" });
    a1.src = { flow: 1500, name: "大馬路" };
    linkAll(net, a1, a2);
    const tp = a2.path.at(0, a2.lat(1));
    const ex = net.road("exit", new Pen(380, 230, -Math.PI / 2).line(110).bezierTo(tp.x, tp.y, 0, 0.6, 0.6).path(), 1, { center: true, vmax: 20, kind: "urban", name: "停車場出口" });
    net.link(ex, 0, a2, 1);
    ex.src = { flow: 0, name: "停車場" };
    const down = net.signal([{ g: ["G"], dur: 35 }, { g: [], dur: 25 }], { yellow: 3, allRed: 2 });
    a2.laneSignal = [0, 1].map(() => ({ sig: down, group: "G" }));
    const cop = net.signal([{ g: ["A"], dur: 25 }, { g: ["P"], dur: 20 }], { yellow: 2, allRed: 1 });
    const surge = { left: 0 };
    const setCop = (on) => {
      a1.laneSignal = on ? [0, 1].map(() => ({ sig: cop, group: "A" })) : null;
      ex.laneSignal = on ? [{ sig: cop, group: "P" }] : null;
      ex.yieldEnd = !on;
    };
    net.deco.push({ type: "parking", x: 330, y: 240, w: 100, h: 70, text: "🎤 演唱會停車場" });
    net.finalize();
    return {
      net, main: ["a1", "a2"], focus: { x: 470, y: 60, w: 360 },
      onStep: (sim, dt) => {
        if (surge.left > 0) { surge.left -= dt; ex.src.flow = surge.flow; if (surge.left <= 0) ex.src.flow = 0; }
      },
      controls: [
        flowCtl(a1, "大馬路車流", 2000, 50),
        { type: "range", label: "散場車流", min: 300, max: 2400, step: 100, value: 1500, unit: "輛/時", set: (sim, v) => { surge.flow = v; if (surge.left > 0) ex.src.flow = v; } },
        { type: "button", label: "🎤 散場！（湧出 15 分鐘）", act: () => { surge.left = 900; ex.src.flow = surge.flow; } },
        { type: "toggle", label: "交管人員指揮（輪流放行）", value: false, set: (sim, on) => setCop(on) },
        { type: "range", label: "交管放行停車場秒數", min: 10, max: 60, step: 5, value: 20, unit: "秒", set: (sim, v) => { cop.phases[1].dur = v; cop.recalc(); } },
      ],
    };
  },
});

add({
  id: "closejunction", group: "市區道路", name: "兩個太近的路口",
  desc: "兩個路口只隔 60 公尺。第二個路口紅燈時，排隊回堵到第一個路口，車子停在路口中間，側街綠燈了也過不去。打開「遵守路口淨空」比較。",
  build() {
    const net = new Net();
    const A = street(net, { id: "a", horiz: true, fixed: 0, dir: 1, from: 0, to: 900, cross: [400, 470], name: "主幹道", srcName: "主幹道", flow: 1050 });
    const c1 = street(net, { id: "p", horiz: false, fixed: 400, dir: -1, from: 260, to: -260, cross: [0], name: "側街 1", flow: 450 });
    const c2 = street(net, { id: "q", horiz: false, fixed: 470, dir: 1, from: -260, to: 260, cross: [0], name: "側街 2", flow: 450 });
    const s1 = net.signal([{ g: ["H"], dur: 30 }, { g: ["V"], dur: 25 }], { yellow: 3, allRed: 2 });
    const s2 = net.signal([{ g: ["H"], dur: 20 }, { g: ["V"], dur: 35 }], { yellow: 3, allRed: 2, offset: 18 });
    crossAt(net, A.xs[0], c1.xs[0], s1); crossAt(net, A.xs[1], c2.xs[0], s2);
    const apps = [A.xs[0].ap, A.xs[1].ap, c1.xs[0].ap, c2.xs[0].ap];
    net.finalize();
    return {
      net, main: A.ids, focus: { x: 435, y: 0, w: 300 },
      controls: [
        flowCtl(A.first, "主幹道車流", 2500, 50), flowCtl(c1.first, "側街 1 車流", 1500, 50), flowCtl(c2.first, "側街 2 車流", 1500, 50),
        { type: "toggle", label: "遵守路口淨空（前面沒空間就不進路口）", value: false, set: (sim, on) => apps.forEach((r) => (r.keepClear = on)) },
      ],
    };
  },
});

add({
  id: "grid", group: "市區道路", name: "市中心單行道棋盤",
  desc: "三橫三直的單行道，九個號誌路口。車一多，某個路口被卡住，就會一個傳一個，最後整片動彈不得（交通打結）。試試「遵守路口淨空」和「綠波協調」能不能救回來。",
  build() {
    const net = new Net();
    const P = [0, 220, 440], LEN = 280;
    const H = P.map((y, j) => street(net, { id: "h" + j, horiz: true, fixed: y, dir: j % 2 ? -1 : 1, from: j % 2 ? 440 + LEN : -LEN, to: j % 2 ? -LEN : 440 + LEN, cross: P, name: `橫街 ${j + 1}`, flow: 600 }));
    const V = P.map((x, i) => street(net, { id: "v" + i, horiz: false, fixed: x, dir: i % 2 ? 1 : -1, from: i % 2 ? -LEN : 440 + LEN, to: i % 2 ? 440 + LEN : -LEN, cross: P, name: `直街 ${i + 1}`, flow: 500 }));
    const sigs = [];
    P.forEach((x, i) => P.forEach((y, j) => {
      const sig = net.signal([{ g: ["H"], dur: 25 }, { g: ["V"], dur: 25 }], { yellow: 3, allRed: 2 });
      sig.ij = [i, j];
      sigs.push(sig);
      crossAt(net, H[j].xs.find((q) => q.c === x), V[i].xs.find((q) => q.c === y), sig);
    }));
    const apps = [...H, ...V].flatMap((st) => st.xs.map((q) => q.ap));
    const wave = (on) => sigs.forEach((s) => { const [i, j] = s.ij; s.offset = on ? -((j % 2 ? 2 - i : i) * 220) / (50 * KMH) : ((i * 7 + j * 13) % 6) * 9; });
    wave(false);
    net.finalize();
    return {
      net, main: H[0].ids, focus: { x: 220, y: 220, w: 560 },
      controls: [
        { type: "range", label: "每條橫街車流", min: 0, max: 1500, step: 50, value: 600, unit: "輛/時", set: (sim, v) => H.forEach((st) => (st.first.src.flow = v)) },
        { type: "range", label: "每條直街車流", min: 0, max: 1500, step: 50, value: 500, unit: "輛/時", set: (sim, v) => V.forEach((st) => (st.first.src.flow = v)) },
        { type: "toggle", label: "遵守路口淨空", value: false, set: (sim, on) => apps.forEach((r) => (r.keepClear = on)) },
        { type: "toggle", label: "橫街綠波協調", value: false, set: (sim, on) => wave(on) },
      ],
    };
  },
});

/* 依分組排序（清單才不會重複出現同一個分組標題） */
const ORDER = ["高速公路", "交流道", "交通管理", "市區道路"];
SCENARIOS.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
