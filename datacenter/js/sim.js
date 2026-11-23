// 機房夜班：遊戲邏輯（時間、工單、工具、備品、動作、事故、溫度、劇情）
// 所有動作都在這裡檢查與結算；畫面（main.js / panel.js）只負責顯示與呼叫。
import * as M from "./map.js";
import { findPath } from "./path.js";

export const SLA = { 1: 60, 2: 180, 3: 480 };            // 遊戲分鐘
export const PRIO_NAME = { 1: "P1 緊急", 2: "P2 重要", 3: "P3 一般" };
const HALL_A = M.halls.A;

export const S = {
  day: 1, clock: 8 * 60, shiftEnd: 18 * 60, speed: 1, paused: false, over: false,
  player: { x: M.places.lobby.x + 0.5, y: M.places.lobby.y + 0.5, path: [], dir: 1, moving: false, run: false, walkT: 0, target: null },
  tools: { scanner: true, esd: false, screwdriver: false, pen: false },
  inv: [], cap: 6,
  tickets: [], nextId: 1041,
  incidents: [], violations: [], done: [],
  scanned: new Set(), cleaned: new Set(),
  rebuilds: [], boxes: [],
  temp: new Float32Array(100 * 60), rackInlet: new Float32Array(600), hotSince: new Float32Array(600).fill(-1),
  msgs: [], dialog: [], events: [], xp: 0, level: 1,
  npcs: [],
};
const listeners = [];
export function on(fn) { listeners.push(fn); }
function emit(type, data) { for (const f of listeners) f(type, data); }
export function toast(text, kind = "info") { S.msgs.push({ text, kind, t: performance.now() }); emit("toast", { text, kind }); }
export function say(who, text) { S.dialog.push({ who, text }); emit("dialog", { who, text }); }
export const fmtClock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

/* ---------------- 共用查詢 ---------------- */
export const model = (s) => M.MODELS[s.model];
export function serverState(rack, s) {
  if (!s.up) return "off";
  if (s.faults.drive !== undefined || s.faults.psu !== undefined || s.faults.fan !== undefined || s.faults.link !== undefined) return "fail";
  if (Object.keys(s.pulled).length) return "warn";
  if (S.rebuilds.some((r) => r.rack === rack && r.s === s)) return "warn";
  return "ok";
}
export function rackState(rack) {
  let st = "ok";
  for (const s of rack.servers) { const k = serverState(rack, s); if (k === "off") return "off"; if (k === "fail") st = "fail"; else if (k === "warn" && st === "ok") st = "warn"; }
  if (!rack.pdu.A.on || !rack.pdu.B.on) st = st === "ok" ? "fail" : st;
  if (rack.amb) st = st === "ok" ? "fail" : st;
  return st;
}
export function hasPart(part, state = "new") { return S.inv.some((i) => i.part === part && i.state === state); }
function takeFromInv(part, state = "new") { const k = S.inv.findIndex((i) => i.part === part && i.state === state); if (k < 0) return null; return S.inv.splice(k, 1)[0]; }
export function invUsed() { return S.inv.reduce((a, i) => a + (i.state === "new" ? (M.PARTS[i.part].size || 1) : 0), 0); }
function addInv(part, state) { S.inv.push({ part, state }); emit("inv"); }
const P = () => S.player;
export function near(ob, r = 1.6) {
  const p = P(), cx = Math.max(ob.x, Math.min(ob.x + ob.w, p.x)), cy = Math.max(ob.y, Math.min(ob.y + ob.d, p.y));
  return Math.hypot(p.x - cx, p.y - cy) <= r;
}
/** 站在機櫃的哪一側（front / back / null） */
export function sideAt(rack) {
  const p = P(), ob = rack.ob;
  if (Math.abs(p.x - (ob.x + 0.5)) > 1.6) return null;
  const f = rack.front;
  const frontY = f < 0 ? ob.y - 0.5 : ob.y + 2.5, backY = f < 0 ? ob.y + 2.5 : ob.y - 0.5;
  if (Math.abs(p.y - frontY) <= 1.2) return "front";
  if (Math.abs(p.y - backY) <= 1.2) return "back";
  return null;
}
const key = (rack, s) => `${rack.id}:${s.i}`;
function need(cond, msg) { if (!cond) { toast(msg, "warn"); return false; } return true; }
function violation(text) { S.violations.push({ text, t: S.clock }); toast("⚠️ 作業疏失：" + text, "warn"); emit("violation", text); }
function incident(text) { S.incidents.push({ text, t: S.clock }); toast("🚨 事故：" + text, "bad"); emit("incident", text); }
function checkHands(rack, s, ticketOnly = true) {
  if (!S.tools.esd) violation("沒戴防靜電手環就碰零件");
  if (!S.scanned.has(key(rack, s))) violation(`動手前沒先掃描 ${hostname(rack, s)} 的標籤確認`);
}
export function hostname(rack, s) { return `${rack.label.toLowerCase()}-u${String(s.u).padStart(2, "0")}`; }
function ticketFor(rack, s, type) { return S.tickets.find((t) => t.state === "open" && t.rack === rack && (s === null || t.s === s) && (!type || t.type === type)); }

