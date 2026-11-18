// 節奏小達人：音符定義、關卡、隨機節奏產生
// 拍數以「四分音符 = 1 拍」計算

// ev: [類型 n=音符 / r=休止符, 從第幾拍開始(相對), 長度(拍)]
export const TOKENS = {
  q:   { len: 1, ev: [["n", 0, 1]] },                 // 四分音符
  qr:  { len: 1, ev: [["r", 0, 1]] },                 // 四分休止符
  ee:  { len: 1, ev: [["n", 0, 0.5], ["n", 0.5, 0.5]] }, // 兩個八分音符
  h:   { len: 2, ev: [["n", 0, 2]] },                 // 二分音符
  hr:  { len: 2, ev: [["r", 0, 2]] },                 // 二分休止符
  hd:  { len: 3, ev: [["n", 0, 3]] },                 // 附點二分音符
  w:   { len: 4, ev: [["n", 0, 4]] },                 // 全音符
  dqe: { len: 2, ev: [["n", 0, 1.5], ["n", 1.5, 0.5]] }, // 附點四分 + 八分
};

export const LEVELS = [
  { name: "穩定拍",       beats: 4, pool: { q: 1 },                                   desc: "四分音符：一拍按一下，跟著滴答聲。" },
  { name: "四分休止符",   beats: 4, pool: { q: 3, qr: 1.3 }, focus: "qr",             desc: "看到休止符「噓」，要停一拍，不要按。" },
  { name: "二分音符",     beats: 4, pool: { q: 2, h: 2 }, focus: "h",                 desc: "二分音符要按住兩拍：1、2 數完才放開！" },
  { name: "二分休止符",   beats: 4, pool: { q: 2, h: 1.5, qr: 1, hr: 0.8 }, focus: "hr", desc: "長長的休止符，安靜等兩拍。" },
  { name: "八分音符",     beats: 4, pool: { q: 2, ee: 2 }, focus: "ee",               desc: "一拍按兩下：1 & 2 &，兩下要一樣平均。" },
  { name: "八分＋長音",   beats: 4, pool: { q: 1.5, ee: 1.5, h: 1.5, qr: 0.6 }, focus: "h", desc: "快快的八分音符和長長的二分音符混在一起。" },
  { name: "全音符",       beats: 4, pool: { w: 1.2, h: 1.5, q: 1.2 }, focus: "w",     desc: "全音符要按住四拍：1、2、3、4 都數完！" },
  { name: "附點二分音符", beats: 4, pool: { hd: 2, q: 1.5, ee: 0.6 }, focus: "hd",    desc: "附點二分音符按住三拍：1、2、3。" },
  { name: "3/4 拍",       beats: 3, pool: { q: 2, h: 1.5, ee: 1, qr: 0.5 },           desc: "一小節只有三拍：1、2、3，像跳華爾滋。" },
  { name: "3/4 長音",     beats: 3, pool: { hd: 1.2, h: 1.5, q: 1.5, ee: 1 }, focus: "hd", desc: "3/4 拍裡的長音，按住到小節最後。" },
  { name: "附點四分音符", beats: 4, pool: { dqe: 2, q: 1.5, h: 1 }, focus: "dqe",     desc: "附點四分按住一拍半，再接一個八分音符。" },
  { name: "綜合挑戰 4/4", beats: 4, pool: { q: 2, ee: 1.5, h: 1.5, hd: 0.8, w: 0.4, qr: 0.8, hr: 0.4, dqe: 1 }, desc: "所有音符都會出現，挑戰看看！" },
  { name: "綜合挑戰 3/4", beats: 3, pool: { q: 2, ee: 1.5, h: 1.5, hd: 0.8, qr: 0.8, dqe: 0.8 }, desc: "3/4 拍的綜合挑戰。" },
];

const isRest = (t) => t === "qr" || t === "hr";

function allowed(tok, pos, beats) {
  if (pos + TOKENS[tok].len > beats) return false;
  switch (tok) {
    case "hr":  return beats === 4 && pos % 2 === 0;   // 二分休止符只放在第 1、3 拍
    case "w":   return beats === 4 && pos === 0;
    case "hd":  return beats === 4 ? pos <= 1 : pos === 0;
    case "dqe": return beats === 4 ? pos % 2 === 0 : true;
    default:    return true;
  }
}

/** 產生一小節節奏（token 陣列） */
export function genMeasure(level, rnd = Math.random) {
  const maxRest = Math.floor(level.beats / 2);
  let last = null;
  for (let tries = 0; tries < 300; tries++) {
    const toks = [];
    let pos = 0;
    while (pos < level.beats) {
      const cands = Object.entries(level.pool).filter(([t]) => allowed(t, pos, level.beats));
      // 小節第一拍盡量是音符，比較好起步
      const ws = cands.map(([t, w]) => (pos === 0 && isRest(t) ? w * 0.25 : w));
      let r = rnd() * ws.reduce((a, b) => a + b, 0);
      let pick = cands[0][0];
      for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pick = cands[i][0]; break; } }
      toks.push(pick);
      pos += TOKENS[pick].len;
    }
    last = toks;
    const rest = toks.filter(isRest).reduce((a, t) => a + TOKENS[t].len, 0);
    if (rest > maxRest) continue;
    if (tries < 200 && level.focus && !toks.includes(level.focus)) continue;
    if (tries < 200 && Object.keys(level.pool).length > 1 && toks.every((t) => t === "q")) continue;
    return toks;
  }
  return last;
}

/** 展開成事件：{ type: 'n'|'r', b: 小節內拍點, d: 拍長, tok } */
export function expand(toks) {
  const out = [];
  let pos = 0;
  for (const t of toks) {
    for (const [type, b, d] of TOKENS[t].ev) out.push({ type, b: pos + b, d, tok: t });
    pos += TOKENS[t].len;
  }
  return out;
}

/** 聽起來一樣的節奏有相同的 key */
export const soundKey = (toks) => expand(toks).map((e) => e.type + e.b + ":" + e.d).join(",");
