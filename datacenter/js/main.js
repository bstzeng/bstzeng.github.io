// 機房日常：主程式（鏡頭、輸入、介面、迴圈、測試介面）
import * as M from "./map.js";
import * as G from "./sim.js";
import * as R from "./render.js";
import * as UI from "./panel.js";
import { findPath, reachable } from "./path.js";
const { S } = G;
const { cam } = R;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");

/* ---------------- 畫布 ---------------- */
const cv = $("#c"), ctx = cv.getContext("2d");
function resize() {
  cam.dpr = Math.min(devicePixelRatio || 1, 2);
  cam.w = innerWidth; cam.h = innerHeight;
  cv.width = Math.round(cam.w * cam.dpr); cv.height = Math.round(cam.h * cam.dpr);
  cv.style.width = cam.w + "px"; cv.style.height = cam.h + "px";
}
addEventListener("resize", resize); resize();

/* ---------------- NPC ---------------- */
const npcs = [
  { name: "阿哲", shirt: "#8fd6a8", hair: "#3b2a22", glasses: true, x: 231.5, y: 27.5, zone: "noc", path: [], moving: false, walkT: 0, dir: 0, wait: 2 },
  { name: "保全大叔", shirt: "#5a6a9c", hair: "#777", cap: "#3d4a78", x: 272.5, y: 89.5, zone: "lobby", path: [], moving: false, walkT: 0, dir: 1, wait: 4 },
  { name: "清潔阿姨", shirt: "#ffb7c5", hair: "#2b2b2b", x: 220.5, y: 68.5, zone: "corr", path: [], moving: false, walkT: 0, dir: 0, wait: 1 },
  { name: "小芸", shirt: "#ffd35c", hair: "#6b3b2b", x: 150.5, y: 40.5, zone: "hallB", path: [], moving: false, walkT: 0, dir: 2, wait: 3 },
];
const ZONES = { noc: [218, 8, 244, 30], lobby: [255, 77, 293, 102], corr: [6, 66, 250, 71], hallB: [108, 6, 204, 60] };
const nrand = M.rng(5);
function stepNPC(n, dt) {
  if (!n.path.length) {
    n.moving = false; n.wait -= dt;
    if (n.wait <= 0) { const z = ZONES[n.zone]; for (let k = 0; k < 10; k++) { const x = Math.floor(z[0] + nrand() * (z[2] - z[0])), y = Math.floor(z[1] + nrand() * (z[3] - z[1])); if (M.walkable(x, y)) { n.path = findPath(Math.floor(n.x), Math.floor(n.y), x, y, 20000) || []; break; } } n.wait = 2 + nrand() * 5; }
    return;
  }
  let left = 3.5 * dt;
  while (left > 0 && n.path.length) {
    const t = n.path[0], tx = t.x + 0.5, ty = t.y + 0.5, dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy);
    if (d > 1e-4) n.dir = dx > 0.1 ? (dy < -0.1 ? 3 : 0) : dx < -0.1 ? (dy > 0.1 ? 1 : 2) : dy > 0 ? 1 : 3;
    if (d <= left) { n.x = tx; n.y = ty; left -= d; n.path.shift(); } else { n.x += (dx / d) * left; n.y += (dy / d) * left; left = 0; }
  }
  n.moving = true; n.walkT += dt;
}