/* ---------------- 工具與備品 ---------------- */
export function takeTool(name) {
  const ob = M.objects.find((o) => o.kind === "toolbench");
  if (!need(near(ob, 2.5), "要到更衣室的工具台才能拿工具")) return false;
  S.tools[name] = !S.tools[name];
  toast(S.tools[name] ? `拿了${TOOL_NAME[name]}` : `放回${TOOL_NAME[name]}`);
  emit("inv"); return true;
}
export const TOOL_NAME = { scanner: "掃碼器", esd: "防靜電手環", screwdriver: "螺絲起子", pen: "光纖清潔筆" };
export function takePart(part, from) {
  if (!need(from && near(from, 2.5), "要站在架子旁邊才能拿")) return false;
  const sz = M.PARTS[part].size || 1;
  if (!need(invUsed() + sz <= S.cap, `背包滿了（${S.cap} 格），先把用不到的放回去`)) return false;
  addInv(part, "new"); toast(`拿了 ${M.PARTS[part].name}`); return true;
}
export function returnPart(k, from) {
  const it = S.inv[k]; if (!it) return false;
  if (it.state === "new") { if (!need(from && near(from, 2.5), "要回到架子旁邊才能放回去")) return false; }
  else if (!need(from && from.kind === "rma" && near(from, 2.5), "壞掉的零件要放進退貨區的退貨箱")) return false;
  S.inv.splice(k, 1); emit("inv");
  if (it.state === "bad") { S.xp += 5; toast(`壞件 ${M.PARTS[it.part].name} 放進退貨箱（+5 經驗）`); }
  return true;
}

