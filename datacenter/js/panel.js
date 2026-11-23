// 特寫面板：機櫃正面／背面、單台伺服器、備品架、工具台、退貨箱、空調、監控牆
import * as M from "./map.js";
import * as G from "./sim.js";
const { S } = G;

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const ledCls = (st) => ({ ok: "led ok", warn: "led warn", fail: "led fail", off: "led off" })[st] || "led";
let cur = null;           // {ob, side, sel}
export const panelState = () => cur;
export function close() { cur = null; $("#panel").hidden = true; }
export function isOpen() { return !!cur; }
export function refresh() { if (cur) render(); }
export function open(ob, side, opts = {}) { cur = { ob, side, sel: opts.sel ?? (cur && cur.ob === ob ? cur.sel : null) }; $("#panel").hidden = false; render(); }

function header(title, sub) {
  const h = el("div", "phead");
  h.append(el("div", "ptitle", `${title}${sub ? `<small>${sub}</small>` : ""}`));
  const x = el("button", "pclose", "✕"); x.onclick = close; h.append(x);
  return h;
}
function btn(label, fn, cls = "") { const b = el("button", "pbtn " + cls, label); b.onclick = () => { fn(); refresh(); }; return b; }

function render() {
  const box = $("#panel"); box.innerHTML = "";
  const { ob } = cur;
  const k = ob.kind;
  if (k === "rack") return rackPanel(box);
  if (k === "shelf" || k === "staging") return shelfPanel(box);
  if (k === "toolbench" || k === "locker") return toolPanel(box);
  if (k === "rma") return rmaPanel(box);
  if (k === "crah") return crahPanel(box);
  if (k === "box") { box.append(header("紙箱", "擋在冷通道的出風地板上")); const b = el("div", "pbody"); b.append(el("p", "", "有人把紙箱放在有孔地板上，冷風吹不上來，前面機櫃就會變熱。"), btn("搬走紙箱", () => { if (G.removeBox(ob)) close(); }, "main")); box.append(b); return; }
  if (k === "videowall" || (k === "desk" && M.roomAt(ob.x, ob.y)?.kind === "noc")) return nocPanel(box);
  const info = {
    ups: ["不斷電系統", "停電時先由電池撐住，等發電機起來。螢幕顯示：負載 62%、電池 100%。"],
    battery: ["電池架", "一排排的鉛酸電池，溫度 24°C，一切正常。"],
    switchgear: ["配電盤", "市電與發電機切換的地方。非電力人員請勿操作。"],
    generator: ["柴油發電機", "每月例行試車。今天精神很好 ☀️"],
    tank: ["儲油槽", "可以讓發電機滿載跑 48 小時。"],
    tower: ["冷卻水塔", "把空調的熱帶走，風扇正呼呼轉著。"],
    pdu: ["機房配電櫃", "供電給一整區機櫃的配電單元。"],
    netrack: ["網路匯接櫃", "電信業者的光纖從這裡進來，接到核心交換器。"],
    reception: ["服務台", "訪客要先在這裡登記，換證才能進安檢門。"],
    vending: ["飲料機", "值班的好朋友。（今天的特價是奶茶）"],
    desk: ["桌子", "上面有幾台螢幕和一杯冷掉的咖啡。"],
    pallet: ["棧板", "剛到貨的新機還在拆封。"],
    forklift: ["堆高機", "需要證照才能開喔。"],
    workbench: ["工作台", "新機開箱、裝滑軌、燒機測試的地方。"],
  }[k] || [ob.label || "設備", "看起來一切正常。"];
  box.append(header(ob.label || info[0]), el("div", "pbody", `<p>${info[1]}</p>`));
}

