// 翠嶺高爾夫：主程式（回合流程、揮桿量表、鏡頭、介面、記分卡、自動球童、測試介面）
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as C from "./course.js";
import * as PH from "./physics.js";
import { World } from "./scene.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const MOBILE = /Mobi|Android|iPad|iPhone/.test(navigator.userAgent);
const { SURF, YD } = C;

/* ---------------- 設定 ---------------- */
const DEF = { units: "yd", diff: "std", weather: "random", wind: "random", time: "random", quality: MOBILE ? "low" : "high", grid: true };
let cfg = { ...DEF };
try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem("golf-cfg") || "{}") }; } catch (e) { /* 私密模式 */ }
if (params.has("low")) cfg.quality = "low";
const saveCfg = () => { try { localStorage.setItem("golf-cfg", JSON.stringify(cfg)); } catch (e) { /* 忽略 */ } };
const fmtD = (m, short) => (cfg.units === "yd" ? `${Math.round(m / YD)}${short ? "" : " 碼"}` : `${Math.round(m)}${short ? "" : " 公尺"}`);
const fmtPutt = (m) => (m < 10 ? `${m.toFixed(1)} m` : fmtD(m));

/* ---------------- 渲染器 ---------------- */
const HI = cfg.quality === "high";
const canvas = $("#c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(Math.min(devicePixelRatio, HI ? 2 : 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.03, 9000);
const world = new World(renderer, cfg.quality);
const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: HI ? 4 : 0 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(world.scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.5, 0.92);
if (HI) composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

/* ---------------- 回合狀態 ---------------- */
const G = {
  holeN: 1, hole: null, scores: Array(18).fill(null), stats: Array(18).fill(null),
  strokes: 0, putts: 0, ball: { x: 0, y: 0, z: 0 }, lie: SURF.TEE, prev: null, prevLie: SURF.TEE,
  club: 0, aim: 0, power: 1, curve: 0, loft: 0,
  phase: "loading", wind: { x: 0, z: 0, kmh: 0, dir: 0 }, weather: null, seed: (Date.now() / 1000) | 0,
  shot: null, play: null, preview: null, previewDirty: true, roundStart: 1,
};
const clubs = PH.CLUBS;
const isPutter = () => clubs[G.club].putter;
const onGreen = () => G.lie === SURF.GREEN;
const distToPin = () => Math.hypot(G.hole.pin.x - G.ball.x, G.hole.pin.z - G.ball.z);

/* ---------------- 天氣 ---------------- */
function rollWeather() {
  const r = C.rng(G.seed);
  const pick = (v, list) => (v === "random" ? list[Math.floor(r() * list.length)] : v);
  const kind = pick(cfg.weather, ["clear", "clear", "clear", "cloudy", "cloudy", "rain", "fog"]);
  const time = pick(cfg.time, ["morning", "noon", "noon", "evening"]);
  const sunElev = { morning: 18, noon: 52, evening: 9 }[time];
  const sunAz = { morning: 115, noon: 175, evening: 250 }[time] + (r() - 0.5) * 30;
  const windLvl = cfg.wind === "random" ? (kind === "rain" ? 2 + (r() < 0.5 ? 1 : 0) : Math.floor(r() * 4)) : +cfg.wind;
  G.weather = { kind, time, sunElev, sunAz, overcast: kind === "rain" || kind === "cloudy", rain: kind === "rain", fog: kind === "fog", cloud: kind === "clear" ? 0.32 : 0.6, seed: G.seed, windLvl, windDir: r() * 360, temp: Math.round(({ morning: 19, noon: 27, evening: 22 }[time]) - (kind === "rain" ? 4 : 0) + r() * 3) };
  world.setWeather(G.weather);
}
function holeWind() {
  const r = C.rng(G.seed + G.holeN * 17), w = G.weather;
  const kmh = [0, 6, 14, 24][w.windLvl] * (0.65 + r() * 0.6) + (w.windLvl ? r() * 3 : 0);
  const dir = (w.windDir + (r() - 0.5) * 50) * Math.PI / 180;     // 風往哪裡吹（0 = 往 -z）
  G.wind = { kmh, dir, x: Math.sin(dir) * kmh / 3.6, z: -Math.cos(dir) * kmh / 3.6 };
}
/** 陣風：打出去那一刻的風 */
function gustWind() { const k = 1 + Math.sin(T * 0.7) * 0.12 + Math.sin(T * 1.9) * 0.06; return { x: G.wind.x * k, z: G.wind.z * k }; }

/* ---------------- 載入一洞 ---------------- */
const tick = () => new Promise((r) => setTimeout(r, 0));
async function loadHole(n) {
  G.phase = "loading"; showLoading(true, `第 ${n} 洞`);
  G.holeN = n; G.hole = C.loadHole(n);
  const h = G.hole;
  h.pin = h.pinPosition(G.seed % 4);
  progress(0.05, "測量地形…"); await tick();
  await new Promise((res) => { h.buildCache(HI ? 1 : 1.5); res(); });
  progress(0.4, "鋪草皮、整理沙坑…"); await tick();
  world.loadHole(h, (p, msg) => progress(0.4 + p * 0.55, msg));
  world.setPin(h.pin);
  holeWind();
  G.strokes = 0; G.putts = 0; G.lie = SURF.TEE; G.prev = null;
  G.stats[n - 1] = { fir: null, gir: false, putts: 0, pen: 0 };
  placeBall(h.teeSpot.x, h.teeSpot.z);
  G.club = 0; if (h.par === 3) G.club = recommendClub();
  aimAtTarget(); recommend();
  buildMinimap();
  showLoading(false);
  updateHUD();
  banner(`第 ${n} 洞　${h.name}`, `標準桿 ${h.par}・${fmtD(h.len)}`, 2600);
  startFlyover();
}
function placeBall(x, z) {
  const h = G.hole;
  G.ball = { x, y: h.height(x, z), z };
  G.lie = h.surface(x, z);
  if (G.lie === SURF.OB || G.lie === SURF.WATER) G.lie = SURF.ROUGH;
  G.previewDirty = true;
}
const teeHeight = () => (G.lie === SURF.TEE && !isPutter() ? (clubs[G.club].id.endsWith("W") ? 0.035 : 0.012) : 0);

/* ---------------- 選桿、瞄準 ---------------- */
function estTotal(club, power = 1) { if (club.putter) return 0; const r = PH.simulate({ x: 0, y: 0, z: 0, dir: 0, club, power, lie: SURF.TEE }, { hole: PH.FLAT, wind: { x: 0, z: 0 }, pin: { x: 1e5, z: 1e5 } }, { maxT: 15 }); return { carry: r.carry, total: Math.hypot(r.end.x, r.end.z) }; }
const CLUB_EST = clubs.map((c) => (c.putter ? { carry: 0, total: 0 } : estTotal(c)));
function target() {
  const h = G.hole, d = distToPin();
  if (G.lie === SURF.GREEN || d < 40) return { x: h.pin.x, z: h.pin.z };
  const best = Math.min(CLUB_EST[G.lie === SURF.TEE ? 0 : 1].total * LIEV(), d);
  return h.aimPoint(G.ball.x, G.ball.z, best);
}
const LIEV = () => (PH.LIE[G.lie] || PH.LIE[SURF.ROUGH]).v;
/** 實際要打幾碼（plays like）：高低差、風 */
function playsLike(tx, tz) {
  const h = G.hole, d = Math.hypot(tx - G.ball.x, tz - G.ball.z), dy = h.height(tx, tz) - G.ball.y;
  const ux = (tx - G.ball.x) / (d || 1), uz = (tz - G.ball.z) / (d || 1), head = -(G.wind.x * ux + G.wind.z * uz);   // 逆風為正
  return d + dy * 0.95 + head * d * 0.018 * (head > 0 ? 1 : 0.55);
}
function recommendClub() {
  const t = target(), need = playsLike(t.x, t.z), d = distToPin();
  if (G.lie === SURF.GREEN || (d < 22 && G.lie === SURF.FRINGE)) return clubs.length - 1;
  let best = clubs.length - 2;
  for (let i = 0; i < clubs.length - 1; i++) { if (i === 0 && G.lie !== SURF.TEE) continue; const tot = CLUB_EST[i].total * LIEV(); if (tot <= need * 1.04) { best = i; break; } }
  return best;
}
function recommend() { G.club = recommendClub(); G.power = 1; if (isPutter()) G.power = puttPowerFor(distToPin()); else { const t = target(), need = playsLike(t.x, t.z), tot = CLUB_EST[G.club].total * LIEV(); if (tot > need) G.power = Math.max(0.35, Math.min(1, powerFor(G.club, need))); } G.curve = 0; G.loft = 0; G.previewDirty = true; }
function powerFor(ci, dist) { let lo = 0.25, hi = 1.0; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2, e = estTotal(clubs[ci], m).total * LIEV(); if (e < dist) lo = m; else hi = m; } return (lo + hi) / 2; }
function puttPowerFor(d) { return Math.min(1, Math.sqrt(2 * PH.GROUND[SURF.GREEN].roll * 9.81 * (d + 0.4)) / clubs[clubs.length - 1].v); }
function aimAtTarget() { const t = target(); G.aim = Math.atan2(t.x - G.ball.x, -(t.z - G.ball.z)); G.previewDirty = true; }