/* ---------------- 現場動作 ---------------- */
export function scan(rack, s) {
  if (!need(sideAt(rack), "要站在機櫃前面或後面才能掃描")) return null;
  S.scanned.add(key(rack, s));
  emit("scan", { rack, s });
  const t = ticketFor(rack, s);
  return { host: hostname(rack, s), serial: s.serial, model: model(s).name, match: !!t, ticket: t };
}
export function pullDrive(rack, s, slot) {
  if (!need(sideAt(rack) === "front", "硬碟要從機櫃正面（冷通道）拔")) return false;
  if (s.pulled["d" + slot]) return false;
  checkHands(rack, s);
  const bad = s.faults.drive === slot;
  s.pulled["d" + slot] = bad ? "bad" : "good";
  addInv(model(s).drive, bad ? "bad" : "used");
  if (bad) toast("拔出故障硬碟 ✔");
  else incident(`拔錯硬碟！${hostname(rack, s)} 第 ${slot + 1} 槽是好的，陣列降級（快插回去）`);
  emit("change"); return true;
}
export function insertDrive(rack, s, slot) {
  if (!need(sideAt(rack) === "front", "要在機櫃正面")) return false;
  const was = s.pulled["d" + slot]; if (!was) return false;
  const part = model(s).drive;
  if (was === "good") { if (!need(takeFromInv(part, "used"), "插回原本那顆硬碟（在背包裡）")) return false; delete s.pulled["d" + slot]; toast("原本的硬碟插回去了，陣列恢復"); emit("change"); return true; }
  if (!need(hasPart(part), `需要 ${M.PARTS[part].name}${S.inv.some((i) => M.PARTS[i.part].kind === "drive" && i.state === "new") ? "（型號不符）" : ""}`)) return false;
  takeFromInv(part); delete s.pulled["d" + slot];
  if (!S.tools.esd && Math.random() < 0.25) { toast("新硬碟被靜電打壞了…要再拿一顆（記得戴手環）", "warn"); s.pulled["d" + slot] = "bad"; addInv(part, "bad"); emit("change"); return false; }
  S.rebuilds.push({ rack, s, slot, until: S.clock + 4 }); toast("插入新硬碟，陣列開始重建（約 4 分鐘）");
  emit("change"); return true;
}
export function pullPSU(rack, s, slot) {
  if (!need(sideAt(rack) === "back", "電源供應器在機櫃背面（熱通道）")) return false;
  if (s.pulled["p" + slot]) return false;
  checkHands(rack, s);
  const bad = s.faults.psu === slot;
  const otherOk = s.faults.psu !== 1 - slot && !s.pulled["p" + (1 - slot)];
  s.pulled["p" + slot] = bad ? "bad" : "good";
  addInv(model(s).psu, bad ? "bad" : "used");
  if (bad) toast("拔出故障電源 ✔");
  else if (!otherOk) { s.up = false; incident(`拔掉了唯一正常的電源，${hostname(rack, s)} 整台斷電！`); }
  else violation(`拔錯電源（${hostname(rack, s)} 第 ${slot + 1} 顆是好的，還好另一顆在供電）`);
  emit("change"); return true;
}
export function insertPSU(rack, s, slot) {
  if (!need(sideAt(rack) === "back", "要在機櫃背面")) return false;
  const was = s.pulled["p" + slot]; if (!was) return false;
  const part = model(s).psu;
  if (was === "good") { if (!need(takeFromInv(part, "used"), "插回原本那顆電源")) return false; }
  else { if (!need(hasPart(part), `需要 ${M.PARTS[part].name}`)) return false; takeFromInv(part); }
  delete s.pulled["p" + slot];
  if (was === "bad") { delete s.faults.psu; toast("新電源裝好了，雙電源恢復 ✔"); }
  if (!s.up && s.faults.psu === undefined) { s.up = true; toast(`${hostname(rack, s)} 重新開機`); }
  emit("change"); return true;
}
export function slideOut(rack, s, out = true) {
  if (!need(sideAt(rack) === "front", "要從正面把伺服器沿滑軌拉出來")) return false;
  if (out && !need(S.tools.screwdriver, "要用螺絲起子打開上蓋（去更衣室工具台拿）")) return false;
  s.out = out ? S.clock : undefined;
  toast(out ? "伺服器拉出、上蓋打開了（別拖太久，機器會過熱）" : "伺服器推回機櫃 ✔");
  emit("change"); return true;
}
export function replaceFan(rack, s, slot) {
  if (!need(s.out !== undefined, "要先把伺服器拉出來")) return false;
  const part = model(s).fan;
  checkHands(rack, s);
  if (s.faults.fan !== slot) { violation(`第 ${slot + 1} 個風扇是好的，換錯了`); return false; }
  if (!need(hasPart(part), `需要 ${M.PARTS[part].name}`)) return false;
  takeFromInv(part); addInv(part, "bad"); delete s.faults.fan;
  toast("風扇換好了，記得把伺服器推回去 ✔"); emit("change"); return true;
}
export function unplug(rack, s, port) {
  if (!need(sideAt(rack) === "back", "網路線接在機櫃背面")) return false;
  if (s.pulled["n" + port]) return false;
  const bad = s.faults.link === port;
  s.pulled["n" + port] = bad ? "bad" : "good";
  addInv(model(s).nic, bad ? "bad" : "used");
  if (bad) toast("拔下壞掉的線 ✔");
  else incident(`拔錯線！${hostname(rack, s)} 埠 ${port + 1} 斷線（快接回去）`);
  emit("change"); return true;
}
export function cleanPort(rack, s, port) {
  if (!need(S.tools.pen, "要用光纖清潔筆（去更衣室工具台拿）")) return false;
  S.cleaned.add(`${key(rack, s)}:${port}`); toast("光纖頭清潔好了 ✨"); emit("change"); return true;
}
export function plug(rack, s, port) {
  if (!need(sideAt(rack) === "back", "要在機櫃背面")) return false;
  const was = s.pulled["n" + port]; if (!was) return false;
  const part = model(s).nic;
  if (was === "good") { if (!need(takeFromInv(part, "used"), "把原本那條線接回去")) return false; delete s.pulled["n" + port]; toast("線接回去了，連線恢復"); emit("change"); return true; }
  if (!need(hasPart(part), `需要 ${M.PARTS[part].name}`)) return false;
  if (part === "LC" && !S.cleaned.has(`${key(rack, s)}:${port}`)) { violation("光纖頭沒清潔就接，連線不穩（先清潔再接）"); return false; }
  takeFromInv(part); delete s.pulled["n" + port]; delete s.faults.link;
  toast("新線接好，連線燈亮了 ✔"); emit("change"); return true;
}
export function installBlank(rack, u) {
  if (!need(sideAt(rack) === "front", "盲板裝在機櫃正面")) return false;
  if (!rack.missing || !rack.missing.includes(u)) return false;
  if (!need(hasPart("BLANK"), "需要 1U 盲板（倉庫線材・雜項架）")) return false;
  takeFromInv("BLANK"); rack.missing = rack.missing.filter((x) => x !== u); rack.blanks.push(u);
  toast(`U${u} 盲板裝好了，熱風不會再回流 ✔`); emit("change"); return true;
}
export function installServer(rack, u, item) {
  if (!need(sideAt(rack) === "front", "新機從機櫃正面上架")) return false;
  if (!need(S.tools.screwdriver, "上滑軌要用螺絲起子")) return false;
  const k = S.inv.findIndex((i) => i.part === item && i.state === "new"); if (!need(k >= 0, "背包裡沒有新機")) return false;
  const mdl = M.PARTS[item].model, h = M.MODELS[mdl].u;
  for (let x = u; x < u + h; x++) if (!need(rack.blanks.includes(x), `U${x} 已經有東西了`)) return false;
  S.inv.splice(k, 1);
  rack.blanks = rack.blanks.filter((x) => x < u || x >= u + h);
  const s = { u, model: mdl, i: rack.servers.length, faults: {}, pulled: { pA: "none", pB: "none", net: "none" }, up: false, serial: `SNNEW${S.nextId}${u}`, fresh: true };
  rack.servers.push(s);
  const t = ticketFor(rack, null, "stack");
  if (t) t.s = s;
  toast(`${M.MODELS[mdl].name} 上架到 U${u}，接下來到背面接電、接網路`); emit("change"); return s;
}
export function cableNew(rack, s, what) {
  if (!need(sideAt(rack) === "back", "要在機櫃背面接線")) return false;
  delete s.pulled[what];
  if (what === "net" && !hasPart(model(s).nic)) { s.pulled[what] = "none"; return need(false, `需要 ${M.PARTS[model(s).nic].name}`); }
  if (what === "net") takeFromInv(model(s).nic);
  if (!s.pulled.pA && !s.pulled.pB && !s.pulled.net) { s.up = true; toast(`${hostname(rack, s)} 開機了，自我檢測通過 ✔`); }
  else toast(what === "net" ? "網路線接好" : `電源 ${what === "pA" ? "A" : "B"} 路接好`);
  emit("change"); return true;
}
export function removeBox(ob) {
  if (!need(near(ob, 1.8), "走近一點才搬得動")) return false;
  M.removeObject(ob); S.boxes = S.boxes.filter((b) => b !== ob);
  toast("把擋住出風口的紙箱搬走了 ✔"); emit("change"); emit("map"); return true;
}
export function crahInspect(c) { if (!need(near(c.ob, 2.2), "走到空調旁邊")) return null; c.inspected = true; emit("change"); return c.fault; }
export function crahReset(c) {
  if (!need(near(c.ob, 2.2), "走到空調旁邊")) return false;
  if (!c.inspected) violation("沒先看故障碼就直接重設");
  if (c.fault === "trip") { c.ok = true; c.fault = null; c.since = null; toast(`${c.label} 重新啟動，冷風回來了 ✔`); }
  else if (c.fault === "filter") toast("重設沒用：濾網堵住了，要換濾網", "warn");
  else toast("空調運轉正常");
  emit("change"); return c.ok;
}
export function crahFilter(c) {
  if (!need(near(c.ob, 2.2), "走到空調旁邊")) return false;
  if (!need(hasPart("FILTER"), "需要空調濾網（倉庫線材・雜項架）")) return false;
  takeFromInv("FILTER"); addInv("FILTER", "bad");
  if (c.fault === "filter") { c.ok = true; c.fault = null; c.since = null; toast(`${c.label} 換上新濾網，風量恢復 ✔`); }
  else toast("濾網換新了");
  emit("change"); return true;
}
/** 配電：把某台的 A 路電源線改插到備用迴路 */
export function movePlug(rack, s) {
  if (!need(sideAt(rack) === "back", "配電單元在機櫃背面")) return false;
  s.spare = true; toast(`${hostname(rack, s)} 的 A 路電源改插到備用迴路`); emit("change"); return true;
}
export function rackAmps(rack, feed) {
  let w = 0; for (const s of rack.servers) if (s.up) w += model(s).watt * (feed === "A" && s.spare ? 0 : 0.5);
  return w / 230 * (rack.overload && feed === "A" ? 1.0 : 1);
}
export function resetBreaker(rack, feed) {
  if (!need(sideAt(rack) === "back", "配電單元在機櫃背面")) return false;
  const a = rackAmps(rack, feed) + (rack.overload && feed === "A" ? rack.overload : 0);
  const spareOk = rack.servers.some((s) => s.spare);
  if (rack.overload && !spareOk) { incident(`${rack.label} A 路負載 ${a.toFixed(1)}A 超過 16A，重設後又跳脫了`); return false; }
  rack.pdu[feed].on = true; rack.overload = 0; toast(`${rack.label} ${feed} 路斷路器重設，供電恢復 ✔`); emit("change"); return true;
}

