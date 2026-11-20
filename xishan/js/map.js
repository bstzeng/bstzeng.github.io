// 輿圖：小地圖與全圖（2D canvas，資料直接取自世界配置）
import * as L from "./layout.js";

export const MAP_BOUNDS = { x0: -430, x1: 400, z0: -380, z1: 190 };

export function drawMap(cv, state, { big = false } = {}) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const B = MAP_BOUNDS;
  let sx = W / (B.x1 - B.x0), sz = H / (B.z1 - B.z0);
  let ox = 0, oz = 0, s = Math.min(sx, sz);
  if (!big && state.player) {
    // 小地圖：以玩家為中心
    s = 1.1;
    ox = W / 2 - (state.player.x - B.x0) * s; oz = H / 2 - (state.player.z - B.z0) * s;
  } else { ox = (W - (B.x1 - B.x0) * s) / 2; oz = (H - (B.z1 - B.z0) * s) / 2; }
  const P = (x, z) => [ox + (x - B.x0) * s, oz + (z - B.z0) * s];
  // 紙底
  g.fillStyle = "#efe4c8"; g.fillRect(0, 0, W, H);
  // 山（等高線）
  for (let lv = 8; lv <= 40; lv += 8) {
    g.fillStyle = `rgba(110,140,110,${0.06 + lv / 400})`;
    const step = big ? 6 : 8;
    for (let z = B.z0; z < B.z1; z += step) for (let x = B.x0; x < B.x1; x += step) {
      if (L.hillH(x, z) > lv) { const [px, pz] = P(x, z); g.fillRect(px, pz, step * s + 0.6, step * s + 0.6); }
    }
  }
  // 河
  const strokeLine = (pts, w, col) => {
    g.strokeStyle = col; g.lineWidth = Math.max(1, w * s); g.lineJoin = g.lineCap = "round";
    g.beginPath(); pts.forEach(([x, z], i) => { const [px, pz] = P(x, z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.stroke();
  };
  strokeLine(L.river.p, L.RIVER_HW * 2, "#8fb3a8");
  strokeLine(L.creek.p, L.CREEK_HW * 2, "#8fb3a8");
  // 高台
  { const [a, b] = P(L.terrace.cx - L.terrace.hx, L.terrace.cz - L.terrace.hz); g.fillStyle = "#b9b1a0"; g.fillRect(a, b, L.terrace.hx * 2 * s, L.terrace.hz * 2 * s); }
  // 路
  for (const R of L.roadLines) strokeLine(R.pts, R.w, R.kind === "stone" ? "#9a9a92" : R.kind === "steps" ? "#8a7e6a" : "#d0b98a");
  // 院牆
  for (const W2 of L.walls) strokeLine(W2.pts, 1.2, "#f8f4ea");
  // 橋
  const bridgeLine = (F) => { const a = F.toWorld(-F.half, 0), b = F.toWorld(F.half, 0); strokeLine([[a.x, a.z], [b.x, b.z]], F.hw * 2, "#b0412c"); };
  bridgeLine(L.bridge); bridgeLine(L.smallBridge);
  // 碼頭
  for (const d of L.docks) {
    const c = [[-d.w / 2, 0], [d.w / 2, 0], [d.w / 2, d.out], [-d.w / 2, d.out]].map(([t, o]) => P(d.x + d.tx * t + d.inx * o, d.z + d.tz * t + d.inz * o));
    g.fillStyle = "#8d8d84"; g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
  }
  // 樹
  if (big) for (const t of L.trees) { const [x, z] = P(t.x, t.z); g.fillStyle = t.type === "blossom" ? "#d98a9a" : t.type === "willow" ? "#9bb46a" : "#5f7f5a"; g.beginPath(); g.arc(x, z, Math.max(1.2, 2.2 * s), 0, 6.3); g.fill(); }
  // 建築
  g.font = `${big ? 13 : 11}px "Noto Serif TC","Noto Serif CJK TC",serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const b of L.buildings) {
    g.save();
    const [x, z] = P(b.x, b.z);
    g.translate(x, z); g.rotate(-b.rot);
    g.fillStyle = b.type === "hall" ? "#a3412e" : b.type === "gate" ? "#b0412c" : "#5d5a55";
    g.fillRect((-b.w / 2) * s, (-b.d / 2) * s, b.w * s, b.d * s);
    g.restore();
  }
  // 亭
  { const [x, z] = P(L.pavilion.x, L.pavilion.z); g.fillStyle = "#a3412e"; g.beginPath(); g.arc(x, z, Math.max(2.5, 5 * s), 0, 6.3); g.fill(); }
  if (big) {
    const label = (t, x, z, dy = -12, col = "#2b2219") => { const [px, pz] = P(x, z); g.fillStyle = "rgba(239,228,200,.85)"; const w = g.measureText(t).width; g.fillRect(px - w / 2 - 3, pz + dy - 8, w + 6, 16); g.fillStyle = col; g.fillText(t, px, pz + dy); };
    for (const b of L.buildings) label(b.name, b.x, b.z, -Math.max(b.d, 8) * s * 0.6 - 8);
    label("虹橋", L.bridge.cx, L.bridge.cz, 0, "#8a2a1a");
    label("朱欄小橋", L.smallBridge.cx, L.smallBridge.cz, 14, "#8a2a1a");
    label("觀景亭", L.pavilion.x, L.pavilion.z, -14, "#8a2a1a");
    for (const d of L.docks) label(d.name, d.x + d.inx * d.out, d.z + d.inz * d.out, d.inz > 0 ? 14 : -14, "#2c4a5a");
    label("溪", L.river.at(L.river.len * 0.18).x, L.river.at(L.river.len * 0.18).z, 0, "#2c4a5a");
    for (const R of L.roadLines) if (["official", "market", "back", "trail", "quay", "imperial"].includes(R.id)) { const p = R.line.at(R.line.len * 0.6); label(R.name, p.x, p.z, 0, "#6a5030"); }
    // 指北
    g.fillStyle = "#2b2219"; g.font = `bold 16px serif`; g.fillText("北", W - 26, 24); g.beginPath(); g.moveTo(W - 26, 36); g.lineTo(W - 31, 50); g.lineTo(W - 21, 50); g.fill();
    // 比例尺
    g.fillRect(20, H - 22, 100 * s, 3); g.font = "11px serif"; g.textAlign = "left"; g.fillText("100 公尺", 20, H - 32);
  }
  // 遊船與玩家
  if (state.boat) { const [x, z] = P(state.boat.x, state.boat.z); g.fillStyle = "#2c4a5a"; g.beginPath(); g.ellipse(x, z, 5, 3, 0, 0, 6.3); g.fill(); }
  if (state.player) {
    const [x, z] = P(state.player.x, state.player.z);
    g.save(); g.translate(x, z); g.rotate(-state.player.yaw);
    g.fillStyle = "#c0281e"; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.restore();
  }
  g.strokeStyle = "#6b5a3a"; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
}