/* ---------------- 預測線 ---------------- */
function shotSpec(power = G.power, extra = {}) {
  const club = clubs[G.club];
  return { x: G.ball.x, y: G.ball.y + teeHeight(), z: G.ball.z, dir: G.aim + (extra.dir || 0), club, power, curve: G.curve + (extra.curve || 0), loft: G.loft, lie: G.lie };
}
function env(windOn = true) { return { hole: G.hole, wind: windOn ? gustWind() : { x: 0, z: 0 }, wet: G.weather.rain, pin: G.hole.pin }; }
let lastPrev = 0;
function updatePreview(force) {
  if (!G.previewDirty && !force) return;
  if (!force && performance.now() - lastPrev < 70) return;
  lastPrev = performance.now(); G.previewDirty = false;
  const easy = cfg.diff === "easy";
  const r = PH.simulate(shotSpec(), env(easy), { maxT: 20 });
  G.preview = r;
  updateHUD();
}

/* ---------------- 揮桿量表 ---------------- */
const meter = { state: "idle", v: 0, power: 0, acc: 0 };
const ACC_ZONE = 0.025, MIN_V = -0.14;
function swingPress() {
  if (G.phase !== "aim") return;
  if (cfg.diff === "easy" && meter.state === "idle") { fire(G.power, 0); return; }
  if (meter.state === "idle") { meter.state = "up"; meter.v = 0; $("#meter").classList.add("active"); return; }
  if (meter.state === "up") { meter.power = meter.v; meter.state = "down"; return; }
  if (meter.state === "down") { meter.acc = meter.v; finishMeter(); }
}
function updateMeter(dt) {
  if (meter.state === "up") { meter.v += dt * (isPutter() ? 0.75 : 0.95); if (meter.v >= 1.1) { meter.power = 1.1; meter.state = "down"; } }
  else if (meter.state === "down") { meter.v -= dt * (isPutter() ? 1.0 : 1.35) * (meter.power > 1 ? 1.35 : 1); if (meter.v <= MIN_V) { meter.acc = MIN_V; finishMeter(); } }
  const m = $("#meter"), w = m.clientWidth, X = (v) => ((v - MIN_V) / (1.1 - MIN_V)) * w;
  $("#mcur").style.transform = `translateX(${X(meter.state === "idle" ? 0 : meter.v)}px)`;
  $("#mplan").style.left = `${X(G.power)}px`;
  $("#mzero").style.left = `${X(-ACC_ZONE)}px`; $("#mzero").style.width = `${X(ACC_ZONE) - X(-ACC_ZONE)}px`;
  $("#mfill").style.width = `${X(meter.state === "down" ? meter.power : meter.state === "up" ? meter.v : 0)}px`;
  $("#m100").style.left = `${X(1)}px`;
}
function finishMeter() {
  meter.state = "idle"; $("#meter").classList.remove("active");
  let acc = meter.acc;
  if (Math.abs(acc) < ACC_ZONE) acc = 0;
  const p = meter.power, over = Math.max(0, p - 1);
  fire(Math.min(1.06, p), acc + Math.sign(acc || 1) * over * 0.4 * (acc ? 1 : 0) + (over > 0.05 && !acc ? over * 0.6 : 0));
}

