// 45 度斜角繪圖：可愛粉彩風。地板批次畫、物件依深度排序、遠景用預先畫好的整棟縮圖。
import * as M from "./map.js";
import { S, rackState, serverState, model } from "./sim.js";

export const TW = 48, TH = 24, ZH = 36;             // 一格 48×24 px；垂直 1 m = 36 px
export const iso = (x, y, z = 0) => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z * ZH];
export const unIso = (sx, sy) => { const a = sx / (TW / 2), b = sy / (TH / 2); return [(a + b) / 2, (b - a) / 2]; };
export const cam = { x: 0, y: 0, z: 1, w: 800, h: 600, dpr: 1 };
export const toScreen = (sx, sy) => [(sx - cam.x) * cam.z + cam.w / 2, (sy - cam.y) * cam.z + cam.h / 2];
export const toIsoPx = (px, py) => [(px - cam.w / 2) / cam.z + cam.x, (py - cam.h / 2) / cam.z + cam.y];
export const screenToTile = (px, py) => unIso(...toIsoPx(px, py));
export const ZMIN = 0.07, ZMAX = 2.6, DETAIL = 0.55;

/* ---------------- 色票（粉彩） ---------------- */
const T = M.T;
const FLOOR = { [T.OUT]: "#dcd7d0", [T.CORR]: "#f7efe3", [T.HALL]: "#eef2fb", [T.PERF]: "#dce8ff", [T.HOT]: "#ffe8e0", [T.OFFICE]: "#fcebd0", [T.ELEC]: "#ede6fb", [T.STORE]: "#f4efe0", [T.DOCK]: "#eae3d3", [T.WALL]: "#c9d1ee", [T.DOOR]: "#ffe1a0", [T.LOBBY]: "#fff2e2", [T.GRASS]: "#c9ebb2" };
const GRID = { [T.HALL]: "#d9e0f1", [T.PERF]: "#bcd1f7", [T.HOT]: "#f8cfc2", [T.OFFICE]: "#f1dbb6", [T.CORR]: "#eadfcd", [T.LOBBY]: "#f5e2c9" };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.round(Math.min(255, r * k)); g = Math.round(Math.min(255, g * k)); b = Math.round(Math.min(255, b * k)); return `rgb(${r},${g},${b})`; };
const pal = (base) => ({ top: shade(base, 1.08), left: shade(base, 0.94), right: shade(base, 0.8), line: shade(base, 0.55) });
export const LED = { ok: "#5be39a", warn: "#ffc85a", fail: "#ffb347", off: "#a7afc2", red: "#ff6f8e", link: "#6fd0ff" };

