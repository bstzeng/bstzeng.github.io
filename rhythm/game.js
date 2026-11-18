// 節奏小達人：主程式
import { LEVELS, genMeasure, expand, soundKey } from "./data.js";
import { G, measureGeo, drawScore } from "./notation.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ================= 儲存 ================= */
const STORE = "rhythm-kid-v1";
const DEF = { bpm: 60, metro: true, strict: "normal", showA: false, latency: 0 };
const TOL = { easy: 0.5, normal: 0.3, hard: 0.15 }; // 長音可以提早放開幾拍
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || "{}");
    return { settings: { ...DEF, ...(d.settings || {}) }, stars: { A: {}, B: {}, C: {}, ...(d.stars || {}) } };
  } catch { return { settings: { ...DEF }, stars: { A: {}, B: {}, C: {} } }; }
}
const save = load();
const set = save.settings;
function persist() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch {} }

/* ================= 聲音 ================= */
const NOTE_HZ = 523.25;
let ctx = null, master = null;
// iPhone / iPad 開靜音模式時，網頁音效預設會被靜音。
// 改成「媒體播放」類型，並在第一次觸碰時播一段無聲音檔，讓聲音照常出來。
let silentEl = null;
function silentWavUrl() {
  const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  if (!silentEl) {
    silentEl = document.createElement("audio");
    silentEl.src = silentWavUrl();
    silentEl.loop = true;
    silentEl.setAttribute("playsinline", "");
  }
  if (silentEl.paused) silentEl.play().catch(() => {});
  ensureAudio();
  // 播一個極短的無聲緩衝，確保 iOS 真的啟動音訊
  try {
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch {}
}
function ensureAudio() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch { ctx = new AC(); }
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}
for (const ev of ["pointerdown", "touchend", "keydown"])
  document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
});
function click(t, accent, dest, vol = 1) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = accent ? 1568 : 1046;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.08);
}
/** 會持續到放開的琴聲（稍微衰減，但聽得出長短） */
function voice(t, dest, hz = NOTE_HZ) {
  const g = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o1.type = "triangle"; o1.frequency.value = hz;
  o2.type = "sine"; o2.frequency.value = hz * 2; g2.gain.value = 0.22;
  o1.connect(g); o2.connect(g2).connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.008);
  g.gain.setTargetAtTime(0.2, t + 0.02, 0.3);
  o1.start(t); o2.start(t);
  return {
    stop(at) {
      at = Math.max(at, t + 0.03);
      g.gain.setTargetAtTime(0, at, 0.025);
      o1.stop(at + 0.25); o2.stop(at + 0.25);
    },
  };
}
const tone = (t, dur, dest) => voice(t, dest).stop(t + Math.max(0.07, dur - 0.05));
function ding(hz = 1318, when = 0, vol = 0.18) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
}
const fanfare = () => [1046, 1318, 1568, 2093].forEach((h, i) => ding(h, i * 0.11, 0.15));