/* ---------------- 擊球 ---------------- */
function fire(power, acc) {
  const h = G.hole, club = clubs[G.club];
  const lie = PH.LIE[G.lie] || PH.LIE[SURF.ROUGH];
  const r = C.rng(G.seed * 31 + G.holeN * 101 + G.strokes * 7);
  const spread = (lie.spread + (club.putter ? 0 : 0.25)) * (r() - 0.5) * 2 * Math.PI / 180;
  let dir = acc * (club.putter ? 0.16 : 0.32), curve = club.putter ? 0 : acc * 5.5;
  if (club.id === "1W" && G.lie !== SURF.TEE) { power *= 0.94; dir += (r() - 0.5) * 0.04; }
  const shot = shotSpec(power, { dir: dir + spread, curve });
  G.prev = { ...G.ball }; G.prevLie = G.lie;
  const res = PH.simulate(shot, { ...env(true) }, { maxT: 40 });
  G.shot = { shot, res, power, acc, club, startStroke: G.strokes };
  G.play = { t: 0, end: res.path[res.path.length - 1].t, idx: 0, trail: [], landT: (res.events.find((e) => e.type === "land") || {}).t ?? 0, camSet: false };
  G.phase = "flight";
  $("#aimui").hidden = true;
  world.preview.visible = false; world.landRing.visible = world.restRing.visible = false;
  sound("hit", club.putter ? 0.4 : 1);
  const accTxt = Math.abs(acc) < 0.001 ? "完美！" : acc > 0 ? (club.putter ? "推偏右" : "右曲") : club.putter ? "推偏左" : "左曲";
  if (!club.putter && cfg.diff !== "easy") toast(`${club.name}・力道 ${Math.round(power * 100)}%・${accTxt}`);
}
function playback(dt) {
  const P = G.play, res = G.shot.res, path = res.path;
  P.t += dt * (P.fast ? 4 : 1);
  while (P.idx < path.length - 2 && path[P.idx + 1].t <= P.t) P.idx++;
  const a = path[P.idx], b = path[Math.min(P.idx + 1, path.length - 1)], k = b.t > a.t ? Math.min(1, (P.t - a.t) / (b.t - a.t)) : 1;
  G.ball = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  if (!P.trail.length || Math.hypot(G.ball.x - P.trail[P.trail.length - 1].x, G.ball.z - P.trail[P.trail.length - 1].z) > 0.8) P.trail.push({ ...G.ball });
  if (P.trail.length > world.trailN) P.trail.shift();
  for (const e of res.events) if (!e.done && e.t <= P.t) { e.done = true; if (e.type === "tree") sound("tree"); if (e.type === "water") { splash(e); sound("splash"); } if (e.type === "bounce" && e.surf === SURF.BUNKER) sound("sand"); if (e.type === "holed") sound("cup"); if (e.type === "pin") sound("pin"); }
  if (P.t >= P.end) resolveShot();
}
function resolveShot() {
  const h = G.hole, res = G.shot.res, st = G.stats[G.holeN - 1];
  G.strokes++; if (G.shot.club.putter || G.prevLie === SURF.GREEN) { G.putts++; st.putts++; }
  if (G.strokes === 1 && h.par > 3) st.fir = h.surface(res.end.x, res.end.z) === SURF.FAIRWAY;
  const carry = res.carry, total = Math.hypot(res.end.x - G.prev.x, res.end.z - G.prev.z);
  const endSurf = h.surface(res.end.x, res.end.z);
  if (res.state === "holed") { G.ball = { ...res.end }; return holeOut(); }
  if (res.state === "water" || endSurf === SURF.WATER) {
    G.strokes++; st.pen++;
    const d = res.lastDry || G.prev; let p = { x: d.x, z: d.z };
    for (let k = 0; k < 40; k++) { const s = h.surface(p.x, p.z); if (s !== SURF.WATER && s !== SURF.OB && s !== SURF.BUNKER) break; p = { x: p.x + (G.prev.x - p.x) * 0.06, z: p.z + (G.prev.z - p.z) * 0.06 }; }
    placeBall(p.x, p.z);
    banner("落水", "罰一桿，在入水處附近抛球", 2200);
  } else if (endSurf === SURF.OB) {
    G.strokes++; st.pen++;
    placeBall(G.prev.x, G.prev.z); G.lie = G.prevLie;
    banner("界外 OB", "罰一桿，回到原處重打", 2200);
  } else {
    placeBall(res.end.x, res.end.z);
    if (!G.shot.club.putter) toast(`飛行 ${fmtD(carry)}・總共 ${fmtD(total)}・${C.SURF_NAME[G.lie]}`);
    if (G.lie === SURF.GREEN && G.strokes <= h.par - 2) st.gir = true;
  }
  if (G.strokes >= h.par + 5) { banner("撿起來", `這洞記 ${h.par + 5} 桿`, 2000); G.strokes = h.par + 5; return holeOut(true); }
  setTimeout(() => { if (G.phase === "settle") toAim(); }, 900);
  G.phase = "settle";
}
function toAim() {
  G.phase = "aim"; $("#aimui").hidden = false;
  G.play = null; recommend(); aimAtTarget(); recommend();
  world.setGrid(cfg.grid && (G.lie === SURF.GREEN || G.lie === SURF.FRINGE) && isPutter());
  cam.mode = "aim"; cam.snap = true;
  updateHUD();
}
const SCORE_NAME = { "-3": "信天翁！", "-2": "老鷹！", "-1": "博蒂！", 0: "標準桿", 1: "柏忌", 2: "雙柏忌", 3: "三柏忌" };
function holeOut(picked) {
  const h = G.hole, d = G.strokes - h.par;
  G.scores[G.holeN - 1] = G.strokes;
  G.phase = "holed";
  const name = G.strokes === 1 ? "一桿進洞！！" : SCORE_NAME[d] || `+${d}`;
  if (!picked) banner(name, `第 ${G.holeN} 洞・${G.strokes} 桿`, 3200);
  if (d < 0 || G.strokes === 1) sound("cheer");
  cam.mode = "holed"; cam.t0 = T;
  setTimeout(() => showCard(true), 3400);
  updateHUD();
}

