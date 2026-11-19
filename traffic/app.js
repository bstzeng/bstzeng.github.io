// 塞車模擬器：介面
import { Sim, KMH } from "./engine.js";
import { SCENARIOS } from "./scenarios.js";
import { Renderer, drawSeries, drawHeat } from "./render.js";

const $ = (s) => document.querySelector(s);
const DT = 0.2;

const R = new Renderer($("#cv"));
const S = { idx: 0, sc: null, built: null, sim: null, run: true, speed: 4, acc: 0, view: "focus", last: performance.now(), uiT: 0, chartT: 0 };

/* ---------- 情境清單 ---------- */
function buildList() {
  const list = $("#scList"), sel = $("#scSelect");
  let html = "", opt = "", grp = "";
  SCENARIOS.forEach((sc, i) => {
    if (sc.group !== grp) {
      grp = sc.group;
      html += `<h4>${grp}</h4>`;
      opt += (i ? "</optgroup>" : "") + `<optgroup label="${grp}">`;
    }
    html += `<button data-i="${i}"><span class="no">${String(i + 1).padStart(2, "0")}</span><span>${sc.name}</span></button>`;
    opt += `<option value="${i}">${i + 1}. ${sc.name}</option>`;
  });
  list.innerHTML = html;
  sel.innerHTML = opt + "</optgroup>";
  list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) load(+b.dataset.i); });
  sel.addEventListener("change", () => load(+sel.value));
}

/* ---------- 載入情境 ---------- */
function load(i, keepView = false) {
  S.idx = i;
  S.sc = SCENARIOS[i];
  const b = S.sc.build();
  S.built = b;
  const truck = b.truckPct ?? 0.1, noise = b.noise ?? 0.15;
  S.sim = new Sim(b.net, { main: b.main, truckPct: truck, busPct: b.busPct ?? 0, noise, courtesy: b.courtesy ?? 0.5, onStep: b.onStep });
  R.setNet(b.net);
  R.selected = null;
  $("#vinfo").hidden = true;
  $("#truck").value = Math.round(truck * 100); $("#truckV").textContent = Math.round(truck * 100);
  $("#noise").value = noise; noiseLabel();
  $("#scGroup").textContent = S.sc.group.toUpperCase() + " · " + String(i + 1).padStart(2, "0");
  $("#scName").textContent = S.sc.name;
  $("#scDesc").textContent = S.sc.desc;
  document.querySelectorAll("#scList button").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
  $("#scSelect").value = i;
  buildControls();
  if (!keepView) setView(S.view);
  S.acc = 0;
  if (!keepView) warmup();
  try { history.replaceState(null, "", "#" + S.sc.id); } catch {}
  updateUI(true);
}

/** 先在背景跑一段時間，打開就看得到車流 */
function warmup() {
  const t0 = performance.now();
  while (S.sim.t < 150 && performance.now() - t0 < 1500) S.sim.step(DT);
}

function setView(mode) {
  S.view = mode;
  S.userMoved = false;
  if (mode === "all") R.fit(R.bounds(), 30);
  else {
    const f = S.built.focus;
    R.cam.x = f.x; R.cam.y = f.y;
    // 聚焦時放大到看得清楚每一台車
    R.cam.z = Math.max(0.15, Math.min((R.W - 20) / f.w, (R.H - 20) / (f.w * 0.6)));
  }
}

