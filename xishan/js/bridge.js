// 主橋（虹橋：朱紅水中立柱＋木拱）與朱欄小橋
import * as THREE from "three";
import { M, box, cyl, lathe, rod, tube, surface } from "./geo.js";
import { bridge as BR, smallBridge as SB, BANK } from "./layout.js";

/** 橋的局部座標：x = 沿橋（a），z = 橫向（b），右手座標 */
function frameMatrix(F) {
  const X = new THREE.Vector3(F.ax, 0, F.az), Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3().crossVectors(X, Y);   // (-az, 0, ax)
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  m.setPosition(F.cx, 0, F.cz);
  return m;
}

export function buildBridge(b) {
  const P = frameMatrix(BR);
  const H = BR.half, hw = BR.hw;
  const deck = (a) => BR.deck(Math.max(-H, Math.min(H, a)));
  const under = (a) => deck(a) - BR.thick;
  // 橋面（橫鋪木板）
  b.add("deck", surface(64, 6, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a), -hw + 0.25 + (2 * hw - 0.5) * v]; }, (u, v) => [(-hw + 2 * hw * v) / 1.6, (2 * H * u) / 1.1]), null, P);
  // 踏步線（陡的地方做成階梯的樣子）
  for (let a = -H + 0.6; a < H - 0.5; a += 0.55) {
    const slope = Math.abs((2 * BR.rise * a) / (H * H));
    if (slope < 0.12) continue;
    b.add("woodDark", box(0.08, 0.05, 2 * hw - 0.6), M([a, deck(a) + 0.02, 0]), P);
  }
  // 側邊封板與底面
  for (const s of [-1, 1]) {
    b.add("red", surface(64, 1, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a) - BR.thick * v, s * (hw - 0.05)]; }, (u, v) => [u * 8, v]), null, P);
  }
  b.add("under", surface(64, 4, (u, v) => { const a = -H + 2 * H * u; return [a, under(a), -hw + 2 * hw * v]; }), null, P);
  // 欄杆：望柱、扶手、欄板
  for (const s of [-1, 1]) {
    const z = s * (hw - 0.18);
    const rail = [], mid = [];
    for (let a = -H; a <= H + 0.01; a += 2) {
      b.add("red", box(0.18, 1.2, 0.18), M([a, deck(a) + 0.6, z]), P);
      b.add("gold", lathe([[0, 0], [0.12, 0], [0.13, 0.12], [0.06, 0.22], [0, 0.26]], 8), M([a, deck(a) + 1.2, z]), P);
      if (a + 2 <= H + 0.01) for (let k = 0.5; k < 2; k += 0.5) b.add("red", box(0.06, 0.62, 0.06), M([a + k, deck(a + k) + 0.42, z]), P);
    }
    for (let a = -H; a <= H + 0.01; a += 1) { rail.push([a, deck(a) + 1.08, z]); mid.push([a, deck(a) + 0.72, z]); }
    b.add("red", tube(rail, 0.07, 160, 6), null, P);
    b.add("redDark", tube(mid, 0.045, 160, 5), null, P);
    // 橋頭華表
    for (const e of [-1, 1]) {
      const a = e * (H + 0.6);
      b.add("stoneLight", lathe([[0, 0], [0.5, 0], [0.45, 0.3], [0.3, 0.4], [0.28, 3.4], [0.5, 3.6], [0.2, 4.0], [0, 4.1]], 8), M([a, BR.y0 - 0.1, s * (hw + 0.4)]), P);
    }
  }
  // 縱樑（貼著橋底）
  for (const z of [-hw + 0.6, -1.3, 1.3, hw - 0.6]) {
    const pts = [];
    for (let a = -H + 4; a <= H - 4 + 0.01; a += 2) pts.push([a, under(a) - 0.18, z]);
    b.add("woodDark", tube(pts, 0.2, 80, 4), null, P);
  }
  // 木拱（虹橋的編木拱肋），只在航道兩側往下彎，不擋船
  for (const z of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const pts = [];
    for (let a = -27; a <= 27.01; a += 1.5) {
      const t = a / 27;
      pts.push([a, under(a) - 0.45 - 1.4 * Math.pow(Math.abs(t), 2.2), z]);
    }
    b.add("woodDark", tube(pts, 0.17, 90, 5), null, P);
  }
  for (let a = -24; a <= 24; a += 3) {
    const t = a / 27, y = under(a) - 0.45 - 1.4 * Math.pow(Math.abs(t), 2.2);
    b.add("wood", rod([a, y, -3.4], [a, y, 3.4], 0.11, 0.11, 5), null, P);
  }
  // 朱紅水中立柱
  for (const a of BR.piers) {
    const top = under(a) - 0.3;
    for (const z of [-3.2, -1.1, 1.1, 3.2]) {
      b.add("stoneLight", lathe([[0, -4.2], [0.72, -4.2], [0.72, 0.15], [0.55, 0.35], [0, 0.35]], 10), M([a, 0, z]), P);
      b.add("red", cyl(0.33, 0.36, top - 0.3, 12), M([a, 0.3 + (top - 0.3) / 2, z]), P);
      b.add("green", box(0.9, 0.35, 0.9), M([a, top + 0.1, z]), P);
    }
    // 帽樑、斜撐
    b.add("woodDark", box(0.6, 0.5, 2 * hw + 0.6), M([a, top + 0.45, 0]), P);
    b.add("redDark", box(0.35, 0.3, 2 * hw), M([a, 1.9, 0]), P);
    for (const [z0, z1] of [[-3.2, -1.1], [1.1, 3.2]]) {
      b.add("woodDark", rod([a, 1.9, z0], [a, top - 0.1, z1], 0.09), null, P);
      b.add("woodDark", rod([a, 1.9, z1], [a, top - 0.1, z0], 0.09), null, P);
    }
  }
  // 岸上的石砌橋台（不讓上坡段懸空）
  for (const e of [-1, 1]) {
    for (const s of [-1, 1]) {
      b.add("stone", surface(14, 1, (u, v) => {
        const a = e * (19 + (H - 19) * u);
        return [a, lerp(BANK - 1.6, deck(a) - 0.35, v), s * (hw - 0.02)];
      }, (u, v) => [u * 4, v]), null, P);
    }
    b.add("stone", surface(14, 1, (u, v) => { const a = e * (19 + (H - 19) * u); return [a, deck(a) - 0.4, -hw + 2 * hw * v]; }), null, P);
  }
  // 橋下燈籠
  for (const a of [-7, 7]) for (const z of [-hw - 0.2, hw + 0.2]) {
    b.add("lantern", lathe([[0, -0.32], [0.22, -0.24], [0.26, 0], [0.22, 0.24], [0, 0.32]], 10), M([a, deck(a) - 0.2, z]), P);
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

/** 朱欄小橋：石拱＋朱紅欄杆 */
export function buildSmallBridge(b) {
  const P = frameMatrix(SB);
  const H = SB.half, hw = SB.hw;
  const deck = (a) => SB.deck(Math.max(-H, Math.min(H, a)));
  const archR = 4.4;
  const bottom = (a) => (Math.abs(a) < archR ? 0.1 + 1.25 * Math.sqrt(1 - (a / archR) ** 2) : BANK - 1.2);
  b.add("flag", surface(24, 3, (u, v) => { const a = -H + 2 * H * u; return [a, deck(a), -hw + 2 * hw * v]; }, (u, v) => [(2 * hw * v) / 2, (2 * H * u) / 2]), null, P);
  for (const s of [-1, 1]) {
    b.add("stone", surface(30, 6, (u, v) => { const a = -H + 2 * H * u; return [a, lerp(bottom(a), deck(a), v), s * hw]; }, (u, v) => [u * 5, v]), null, P);
  }
  // 拱腹
  b.add("stone", surface(20, 2, (u, v) => { const a = -archR + 2 * archR * u; return [a, bottom(a), -hw + 2 * hw * v]; }, (u, v) => [u * 3, v]), null, P);
  // 券石
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = -archR + (2 * archR * i) / 16; pts.push([a, bottom(a) + 0.12, s * (hw + 0.05)]); }
    b.add("stoneLight", tube(pts, 0.16, 32, 5), null, P);
  }
  // 朱紅欄杆
  for (const s of [-1, 1]) {
    const z = s * (hw - 0.12);
    const rail = [];
    for (let a = -H; a <= H + 0.01; a += 1.6) {
      b.add("red", box(0.13, 0.95, 0.13), M([a, deck(a) + 0.47, z]), P);
      if (a + 1.6 <= H + 0.01) for (let k = 0.4; k < 1.6; k += 0.4) b.add("red", box(0.05, 0.5, 0.05), M([a + k, deck(a + k) + 0.35, z]), P);
    }
    for (let a = -H; a <= H + 0.01; a += 0.8) rail.push([a, deck(a) + 0.88, z]);
    b.add("red", tube(rail, 0.055, 40, 6), null, P);
  }
}