/* ---------------- 鏡頭 ---------------- */
const cam = { mode: "aim", pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true, pitch: 0, dist: 1, t0: 0 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function startFlyover() {
  G.phase = "flyover"; cam.mode = "flyover"; cam.t0 = T;
  $("#aimui").hidden = true; $("#skip").hidden = false;
}
function endFlyover() { $("#skip").hidden = true; toAim(); }
function updateCamera(dt) {
  const h = G.hole, b = G.ball;
  let pos, look, k = cam.snap ? 1 : Math.min(1, dt * 4);
  const fx = Math.sin(G.aim), fz = -Math.cos(G.aim);
  if (cam.mode === "flyover") {
    const u = Math.min(1, (T - cam.t0) / 5.5), e = u * u * (3 - 2 * u);
    const s = h.len * (0.1 + e * 0.75), p = h.line.at(s), g = h.green;
    pos = V(p.x - p.tx * 60, h.height(p.x, p.z) + 70 - e * 25, p.z - p.tz * 60);
    look = V(g.x, h.height(g.x, g.z), g.z);
    k = Math.min(1, dt * 3); if (u === 0) k = 1;
    if (u >= 1) endFlyover();
  } else if (cam.mode === "aim" || cam.mode === "settle") {
    const putt = isPutter();
    const back = (putt ? 2.6 : 5.2) * cam.dist, up = (putt ? 1.05 : 1.75) * cam.dist + cam.pitch * 2;
    pos = V(b.x - fx * back, 0, b.z - fz * back); pos.y = Math.max(h.height(pos.x, pos.z) + 0.6, b.y + up);
    const ahead = putt ? Math.min(20, distToPin() + 2) : 70;
    look = V(b.x + fx * ahead, 0, b.z + fz * ahead); look.y = h.height(look.x, look.z) + (putt ? -0.3 : 2) + cam.pitch * 6;
  } else if (cam.mode === "target") {
    const L = G.preview ? (G.preview.events.find((e) => e.type === "land") || G.preview.end) : b;
    pos = V(L.x - fx * 28, h.height(L.x, L.z) + 26, L.z - fz * 28); look = V(L.x + fx * 12, h.height(L.x, L.z), L.z + fz * 12);
  } else if (cam.mode === "top") {
    const E = G.preview ? G.preview.end : b, mx = (b.x + E.x) / 2, mz = (b.z + E.z) / 2, d = Math.max(60, Math.hypot(E.x - b.x, E.z - b.z));
    pos = V(mx - fx * 0.2 * d, h.height(mx, mz) + d * 1.05, mz - fz * 0.2 * d); look = V(mx + fx * 0.05 * d, h.height(mx, mz), mz + fz * 0.05 * d);
  } else if (cam.mode === "flight" || G.phase === "flight") {
    const P = G.play, res = G.shot.res;
    const land = res.events.find((e) => e.type === "land"), putt = G.shot.club.putter;
    if (putt || !land || P.t < Math.max(0.6, P.landT - 1.6)) {
      // 追球：在球的後上方
      const dx = b.x - G.shot.shot.x, dz = b.z - G.shot.shot.z, dl = Math.hypot(dx, dz) || 1;
      const bk = putt ? 2.8 : 9, upk = putt ? 1.0 : 3.2;
      pos = V(b.x - (dx / dl) * bk, b.y + upk, b.z - (dz / dl) * bk);
      if (P.t < 0.15) pos = V(G.shot.shot.x - fx * 5.2, G.shot.shot.y + 1.75, G.shot.shot.z - fz * 5.2);
      pos.y = Math.max(pos.y, h.height(pos.x, pos.z) + 0.8);
      look = V(b.x, b.y, b.z); k = Math.min(1, dt * (putt ? 6 : 3.5));
    } else {
      // 落點鏡頭：站在落點旁邊看球飛進來、滾動
      if (!P.landCam) { const ex = res.end.x - G.shot.shot.x, ez = res.end.z - G.shot.shot.z, el = Math.hypot(ex, ez) || 1, ux = ex / el, uz = ez / el; const side = (Math.abs(Math.sin(G.holeN * 3.1 + G.strokes)) > 0.5 ? 1 : -1); P.landCam = V(land.x + ux * 22 - uz * 14 * side, 0, land.z + uz * 22 + ux * 14 * side); P.landCam.y = Math.max(h.height(P.landCam.x, P.landCam.z), land.y) + 4.5; cam.snap = true; }
      pos = P.landCam.clone(); look = V(b.x, b.y, b.z); k = cam.snap ? 1 : Math.min(1, dt * 6);
      if (Math.hypot(b.x - pos.x, b.z - pos.z) > 70) { pos.lerp(V(b.x, pos.y, b.z), 0.02); P.landCam.copy(pos); }
    }
  } else if (cam.mode === "holed") {
    const a = (T - cam.t0) * 0.35, p = h.pin;
    pos = V(p.x + Math.cos(a) * 3.2, h.height(p.x, p.z) + 1.4, p.z + Math.sin(a) * 3.2); look = V(p.x, h.height(p.x, p.z) + 0.1, p.z); k = Math.min(1, dt * 2);
  }
  if (!pos) return;
  cam.pos.lerp(pos, k); cam.look.lerp(look, k); cam.snap = false;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
}

/* ---------------- 輸入 ---------------- */
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.repeat && e.code === "Space") return;
  keys.add(e.code);
  if (e.code === "Space") { e.preventDefault(); if (G.phase === "flyover") endFlyover(); else if (G.phase === "flight" && G.play) G.play.fast = true; else swingPress(); }
  if (G.phase !== "aim" || meter.state !== "idle") return;
  if (e.code === "ArrowUp" || e.code === "KeyW") changeClub(-1);
  if (e.code === "ArrowDown" || e.code === "KeyS") changeClub(1);
  if (e.code === "KeyC") cycleCam();
  if (e.code === "KeyG") toggleGrid();
  if (e.code === "KeyQ") setCurve(Math.max(-1, G.curve - 0.5));
  if (e.code === "KeyE") setCurve(Math.min(1, G.curve + 0.5));
  if (e.code === "BracketLeft") setPower(G.power - 0.02);
  if (e.code === "BracketRight") setPower(G.power + 0.02);
  if (e.code === "KeyR") { aimAtTarget(); recommend(); }
  if (e.code === "Tab") { e.preventDefault(); showCard(false); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
let drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, aim: G.aim, pitch: cam.pitch, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (G.phase === "aim" && meter.state === "idle" && drag.moved) {
    const sens = isPutter() ? 0.0012 : 0.0022;
    G.aim = drag.aim + dx * sens; cam.pitch = Math.max(-0.6, Math.min(1.5, drag.pitch - dy * 0.004)); G.previewDirty = true;
  }
});
canvas.addEventListener("pointerup", () => { if (drag && !drag.moved) { if (G.phase === "flyover") endFlyover(); else if (G.phase === "flight" && G.play) G.play.fast = true; } drag = null; });
canvas.addEventListener("wheel", (e) => { cam.dist = Math.max(0.6, Math.min(2.5, cam.dist * Math.exp(e.deltaY * 0.001))); }, { passive: true });
function changeClub(d) { G.club = Math.max(0, Math.min(clubs.length - 1, G.club + d)); if (G.club === 0 && G.lie !== SURF.TEE && G.lie !== SURF.FAIRWAY) G.club = 1; G.power = isPutter() ? puttPowerFor(distToPin()) : 1; world.setGrid(cfg.grid && isPutter() && (onGreen() || G.lie === SURF.FRINGE)); G.previewDirty = true; updateHUD(); }
function setPower(p) { G.power = Math.max(0.05, Math.min(1, p)); G.previewDirty = true; updateHUD(); }
function setCurve(c) { G.curve = c; G.previewDirty = true; updateHUD(); }
function cycleCam() { const list = ["aim", "target", "top"]; cam.mode = list[(list.indexOf(cam.mode) + 1) % 3]; cam.snap = true; updateHUD(); }
function toggleGrid() { cfg.grid = !cfg.grid; saveCfg(); world.setGrid(cfg.grid && isPutter()); updateHUD(); }
// 介面按鈕
$("#swing").addEventListener("pointerdown", (e) => { e.preventDefault(); swingPress(); });
$("#cPrev").onclick = () => changeClub(-1); $("#cNext").onclick = () => changeClub(1);
let aimHold = null;
for (const [id, d] of [["#aL", -1], ["#aR", 1]]) {
  const b = $(id);
  b.addEventListener("pointerdown", () => { const step = () => { G.aim += d * (isPutter() ? 0.0025 : 0.005); G.previewDirty = true; }; step(); aimHold = setInterval(step, 50); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearInterval(aimHold));
}
$("#power").oninput = (e) => setPower(+e.target.value / 100);
for (const b of document.querySelectorAll("[data-curve]")) b.onclick = () => setCurve(+b.dataset.curve);
for (const b of document.querySelectorAll("[data-loft]")) b.onclick = () => { G.loft = +b.dataset.loft; G.previewDirty = true; updateHUD(); };
$("#bCam").onclick = cycleCam; $("#bGrid").onclick = toggleGrid; $("#bReset").onclick = () => { aimAtTarget(); recommend(); updateHUD(); };
$("#bCard").onclick = () => showCard(false);
$("#skip").onclick = endFlyover;

/* ---------------- 介面 ---------------- */
function updateHUD() {
  if (!G.hole) return;
  const h = G.hole, club = clubs[G.club], tot = G.scores.reduce((a, s, i) => a + (s ? s - C.HOLES[i].par : 0), 0);
  $("#hHole").textContent = `${h.n}`; $("#hName").textContent = h.name; $("#hPar").textContent = `標準桿 ${h.par}`; $("#hLen").textContent = fmtD(h.len);
  $("#hStroke").textContent = G.phase === "holed" ? `${G.strokes} 桿完成` : `第 ${G.strokes + 1} 桿`;
  $("#hTotal").textContent = tot === 0 ? "E" : tot > 0 ? `+${tot}` : `${tot}`;
  const d = distToPin(), dy = h.height(h.pin.x, h.pin.z) - G.ball.y;
  $("#dPin").textContent = onGreen() || d < 30 ? fmtPutt(d) : fmtD(d);
  $("#dElev").textContent = `${dy >= 0 ? "上坡" : "下坡"} ${Math.abs(dy).toFixed(1)} m`;
  const t = target(); $("#dPlays").textContent = isPutter() ? "" : `實際 ${fmtD(playsLike(t.x, t.z))}`;
  const lie = PH.LIE[G.lie] || PH.LIE[SURF.ROUGH];
  $("#lie").textContent = `${C.SURF_NAME[G.lie]}　${G.lie === SURF.GREEN ? "" : Math.round(lie.v * 100) + "%"}`;
  $("#lie").className = "lie s" + G.lie;
  $("#cName").textContent = club.name; $("#cId").textContent = club.id;
  const est = CLUB_EST[G.club];
  $("#cDist").textContent = club.putter ? `約 ${(puttDist(G.power)).toFixed(1)} m（平地）` : `飛行 ${fmtD(est.carry * G.power * lie.v, true)}・總 ${fmtD(est.total * G.power * lie.v, true)}`;
  $("#cRec").hidden = G.club !== recommendClub();
  $("#power").value = Math.round(G.power * 100); $("#pVal").textContent = `${Math.round(G.power * 100)}%`;
  for (const b of document.querySelectorAll("[data-curve]")) b.classList.toggle("on", +b.dataset.curve === G.curve);
  for (const b of document.querySelectorAll("[data-loft]")) b.classList.toggle("on", +b.dataset.loft === G.loft);
  $("#shape").hidden = club.putter;
  $("#bCam").textContent = { aim: "🎥 瞄準", target: "🎥 落點", top: "🎥 空拍" }[cam.mode] || "🎥 瞄準";
  $("#bGrid").hidden = !club.putter; $("#bGrid").classList.toggle("on", cfg.grid);
  // 風、天氣
  const w = G.weather, rel = G.wind.dir - G.aim;
  $("#wArrow").style.transform = `rotate(${rel}rad)`;
  $("#wSpd").textContent = `${G.wind.kmh.toFixed(0)}`;
  $("#wx").textContent = { clear: "☀️ 晴", cloudy: "⛅ 多雲", rain: "🌧️ 陣雨", fog: "🌫️ 起霧" }[w.kind] + ` ${w.temp}°C`;
  // 預測
  const pv = G.preview, land = pv && pv.events.find((e) => e.type === "land");
  $("#pvInfo").textContent = !pv ? "" : club.putter ? "" : `${cfg.diff === "easy" ? "含風" : "不含風"}・飛行 ${fmtD(land ? Math.hypot(land.x - G.ball.x, land.z - G.ball.z) : pv.carry)}・停在 ${C.SURF_NAME[G.hole.surface(pv.end.x, pv.end.z)]}`;
}
const puttDist = (p) => { const v = clubs[clubs.length - 1].v * p; return (v * v) / (2 * PH.GROUND[SURF.GREEN].roll * 9.81); };
let bannerT = null;
function banner(a, b, ms = 2000) { const el = $("#banner"); el.innerHTML = `<b>${a}</b><span>${b}</span>`; el.classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove("show"), ms); }
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; $("#toasts").prepend(d); setTimeout(() => d.classList.add("out"), 2600); setTimeout(() => d.remove(), 3200); }
function showLoading(on, title) { $("#loading").hidden = !on; if (title) $("#ltitle").textContent = title; }
function progress(p, msg) { $("#lbar").style.width = `${Math.round(p * 100)}%`; if (msg) $("#lmsg").textContent = msg; }