/* ---------- 控制項 ---------- */
function buildControls() {
  const box = $("#controls");
  box.innerHTML = "";
  for (const c of S.built.controls) {
    const el = document.createElement("div");
    if (c.type === "flow") {
      const v = c.road.src.flow;
      el.innerHTML = `<label class="ctl"><span>${c.label} <b>${v} 輛/時</b></span><input type="range" min="0" max="${c.max}" step="${c.step}" value="${v}"></label>`;
      const inp = el.querySelector("input"), out = el.querySelector("b");
      inp.addEventListener("input", () => { c.road.src.flow = +inp.value; out.textContent = inp.value + " 輛/時"; });
    } else if (c.type === "split") {
      const v = Math.round((c.road.split[c.to.id] ?? 0) * 100);
      el.innerHTML = `<label class="ctl"><span>${c.label} <b>${v}%</b></span><input type="range" min="0" max="${c.max}" step="1" value="${v}"></label>`;
      const inp = el.querySelector("input"), out = el.querySelector("b");
      inp.addEventListener("input", () => { c.road.split[c.to.id] = +inp.value / 100; out.textContent = inp.value + "%"; });
    } else if (c.type === "endsplit") {
      const wa = c.road.endW[c.a.id] ?? 50, wb = c.road.endW[c.b.id] ?? 50;
      const v = Math.round(wa / (wa + wb) * 100);
      el.innerHTML = `<label class="ctl"><span>${c.label} <b>${v}%</b></span><input type="range" min="0" max="100" step="1" value="${v}"></label>`;
      const inp = el.querySelector("input"), out = el.querySelector("b");
      inp.addEventListener("input", () => {
        const x = +inp.value;
        c.road.endW[c.a.id] = Math.max(0.001, x); c.road.endW[c.b.id] = Math.max(0.001, 100 - x);
        out.textContent = x + "%";
      });
    } else if (c.type === "range") {
      el.innerHTML = `<label class="ctl"><span>${c.label} <b>${c.value} ${c.unit || ""}</b></span><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}"></label>`;
      const inp = el.querySelector("input"), out = el.querySelector("b");
      inp.addEventListener("input", () => { c.value = +inp.value; c.set(S.sim, c.value); out.textContent = `${inp.value} ${c.unit || ""}`; });
      c.set(S.sim, c.value);
    } else if (c.type === "toggle") {
      el.innerHTML = `<label class="ctl tg"><span>${c.label}</span><span class="switch"><input type="checkbox" ${c.value ? "checked" : ""}><i></i></span></label>`;
      const inp = el.querySelector("input");
      inp.addEventListener("change", () => {
        c.value = inp.checked; c.set(S.sim, c.value);
        if (c.rebuild) R.build();
      });
      c.set(S.sim, c.value);
    } else if (c.type === "select") {
      el.innerHTML = `<label class="ctl"><span>${c.label}</span><select>${c.options.map((o, i) => `<option value="${i}" ${i === c.value ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
      const inp = el.querySelector("select");
      inp.addEventListener("change", () => { c.value = +inp.value; c.set(S.sim, c.value); });
      c.set(S.sim, c.value);
    } else if (c.type === "button") {
      el.innerHTML = `<button class="btn">${c.label}</button>`;
      el.querySelector("button").addEventListener("click", () => c.act(S.sim));
    }
    box.appendChild(el);
  }
  if (S.built.controls.some((c) => c.rebuild)) R.build();
}

function noiseLabel() {
  const v = +$("#noise").value;
  $("#noiseV").textContent = v < 0.08 ? "很穩" : v < 0.25 ? "中" : v < 0.45 ? "偏高" : "很急躁";
}
$("#truck").addEventListener("input", (e) => { S.sim.truckPct = +e.target.value / 100; $("#truckV").textContent = e.target.value; });
$("#noise").addEventListener("input", (e) => { S.sim.noise = +e.target.value; noiseLabel(); });

/* ---------- 工具列 ---------- */
$("#bPlay").addEventListener("click", () => { S.run = !S.run; $("#bPlay").textContent = S.run ? "⏸" : "▶"; S.last = performance.now(); });
$("#speeds").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  S.speed = +b.dataset.s;
  document.querySelectorAll("#speeds button").forEach((x) => x.classList.toggle("on", x === b));
});
$("#bReset").addEventListener("click", () => {
  // 保留目前的滑桿設定
  const flows = {}, splits = {};
  for (const r of S.built.net.roads) { if (r.src) flows[r.id] = r.src.flow; splits[r.id] = { split: { ...r.split }, endW: { ...r.endW } }; }
  const ctlVals = S.built.controls.map((c) => c.value);
  const truck = S.sim.truckPct, noise = S.sim.noise;
  load(S.idx, true);
  for (const r of S.built.net.roads) {
    if (r.src && flows[r.id] != null) r.src.flow = flows[r.id];
    if (splits[r.id]) { r.split = splits[r.id].split; r.endW = splits[r.id].endW; }
  }
  S.built.controls.forEach((c, i) => { if (ctlVals[i] !== undefined && "value" in c) c.value = ctlVals[i]; });
  S.sim.truckPct = truck; S.sim.noise = noise;
  $("#truck").value = Math.round(truck * 100); $("#truckV").textContent = Math.round(truck * 100);
  $("#noise").value = noise; noiseLabel();
  buildControls();
  warmup();
});
$("#bView").addEventListener("click", () => setView(S.view === "all" ? "focus" : "all"));
$("#bColor").addEventListener("click", () => {
  R.colorMode = R.colorMode === "speed" ? "type" : "speed";
  $("#bColor").textContent = R.colorMode === "speed" ? "顏色：速度" : "顏色：車種";
  const lg = $("#legend");
  lg.classList.toggle("types", R.colorMode === "type");
  lg.innerHTML = R.colorMode === "speed"
    ? `<span>車速</span><i class="grad"></i><span class="mono">0</span><span class="mono r">100+ km/h</span>`
    : `<span>車種</span><i class="grad"></i><span>小客車</span><span>大貨車</span><span>公車</span>`;
});