/* ---------------- 機櫃 ---------------- */
function rackPanel(box) {
  const { ob } = cur, rack = ob.rack;
  const side = G.sideAt(rack) || cur.side || "front";
  cur.side = side;
  const ro = rack.hall !== "A";
  box.append(header(`機櫃 ${rack.label}`, `${side === "front" ? "正面（冷通道）" : "背面（熱通道）"}${ro ? "・別組負責" : ""}`));
  const body = el("div", "pbody rackbody");
  // 左：機櫃立面
  const elev = el("div", "elev");
  const servers = [...rack.servers].sort((a, b) => b.u - a.u);
  const rows = [];
  for (let u = 42; u >= 1; u--) {
    const s = rack.servers.find((x) => x.u <= u && u < x.u + M.MODELS[x.model].u);
    if (s) { if (s.u + M.MODELS[s.model].u - 1 === u) rows.push({ s, u }); continue; }
    rows.push({ u, empty: true, missing: rack.missing && rack.missing.includes(u), blank: rack.blanks.includes(u) });
  }
  const stackT = S.tickets.find((t) => t.state === "open" && t.type === "stack" && t.rack === rack);
  for (const r of rows) {
    if (r.s) {
      const s = r.s, m = M.MODELS[s.model], st = G.serverState(rack, s);
      const d = el("div", `unit m${s.model} ${side} ${cur.sel === s ? "sel" : ""}`);
      d.style.height = `${m.u * 15}px`;
      const tk = S.tickets.find((t) => t.state === "open" && t.rack === rack && t.s === s);
      d.innerHTML = `<span class="u">U${s.u}</span><span class="nm">${G.hostname(rack, s)}</span>${tk ? `<span class="tag">#${tk.id}</span>` : ""}${st === "fail" ? '<span class="mood">(；ω；)</span>' : st === "off" ? '<span class="mood">(×_×)</span>' : ""}<i class="${ledCls(st)}"></i>`;
      d.onclick = () => { cur.sel = s; refresh(); };
      elev.append(d);
    } else {
      const d = el("div", `unit empty ${r.missing ? "missing" : ""}`);
      d.style.height = "15px";
      d.innerHTML = `<span class="u">U${r.u}</span><span class="nm">${r.missing ? "空缺！熱風會回流" : r.blank ? "盲板" : "空"}</span>`;
      if (r.missing && !ro) d.onclick = () => { G.installBlank(rack, r.u); refresh(); };
      if (stackT && r.u === stackT.u && !ro) { d.classList.add("target"); d.querySelector(".nm").textContent = `⬇ 新機上架到這裡（U${r.u}）`; d.onclick = () => { const s = G.installServer(rack, r.u, stackT.part); if (s) cur.sel = s; refresh(); }; }
      elev.append(d);
    }
  }
  body.append(elev);
  // 右：詳細
  const det = el("div", "detail");
  const sw = el("div", "row");
  sw.append(btn(side === "front" ? "繞到背面（熱通道）↺" : "繞到正面（冷通道）↺", () => cur.goSide && cur.goSide(side === "front" ? "back" : "front")));
  det.append(sw);
  if (ro) det.append(el("p", "note", "這間機房由另一組值班同仁負責，你只能看，不能動手。"));
  if (side === "back" && !ro) det.append(pduBox(rack));
  if (!cur.sel) det.append(el("p", "hint", "👈 點左邊的機器看詳細。亮<b class='amber'>琥珀燈</b>、哭臉的就是有問題的。"));
  else det.append(serverBox(rack, cur.sel, side, ro));
  body.append(det);
  box.append(body);
}
function serverBox(rack, s, side, ro) {
  const m = M.MODELS[s.model], st = G.serverState(rack, s);
  const d = el("div", "srv");
  const scanned = S.scanned.has(`${rack.id}:${s.i}`);
  d.append(el("div", "srvhead", `<b>${G.hostname(rack, s)}</b><span>${m.name}</span><span>序號：${scanned ? s.serial : "＊＊＊（掃描後顯示）"}</span><span>狀態：<i class="${ledCls(st)}"></i> ${{ ok: "正常", warn: "處理中", fail: "故障", off: "關機" }[st]}</span>`));
  if (ro) return d;
  const act = el("div", "row");
  act.append(btn("📷 掃描標籤", () => { const r = G.scan(rack, s); if (r) G.toast(r.match ? `✔ ${r.host} 與工單 #${r.ticket.id} 相符` : `這台 ${r.host} 沒有工單`, r.match ? "good" : "info"); }, scanned ? "done" : "main"));
  d.append(act);
  if (s.model === "SW") { d.append(el("p", "note", "機櫃頂交換器：48 個埠的燈都在閃，很健康。")); return d; }
  if (s.fresh && side === "back") {
    const r2 = el("div", "row");
    for (const [k, lab] of [["pA", "接 A 路電源"], ["pB", "接 B 路電源"], ["net", "接網路線"]]) r2.append(btn(s.pulled[k] ? lab : `${lab} ✔`, () => s.pulled[k] && G.cableNew(rack, s, k), s.pulled[k] ? "" : "done"));
    d.append(r2);
  }
  if (side === "front") {
    d.append(el("h4", "", `硬碟 ${m.drives} 槽（點一下：拔出／插入）`));
    const bays = el("div", "bays");
    for (let k = 0; k < m.drives; k++) {
      const p = s.pulled["d" + k];
      const rb = S.rebuilds.find((r) => r.s === s && r.slot === k);
      const stc = p ? "empty" : rb ? "rebuild" : s.faults.drive === k ? "fail" : "ok";
      const b = el("button", "bay " + stc, `<i></i><span>${k + 1}</span>`);
      b.title = { empty: "空槽：點一下插入", rebuild: "重建中", fail: "故障（琥珀燈）", ok: "正常" }[stc];
      b.onclick = () => { if (p) G.insertDrive(rack, s, k); else if (!rb) G.pullDrive(rack, s, k); refresh(); };
      bays.append(b);
    }
    d.append(bays);
    if (m.fans) {
      d.append(el("h4", "", "風扇"));
      const r3 = el("div", "row");
      r3.append(btn(s.out !== undefined ? "推回機櫃 ⇥" : "沿滑軌拉出、開上蓋 ⇤", () => G.slideOut(rack, s, s.out === undefined)));
      d.append(r3);
      if (s.out !== undefined) {
        const fans = el("div", "bays fans");
        for (let k = 0; k < m.fans; k++) { const f = el("button", "bay fan " + (s.faults.fan === k ? "fail" : "ok"), `<i>${s.faults.fan === k ? "✖" : "✺"}</i><span>${k + 1}</span>`); f.onclick = () => { G.replaceFan(rack, s, k); refresh(); }; fans.append(f); }
        d.append(fans, el("p", "note", `已拉出 ${Math.floor(S.clock - s.out)} 分鐘（超過 10 分鐘會過熱）`));
      }
    }
  } else {
    d.append(el("h4", "", "電源供應器（雙電源）"));
    const psus = el("div", "bays psus");
    for (let k = 0; k < 2; k++) {
      const p = s.pulled["p" + k];
      const stc = p ? "empty" : s.faults.psu === k ? "fail" : s.up ? "ok" : "off";
      const b = el("button", "bay psu " + stc, `<i></i><span>PSU ${k + 1}</span>`);
      b.onclick = () => { if (p) G.insertPSU(rack, s, k); else G.pullPSU(rack, s, k); refresh(); };
      psus.append(b);
    }
    d.append(psus);
    d.append(el("h4", "", `資料埠（${M.PARTS[m.nic].name}）`));
    const ports = el("div", "bays ports");
    for (let k = 0; k < 2; k++) {
      const p = s.pulled["n" + k];
      const stc = p ? "empty" : s.faults.link === k ? "dark" : "link";
      const b = el("button", "bay port " + stc, `<i></i><span>埠 ${k + 1}</span>`);
      b.onclick = () => { if (p) G.plug(rack, s, k); else G.unplug(rack, s, k); refresh(); };
      ports.append(b);
      if (p && m.nic === "LC") { const c = btn(S.cleaned.has(`${rack.id}:${s.i}:${k}`) ? "已清潔 ✨" : `清潔埠 ${k + 1}`, () => G.cleanPort(rack, s, k), "small"); ports.append(c); }
    }
    d.append(ports);
  }
  return d;
}
function pduBox(rack) {
  const d = el("div", "pdu");
  const aA = G.rackAmps(rack, "A") + (rack.overload || 0), aB = G.rackAmps(rack, "B");
  d.innerHTML = `<h4>機櫃配電單元</h4><div class="feeds"><span class="${rack.pdu.A.on ? "on" : "off"}">A 路 ${rack.pdu.A.on ? `${aA.toFixed(1)}A` : "跳脫 ⚡"}</span><span class="${rack.pdu.B.on ? "on" : "off"}">B 路 ${aB.toFixed(1)}A</span><span class="lim">上限 16A</span></div>`;
  if (!rack.pdu.A.on) {
    d.append(el("p", "note", `跳脫前 A 路負載約 ${(aA).toFixed(1)}A，超過上限。耗電大的機器：`));
    const r = el("div", "row");
    for (const s of rack.servers.filter((x) => x.model === "G4" || x.model === "S4").slice(0, 4)) r.append(btn(s.spare ? `${G.hostname(rack, s)} 已改插 ✔` : `${G.hostname(rack, s)} A 路改插備用迴路`, () => !s.spare && G.movePlug(rack, s), s.spare ? "done small" : "small"));
    d.append(r, btn("重設 A 路斷路器", () => G.resetBreaker(rack, "A"), "main"));
  }
  return d;
}