/** 現在喇叭正在播的音訊時間 */
function audioNow() {
  if (ctx.getOutputTimestamp) {
    const ts = ctx.getOutputTimestamp();
    if (ts.contextTime > 0 && ts.performanceTime > 0) {
      const v = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      if (Math.abs(v - ctx.currentTime) < 0.5) return v;
    }
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}
/** 事件發生當下的音訊時間（未扣延遲校正） */
function evtTime(e) {
  let d = (performance.now() - e.timeStamp) / 1000;
  if (!(d >= 0 && d < 0.3)) d = 0;
  return audioNow() - d;
}

/* ================= 狀態 ================= */
const MODES = {
  A: { emo: "🦜", name: "鸚鵡學說話", sub: "先聽，再照著按",
       how: "鸚鵡會先打一小節節奏，<b>仔細聽</b>！<br>輪到你的時候，照著按出<b>一樣的節奏</b>。<br>聲音長長的，就要<b>按住不放</b>喔。" },
  B: { emo: "🐸", name: "青蛙跳荷葉", sub: "看樂譜，跟著按",
       how: "青蛙<b>跳到荷葉上</b>的時候按下去。<br>長長的荷葉要<b>一直按住</b>，把荷葉塗滿才放開！<br>看到「<b>噓</b>」是休止符，要停下來不要按。" },
  C: { emo: "🐰", name: "猜猜哪一張", sub: "聽節奏，找樂譜",
       how: "先聽一段節奏，<br>再從三張樂譜裡找出<b>剛剛聽到的那一張</b>。<br>可以按 🔊 再聽一次。" },
};
const S = { mode: "B", li: 0, level: LEVELS[0], ex: null, run: null, seq: null, c: null, holdPtr: null, pressVoice: null, cal: null };

const stars = (n) => "★".repeat(n) + "☆".repeat(3 - n);
const show = (id) => {
  $$(".screen").forEach((s) => (s.hidden = s.id !== id));
  if (id !== "play") { $("#intro").hidden = true; $("#result").hidden = true; }
};
const beatSec = () => 60 / set.bpm;

/* ================= 首頁 / 選關 ================= */
function seeded(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}
function openLevels(mode) {
  S.mode = mode;
  const M = MODES[mode];
  $("#lvTitle").textContent = `${M.emo} ${M.name}`;
  $("#lvGrid").innerHTML = LEVELS.map((L, i) => {
    const sample = genMeasure(L, seeded(i + 3));
    const { svg, width, height } = drawScore([sample], L.beats, 1, {});
    const st = save.stars[mode][i] || 0;
    return `<button class="lv${st ? " done" : ""}" data-i="${i}">
      <span class="lv-no">${i + 1}</span>
      <span class="lv-name">${L.name}</span>
      <svg class="mini" viewBox="0 0 ${width} ${height}">${svg}</svg>
      <span class="lv-stars">${stars(st)}</span></button>`;
  }).join("");
  show("levels");
}

/* ================= 題目 ================= */
function distinctMeasures(level, n, avoidRepeat = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let m, tries = 0;
    do { m = genMeasure(level); tries++; }
    while (avoidRepeat && tries < 30 && out.length && soundKey(out[out.length - 1]) === soundKey(m));
    out.push(m);
  }
  return out;
}
function cLevel(L) {
  return Object.keys(L.pool).length > 1 ? L : { ...L, pool: { q: 2, h: 1, qr: 1 }, focus: null };
}
function makeExercise(mode, L) {
  if (mode === "A") return { patterns: distinctMeasures(L, 4) };
  if (mode === "B") return { measures: distinctMeasures(L, 4) };
  const CL = cLevel(L), qs = [];
  for (let i = 0; i < 6; i++) {
    const ans = genMeasure(CL);
    const opts = [ans], keys = new Set([soundKey(ans)]);
    for (let tries = 0; opts.length < 3 && tries < 200; tries++) {
      const m = genMeasure(CL);
      if (!keys.has(soundKey(m))) { keys.add(soundKey(m)); opts.push(m); }
    }
    opts.sort(() => Math.random() - 0.5);
    qs.push({ ans, opts });
  }
  return { qs };
}

/* ================= 開始畫面 ================= */
function openIntro(li, fresh = true) {
  stopAll();
  S.li = li; S.level = LEVELS[li];
  if (fresh || !S.ex) S.ex = makeExercise(S.mode, S.level);
  const M = MODES[S.mode], L = S.level;
  $("#pTitle").textContent = `${li + 1}. ${L.name}`;
  $("#inEmo").textContent = M.emo;
  $("#inTitle").textContent = `${li + 1}. ${L.name}`;
  $("#inDesc").textContent = L.desc;
  $("#inHow").innerHTML = M.how;
  $("#bDemo").hidden = S.mode !== "B";
  updateTempoLabel();
  const isC = S.mode === "C";
  $("#stage").hidden = isC; $("#pad").hidden = isC; $("#cBox").hidden = !isC;
  $("#beatBox").hidden = isC;
  $("#result").hidden = true;
  $("#score").innerHTML = "";
  $("#cards").innerHTML = "";
  $("#intro").hidden = false;
  show("play");
}
function updateTempoLabel() {
  $("#inBpm").textContent = set.bpm;
  $("#sBpmV").textContent = set.bpm;
  $("#sBpm").value = set.bpm;
}

