// 單線節奏譜 + 荷葉長度條 (SVG 字串)
import { TOKENS, expand } from "./data.js";

export const G = {
  MW: 300,        // 每小節寬
  LEFT: 56,       // 左側拍號空間
  RH: 206,        // 每列高度
  STAFF: 98,      // 譜線 y
  STEM: 46,       // 符桿頂端 y
  COUNT: 24,      // 拍子數字 y
  LANE: 152,      // 荷葉條 y
  LANE_H: 28,
  PADL: 30,       // 小節內左邊距
  PADR: 20,
};

/** 小節 i 的座標函式 */
export function measureGeo(i, beats, perRow) {
  const col = i % perRow, row = Math.floor(i / perRow);
  const x0 = G.LEFT + col * G.MW, oy = row * G.RH;
  const bw = (G.MW - G.PADL - G.PADR) / beats;
  return { x0, oy, row, bw, X: (b) => x0 + G.PADL + b * bw };
}

const f = (n) => Math.round(n * 10) / 10;

function head(x, y, kind, k) {
  const data = k != null ? ` data-k="${k}"` : "";
  if (kind === "w")
    return `<ellipse class="hd open"${data} cx="${f(x)}" cy="${y}" rx="10.5" ry="6.8" transform="rotate(-12 ${f(x)} ${y})"/>`;
  const cls = kind === "open" ? "hd open" : "hd";
  return `<ellipse class="${cls}"${data} cx="${f(x)}" cy="${y}" rx="8.6" ry="6.2" transform="rotate(-22 ${f(x)} ${y})"/>`;
}
const stem = (x, y) => `<line class="ink" x1="${f(x + 7.6)}" y1="${y - 2}" x2="${f(x + 7.6)}" y2="${y - (G.STAFF - G.STEM)}" stroke-width="2.4"/>`;
const dot = (x, y) => `<circle class="inkf" cx="${f(x + 18)}" cy="${y - 4}" r="2.7"/>`;

/**
 * 畫一小節
 * toks: token 陣列；geo: measureGeo 結果；m: 小節在畫面上的編號（DOM key 用）
 * opts.counts: 畫拍子數字；opts.lane: 畫荷葉條
 */
