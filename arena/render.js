// 星域戰陣 — 繪圖：戰場、單位（全部用 canvas 向量手繪）、特效
import { W, H, CELL, COLS, ROWS, P_TOP, E_BOT } from './logic.js';

const TAU = Math.PI * 2;
function poly(c, pts, fill, stroke, lw = 1) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function circ(c, x, y, r, fill, stroke, lw = 1) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function ell(c, x, y, rx, ry, fill, stroke, lw = 1, rot = 0) {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function glow(c, x, y, r, col) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
function metal(c, r, a, b) {
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}

// 每個兵種的造型。座標以半徑 s 為單位，單位面向 +x。t 是動畫時間，k 是攻擊後座力（0~1）
const SHAPES = {
  // ── 鋼鐵聯邦：藍灰裝甲、橘色護目鏡 ──
  trooper(c, s, t, k, mv) {
    const m = metal(c, s, '#7fa6d6', '#2b4a78');
    const sw = mv ? Math.sin(t * 14) * 0.15 : 0;
    c.fillStyle = '#1b2738'; c.fillRect(s * 0.3 - k * s * 0.3, s * 0.18, s * 1.25, s * 0.26);          // 步槍
    c.fillStyle = '#ffd27a'; if (k > 0.5) { c.fillRect(s * 1.5, s * 0.2, s * 0.5, s * 0.22); }
    ell(c, -s * 0.05, -s * 0.72 + sw * s, s * 0.5, s * 0.36, m, '#0e1a2c');                         // 肩甲
    ell(c, -s * 0.05, s * 0.72 - sw * s, s * 0.5, s * 0.36, m, '#0e1a2c');
    circ(c, 0, 0, s * 0.62, m, '#0e1a2c');
    circ(c, s * 0.12, 0, s * 0.36, '#34527e', '#0e1a2c');                                             // 頭盔
    c.fillStyle = '#ffb347'; c.fillRect(s * 0.25, -s * 0.2, s * 0.2, s * 0.4);                        // 護目鏡
  },
  scorcher(c, s, t, k) {
    const m = metal(c, s, '#c96a4a', '#5a2418');
    circ(c, -s * 0.62, -s * 0.34, s * 0.3, '#e04b2a', '#3a0f08'); circ(c, -s * 0.62, s * 0.34, s * 0.3, '#e04b2a', '#3a0f08'); // 燃料罐
    c.fillStyle = '#1e1e24'; c.fillRect(s * 0.2, -s * 0.62, s * 0.95, s * 0.26); c.fillRect(s * 0.2, s * 0.36, s * 0.95, s * 0.26); // 雙噴口
    glow(c, s * 1.25, -s * 0.5, s * 0.5, 'rgba(255,140,40,.9)'); glow(c, s * 1.25, s * 0.5, s * 0.5, 'rgba(255,140,40,.9)');
    ell(c, 0, 0, s * 0.7, s * 0.86, m, '#2a0d08');
    circ(c, s * 0.1, 0, s * 0.38, '#7a3a2a', '#2a0d08');
    c.fillStyle = '#ffe07a'; c.fillRect(s * 0.25, -s * 0.22, s * 0.2, s * 0.44);
  },
  medic(c, s, t) {
    const m = metal(c, s, '#f2f6fa', '#8fa3b8');
    ell(c, -s * 0.05, -s * 0.7, s * 0.45, s * 0.32, m, '#33485c'); ell(c, -s * 0.05, s * 0.7, s * 0.45, s * 0.32, m, '#33485c');
    circ(c, 0, 0, s * 0.62, m, '#33485c');
    c.fillStyle = '#19c37d'; c.fillRect(-s * 0.36, -s * 0.11, s * 0.72, s * 0.22); c.fillRect(-s * 0.11, -s * 0.36, s * 0.22, s * 0.72);
    glow(c, s * 0.85, 0, s * 0.5 + Math.sin(t * 5) * s * 0.1, 'rgba(90,255,170,.8)');
    circ(c, s * 0.85, 0, s * 0.16, '#baffdc');
  },
  sniper(c, s, t, k) {
    c.fillStyle = '#10151c'; c.fillRect(-s * 0.1 - k * s * 0.4, s * 0.12, s * 2.1, s * 0.16);        // 長槍
    c.fillRect(s * 0.6 - k * s * 0.4, s * 0.02, s * 0.4, s * 0.12);
    poly(c, [-s * 0.9, -s * 0.6, s * 0.1, -s * 0.66, s * 0.5, 0, s * 0.1, s * 0.66, -s * 0.9, s * 0.6, -s * 0.6, 0], 'rgba(60,80,100,.85)', '#0c1118'); // 披風
    circ(c, 0, 0, s * 0.42, '#27384a', '#0c1118');
    circ(c, s * 0.2, 0, s * 0.13, '#5cff9a'); glow(c, s * 0.2, 0, s * 0.4, 'rgba(90,255,150,.6)');
  },
  tank(c, s, t, k, mv) {
    const m = metal(c, s, '#6f8fb8', '#263a57');
    c.fillStyle = '#12181f'; c.fillRect(-s * 0.95, -s * 0.9, s * 1.9, s * 0.36); c.fillRect(-s * 0.95, s * 0.54, s * 1.9, s * 0.36); // 履帶
    c.strokeStyle = '#3a4756'; c.lineWidth = 1;
    const off = mv ? (t * 30) % (s * 0.3) : 0;
    for (let x = -s * 0.9 + off; x < s * 0.9; x += s * 0.3) { c.beginPath(); c.moveTo(x, -s * 0.9); c.lineTo(x, -s * 0.54); c.moveTo(x, s * 0.54); c.lineTo(x, s * 0.9); c.stroke(); }
    poly(c, [-s * 0.85, -s * 0.58, s * 0.6, -s * 0.58, s * 0.9, -s * 0.3, s * 0.9, s * 0.3, s * 0.6, s * 0.58, -s * 0.85, s * 0.58], m, '#0e1a2c');
    c.fillStyle = '#1b2738'; c.fillRect(s * 0.1 - k * s * 0.35, -s * 0.12, s * 1.5, s * 0.24);        // 砲管
    c.fillStyle = '#0e1a2c'; c.fillRect(s * 1.45 - k * s * 0.35, -s * 0.17, s * 0.2, s * 0.34);
    circ(c, -s * 0.05, 0, s * 0.42, '#4d6c96', '#0e1a2c');
    c.fillStyle = '#ffb347'; c.fillRect(-s * 0.2, -s * 0.06, s * 0.3, s * 0.12);
  },
  dread(c, s, t, k) {
    const m = metal(c, s, '#8eaad0', '#22344f');
    glow(c, -s * 1.0, -s * 0.4, s * 0.5, 'rgba(90,190,255,.9)'); glow(c, -s * 1.0, s * 0.4, s * 0.5, 'rgba(90,190,255,.9)'); // 引擎
    poly(c, [s * 1.15, 0, s * 0.5, -s * 0.34, s * 0.1, -s * 0.8, -s * 0.7, -s * 0.8, -s * 0.95, -s * 0.5, -s * 0.8, 0, -s * 0.95, s * 0.5, -s * 0.7, s * 0.8, s * 0.1, s * 0.8, s * 0.5, s * 0.34], m, '#0b1626', 1.5);
    poly(c, [s * 0.85, 0, s * 0.3, -s * 0.2, -s * 0.5, -s * 0.24, -s * 0.5, s * 0.24, s * 0.3, s * 0.2], '#2f4a70', '#0b1626');
    c.fillStyle = '#152233'; c.fillRect(-s * 0.2, -s * 0.72, s * 0.5, s * 0.14); c.fillRect(-s * 0.2, s * 0.58, s * 0.5, s * 0.14); // 砲塔
    circ(c, -s * 0.1, 0, s * 0.16, '#ffb347'); glow(c, s * 1.05, 0, s * (0.25 + k * 0.5), 'rgba(255,200,120,.8)');
    c.strokeStyle = 'rgba(160,210,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-s * 0.6, -s * 0.5); c.lineTo(s * 0.2, -s * 0.5); c.moveTo(-s * 0.6, s * 0.5); c.lineTo(s * 0.2, s * 0.5); c.stroke();
  },
  // ── 晶耀聖族：金色甲冑、青色能量 ──
  blade(c, s, t, k) {
    const m = metal(c, s, '#ffe89a', '#a8782a');
    const a = 0.5 - k * 2.2;
    for (const sg of [-1, 1]) {                                                                        // 雙光刃
      c.save(); c.translate(s * 0.3, sg * s * 0.62); c.rotate(-sg * a);
      glow(c, s * 0.7, 0, s * 0.6, 'rgba(90,240,255,.5)');
      poly(c, [0, -s * 0.11, s * 1.3, 0, 0, s * 0.11], '#c8fbff', '#3fd8ff');
      c.restore();
    }
    ell(c, -s * 0.1, -s * 0.66, s * 0.42, s * 0.28, m, '#5a3c0c'); ell(c, -s * 0.1, s * 0.66, s * 0.42, s * 0.28, m, '#5a3c0c');
    poly(c, [s * 0.7, 0, s * 0.1, -s * 0.52, -s * 0.7, -s * 0.36, -s * 0.5, 0, -s * 0.7, s * 0.36, s * 0.1, s * 0.52], m, '#5a3c0c');
    poly(c, [s * 0.5, 0, s * 0.05, -s * 0.2, -s * 0.2, 0, s * 0.05, s * 0.2], '#3a2a5a', '#5a3c0c');
    circ(c, s * 0.22, 0, s * 0.08, '#7ff6ff');
  },
  stalker(c, s, t, k, mv) {
    c.strokeStyle = '#1a2233'; c.lineWidth = s * 0.14; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {                                                                      // 四足
      const sx = i < 2 ? 0.35 : -0.35, sy = i % 2 ? 1 : -1, w = mv ? Math.sin(t * 12 + i * 1.6) * 0.25 : 0;
      c.beginPath(); c.moveTo(s * sx * 0.6, sy * s * 0.3); c.lineTo(s * (sx * 1.4 + w), sy * s * 0.75); c.lineTo(s * (sx * 2.2 + w), sy * s * 1.0); c.stroke();
    }
    poly(c, [s * 0.9, 0, s * 0.3, -s * 0.5, -s * 0.7, -s * 0.4, -s * 0.9, 0, -s * 0.7, s * 0.4, s * 0.3, s * 0.5], metal(c, s, '#3b4a6e', '#11182a'), '#070b14');
    poly(c, [s * 0.55, 0, s * 0.1, -s * 0.24, -s * 0.4, 0, s * 0.1, s * 0.24], '#d9b45a', '#5a3c0c');
    glow(c, s * 0.75, 0, s * (0.4 + k), 'rgba(90,220,255,.8)'); circ(c, s * 0.75, 0, s * 0.12, '#d6fbff');
  },
  sentinel(c, s, t, k) {
    const b = Math.sin(t * 3) * s * 0.06;
    c.save(); c.rotate(t * 0.8);
    for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); poly(c, [s * 0.95 + b, 0, s * 0.55, -s * 0.22, s * 0.55, s * 0.22], '#ffe89a', '#7a5a1a'); }
    c.restore();
    poly(c, [s * 0.7, 0, 0, -s * 0.55, -s * 0.7, 0, 0, s * 0.55], metal(c, s, '#ffe89a', '#a8782a'), '#5a3c0c');
    glow(c, 0, 0, s * (0.7 + k * 1.5), 'rgba(90,240,255,.7)'); circ(c, 0, 0, s * 0.24, '#d6fbff', '#3fd8ff');
  },
  psion(c, s, t, k) {
    poly(c, [-s * 1.0, -s * 0.55, s * 0.2, -s * 0.6, s * 0.55, 0, s * 0.2, s * 0.6, -s * 1.0, s * 0.55, -s * 0.7, 0], '#4a2f7a', '#1c0f33');   // 長袍
    poly(c, [-s * 0.9, -s * 0.3, s * 0.0, -s * 0.34, s * 0.0, s * 0.34, -s * 0.9, s * 0.3], '#6b46a8');
    circ(c, s * 0.1, 0, s * 0.36, metal(c, s, '#ffe89a', '#a8782a'), '#5a3c0c');
    for (let i = 0; i < 3; i++) {                                                                      // 環繞的靈能球
      const a = t * 2.4 + i * TAU / 3, x = s * 0.1 + Math.cos(a) * s * 0.85, y = Math.sin(a) * s * 0.85;
      glow(c, x, y, s * 0.36, 'rgba(160,120,255,.9)'); circ(c, x, y, s * 0.09, '#efe4ff');
    }
    circ(c, s * 0.22, 0, s * 0.1, '#b89cff');
  },
  strider(c, s, t, k, mv) {
    c.strokeStyle = '#8a6a2a'; c.lineWidth = s * 0.11; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {                                                                      // 長腿
      const sx = i < 2 ? 1 : -1, sy = i % 2 ? 1 : -1, w = mv ? Math.sin(t * 6 + i * 1.7) * 0.18 : 0;
      c.beginPath(); c.moveTo(sx * s * 0.2, sy * s * 0.2); c.lineTo(s * (sx * 0.55 + w), sy * s * 0.75); c.lineTo(s * (sx * 0.95 + w), sy * s * 0.95); c.stroke();
      circ(c, s * (sx * 0.95 + w), sy * s * 0.95, s * 0.09, '#ffe89a');
    }
    poly(c, [s * 0.75, 0, s * 0.3, -s * 0.36, -s * 0.5, -s * 0.3, -s * 0.7, 0, -s * 0.5, s * 0.3, s * 0.3, s * 0.36], metal(c, s, '#fff0b0', '#b0842e'), '#5a3c0c', 1.4);
    poly(c, [s * 0.5, 0, s * 0.1, -s * 0.16, -s * 0.3, 0, s * 0.1, s * 0.16], '#2a3a6a');
    for (const sg of [-1, 1]) { glow(c, s * 0.62, sg * s * 0.22, s * (0.22 + k * 0.6), 'rgba(255,120,60,.9)'); circ(c, s * 0.62, sg * s * 0.22, s * 0.06, '#fff'); }
  },
  ark(c, s, t, k) {
    glow(c, 0, 0, s * 1.3, 'rgba(90,220,255,.25)');
    c.save(); c.rotate(t * 0.4);
    c.strokeStyle = '#d9b45a'; c.lineWidth = s * 0.2; c.beginPath(); c.arc(0, 0, s * 0.85, 0, TAU); c.stroke();
    c.strokeStyle = '#5a3c0c'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, s * 0.95, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.75, 0, TAU); c.stroke();
    for (let i = 0; i < 6; i++) { c.rotate(TAU / 6); c.fillStyle = '#7ff6ff'; c.fillRect(s * 0.8, -s * 0.05, s * 0.12, s * 0.1); c.fillStyle = '#a8782a'; c.fillRect(s * 0.4, -s * 0.04, s * 0.38, s * 0.08); }
    c.restore();
    poly(c, [s * 0.5, 0, 0, -s * 0.42, -s * 0.5, 0, 0, s * 0.42], metal(c, s, '#fff0b0', '#b0842e'), '#5a3c0c', 1.4);
    glow(c, 0, 0, s * (0.5 + k * 1.2), 'rgba(120,240,255,.9)'); circ(c, 0, 0, s * 0.18, '#eaffff');
  },
  // ── 蟲巢群落：紫色甲殼、骨刃、酸液 ──
  clawling(c, s, t, k, mv) {
    c.strokeStyle = '#3a1a4a'; c.lineWidth = s * 0.14; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const sy = i % 2 ? 1 : -1, x = i < 2 ? -0.1 : -0.6, w = mv ? Math.sin(t * 26 + i * 2) * 0.3 : 0; c.beginPath(); c.moveTo(s * x, sy * s * 0.3); c.lineTo(s * (x - 0.2 + w), sy * s * 1.0); c.stroke(); }
    ell(c, -s * 0.2, 0, s * 0.85, s * 0.5, metal(c, s, '#a060c8', '#4a2068'), '#22092e');
    circ(c, s * 0.55, 0, s * 0.36, '#7a3f9a', '#22092e');
    for (const sg of [-1, 1]) { c.save(); c.translate(s * 0.5, sg * s * 0.3); c.rotate(sg * (0.5 - k * 3)); poly(c, [0, -s * 0.1, s * 1.0, sg * -s * 0.25, 0, s * 0.1], '#f0e2c0', '#6a5a3a'); c.restore(); } // 鐮刀爪
    circ(c, s * 0.7, -s * 0.14, s * 0.07, '#ff9a2a'); circ(c, s * 0.7, s * 0.14, s * 0.07, '#ff9a2a');
  },
  burster(c, s, t, k, mv) {
    c.strokeStyle = '#3a1a4a'; c.lineWidth = s * 0.14; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const sy = i % 2 ? 1 : -1, x = i < 2 ? 0.3 : -0.3, w = mv ? Math.sin(t * 22 + i * 2) * 0.25 : 0; c.beginPath(); c.moveTo(s * x, sy * s * 0.4); c.lineTo(s * (x + w), sy * s * 1.05); c.stroke(); }
    const p = 1 + Math.sin(t * 9) * 0.07;
    glow(c, 0, 0, s * 1.5, 'rgba(160,255,60,.45)');
    circ(c, 0, 0, s * 0.82 * p, '#8fe83a', '#2f5a10', 1.2);                                           // 酸液囊
    circ(c, -s * 0.2, -s * 0.22, s * 0.3, 'rgba(230,255,160,.7)');
    ell(c, s * 0.6, 0, s * 0.3, s * 0.36, '#6a3a8a', '#22092e');
  },
  spitter(c, s, t, k, mv) {
    c.strokeStyle = '#3a1a2a'; c.lineWidth = s * 0.16; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const sy = i % 2 ? 1 : -1, x = -0.6 + Math.floor(i / 2) * 0.5, w = mv ? Math.sin(t * 14 + i * 1.3) * 0.2 : 0; c.beginPath(); c.moveTo(s * x, sy * s * 0.5); c.lineTo(s * (x + w), sy * s * 1.02); c.stroke(); }
    const m = metal(c, s, '#b8604a', '#4a1c22');
    for (let i = 0; i < 3; i++) ell(c, -s * 0.6 + i * s * 0.42, 0, s * 0.42, s * (0.62 + i * 0.07), m, '#2a0c12');   // 甲殼節
    ell(c, s * 0.62, 0, s * 0.36, s * 0.46, '#8a3a3a', '#2a0c12');
    glow(c, s * 0.95, 0, s * (0.3 + k), 'rgba(160,255,60,.8)'); circ(c, s * 0.9, 0, s * 0.12, '#c8ff6a');
    c.fillStyle = '#f0e2c0'; c.fillRect(s * 0.8, -s * 0.4, s * 0.3, s * 0.08); c.fillRect(s * 0.8, s * 0.32, s * 0.3, s * 0.08);
  },
  spiner(c, s, t, k) {
    c.strokeStyle = '#6a2f8a'; c.lineWidth = s * 0.46; c.lineCap = 'round';                            // 蛇尾
    c.beginPath(); c.moveTo(-s * 0.2, 0);
    c.quadraticCurveTo(-s * 0.7, Math.sin(t * 4) * s * 0.5, -s * 1.25, Math.sin(t * 4 + 1) * s * 0.3); c.stroke();
    poly(c, [s * 0.5, 0, s * 0.0, -s * 0.9, -s * 0.5, -s * 0.5, -s * 0.3, 0, -s * 0.5, s * 0.5, s * 0.0, s * 0.9], metal(c, s, '#b070d8', '#4a2068'), '#22092e'); // 頸盾
    c.strokeStyle = '#f0e2c0'; c.lineWidth = 1.2;
    for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-s * 0.1 - i * s * 0.12, sg * s * (0.5 + i * 0.1)); c.lineTo(-s * 0.4 - i * s * 0.14, sg * s * (0.95 + i * 0.05)); c.stroke(); }
    ell(c, s * 0.4 - k * s * 0.3, 0, s * 0.42, s * 0.3, '#8a4aaa', '#22092e');
    circ(c, s * 0.55, -s * 0.13, s * 0.07, '#ff5a2a'); circ(c, s * 0.55, s * 0.13, s * 0.07, '#ff5a2a');
  },
  mother(c, s, t, k) {
    c.strokeStyle = '#5a2a6a'; c.lineWidth = s * 0.12; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const a = Math.PI * 0.55 + i * Math.PI * 0.18, w = Math.sin(t * 3 + i) * 0.2; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); c.quadraticCurveTo(Math.cos(a + w) * s * 1.0, Math.sin(a + w) * s * 1.0, Math.cos(a + w * 2) * s * 1.25, Math.sin(a + w * 2) * s * 1.25); c.stroke(); }
    const p = 1 + Math.sin(t * 2.5) * 0.04;
    ell(c, -s * 0.1, 0, s * 0.85 * p, s * 0.75 * p, metal(c, s, '#9a5ab8', '#3a1850'), '#1c0826', 1.4);
    for (const [x, y, r] of [[-0.4, -0.3, 0.24], [-0.45, 0.25, 0.2], [0, 0.4, 0.18], [0.05, -0.42, 0.16], [-0.15, 0, 0.2]]) { glow(c, s * x, s * y, s * r * 2, 'rgba(255,150,40,.6)'); circ(c, s * x, s * y, s * r, '#ffb040', '#7a3a10'); } // 卵囊
    ell(c, s * 0.7, 0, s * 0.32, s * 0.4, '#7a3f9a', '#1c0826');
    circ(c, s * 0.85, 0, s * (0.1 + k * 0.2), '#c8ff6a');
  },
  behemoth(c, s, t, k, mv) {
    c.strokeStyle = '#2a1030'; c.lineWidth = s * 0.2; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const sy = i % 2 ? 1 : -1, x = i < 2 ? 0.2 : -0.5, w = mv ? Math.sin(t * 9 + i * 1.6) * 0.15 : 0; c.beginPath(); c.moveTo(s * x, sy * s * 0.5); c.lineTo(s * (x + w), sy * s * 0.98); c.stroke(); }
    const m = metal(c, s, '#8a5aa0', '#2c1238');
    ell(c, -s * 0.25, 0, s * 0.8, s * 0.74, m, '#12051a', 1.5);
    for (let i = 0; i < 4; i++) { c.strokeStyle = 'rgba(20,5,30,.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(-s * 0.9 + i * s * 0.3, 0, s * 0.7, -0.9, 0.9); c.stroke(); } // 甲殼紋
    for (const sg of [-1, 1]) for (const [ox, len, ang] of [[0.3, 1.15, 0.75], [0.0, 0.9, 1.25]]) {    // 四把骨刃
      c.save(); c.translate(s * ox, sg * s * 0.4); c.rotate(sg * (ang - k * 4));
      poly(c, [0, -s * 0.13, s * len * 0.6, -s * 0.2, s * len, 0, s * len * 0.5, s * 0.08, 0, s * 0.13], '#f4e8c8', '#6a5a3a');
      c.restore();
    }
    ell(c, s * 0.5, 0, s * 0.38, s * 0.42, '#6a3a80', '#12051a', 1.2);
    circ(c, s * 0.68, -s * 0.16, s * 0.06, '#ff5a2a'); circ(c, s * 0.68, s * 0.16, s * 0.06, '#ff5a2a');
  },
  broodling(c, s, t, k, mv) {
    c.strokeStyle = '#3a1a4a'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { const sy = i % 2 ? 1 : -1; c.beginPath(); c.moveTo(i < 2 ? s * 0.3 : -s * 0.3, 0); c.lineTo((i < 2 ? s * 0.5 : -s * 0.5) + Math.sin(t * 28 + i) * s * 0.3, sy * s * 1.1); c.stroke(); }
    ell(c, 0, 0, s * 0.9, s * 0.55, '#c070e0', '#22092e'); circ(c, s * 0.6, 0, s * 0.2, '#ffb040');
  },
};