/* ================= A / B 遊戲 ================= */
function startRun(demo = false) {
  ensureAudio();
  stopAll();
  $("#intro").hidden = true;
  $("#result").hidden = true;
  const L = S.level, beats = L.beats, bs = beatSec(), ms = beats * bs;
  const run = { mode: S.mode, demo, beats, bs, ms, groups: [], slots: [], notes: [], rests: [], extras: [],
                holding: null, curGroup: -1, curSlot: -1, done: false, nowBeat: null, toasted: new Set() };
  if (S.mode === "B") {
    run.groups.push({ measures: S.ex.measures, veil: false });
    run.slots.push({ kind: "countin", g: 0, dm: 0 });
    S.ex.measures.forEach((_, i) => run.slots.push({ kind: demo ? "demo" : "play", g: 0, dm: i }));
  } else {
    S.ex.patterns.forEach((p, r) => {
      run.groups.push({ measures: [p, p], veil: !set.showA });
      if (r === 0) run.slots.push({ kind: "countin", g: 0, dm: 0 });
      run.slots.push({ kind: "listen", g: r, dm: 0 }, { kind: "play", g: r, dm: 1 }, { kind: "review", g: r, dm: 1, last: r === S.ex.patterns.length - 1 });
    });
  }
  const t0 = ctx.currentTime + 0.4;
  run.t0 = t0;
  run.slots.forEach((s, i) => { s.start = t0 + i * ms; s.end = s.start + ms; });
  run.end = run.slots[run.slots.length - 1].end;

  run.slots.forEach((s) => {
    if (!["listen", "play", "demo"].includes(s.kind)) return;
    const toks = run.groups[s.g].measures[s.dm];
    s.starts = [];
    expand(toks).forEach((e, i) => {
      s.starts.push(e.b);
      const o = { g: s.g, dm: s.dm, b: e.b, d: e.d, t: s.start + e.b * bs, dur: e.d * bs, key: `${s.dm}-${i}`,
                  role: s.kind === "play" ? "play" : "demo", needHold: e.d >= 1.5, err: 0 };
      (e.type === "n" ? run.notes : run.rests).push(o);
    });
  });

  // 一次排好所有聲音
  run.gain = ctx.createGain();
  run.gain.connect(master);
  for (const s of run.slots) {
    let vol = 1;
    if (s.kind === "play") vol = set.metro ? 0.7 : 0;
    if (s.kind === "review" && s.last) vol = 0;
    if (vol > 0) for (let b = 0; b < beats; b++) click(s.start + b * bs, b === 0, run.gain, vol);
  }
  for (const n of run.notes) if (n.role === "demo") tone(n.t, n.dur, run.gain);

  S.run = run;
  $("#nums").innerHTML = Array.from({ length: beats }, (_, i) => `<i>${i + 1}</i>`).join("");
  requestAnimationFrame(frame);
}

function win(run) {
  return { good: Math.min(0.18, run.bs * 0.3), perfect: Math.min(0.09, run.bs * 0.15) };
}

function frame() {
  const run = S.run;
  if (!run || run.done) return;
  const now = audioNow(), nowJ = now - set.latency / 1000;
  const si = Math.max(0, Math.min(run.slots.length - 1, Math.floor((now - run.t0) / run.ms)));
  const slot = run.slots[si];
  if (slot.g !== run.curGroup) renderGroup(slot.g);
  if (si !== run.curSlot) { run.curSlot = si; onSlot(slot); }

  const W = win(run);
  for (const n of run.notes)
    if (n.role === "play" && !n.res && nowJ > n.t + W.good) { n.res = "miss"; applyNote(n); }

  const h = run.holding;
  if (h && h.needHold && h.holdOk == null && nowJ >= h.t + h.dur - TOL[set.strict] * run.bs) {
    h.holdOk = true; ding(); applyNote(h);
  }

  updateFills(now, nowJ);
  updateMascot(now, slot);

  // 拍子數字
  const beat = now >= run.t0 ? Math.floor((now - slot.start) / run.bs) : -1;
  if (beat !== run.nowBeat) {
    run.nowBeat = beat;
    $$("#nums i").forEach((el, i) => el.classList.toggle("on", i === beat));
    $$("#score .cnt.now").forEach((el) => el.classList.remove("now"));
    if (beat >= 0 && ["listen", "play", "demo"].includes(slot.kind)) {
      const el = $(`#score .cnt[data-c="${slot.dm}-${beat}"]`);
      if (el) el.classList.add("now");
    }
  }

  if (now > run.end + 0.1) return finish();
  requestAnimationFrame(frame);
}

function onSlot(slot) {
  const run = S.run;
  const who = $("#who");
  const txt = {
    countin: "預備…",
    listen: "🦜 仔細聽！",
    play: run.mode === "A" ? "🐸 換你了！" : "🐸 跟著按！",
    demo: "🔊 先聽一次",
    review: slot.last ? "🎉 完成！" : "預備下一題…",
  }[slot.kind];
  who.textContent = txt;
  who.className = "who k-" + slot.kind;
  const svg = $("#score");
  svg.classList.toggle("veil", run.groups[slot.g].veil && slot.kind !== "review");
  if (slot.kind === "review" && !run.toasted.has(slot.g)) {
    run.toasted.add(slot.g);
    const P = run.notes.filter((n) => n.g === slot.g && n.role === "play");
    const R = run.rests.filter((r) => r.g === slot.g && r.role === "play");
    const st = scoreOf(P, R, run.extras.filter((e) => e.g === slot.g).length).stars;
    toast(st === 3 ? "⭐⭐⭐ 一模一樣！" : st === 2 ? "⭐⭐ 很接近！" : st === 1 ? "⭐ 再仔細聽聽看" : "沒關係，下一題加油！");
    if (st === 3) ding(1568);
  }
}

