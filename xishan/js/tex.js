// 程序化貼圖（canvas 繪製，不使用任何外部圖片）
import * as THREE from "three";
import { rng } from "./layout.js";

const cache = new Map();
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function toTex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
function noiseFill(g, w, h, base, amp, seed, size = 2) {
  const r = rng(seed);
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const k = (r() - 0.5) * amp;
    g.fillStyle = `rgba(${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${Math.abs(k)})`;
    g.fillRect(x, y, size, size);
  }
}
/** 由高度圖算法線貼圖 */
function normalFrom(heightCanvas, strength = 2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  const out = canvas(w, h), g = out.getContext("2d"), img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(out, { srgb: false });
}

/** 青灰瓦（筒瓦與板瓦一列一列） */
export function roofTiles() {
  return memo("roof", () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d");
    const hc = canvas(W, H), hg = hc.getContext("2d");
    g.fillStyle = "#59636a"; g.fillRect(0, 0, W, H);
    hg.fillStyle = "#000"; hg.fillRect(0, 0, W, H);
    const cols = 8, cw = W / cols;
    for (let i = 0; i < cols; i++) {
      // 板瓦（凹）
      const x = i * cw;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, "#4a545b"); gr.addColorStop(0.5, "#626c72"); gr.addColorStop(1, "#4a545b");
      g.fillStyle = gr; g.fillRect(x, 0, cw, H);
      // 筒瓦（凸）壓在縫上
      const cx = x + cw;
      const g2 = g.createLinearGradient(cx - cw * 0.28, 0, cx + cw * 0.28, 0);
      g2.addColorStop(0, "#3b4349"); g2.addColorStop(0.45, "#7b858b"); g2.addColorStop(1, "#353c42");
      g.fillStyle = g2; g.fillRect(cx - cw * 0.28, 0, cw * 0.56, H);
      const h2 = hg.createLinearGradient(cx - cw * 0.3, 0, cx + cw * 0.3, 0);
      h2.addColorStop(0, "#000"); h2.addColorStop(0.5, "#fff"); h2.addColorStop(1, "#000");
      hg.fillStyle = h2; hg.fillRect(cx - cw * 0.3, 0, cw * 0.6, H);
    }
    // 每片瓦的接縫
    for (let y = 0; y < H; y += 32) {
      g.fillStyle = "rgba(20,24,28,.35)"; g.fillRect(0, y, W, 2);
      hg.fillStyle = "rgba(0,0,0,.6)"; hg.fillRect(0, y, W, 2);
    }
    noiseFill(g, W, H, 0, 0.08, 3, 2);
    const t = toTex(c);
    t.userData = { normal: normalFrom(hc, 3) };
    return t;
  });
}

/** 木板（船身、橋面） */
export function planks(color = "#8a6440", dark = "#5c3f26", rows = 8, seed = 5) {
  return memo("planks" + color + rows, () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d"), r = rng(seed);
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const rh = H / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * rh;
      g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; g.fillRect(0, y, W, rh);
      // 木紋
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(40,25,10,${0.08 + r() * 0.1})`; g.lineWidth = 1;
        g.beginPath();
        const yy = y + r() * rh;
        g.moveTo(0, yy);
        for (let x = 0; x <= W; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.5);
        g.stroke();
      }
      g.fillStyle = dark; g.fillRect(0, y, W, 2);
      // 釘頭
      for (let x = 20 + r() * 20; x < W; x += 64) { g.fillStyle = "rgba(30,20,10,.6)"; g.fillRect(x, y + rh * 0.45, 3, 3); }
    }
    return toTex(c);
  });
}

/** 青石板路 */
export function flagstone() {
  return memo("flag", () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d"), r = rng(9);
    g.fillStyle = "#7d8582"; g.fillRect(0, 0, W, H);
    let y = 0;
    while (y < H) {
      const rh = 26 + r() * 22;
      let x = -r() * 40;
      while (x < W) {
        const cw = 40 + r() * 50;
        const l = 112 + r() * 30;
        g.fillStyle = `rgb(${l - 8},${l},${l - 2})`;
        g.fillRect(x + 2, y + 2, cw - 3, rh - 3);
        x += cw;
      }
      y += rh;
    }
    noiseFill(g, W, H, 0, 0.1, 4, 2);
    return toTex(c);
  });
}

/** 夯土路 */
export function earth() {
  return memo("earth", () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d"), r = rng(13);
    g.fillStyle = "#c2ad86"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + r() * 60},${70 + r() * 50},${40 + r() * 30},${0.08 + r() * 0.12})`;
      const s = 1 + r() * 4; g.fillRect(r() * W, r() * H, s, s);
    }
    // 車轍
    for (const x of [W * 0.3, W * 0.7]) { g.fillStyle = "rgba(100,80,50,.12)"; g.fillRect(x - 6, 0, 12, H); }
    return toTex(c);
  });
}