/* ---------------- 小地圖（俯視、果嶺朝上） ---------------- */
let mmBase = null, mmRot = 0, mmScale = 1, mmCenter = { x: 0, z: 0 };
function buildMinimap() {
  const h = G.hole, cv = document.createElement("canvas"), W = 180, H = 320; cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  mmRot = Math.atan2(h.green.x, -h.green.z);          // 讓果嶺在上方
  mmCenter = { x: h.green.x / 2, z: h.green.z / 2 };
  mmScale = Math.min((H - 30) / (h.len + 60), (W - 20) / 160);
  const img = g.createImageData(W, H), col = { 1: [120, 180, 90], 2: [118, 178, 84], 3: [100, 160, 74], 4: [140, 210, 110], 5: [70, 120, 52], 6: [52, 92, 42], 7: [236, 220, 170], 8: [70, 140, 190], 10: [44, 74, 38] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = mmToWorld(x, y), s = h.surface(p.x, p.z), c = col[s] || [60, 100, 50];
    const k = (y * W + x) * 4; img.data.set([c[0], c[1], c[2], 255], k);
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = "rgba(28,58,30,.9)"; for (const t of h.trees) { const q = mmFromWorld(t.x, t.z); g.beginPath(); g.arc(q.x, q.y, Math.max(1.2, t.cr * mmScale * 0.8), 0, 7); g.fill(); }
  mmBase = cv;
}
function mmToWorld(px, py) { const W = 180, H = 320, lx = (px - W / 2) / mmScale, lz = (py - H / 2) / mmScale, c = Math.cos(mmRot), s = Math.sin(mmRot); return { x: mmCenter.x + lx * c - lz * s, z: mmCenter.z + lx * s + lz * c }; }
function mmFromWorld(x, z) { const W = 180, H = 320, dx = x - mmCenter.x, dz = z - mmCenter.z, c = Math.cos(mmRot), s = Math.sin(mmRot); return { x: W / 2 + (dx * c + dz * s) * mmScale, y: H / 2 + (-dx * s + dz * c) * mmScale }; }
function drawMinimap() {
  const cv = $("#mm"), g = cv.getContext("2d"); if (!mmBase) return;
  g.clearRect(0, 0, cv.width, cv.height); g.drawImage(mmBase, 0, 0);
  const b = mmFromWorld(G.ball.x, G.ball.z), p = mmFromWorld(G.hole.pin.x, G.hole.pin.z);
  if (G.phase === "aim" && G.preview) {
    const l = G.preview.events.find((e) => e.type === "land") || G.preview.end, L = mmFromWorld(l.x, l.z), E = mmFromWorld(G.preview.end.x, G.preview.end.z);
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(L.x, L.y); g.lineTo(E.x, E.y); g.stroke(); g.setLineDash([]);
    g.strokeStyle = "#fff"; g.beginPath(); g.arc(L.x, L.y, 4, 0, 7); g.stroke();
  }
  g.fillStyle = "#e8322f"; g.fillRect(p.x, p.y - 9, 6, 4); g.fillStyle = "#fff"; g.fillRect(p.x - 0.5, p.y - 9, 1.2, 9);
  g.fillStyle = "#fff"; g.strokeStyle = "#111"; g.lineWidth = 1.2; g.beginPath(); g.arc(b.x, b.y, 3.2, 0, 7); g.fill(); g.stroke();
}

/* ---------------- 記分卡 ---------------- */
function showCard(afterHole) {
  const box = $("#card"); box.hidden = false;
  const row = (from) => {
    const hs = C.HOLES.slice(from, from + 9);
    const sc = (s, par) => (s == null ? "" : `<span class="sc ${s - par <= -2 ? "eagle" : s - par === -1 ? "birdie" : s - par === 1 ? "bogey" : s - par >= 2 ? "dbl" : ""}">${s}</span>`);
    const sum = (arr) => arr.reduce((a, v) => a + (v || 0), 0);
    return `<tr><th>洞</th>${hs.map((h) => `<td class="${h.n === G.holeN ? "cur" : ""}">${h.n}</td>`).join("")}<th>${from ? "後九" : "前九"}</th></tr>
      <tr><th>${cfg.units === "yd" ? "碼" : "公尺"}</th>${hs.map((h) => `<td class="len">${cfg.units === "yd" ? h.yards : Math.round(h.yards * YD)}</td>`).join("")}<th>${cfg.units === "yd" ? sum(hs.map((h) => h.yards)) : Math.round(sum(hs.map((h) => h.yards)) * YD)}</th></tr>
      <tr><th>標準桿</th>${hs.map((h) => `<td>${h.par}</td>`).join("")}<th>${sum(hs.map((h) => h.par))}</th></tr>
      <tr><th>成績</th>${hs.map((h, i) => `<td>${sc(G.scores[from + i], h.par)}</td>`).join("")}<th>${sum(G.scores.slice(from, from + 9)) || ""}</th></tr>`;
  };
  const played = G.scores.filter((s) => s != null).length, total = G.scores.reduce((a, s) => a + (s || 0), 0), toPar = G.scores.reduce((a, s, i) => a + (s ? s - C.HOLES[i].par : 0), 0);
  const fir = G.stats.filter((s) => s && s.fir !== null), gir = G.stats.filter(Boolean);
  const done = played === 18 || (afterHole && G.holeN === 18);
  box.querySelector(".inner").innerHTML = `<h2>${C.COURSE.name}　記分卡</h2>
    <table>${row(0)}${row(9)}</table>
    <div class="tot"><span>總桿 <b>${total || "—"}</b></span><span>${played} 洞・<b>${toPar === 0 ? "E" : toPar > 0 ? "+" + toPar : toPar}</b></span><span>上球道 ${fir.filter((s) => s.fir).length}/${fir.length}</span><span>標準桿上果嶺 ${gir.filter((s) => s.gir).length}/${gir.length}</span><span>推桿 ${G.stats.reduce((a, s) => a + (s ? s.putts : 0), 0)}</span></div>
    <div class="row">${afterHole && !done ? `<button id="nextHole" class="main">第 ${G.holeN + 1} 洞 ▶</button>` : ""}${done ? `<button id="again" class="main">再打一場</button>` : ""}<button id="closeCard">${afterHole ? "看一下球場" : "關閉"}</button></div>`;
  $("#closeCard").onclick = () => { box.hidden = true; };
  const nx = $("#nextHole"); if (nx) nx.onclick = () => { box.hidden = true; loadHole(G.holeN + 1); };
  const ag = $("#again"); if (ag) ag.onclick = () => { box.hidden = true; startRound(1); };
}

/* ---------------- 音效（Web Audio 合成） ---------------- */
let actx = null;
function sound(kind, v = 1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    const noise = (dur, f, q, vol) => { const b = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * dur * 0.25)); const s = actx.createBufferSource(); s.buffer = b; const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; s.connect(bp).connect(g); g.gain.value = vol; s.start(t0); };
    if (kind === "hit") noise(0.18, 2600, 1.2, 0.5 * v);
    if (kind === "cup") { const o = actx.createOscillator(); o.frequency.value = 520; o.connect(g); g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25); o.start(t0); o.stop(t0 + 0.3); noise(0.12, 900, 3, 0.3); }
    if (kind === "splash") noise(0.6, 700, 0.8, 0.5);
    if (kind === "sand") noise(0.25, 1500, 0.6, 0.25);
    if (kind === "tree") noise(0.35, 3800, 0.5, 0.25);
    if (kind === "pin") { const o = actx.createOscillator(); o.frequency.value = 1800; o.connect(g); g.gain.setValueAtTime(0.15, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); o.start(t0); o.stop(t0 + 0.4); }
    if (kind === "cheer") noise(1.6, 1200, 0.4, 0.3);
  } catch (e) { /* 沒有音效也沒關係 */ }
}
function splash(e) {
  const n = 160, pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([e.x, G.hole.height(e.x, e.z) + 0.05, e.z], i * 3); const a = Math.random() * 6.28, s = Math.random() * 2; vel.push([Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xeaf4ff, size: 0.12, transparent: true, opacity: 0.85 }));
  world.scene.add(pts); FX.push({ pts, vel, t: 0 });
}
const FX = [];
function updateFX(dt) { for (const f of FX.slice()) { f.t += dt; const a = f.pts.geometry.attributes.position; for (let i = 0; i < f.vel.length; i++) { f.vel[i][1] -= 9.8 * dt; a.setXYZ(i, a.getX(i) + f.vel[i][0] * dt, a.getY(i) + f.vel[i][1] * dt, a.getZ(i) + f.vel[i][2] * dt); } a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 0.85 - f.t * 0.6); if (f.t > 1.5) { world.scene.remove(f.pts); FX.splice(FX.indexOf(f), 1); } } }