function renderGroup(g) {
  const run = S.run;
  run.curGroup = g;
  const grp = run.groups[g];
  const w = $("#stage").clientWidth;
  const perRow = run.mode === "A" ? (w < 520 ? 1 : 2) : (w >= 900 ? 4 : w < 520 ? 1 : 2);
  const { svg, width, height } = drawScore(grp.measures, run.beats, perRow, { lane: true, counts: true });
  const el = $("#score");
  el.setAttribute("viewBox", `-4 0 ${width + 8} ${height}`);
  el.innerHTML = svg + `<g id="extras"></g><line id="cursor" x1="0" x2="0" y1="0" y2="0"/><text id="mascot" x="0" y="0">🐸</text>`;
  run.perRow = perRow;
  run.geos = grp.measures.map((_, i) => measureGeo(i, run.beats, perRow));
  for (const n of run.notes) if (n.g === g) {
    n.elHead = el.querySelector(`.hd[data-k="${n.key}"]`);
    n.elPad = el.querySelector(`.pad[data-k="${n.key}"]`);
    n.elFill = el.querySelector(`.fill[data-k="${n.key}"]`);
    n.elLab = el.querySelector(`.plab[data-k="${n.key}"]`);
    if (n.role === "demo" && n.elFill) n.elFill.classList.add("demo");
    applyNote(n);
  }
  for (const r of run.rests) if (r.g === g) {
    r.els = [...el.querySelectorAll(`[data-k="${r.key}"]`)];
    applyRest(r);
  }
  for (const x of run.extras) if (x.g === g) drawExtra(x);
  const slot = run.slots[Math.max(0, run.curSlot)];
  el.classList.toggle("veil", grp.veil && slot && slot.kind !== "review");
}

function applyNote(n) {
  const cls = n.res === "miss" ? "r-bad"
    : !n.res ? ""
    : n.needHold && n.holdOk === false ? "r-bad"
    : n.res === "perfect" ? "r-ok" : "r-mid";
  for (const el of [n.elHead, n.elPad]) {
    if (!el) continue;
    el.classList.remove("r-ok", "r-mid", "r-bad");
    if (cls) el.classList.add(cls);
  }
  if (n.elLab) {
    let t = "";
    if (n.res === "miss") t = "漏掉";
    else if (n.needHold && n.holdOk === false) t = "短了！";
    else if (n.res === "good") t = n.off < 0 ? "太早" : "太晚";
    else if (n.holdOk) t = "按滿 ✓";
    else if (n.res === "perfect") t = "✓";
    n.elLab.textContent = t;
    n.elLab.setAttribute("class", "plab " + cls);
  }
  if (n.elFill && n.role === "play") {
    n.elFill.classList.toggle("ok", !!n.holdOk);
    n.elFill.classList.toggle("bad", n.needHold && n.holdOk === false);
    n.elFill.classList.toggle("hold", n.needHold && n.holdOk == null);
  }
}
function applyRest(r) {
  for (const el of r.els || []) el.classList.toggle("r-bad", r.err > 0);
}
function drawExtra(x) {
  const geo = S.run.geos[x.dm];
  const g = $("#extras");
  if (!geo || !g) return;
  g.insertAdjacentHTML("beforeend",
    `<circle class="extra" cx="${geo.X(x.beat)}" cy="${geo.oy + G.LANE + G.LANE_H / 2}" r="7"/>`);
}

function updateFills(now, nowJ) {
  const run = S.run;
  for (const n of run.notes) {
    if (n.g !== run.curGroup || !n.elFill) continue;
    let a, b;
    if (n.role === "demo") {
      if (now < n.t) { n.elFill.setAttribute("width", 0); continue; }
      a = n.t; b = Math.min(now, n.t + n.dur - 0.05);
    } else {
      if (n.pressAt == null) continue;
      a = n.pressAt; b = Math.min(n.releaseAt ?? nowJ, n.t + n.dur);
    }
    const geo = run.geos[n.dm];
    const xa = geo.X(n.b + (a - n.t) / run.bs) - 8;
    const xb = geo.X(n.b + (Math.max(a, b) - n.t) / run.bs) - 8;
    n.elFill.setAttribute("x", xa.toFixed(1));
    n.elFill.setAttribute("width", Math.max(8, xb - xa).toFixed(1));
  }
}