/* ---------------- 鏡頭 ---------------- */
const camState = { follow: true, hold: 0, fly: null, tx: 0, ty: 0, tz: 1 };
function centerOn(x, y, z) { const [sx, sy] = R.iso(x, y); cam.x = sx; cam.y = sy - 20; if (z) cam.z = z; }
function playerIso() { const [sx, sy] = R.iso(S.player.x, S.player.y); return [sx, sy - 30]; }
function setFollow(v) { camState.follow = v; camState.hold = 0; $("#bFollow").classList.toggle("on", v); $("#bFollow").textContent = v ? "🎯 跟隨：開" : "🎯 跟隨：關"; $("#bBack").hidden = true; }
function zoomAt(f, px = cam.w / 2, py = cam.h / 2) {
  const [ix, iy] = R.toIsoPx(px, py);
  const nz = Math.max(R.ZMIN, Math.min(R.ZMAX, cam.z * f));
  cam.z = nz;
  // 讓滑鼠下的那點不動（跟隨時以維修員為中心）
  if (!(camState.follow && !camState.hold)) { cam.x = ix - (px - cam.w / 2) / nz; cam.y = iy - (py - cam.h / 2) / nz; }
  $("#zoomv").textContent = cam.z >= 1.15 ? "特寫" : cam.z >= R.DETAIL ? "機房" : cam.z >= 0.2 ? "樓層" : "全棟";
}
function flyTo(x, y, z) { const [sx, sy] = R.iso(x, y); camState.fly = { x: sx, y: sy, z: z ?? Math.max(cam.z, 0.8) }; if (camState.follow) { camState.hold = 6; $("#bBack").hidden = false; } }
function updateCamera(dt) {
  if (camState.hold > 0) { camState.hold -= dt; if (camState.hold <= 0) { camState.hold = 0; $("#bBack").hidden = true; } }
  if (camState.fly) {
    const f = camState.fly, k = Math.min(1, dt * 5);
    cam.x += (f.x - cam.x) * k; cam.y += (f.y - cam.y) * k; cam.z += (f.z - cam.z) * k;
    if (Math.hypot(f.x - cam.x, f.y - cam.y) < 2 && Math.abs(f.z - cam.z) < 0.01) camState.fly = null;
    return;
  }
  if (camState.follow && !camState.hold) { const [px, py] = playerIso(); const k = Math.min(1, dt * 6); cam.x += (px - cam.x) * k; cam.y += (py - cam.y) * k; }
  // 鍵盤平移
  const sp = 900 / cam.z * dt;
  let mx = 0, my = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= sp; if (keys.has("KeyD") || keys.has("ArrowRight")) mx += sp;
  if (keys.has("KeyW") || keys.has("ArrowUp")) my -= sp; if (keys.has("KeyS") || keys.has("ArrowDown")) my += sp;
  if (mx || my) { cam.x += mx; cam.y += my; if (camState.follow) { camState.hold = 5; $("#bBack").hidden = false; } }
}

/* ---------------- 輸入 ---------------- */
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  keys.add(e.code);
  if (e.code === "KeyF") setFollow(!camState.follow);
  if (e.code === "KeyH") toggleHeat();
  if (e.code === "Equal" || e.code === "NumpadAdd") zoomAt(1.25);
  if (e.code === "Minus" || e.code === "NumpadSubtract") zoomAt(0.8);
  if (e.code === "Escape") UI.close();
  if (e.code === "Space") { togglePause(); e.preventDefault(); }
  if (e.code === "KeyR") { S.player.run = !S.player.run; $("#bRun").classList.toggle("on", S.player.run); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
const ptrs = new Map();
let drag = null, pinch = null;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const nz = pinch.z * d / pinch.d; zoomAt(nz / cam.z, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.moved = true;
    if (drag.moved) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; camState.fly = null; if (camState.follow) { camState.hold = 5; $("#bBack").hidden = false; } }
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (e.pointerType === "mouse") { R.view.hover = R.pick(e.clientX, e.clientY); cv.style.cursor = R.view.hover ? "pointer" : "default"; }
});
const up = (e) => {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (drag && !drag.moved) click(e.clientX, e.clientY);
  drag = null;
};
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });

/** 點物件：走過去再操作；點地板：走過去 */
function click(px, py) {
  if (S.over) return;
  const ob = R.pick(px, py);
  if (ob) return interact(ob);
  const [tx, ty] = R.screenToTile(px, py);
  const n = M.nearestWalkable(tx, ty, 6);
  if (!n) return;
  UI.close();
  S.player.target = null;
  if (G.walkTo(n.x, n.y)) R.view.marker = null; else G.toast("走不過去耶", "warn");
}
export function interact(ob, side) {
  const p = S.player;
  if (ob.kind === "rack") {
    const rack = ob.rack;
    const tk = S.tickets.find((t) => t.state === "open" && t.rack === rack);
    side = side || (tk && ["psu", "link", "breaker"].includes(tk.type) ? "back" : tk && tk.type === "stack" && rack.servers.some((s) => s.fresh) ? "back" : "front");
    if (G.sideAt(rack) === side) return openPanel(ob, side);
    const sp = M.rackSpot(rack, side);
    p.target = { ob, side };
    if (!G.walkTo(sp.x, sp.y)) G.toast("走不到那一側", "warn");
    return;
  }
  if (G.near(ob, 1.8)) return openPanel(ob);
  const sp = M.standSpot(ob, p);
  if (!sp) return openPanel(ob);
  p.target = { ob };
  if (!G.walkTo(sp.x, sp.y)) { G.toast("走不到那裡", "warn"); p.target = null; }
}
function openPanel(ob, side) {
  UI.open(ob, side);
  const st = UI.panelState(); if (st) st.goSide = (s2) => { UI.close(); interact(ob, s2); };
}
G.on((type, data) => {
  if (type === "arrive" && data) { S.player.target = null; openPanel(data.ob, data.side); }
  if (type === "change" || type === "inv" || type === "scan") { UI.refresh(); drawInv(); drawTicket(); }
  if (type === "ticket") { drawTicket(); drawTicketList(); }
  if (type === "toast") showToast(data.text, data.kind);
  if (type === "dialog") showDialog();
  if (type === "map") rebuildMinimap();
  if (type === "end") showEnd(data);
});

