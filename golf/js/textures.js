// 程序產生的材質（可無縫拼接）：草、沙、樹皮、葉片、針葉、草叢、球的凹洞、水面法線
import * as THREE from "three";
import { rng } from "./course.js";

const mk = (n) => { const c = document.createElement("canvas"); c.width = c.height = n; return c; };
/** 週期性的值雜訊（可無縫拼接） */
function pnoise(n, cells, seed) {
  const r = rng(seed), g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(n * n), k = cells / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x * k, fy = y * k, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = u * u * (3 - 2 * u), t = v * v * (3 - 2 * v);
    const a = g[(j % cells) * cells + (i % cells)], b = g[(j % cells) * cells + ((i + 1) % cells)], c = g[((j + 1) % cells) * cells + (i % cells)], d = g[((j + 1) % cells) * cells + ((i + 1) % cells)];
    out[y * n + x] = a + (b - a) * s + (c - a) * t + (a - b - c + d) * s * t;
  }
  return out;
}
function pfbm(n, seed, layers) { const out = new Float32Array(n * n); let tot = 0; for (const [cells, amp] of layers) { const a = pnoise(n, cells, seed + cells); for (let i = 0; i < out.length; i++) out[i] += a[i] * amp; tot += amp; } for (let i = 0; i < out.length; i++) out[i] /= tot; return out; }
/** 在畫布上畫東西，跨邊界的自動在對面再畫一次（無縫） */
function wrapDraw(n, x, y, pad, fn) { for (const ox of [0, -n, n]) for (const oy of [0, -n, n]) { if ((ox && Math.abs(x + ox - n / 2) > n / 2 + pad) || (oy && Math.abs(y + oy - n / 2) > n / 2 + pad)) continue; fn(x + ox, y + oy); } }
/** 由高度圖算法線圖 */
function normalFromHeight(h, n, strength) {
  const c = mk(n), g = c.getContext("2d"), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = h[y * n + ((x - 1 + n) % n)], r = h[y * n + ((x + 1) % n)], u = h[((y - 1 + n) % n) * n + x], d = h[((y + 1) % n) * n + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * n + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function heightOf(c) { const n = c.width, d = c.getContext("2d").getImageData(0, 0, n, n).data, h = new Float32Array(n * n); for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255; return h; }
export function tex(canvas, { srgb = true, repeat = true, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true; return t;
}

/** 草：底色斑塊 + 上萬根草葉（各自顏色、方向），附法線 */
export function grass(o) {
  const { n = 1024, seed = 1, base = [74, 120, 52], vary = 0.14, blades = 50000, len = [5, 11], w = 1.2, dry = 0.08, dir = null, clover = 0 } = o;
  const c = mk(n), g = c.getContext("2d"), hc = mk(n), hg = hc.getContext("2d");
  const pat = pfbm(n, seed, [[4, 1], [9, 0.6], [23, 0.35]]);
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const k = 0.82 + (pat[i] - 0.5) * vary * 3; img.data[i * 4] = base[0] * k; img.data[i * 4 + 1] = base[1] * k; img.data[i * 4 + 2] = base[2] * k; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  hg.fillStyle = "#555"; hg.fillRect(0, 0, n, n);
  const r = rng(seed * 7 + 3);
  g.lineCap = hg.lineCap = "round";
  for (let i = 0; i < blades; i++) {
    const x = r() * n, y = r() * n, p = pat[(Math.floor(y) % n) * n + (Math.floor(x) % n)];
    const L = len[0] + r() * (len[1] - len[0]);
    const a = dir !== null ? dir + (r() - 0.5) * 0.9 : r() * Math.PI * 2;
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    const isDry = r() < dry * (0.6 + p);
    const k = 0.62 + r() * 0.75;
    const col = isDry ? [base[0] * 1.6 * k + 30, base[1] * 1.25 * k + 10, base[2] * 0.8 * k] : [base[0] * k, base[1] * k, base[2] * k * (0.9 + r() * 0.3)];
    g.strokeStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.lineWidth = w * (0.6 + r() * 0.8);
    const hv = 90 + r() * 165; hg.strokeStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`; hg.lineWidth = g.lineWidth;
    wrapDraw(n, x, y, L + 2, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + dx * 0.5 + dy * 0.12, py + dy * 0.5 - dx * 0.12, px + dx, py + dy); g.stroke(); hg.beginPath(); hg.moveTo(px, py); hg.lineTo(px + dx, py + dy); hg.stroke(); });
  }
  // 三葉草、小葉子（長草區）
  for (let i = 0; i < clover; i++) { const x = r() * n, y = r() * n, s = 2 + r() * 3; g.fillStyle = `rgba(${base[0] * 0.8 | 0},${base[1] * 1.05 | 0},${base[2] * 0.7 | 0},.9)`; wrapDraw(n, x, y, 8, (px, py) => { for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; g.beginPath(); g.arc(px + Math.cos(a) * s, py + Math.sin(a) * s, s, 0, 7); g.fill(); } }); }
  const nm = normalFromHeight(heightOf(hc), n, 2.2);
  return { map: tex(c), normal: tex(nm, { srgb: false }) };
}
/** 沙：細顆粒＋風吹的紋路 */
export function sand(n = 1024, seed = 5) {
  const c = mk(n), g = c.getContext("2d");
  const big = pfbm(n, seed, [[3, 1], [7, 0.5], [17, 0.3]]), fine = pfbm(n, seed + 9, [[128, 1], [256, 0.8]]);
  const img = g.createImageData(n, n), h = new Float32Array(n * n), r = rng(seed);
  for (let i = 0; i < n * n; i++) {
    const x = i % n, y = (i / n) | 0;
    const rip = Math.sin((x * 0.06 + y * 0.025 + big[i] * 9) * 1.0) * 0.5 + 0.5;
    const gr = fine[i], speck = r() < 0.012 ? (r() < 0.5 ? -0.35 : 0.25) : 0;
    const k = 0.86 + (big[i] - 0.5) * 0.18 + (gr - 0.5) * 0.22 + rip * 0.04 + speck;
    img.data[i * 4] = 222 * k; img.data[i * 4 + 1] = 200 * k; img.data[i * 4 + 2] = 160 * k; img.data[i * 4 + 3] = 255;
    h[i] = gr * 0.7 + rip * 0.3;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normal: tex(normalFromHeight(h, n, 3.5), { srgb: false }) };
}
/** 大範圍的明暗變化（打破重複感） */
export function macro(n = 512, seed = 3) {
  const c = mk(n), g = c.getContext("2d"), a = pfbm(n, seed, [[3, 1], [6, 0.7], [13, 0.5], [29, 0.3]]), img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const v = a[i] * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c, { srgb: false });
}
/** 水面法線（兩層捲動） */
export function waterNormal(n = 512, seed = 11) {
  const h = pfbm(n, seed, [[8, 1], [16, 0.6], [32, 0.35], [64, 0.2]]);
  return tex(normalFromHeight(h, n, 6), { srgb: false });
}
/** 樹皮 */
export function bark(n = 256, seed = 13) {
  const c = mk(n), g = c.getContext("2d"), a = pfbm(n, seed, [[4, 0.4], [32, 1], [64, 0.5]]), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; const v = a[i] * 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(x * 0.35 + a[i] * 12)); img.data[i * 4] = 70 + v * 60; img.data[i * 4 + 1] = 55 + v * 45; img.data[i * 4 + 2] = 42 + v * 32; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c);
}
/** 樹葉簇：一張有很多葉子的透明卡片 */
export function foliage(kind, n = 512, seed = 17) {
  const c = mk(n), g = c.getContext("2d"), r = rng(seed + kind * 101);
  const cols = kind === 0 ? [[38, 66, 34], [52, 84, 40], [30, 52, 30], [64, 96, 46]] : kind === 1 ? [[60, 96, 42], [78, 118, 50], [46, 78, 36], [96, 130, 58]] : [[34, 64, 38], [46, 80, 46], [28, 52, 32], [58, 92, 52]];
  if (kind === 0) {
    // 松：一束束針葉從枝條長出
    for (let b = 0; b < 44; b++) {
      const x0 = n * (0.15 + r() * 0.7), y0 = n * (0.15 + r() * 0.7), a0 = r() * 6.28, L = n * (0.12 + r() * 0.12);
      g.strokeStyle = "rgb(70,52,36)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a0) * L, y0 + Math.sin(a0) * L); g.stroke();
      for (let k = 0; k < 120; k++) { const t = r(), px = x0 + Math.cos(a0) * L * t, py = y0 + Math.sin(a0) * L * t, a = a0 + (r() - 0.5) * 2.4, l = 8 + r() * 14; const cc = cols[(r() * 4) | 0]; g.strokeStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); }
    }
  } else {
    // 闊葉：一片片葉子（有葉脈的橢圓）
    const count = kind === 1 ? 1100 : 1300;
    for (let k = 0; k < count; k++) {
      const a = r() * 6.28, rr = Math.pow(r(), 0.7) * n * 0.44, x = n / 2 + Math.cos(a) * rr, y = n / 2 + Math.sin(a) * rr;
      const cc = cols[(r() * 4) | 0], sh = 0.8 + r() * 0.4, s = (kind === 1 ? 9 : 6) * (0.7 + r() * 0.6);
      g.save(); g.translate(x, y); g.rotate(r() * 6.28);
      g.fillStyle = `rgb(${cc[0] * sh | 0},${cc[1] * sh | 0},${cc[2] * sh | 0})`; g.beginPath(); g.ellipse(0, 0, s, s * 0.48, 0, 0, 7); g.fill();
      g.strokeStyle = `rgba(20,40,15,.35)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
      g.restore();
    }
  }
  return tex(c, { aniso: 4 });
}
/** 草叢卡片（近景長草） */
export function tuft(n = 256, seed = 19) {
  const c = mk(n), g = c.getContext("2d"), r = rng(seed);
  for (let k = 0; k < 90; k++) {
    const x = n * (0.1 + r() * 0.8), h = n * (0.35 + r() * 0.6), lean = (r() - 0.5) * n * 0.25, k2 = 0.7 + r() * 0.5;
    const grad = g.createLinearGradient(0, n, 0, n - h); grad.addColorStop(0, `rgb(${40 * k2 | 0},${62 * k2 | 0},${30 * k2 | 0})`); grad.addColorStop(1, `rgb(${110 * k2 | 0},${140 * k2 | 0},${70 * k2 | 0})`);
    g.fillStyle = grad; g.beginPath(); g.moveTo(x - 2.5, n); g.quadraticCurveTo(x + lean * 0.3, n - h * 0.6, x + lean, n - h); g.quadraticCurveTo(x + lean * 0.3 + 1.5, n - h * 0.6, x + 2.5, n); g.fill();
  }
  return tex(c, { aniso: 4 });
}
/** 高爾夫球的凹洞法線 */
export function dimples(n = 256) {
  const h = new Float32Array(n * n);
  const cells = 22;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x / n) * cells, v = (y / n) * cells * 0.5, row = Math.floor(v), off = row % 2 ? 0.5 : 0;
    const fx = ((u + off) % 1) - 0.5, fy = (v % 1) - 0.5, d = Math.hypot(fx, fy * 1.0);
    h[y * n + x] = d < 0.42 ? -Math.cos((d / 0.42) * Math.PI * 0.5) : 0;
  }
  return tex(normalFromHeight(h, n, 1.6), { srgb: false });
}
/** 旗子：洞號 */
export function flagTex(num) {
  const c = mk(256), g = c.getContext("2d");
  g.fillStyle = "#e8322f"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff"; g.font = "900 150px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(num), 128, 136);
  const t = tex(c, { repeat: false }); return t;
}