function updateMascot(now, slot) {
  const run = S.run;
  const m = $("#mascot"), cur = $("#cursor");
  if (!m) return;
  const emo = slot.kind === "listen" || (run.mode === "A" && slot.kind !== "play") ? "🦜" : "🐸";
  if (m.textContent !== emo) m.textContent = emo;
  let x, oy, jump = 0;
  const geo0 = run.geos[slot.dm];
  if (["listen", "play", "demo"].includes(slot.kind)) {
    const bp = Math.max(0, (now - slot.start) / run.bs);
    x = geo0.X(bp); oy = geo0.oy;
    const pts = [...slot.starts, run.beats];
    let prev = 0, next = run.beats;
    for (const p of pts) { if (p <= bp + 1e-6) prev = p; else { next = p; break; } }
    const J = Math.min(0.4, (next - prev) * 0.7);
    if (J > 0 && next > bp && next - bp < J) jump = Math.sin(Math.PI * (1 - (next - bp) / J)) * 22;
    cur.setAttribute("x1", x); cur.setAttribute("x2", x);
    cur.setAttribute("y1", oy + 34); cur.setAttribute("y2", oy + G.LANE + G.LANE_H + 2);
    cur.style.opacity = 1;
  } else {
    const ph = now < run.t0 ? 0 : ((now - slot.start) / run.bs) % 1;
    jump = Math.sin(Math.PI * ph) * 16;
    x = slot.kind === "review" ? geo0.X(run.beats) - 10 : geo0.X(0);
    oy = geo0.oy;
    cur.style.opacity = 0;
  }
  m.setAttribute("x", x.toFixed(1));
  m.setAttribute("y", (oy + G.LANE + 6 - jump).toFixed(1));
}

/* ---------- 按下 / 放開 ---------- */
function press(tJ) {
  const run = S.run;
  if (run.holding) release(tJ);
  const W = win(run);
  let best = null, bd = 1e9;
  for (const n of run.notes) {
    if (n.role !== "play" || n.res) continue;
    const d = Math.abs(tJ - n.t);
    if (d <= W.good && d < bd) { best = n; bd = d; }
  }
  if (best) {
    best.res = bd <= W.perfect ? "perfect" : "good";
    best.off = tJ - best.t;
    best.pressAt = tJ;
    run.holding = best;
    applyNote(best);
    return;
  }
  const r = run.rests.find((x) => x.role === "play" && tJ >= x.t && tJ < x.t + x.dur);
  if (r) { r.err++; applyRest(r); toast("噓～休止符要停下來"); return; }
  const si = Math.floor((tJ - run.t0) / run.ms);
  const slot = run.slots[si];
  if (!slot) return;
  if (slot.kind === "listen") { toast("先聽鸚鵡說完喔 🦜"); return; }
  if (slot.kind === "play") {
    const x = { g: slot.g, dm: slot.dm, beat: (tJ - slot.start) / run.bs };
    run.extras.push(x);
    if (slot.g === run.curGroup) drawExtra(x);
  }
}
function release(tJ) {
  const run = S.run;
  const h = run && run.holding;
  if (!h) return;
  h.releaseAt = tJ;
  if (h.needHold && h.holdOk == null) h.holdOk = tJ >= h.t + h.dur - TOL[set.strict] * run.bs;
  run.holding = null;
  applyNote(h);
}

function padDown(e) {
  if (!S.run || S.run.done || S.run.mode === "C") return;
  ensureAudio();
  if (S.pressVoice) S.pressVoice.stop(ctx.currentTime);
  S.pressVoice = voice(ctx.currentTime, master);
  $("#pad").classList.add("down");
  press(evtTime(e) - set.latency / 1000);
}
function padUp(e) {
  if (S.pressVoice) { S.pressVoice.stop(ctx.currentTime); S.pressVoice = null; }
  $("#pad").classList.remove("down");
  if (S.run && !S.run.done) release(evtTime(e) - set.latency / 1000);
}

/* ---------- 結算 ---------- */
function scoreOf(P, R, extra) {
  let pts = 0;
  const st = { perfect: 0, early: 0, late: 0, miss: 0, short: 0, rest: 0, extra };
  for (const n of P) {
    let base = n.res === "perfect" ? 100 : n.res === "good" ? 70 : 0;
    if (n.res === "perfect") st.perfect++;
    else if (n.res === "good") n.off < 0 ? st.early++ : st.late++;
    else st.miss++;
    if (n.needHold && n.res && n.res !== "miss" && n.holdOk !== true) { base *= 0.4; st.short++; }
    pts += base;
  }
  for (const r of R) st.rest += r.err;
  const pct = P.length ? Math.max(0, (pts - 40 * (st.rest + extra)) / (100 * P.length)) : 0;
  st.pct = pct;
  st.stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.45 ? 1 : 0;
  if (st.stars === 3 && (st.short || st.rest)) st.stars = 2; // 長音沒按滿或休止符按到，就不給三顆星
  return st;
}