/* ---------- 拖曳 / 縮放 / 點選 ---------- */
const cv = $("#cv");
const ptrs = new Map();
let pinch = null, moved = false;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  moved = false;
  cv.classList.add("drag");
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: R.cam.z };
  }
});
cv.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
  if (ptrs.size === 1) {
    R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
    if (moved) S.userMoved = true;
  }
  p.x = e.offsetX; p.y = e.offsetY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * d / pinch.d / R.cam.z);
  }
});
const up = (e) => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (!ptrs.size) cv.classList.remove("drag");
  if (!moved && e.type === "pointerup") {
    const v = R.pick(S.sim, e.offsetX, e.offsetY);
    R.selected = v;
    $("#vinfo").hidden = !v;
  }
};
cv.addEventListener("pointerup", up);
cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
function zoomAt(px, py, f) {
  const w = R.toWorld(px, py);
  R.cam.z = Math.max(0.05, Math.min(30, R.cam.z * f));
  R.cam.x = w.x - (px - R.W / 2) / R.cam.z;
  R.cam.y = w.y - (py - R.H / 2) / R.cam.z;
}
new ResizeObserver(() => { R.resize(); }).observe($(".stage"));

/* ---------- 統計 ---------- */
const fmtT = (t) => { t = Math.round(t); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const fmtDur = (t) => (t < 60 ? `${Math.round(t)} 秒` : `${Math.floor(t / 60)} 分 ${Math.round(t % 60)} 秒`);

/** 內容有變才更新，減少瀏覽器重新排版 */
const htmlCache = {};
function setHTML(sel, html) {
  if (htmlCache[sel] === html) return;
  htmlCache[sel] = html;
  $(sel).innerHTML = html;
}

function updateUI(force) {
  const sim = S.sim, s = sim.summary();
  $("#clock").textContent = "模擬 " + fmtT(s.t);
  setHTML("#stats", [
    ["路網內車輛", `${s.n} 輛`],
    ["平均車速", `${s.speed.toFixed(0)} km/h`, s.speed < 30 ? "bad" : s.speed > 70 ? "good" : ""],
    ["已通過車輛", `${s.exited} 輛`],
    ["通過量", `${s.flow} 輛/時`],
    ["平均旅行時間", s.exited ? fmtDur(s.tt) : "—"],
    ["每車延誤", s.exited ? fmtDur(s.delay) : "—", s.delay > 60 ? "bad" : ""],
    ["入口排隊", `${s.queue} 輛`, s.queue > 5 ? "bad" : ""],
    ["錯過出口", `${s.missed} 輛`],
    ["碰撞", `${s.collisions} 次`, s.collisions ? "bad" : "good"],
    ...(s.ems ? [["上一台救護車", `${fmtDur(s.ems.tt)}（順暢約 ${fmtDur(s.ems.ff)}）`, s.ems.tt > s.ems.ff * 1.4 ? "bad" : "good"]] : []),
  ].map(([k, v, c]) => `<div class="st ${c || ""}"><small>${k}</small><b>${v}</b></div>`).join(""));

  let t = `<table><tr><th>入口</th><th>設定</th><th>實際進入</th><th>排隊</th></tr>`;
  for (const x of s.srcs) t += `<tr><td>${x.name}</td><td class="n">${x.flow}</td><td class="n">${s.t > 30 ? x.rate : "—"}</td><td class="n ${x.queue > 5 ? "warn" : ""}">${x.queue}</td></tr>`;
  t += `</table>`;
  const sinks = Object.entries(s.sinks);
  if (sinks.length) {
    t += `<table><tr><th>出口</th><th>通過</th><th>平均旅行時間</th></tr>`;
    for (const [k, v] of sinks.sort((a, b) => b[1].n - a[1].n)) t += `<tr><td>${k}</td><td class="n">${v.n}</td><td class="n">${fmtDur(v.tt / v.n)}</td></tr>`;
    t += `</table>`;
  }
  setHTML("#tables", t);

  const v = R.selected;
  if (v && sim.vs.includes(v)) {
    const tn = { car: "小客車", truck: "大貨車", bus: "公車" }[v.type];
    $("#vinfo").innerHTML = `<b>#${v.id} ${tn}</b><br>車速 ${(v.v / KMH).toFixed(0)} km/h<br>位置：${v.road.name || v.road.id} 第 ${v.lane + 1} 車道<br>下一段：${v.next ? (v.next.name || v.next.id) : "離開路網"}<br>已開 ${fmtDur(sim.t - v.t0)}`;
  } else if (v) { $("#vinfo").hidden = true; R.selected = null; }
}

function updateCharts() {
  drawSeries($("#chart"), S.sim.st.series);
  const heat = $("#heat");
  heat.parentElement && (heat.style.display = S.sim.mainLen ? "block" : "none");
  heat.previousElementSibling.style.display = S.sim.mainLen ? "block" : "none";
  if (S.sim.mainLen) drawHeat(heat, S.sim.st.heat, S.sim.mainLen);
}

/* ---------- 主迴圈 ---------- */
/** 記下每台車「上一步」與「這一步」的位置，畫面在兩者之間平滑內插 */
function snapPoses() {
  const sim = S.sim;
  for (const v of sim.vs) {
    const p = sim.pose(v);
    v.pA = v.pB || p;
    v.pB = p;
  }
}

const perf = { ema: 16, slow: 0 };
function loop(now) {
  const dt = Math.min(0.1, (now - S.last) / 1000);
  S.last = now;
  // 畫面一直跟不上就自動降低解析度
  perf.ema = perf.ema * 0.95 + dt * 1000 * 0.05;
  if (perf.ema > 24 && (R.maxDpr || 1.5) > 1 && !document.hidden) {
    if (++perf.slow > 120) { R.maxDpr = 1; R.resize(); perf.slow = 0; }
  } else perf.slow = 0;
  if (S.run && S.sim) {
    S.acc += dt * S.speed;
    const t0 = performance.now();
    let n = 0;
    while (S.acc >= DT && n < 120) {
      S.sim.step(DT);
      S.acc -= DT; n++;
      const out = performance.now() - t0 > 28;
      if (out) S.acc = Math.min(S.acc, DT * 0.99);
      // 只需要最後兩步的位置來內插
      if (S.acc < 2 * DT) snapPoses();
      if (out) break;
    }
  }
  R.alpha = S.run ? Math.max(0, Math.min(1, S.acc / DT)) : 1;
  if (S.built.follow && S.view === "focus" && !S.userMoved) {
    const f = S.built.follow(S.sim);
    if (f) {
      const p = f.road.path.at(Math.max(0, Math.min(f.s, f.road.len)));
      R.cam.x += (p.x - R.cam.x) * 0.05; R.cam.y += (p.y + 5 - R.cam.y) * 0.05;
    }
  }
  R.draw(S.sim);
  S.uiT += dt; S.chartT += dt;
  if (S.uiT > 0.8) { S.uiT = 0; updateUI(); }
  if (S.chartT > 1.5) { S.chartT = 0; updateCharts(); }
  requestAnimationFrame(loop);
}

buildList();
R.resize();
const hashI = SCENARIOS.findIndex((s) => "#" + s.id === location.hash);
load(hashI >= 0 ? hashI : 0);
window.addEventListener("hashchange", () => {
  const i = SCENARIOS.findIndex((x) => "#" + x.id === location.hash);
  if (i >= 0 && i !== S.idx) load(i);
});
updateCharts();
requestAnimationFrame(loop);