export function drawShape(c, type, s, t = 0, k = 0, mv = false) { (SHAPES[type] || SHAPES.trooper)(c, s, t, k, mv); }

const TEAM_RING = ['#39ff7a', '#ff3b3b'];
export function drawUnit(c, u, t, showBar = true) {
  const s = u.r, air = u.type === 'dread' || u.type === 'ark' || u.type === 'sentinel';
  c.save();
  c.translate(u.x, u.y);
  // 影子 + 隊伍圈（像選取圈）
  ell(c, air ? 4 : 1, air ? 9 : 2, s * 1.05, s * 0.8, `rgba(0,0,0,${air ? 0.28 : 0.4})`);
  c.globalAlpha = 0.85; ell(c, 0, 0, s * 1.22, s * 1.0, null, TEAM_RING[u.team], u.boss ? 2.4 : 1.3); c.globalAlpha = 1;
  if (u.boss) { c.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2; ell(c, 0, 0, s * 1.4, s * 1.16, null, '#ffb020', 1.5); c.globalAlpha = 1; }
  if (u.stimT > 0) glow(c, 0, 0, s * 2, 'rgba(255,60,40,.45)');
  if (u.frenzyT > 0) glow(c, 0, 0, s * 2, 'rgba(255,160,40,.45)');
  if (u.regenT > 0) glow(c, 0, 0, s * 2, 'rgba(90,255,120,.4)');
  c.save();
  if (air) c.translate(0, Math.sin(t * 2 + u.id) * 1.5 - 3);
  c.rotate(u.face);
  drawShape(c, u.type, s, t + u.id * 0.7, Math.max(0, u.atkAnim / 0.15), u.moving);
  c.restore();
  if (u.flash > 0) { c.globalCompositeOperation = 'lighter'; circ(c, 0, 0, s, `rgba(255,255,255,${u.flash * 3})`); c.globalCompositeOperation = 'source-over'; }
  if (u.maxSh > 0 && u.sh > 0 && u.lastHit !== undefined && t - u.shT < 0.3) { /* 預留 */ }
  if (u.sh > 0 && u.flash > 0) { c.strokeStyle = `rgba(120,230,255,${u.flash * 6})`; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s * 1.25, 0, TAU); c.stroke(); }
  if (u.guardT > 0) { c.strokeStyle = 'rgba(127,246,255,.55)'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); c.arc(0, 0, s * 1.4, t * 2, t * 2 + TAU); c.stroke(); c.setLineDash([]); }
  if (u.bar > 0) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, s * 1.3, 0, TAU); c.stroke(); }
  if (u.stunT > 0) { c.fillStyle = '#ffe14a'; for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; c.fillRect(Math.cos(a) * s * 0.7 - 1.5, -s - 6 + Math.sin(a) * 2, 3, 3); } }
  if (u.slowT > 0) glow(c, 0, 0, s * 1.6, 'rgba(160,120,255,.35)');
  // 星級
  if (u.star > 1) { c.fillStyle = u.star === 3 ? '#ffd23a' : '#cfe6ff'; c.font = `900 ${u.star === 3 ? 10 : 9}px sans-serif`; c.textAlign = 'center'; c.fillText('★'.repeat(u.star), 0, s + 11); }
  // 血條 / 護盾條
  if (showBar && u.maxHp) {
    const w = Math.max(16, s * 2.1), y = -s - (u.maxSh ? 11 : 8), seg = u.boss ? 4 : 3;
    c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(-w / 2 - 1, y - 1, w + 2, (u.maxSh ? seg * 2 + 1 : seg) + 2);
    if (u.maxSh) { c.fillStyle = '#4ad8ff'; c.fillRect(-w / 2, y, w * Math.max(0, u.sh / u.maxSh), seg); }
    const hy = u.maxSh ? y + seg + 1 : y, f = Math.max(0, u.hp / u.maxHp);
    c.fillStyle = u.team === 1 ? '#ff4b3b' : f > 0.5 ? '#3bff6a' : f > 0.25 ? '#ffd23a' : '#ff7a3b';
    c.fillRect(-w / 2, hy, w * f, seg);
    if (u.bar > 0) { c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-w / 2, hy - 1, w * Math.min(1, u.bar / u.maxHp), 1.5); }
  }
  c.restore();
}