function finish() {
  const run = S.run;
  run.done = true;
  if (run.holding) release(run.end);
  $("#who").textContent = "";
  $$("#nums i").forEach((el) => el.classList.remove("on"));
  const m = $("#mascot"); if (m) m.style.display = "none";
  const c = $("#cursor"); if (c) c.style.opacity = 0;
  if (run.demo) { $("#intro").hidden = false; return; }
  const P = run.notes.filter((n) => n.role === "play");
  const R = run.rests.filter((r) => r.role === "play");
  const st = scoreOf(P, R, run.extras.length);
  let tip;
  if (st.short) tip = "長音要<b>一直按住</b>，心裡數 1、2、3…數到最後一拍才放開！把荷葉塗滿就對了。";
  else if (st.rest) tip = "看到休止符「噓」要<b>停下來數拍子</b>，不要按喔。";
  else if (st.extra >= 2) tip = "有幾下是多按的，仔細聽滴答聲，<b>一個音符只按一下</b>。";
  else if (st.early >= 2 && st.early > st.late) tip = "有點<b>太急了</b>，慢慢來，等青蛙跳下去才按。";
  else if (st.late >= 2) tip = "可以<b>早一點點</b>按，跟著滴答聲一起。";
  else if (st.miss) tip = "有幾個音符漏掉了，眼睛跟著青蛙往前看。";
  else tip = st.stars === 3 ? "拍子好穩！可以到 ⚙ 設定把速度調快一點挑戰看看。" : "繼續加油！";
  showResult(st.stars, st, tip);
}

function showResult(n, st, tip, cStats) {
  if (n > (save.stars[S.mode][S.li] || 0)) { save.stars[S.mode][S.li] = n; persist(); }
  $("#rStars").innerHTML = [0, 1, 2].map((i) => `<span class="${i < n ? "on" : ""}" style="animation-delay:${i * 0.18}s">★</span>`).join("");
  $("#rMsg").textContent = ["沒關係，慢慢來再試一次！", "過關了！再練練會更好", "很棒喔！", "太厲害了！🎉"][n];
  $("#rStats").innerHTML = cStats || [
    ["🎯 剛剛好", st.perfect], ["🐇 太早", st.early], ["🐢 太晚", st.late], ["⏳ 長音太短", st.short],
    ["🤫 休止符按到", st.rest], ["❓ 多按", st.extra], ["❌ 漏掉", st.miss],
  ].filter(([, v], i) => i === 0 || v > 0).map(([k, v]) => `<span class="st">${k} <b>${v}</b></span>`).join("");
  $("#rTip").innerHTML = tip;
  $("#bNext").hidden = S.li >= LEVELS.length - 1;
  $("#result").hidden = false;
  if (n >= 2) fanfare();
}