/* ---------------- 工單 ---------------- */
function pickRack(r, pred) { const list = HALL_A.racks.filter(pred); return list[Math.floor(r() * list.length)]; }
function pickServer(r, rack, pred = () => true) { const l = rack.servers.filter((s) => s.model !== "SW" && pred(s)); return l[Math.floor(r() * l.length)]; }
export function makeTicket(type, r, opt = {}) {
  const prio = opt.prio || (type === "crah" || type === "breaker" ? 1 : type === "heat" ? 2 : type === "stack" ? 3 : r() < 0.4 ? 2 : 3);
  const t = { id: S.nextId++, type, prio, created: S.clock, due: S.clock + SLA[prio], state: "open" };
  if (type === "disk" || type === "psu" || type === "fan" || type === "link") {
    const rack = opt.rack || pickRack(r, (k) => k.servers.length > 3 && !S.tickets.some((x) => x.rack === k && x.state === "open"));
    const s = opt.s || pickServer(r, rack, (s) => type !== "fan" || M.MODELS[s.model].fans > 0);
    t.rack = rack; t.s = s;
    const m = model(s);
    if (type === "disk") { s.faults.drive = Math.floor(r() * m.drives); t.part = m.drive; t.title = "硬碟故障"; t.desc = `陣列回報第 ${s.faults.drive + 1} 槽硬碟故障，請更換。`; }
    if (type === "psu") { s.faults.psu = Math.floor(r() * 2); t.part = m.psu; t.title = "電源供應器故障"; t.desc = `PSU ${s.faults.psu + 1} 失效，目前單電源運作。`; }
    if (type === "fan") { s.faults.fan = Math.floor(r() * m.fans); t.part = m.fan; t.title = "風扇故障"; t.desc = `風扇 ${s.faults.fan + 1} 轉速為 0，請更換風扇模組。`; }
    if (type === "link") { s.faults.link = Math.floor(r() * 2); t.part = m.nic; t.title = "網路斷線"; t.desc = `資料埠 ${s.faults.link + 1} link down，疑似線材損壞，請更換跳線。`; }
  }
  if (type === "heat") {
    const rack = opt.rack || pickRack(r, (k) => k.pos % 20 > 2 && k.pos % 20 < 17);
    t.rack = rack; t.cause = opt.cause || (r() < 0.5 ? "blank" : "box");
    if (t.cause === "blank") { const n = 2 + Math.floor(r() * 2); rack.missing = rack.blanks.splice(0, n); if (!rack.missing.length) { rack.missing = []; t.cause = "box"; } }
    if (t.cause === "box") { const sp = M.rackSpot(rack, "front"); const ob = M.addObject({ kind: "box", x: sp.x + 1, y: sp.y, h: 0.7, label: "紙箱" }); S.boxes.push(ob); t.box = ob; emit("map"); }
    t.title = "機櫃進風溫度過高"; t.desc = `${rack.label} 一帶進風溫度偏高，請到現場找出原因（可開溫度熱圖）。`;
  }
  if (type === "crah") {
    const c = opt.crah || HALL_A.crahs[Math.floor(r() * HALL_A.crahs.length)];
    c.ok = false; c.fault = opt.fault || (r() < 0.5 ? "trip" : "filter"); c.since = S.clock; c.inspected = false;
    t.crah = c; t.title = "精密空調停機"; t.desc = `${c.label} 停止送風，周圍溫度正在上升！`;
  }
  if (type === "breaker") {
    const rack = opt.rack || pickRack(r, (k) => k.kind === "g4");
    rack.pdu.A.on = false; rack.overload = 4.5; t.rack = rack;
    t.title = "配電斷路器跳脫"; t.desc = `${rack.label} A 路配電跳脫，機櫃只剩 B 路供電。新上線的 GPU 機讓 A 路超載，先分散負載再重設。`;
  }
  if (type === "stack") {
    const rack = opt.rack || pickRack(r, (k) => k.blanks.filter((u) => u <= 30).length >= 4);
    const mdl = opt.model || (r() < 0.5 ? "C1" : "C2"), h = M.MODELS[mdl].u;
    let u = null; for (let x = 3; x <= 38; x++) { let ok = true; for (let k = 0; k < h; k++) if (!rack.blanks.includes(x + k)) ok = false; if (ok) { u = x; break; } }
    t.rack = rack; t.model = mdl; t.u = u; t.part = "SRV-" + mdl; t.title = "新機上架";
    t.desc = `把 ${M.MODELS[mdl].name} 上架到 ${rack.label} U${u}，接好兩路電源和網路，開機確認。`;
  }
  S.tickets.push(t);
  toast(`📟 新工單 #${t.id}（${PRIO_NAME[t.prio]}）${t.title}`, t.prio === 1 ? "bad" : "info");
  emit("ticket", t);
  return t;
}
export function where(t) {
  if (t.crah) return `A 機房 ${t.crah.label}`;
  if (t.rack && t.s && t.type !== "stack") return `${t.rack.label} U${String(t.s.u).padStart(2, "0")}`;
  if (t.rack) return t.type === "stack" ? `${t.rack.label} U${t.u}` : t.rack.label;
  return "";
}
function partShelf(part) { return M.objects.find((o) => (o.kind === "shelf" && o.parts.includes(part)) || (o.kind === "staging" && part.startsWith("SRV"))); }
const toolbench = () => M.objects.find((o) => o.kind === "toolbench");
/** 每張工單的步驟（自動打勾）＋ 每一步要去的地方 */
export function steps(t) {
  const out = [];
  const s = t.s, rack = t.rack;
  const pickPart = (p) => ({ label: `拿 ${M.PARTS[p].name}`, done: hasPart(p) || t.state !== "open", target: partShelf(p) });
  const esd = () => ({ label: "戴上防靜電手環", done: S.tools.esd, target: toolbench() });
  const at = (side) => ({ label: `走到 ${rack.label} ${side === "front" ? "正面（冷通道）" : "背面（熱通道）"}`, done: sideAt(rack) === side, target: rack.ob, side });
  const sc = () => ({ label: "掃描標籤，確認序號", done: S.scanned.has(key(rack, s)), target: rack.ob });
  if (t.type === "disk") out.push(esd(), pickPart(t.part), at("front"), sc(), { label: "拔出亮琥珀燈的故障硬碟", done: s.pulled["d" + s.faults.drive] === "bad" || s.faults.drive === undefined }, { label: "插入新硬碟", done: S.rebuilds.some((r) => r.s === s) || s.faults.drive === undefined }, { label: "等陣列重建完成", done: s.faults.drive === undefined });
  if (t.type === "psu") out.push(esd(), pickPart(t.part), at("back"), sc(), { label: "拔出故障的電源（另一顆要先確認是綠燈）", done: s.pulled["p" + s.faults.psu] === "bad" || s.faults.psu === undefined }, { label: "插入新電源", done: s.faults.psu === undefined });
  if (t.type === "fan") out.push(esd(), { label: "拿螺絲起子", done: S.tools.screwdriver, target: toolbench() }, pickPart(t.part), at("front"), sc(), { label: "把伺服器沿滑軌拉出、打開上蓋", done: s.out !== undefined || s.faults.fan === undefined }, { label: "換掉停轉的風扇", done: s.faults.fan === undefined }, { label: "伺服器推回機櫃", done: s.faults.fan === undefined && s.out === undefined });
  if (t.type === "link") { out.push(pickPart(t.part)); if (t.part === "LC") out.push({ label: "拿光纖清潔筆", done: S.tools.pen, target: toolbench() }); out.push(at("back"), sc(), { label: "拔下壞掉的那條線（埠燈不亮的）", done: s.pulled["n" + s.faults.link] === "bad" || s.faults.link === undefined }); if (t.part === "LC") out.push({ label: "清潔光纖頭", done: S.cleaned.has(`${key(rack, s)}:${s.faults.link}`) || s.faults.link === undefined }); out.push({ label: "接上新線", done: s.faults.link === undefined }); }
  if (t.type === "heat") {
    out.push({ label: "打開溫度熱圖，到現場找原因", done: !!t.found, target: rack.ob, side: "front" });
    if (t.cause === "blank") out.push({ label: "拿 1U 盲板", done: hasPart("BLANK") || !(rack.missing && rack.missing.length), target: partShelf("BLANK") }, { label: "把機櫃正面的空缺補上盲板", done: !(rack.missing && rack.missing.length), target: rack.ob, side: "front" });
    else out.push({ label: "把擋住出風地板的紙箱搬走", done: !t.box || t.box.removed, target: t.box && !t.box.removed ? t.box : null });
    out.push({ label: "等溫度降回 27°C 以下", done: t.state !== "open" });
  }
  if (t.type === "crah") {
    const c = t.crah;
    out.push({ label: `走到 ${c.label}，看故障碼`, done: c.inspected || c.ok, target: c.ob });
    if (c.inspected && c.fault === "filter") out.push({ label: "拿空調濾網來換", done: hasPart("FILTER") || c.ok, target: partShelf("FILTER") }, { label: "換濾網", done: c.ok, target: c.ob });
    else out.push({ label: "重設空調", done: c.ok, target: c.ob });
  }
  if (t.type === "breaker") {
    const g = rack.servers.find((x) => x.model === "G4");
    out.push(at("back"), { label: "看配電單元：哪一路超載？把一台 GPU 機的 A 路改插備用迴路", done: rack.servers.some((x) => x.spare) || rack.pdu.A.on }, { label: "重設 A 路斷路器", done: rack.pdu.A.on });
  }
  if (t.type === "stack") {
    const ns = rack.servers.find((x) => x.fresh);
    out.push({ label: "拿螺絲起子", done: S.tools.screwdriver, target: toolbench() }, { label: `到組裝測試間拿 ${M.PARTS[t.part].name}`, done: hasPart(t.part) || !!ns, target: partShelf(t.part) }, { label: `拿一條 ${M.PARTS[M.MODELS[t.model].nic].name}`, done: hasPart(M.MODELS[t.model].nic) || (ns && !ns.pulled.net), target: partShelf(M.MODELS[t.model].nic) }, { label: `從正面上架到 U${t.u}`, done: !!ns, target: rack.ob, side: "front" }, { label: "到背面接 A、B 兩路電源和網路線", done: !!ns && ns.up, target: rack.ob, side: "back" }, { label: "掃描新機標籤登錄資產", done: !!ns && S.scanned.has(key(rack, ns)), target: rack.ob });
  }
  return out;
}
export function nextTarget(t) { const st = steps(t).find((x) => !x.done && x.target); return st || null; }
function resolved(t) {
  const s = t.s;
  switch (t.type) {
    case "disk": return s.faults.drive === undefined && !Object.keys(s.pulled).some((k) => k[0] === "d");
    case "psu": return s.faults.psu === undefined && s.up && !s.pulled.p0 && !s.pulled.p1;
    case "fan": return s.faults.fan === undefined && s.out === undefined;
    case "link": return s.faults.link === undefined && !s.pulled.n0 && !s.pulled.n1;
    case "heat": return (t.cause === "blank" ? !(t.rack.missing && t.rack.missing.length) : !t.box || t.box.removed) && S.rackInlet[t.rack.id % 600] < 27;
    case "crah": return t.crah.ok;
    case "breaker": return t.rack.pdu.A.on;
    case "stack": { const ns = t.rack.servers.find((x) => x.fresh); return !!ns && ns.up && S.scanned.has(key(t.rack, ns)); }
  }
  return false;
}

