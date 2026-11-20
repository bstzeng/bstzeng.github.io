// 清明上河圖：主程式（畫前觀賞＝只能左右捲動的活畫卷；走進畫中＝第一人稱自由走動）
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as P from "./plan.js";
import { buildWorld } from "./world.js";
import { Life } from "./sim.js";
import { buildSky, buildMountains, Water } from "../../xishan/js/env.js";
import { wind } from "../../xishan/js/plants.js";
import * as TX from "../../xishan/js/tex.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const LOW = params.has("low") || /Mobi|Android|iPad|iPhone/.test(navigator.userAgent);

/* ---------------- 渲染器 ---------------- */
const canvas = $("#c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const SILK = new THREE.Color(0xd9ccab);
const scene = new THREE.Scene();
scene.background = SILK.clone();
const walkFog = new THREE.FogExp2(0xd8d2bc, 0.0032);

// 早春清晨：低角度、偏暖的光，從東南（畫的右下）照過來
const sunDir = new THREE.Vector3(110, 320, 120).normalize();
const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
const sc = sun.shadow.camera;
sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 1400;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xe8e6d6, 0x8a7a5a, 1.25);
scene.add(hemi);
function followShadow(x, z) {
  x = Math.round(x / 4) * 4; z = Math.round(z / 4) * 4;
  sun.target.position.set(x, 0, z);
  sun.position.set(x, 0, z).addScaledVector(sunDir, 600);
}

/* ---------------- 兩台相機 ---------------- */
const PITCH = THREE.MathUtils.degToRad(44);       // 畫卷的俯視角
const VIEW_H = 80;                                // 畫面高度（公尺）
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
const persp = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 6000);
let camera = ortho;
// 畫面中線沿著畫卷的走向（汴河斜斜穿過畫面）
const bandZ = new P.Line(P.spline([[700, 30], [560, 30], [470, 50], [400, 70], [320, 68], [240, 38], [150, 12], [70, 0], [0, -2], [-80, 4], [-200, 0], [-330, 4], [-430, 4], [-520, 0], [-700, 0]], 4), 20);
function zAt(x) { const n = bandZ.near(x, 0, 400); return n.z; }
function viewW() { return VIEW_H * (innerWidth / innerHeight); }
const pan = { x: 360, target: 360, v: 0, auto: false };
function panLimits() { const w = viewW() / 2; return [P.X0 + w, P.X1 - w]; }
function clampPan(x) { const [a, b] = panLimits(); return a > b ? (a + b) / 2 : P.clamp(x, a, b); }
function placeOrtho() {
  const w = viewW() / 2, h = VIEW_H / 2;
  ortho.left = -w; ortho.right = w; ortho.top = h; ortho.bottom = -h; ortho.updateProjectionMatrix();
  const x = pan.x, z = zAt(x);
  ortho.position.set(x, P.LAND + Math.sin(PITCH) * 1000, z + Math.cos(PITCH) * 1000);
  ortho.up.set(0, 1, 0);
  ortho.lookAt(x, P.LAND, z);
}