/* ---------------- 架子、工具、退貨 ---------------- */
function shelfPanel(box) {
  const { ob } = cur;
  const parts = ob.kind === "staging" ? ["SRV-C1", "SRV-C2"] : ob.parts;
  box.append(header(ob.label, `背包 ${G.invUsed()}/${S.cap} 格`));
  const b = el("div", "pbody");
  if (!parts.length) b.append(el("p", "", "空的備用架。"));
  const grid = el("div", "parts");
  for (const p of parts) {
    const it = M.PARTS[p];
    const c = el("button", "part", `<span class="ic">${it.icon}</span><b>${it.name}</b><small>${p}${it.size ? `・佔 ${it.size} 格` : ""}</small>`);
    c.onclick = () => { G.takePart(p, ob); refresh(); };
    grid.append(c);
  }
  b.append(grid);
  const mine = S.inv.map((it, k) => ({ it, k })).filter(({ it }) => it.state === "new" && parts.includes(it.part));
  if (mine.length) { b.append(el("h4", "", "放回架上")); const r = el("div", "row"); for (const { it, k } of mine) r.append(btn(`${M.PARTS[it.part].icon} ${it.part} 放回`, () => G.returnPart(k, ob), "small")); b.append(r); }
  box.append(b);
}
function toolPanel(box) {
  box.append(header("工具台", "防靜電手環、工具"));
  const b = el("div", "pbody");
  const grid = el("div", "parts");
  for (const [k, ic, desc] of [["esd", "🩷", "碰零件前一定要戴，不然靜電可能打壞零件"], ["screwdriver", "🪛", "拉出伺服器開上蓋、上架鎖滑軌要用"], ["pen", "🖊️", "接光纖前先清潔光纖頭"], ["scanner", "📷", "掃描標籤確認序號（一直帶在身上）"]]) {
    const c = el("button", "part " + (S.tools[k] ? "on" : ""), `<span class="ic">${ic}</span><b>${G.TOOL_NAME[k]}</b><small>${desc}</small><em>${S.tools[k] ? "已帶 ✔" : "拿取"}</em>`);
    c.onclick = () => { if (k !== "scanner") G.takeTool(k); refresh(); };
    grid.append(c);
  }
  b.append(grid); box.append(b);
}
function rmaPanel(box) {
  box.append(header("退貨箱", "壞零件放這裡寄回原廠"));
  const b = el("div", "pbody");
  const bad = S.inv.map((it, k) => ({ it, k })).filter(({ it }) => it.state !== "new");
  if (!bad.length) b.append(el("p", "", "背包裡沒有壞掉或拆下來的零件。"));
  const r = el("div", "row");
  for (const { it, k } of bad.reverse()) r.append(btn(`${M.PARTS[it.part].icon} ${M.PARTS[it.part].name}${it.state === "used" ? "（拆下的好件）" : "（壞）"} 放入`, () => G.returnPart(k, cur.ob), "small"));
  b.append(r); box.append(b);
}
function crahPanel(box) {
  const c = cur.ob.crah;
  box.append(header(c.label, c.ok ? "運轉中 😊" : "停機中！"));
  const b = el("div", "pbody");
  const inlet = (() => { let v = 0, n = 0; for (const rk of M.halls[c.hall].racks) if (Math.hypot(rk.ob.x - c.cx, rk.ob.y - c.cy) < 20 && c.hall === "A") { v += S.rackInlet[rk.id % 600]; n++; } return n ? v / n : 22; })();
  b.append(el("div", "crahinfo", `<span>出風溫度 <b>${c.ok ? "17.5" : "—"}°C</b></span><span>附近機櫃進風 <b>${inlet.toFixed(1)}°C</b></span><span>故障碼 <b>${c.ok ? "無" : c.inspected ? (c.fault === "trip" ? "E21 風扇馬達過載跳脫" : "E07 濾網壓差過高") : "（先查看）"}</b></span>`));
  if (c.hall !== "A") { b.append(el("p", "note", "這台由別組負責。")); box.append(b); return; }
  const r = el("div", "row");
  r.append(btn("查看故障碼", () => G.crahInspect(c)), btn("重設空調", () => G.crahReset(c), "main"), btn("更換濾網", () => G.crahFilter(c)));
  b.append(r); box.append(b);
}
function nocPanel(box) {
  box.append(header("監控大螢幕", `${G.fmtClock(S.clock)}・A 機房`));
  const b = el("div", "pbody");
  const open = S.tickets.filter((t) => t.state === "open");
  const hot = [...M.halls.A.racks].sort((a, c) => S.rackInlet[c.id % 600] - S.rackInlet[a.id % 600]).slice(0, 3);
  b.append(el("div", "crahinfo", `<span>未結工單 <b>${open.length}</b></span><span>空調 <b>${M.halls.A.crahs.filter((c) => c.ok).length}/14 運轉</b></span><span>最熱機櫃 <b>${hot.map((r) => `${r.label} ${S.rackInlet[r.id % 600].toFixed(1)}°C`).join("、")}</b></span><span>今天事故 <b>${S.incidents.length}</b></span>`));
  box.append(b);
}