/* ================= C：猜猜哪一張 ================= */
function startC() {
  ensureAudio();
  stopAll();
  $("#intro").hidden = true;
  S.c = { i: 0, ok: 0, tried: false, solved: false };
  showQuestion();
}
function showQuestion() {
  const q = S.ex.qs[S.c.i];
  S.c.tried = false; S.c.solved = false;
  $("#cProg").textContent = `第 ${S.c.i + 1} / ${S.ex.qs.length} 題`;
  $("#cHint").textContent = "仔細聽…";
  $("#cards").innerHTML = q.opts.map((toks, j) => {
    const { svg, width, height } = drawScore([toks], S.level.beats, 1, {});
    return `<button class="ccard" data-j="${j}"><svg viewBox="-4 0 ${width + 8} ${height}">${svg}</svg></button>`;
  }).join("");
  setTimeout(() => S.c && playPattern(q.ans, true), 350);
}
function pickCard(btn) {
  const c = S.c;
  if (!c || c.solved) return;
  const q = S.ex.qs[c.i], j = +btn.dataset.j;
  if (soundKey(q.opts[j]) === soundKey(q.ans)) {
    c.solved = true;
    if (!c.tried) c.ok++;
    stopSeq();
    btn.classList.add("right");
    $("#cHint").textContent = c.tried ? "找到了！👍" : "答對了！🎉";
    fanfare();
    setTimeout(() => {
      if (S.c !== c) return;
      c.i++;
      if (c.i >= S.ex.qs.length) finishC(); else showQuestion();
    }, 1500);
  } else {
    c.tried = true;
    btn.classList.remove("wrong"); void btn.offsetWidth; btn.classList.add("wrong");
    $("#cHint").textContent = "不是這張喔，聽聽看這張是什麼節奏，再按 🔊 聽題目";
    playPattern(q.opts[j], false, btn);
  }
}
function finishC() {
  const n = S.ex.qs.length, ok = S.c.ok;
  const st = ok === n ? 3 : ok >= n - 2 ? 2 : ok >= n / 2 ? 1 : 0;
  const tip = st === 3 ? "耳朵好厲害！每一題都一次就答對。"
    : "答錯的時候，聽聽看兩張譜的聲音<b>哪裡不一樣</b>：是長音、休止符，還是八分音符？";
  showResult(st, null, tip, `<span class="st">🎯 一次答對 <b>${ok} / ${n}</b></span>`);
}
function playPattern(toks, countIn, card) {
  ensureAudio();
  stopSeq();
  const g = ctx.createGain(); g.connect(master);
  const bs = beatSec(), beats = S.level.beats;
  let t0 = ctx.currentTime + 0.15;
  const seq = { g, onsets: [], card, start: t0 };
  if (countIn) { for (let b = 0; b < beats; b++) click(t0 + b * bs, b === 0, g, 1); t0 += beats * bs; }
  seq.patStart = t0;
  for (let b = 0; b < beats; b++) click(t0 + b * bs, b === 0, g, 0.4);
  for (const e of expand(toks)) if (e.type === "n") { tone(t0 + e.b * bs, e.d * bs, g); seq.onsets.push(t0 + e.b * bs); }
  seq.end = t0 + beats * bs;
  S.seq = seq;
  if (card) card.classList.add("playing");
  const bunny = $("#bunny");
  const loop = () => {
    if (S.seq !== seq) return;
    const now = audioNow();
    if (!card) $("#cHint").textContent = now < seq.patStart ? "預備… " + (Math.floor((now - seq.start) / bs) + 1) : "🎵 仔細聽";
    let j = 0;
    for (const o of seq.onsets) if (now >= o && now < o + 0.18) j = 1 - (now - o) / 0.18;
    bunny.style.transform = `translateY(${-j * 22}px)`;
    if (now > seq.end) {
      if (!card) $("#cHint").textContent = "是哪一張呢？";
      return stopSeq();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function stopSeq() {
  const s = S.seq;
  if (!s) return;
  S.seq = null;
  try { s.g.disconnect(); } catch {}
  if (s.card) s.card.classList.remove("playing");
  $("#bunny").style.transform = "";
}

/* ================= 共用 ================= */
function stopAll() {
  if (S.run) {
    S.run.done = true;
    try { S.run.gain && S.run.gain.disconnect(); } catch {}
    S.run = null;
  }
  if (S.pressVoice) { S.pressVoice.stop(ctx.currentTime); S.pressVoice = null; }
  $("#pad").classList.remove("down");
  stopSeq();
  S.c = null;
  $("#who").textContent = "";
}
let toastTimer;
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

/* ================= 設定 / 校正 ================= */
function openSettings() {
  $("#sMetro").checked = set.metro;
  $("#sShowA").checked = set.showA;
  $$('input[name="strict"]').forEach((r) => (r.checked = r.value === set.strict));
  $("#sLat").value = set.latency;
  $("#sLatV").textContent = set.latency;
  $("#calMsg").textContent = "";
  updateTempoLabel();
  $("#settings").hidden = false;
}
function startCal() {
  ensureAudio();
  stopCal();
  const bs = 60 / 90, N = 16, g = ctx.createGain();
  g.connect(master);
  const t0 = ctx.currentTime + 0.6, times = [];
  for (let i = 0; i < N; i++) { times.push(t0 + i * bs); click(t0 + i * bs, i % 4 === 0, g, 1); }
  S.cal = { g, times, taps: [], end: t0 + N * bs };
  $("#calTap").hidden = false;
  $("#calMsg").textContent = "跟著嗶聲按下面的按鈕（大人來按比較準）";
  S.cal.timer = setTimeout(endCal, (S.cal.end - ctx.currentTime + 0.4) * 1000);
}
function endCal() {
  const c = S.cal;
  if (!c) return;
  const offs = [];
  for (const t of c.taps) {
    let best = 1e9;
    for (const x of c.times.slice(4)) if (Math.abs(t - x) < Math.abs(best)) best = t - x;
    if (Math.abs(best) < 0.3) offs.push(best);
  }
  stopCal();
  if (offs.length < 5) { $("#calMsg").textContent = "按的次數不夠，請再試一次。"; return; }
  offs.sort((a, b) => a - b);
  const med = offs[offs.length >> 1];
  set.latency = Math.max(-50, Math.min(250, Math.round(med * 1000)));
  persist();
  $("#sLat").value = set.latency;
  $("#sLatV").textContent = set.latency;
  $("#calMsg").textContent = `校正完成：${set.latency} ms`;
}
function stopCal() {
  const c = S.cal;
  if (!c) return;
  clearTimeout(c.timer);
  try { c.g.disconnect(); } catch {}
  S.cal = null;
  $("#calTap").hidden = true;
}

/* ================= 事件 ================= */
$$(".mode").forEach((b) => b.addEventListener("click", () => openLevels(b.dataset.mode)));
$("#lvGrid").addEventListener("click", (e) => {
  const b = e.target.closest(".lv");
  if (b) openIntro(+b.dataset.i, true);
});
$("#bLvBack").addEventListener("click", () => show("home"));
$("#bPlayBack").addEventListener("click", () => { stopAll(); openLevels(S.mode); });
$("#bRestart").addEventListener("click", () => openIntro(S.li, false));
$("#bGo").addEventListener("click", () => (S.mode === "C" ? startC() : startRun(false)));
$("#bDemo").addEventListener("click", () => startRun(true));
$("#bNew").addEventListener("click", () => openIntro(S.li, true));
$("#bAgain").addEventListener("click", () => openIntro(S.li, false));
$("#bNext").addEventListener("click", () => openIntro(Math.min(S.li + 1, LEVELS.length - 1), true));
$("#bToLevels").addEventListener("click", () => { stopAll(); openLevels(S.mode); });
$("#bReplay").addEventListener("click", () => { const q = S.c && S.ex.qs[S.c.i]; if (q && !S.c.solved) playPattern(q.ans, true); });
$("#cards").addEventListener("click", (e) => { const b = e.target.closest(".ccard"); if (b) pickCard(b); });
$("#bTempoDown").addEventListener("click", () => { set.bpm = Math.max(40, set.bpm - 4); persist(); updateTempoLabel(); });
$("#bTempoUp").addEventListener("click", () => { set.bpm = Math.min(120, set.bpm + 4); persist(); updateTempoLabel(); });

const pad = $("#pad");
pad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  try { pad.setPointerCapture(e.pointerId); } catch {}
  S.holdPtr = e.pointerId;
  padDown(e);
});
const up = (e) => { if (e.pointerId === S.holdPtr) { S.holdPtr = null; padUp(e); } };
pad.addEventListener("pointerup", up);
pad.addEventListener("pointercancel", up);
pad.addEventListener("contextmenu", (e) => e.preventDefault());
let keyDown = false;
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.code !== "Enter") return;
  if (!S.run || S.run.done) return;
  e.preventDefault();
  if (e.repeat || keyDown) return;
  keyDown = true; padDown(e);
});
window.addEventListener("keyup", (e) => {
  if ((e.code === "Space" || e.code === "Enter") && keyDown) { keyDown = false; padUp(e); }
});

