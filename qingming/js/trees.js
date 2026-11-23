// 清明上河圖：早春的郊野樹（照原畫）——光禿的老樹、截頂的老柳。細枝用墨線（Line）畫，像畫裡的筆觸。
import * as THREE from "three";
import { Batch, tube, mat } from "../../xishan/js/geo.js";
import { rng } from "./plan.js";

const V = THREE.Vector3;
/**
 * list: [{type: "bare" | "oldwillow", x, z, sc, rot, seed}]
 * 粗的枝幹做成樹皮圓管，細枝（半徑 < 6 公分）做成線段
 */
export function buildSpringTrees(scene, list, groundAt) {
  const wood = new Batch();
  const twigs = [], shoots = [], buds = [];
  for (const T of list) {
    const r = rng(T.seed), y = groundAt(T.x, T.z) - 0.15, sc = T.sc || 1;
    const jit = (d, a) => d.add(new V((r() - 0.5) * a, (r() - 0.5) * a * 0.4, (r() - 0.5) * a)).normalize();
    const limb = (p, d, len, rad, depth, up) => {
      const pts = [p.clone()];
      let q = p.clone(); const dd = d.clone();
      for (let i = 1; i <= 3; i++) { jit(dd, 0.7); dd.y += up; dd.normalize(); q = q.clone().addScaledVector(dd, len / 3); pts.push(q); }
      if (rad > 0.06) wood.add("bark", tube(pts, rad, 8, rad > 0.2 ? 6 : 4));
      else for (let i = 0; i < pts.length - 1; i++) twigs.push(pts[i], pts[i + 1]);
      if (depth <= 0) return;
      const kids = depth >= 3 ? 2 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.7 ? 1 : 0);
      for (let k = 0; k < kids; k++) {
        const at = pts[Math.min(pts.length - 1, 1 + Math.floor(r() * pts.length))];
        const a = r() * Math.PI * 2, sp = 0.6 + r() * 0.6;
        // 蟹爪枝：分岔角大、枝條曲折
        const nd = dd.clone().multiplyScalar(0.8).add(new V(Math.cos(a) * sp, 0.25 + r() * 0.35, Math.sin(a) * sp)).normalize();
        limb(at, nd, len * (0.62 + r() * 0.16), rad * 0.58, depth - 1, up * 0.8);
      }
    };
    if (T.type === "oldwillow") {
      // 截頂老柳：粗短、扭曲的樹幹，頂上一個大樹瘤，冒出一大把細長的新枝
      const H = (3.4 + r() * 1.4) * sc, R0 = (0.48 + r() * 0.2) * sc;
      const lean = new V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
      const pts = [new V(T.x, y, T.z)];
      for (let i = 1; i <= 4; i++) pts.push(pts[0].clone().addScaledVector(lean, (H * i) / 4).add(new V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)));
      wood.add("bark", tube(pts, R0, 12, 8));
      wood.add("bark", tube([pts[0], pts[1].clone().add(new V(0.15, 0, 0.1)), pts[2]], R0 * 1.18, 6, 7));
      const head = pts[4];
      for (let k = 0; k < 5; k++) { const g = new THREE.SphereGeometry(R0 * (0.75 + r() * 0.5), 8, 6); g.translate(head.x + (r() - 0.5) * R0 * 1.6, head.y + (r() - 0.3) * R0, head.z + (r() - 0.5) * R0 * 1.6); wood.add("bark", g); }
      // 幾根粗一點的枝
      for (let k = 0; k < 3; k++) { const a = r() * 6.3; limb(head, new V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), (1.6 + r()) * sc, 0.12 * sc, 1, 0.1); }
      // 新枝：從樹瘤往上、往外散開，梢頭微垂
      const n = 70 + Math.floor(r() * 30);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, sp = 0.25 + r() * 0.9, L = (2.8 + r() * 3.2) * sc;
        let p = head.clone().add(new V((r() - 0.5) * R0 * 1.6, R0 * 0.4, (r() - 0.5) * R0 * 1.6));
        const d = new V(Math.cos(a) * sp, 1, Math.sin(a) * sp).normalize();
        for (let i = 0; i < 5; i++) {
          const q = p.clone().addScaledVector(d, L / 5);
          shoots.push(p, q); p = q;
          d.y -= 0.16; d.x *= 1.05; d.z *= 1.05; d.normalize();
        }
        if (r() < 0.5) buds.push(p.clone());
      }
    } else {
      // 光禿的老樹：歪斜的樹幹、蟹爪枝
      const H = (4.2 + r() * 2.4) * sc;
      const d = new V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize();
      limb(new V(T.x, y, T.z), d, H, (0.3 + r() * 0.12) * sc, 5, 0.12);
    }
  }
  const group = new THREE.Group();
  wood.build(group, { cast: true, receive: true });
  const line = (pts, color) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    m.frustumCulled = false; group.add(m); return m;
  };
  if (twigs.length) line(twigs, 0x2f271f);
  if (shoots.length) line(shoots, 0x4f4a2c);
  // 柳梢冒出的嫩芽：淡淡的一點黃綠
  if (buds.length) {
    const g = new THREE.BufferGeometry().setFromPoints(buds);
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa25a, size: 0.35, sizeAttenuation: true }));
    m.frustumCulled = false; group.add(m);
  }
  scene.add(group);
  return group;
}