/** 石階（踏步線） */
export function steps() {
  return memo("steps", () => {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#8e948f"; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) { g.fillStyle = "#5d625f"; g.fillRect(0, y, W, 5); g.fillStyle = "#a4aaa4"; g.fillRect(0, y + 5, W, 3); }
    noiseFill(g, W, H, 0, 0.12, 6, 2);
    return toTex(c);
  });
}

/** 砌石（岸壁、台基） */
export function masonry(tint = "#8c8f86") {
  return memo("mason" + tint, () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d"), r = rng(21);
    g.fillStyle = "#4b4e49"; g.fillRect(0, 0, W, H);
    const rows = 8, rh = H / rows;
    for (let i = 0; i < rows; i++) {
      let x = (i % 2) * -24 - r() * 10;
      while (x < W) {
        const bw = 34 + r() * 30;
        const base = parseInt(tint.slice(1), 16);
        const k = 0.8 + r() * 0.3;
        g.fillStyle = `rgb(${((base >> 16) & 255) * k | 0},${((base >> 8) & 255) * k | 0},${(base & 255) * k | 0})`;
        g.fillRect(x + 2, i * rh + 2, bw - 3, rh - 3);
        x += bw;
      }
    }
    noiseFill(g, W, H, 0, 0.12, 22, 2);
    return toTex(c);
  });
}

/** 白牆（略帶斑駁） */
export function plaster() {
  return memo("plaster", () => {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#ebe4d4"; g.fillRect(0, 0, W, H);
    noiseFill(g, W, H, 0, 0.06, 31, 3);
    const gr = g.createLinearGradient(0, H * 0.75, 0, H);
    gr.addColorStop(0, "rgba(120,110,90,0)"); gr.addColorStop(1, "rgba(120,110,90,.25)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return toTex(c);
  });
}

/** 窗格（透空） */
export function lattice(kind = 0) {
  return memo("lat" + kind, () => {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext("2d");
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "#5a2f1c"; g.lineCap = "square";
    g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.lineWidth = 3;
    if (kind === 0) {
      for (let i = 1; i < 6; i++) { const p = (i * W) / 6; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
    } else {
      for (let i = -6; i < 12; i++) { const p = (i * W) / 6; g.beginPath(); g.moveTo(p, 0); g.lineTo(p + W, H); g.moveTo(p + W, 0); g.lineTo(p, H); g.stroke(); }
    }
    const t = toTex(c);
    return t;
  });
}

/** 竹篷（編織） */
export function bambooMat() {
  return memo("mat", () => {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#3a3226"; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 16) {
      const off = (y / 8) % 2 ? 8 : 0;
      g.fillStyle = "#5b4d36"; g.fillRect(x + off, y + 1, 14, 6);
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + off + 12, y, 2, 8);
    }
    return toTex(c);
  });
}

/** 布料（棚子、帳篷） */
export function cloth(base = "#b5432f", stripe = "#c9654c") {
  return memo("cloth" + base + stripe, () => {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) { g.fillStyle = stripe; g.fillRect(x, 0, 14, H); }
    noiseFill(g, W, H, 0, 0.08, 41, 2);
    return toTex(c);
  });
}