/* ---------------- 溫度（A 機房） ---------------- */
function heatAt(x, y) {
  let t = 21.2 + Math.sin(x * 0.37 + y * 0.21) * 0.4;
  for (const c of HALL_A.crahs) if (!c.ok && c.since !== null) {
    const k = Math.min(1, (S.clock - c.since) / 25);
    t += 11 * k * Math.exp(-Math.hypot(x - c.cx, y - c.cy) / 24);
  }
  for (const rk of HALL_A.racks) if (rk.missing && rk.missing.length) { const sp = M.rackSpot(rk, "front"); t += 3.2 * rk.missing.length * Math.exp(-Math.hypot(x - sp.x, y - sp.y) / 3); }
  for (const b of S.boxes) if (!b.removed) t += 8 * Math.exp(-Math.hypot(x - b.x, y - b.y) / 4.5);
  return t;
}
let heatClock = -1;
export function updateHeat(force = false) {
  if (!force && S.clock - heatClock < 0.5) return;
  heatClock = S.clock;
  const { x0, y0 } = HALL_A;
  for (let y = 0; y < 60; y += 2) for (let x = 0; x < 100; x += 2) { const v = heatAt(x0 + x + 1, y0 + y + 1); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) S.temp[(y + dy) * 100 + x + dx] = v; }
  for (const rk of HALL_A.racks) {
    const sp = M.rackSpot(rk, "front"), v = heatAt(sp.x + 0.5, sp.y + 0.5), i = rk.id % 600;
    S.rackInlet[i] = v;
    if (v > 32) { if (S.hotSince[i] < 0) S.hotSince[i] = S.clock; else if (S.clock - S.hotSince[i] > 12 && !rk.cooked) { rk.cooked = true; for (const s of rk.servers) s.up = false; incident(`${rk.label} 進風 ${v.toFixed(0)}°C 太久，整櫃過熱保護關機！`); } }
    else { S.hotSince[i] = -1; if (rk.cooked && v < 27) { rk.cooked = false; for (const s of rk.servers) if (s.faults.psu === undefined && !s.fresh) s.up = true; toast(`${rk.label} 溫度回穩，機器重新開機`); } }
  }
}