$$(".bSet").forEach((b) => b.addEventListener("click", openSettings));
$("#bSetClose").addEventListener("click", () => { stopCal(); $("#settings").hidden = true; });
$("#sBpm").addEventListener("input", (e) => { set.bpm = +e.target.value; persist(); updateTempoLabel(); });
$("#sMetro").addEventListener("change", (e) => { set.metro = e.target.checked; persist(); });
$("#sShowA").addEventListener("change", (e) => { set.showA = e.target.checked; persist(); });
$$('input[name="strict"]').forEach((r) => r.addEventListener("change", () => { set.strict = r.value; persist(); }));
$("#sLat").addEventListener("input", (e) => { set.latency = +e.target.value; $("#sLatV").textContent = set.latency; persist(); });
$("#bCal").addEventListener("click", startCal);
$("#calTap").addEventListener("pointerdown", (e) => { e.preventDefault(); if (S.cal) { S.cal.taps.push(evtTime(e)); ding(880, 0, 0.08); } });
$("#bReset").addEventListener("click", () => {
  if (!confirm("確定要清除所有星星紀錄嗎？")) return;
  save.stars = { A: {}, B: {}, C: {} }; persist();
  $("#calMsg").textContent = "星星紀錄已清除";
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && S.run && !S.run.done) openIntro(S.li, false);
});
let rz;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (S.run && S.run.mode !== "C" && S.run.curGroup >= 0) renderGroup(S.run.curGroup); }, 150);
});

show("home");

$("#bTestSnd").addEventListener("click", () => {
  unlockAudio();
  const t = ctx.currentTime + 0.05;
  click(t, true, master); tone(t + 0.4, 0.6, master); click(t + 1.1, false, master);
});