/* ---------------- 介面 ---------------- */
function togglePause() { S.paused = !S.paused; $("#bPause").textContent = S.paused ? "▶ 繼續" : "⏸ 暫停"; }
function toggleHeat() { R.view.heat = !R.view.heat; $("#bHeat").classList.toggle("on", R.view.heat); if (R.view.heat) G.toast("溫度熱圖：藍＝涼、紅＝熱"); }
$("#bPause").onclick = togglePause;
$("#bHeat").onclick = toggleHeat;
$("#bFollow").onclick = () => setFollow(!camState.follow);
$("#bBack").onclick = () => { camState.hold = 0; camState.fly = null; $("#bBack").hidden = true; };
$("#bZin").onclick = () => zoomAt(1.3); $("#bZout").onclick = () => zoomAt(1 / 1.3);
$("#bRun").onclick = () => { S.player.run = !S.player.run; $("#bRun").classList.toggle("on", S.player.run); };
$("#bTickets").onclick = () => { $("#tlist").hidden = !$("#tlist").hidden; drawTicketList(); };
$("#bNav").onclick = () => { const t = activeTicket(); if (!t) return; const st = G.nextTarget(t); if (st) interact(st.target, st.side); else G.toast("接下來在現場操作就好"); };
$("#bEnd").onclick = () => { if (confirm("提早下班？還沒結的工單會算逾時。")) G.endShift(); };
let activeId = null;
const activeTicket = () => S.tickets.find((t) => t.id === activeId && t.state === "open") || S.tickets.find((t) => t.state === "open");
function drawTicket() {
  const t = activeTicket(), box = $("#ticket");
  if (!t) { box.innerHTML = `<div class="tk-empty">目前沒有工單 ☕<small>可以去休息室喝杯飲料，或巡一下機房</small></div>`; R.view.highlight = null; return; }
  activeId = t.id;
  const left = t.due - S.clock;
  const steps = G.steps(t);
  const firstTodo = steps.findIndex((s) => !s.done);
  box.innerHTML = `<div class="tk-top"><span class="prio p${t.prio}">${G.PRIO_NAME[t.prio]}</span><b>#${t.id} ${t.title}</b></div>
    <div class="tk-where">📍 ${G.where(t)}</div>
    <div class="tk-sla ${left < 15 ? "late" : ""}">⏱ 時限 ${left >= 0 ? `剩 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : `已逾時 ${Math.floor(-left)} 分`}</div>
    <p class="tk-desc">${t.desc}</p>
    <ol class="tk-steps">${steps.map((s, i) => `<li class="${s.done ? "done" : i === firstTodo ? "now" : ""}">${s.done ? "✔" : i === firstTodo ? "👉" : "・"} ${s.label}</li>`).join("")}</ol>`;
  const nt = G.nextTarget(t);
  R.view.highlight = nt ? nt.target : null;
}
function drawTicketList() {
  const box = $("#tlist");
  const list = [...S.tickets].sort((a, b) => (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1) || a.prio - b.prio);
  $("#bTickets").textContent = `📟 工單 ${S.tickets.filter((t) => t.state === "open").length}`;
  if (box.hidden) return;
  box.innerHTML = `<h3>今天的工單</h3>` + (list.length ? "" : "<p>還沒有工單</p>");
  for (const t of list) {
    const d = document.createElement("button");
    d.className = `tl ${t.state} ${t.id === activeId ? "act" : ""}`;
    d.innerHTML = `<span class="prio p${t.prio}">P${t.prio}</span><b>#${t.id} ${t.title}</b><small>${G.where(t)}・${t.state === "done" ? "已完成 ✔" : `時限 ${G.fmtClock(t.due)}`}</small>`;
    d.onclick = () => { if (t.state === "open") { activeId = t.id; drawTicket(); const st = G.nextTarget(t); const ob = st ? st.target : t.rack ? t.rack.ob : t.crah?.ob; if (ob) flyTo(ob.x + ob.w / 2, ob.y + ob.d / 2); } box.hidden = true; };
    box.append(d);
  }
}
function drawInv() {
  const tb = $("#tools"); tb.innerHTML = "";
  for (const [k, ic] of [["esd", "🩷"], ["screwdriver", "🪛"], ["pen", "🖊️"], ["scanner", "📷"]]) { const s = document.createElement("span"); s.className = "tool " + (S.tools[k] ? "on" : ""); s.innerHTML = `${ic}<small>${G.TOOL_NAME[k]}</small>`; tb.append(s); }
  const ib = $("#inv"); ib.innerHTML = `<span class="cap">背包 ${G.invUsed()}/${S.cap}</span>`;
  for (const it of S.inv) { const s = document.createElement("span"); s.className = "item " + it.state; s.title = M.PARTS[it.part].name; s.innerHTML = `${M.PARTS[it.part].icon}<small>${it.part}${it.state === "bad" ? " 壞" : it.state === "used" ? " 拆" : ""}</small>`; ib.append(s); }
}
function drawTop() {
  const done = S.tickets.filter((t) => t.state === "done"), ok = done.filter((t) => t.closed <= t.due).length;
  $("#day").textContent = `第 ${S.day} 天`;
  $("#clock").textContent = G.fmtClock(S.clock);
  $("#sla").textContent = `SLA ${done.length ? Math.round((ok / done.length) * 100) : 100}%`;
  $("#lvl").textContent = `${G.levelName()}・${S.xp} xp`;
  $("#inc").textContent = `事故 ${S.incidents.length}`; $("#inc").classList.toggle("bad", S.incidents.length > 0);
  const room = M.roomAt(S.player.x, S.player.y);
  $("#where").textContent = room ? room.name : "戶外";
}
const toasts = $("#toasts");
function showToast(text, kind) {
  const d = document.createElement("div"); d.className = "toast " + kind; d.textContent = text; toasts.prepend(d);
  setTimeout(() => d.classList.add("out"), 3600); setTimeout(() => d.remove(), 4200);
  while (toasts.children.length > 5) toasts.lastChild.remove();
}
function showDialog() {
  const d = S.dialog[0]; const box = $("#dialog");
  if (!d) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<div class="who">🧑‍🔧 ${d.who}</div><p>${d.text}</p><small>${S.dialog.length > 1 ? "點一下看下一句 ▶" : "點一下關閉"}</small>`;
}
$("#dialog").onclick = () => { S.dialog.shift(); showDialog(); };

/* ---------------- 小地圖 ---------------- */
const mm = $("#minimap"), mctx = mm.getContext("2d");
let mmBase = null;
const MMC = { 0: "#dcd7d0", 1: "#f7efe3", 2: "#e6ecfa", 3: "#cfe0ff", 4: "#ffe0d6", 5: "#fcebd0", 6: "#ede6fb", 7: "#f4efe0", 8: "#eae3d3", 9: "#9aa6d6", 10: "#ffd98a", 11: "#fff2e2", 12: "#c9ebb2" };
function rebuildMinimap() {
  const c = document.createElement("canvas"); c.width = M.W; c.height = M.H;
  const g = c.getContext("2d"), img = g.createImageData(M.W, M.H);
  for (let i = 0; i < M.W * M.H; i++) {
    let hex = MMC[M.tiles[i]];
    const o = M.objAt[i]; if (o >= 0 && !M.objects[o].removed) hex = M.objects[o].kind === "rack" ? "#6f7fb0" : M.objects[o].kind === "tree" ? "#9fd48f" : "#b8c0d8";
    const n = parseInt(hex.slice(1), 16); img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], i * 4);
  }
  g.putImageData(img, 0, 0); mmBase = c;
}
function drawMinimap(t) {
  const w = mm.width, h = mm.height, sx = w / M.W, sy = h / M.H;
  mctx.clearRect(0, 0, w, h); mctx.imageSmoothingEnabled = false; mctx.drawImage(mmBase, 0, 0, w, h);
  // 畫面範圍
  const cs = [[0, 0], [cam.w, 0], [cam.w, cam.h], [0, cam.h]].map(([a, b]) => R.screenToTile(a, b));
  mctx.strokeStyle = "rgba(111,157,255,.9)"; mctx.lineWidth = 1.5; mctx.beginPath(); cs.forEach(([x, y], i) => (i ? mctx.lineTo(x * sx, y * sy) : mctx.moveTo(x * sx, y * sy))); mctx.closePath(); mctx.stroke();
  for (const tk of S.tickets) if (tk.state === "open") { const ob = tk.crah ? tk.crah.ob : tk.rack ? tk.rack.ob : null; if (!ob) continue; mctx.fillStyle = (t * 3 | 0) % 2 ? "#ff6f8e" : "#ffb347"; mctx.beginPath(); mctx.arc((ob.x + 0.5) * sx, (ob.y + 1) * sy, 3.5, 0, Math.PI * 2); mctx.fill(); }
  mctx.fillStyle = "#3b6fff"; mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(S.player.x * sx, S.player.y * sy, 4, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
}
mm.addEventListener("click", (e) => { const r = mm.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * M.W, y = ((e.clientY - r.top) / r.height) * M.H; flyTo(x, y, Math.max(cam.z, 0.6)); });

/* ---------------- 開始、結算 ---------------- */
function showEnd(res) {
  const box = $("#end"); box.hidden = false;
  box.querySelector(".card").innerHTML = `<h2>第 ${res.day} 天 下班囉！</h2>
    <div class="stars">${"★".repeat(res.stars)}${"☆".repeat(3 - res.stars)}</div>
    <ul class="res"><li>工單 <b>${res.done}/${res.tickets}</b> 完成，時限內 <b>${res.onTime}</b></li><li>SLA 達成率 <b>${Math.round(res.sla * 100)}%</b></li><li>事故 <b class="${res.incidents.length ? "bad" : ""}">${res.incidents.length}</b>　作業疏失 <b>${res.violations.length}</b></li><li>經驗值 <b>${res.xp}</b>・${G.levelName()}</li></ul>
    ${res.incidents.length ? `<div class="inc"><b>事故紀錄</b>${res.incidents.map((i) => `<p>${G.fmtClock(i.t)} ${i.text}</p>`).join("")}</div>` : ""}
    ${res.violations.length ? `<div class="inc soft"><b>疏失紀錄</b>${res.violations.slice(0, 6).map((i) => `<p>${G.fmtClock(i.t)} ${i.text}</p>`).join("")}</div>` : ""}
    <div class="row"><button id="again">重玩這一天</button><button id="next" class="main">第 ${res.day + 1} 天 ▶</button></div>`;
  $("#again").onclick = () => { box.hidden = true; begin(res.day); };
  $("#next").onclick = () => { box.hidden = true; begin(res.day + 1); };
}
function begin(day) {
  UI.close(); $("#menu").hidden = true; $("#end").hidden = true; $("#toasts").innerHTML = ""; $("#tlist").hidden = true; S.paused = false; $("#bPause").textContent = "⏸ 暫停";
  G.startDay(day); rebuildMinimap();
  centerOn(S.player.x, S.player.y, 1.0); setFollow(true);
  drawInv(); drawTicket(); drawTicketList(); drawTop(); showDialog();
}
const saved = G.load();
$("#bStart").textContent = saved.day > 1 ? `繼續：第 ${saved.day} 天 ▶` : "開始第 1 天 ▶";
$("#bStart").onclick = () => begin(S.day);
$("#bFresh").onclick = () => { S.xp = 0; S.level = 1; begin(1); };

/* ---------------- 主迴圈 ---------------- */
let last = performance.now(), uiT = 0, T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
  draw();
  requestAnimationFrame(frame);
}
function step(dt) {
  T += dt;
  if (!S.paused && !S.over) { G.stepPlayer(dt); for (const n of npcs) stepNPC(n, dt); }
  G.tick(dt);
  updateCamera(dt);
  uiT += dt;
  if (uiT > 0.25) { uiT = 0; drawTop(); drawTicket(); if (UI.isOpen()) UI.refresh(); }
}
function draw() {
  const p = S.player;
  const people = [{ ...p, shirt: "#7fb2ff", hair: "#4a3328", esd: S.tools.esd, name: "我", self: true }, ...npcs];
  people[0].x = p.x; people[0].y = p.y;
  R.render(ctx, T, people);
  // 跟隨關閉時，維修員在畫面外 → 邊緣箭頭
  const [sx, sy] = R.toScreen(...playerIso());
  const off = sx < 0 || sy < 0 || sx > cam.w || sy > cam.h;
  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  if (off) {
    const cx = cam.w / 2, cy = cam.h / 2, a = Math.atan2(sy - cy, sx - cx);
    const r = Math.min(cam.w, cam.h) / 2 - 40, ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = "#6f9dff"; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -12); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#4b5a82"; ctx.font = "800 12px 'Noto Sans TC', system-ui"; ctx.textAlign = "center"; ctx.fillText("我在這邊", ax - Math.cos(a) * 30, ay - Math.sin(a) * 30);
  }
  drawMinimap(T);
}

/* ---------------- 測試介面 ---------------- */
function teleport(x, y) { Object.assign(S.player, { x: x + 0.5, y: y + 0.5, path: [], moving: false }); }
function simulate(sec, dt = 1 / 20) { for (let t = 0; t < sec; t += dt) step(dt); }
const tests = {
  /** 每間房間都走得到（從大廳出發） */
  reachAll() {
    const mark = reachable(M.places.lobby.x, M.places.lobby.y);
    const bad = [];
    for (const r of M.rooms) { let any = false; for (let y = r.y0; y <= r.y1 && !any; y++) for (let x = r.x0; x <= r.x1; x++) if (mark[M.idx(x, y)]) { any = true; break; } if (!any) bad.push(r.name); }
    let racksOk = 0; for (const rk of M.racks) { const f = M.rackSpot(rk, "front"), b = M.rackSpot(rk, "back"); if (mark[M.idx(f.x, f.y)] && mark[M.idx(b.x, b.y)]) racksOk++; }
    const outside = mark[M.idx(100, 188)] === 1;
    return { ok: !bad.length && racksOk === M.racks.length && outside, rooms: M.rooms.length, unreachable: bad, racksReachableBothSides: `${racksOk}/${M.racks.length}`, generatorYard: outside };
  },
  /** 走路：從大廳走到 A 機房最遠的機櫃 */
  walk() {
    begin(1); const rk = M.halls.A.racks[0], sp = M.rackSpot(rk, "front");
    const ok = G.walkTo(sp.x, sp.y); let t = 0; while (S.player.path.length && t < 200) { simulate(0.5); t += 0.5; }
    return { ok: ok && G.sideAt(rk) === "front", seconds: t, gameMinutes: +(t * S.speed).toFixed(1), dist: `${Math.round(Math.hypot(M.places.lobby.x - sp.x, M.places.lobby.y - sp.y) * M.TILE_M)} m（直線）` };
  },
  /** 每一種工單都能照步驟做完 */
  allTickets() {
    const out = {};
    const r = M.rng(3);
    for (const type of ["disk", "psu", "fan", "link", "heat", "crah", "breaker", "stack"]) {
      G.startDay(9); S.events = []; S.paused = false;
      const t = G.makeTicket(type, r, type === "heat" ? { cause: "blank" } : type === "crah" ? { fault: "filter" } : {});
      out[type] = solve(t);
    }
    G.startDay(9); S.events = [];
    const t2 = G.makeTicket("heat", r, { cause: "box" }); out.heatBox = solve(t2);
    return { ok: Object.values(out).every((v) => v.ok), ...out };
  },
  /** 拔錯硬碟、拔錯電源會變成事故 */
  wrongPull() {
    G.startDay(9); S.events = [];
    const r = M.rng(4);
    const t = G.makeTicket("disk", r), s = t.s, rack = t.rack;
    const sp = M.rackSpot(rack, "front"); teleport(sp.x, sp.y); S.tools.esd = true;
    G.scan(rack, s);
    const good = (s.faults.drive + 1) % M.MODELS[s.model].drives;
    const before = S.incidents.length; G.pullDrive(rack, s, good); const inc1 = S.incidents.length - before;
    G.insertDrive(rack, s, good);
    const t2 = G.makeTicket("psu", r), s2 = t2.s, rk2 = t2.rack; const bp = M.rackSpot(rk2, "back"); teleport(bp.x, bp.y);
    G.scan(rk2, s2); G.pullPSU(rk2, s2, s2.faults.psu === 0 ? 1 : 0);
    const inc2 = S.incidents.length - before - inc1;
    return { ok: inc1 === 1 && inc2 === 1 && !s2.up, wrongDriveIncident: inc1, wrongPsuIncident: inc2, serverDown: !s2.up };
  },
  /** 同一天的班表固定（同樣的種子 → 同樣的工單） */
  deterministic() {
    const run = () => { G.startDay(5); simulate(0); const ev = []; for (let k = 0; k < 600; k++) { G.tick(1); } return S.tickets.map((t) => `${t.type}:${G.where(t)}`).join("|"); };
    const a = run(), b = run();
    return { ok: a === b && a.length > 0, tickets: a.split("|").length };
  },
};
function solve(t) {
  const log = [];
  const go = (side) => { const sp = M.rackSpot(t.rack, side); teleport(sp.x, sp.y); };
  const near = (ob) => { const sp = M.standSpot(ob, S.player); teleport(sp.x, sp.y); };
  const shelf = (p) => M.objects.find((o) => (o.kind === "shelf" && o.parts.includes(p)) || (o.kind === "staging" && p.startsWith("SRV")));
  const bench = M.objects.find((o) => o.kind === "toolbench");
  near(bench); G.takeTool("esd"); G.takeTool("screwdriver"); G.takeTool("pen");
  if (t.part) { near(shelf(t.part)); G.takePart(t.part, shelf(t.part)); }
  const s = t.s, rk = t.rack;
  if (t.type === "disk") { go("front"); G.scan(rk, s); G.pullDrive(rk, s, s.faults.drive); G.insertDrive(rk, s, s.faults.drive); }
  if (t.type === "psu") { go("back"); G.scan(rk, s); const k = s.faults.psu; G.pullPSU(rk, s, k); G.insertPSU(rk, s, k); }
  if (t.type === "fan") { go("front"); G.scan(rk, s); G.slideOut(rk, s, true); G.replaceFan(rk, s, s.faults.fan); G.slideOut(rk, s, false); }
  if (t.type === "link") { go("back"); G.scan(rk, s); const k = s.faults.link; G.unplug(rk, s, k); G.cleanPort(rk, s, k); G.plug(rk, s, k); }
  if (t.type === "heat") { if (t.cause === "blank") { near(shelf("BLANK")); for (let k = 0; k < 4; k++) G.takePart("BLANK", shelf("BLANK")); go("front"); for (const u of [...(rk.missing || [])]) G.installBlank(rk, u); } else { near(t.box); G.removeBox(t.box); } }
  if (t.type === "crah") { near(t.crah.ob); G.crahInspect(t.crah); if (t.crah.fault === "filter") { near(shelf("FILTER")); G.takePart("FILTER", shelf("FILTER")); near(t.crah.ob); G.crahFilter(t.crah); } else G.crahReset(t.crah); }
  if (t.type === "breaker") { go("back"); const g = rk.servers.find((x) => x.model === "G4") || rk.servers[1]; G.movePlug(rk, g); G.resetBreaker(rk, "A"); }
  if (t.type === "stack") { const nic = M.MODELS[t.model].nic; near(shelf(nic)); G.takePart(nic, shelf(nic)); go("front"); const ns = G.installServer(rk, t.u, t.part); go("back"); for (const k of ["pA", "pB", "net"]) G.cableNew(rk, ns, k); G.scan(rk, ns); }
  simulate(8);
  return { ok: t.state === "done", where: G.where(t), incidents: S.incidents.length, violations: S.violations.length };
}
window.dc = { M, G, R, S, cam, tests, begin, interact, teleport, simulate, flyTo, setFollow, zoomAt, centerOn, frame: (dt = 0) => { if (dt) simulate(dt); draw(); }, get follow() { return camState.follow; } };

/* ---------------- 啟動 ---------------- */
$("#loadmsg").textContent = "畫出整棟機房…";
await new Promise((r) => setTimeout(r, 30));
R.buildOverview();
rebuildMinimap();
G.startDay(S.day); S.paused = true;
centerOn(S.player.x, S.player.y, 1.0);
drawInv(); drawTicket(); drawTop();
$("#loading").hidden = true;
document.body.classList.add("ready");
if (!SHOT) { $("#menu").hidden = false; requestAnimationFrame(frame); }
else { S.paused = false; }