/* ---------------- 劇情與每天的班表 ---------------- */
const MENTOR = "阿哲（資深技術員）";
function script(day) {
  const r = M.rng(day * 104729 + 7);
  const ev = [];
  const at = (min, fn) => ev.push({ t: min, fn });
  if (day === 1) {
    at(8 * 60, () => { say(MENTOR, "早安！今天是你第一天值班。先去更衣室的工具台拿『防靜電手環』，碰任何零件前都要戴。"); say(MENTOR, "點地板就會走過去，點東西就會走到旁邊操作。右上角的「導航」會帶路。"); });
    at(8 * 60 + 2, () => { const rack = HALL_A.racks.find((k) => k.row === 1 && k.pos === 14); const s = rack.servers.find((x) => x.model === "C1") || rack.servers[1]; makeTicket("disk", r, { rack, s, prio: 2 }); say(MENTOR, "第一張單：換硬碟。去倉庫『硬碟架』拿對型號的硬碟，走到機櫃正面，先掃描標籤，再拔亮琥珀燈的那顆。拔錯可是會出事的！"); });
    at(9 * 60 + 30, () => { const rack = HALL_A.racks.find((k) => k.row === 4 && k.pos === 33); makeTicket("psu", r, { rack, prio: 2 }); say(MENTOR, "電源供應器在機櫃背面（熱通道）。每台都有兩顆電源，拔之前先確認另一顆是綠燈。"); });
    at(12 * 60, () => makeTicket("disk", r, { prio: 3 }));
    at(14 * 60, () => makeTicket("psu", r, { prio: 3 }));
  } else if (day === 2) {
    at(8 * 60, () => { say(MENTOR, "今天會比較忙。風扇要拉出伺服器、用螺絲起子開蓋；光纖要先清潔再接。別忘了先掃描！"); makeTicket("fan", r, { prio: 2 }); });
    at(9 * 60, () => makeTicket("link", r, { prio: 2 }));
    at(10 * 60 + 30, () => { makeTicket("heat", r, { cause: "blank" }); say(MENTOR, "溫度告警！按右上角的「熱圖」看哪裡紅，到機櫃正面看看是不是少了盲板。"); });
    at(13 * 60, () => { makeTicket("crah", r, { fault: "filter" }); say(MENTOR, "空調停了！先去看故障碼，不要直接重設。溫度會一直升高，動作要快。"); });
    at(15 * 60, () => makeTicket("disk", r));
  } else if (day === 3) {
    at(8 * 60, () => { say(MENTOR, "今天有新機要上架。去組裝測試間拿新機，記得帶螺絲起子和網路線。"); makeTicket("stack", r, { model: "C2" }); });
    at(10 * 60, () => { makeTicket("breaker", r); say(MENTOR, "配電跳脫！看背面配電單元的負載，先把 GPU 機的 A 路改插備用迴路，再重設。直接重設會再跳一次。"); });
    at(11 * 60 + 30, () => makeTicket("link", r));
    at(13 * 60, () => makeTicket("heat", r, { cause: "box" }));
    at(15 * 60, () => makeTicket("fan", r));
  } else {
    const n = Math.min(10, 5 + Math.floor(day / 2));
    const types = ["disk", "disk", "psu", "fan", "link", "heat", "stack"];
    for (let k = 0; k < n; k++) at(8 * 60 + Math.floor((k / n) * 480 + r() * 30), () => makeTicket(types[Math.floor(r() * types.length)], r));
    if (r() < 0.8) at(10 * 60 + Math.floor(r() * 300), () => makeTicket("crah", r));
    if (day % 2 === 0) at(11 * 60 + Math.floor(r() * 240), () => makeTicket("breaker", r));
    at(8 * 60, () => say(MENTOR, `第 ${day} 天，今天你自己顧整間 A 機房了，加油！`));
  }
  return ev.sort((a, b) => a.t - b.t);
}
/** 其他機房：別組負責，只有燈號在閃 */
function ambient() {
  const r = M.rng(S.day * 31 + 5);
  for (const L of ["B", "C", "D"]) for (const rk of M.halls[L].racks) rk.amb = r() < 0.012;
}
export function startDay(day = S.day) {
  S.day = day; S.clock = 8 * 60; S.over = false; S.dialog = []; S.tickets = []; S.incidents = []; S.violations = []; S.done = [];
  S.scanned.clear(); S.cleaned.clear(); S.rebuilds = []; S.inv = []; S.tools = { scanner: true, esd: false, screwdriver: false, pen: false };
  for (const b of S.boxes) M.removeObject(b); S.boxes = [];
  for (const c of M.crahs) { c.ok = true; c.fault = null; c.since = null; }
  Object.assign(S.player, { x: M.places.lobby.x + 0.5, y: M.places.lobby.y + 0.5, path: [], moving: false, target: null });
  S.events = script(day); ambient(); updateHeat(true);
  emit("day", day);
}