// ── 戰場背景（預先畫到離屏畫布）──
export function makeBackground(stage) {
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext('2d'); c.scale(2, 2);
  let sd = stage * 977 + 5; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const themes = [
    ['#141c26', '#1c2836', '#3a5068', '90,190,255'],   // 太空平台
    ['#1e1814', '#2c221a', '#6a4a30', '255,150,60'],   // 熔岩荒原
    ['#161a22', '#1e2a2e', '#3a6a5a', '90,255,190'],   // 叢林前哨
    ['#1c1424', '#281c34', '#5a3a78', '200,110,255'],  // 蟲巢菌毯
    ['#12181c', '#1a242c', '#52606e', '220,230,255'],  // 冰封基地
  ];
  const th = themes[Math.floor((stage - 1) / 10) % themes.length];
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th[0]); g.addColorStop(0.5, th[1]); g.addColorStop(1, th[0]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 金屬地板分割線
  for (let y = 0; y < H; y += 40) for (let x = (y / 40) % 2 ? 0 : -40; x < W; x += 80) {
    c.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.03})`; c.fillRect(x + 1, y + 1, 78, 38);
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 80, 40);
    if (rnd() < 0.18) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 8, y + 8, 14, 5); }
    if (rnd() < 0.12) { c.fillStyle = `rgba(${th[3]},.25)`; c.fillRect(x + 60, y + 30, 10, 3); }
  }
  // 彈坑、污漬
  for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 26; const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(0,0,0,.4)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  // 中央能量帶
  const mid = (P_TOP + E_BOT) / 2;
  const mg = c.createLinearGradient(0, mid - 70, 0, mid + 70); mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(0.5, `rgba(${th[3]},.10)`); mg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = mg; c.fillRect(0, mid - 70, W, 140);
  c.strokeStyle = `rgba(${th[3]},.35)`; c.lineWidth = 1; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(0, mid); c.lineTo(W, mid); c.stroke(); c.setLineDash([]);
  // 部署線警示條
  for (const y of [P_TOP - 6, E_BOT]) {
    c.save(); c.beginPath(); c.rect(0, y, W, 6); c.clip();
    c.fillStyle = '#18181a'; c.fillRect(0, y, W, 6); c.fillStyle = y > mid ? '#e8b020' : '#c8402a';
    for (let x = -10; x < W; x += 16) poly(c, [x, y + 6, x + 6, y, x + 12, y, x + 6, y + 6], c.fillStyle);
    c.restore();
  }
  // 邊緣暗角
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  return cv;
}

export function drawGrid(c, t, occupied, hover, canPlace) {
  c.save();
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    const x = col * CELL, y = P_TOP + r * CELL, occ = occupied.has(col + ',' + r), hv = hover && hover[0] === col && hover[1] === r;
    c.fillStyle = hv ? (canPlace ? 'rgba(60,255,140,.28)' : 'rgba(255,70,60,.28)') : occ ? 'rgba(77,163,255,.10)' : 'rgba(77,163,255,.04)';
    c.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    c.strokeStyle = hv ? '#9dffc4' : 'rgba(110,190,255,.35)'; c.lineWidth = 1;
    const k = 9; c.beginPath();
    c.moveTo(x + 3, y + 3 + k); c.lineTo(x + 3, y + 3); c.lineTo(x + 3 + k, y + 3);
    c.moveTo(x + CELL - 3 - k, y + 3); c.lineTo(x + CELL - 3, y + 3); c.lineTo(x + CELL - 3, y + 3 + k);
    c.moveTo(x + CELL - 3, y + CELL - 3 - k); c.lineTo(x + CELL - 3, y + CELL - 3); c.lineTo(x + CELL - 3 - k, y + CELL - 3);
    c.moveTo(x + 3 + k, y + CELL - 3); c.lineTo(x + 3, y + CELL - 3); c.lineTo(x + 3, y + CELL - 3 - k);
    c.stroke();
  }
  // 前進方向箭頭
  c.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15; c.fillStyle = '#7fd0ff';
  for (let i = 0; i < 5; i++) { const x = 48 + i * 96, y = P_TOP - 26 - ((t * 20) % 14); poly(c, [x, y - 8, x + 9, y + 4, x + 3, y + 4, x + 3, y + 12, x - 3, y + 12, x - 3, y + 4, x - 9, y + 4], c.fillStyle); }
  c.restore();
}

// ── 特效 ──
export class FX {
  constructor() { this.p = []; this.decals = []; this.shake = 0; }
  clear() { this.p.length = 0; this.decals.length = 0; this.shake = 0; }
  add(o) { o.t = 0; this.p.push(o); }
  sparks(x, y, n, col, sp = 80, life = 0.4) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random()); this.add({ k: 'sp', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random()), col }); } }
  feed(evs) {
    for (const e of evs) {
      if (e.k === 'shot') {
        const a = e.a, L = { k: 'ln', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 };
        const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), mx = e.x1 + Math.cos(ang) * (e.r || 8), my = e.y1 + Math.sin(ang) * (e.r || 8);
        if (a === 'bullet') { this.add({ ...L, x1: mx, y1: my, x2: e.x2 + (Math.random() - 0.5) * 6, y2: e.y2 + (Math.random() - 0.5) * 6, life: 0.07, col: '#ffe9a0', w: 1.2 }); this.sparks(e.x2, e.y2, 1, '#ffd27a', 50, 0.2); }
        else if (a === 'snipe') { this.add({ ...L, life: 0.18, col: '#baffd0', w: 1.6 }); this.sparks(e.x2, e.y2, 3, '#baffd0'); }
        else if (a === 'snipeX') { this.add({ ...L, life: 0.45, col: '#ff4040', w: 3, glow: true }); this.sparks(e.x2, e.y2, 10, '#ff8080', 120); }
        else if (a === 'nova') { this.add({ ...L, life: 0.5, col: '#ffcf6a', w: 7, glow: true }); this.shake = 8; }
        else if (a === 'beam') { this.add({ ...L, x1: mx, y1: my, life: 0.16, col: '#7ff6ff', w: 2.2, glow: true }); this.sparks(e.x2, e.y2, 2, '#bffcff', 40, 0.2); }
        else if (a === 'sweep') { this.add({ k: 'sweep', x1: mx, y1: my, x2: e.x2, y2: e.y2, life: 0.32 }); }
        else if (a === 'heal') { this.add({ ...L, life: 0.14, col: '#6dffb0', w: 2, glow: true }); if (Math.random() < 0.4) this.add({ k: 'plus', x: e.x2, y: e.y2, life: 0.6 }); }
        else if (a === 'flame') { for (let i = 0; i < 6; i++) { const aa = ang + (Math.random() - 0.5) * 0.7, v = 120 + Math.random() * 90; this.add({ k: 'fl', x: mx, y: my, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, life: 0.25 + Math.random() * 0.2 }); } }
        else if (a === 'melee' || a === 'cleave') { this.add({ k: 'slash', x: e.x2, y: e.y2, ang, life: 0.16, r: a === 'cleave' ? 30 : 11, col: e.team === 0 ? '#eaffff' : '#ffe0d0' }); }
        else { // 飛行彈：bolt / acid / spine / shell / spawn
          const col = { bolt: '#7fd8ff', acid: '#a8ff4a', spine: '#f0e2c0', shell: '#ffb347', spawn: '#c8ff6a' }[a] || '#fff';
          this.add({ k: 'pr', x1: mx, y1: my, x2: e.x2, y2: e.y2, life: a === 'shell' ? 0.22 : 0.13, col, a });
        }
      } else if (e.k === 'boom') {
        const col = { fire: ['#fff2b0', '#ff8a2a', '#c8301a'], acid: ['#f0ffb0', '#8fe83a', '#3a7a10'], nova: ['#ffffff', '#ffcf6a', '#ff7a2a'] }[e.c];
        this.add({ k: 'boom', x: e.x, y: e.y, r: e.r, life: e.big ? 0.55 : 0.4, col });
        this.sparks(e.x, e.y, e.big ? 18 : 8, col[1], 140, 0.5);
        if (e.r > 30) this.decal(e.x, e.y, e.r * 0.6, e.c === 'acid' ? 'rgba(90,160,30,.28)' : 'rgba(0,0,0,.4)');
        this.shake = Math.max(this.shake, e.big ? 7 : e.r > 40 ? 3 : 0);
      } else if (e.k === 'ring') { this.add({ k: 'ring', x: e.x, y: e.y, r: e.r, life: 0.5, col: e.c }); if (e.shake) this.shake = 6; }
      else if (e.k === 'txt') this.add({ k: 'txt', x: e.x, y: e.y, s: e.s, life: 1.0, col: e.team === 0 ? '#9dffc4' : '#ff9d8a' });
      else if (e.k === 'blink') { this.add({ k: 'ring', x: e.x, y: e.y, r: 18, life: 0.3, col: '#7fd8ff' }); this.sparks(e.x, e.y, 6, '#bfeaff', 70); }
      else if (e.k === 'die') {
        const bio = e.fac === 'brood';
        this.sparks(e.x, e.y, e.big ? 22 : 7, bio ? '#b04ad8' : e.fac === 'lum' ? '#7ff6ff' : '#ffb347', e.big ? 150 : 90, 0.5);
        if (!bio) this.add({ k: 'boom', x: e.x, y: e.y, r: e.r * 1.6, life: 0.35, col: e.fac === 'lum' ? ['#fff', '#7ff6ff', '#2a7aff'] : ['#fff2b0', '#ff8a2a', '#c8301a'] });
        this.decal(e.x, e.y, e.r * 1.3, bio ? 'rgba(120,40,150,.35)' : e.fac === 'lum' ? 'rgba(60,160,220,.2)' : 'rgba(0,0,0,.45)');
        if (e.big) this.shake = Math.max(this.shake, 6);
      }
    }
  }
  decal(x, y, r, col) { if (this.decals.length > 120) this.decals.shift(); this.decals.push({ x, y, r, col, rot: Math.random() * TAU }); }
  drawDecals(c) { for (const d of this.decals) { c.save(); c.translate(d.x, d.y); c.rotate(d.rot); ell(c, 0, 0, d.r, d.r * 0.7, d.col); ell(c, d.r * 0.5, d.r * 0.3, d.r * 0.4, d.r * 0.3, d.col); c.restore(); } }
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const p of this.p) { p.t += dt; if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; } }
    this.p = this.p.filter((p) => p.t < p.life);
  }
  draw(c) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (const p of this.p) {
      const f = p.t / p.life, a = 1 - f;
      if (p.k === 'ln') {
        if (p.glow) { c.strokeStyle = p.col; c.globalAlpha = a * 0.35; c.lineWidth = p.w * 3.5; c.beginPath(); c.moveTo(p.x1, p.y1); c.lineTo(p.x2, p.y2); c.stroke(); }
        c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = p.w; c.beginPath(); c.moveTo(p.x1, p.y1); c.lineTo(p.x2, p.y2); c.stroke();
      } else if (p.k === 'sweep') {
        const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1), px = -Math.sin(ang), py = Math.cos(ang), o = (f * 2 - 1) * 75;
        for (const sg of [-1, 1]) { const ex = p.x2 + px * o * sg, ey = p.y2 + py * o * sg; c.globalAlpha = 0.3; c.strokeStyle = '#ff7a3a'; c.lineWidth = 7; c.beginPath(); c.moveTo(p.x1, p.y1); c.lineTo(ex, ey); c.stroke(); c.globalAlpha = 1; c.strokeStyle = '#ffe6c0'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(p.x1, p.y1); c.lineTo(ex, ey); c.stroke(); glow(c, ex, ey, 12, 'rgba(255,150,60,.9)'); }
      } else if (p.k === 'pr') {
        const x = p.x1 + (p.x2 - p.x1) * f, y = p.y1 + (p.y2 - p.y1) * f - (p.a === 'shell' ? Math.sin(f * Math.PI) * 18 : 0);
        c.globalAlpha = 1; glow(c, x, y, p.a === 'shell' ? 9 : 7, p.col); circ(c, x, y, p.a === 'shell' ? 2.6 : 1.8, '#fff');
        c.strokeStyle = p.col; c.globalAlpha = 0.6; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - (p.x2 - p.x1) * 0.12, y - (p.y2 - p.y1) * 0.12); c.stroke();
      } else if (p.k === 'sp') { c.globalAlpha = a; c.fillStyle = p.col; c.fillRect(p.x - 1, p.y - 1, 2, 2); }
      else if (p.k === 'fl') { c.globalAlpha = a * 0.8; glow(c, p.x, p.y, 5 + f * 9, f < 0.4 ? 'rgba(255,230,140,1)' : 'rgba(255,110,30,1)'); }
      else if (p.k === 'boom') {
        const r = p.r * (0.3 + 0.7 * Math.sqrt(f));
        c.globalAlpha = a; const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, p.col[0]); g.addColorStop(0.45, p.col[1]); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        c.strokeStyle = p.col[1]; c.lineWidth = 2 * a; c.beginPath(); c.arc(p.x, p.y, p.r * Math.sqrt(f), 0, TAU); c.stroke();
      } else if (p.k === 'ring') { c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = 3 * a + 0.5; c.beginPath(); c.arc(p.x, p.y, p.r * Math.sqrt(f), 0, TAU); c.stroke(); c.globalAlpha = a * 0.15; c.fillStyle = p.col; c.fill(); }
      else if (p.k === 'slash') { c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x - Math.cos(p.ang) * p.r * 0.6, p.y - Math.sin(p.ang) * p.r * 0.6, p.r, p.ang - 1.1 + f, p.ang + 1.1 - f * 0.4); c.stroke(); }
      else if (p.k === 'plus') { c.globalAlpha = a; c.fillStyle = '#6dffb0'; const y = p.y - 8 - f * 14; c.fillRect(p.x - 4, y - 1, 8, 2); c.fillRect(p.x - 1, y - 4, 2, 8); }
    }
    c.globalCompositeOperation = 'source-over';
    for (const p of this.p) if (p.k === 'txt') {
      const f = p.t / p.life; c.globalAlpha = Math.min(1, (1 - f) * 2.5);
      c.font = '900 11px "Noto Sans TC", sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.85)';
      c.strokeText(p.s, p.x, p.y - 12 - f * 18); c.fillStyle = p.col; c.fillText(p.s, p.x, p.y - 12 - f * 18);
    }
    c.restore();
  }
}

export function drawZones(c, zones, t) {
  for (const z of zones) {
    c.save(); c.translate(z.x, z.y);
    if (z.k === 'storm') {
      glow(c, 0, 0, z.r * 1.1, 'rgba(110,90,255,.35)');
      c.strokeStyle = 'rgba(150,170,255,.6)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, z.r, 0, TAU); c.stroke();
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#cfd8ff'; c.lineWidth = 1.4;
      let sd = Math.floor(t * 14) * 31 + 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 5; i++) { let a = rnd() * TAU, r = rnd() * z.r * 0.3; c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r); for (let j = 0; j < 4; j++) { a += (rnd() - 0.5) * 1.6; r += z.r * 0.2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); }
    } else {
      const g = c.createRadialGradient(0, 0, z.r * 0.2, 0, 0, z.r); g.addColorStop(0, 'rgba(120,60,200,.10)'); g.addColorStop(0.85, 'rgba(160,90,255,.22)'); g.addColorStop(1, 'rgba(200,150,255,.5)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, z.r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(220,190,255,.5)'; c.lineWidth = 1; for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(0, 0, z.r * ((i / 3 + t * 0.15) % 1), 0, TAU); c.stroke(); }
    }
    c.restore();
  }
}