/* ---------------- 主迴圈 ---------------- */
let T = 0, last = performance.now(), hudT = 0;
function step(dt) {
  T += dt;
  if (G.phase === "aim") { updatePreview(); updateMeter(dt); }
  if (G.phase === "flight" && G.play) playback(dt);
  updateFX(dt);
  updateCamera(dt);
  // 球（遠的時候放大一點，看得到）
  const b = world.ball, by = G.ball.y + (G.phase === "aim" || G.phase === "flyover" || G.phase === "settle" ? teeHeight() : 0) + PH.BALL.r;
  b.position.set(G.ball.x, by, G.ball.z);
  b.scale.setScalar(Math.min(5, Math.max(1, camera.position.distanceTo(b.position) * 0.011)));
  b.visible = !(G.phase === "holed");
  // 軌跡、預測線
  if (G.play && G.play.trail.length > 1) { world.trail.visible = true; const n = G.play.trail.length; world.ribbon(world.trail, G.play.trail, camera, (i) => [1, 1, 1, 0.15 + 0.6 * (i / n)], 0.0016); } else world.trail.visible = false;
  if (G.phase === "aim" && G.preview && meter.state === "idle") {
    const pv = G.preview, club = clubs[G.club];
    let pts = pv.path;
    if (club.putter) { const frac = cfg.diff === "easy" ? 1 : cfg.diff === "pro" ? 0.3 : 0.6; pts = pts.slice(0, Math.max(2, Math.floor(pts.length * frac))); pts = pts.map((p) => ({ x: p.x, y: p.y + 0.02, z: p.z })); }
    else { const li = pv.path.findIndex((p) => p.t >= ((pv.events.find((e) => e.type === "land") || {}).t ?? 1e9)); pts = cfg.diff === "pro" ? pv.path.slice(0, Math.max(2, Math.floor((li > 0 ? li : pv.path.length) * 0.45))) : pv.path; }
    world.preview.visible = true;
    world.ribbon(world.preview, pts, camera, (i, n) => { const dash = Math.floor(i / 3) % 2 ? 0.25 : 0.95; return club.putter ? [1, 1, 1, dash * 0.8 * (1 - i / n * 0.5)] : [1, 0.93, 0.55, dash * 0.85]; }, club.putter ? 0.0012 : 0.0018);
    const land = pv.events.find((e) => e.type === "land");
    world.placeRing(world.landRing, !club.putter && cfg.diff !== "pro" ? land : null, Math.max(0.6, Math.hypot(land ? land.x - G.ball.x : 0, land ? land.z - G.ball.z : 0) / 120));
    world.placeRing(world.restRing, !club.putter && cfg.diff === "easy" ? pv.end : null, 1);
  } else if (G.phase !== "aim") { world.preview.visible = false; world.landRing.visible = world.restRing.visible = false; }
  else world.preview.visible = false;
  // 旗子朝向下風處
  if (world.flagGroup) world.flagGroup.rotation.y = Math.atan2(-G.wind.z, G.wind.x) + Math.PI * 0;
  world.update(dt, T, camera, G.phase === "flight" ? G.ball : cam.look.distanceTo(cam.pos) < 200 ? { x: (G.ball.x * 2 + cam.look.x) / 3, y: G.ball.y, z: (G.ball.z * 2 + cam.look.z) / 3 } : G.ball, G.wind);
  hudT += dt; if (hudT > 0.2) { hudT = 0; updateHUD(); drawMinimap(); }
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.hole && G.phase !== "loading") { step(dt); composer.render(dt); }
  requestAnimationFrame(frame);
}