/* ---------------- 每一幀 ---------------- */
export function tick(dtReal) {
  if (S.paused || S.over) return;
  const dt = dtReal * S.speed;               // 遊戲分鐘
  S.clock += dt;
  while (S.events.length && S.events[0].t <= S.clock) S.events.shift().fn();
  for (const rb of S.rebuilds.slice()) if (S.clock >= rb.until) { delete rb.s.faults.drive; S.rebuilds.splice(S.rebuilds.indexOf(rb), 1); toast(`${hostname(rb.rack, rb.s)} 陣列重建完成 ✔`); emit("change"); }
  for (const rk of HALL_A.racks) for (const s of rk.servers) if (s.out !== undefined && S.clock - s.out > 10 && s.up && !s.hot) { s.hot = true; s.up = false; incident(`${hostname(rk, s)} 拉出來太久（超過 10 分鐘），過熱關機`); }
  updateHeat();
  for (const t of S.tickets) {
    if (t.state !== "open") continue;
    if (t.type === "heat" && !t.found && sideAt(t.rack)) t.found = true;
    if (resolved(t)) {
      t.state = "done"; t.closed = S.clock; const onTime = S.clock <= t.due;
      S.xp += onTime ? 30 + (3 - t.prio) * 15 : 10;
      toast(`✅ 工單 #${t.id} 完成${onTime ? "（在時限內）" : "（逾時）"}`, "good"); emit("ticket", t);
    }
  }
  if (S.clock >= S.shiftEnd && !S.over) endShift();
}
export function endShift() {
  S.over = true;
  const all = S.tickets, ok = all.filter((t) => t.state === "done" && t.closed <= t.due).length;
  const sla = all.length ? ok / all.length : 1;
  const stars = sla >= 0.9 && !S.incidents.length ? 3 : sla >= 0.7 && S.incidents.length <= 1 ? 2 : 1;
  const res = { day: S.day, tickets: all.length, done: all.filter((t) => t.state === "done").length, onTime: ok, sla, incidents: S.incidents.slice(), violations: S.violations.slice(), stars, xp: S.xp };
  while (S.xp >= S.level * 120) S.level++;
  save(res);
  emit("end", res);
  return res;
}
export const LEVELS = ["", "實習技術員", "技術員", "資深技術員", "值班組長", "機房主任"];
export function levelName() { return LEVELS[Math.min(LEVELS.length - 1, S.level)]; }
function save(res) { try { const d = JSON.parse(localStorage.getItem("dc-tech") || "{}"); d.day = res.day + 1; d.xp = S.xp; d.level = S.level; d.history = [...(d.history || []), { day: res.day, stars: res.stars, sla: res.sla }].slice(-30); localStorage.setItem("dc-tech", JSON.stringify(d)); } catch (e) { /* 私密模式等 */ } }
export function load() { try { const d = JSON.parse(localStorage.getItem("dc-tech") || "{}"); if (d.day) { S.day = d.day; S.xp = d.xp || 0; S.level = d.level || 1; } return d; } catch (e) { return {}; } }