/* ---------------- 繪畫效果（絹本設色） ---------------- */
const PaintShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uAmt: { value: 1 }, uPan: { value: 0 }, uMist: { value: 1 }, uSilk: { value: new THREE.Vector3(0.85, 0.78, 0.61) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uAmt; uniform float uPan; uniform float uMist; uniform vec3 uSilk;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float L(vec2 o){ return lum(texture2D(tDiffuse, vUv + o / uRes).rgb); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uAmt <= 0.0) { gl_FragColor = vec4(c, 1.0); return; }
      // 墨線：亮度的 Sobel 邊
      float gx = -L(vec2(-1,1)) - 2.0*L(vec2(-1,0)) - L(vec2(-1,-1)) + L(vec2(1,1)) + 2.0*L(vec2(1,0)) + L(vec2(1,-1));
      float gy = -L(vec2(-1,-1)) - 2.0*L(vec2(0,-1)) - L(vec2(1,-1)) + L(vec2(-1,1)) + 2.0*L(vec2(0,1)) + L(vec2(1,1));
      float edge = smoothstep(0.12, 0.5, length(vec2(gx, gy)));
      // 設色：降飽和、偏赭黃，畫在絹上（相乘）
      float l = lum(c);
      vec3 tone = mix(vec3(l), c, 0.62) * vec3(1.02, 0.96, 0.84);
      tone = pow(tone, vec3(0.9));
      vec3 col = uSilk * mix(vec3(1.0), tone * 1.32, 0.86);
      // 絹紋、舊漬（跟著畫卷一起捲動）
      vec2 sp = vec2(vUv.x * uRes.x + uPan, vUv.y * uRes.y);
      float grain = noise(sp * 0.9) * 0.5 + noise(sp * 0.23) * 0.5;
      float weave = sin(sp.x * 1.9) * sin(sp.y * 1.9);
      float stain = noise(sp * 0.003 + 3.1) * 0.6 + noise(sp * 0.009) * 0.4;
      col *= 0.95 + grain * 0.07 + weave * 0.012;
      col *= mix(1.0, 0.94, smoothstep(0.62, 0.9, stain));
      col = mix(col, vec3(0.17, 0.13, 0.10), edge * 0.6);
      // 上方淡入雲霧，像畫卷的留白
      float top = smoothstep(0.70, 0.98, vUv.y) * uMist;
      float bot = smoothstep(0.10, 0.0, vUv.y) * uMist * 0.6;
      vec3 silkC = uSilk * (0.97 + grain * 0.05);
      col = mix(col, silkC, max(top * (0.75 + 0.25 * noise(sp * 0.01)), bot));
      gl_FragColor = vec4(mix(c, col, uAmt), 1.0);
    }`,
};
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new OutputPass());
const paintPass = new ShaderPass(PaintShader);
composer.addPass(paintPass);
function resizeComposer() {
  const pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  paintPass.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr);
}
resizeComposer();

/* ---------------- 建立世界 ---------------- */
const progress = (t, msg) => { $("#loadbar").style.width = `${Math.round(t * 100)}%`; $("#loadmsg").textContent = msg; };
const tick = () => new Promise((r) => setTimeout(r, 0));
const world = {};
async function build() {
  progress(0.08, "鋪開絹本、畫地形與汴河…"); await tick();
  world.sky = buildSky(scene, sunDir);
  world.mountains = buildMountains(scene);
  world.mountains.scale.set(1.25, 0.8, 1);
  progress(0.25, "架虹橋、築城門、蓋店鋪…"); await tick();
  const w = buildWorld(scene);
  world.bridgeMeshes = w.bridgeMeshes;
  progress(0.6, "放水…"); await tick();
  world.water = new Water(renderer, scene, { quality: LOW ? 0.5 : 0.8 });
  world.water.mesh.scale.set(1.0, 1, 1);
  progress(0.75, "人、驢、駱駝、船都出門了…"); await tick();
  world.life = new Life(scene);
  progress(1, "完成");
}

/* ---------------- 模式 ---------------- */
const player = { x: 0, z: 0, y: P.LAND, yaw: 0, pitch: -0.05, kind: "ground" };
let mode = "paint";
function setMode(m, opt = {}) {
  mode = m;
  document.body.dataset.mode = m;
  $("#menu").hidden = true;
  if (m === "paint") {
    camera = ortho;
    if (opt.x !== undefined) pan.x = pan.target = clampPan(opt.x);
    scene.fog = null; scene.background = SILK.clone();
    world.sky.visible = false; world.mountains.visible = false;
    paintPass.uniforms.uAmt.value = paintOn ? 1 : 0;
    paintPass.uniforms.uMist.value = 1;
    hint("拖曳、滾輪或方向鍵左右捲動畫卷 · 按「展卷」自動慢慢看 · 只能左右移動，就像站在畫前");
  } else {
    camera = persp;
    scene.fog = walkFog; scene.background = new THREE.Color(0xd8d2bc);
    world.sky.visible = true; world.mountains.visible = true;
    paintPass.uniforms.uAmt.value = paintOn ? 0.45 : 0;
    paintPass.uniforms.uMist.value = 0;
    pan.auto = false; updateAutoBtn();
    const s = opt.at || walkStartFromPan();
    player.x = s.x; player.z = s.z; player.yaw = s.yaw ?? 0; player.pitch = -0.04;
    const g = P.topSurface(s.x, s.z); player.y = g ? g.y : P.LAND; player.kind = g ? g.kind : "ground";
    hint("WASD／方向鍵走路 · 拖曳看四周 · Shift 快跑 · 平板用左下搖桿");
  }
  renderPass.camera = camera;
}
/** 從畫面中央「走進畫裡」：找最近的路 */
function walkStartFromPan() {
  const x = pan.x, z = zAt(x) + 25;
  let best = null;
  for (const R of P.roadLines) {
    if (R.kind === "none") continue;
    const n = R.line.near(x, z, 300);
    if (!best || n.d < best.n.d) best = { n, R };
  }
  const p = best.R.line.at(best.n.s);
  // 面向畫卷的左邊（往城裡走）
  const dir = p.tx < 0 ? 1 : -1;
  return { x: best.n.x, z: best.n.z, yaw: Math.atan2(-p.tx * dir, -p.tz * dir) };
}
let hintTimer;
function hint(t) { const el = $("#hint"); el.textContent = t; el.classList.add("show"); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove("show"), 6500); }

/* ---------------- 走路 ---------------- */
function walkStep(dt, fwd, strafe, run) {
  const sp = (run ? 5.0 : 2.2) * dt;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let dx = (fx * fwd + -fz * strafe) * sp, dz = (fz * fwd + fx * strafe) * sp;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  dx /= n; dz /= n;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    let r = P.tryMove(player.x, player.z, player.y, dx, dz);
    if (!r) r = P.tryMove(player.x, player.z, player.y, dx, 0) || P.tryMove(player.x, player.z, player.y, 0, dz);
    if (!r) break;
    player.x = r.x; player.z = r.z; player.y = r.y; player.kind = r.kind; moved++;
  }
  return moved;
}

/* ---------------- 輸入 ---------------- */
const keys = new Set();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space" && mode === "paint") { toggleAuto(); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (mode === "walk" && e.pointerType === "touch" && e.clientX < innerWidth * 0.35) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), vx: 0 };
  canvas.setPointerCapture(e.pointerId);
  if (mode === "paint") { pan.auto = false; updateAutoBtn(); }
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (mode === "paint") {
    const k = viewW() / innerWidth;
    pan.target = clampPan(pan.target - dx * k);
    pan.x = pan.target;
    const now = performance.now(); drag.vx = (-dx * k) / Math.max(1, now - drag.t) * 1000; drag.t = now;
  } else {
    player.yaw -= dx * 0.0042;
    player.pitch = P.clamp(player.pitch - dy * 0.0035, -1.2, 1.1);
  }
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) { if (mode === "paint" && performance.now() - drag.t < 80) pan.v = P.clamp(drag.vx, -260, 260); drag = null; } };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (e) => {
  if (mode !== "paint") return;
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  pan.target = clampPan(pan.target + d * viewW() / innerWidth * 0.9);
  pan.auto = false; updateAutoBtn();
}, { passive: false });
// 觸控搖桿
const joy = { x: 0, y: 0, id: null };
const pad = $("#joy");
pad.addEventListener("pointerdown", (e) => { joy.id = e.pointerId; pad.setPointerCapture(e.pointerId); moveJoy(e); });
pad.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; $("#joy i").style.transform = ""; } };
pad.addEventListener("pointerup", endJoy); pad.addEventListener("pointercancel", endJoy);
function moveJoy(e) {
  const r = pad.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y;
  $("#joy i").style.transform = `translate(${x * 34}px, ${y * 34}px)`;
}
// 畫卷按鈕
let holdDir = 0;
for (const [id, d] of [["#pL", -1], ["#pR", 1]]) {
  const b = $(id);
  b.addEventListener("pointerdown", (e) => { holdDir = d; pan.auto = false; updateAutoBtn(); b.setPointerCapture(e.pointerId); });
  const up = () => { holdDir = 0; };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
}
function toggleAuto() { pan.auto = !pan.auto; if (pan.auto && pan.x <= panLimits()[0] + 1) pan.x = pan.target = panLimits()[1]; updateAutoBtn(); }
function updateAutoBtn() { $("#pAuto").textContent = pan.auto ? "❚❚ 停" : "▶ 展卷"; $("#pAuto").classList.toggle("on", pan.auto); }
$("#pAuto").onclick = toggleAuto;
let paintOn = true;
$("#pFx").onclick = () => { paintOn = !paintOn; $("#pFx").classList.toggle("on", paintOn); paintPass.uniforms.uAmt.value = paintOn ? (mode === "paint" ? 1 : 0.45) : 0; };
$("#toWalk").onclick = () => setMode("walk");
$("#toPaint").onclick = () => setMode("paint", { x: player.x });
$("#bPaint").onclick = () => setMode("paint");
$("#bWalk").onclick = () => setMode("walk");

/* ---------------- 卷軸導覽條 ---------------- */
const strip = $("#strip");
function drawStrip() {
  const cv = strip, dpr = Math.min(2, devicePixelRatio);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const Xs = (x) => ((x - P.X0) / (P.X1 - P.X0)) * W;   // 和畫面同方向：右邊是郊野
  for (const S of P.SECTIONS) {
    const a = Xs(S.x1), b = Xs(S.x0);
    g.fillStyle = { 郊野: "#b9b58a", 汴河: "#9fb0a2", 虹橋: "#c6a77a", 街市: "#c9a98a", 城門: "#a99a86", 城內: "#bfa48c" }[S.name];
    g.fillRect(a, 0, b - a, H);
    g.fillStyle = "rgba(40,28,18,.85)"; g.font = "600 12px 'Noto Serif TC', serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(S.name, (a + b) / 2, H / 2);
    g.fillStyle = "rgba(40,28,18,.25)"; g.fillRect(b - 1, 0, 1, H);
  }
  const w = viewW();
  const a = Xs(pan.x - w / 2), b = Xs(pan.x + w / 2);
  g.strokeStyle = "#7a1f14"; g.lineWidth = 2; g.strokeRect(a + 1, 1, b - a - 2, H - 2);
  g.fillStyle = "rgba(122,31,20,.12)"; g.fillRect(a, 0, b - a, H);
}
let stripDrag = false;
function stripTo(e) { const r = strip.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width; pan.target = clampPan(P.X0 + u * (P.X1 - P.X0)); pan.auto = false; updateAutoBtn(); }
strip.addEventListener("pointerdown", (e) => { stripDrag = true; strip.setPointerCapture(e.pointerId); stripTo(e); });
strip.addEventListener("pointermove", (e) => { if (stripDrag) stripTo(e); });
strip.addEventListener("pointerup", () => { stripDrag = false; });

function sectionAt(x) { return P.SECTIONS.find((s) => x <= s.x0 && x > s.x1) || P.SECTIONS[0]; }
let lastSec = null;
function updateUI() {
  if (mode === "paint") {
    const s = sectionAt(pan.x);
    if (s !== lastSec) { lastSec = s; $("#secName").textContent = s.name; $("#secNote").textContent = s.note; $("#section").classList.remove("pop"); void $("#section").offsetWidth; $("#section").classList.add("pop"); }
    drawStrip();
  } else {
    const near = P.buildings.find((b) => Math.hypot(b.x - player.x, b.z - player.z) < Math.max(b.w, b.d) * 0.6 + 4);
    $("#place").textContent = player.kind === "bridge" ? (Math.abs(player.x - P.bridge.cx) < 40 ? "虹橋" : "小橋") : near ? near.name : sectionAt(player.x).name;
  }
}

/* ---------------- 主迴圈 ---------------- */
const clock = new THREE.Clock();
let T = 0, uiT = 0;
function update(dt) {
  T += dt;
  wind.value = T;
  world.life.update(dt, T);
  world.water.uniforms.uTime.value = T;
  world.water.setBoats(world.life.wakes());
  if (mode === "paint") {
    let dir = holdDir;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) dir -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dir += 1;
    if (dir) { pan.target = clampPan(pan.target + dir * dt * (keys.has("ShiftLeft") ? 120 : 45)); pan.auto = false; }
    if (pan.auto) { pan.target = clampPan(pan.target - dt * 7); if (pan.target <= panLimits()[0] + 0.01) { pan.auto = false; updateAutoBtn(); } }
    if (Math.abs(pan.v) > 0.5) { pan.target = clampPan(pan.target + pan.v * dt); pan.v *= Math.pow(0.04, dt); } else pan.v = 0;
    pan.target = clampPan(pan.target);
    pan.x += (pan.target - pan.x) * Math.min(1, dt * 8);
  } else {
    let fwd = 0, str = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyA")) str -= 1;
    if (keys.has("KeyD")) str += 1;
    if (keys.has("ArrowLeft")) player.yaw += dt * 1.8;
    if (keys.has("ArrowRight")) player.yaw -= dt * 1.8;
    fwd += -joy.y; str += joy.x;
    if (fwd || str) walkStep(dt, P.clamp(fwd, -1, 1), P.clamp(str, -1, 1), keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(joy.x, joy.y) > 0.92);
  }
}
function placeCamera() {
  if (mode === "paint") {
    placeOrtho();
    followShadow(pan.x, zAt(pan.x) - 20);
    paintPass.uniforms.uPan.value = pan.x * (paintPass.uniforms.uRes.value.x / viewW());
  } else {
    persp.position.set(player.x, player.y + 1.62, player.z);
    persp.rotation.set(player.pitch, player.yaw, 0, "YXZ");
    followShadow(player.x - Math.sin(player.yaw) * 60, player.z - Math.cos(player.yaw) * 60);
  }
}
function render() {
  if (mode === "walk") world.water.render(persp);
  composer.render();
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  placeCamera();
  render();
  uiT += dt;
  if (uiT > 0.12) { uiT = 0; updateUI(); }
  requestAnimationFrame(frame);
}
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  persp.aspect = innerWidth / innerHeight; persp.updateProjectionMatrix();
  resizeComposer();
  pan.x = pan.target = clampPan(pan.x);
  if (world.water) world.water.resize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), LOW ? 0.5 : 0.8);
});
document.querySelector(".paper").style.backgroundImage = `url(${TX.paperDataURL()})`;

/* ---------------- 測試介面 ---------------- */
function simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) update(dt); }
const tests = {
  /** 從南岸走上虹橋、過橋到北岸 */
  bridgeWalk() {
    const B = P.bridge, a0 = B.half + 7, a1 = -B.half - 5;
    const s = B.toWorld(a0, 0);
    setMode("walk", { at: { x: s.x, z: s.z, yaw: Math.atan2(B.ax, B.az) } });
    let top = 0, stuck = 0, maxStep = 0, last = player.y;
    for (let i = 0; i < 1500; i++) {
      const bx = player.x, bz = player.z;
      walkStep(1 / 30, 1, 0, false);
      if (Math.hypot(player.x - bx, player.z - bz) < 0.01) stuck++;
      top = Math.max(top, player.y); maxStep = Math.max(maxStep, Math.abs(player.y - last)); last = player.y;
      if (B.toLocal(player.x, player.z).a < a1) break;
    }
    const end = B.toLocal(player.x, player.z).a;
    return { ok: end < a1 && stuck === 0 && top > B.y0 + B.rise - 0.2, reachedA: +end.toFixed(1), topY: +top.toFixed(2), maxStepPerFrame: +maxStep.toFixed(3), framesStuck: stuck };
  },
  /** 沿大街穿過城門洞 */
  gateWalk() {
    const g = P.gate;
    setMode("walk", { at: { x: g.x + 40, z: g.z, yaw: Math.PI / 2 } });     // yaw π/2：面向 -x
    let stuck = 0;
    for (let i = 0; i < 1200 && player.x > g.x - 40; i++) { const bx = player.x; walkStep(1 / 30, 1, 0, false); if (Math.abs(player.x - bx) < 0.01) stuck++; }
    // 從城牆撞過去應該過不去
    setMode("walk", { at: { x: g.x + 30, z: g.z + 30, yaw: Math.PI / 2 } });
    for (let i = 0; i < 900; i++) walkStep(1 / 30, 1, 0, false);
    const blockedByWall = player.x > g.x;
    return { ok: stuck === 0 && blockedByWall, passedGate: stuck === 0, blockedByWall, wallStopAtX: +player.x.toFixed(1) };
  },
  /** 畫卷只能左右捲動，而且不會超出兩端 */
  panLimits() {
    setMode("paint");
    const [a, b] = panLimits();
    pan.target = -1e6; simulate(2); const left = pan.x;
    const y0 = ortho.position.y, pitch0 = ortho.rotation.x;
    pan.target = 1e6; pan.target = clampPan(pan.target); simulate(2); const right = pan.x;
    placeOrtho();
    return { ok: Math.abs(left - a) < 0.5 && Math.abs(right - b) < 0.5 && Math.abs(ortho.position.y - y0) < 1e-6 && Math.abs(ortho.rotation.x - pitch0) < 1e-6, left: +left.toFixed(1), right: +right.toFixed(1), limits: [+a.toFixed(1), +b.toFixed(1)] };
  },
  /** 大船過橋：桅杆有放倒、船頂不撞橋 */
  bigBoat() {
    const B = world.life.big, ray = new THREE.Raycaster();
    let minClear = Infinity, maxMastK = 0, samples = 0, maxTop = 0;
    const L = B.line, sB = L.near(P.bridge.cx, P.bridge.cz).s;
    B.s = sB - 90; B.mastK = 0;
    for (let i = 0; i < 4000 && B.s < sB + 40; i++) {
      update(1 / 15);
      const loc = P.bridge.toLocal(B.g.position.x, B.g.position.z);
      if (Math.abs(loc.b) > P.bridge.hw + 12) continue;
      samples++;
      maxMastK = Math.max(maxMastK, B.mastK);
      B.g.updateMatrixWorld(true);
      const box = new THREE.Box3();
      B.g.traverse((o) => { if (o.isMesh && !o.userData.prop) box.expandByObject(o, true); });
      const top = box.max.y;
      maxTop = Math.max(maxTop, top);
      for (const u of [-8, -4, 0, 4, 8]) for (const v of [-2, 0, 2]) {
        const p = new THREE.Vector3(u, 0, v).applyMatrix4(B.g.matrixWorld);
        ray.set(new THREE.Vector3(p.x, top, p.z), new THREE.Vector3(0, 1, 0)); ray.far = 40;
        const h = ray.intersectObjects(world.bridgeMeshes, false)[0];
        if (h) minClear = Math.min(minClear, h.distance);
      }
    }
    return { ok: samples > 10 && maxMastK > 0.95 && minClear > 0.5 && minClear < 20, samples, mastLowered: +maxMastK.toFixed(2), boatTopY: +maxTop.toFixed(2), minHeadroom: +minClear.toFixed(2) };
  },
  /** 人和牲口真的在動 */
  moving() {
    const a = world.life.snapshot();
    simulate(2);
    const b = world.life.snapshot();
    let moved = 0;
    for (let i = 0; i < a.length; i++) if (Math.hypot(a[i][0] - b[i][0], a[i][2] - b[i][2]) > 0.3) moved++;
    return { ok: moved > a.length * 0.4, people: a.length, movedIn2s: moved };
  },
};
window.qingming = {
  P, world, player, pan, ortho, persp, setMode, simulate, tests, walkStep, renderer, scene, clampPan, panLimits,
  get mode() { return mode; },
  frame(dt = 0) { if (dt) simulate(dt); placeCamera(); render(); updateUI(); },
};

/* ---------------- 開始 ---------------- */
await build();
document.body.classList.add("ready");
$("#loading").hidden = true;
const startX = params.has("x") ? +params.get("x") : P.X1;
setMode("paint", { x: startX });
if (!SHOT) $("#menu").hidden = false;
if (!SHOT) { clock.start(); frame(); }