/* ---------------- 開始 ---------------- */
function startRound(n = 1) {
  G.scores = Array(18).fill(null); G.stats = Array(18).fill(null); G.seed = (Date.now() / 1000) | 0; G.roundStart = n;
  rollWeather(); loadHole(n);
}
function menu() {
  const m = $("#menu"); m.hidden = false;
  const sel = (id, v) => { const el = $(id); el.value = v; el.onchange = () => { cfg[id.slice(2)] = el.value; saveCfg(); if (id === "#o_quality") $("#qnote").hidden = false; }; };
  sel("#o_units", cfg.units); sel("#o_diff", cfg.diff); sel("#o_weather", cfg.weather); sel("#o_wind", cfg.wind); sel("#o_time", cfg.time); sel("#o_quality", cfg.quality);
  const hs = $("#o_hole"); hs.innerHTML = C.HOLES.map((h) => `<option value="${h.n}">第 ${h.n} 洞・${h.name}・Par ${h.par}・${h.yards} 碼</option>`).join("");
  $("#bStart").onclick = () => { m.hidden = true; startRound(+hs.value); };
}
$("#courseInfo").textContent = `${C.COURSE.name}・18 洞・標準桿 ${C.COURSE.par}・${C.COURSE.yards.toLocaleString()} 碼`;