/* ---------------- 基本形 ---------------- */
let LW = 1;
function poly(ctx, pts, fill, line) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line && LW > 0) { ctx.strokeStyle = line; ctx.lineWidth = LW; ctx.stroke(); }
}
export function box(ctx, x, y, w, d, h, c, z0 = 0) {
  const A = iso(x, y + d, z0), B = iso(x + w, y + d, z0), C = iso(x + w, y, z0);
  const At = iso(x, y + d, z0 + h), Bt = iso(x + w, y + d, z0 + h), Ct = iso(x + w, y, z0 + h), Dt = iso(x, y, z0 + h);
  poly(ctx, [A, B, Bt, At], c.left, c.line);
  poly(ctx, [B, C, Ct, Bt], c.right, c.line);
  poly(ctx, [Dt, Ct, Bt, At], c.top, c.line);
}
/** +y 面（左下那面）上的一個矩形：u 沿 x（0..w），z 高度 */
function faceY(ctx, x, y, u0, u1, z0, z1, fill, line) { poly(ctx, [iso(x + u0, y, z0), iso(x + u1, y, z0), iso(x + u1, y, z1), iso(x + u0, y, z1)], fill, line); }
function faceX(ctx, x, y, v0, v1, z0, z1, fill, line) { poly(ctx, [iso(x, y + v1, z0), iso(x, y + v0, z0), iso(x, y + v0, z1), iso(x, y + v1, z1)], fill, line); }
function dot(ctx, p, r, fill) { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function face(ctx, cx, cy, s, mood = "happy") {
  // 小臉：mood = happy / sad / dizzy
  ctx.fillStyle = "#3b3f5c"; ctx.strokeStyle = "#3b3f5c"; ctx.lineWidth = Math.max(0.6, s * 0.18); ctx.lineCap = "round";
  if (mood === "dizzy") { for (const ex of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + ex * s - s * 0.35, cy - s * 0.35); ctx.lineTo(cx + ex * s + s * 0.35, cy + s * 0.35); ctx.moveTo(cx + ex * s + s * 0.35, cy - s * 0.35); ctx.lineTo(cx + ex * s - s * 0.35, cy + s * 0.35); ctx.stroke(); } }
  else for (const ex of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + ex * s, cy, s * 0.28, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath();
  if (mood === "happy") ctx.arc(cx, cy + s * 0.25, s * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
  else ctx.arc(cx, cy + s * 0.95, s * 0.45, 1.2 * Math.PI, 1.8 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,130,150,.55)"; for (const ex of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + ex * s * 1.7, cy + s * 0.5, s * 0.4, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
}

/* ---------------- 機櫃 ---------------- */
const RACK = pal("#5f6f99"), RACK_IN = "#3a4466";
const MODEL_COL = { C1: "#9fb3e6", C2: "#b2c6f2", S4: "#a6dccf", G4: "#cdb2ef", SW: "#86cfee" };
const uz = (u) => 0.08 + (u - 1) * 0.0445;          // U → 高度（公尺）
function rackShell(ctx, x, y, kind, faceKind, detailed) {
  box(ctx, x, y, 1, 2, 2.0, RACK);
  faceY(ctx, x, y + 2, 0.07, 0.93, 0.06, 1.96, RACK_IN, null);
  if (!detailed) {
    // 遠一點：用機型的條紋代表
    const col = { c1: "#9fb3e6", c2: "#b2c6f2", s4: "#a6dccf", g4: "#cdb2ef", net: "#86cfee" }[kind] || "#9fb3e6";
    const step = { c1: 0.09, c2: 0.13, s4: 0.24, g4: 0.3 }[kind] || 0.1;
    for (let z = 0.15; z < 1.75; z += step) faceY(ctx, x, y + 2, 0.12, 0.88, z, z + step * 0.72, faceKind === "back" ? shade(col, 0.75) : col, null);
    faceY(ctx, x, y + 2, 0.12, 0.88, 1.8, 1.9, "#86cfee", null);
  }
}
const spriteCache = new Map();
function rackSprite(kind, faceKind, scale) {
  const k = `${kind}|${faceKind}|${scale}`;
  if (spriteCache.has(k)) return spriteCache.get(k);
  const ox = 50, oy = 76, w = 76, h = 114;
  const c = document.createElement("canvas"); c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext("2d"); g.scale(scale, scale); g.translate(ox, oy);
  LW = 1; rackShell(g, 0, 0, kind, faceKind, false);
  const out = { c, ox, oy, scale };
  spriteCache.set(k, out); return out;
}
function drawRack(ctx, ob, z) {
  const rk = ob.rack, faceKind = rk.front > 0 ? "front" : "back";
  const nearMe = Math.abs(ob.x + 0.5 - S.player.x) < 6 && Math.abs(ob.y + 1 - S.player.y) < 6;
  if (z < 1.6 || !nearMe) {
    const sp = rackSprite(rk.kind, faceKind, z > 0.8 ? 2 : 1), [sx, sy] = iso(ob.x, ob.y);
    ctx.drawImage(sp.c, sx - sp.ox, sy - sp.oy, sp.c.width / sp.scale, sp.c.height / sp.scale);
    if (z >= 1.0) {
      // 每台機器一顆狀態燈（在它實際的 U 位置）
      const blink = (performance.now() / 400 | 0) % 2, [lx, ly] = iso(ob.x + 0.82, ob.y + 2);
      for (const s of rk.servers) {
        const st = serverState(rk, s); if (st === "ok" && z < 1.25) continue;
        const m = M.MODELS[s.model], zz = (uz(s.u) + uz(s.u + m.u)) / 2;
        ctx.fillStyle = st === "ok" ? LED.ok : st === "off" ? LED.off : st === "warn" ? LED.warn : (blink ? LED.fail : "#fff2c4");
        ctx.fillRect(lx - 1.6, ly - zz * ZH - 1.6, 3.2, 3.2);
      }
    }
  } else {
    rackShell(ctx, ob.x, ob.y, rk.kind, faceKind, true);
    const blink = (performance.now() / 400 | 0) % 2;
    const yy = ob.y + 2;
    for (const s of rk.servers) {
      const m = M.MODELS[s.model], z0 = uz(s.u) + 0.004, z1 = uz(s.u + m.u) - 0.006;
      const st = serverState(rk, s);
      faceY(ctx, ob.x, yy, 0.1, 0.9, z0, z1, faceKind === "back" ? shade(MODEL_COL[s.model], 0.78) : MODEL_COL[s.model], z > 1.6 ? "rgba(40,50,90,.35)" : null);
      const lc = st === "ok" ? LED.ok : st === "off" ? LED.off : st === "warn" ? LED.warn : (blink ? LED.fail : "#fff2c4");
      dot(ctx, iso(ob.x + 0.82, yy, (z0 + z1) / 2), Math.min(2.4, 1.2 + m.u * 0.35), lc);
      if (faceKind === "front" && m.drives && z > 1.6) for (let k = 0; k < Math.min(m.drives, 12); k++) dot(ctx, iso(ob.x + 0.16 + k * 0.045, yy, (z0 + z1) / 2), 0.7, s.faults.drive === k && st !== "ok" ? (blink ? LED.fail : "#fff") : "#59e3a3");
      if ((st === "fail" || st === "off") && z > 1.5) { const p = iso(ob.x + 0.45, yy, (z0 + z1) / 2); face(ctx, p[0], p[1] + 0.5, Math.min(2.6, 1.3 + m.u * 0.4), st === "off" ? "dizzy" : "sad"); }
    }
    for (const u of rk.blanks) faceY(ctx, ob.x, yy, 0.1, 0.9, uz(u) + 0.004, uz(u + 1) - 0.006, "#4e5a80", null);
    if (rk.missing) for (const u of rk.missing) faceY(ctx, ob.x, yy, 0.1, 0.9, uz(u) + 0.004, uz(u + 1) - 0.006, blink ? "#ff8aa5" : "#2b2f45", "#ff8aa5");
  }
}
/** 有問題的機櫃頭上冒一個小泡泡 */
function bubble(ctx, x, y, h, kind, z, t) {
  const bob = Math.sin(t * 4 + x) * 3;
  const [sx, sy] = iso(x, y, h + 0.5);
  const r = 9 / Math.max(0.5, Math.min(1.4, z)) + 4;
  ctx.save(); ctx.translate(sx, sy - r + bob);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.moveTo(-r * 0.3, r * 0.85); ctx.lineTo(0, r * 1.45); ctx.lineTo(r * 0.3, r * 0.85);
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = Math.max(1.2, 2 / z); ctx.strokeStyle = kind === "off" || kind === "p1" ? "#ff6f8e" : kind === "target" ? "#6f9dff" : "#ffb347"; ctx.stroke();
  if (kind === "target") { ctx.fillStyle = "#6f9dff"; ctx.font = `900 ${r * 1.2}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↓", 0, 1); }
  else face(ctx, 0, -r * 0.1, r * 0.28, kind === "off" ? "dizzy" : "sad");
  ctx.restore();
}

/* ---------------- 其他物件 ---------------- */
const C = (b) => pal(b);
const P_ = {
  crah: C("#e3ebf6"), pdu: C("#e4dcf7"), ups: C("#fff0cc"), switchgear: C("#ddd3f5"), battery: C("#cdeedd"), videowall: C("#4b5a82"), desk: C("#f2d3a2"),
  shelf: C("#f7c9a1"), rma: C("#9cc8ff"), pallet: C("#e0c08f"), locker: C("#bfe8da"), toolbench: C("#ffe08a"), bench: C("#d7b68c"), reception: C("#ffd3b0"),
  sofa: C("#ffb7c5"), table: C("#f2d3a2"), vending: C("#ff9eb5"), netrack: C("#5f6f99"), staging: C("#cfd8ef"), workbench: C("#e8d0a8"), forklift: C("#ffd35c"),
  generator: C("#ffdb7a"), tank: C("#eef3fa"), tower: C("#d6ebff"), box: C("#e8c48e"), extinguisher: C("#ff7d8f"), wall: C("#c9d1ee"), plant: C("#ffb38a"),
};
function drawObject(ctx, ob, z, t) {
  const { x, y, w, d, h } = ob;
  switch (ob.kind) {
    case "rack": return drawRack(ctx, ob, z);
    case "crah": {
      const c = ob.crah, bad = c && !c.ok;
      box(ctx, x, y, w, d, h, P_.crah);
      for (let k = 0; k < 4; k++) faceX(ctx, x + w, y, 0.4 + k * 0.85, 0.95 + k * 0.85, 0.25, 1.2, "#c5d3e8", null);
      faceY(ctx, x, y + d, 0.6, 2.4, 1.3, 1.85, bad ? ((t * 3 | 0) % 2 ? "#ff8aa5" : "#ffe1e8") : "#bff0d6", null);
      if (z > 0.7) { const p = iso(x + 1.5, y + d, 1.58); face(ctx, p[0], p[1], 2.6, bad ? "dizzy" : "happy"); }
      if (!bad && z > 0.6) { const p = iso(x + 1.5, y + 2, h + 0.02); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(t * 6); ctx.fillStyle = "#9fb7d9"; for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.ellipse(5, 0, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
      return;
    }
    case "netrack": box(ctx, x, y, w, d, h, P_.netrack); faceY(ctx, x, y + d, 0.08, 0.92, 0.1, 1.95, "#3a4466", null); for (let z0 = 0.2; z0 < 1.9; z0 += 0.12) faceY(ctx, x, y + d, 0.12, 0.88, z0, z0 + 0.06, "#86cfee", null); faceY(ctx, x, y + d, 0.1, 0.9, 1.97, 2.05, "#ffd35c", null); return;
    case "videowall": box(ctx, x, y, w, d, h, P_.videowall); for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { const ok = (i * 7 + j * 3 + (t * 0.5 | 0)) % 9 !== 0; faceY(ctx, x, y + d, 0.3 + i * 1.95, 2.0 + i * 1.95, 0.9 + j * 0.55, 1.38 + j * 0.55, ok ? "#7fe0c4" : "#ff9eb5", null); } return;
    case "desk": box(ctx, x, y, w, d, 0.72, P_.desk); for (let k = 0; k < Math.floor(w / 2.5); k++) box(ctx, x + 0.6 + k * 2.4, y + 0.3, 1.2, 0.15, 0.5, C("#4b5a82"), 0.72); return;
    case "shelf": box(ctx, x, y, w, d, h, { ...P_.shelf, left: "rgba(0,0,0,0)" }); for (const zz of [0.1, 0.8, 1.5]) { box(ctx, x, y, w, d, 0.08, P_.shelf, zz); if (!ob.decor) for (let k = 0; k < Math.floor(w / 1.2); k++) box(ctx, x + 0.2 + k * 1.2, y + 0.4, 0.8, 1.2, 0.4, C(["#9cc8ff", "#ffb7c5", "#bfe8da", "#ffe08a"][(k + Math.round(zz * 3)) % 4]), zz + 0.08); } box(ctx, x, y, w, d, 0.06, P_.shelf, h - 0.06); return;
    case "staging": box(ctx, x, y, w, d, 0.5, P_.staging); for (let k = 0; k < 4; k++) box(ctx, x + 0.4 + k * 2.4, y + 0.3, 2, 1.4, 0.7, C("#e8c48e"), 0.5); return;
    case "box": box(ctx, x + 0.1, y + 0.1, 0.8, 0.8, 0.6, P_.box); faceY(ctx, x + 0.1, y + 0.9, 0.35, 0.45, 0, 0.6, "#c99b5d", null); if (z > 0.8) { const p = iso(x + 0.5, y + 0.9, 0.35); face(ctx, p[0], p[1], 2.2, "happy"); } return;
    case "tree": { const [sx, sy] = iso(x + 0.5, y + 0.5); ctx.fillStyle = "rgba(60,90,40,.18)"; ctx.beginPath(); ctx.ellipse(sx, sy, 22, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#b08560"; ctx.fillRect(sx - 3, sy - 34, 6, 34); for (const [dx, dy, r] of [[0, -62, 22], [-15, -48, 16], [15, -48, 16], [0, -42, 18]]) dot(ctx, [sx + dx, sy + dy], r, "#8fd18a"); dot(ctx, [sx - 6, sy - 70], 7, "#b8e8a8"); return; }
    case "plant": { const [sx, sy] = iso(x + 0.5, y + 0.5); box(ctx, x + 0.25, y + 0.25, 0.5, 0.5, 0.45, P_.plant); for (const [dx, dy, r] of [[0, -34, 10], [-7, -26, 7], [7, -26, 7]]) dot(ctx, [sx + dx, sy + dy], r, "#7ccf8a"); return; }
    case "tank": box(ctx, x, y, w, d, h, P_.tank); faceY(ctx, x, y + d, 1, w - 1, 1.1, 1.5, "#9cc8ff", null); return;
    case "tower": { box(ctx, x, y, w, d, h, P_.tower); const p = iso(x + w / 2, y + d / 2, h); ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, 0.5); dot(ctx, [0, 0], 70, "#a9cdf2"); ctx.rotate(t * 2); ctx.fillStyle = "#7fa9d6"; for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-6, 0, 12, 60); } ctx.restore(); return; }
    case "generator": box(ctx, x, y, w, d, h, P_.generator); for (let k = 0; k < 6; k++) faceY(ctx, x, y + d, 1 + k * 2, 2.2 + k * 2, 0.6, 2.2, "#f5c85c", null); if (z > 0.3) { const p = iso(x + w / 2, y + d, 2.5); face(ctx, p[0], p[1], 3, "happy"); } return;
    case "ups": box(ctx, x, y, w, d, h, P_.ups); faceY(ctx, x, y + d, 0.6, 2, 1.3, 1.7, "#7fe0c4", null); return;
    case "battery": box(ctx, x, y, w, d, h, P_.battery); for (let k = 0; k < w; k += 2) for (const zz of [0.4, 0.9, 1.4]) faceY(ctx, x, y + d, k + 0.3, k + 1.6, zz - 0.3, zz, "#5f6f99", null); return;
    case "switchgear": box(ctx, x, y, w, d, h, P_.switchgear); for (let k = 0; k < w; k += 2) faceY(ctx, x, y + d, k + 0.2, k + 1.8, 0.3, 1.9, "#cfc3ef", P_.switchgear.line); return;
    case "pdu": box(ctx, x, y, w, d, h, P_.pdu); faceY(ctx, x, y + d, 0.5, 2.5, 1.2, 1.6, "#bff0d6", null); return;
    case "locker": box(ctx, x, y, w, d, h, P_.locker); for (let k = 0; k < w; k += 1) faceY(ctx, x, y + d, k + 0.05, k + 0.95, 0.1, 1.9, "#d8f4ea", P_.locker.line); return;
    case "toolbench": box(ctx, x, y, w, d, h, P_.toolbench); for (let k = 0; k < 4; k++) box(ctx, x + 0.5 + k * 1.4, y + 0.6, 0.8, 0.6, 0.15, C(["#ff7d8f", "#9cc8ff", "#7fe0c4", "#cdb2ef"][k]), h); return;
    case "extinguisher": box(ctx, x + 0.35, y + 0.35, 0.3, 0.3, 0.7, P_.extinguisher); return;
    case "forklift": box(ctx, x, y, w, d, 1.0, P_.forklift); box(ctx, x, y, 0.2, d, 2.2, C("#8a8fa8")); return;
    case "sofa": box(ctx, x, y, w, d, 0.45, P_.sofa); box(ctx, x, y, w, 0.5, 0.9, P_.sofa); return;
    case "vending": box(ctx, x, y, w, d, h, P_.vending); faceY(ctx, x, y + d, 0.3, 1.5, 0.9, 1.7, "#fff4c2", null); return;
    case "rma": box(ctx, x, y, w, d, h, P_.rma); if (z > 0.5) { const p = iso(x + w / 2, y + d, 0.55); face(ctx, p[0], p[1], 3, "happy"); } return;
    default: box(ctx, x, y, w, d, h, P_[ob.kind] || C("#dfe3ee"));
  }
}

/* ---------------- 人物（Q 版） ---------------- */
export function drawPerson(ctx, px, py, o, z) {
  const [sx, sy] = iso(px, py);
  const k = 1;
  const walk = o.moving ? Math.sin(o.walkT * 14) : 0;
  const back = o.dir === 2 || o.dir === 3, flip = o.dir === 1 || o.dir === 2 ? -1 : 1;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(flip * k, k);
  ctx.fillStyle = "rgba(40,50,90,.18)"; ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  const line = "#3b3f5c"; ctx.lineWidth = 1.3; ctx.strokeStyle = line; ctx.lineJoin = "round";
  // 腳
  ctx.fillStyle = o.pants || "#5a6a9c";
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 4 - 3, -11 + (s * walk * 2.5), 6, 10, 3); ctx.fill(); ctx.stroke(); }
  // 身體
  const bob = Math.abs(walk) * 1.5;
  ctx.fillStyle = o.shirt || "#7fb2ff"; ctx.beginPath(); ctx.roundRect(-9, -27 - bob, 18, 18, 7); ctx.fill(); ctx.stroke();
  if (!back) { ctx.fillStyle = "#fff"; ctx.fillRect(2, -22 - bob, 5, 3.5); }
  // 手
  for (const s of [-1, 1]) { ctx.fillStyle = o.shirt || "#7fb2ff"; ctx.beginPath(); ctx.roundRect(s * 9 - 2.5 + (s < 0 ? -1 : 0), -25 - bob + s * walk * 2, 5, 11, 2.5); ctx.fill(); ctx.stroke(); if (o.esd && s > 0) { ctx.fillStyle = "#ff6f8e"; ctx.fillRect(s * 9 - 2.5, -16 - bob + s * walk * 2, 5, 2.4); } }
  // 頭（大頭）
  const hy = -40 - bob;
  ctx.fillStyle = o.skin || "#ffe2cc"; ctx.beginPath(); ctx.arc(0, hy, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = o.hair || "#5a4033";
  ctx.beginPath(); if (back) ctx.arc(0, hy, 13, Math.PI * 0.9, Math.PI * 2.1); else ctx.arc(0, hy - 1, 13, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (back) { ctx.beginPath(); ctx.arc(0, hy + 2, 12, 0, Math.PI); ctx.fill(); }
  if (o.cap) { ctx.fillStyle = o.cap; ctx.beginPath(); ctx.arc(0, hy - 4, 13.5, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke(); if (!back) { ctx.fillRect(2, hy - 5, 13, 3); } }
  if (!back) {
    ctx.fillStyle = line;
    for (const ex of [-4.5, 5.5]) { ctx.beginPath(); ctx.ellipse(ex + 2, hy + 1, 1.7, 2.3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(255,130,150,.6)"; for (const ex of [-7, 9]) { ctx.beginPath(); ctx.ellipse(ex + 1, hy + 5, 2.6, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(2.5, hy + 4.5, 2, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    if (o.glasses) { ctx.beginPath(); ctx.arc(-2.5, hy + 1, 3.6, 0, Math.PI * 2); ctx.arc(7.5, hy + 1, 3.6, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
  if (o.name && z > 0.45) {
    const [qx, qy] = [sx, sy - 66];
    ctx.save(); ctx.font = "700 11px 'Noto Sans TC', system-ui"; const w = ctx.measureText(o.name).width + 12;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.roundRect(qx - w / 2, qy - 9, w, 17, 8); ctx.fill(); ctx.fillStyle = "#4b5a82"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.name, qx, qy); ctx.restore();
  }
}

/* ---------------- 整棟縮圖（遠景） ---------------- */
const OV = 0.3;
let overview = null, ovOrigin = [0, 0];
export function buildOverview() {
  const [x0] = iso(0, M.H), [x1] = iso(M.W, 0), [, y1] = iso(M.W, M.H);
  const y0 = -5 * ZH;
  const c = document.createElement("canvas"); c.width = Math.ceil((x1 - x0) * OV); c.height = Math.ceil((y1 - y0) * OV);
  const g = c.getContext("2d"); g.scale(OV, OV); g.translate(-x0, -y0);
  ovOrigin = [x0, y0];
  LW = 0;
  drawFloor(g, 0, 0, M.W - 1, M.H - 1, 0.3);
  const list = M.objects.filter((o) => !o.removed && o.kind !== "box").sort((a, b) => depth(a) - depth(b));
  for (const ob of list) drawObject(g, ob, 0.3, 0);
  overview = c;
  return c;
}
const depth = (ob) => ob.x + ob.w + ob.y + ob.d - Math.min(ob.w, ob.d) * 0.5;

/* ---------------- 地板（批次） ---------------- */
function drawFloor(ctx, xa, ya, xb, yb, z) {
  // 同一列、同一種地板連在一起的格子合併成一條（一個四邊形），路徑數少很多
  const runs = new Map(), cols = new Map();
  const push = (m, t, v) => { let a = m.get(t); if (!a) m.set(t, (a = [])); a.push(...v); };
  for (let y = ya; y <= yb; y++) {
    let x = xa;
    while (x <= xb) {
      const t = M.tiles[M.idx(x, y)]; let e = x;
      while (e + 1 <= xb && M.tiles[M.idx(e + 1, y)] === t) e++;
      if (t !== T.WALL) push(runs, t, [x, e, y]);
      x = e + 1;
    }
  }
  const hw = TW / 2, hh = TH / 2;
  for (const [t, arr] of runs) {
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 3) {
      const a = arr[i], e = arr[i + 1] + 1, y = arr[i + 2];
      ctx.moveTo((a - y) * hw, (a + y) * hh); ctx.lineTo((e - y) * hw, (e + y) * hh); ctx.lineTo((e - y - 1) * hw, (e + y + 1) * hh); ctx.lineTo((a - y - 1) * hw, (a + y + 1) * hh); ctx.closePath();
    }
    ctx.fillStyle = FLOOR[t]; ctx.fill();
    if (z >= 0.85 && GRID[t]) {
      // 格線：沿 x 的線用列的上緣，沿 y 的線每格一條短線
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) {
        const a = arr[i], e = arr[i + 1] + 1, y = arr[i + 2];
        ctx.moveTo((a - y) * hw, (a + y) * hh); ctx.lineTo((e - y) * hw, (e + y) * hh);
        for (let x = a; x <= e; x++) { ctx.moveTo((x - y) * hw, (x + y) * hh); ctx.lineTo((x - y - 1) * hw, (x + y + 1) * hh); }
      }
      ctx.strokeStyle = GRID[t]; ctx.lineWidth = 1 / z; ctx.stroke();
    }
    if (t === T.PERF && z >= 1.0) { ctx.fillStyle = "#a8c2f2"; ctx.beginPath(); for (let i = 0; i < arr.length; i += 3) for (let x = arr[i]; x <= arr[i + 1]; x++) { const y = arr[i + 2], sx = (x - y) * hw, sy = (x + y) * hh + hh; for (const [dx, dy] of [[-8, 0], [8, 0], [0, -4], [0, 4]]) ctx.rect(sx + dx - 1.4, sy + dy - 1, 2.8, 2); } ctx.fill(); }
    if (t === T.DOCK && z >= 0.6) { ctx.strokeStyle = "#ffd35c"; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < arr.length; i += 3) for (let x = arr[i]; x <= arr[i + 1]; x++) if (x % 6 === 0) { const y = arr[i + 2], sx = (x - y) * hw, sy = (x + y) * hh; ctx.moveTo(sx, sy); ctx.lineTo(sx - hw, sy + hh); } ctx.stroke(); }
  }
  // 矮牆（剖面式）：同樣合併成條，先畫側面，再畫頂面
  const WH = 0.45, wc = P_.wall, zh = WH * ZH;
  const isW = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H && M.tiles[M.idx(x, y)] === T.WALL;
  const tops = [], lefts = [], rights = [];
  for (let y = ya; y <= yb; y++) {
    let x = xa;
    while (x <= xb) {
      if (!isW(x, y)) { x++; continue; }
      let e = x; while (e + 1 <= xb && isW(e + 1, y)) e++;
      tops.push(x, e, y);
      // 下緣露出的側面：這一列中下面不是牆的段落
      let k = x; while (k <= e) { if (isW(k, y + 1)) { k++; continue; } let f = k; while (f + 1 <= e && !isW(f + 1, y + 1)) f++; lefts.push(k, f, y); k = f + 1; }
      if (!isW(e + 1, y)) rights.push(e, y);
      x = e + 1;
    }
  }
  ctx.beginPath(); for (let i = 0; i < lefts.length; i += 3) { const a = lefts[i], e = lefts[i + 1] + 1, y = lefts[i + 2] + 1; ctx.moveTo((a - y) * hw, (a + y) * hh); ctx.lineTo((e - y) * hw, (e + y) * hh); ctx.lineTo((e - y) * hw, (e + y) * hh - zh); ctx.lineTo((a - y) * hw, (a + y) * hh - zh); ctx.closePath(); } ctx.fillStyle = wc.left; ctx.fill();
  ctx.beginPath(); for (let i = 0; i < rights.length; i += 2) { const x = rights[i] + 1, y = rights[i + 1]; ctx.moveTo((x - y - 1) * hw, (x + y + 1) * hh); ctx.lineTo((x - y) * hw, (x + y) * hh); ctx.lineTo((x - y) * hw, (x + y) * hh - zh); ctx.lineTo((x - y - 1) * hw, (x + y + 1) * hh - zh); ctx.closePath(); } ctx.fillStyle = wc.right; ctx.fill();
  ctx.beginPath(); for (let i = 0; i < tops.length; i += 3) { const a = tops[i], e = tops[i + 1] + 1, y = tops[i + 2]; ctx.moveTo((a - y) * hw, (a + y) * hh - zh); ctx.lineTo((e - y) * hw, (e + y) * hh - zh); ctx.lineTo((e - y - 1) * hw, (e + y + 1) * hh - zh); ctx.lineTo((a - y - 1) * hw, (a + y + 1) * hh - zh); ctx.closePath(); } ctx.fillStyle = wc.top; ctx.fill();
}

/* ---------------- 溫度熱圖 ---------------- */
const HEAT = ["#6fa8ff", "#7fc8ff", "#86e3d0", "#a8ec95", "#e8ef7a", "#ffd166", "#ffa45c", "#ff7a6b", "#ff5c8a"];
export const heatColor = (t) => HEAT[Math.max(0, Math.min(HEAT.length - 1, Math.floor((t - 20) / 1.6)))];
function drawHeat(ctx, xa, ya, xb, yb, step) {
  const buckets = HEAT.map(() => []);
  for (const L of ["A", "B", "C", "D"]) {
    const h = M.halls[L];
    for (let y = Math.max(ya, h.y0); y <= Math.min(yb, h.y1); y += step) for (let x = Math.max(xa, h.x0); x <= Math.min(xb, h.x1); x += step) {
      const v = L === "A" ? S.temp[(y - h.y0) * 100 + (x - h.x0)] : 21.5 + Math.sin(x * 0.3) * 0.6 + Math.cos(y * 0.4) * 0.6;
      buckets[Math.max(0, Math.min(HEAT.length - 1, Math.floor((v - 20) / 1.6)))].push(x, y);
    }
  }
  ctx.globalAlpha = 0.5;
  const hw = TW / 2, hh = TH / 2;
  buckets.forEach((arr, k) => {
    if (!arr.length) return;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 2) { const x = arr[i], y = arr[i + 1], sx = (x - y) * hw, sy = (x + y) * hh; ctx.moveTo(sx, sy); ctx.lineTo(sx + hw * step, sy + hh * step); ctx.lineTo(sx, sy + TH * step); ctx.lineTo(sx - hw * step, sy + hh * step); ctx.closePath(); }
    ctx.fillStyle = HEAT[k]; ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/* ---------------- 一幀 ---------------- */
export const view = { visible: [], heat: false, hover: null, highlight: null, marker: null };
function visibleTiles(margin = 2) {
  const cs = [[0, 0], [cam.w, 0], [0, cam.h], [cam.w, cam.h]].map(([a, b]) => screenToTile(a, b));
  const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
  return [Math.max(0, Math.floor(Math.min(...xs)) - margin), Math.max(0, Math.floor(Math.min(...ys)) - margin), Math.min(M.W - 1, Math.ceil(Math.max(...xs)) + margin), Math.min(M.H - 1, Math.ceil(Math.max(...ys)) + margin)];
}
export function render(ctx, t, people) {
  const z = cam.z, dpr = cam.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#c9ebb2"; ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cam.w / 2 - cam.x * z), dpr * (cam.h / 2 - cam.y * z));
  const [xa, ya, xb, yb] = visibleTiles(2);
  const vis = [];
  if (z < DETAIL && overview) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(overview, ovOrigin[0], ovOrigin[1], overview.width / OV, overview.height / OV);
    if (view.heat) drawHeat(ctx, xa, ya, xb, yb, z < 0.2 ? 4 : 2);
    for (const b of S.boxes) if (!b.removed) drawObject(ctx, b, z, t);
  } else {
    LW = z > 0.8 ? 1.1 / z * Math.min(1.6, z) : 0;
    drawFloor(ctx, xa, ya, xb, yb, z);
    if (view.heat) drawHeat(ctx, xa, ya, xb, yb, 1);
    // 物件：往上多抓幾格（高的東西會伸進畫面）
    const seen = new Set();
    for (let y = Math.max(0, ya); y <= Math.min(M.H - 1, yb + 8); y++) for (let x = Math.max(0, xa); x <= Math.min(M.W - 1, xb + 8); x++) {
      const id = M.objAt[M.idx(x, y)]; if (id < 0 || seen.has(id)) continue; seen.add(id);
      const ob = M.objects[id]; if (ob.removed) continue;
      vis.push({ ob, d: depth(ob) });
    }
  }
  // 路線虛線、目的地圈圈
  const p = S.player;
  if (p.path.length) {
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = "rgba(111,157,255,.8)"; ctx.lineWidth = Math.max(2, 2.5 / z); ctx.beginPath();
    let q = iso(p.x, p.y); ctx.moveTo(q[0], q[1]); for (const n of p.path) { q = iso(n.x + 0.5, n.y + 0.5); ctx.lineTo(q[0], q[1]); } ctx.stroke(); ctx.setLineDash([]);
    const last = p.path[p.path.length - 1], m = iso(last.x + 0.5, last.y + 0.5);
    ctx.strokeStyle = "#6f9dff"; ctx.lineWidth = Math.max(2, 2 / z); ctx.beginPath(); ctx.ellipse(m[0], m[1], 14 + Math.sin(t * 6) * 3, 7 + Math.sin(t * 6) * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (z >= DETAIL) {
    for (const pp of people) vis.push({ person: pp, d: pp.x + pp.y + 0.2 });
    vis.sort((a, b) => a.d - b.d);
    const [psx, psy] = iso(p.x, p.y, 0.8);
    const pd = p.x + p.y + 0.2;
    for (const v of vis) {
      if (v.person) { LW = 1; drawPerson(ctx, v.person.x, v.person.y, v.person, z); LW = z > 0.8 ? 1.1 / z * Math.min(1.6, z) : 0; continue; }
      const ob = v.ob;
      let fade = false;
      if (v.d > pd && ob.kind !== "tree") { const [ax] = iso(ob.x, ob.y + ob.d), [bx] = iso(ob.x + ob.w, ob.y), [, ty] = iso(ob.x, ob.y, ob.h), [, by] = iso(ob.x + ob.w, ob.y + ob.d); if (psx > ax - 4 && psx < bx + 4 && psy > ty - 30 && psy < by) fade = true; }
      if (fade) ctx.globalAlpha = 0.32;
      drawObject(ctx, ob, z, t);
      if (fade) ctx.globalAlpha = 1;
      if (view.hover === ob || view.highlight === ob) outline(ctx, ob, view.highlight === ob ? `rgba(111,157,255,${0.6 + Math.sin(t * 6) * 0.35})` : "rgba(255,255,255,.95)", z);
    }
  } else {
    // 遠景：人物畫成小圖示
    for (const pp of people) { const [sx, sy] = iso(pp.x, pp.y); dot(ctx, [sx, sy - 8 / z], (pp === S.player ? 7 : 4.5) / z, pp === S.player ? "#6f9dff" : pp.shirt || "#999"); if (pp === S.player) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5 / z; ctx.beginPath(); ctx.arc(sx, sy - 8 / z, 7 / z, 0, Math.PI * 2); ctx.stroke(); } }
    if (view.highlight) outline(ctx, view.highlight, `rgba(111,157,255,${0.6 + Math.sin(t * 6) * 0.35})`, z);
  }
  // 泡泡：有工單或有故障的機櫃、停機的空調、目標
  const marks = [];
  for (const tk of S.tickets) if (tk.state === "open") { const ob = tk.crah ? tk.crah.ob : tk.box && !tk.box.removed ? tk.box : tk.rack ? tk.rack.ob : null; if (ob) marks.push([ob, tk.prio === 1 ? "p1" : tk.rack && rackState(tk.rack) === "off" ? "off" : "fail"]); }
  if (z > 0.25) for (const L of ["B", "C", "D"]) for (const rk of M.halls[L].racks) if (rk.amb && rk.ob.x >= xa - 8 && rk.ob.x <= xb + 8 && rk.ob.y >= ya - 8 && rk.ob.y <= yb + 8) marks.push([rk.ob, "amb"]);
  for (const [ob, k] of marks) {
    if (k === "amb") { const [sx, sy] = iso(ob.x + 0.5, ob.y + 1, ob.h + 0.3); dot(ctx, [sx, sy], 3 / Math.min(1, z), (t * 2 | 0) % 2 ? "#ffb347" : "#ffe3a3"); continue; }
    bubble(ctx, ob.x + ob.w / 2, ob.y + ob.d / 2, ob.h, k, z, t);
  }
  if (view.highlight && view.highlight !== view.hoverTarget) bubble(ctx, view.highlight.x + view.highlight.w / 2, view.highlight.y + view.highlight.d / 2, view.highlight.h + 0.9, "target", z, t);
  if (view.marker) { const m = iso(view.marker.x + 0.5, view.marker.y + 0.5); ctx.strokeStyle = "#ff8aa5"; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.ellipse(m[0], m[1], 12, 6, 0, 0, Math.PI * 2); ctx.stroke(); }
  view.visible = vis;
  // 房間名稱（螢幕座標）
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (z < 1.5) for (const r of M.rooms) {
    if (r.kind === "corr") continue;
    const [sx, sy] = toScreen(...iso((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2));
    if (sx < -100 || sy < -40 || sx > cam.w + 100 || sy > cam.h + 40) continue;
    const big = r.kind === "hall";
    if (!big && z < 0.18) continue;
    ctx.font = `800 ${big ? (z < 0.3 ? 15 : 13) : 12}px 'Noto Sans TC', system-ui`;
    const w = ctx.measureText(r.name).width + 16;
    ctx.globalAlpha = z > 0.9 ? 0.75 : 0.95;
    ctx.fillStyle = big ? "#6f7fd0" : "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 11, w, 22, 11); ctx.fill();
    ctx.fillStyle = big ? "#fff" : "#5a6390"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(r.name, sx, sy + 1);
    ctx.globalAlpha = 1;
  }
  if (z >= 0.8) {
    ctx.font = "800 11px 'Noto Sans TC', system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const L of ["A", "B", "C", "D"]) for (let r = 0; r < M.ROWS; r++) {
      const rk = M.halls[L].racks[r * 60]; const [sx, sy] = toScreen(...iso(rk.ob.x - 1.2, rk.ob.y + 1));
      if (sx < -40 || sy < -20 || sx > cam.w + 40 || sy > cam.h + 20) continue;
      ctx.fillStyle = "#ffd35c"; ctx.beginPath(); ctx.roundRect(sx - 15, sy - 9, 30, 18, 9); ctx.fill(); ctx.fillStyle = "#5a4a1a"; ctx.fillText(`${L}${String(r + 1).padStart(2, "0")}`, sx, sy + 1);
    }
  }
}
function outline(ctx, ob, color, z) {
  const { x, y, w, d, h } = ob;
  const pts = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x, y + d, 0), iso(x, y + d, h)];
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(2.5, 3 / z); ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.stroke(); ctx.restore();
}
/** 點擊判定：最上層（最前面）的物件 */
export function pick(px, py) {
  const [ix, iy] = toIsoPx(px, py);
  let best = null;
  const list = cam.z >= DETAIL ? view.visible.filter((v) => v.ob) : [];
  if (cam.z < DETAIL) {
    const [tx, ty] = unIso(ix, iy);
    for (let y = Math.floor(ty) - 4; y <= Math.floor(ty) + 6; y++) for (let x = Math.floor(tx) - 4; x <= Math.floor(tx) + 6; x++) { if (!M.inMap(x, y)) continue; const id = M.objAt[M.idx(x, y)]; if (id >= 0) list.push({ ob: M.objects[id], d: depth(M.objects[id]) }); }
  }
  for (const v of list) {
    const { x, y, w, d, h } = v.ob; if (v.ob.removed || v.ob.kind === "tree" || v.ob.kind === "plant") continue;
    const pts = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x, y + d, 0), iso(x, y + d, h)];
    if (inside(ix, iy, pts) && (!best || v.d > best.d)) best = v;
  }
  return best ? best.ob : null;
}
function inside(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

/* 效能量測用 */
export function _floor(g) { const [xa, ya, xb, yb] = visibleTiles(2); drawFloor(g, xa, ya, xb, yb, cam.z); }
export function _objs(g) { const [xa, ya, xb, yb] = visibleTiles(2); const seen = new Set(); let n = 0; for (let y = ya; y <= Math.min(M.H - 1, yb + 8); y++) for (let x = xa; x <= Math.min(M.W - 1, xb + 8); x++) { const id = M.objAt[M.idx(x, y)]; if (id < 0 || seen.has(id)) continue; seen.add(id); drawObject(g, M.objects[id], cam.z, 0); n++; } return n; }
