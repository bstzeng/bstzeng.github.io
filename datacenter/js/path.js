// A* 尋路：8 方向，不能斜切牆角
import { W, H, solid } from "./map.js";

const N = W * H;
const g = new Float32Array(N), f = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), closed = new Uint32Array(N);
let stamp = 0;
const heap = new Int32Array(N); let hn = 0;
function push(i) { let k = hn++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; k = p; } heap[k] = i; }
function pop() { const top = heap[0], last = heap[--hn]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && f[heap[c + 1]] < f[heap[c]]) c++; if (f[heap[c]] >= f[last]) break; heap[k] = heap[c]; k = c; } heap[k] = last; return top; }
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !solid[y * W + x];

/** 回傳格子路徑 [{x,y}...]（不含起點），找不到回傳 null */
export function findPath(sx, sy, tx, ty, maxNodes = 200000) {
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  if (!free(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  stamp++; hn = 0;
  const s = sy * W + sx, t = ty * W + tx;
  const hfun = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  g[s] = 0; f[s] = hfun(sx, sy); seen[s] = stamp; from[s] = -1; push(s);
  let n = 0;
  while (hn > 0) {
    const i = pop();
    if (closed[i] === stamp) continue;
    closed[i] = stamp;
    if (i === t) break;
    if (++n > maxNodes) return null;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!free(nx, ny)) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
      const j = ny * W + nx;
      if (closed[j] === stamp) continue;
      const ng = g[i] + c;
      if (seen[j] !== stamp || ng < g[j]) { seen[j] = stamp; g[j] = ng; f[j] = ng + hfun(nx, ny) * 1.001; from[j] = i; push(j); }
    }
  }
  if (closed[t] !== stamp) return null;
  const out = [];
  for (let i = t; i !== s; i = from[i]) out.push({ x: i % W, y: (i / W) | 0 });
  return out.reverse();
}
/** 從某點出發能走到的格子數（測試用） */
export function reachable(sx, sy) {
  const mark = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
  const s = sy * W + sx; mark[s] = 1; q[qt++] = s;
  while (qh < qt) { const i = q[qh++], x = i % W, y = (i / W) | 0; for (const [dx, dy] of DIRS.slice(0, 4)) { const nx = x + dx, ny = y + dy; if (!free(nx, ny)) continue; const j = ny * W + nx; if (!mark[j]) { mark[j] = 1; q[qt++] = j; } } }
  return mark;
}