/** 招牌、旗幟：寫字 */
export function signTex(text, bg = "#2c2118", fg = "#e8d7a8", vertical = true) {
  return memo("sign" + text + bg + fg, () => {
    const W = vertical ? 64 : 256, H = vertical ? 256 : 64, c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${vertical ? 44 : 40}px "Noto Serif TC","Noto Serif CJK TC","Songti TC","PMingLiU",serif`;
    const chars = [...text];
    chars.forEach((ch, i) => {
      if (vertical) g.fillText(ch, W / 2, (H / (chars.length + 1)) * (i + 1));
      else g.fillText(ch, (W / (chars.length + 1)) * (i + 1), H / 2 + 2);
    });
    return toTex(c, { repeat: false });
  });
}

/* ---------- 樹葉（透空貼圖） ---------- */
function leafCanvas(draw, size = 128) { const c = canvas(size, size), g = c.getContext("2d"); g.clearRect(0, 0, size, size); draw(g, size); return c; }
export function leafTex(kind) {
  return memo("leaf" + kind, () => {
    const r = rng(kind.length * 31 + 7);
    const c = leafCanvas((g, S) => {
      if (kind === "willow") {
        // 柳條：細長葉沿著垂直的枝
        g.strokeStyle = "#556b2f"; g.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          const x0 = S * (0.3 + k * 0.2);
          g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + 6, S * 0.5, x0 - 2, S); g.stroke();
          for (let y = 4; y < S; y += 5) {
            const x = x0 + Math.sin(y * 0.05) * 3;
            g.fillStyle = `hsl(${78 + r() * 18},${38 + r() * 20}%,${36 + r() * 16}%)`;
            g.save(); g.translate(x, y); g.rotate((r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5));
            g.beginPath(); g.ellipse(0, 4, 1.6, 6, 0, 0, Math.PI * 2); g.fill(); g.restore();
          }
        }
      } else if (kind === "pine") {
        // 松針簇：一叢一叢放射狀
        for (let k = 0; k < 7; k++) {
          const cx = S * (0.2 + r() * 0.6), cy = S * (0.25 + r() * 0.5);
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2, L = 12 + r() * 14;
            g.strokeStyle = `hsl(${120 + r() * 25},${28 + r() * 15}%,${20 + r() * 12}%)`; g.lineWidth = 1.4;
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.55); g.stroke();
          }
        }
      } else if (kind === "cypress") {
        for (let i = 0; i < 90; i++) {
          const x = S * (0.15 + r() * 0.7), y = S * (0.1 + r() * 0.8);
          g.fillStyle = `hsl(${105 + r() * 25},${25 + r() * 15}%,${18 + r() * 14}%)`;
          g.beginPath(); g.ellipse(x, y, 4 + r() * 4, 2 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === "broad") {
        for (let i = 0; i < 40; i++) {
          const x = S * (0.12 + r() * 0.76), y = S * (0.12 + r() * 0.76);
          g.fillStyle = `hsl(${85 + r() * 35},${30 + r() * 22}%,${22 + r() * 20}%)`;
          g.save(); g.translate(x, y); g.rotate(r() * 6.28);
          g.beginPath(); g.ellipse(0, 0, 6 + r() * 4, 3.4 + r() * 2, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "rgba(0,0,0,.15)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
          g.restore();
        }
      } else if (kind === "blossom") {
        for (let i = 0; i < 36; i++) {
          const x = S * (0.1 + r() * 0.8), y = S * (0.1 + r() * 0.8);
          const pink = r() < 0.75;
          g.fillStyle = pink ? `hsl(${345 + r() * 15},${55 + r() * 25}%,${78 + r() * 10}%)` : "#f5f0e6";
          for (let p = 0; p < 5; p++) { const a = p * 1.2566; g.beginPath(); g.ellipse(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.6, 1.8, a, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = "#c23a52"; g.fillRect(x - 1, y - 1, 2, 2);
        }
        for (let i = 0; i < 8; i++) { g.fillStyle = "hsl(95,40%,35%)"; g.beginPath(); g.ellipse(S * r(), S * r(), 4, 2, r() * 3, 0, Math.PI * 2); g.fill(); }
      } else if (kind === "reed") {
        for (let i = 0; i < 14; i++) {
          const x = S * (0.1 + r() * 0.8);
          g.strokeStyle = `hsl(${60 + r() * 30},${30 + r() * 20}%,${35 + r() * 20}%)`; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + (r() - 0.5) * 20, S * 0.5, x + (r() - 0.5) * 30, S * (0.05 + r() * 0.2)); g.stroke();
        }
      }
    });
    const t = toTex(c, { repeat: false });
    // 不用 mipmap：縮小時透明度不會被平均掉（遠處的樹才不會變成光禿禿）
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    return t;
  });
}

/** 柔和霧團 */
export function mistTex() {
  return memo("mist", () => {
    const S = 256, c = canvas(S, S / 2), g = c.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 4, 4, S / 2, S / 4, S / 2);
    gr.addColorStop(0, "rgba(240,242,236,.85)"); gr.addColorStop(0.5, "rgba(236,239,232,.4)"); gr.addColorStop(1, "rgba(236,239,232,0)");
    g.save(); g.scale(1, 0.5); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.restore();
    return toTex(c, { repeat: false });
  });
}

/** 宣紙底紋（畫面覆蓋用） */
export function paperDataURL() {
  const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(77);
  g.fillStyle = "#f3ead6"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${150 + r() * 60},${130 + r() * 50},${90 + r() * 40},${r() * 0.12})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(160,140,100,${0.05 + r() * 0.06})`; g.beginPath(); const x = r() * S, y = r() * S; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8); g.stroke(); }
  return c.toDataURL();
}