export function drawMeasure(toks, beats, geo, m, opts = {}) {
  const { X, oy } = geo;
  const y = oy + G.STAFF, stemTop = oy + G.STEM;
  const ev = expand(toks);
  let notes = "", lane = "", counts = "";

  // 音符與休止符
  let pos = 0, ei = 0;
  for (const t of toks) {
    const xs = X(pos);
    const k0 = `${m}-${ei}`;
    switch (t) {
      case "q": notes += head(xs, y, "fill", k0) + stem(xs, y); break;
      case "h": notes += head(xs, y, "open", k0) + stem(xs, y); break;
      case "hd": notes += head(xs, y, "open", k0) + stem(xs, y) + dot(xs, y); break;
      case "w": notes += head(xs, y, "w", k0); break;
      case "ee": {
        const x2 = X(pos + 0.5);
        notes += head(xs, y, "fill", k0) + stem(xs, y) + head(x2, y, "fill", `${m}-${ei + 1}`) + stem(x2, y);
        notes += `<rect class="inkf" x="${f(xs + 6.4)}" y="${stemTop}" width="${f(x2 - xs + 2.4)}" height="6.5"/>`;
        break;
      }
      case "dqe": {
        const x2 = X(pos + 1.5);
        notes += head(xs, y, "fill", k0) + stem(xs, y) + dot(xs, y);
        notes += head(x2, y, "fill", `${m}-${ei + 1}`) + stem(x2, y);
        const sx = x2 + 7.6;
        notes += `<path class="ink" fill="none" stroke-width="2.6" d="M${f(sx)} ${stemTop} C${f(sx + 1)} ${stemTop + 12} ${f(sx + 13)} ${stemTop + 14} ${f(sx + 10)} ${stemTop + 30}"/>`;
        break;
      }
      case "qr": {
        const x = xs;
        notes += `<path class="ink rs" data-k="${k0}" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M${f(x - 3)} ${y - 22} L${f(x + 5)} ${y - 12} L${f(x - 1)} ${y - 3} L${f(x + 5)} ${y + 6} C${f(x - 5)} ${y + 2} ${f(x - 5)} ${y + 12} ${f(x + 1)} ${y + 17}"/>`;
        break;
      }
      case "hr":
        notes += `<rect class="inkf rs" data-k="${k0}" x="${f(geo.X(pos + 0.45) - 9)}" y="${y - 8}" width="18" height="8"/>`;
        break;
    }
    ei += TOKENS[t].ev.length;
    pos += TOKENS[t].len;
  }

  // 拍子數字 1 2 3 4（八分音符加 &）
  if (opts.counts) {
    const held = new Set();
    for (const e of ev) if (e.type === "n") for (let b = Math.ceil(e.b + 0.01); b < e.b + e.d - 0.01; b++) held.add(b);
    for (let b = 0; b < beats; b++)
      counts += `<text class="cnt${held.has(b) ? " held" : ""}" data-c="${m}-${b}" x="${f(X(b))}" y="${oy + G.COUNT}">${b + 1}</text>`;
    for (const e of ev) if (e.type === "n" && e.b % 1 === 0.5)
      counts += `<text class="cnt amp" x="${f(X(e.b))}" y="${oy + G.COUNT}">&amp;</text>`;
  }

  // 荷葉條：長度 = 音符時值
  if (opts.lane) {
    const ly = oy + G.LANE;
    ev.forEach((e, i) => {
      const k = `${m}-${i}`;
      const x1 = X(e.b) - 8, x2 = X(e.b + e.d) - 12;
      if (e.type === "n") {
        lane += `<rect class="pad${e.d >= 1.5 ? " long" : ""}" data-k="${k}" x="${f(x1)}" y="${ly}" width="${f(x2 - x1)}" height="${G.LANE_H}" rx="14"/>`;
      } else {
        lane += `<rect class="rz" data-k="${k}" x="${f(x1)}" y="${ly}" width="${f(x2 - x1)}" height="${G.LANE_H}" rx="10"/>`;
        lane += `<text class="rzt" data-k="${k}" x="${f((x1 + x2) / 2)}" y="${ly + 19}">噓</text>`;
      }
    });
    // 玩家按下的長度（動態）
    ev.forEach((e, i) => {
      if (e.type === "n") lane += `<rect class="fill" data-k="${m}-${i}" x="0" y="${ly + 4}" width="0" height="${G.LANE_H - 8}" rx="10"/>`;
    });
    ev.forEach((e, i) => {
      if (e.type === "n") lane += `<text class="plab" data-k="${m}-${i}" x="${f((X(e.b) - 8 + X(e.b + e.d) - 12) / 2)}" y="${ly + G.LANE_H + 18}"></text>`;
    });
  }

  // 小節線
  const bx = geo.x0 + G.MW;
  const bar = opts.final
    ? `<line class="ink" x1="${bx - 6}" y1="${y - 20}" x2="${bx - 6}" y2="${y + 20}" stroke-width="2"/><rect class="inkf" x="${bx - 2}" y="${y - 20}" width="5" height="40"/>`
    : `<line class="ink" x1="${bx}" y1="${y - 20}" x2="${bx}" y2="${y + 20}" stroke-width="2"/>`;

  return `<g class="meas" data-m="${m}"><g class="counts">${counts}</g><g class="lane">${lane}</g><g class="notes">${notes}</g>${bar}
    <text class="veilq" x="${f(geo.x0 + G.MW / 2)}" y="${y + 12}">?</text></g>`;
}

/** 整段譜（多小節，自動換行） */
export function drawScore(measures, beats, perRow, opts = {}) {
  const rows = Math.ceil(measures.length / perRow);
  const width = G.LEFT + Math.min(perRow, measures.length) * G.MW + 8;
  const height = opts.lane ? rows * G.RH : rows * G.RH - 70;
  let s = "";
  for (let r = 0; r < rows; r++) {
    const n = Math.min(perRow, measures.length - r * perRow);
    const y = r * G.RH + G.STAFF;
    s += `<line class="ink staff" x1="${r === 0 ? 14 : 30}" y1="${y}" x2="${G.LEFT + n * G.MW}" y2="${y}" stroke-width="1.6"/>`;
    if (r === 0) {
      s += `<text class="ts" x="30" y="${y - 3}">${beats}</text><text class="ts" x="30" y="${y + 24}">4</text>`;
    }
  }
  measures.forEach((toks, i) => {
    s += drawMeasure(toks, beats, measureGeo(i, beats, perRow), i, { ...opts, final: i === measures.length - 1 && opts.finalBar !== false });
  });
  return { svg: s, width, height };
}