/* ---------------- 測試介面 ---------------- */
function simulate(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); }
/** 自動球童：找一桿能打到目標的桿、力道（測試用，也可以給玩家參考） */
function aiShot() {
  const h = G.hole;
  if (G.lie === SURF.GREEN || (distToPin() < 18 && G.lie === SURF.FRINGE)) return aiPutt();
  const t = target();
  let best = null;
  for (let ci = 0; ci < clubs.length - 1; ci++) {
    if (ci === 0 && G.lie !== SURF.TEE) continue;
    for (const pw of [1, 0.85, 0.7, 0.55, 0.4]) {
      const aim = Math.atan2(t.x - G.ball.x, -(t.z - G.ball.z));
      G.club = ci; G.aim = aim;
      const r = PH.simulate(shotSpec(pw), env(true), { maxT: 20 });
      const s = h.surface(r.end.x, r.end.z);
      let cost = Math.hypot(r.end.x - t.x, r.end.z - t.z) + (s === SURF.WATER || r.state === "water" ? 400 : s === SURF.OB ? 400 : s === SURF.BUNKER ? 25 : s === SURF.DEEP ? 30 : s === SURF.ROUGH ? 10 : 0);
      if (!best || cost < best.cost) best = { cost, ci, pw, aim };
    }
  }
  G.club = best.ci; G.aim = best.aim; G.power = best.pw;
  return best;
}
function aiPutt() {
  const h = G.hole; G.club = clubs.length - 1;
  const base = Math.atan2(h.pin.x - G.ball.x, -(h.pin.z - G.ball.z)), d = distToPin();
  let best = null;
  for (let da = -0.3; da <= 0.3; da += 0.01) for (const k of [0.95, 1.0, 1.05, 1.1, 1.18, 1.28]) {
    G.aim = base + da * Math.min(1, 6 / Math.max(1, d)); const pw = Math.min(1, puttPowerFor(d) * k);
    const r = PH.simulate(shotSpec(pw), env(true), { maxT: 30 });
    const cost = r.state === "holed" ? -1 : Math.hypot(r.end.x - h.pin.x, r.end.z - h.pin.z);
    if (!best || cost < best.cost) best = { cost, aim: G.aim, pw };
    if (cost < 0) break;
  }
  G.aim = best.aim; G.power = best.pw; return best;
}
/** 立刻打完這一桿（不播動畫） */
function quickShot(power = G.power, acc = 0) {
  fire(power, acc);
  G.play.t = G.play.end; playback(0);
  if (G.phase === "settle") toAim();
}
async function autoHole() {
  let n = 0;
  while (G.phase !== "holed" && n++ < 14) { aiShot(); quickShot(G.power, 0); }
  return G.strokes;
}
const tests = {
  lengths() { const bad = []; for (const s of C.HOLES) { const h = new C.Hole(s); if (Math.abs(h.line.len / YD - s.yards) > 0.5) bad.push(s.n); } return { ok: !bad.length, holes: 18, par: C.COURSE.par, yards: C.COURSE.yards, bad }; },
  clubs() { const out = {}; let ok = true; clubs.forEach((c, i) => { if (c.putter) return; const yd = CLUB_EST[i].carry / YD; out[c.id] = Math.round(yd); if (Math.abs(yd - c.carryYd) > c.carryYd * 0.03) ok = false; }); return { ok, carryYd: out }; },
  async play18() {
    const res = []; let nan = 0;
    for (let n = 1; n <= 18; n++) { await loadHole(n); endFlyover(); const s = await autoHole(); if (!isFinite(G.ball.x)) nan++; res.push(s); }
    const tot = res.reduce((a, b) => a + b, 0);
    return { ok: !nan && res.every((s) => s <= C.HOLES[0].par + 6) && tot < 72 + 30, scores: res.join(" "), total: tot, toPar: tot - 72 };
  },
  async putts() {
    await loadHole(1); endFlyover();
    const h = G.hole, r = C.rng(5); let holed = 0, tries = 0;
    for (let k = 0; k < 8; k++) { const a = r() * 6.28, d = 1.5 + r() * 4; const x = h.pin.x + Math.cos(a) * d, z = h.pin.z + Math.sin(a) * d; if (h.surface(x, z) !== SURF.GREEN) continue; tries++; placeBall(x, z); G.phase = "aim"; G.strokes = 0; const b = aiPutt(); if (b.cost < 0) holed++; }
    return { ok: tries > 3 && holed >= tries * 0.75, tries, holedWithBestLine: holed };
  },
  async water() {
    // 第 3 洞：短洞，前面整片水；故意打短
    await loadHole(3); endFlyover();
    G.club = clubs.findIndex((c) => c.id === "LW"); G.aim = Math.atan2(G.hole.pin.x, -G.hole.pin.z);
    const s0 = G.strokes; quickShot(0.75, 0);
    const pen = G.strokes - s0;
    return { ok: pen === 2 && G.hole.surface(G.ball.x, G.ball.z) !== SURF.WATER, strokesAdded: pen, ballOn: C.SURF_NAME[G.hole.surface(G.ball.x, G.ball.z)] };
  },
};
window.golf = { C, PH, G, world, camera, cfg, tests, loadHole, startRound, rollWeather, aiShot, aiPutt, quickShot, toAim, endFlyover, setCam: (m) => { cam.mode = m; cam.snap = true; }, simulate, render: () => composer.render(), placeBall, fire, recommend };

/* 啟動 */
(async () => {
  progress(0.02, "準備草皮與天空…");
  $("#loading").hidden = false; $("#ltitle").textContent = "翠嶺高爾夫";
  document.body.classList.add("ready");
  rollWeather();
  if (SHOT) { $("#loading").hidden = true; requestAnimationFrame(() => {}); return; }
  $("#loading").hidden = true;
  menu();
  requestAnimationFrame(frame);
})();