/* ---------------- 移動 ---------------- */
export function walkTo(x, y) {
  const p = S.player;
  const path = findPath(Math.floor(p.x), Math.floor(p.y), x, y);
  if (!path) return false;
  p.path = path; p.moving = path.length > 0;
  return true;
}
export function stepPlayer(dtReal) {
  const p = S.player;
  if (!p.path.length) { p.moving = false; return; }
  const speed = (p.run ? 11 : 6.5);            // 格/秒（約 4 m/s、6.6 m/s）
  let left = speed * dtReal;
  while (left > 0 && p.path.length) {
    const n = p.path[0], tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 1e-4) { const ax = Math.sign(dx), ay = Math.sign(dy); p.dir = ax > 0 && ay >= 0 ? 0 : ax <= 0 && ay > 0 ? 1 : ax < 0 ? 2 : 3; if (ax > 0 && ay < 0) p.dir = 3; if (ax < 0 && ay > 0) p.dir = 1; }
    if (d <= left) { p.x = tx; p.y = ty; left -= d; p.path.shift(); }
    else { p.x += (dx / d) * left; p.y += (dy / d) * left; left = 0; }
  }
  p.walkT += dtReal;
  p.moving = p.path.length > 0;
  if (!p.moving) emit("arrive", p.target);
}
