// 清明上河圖：讓畫裡的一切動起來（人、驢隊、轎子、車、駱駝、船、縴夫、放桅過橋的大船）
import * as THREE from "three";
import { Crowd, anim, makeAnimal, stepAnimal, makeCart, makeBarrow, makeSedan, makeBigBoat } from "./life.js";
import { wupeng, huafang, cargo } from "../../xishan/js/boats.js";
import { mat, tube } from "../../xishan/js/geo.js";
import * as P from "./plan.js";

const TAU = Math.PI * 2;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/** 一條可以走的路線 + 行人在上面的位置 */
class Track {
  constructor(line, { loop = false } = {}) { this.line = line; this.loop = loop; }
  pose(s, off) {
    const p = this.line.at(s);
    return { x: p.x + p.nx * off, z: p.z + p.nz * off, tx: p.tx, tz: p.tz };
  }
}

/** 主幹道：郊野小路 → 汴河南岸 → 城外大街 → 穿城門 → 城內 */
function grandRoute() {
  const c = P.road("country").pts, n = P.road("near"), st = P.road("street").pts;
  const pts = c.slice(0, -1).map((p) => [...p]);
  const k = n.line.near(c[c.length - 1][0], c[c.length - 1][1]).s;
  for (let s = k; s < n.line.len; s += 3) { const p = n.line.at(s); pts.push([p.x, p.z]); }
  for (const p of st) pts.push([...p]);
  return new P.Line(pts, 20);
}

export class Life {
  constructor(scene) {
    this.scene = scene;
    this.crowd = new Crowd(scene, 640);
    this.agents = [];        // {update(dt,t)}
    this.walkers = [];
    this.boats = [];          // 給水面畫船跡
    this.frame = 0;
    this.r = P.rng(777);
    this.grand = new Track(grandRoute());
    this.buildWalkers();
    this.buildProcessions();
    this.buildBridgeCrowd();
    this.buildIdle();
    this.buildBoats();
    this.buildBigBoat();
    this.buildTow();
  }

  /* ---------- 路上的行人 ---------- */
  addWalker(track, s, opt = {}) {
    const r = this.r;
    const carry = opt.carry ?? (r() < 0.14 ? "pole" : r() < 0.08 ? "sack" : null);
    const p = this.crowd.add({ carry, color: opt.color, hat: opt.hat });
    const w = { p, track, s, dir: opt.dir ?? (r() < 0.5 ? 1 : -1), speed: opt.speed ?? (carry ? 0.95 : 1.05 + r() * 0.45), off: opt.off ?? (r() - 0.5) * (opt.width ?? 4), y: P.LAND, pause: 0, chat: 0, child: opt.child };
    if (opt.child) p.scale *= 0.62;
    const q = track.pose(s, w.off);
    w.y = P.topSurface(q.x, q.z)?.y ?? P.LAND;
    this.walkers.push(w);
    return w;
  }
  buildWalkers() {
    const r = this.r;
    const many = (id, n, width, opt = {}) => { const R = P.road(id); const T = new Track(R.line); for (let i = 0; i < n; i++) this.addWalker(T, ((i + r() * 0.8) / n) * R.line.len, { width, ...opt }); };
    many("country", 10, 2.6);
    many("near", 34, 4.2);
    many("towpath", 6, 1.6);
    many("street", 120, 5.6);
    many("far", 14, 2.6);
    many("cross", 30, 4.6);
    many("bankst", 18, 2.6);
    // 過橋的人潮（避開兩側攤位）
    const B = new Track(P.road("bridge").line);
    for (let i = 0; i < 42; i++) this.addWalker(B, r() * B.line.len, { width: 3.6 });
    // 小孩
    for (let i = 0; i < 10; i++) this.addWalker(new Track(P.road(["street", "cross", "near"][i % 3]).line), r() * 200, { child: true, carry: null, hat: null, speed: 1.3 + r() * 0.5 });
  }
  updateWalkers(dt, t) {
    const f = this.frame;
    for (let k = 0; k < this.walkers.length; k++) {
      const w = this.walkers[k], p = w.p, L = w.track.line;
      if (w.pause > 0) {
        w.pause -= dt;
        (w.chat ? anim.talk : anim.stand)(p, t);
        continue;
      }
      w.s += w.dir * w.speed * dt;
      if (w.s > L.len - 1) { w.s = L.len - 1; w.dir = -1; }
      if (w.s < 1) { w.s = 1; w.dir = 1; }
      // 偶爾停下來聊天、看貨
      if (((k * 131 + Math.floor(t * 0.5)) % 97) === 0 && w.pause <= 0 && Math.random() < dt * 2) { w.pause = 3 + Math.random() * 5; w.chat = Math.random() < 0.6 ? 1 : 0; }
      const q = w.track.pose(w.s, w.off * (w.dir > 0 ? 1 : -1));
      if ((k + f) % 3 === 0) w.yT = P.followY(q.x, q.z, w.y);
      if (w.yT !== undefined) w.y += (w.yT - w.y) * Math.min(1, dt * 9);
      p.x = q.x; p.z = q.z; p.y = w.y;
      p.h = Math.atan2(q.tx * w.dir, q.tz * w.dir);
      anim.walk(p, t, w.speed);
    }
  }

  /* ---------- 隊伍：驢隊、轎子、駱駝、車 ---------- */
  addGroup(objs, startS, speed, { spacing = 3, lane = 1.6 } = {}) {
    // objs: [{kind:"person"|"animal"|"cart"|"sedan", ...}]，沿主幹道排成一列
    const G = { s: startS, speed, items: [] };
    let back = 0;
    for (const o of objs) {
      o.back = back + (o.gap ?? 0); back = o.back + (o.len ?? spacing);
      o.lane = o.lane ?? lane;
      o.y = P.LAND;
      G.items.push(o);
    }
    this.agents.push({ update: (dt, t) => this.updateGroup(G, dt, t) });
    return G;
  }
  updateGroup(G, dt, t) {
    const T = this.grand, L = T.line;
    G.s += G.speed * dt;
    if (G.s > L.len + 4) G.s -= L.len + 20;
    for (const o of G.items) {
      let s = G.s - o.back;
      const hidden = s < 0 || s > L.len;
      s = P.clamp(s, 0, L.len);
      const q = T.pose(s, o.lane);
      const h = Math.atan2(q.tx, q.tz);
      o.y += (P.followY(q.x, q.z, o.y) - o.y) * 0.3;
      if (o.obj) {
        o.obj.visible = !hidden;
        o.obj.position.set(q.x, o.y, q.z);
        let dh = wrapA(h - o.obj.rotation.y); o.obj.rotation.y += dh * 0.2;
        if (o.obj.userData.legs) stepAnimal(o.obj, t, G.speed, o.ph || 0);
        if (o.obj.userData.wheels) for (const w of o.obj.userData.wheels) w.rotation.z -= (G.speed * dt) / o.obj.userData.r;
      }
      // 跟著物件的人：騎乘、抬轎、牽牲口
      for (const r of o.riders || []) {
        const c = Math.cos(o.obj.rotation.y), sn = Math.sin(o.obj.rotation.y);
        r.p.hidden = hidden;
        r.p.x = q.x + r.dx * c + r.dz * sn; r.p.z = q.z - r.dx * sn + r.dz * c;
        r.p.y = o.y + r.dy; r.p.h = o.obj.rotation.y;
        if (r.role === "ride") { anim.stand(r.p, t); r.p.bob = Math.abs(Math.sin(t * 4.2 * G.speed)) * 0.05; r.p.armL = r.p.armR = -0.6; }
        else if (r.role === "bear") { anim.walk(r.p, t, G.speed); r.p.armL = r.p.armR = -2.4; r.p.sideL = r.p.sideR = 0.35; }
        else if (r.role === "push") { anim.walk(r.p, t, G.speed); r.p.armL = r.p.armR = -1.0; r.p.lean = 0.3; }
        else if (r.role === "lead") { anim.walk(r.p, t, G.speed); r.p.armR = -0.9; }
        else anim.walk(r.p, t, G.speed);
      }
      if (o.p) { o.p.hidden = hidden; o.p.x = q.x; o.p.z = q.z; o.p.y = o.y; o.p.h = h; (o.pull ? anim.pull : anim.walk)(o.p, t, G.speed); if (o.whip) o.p.armR = -1.6 + Math.sin(t * 2) * 0.6; }
    }
  }
  animal(kind, extra = {}) { const g = makeAnimal(kind, extra.tint); this.scene.add(g); return { obj: g, ph: this.r() * 6, len: g.userData.S.L + 0.9, ...extra }; }
  person(opt = {}) { return { p: this.crowd.add(opt), len: 1.2, ...opt }; }
  rider(o, dy, role = "ride", dx = 0, dz = 0, opt = {}) { o.riders = o.riders || []; o.riders.push({ p: this.crowd.add(opt), dx, dy, dz, role }); return o; }
  buildProcessions() {
    const L = this.grand.line.len, r = this.r;
    // 1) 驢隊馱炭進城（郊野）
    this.addGroup([this.person({ whip: true, hat: "cone" }), ...[0, 1, 2, 3, 4].map(() => this.animal("donkey")), this.person({ whip: true, hat: "cone" })], 30, 0.95, { lane: 1.0 });
    // 2) 掃墓歸來的轎子隊伍：騎馬的人、挑擔僕人、轎子
    const horse = this.rider(this.animal("horse"), 1.72 - 0.98, "ride", 0, -0.1, { color: 0x2f3d4f, hat: "cap" });
    const sedan = { obj: makeSedan(), len: 6.2, lane: 1.4 };
    this.scene.add(sedan.obj);
    this.rider(sedan, 0, "bear", 0, 2.35, { hat: null }); this.rider(sedan, 0, "bear", 0, -2.35, { hat: null });
    this.addGroup([this.person({ carry: "pole" }), horse, this.person({ carry: "pole" }), sedan, this.person({}), this.person({ carry: "pole" })], 120, 1.0, { lane: -1.2 });
    // 3) 太平車（騾拉）、牛車、獨輪車（城外大街）
    const big = { obj: makeCart("big"), len: 5.5 }; this.scene.add(big.obj); this.rider(big, 0, "walk", 0.9, 1.0);
    this.addGroup([this.animal("mule", { lane: 2.0 }), this.animal("mule", { lane: 2.0 }), { ...big, lane: 2.0 }], L * 0.55, 0.8, { lane: 2.0 });
    const ox = { obj: makeCart("ox"), len: 4 }; this.scene.add(ox.obj);
    this.addGroup([this.person({ pull: false, hat: "cone" }), this.animal("ox"), ox], L * 0.7, 0.7, { lane: -2.2 });
    const bar = { obj: makeBarrow(), len: 2.2 }; this.scene.add(bar.obj); this.rider(bar, 0, "push", 0, -1.7);
    this.addGroup([bar], L * 0.62, 0.9, { lane: 2.6 });
    const bar2 = { obj: makeBarrow(), len: 2.2 }; this.scene.add(bar2.obj); this.rider(bar2, 0, "push", 0, -1.7);
    this.addGroup([bar2], L * 0.4, 1.0, { lane: -2.6 });
    // 4) 駱駝隊穿過城門
    this.addGroup([this.person({ hat: "cap", color: 0x6b4a32 }), this.animal("camel"), this.animal("camel"), this.animal("camel"), this.person({})], L * 0.86, 0.75, { lane: 0.6 });
    // 5) 騎驢、騎馬的路人
    for (const [s, k] of [[L * 0.3, "donkey"], [L * 0.5, "horse"], [L * 0.75, "donkey"], [L * 0.92, "horse"], [L * 0.2, "donkey"]]) {
      const a = this.rider(this.animal(k), k === "horse" ? 0.74 : 0.42, "ride", 0, -0.1, { hat: r() < 0.5 ? "cap" : "cone" });
      this.addGroup([this.person({}), a], s, 1.1, { lane: r() < 0.5 ? 1.8 : -1.8 });
    }
    // 6) 第二頂轎子（城內）
    const sd2 = { obj: makeSedan(), len: 6 }; this.scene.add(sd2.obj);
    this.rider(sd2, 0, "bear", 0, 2.35); this.rider(sd2, 0, "bear", 0, -2.35);
    this.addGroup([this.person({}), sd2, this.person({ carry: "pole" })], L * 0.95, 1.0, { lane: -1 });
  }

  /* ---------- 虹橋上圍觀大船的人 ---------- */
  buildBridgeCrowd() {
    const B = P.bridge, r = this.r;
    this.watchers = [];
    for (let i = 0; i < 34; i++) {
      const side = i < 22 ? -1 : 1;                 // 船從 b<0 那側來
      const a = (r() - 0.5) * 2 * 15;
      const b = side * (3.1 - r() * 0.5);
      const pos = B.toWorld(a, b);
      const p = this.crowd.add({});
      p.x = pos.x; p.z = pos.z; p.y = B.deck(a);
      p.h = Math.atan2(B.tx * side, B.tz * side);
      this.watchers.push({ p, a, side, k: r() });
    }
    // 河岸上看熱鬧的人
    for (let i = 0; i < 14; i++) {
      const s = B.s - 30 + r() * 25, side = r() < 0.5 ? -1 : 1, q = P.river.at(s), o = P.RIVER_HW + 1.5 + r() * 2;
      const p = this.crowd.add({});
      p.x = q.x + q.nx * side * o; p.z = q.z + q.nz * side * o; p.y = P.terrainH(p.x, p.z);
      p.h = Math.atan2(-q.nx * side, -q.nz * side);
      this.watchers.push({ p, bank: true, k: r() });
    }
  }
  updateWatchers(t) {
    const bb = this.big;
    const near = bb ? Math.max(0, 1 - Math.abs(bb.distToBridge) / 40) : 0;
    for (const w of this.watchers) {
      const p = w.p;
      if (near > 0.05 && w.k < 0.85) { anim.cheer(p, t, near * (0.5 + w.k)); p.lean = 0.12 * near; }
      else if (w.k < 0.4) anim.talk(p, t); else anim.stand(p, t);
    }
  }

  /* ---------- 攤販、店家、說書、閒坐的人 ---------- */
  buildIdle() {
    const r = this.r;
    this.idle = [];
    for (const S of P.stalls) {
      const y = S.onBridge !== undefined ? P.bridge.deck(S.onBridge) : P.terrainH(S.x, S.z);
      const p = this.crowd.add({ hat: r() < 0.5 ? "cap" : null });
      const f = S.onBridge !== undefined ? -1 : 1;
      p.x = S.x - Math.sin(S.rot) * 0.2 * f; p.z = S.z - Math.cos(S.rot) * 0.2 * f; p.y = y; p.h = S.rot;
      this.idle.push({ p, a: "sell" });
      // 攤前的客人
      if (r() < 0.6) { const c = this.crowd.add({}); c.x = S.x + Math.sin(S.rot) * 1.7; c.z = S.z + Math.cos(S.rot) * 1.7; c.y = y; c.h = S.rot + Math.PI; this.idle.push({ p: c, a: "talk" }); }
    }
    for (const B of P.buildings) {
      if (!["shop", "two"].includes(B.type) || r() < 0.3) continue;
      const fx = Math.sin(B.rot), fz = Math.cos(B.rot);
      const p = this.crowd.add({ hat: "cap" });
      p.x = B.x + fx * (B.d / 2 + 1.4) + Math.cos(B.rot) * (r() - 0.5) * 4; p.z = B.z + fz * (B.d / 2 + 1.4) - Math.sin(B.rot) * (r() - 0.5) * 4;
      p.y = P.terrainH(p.x, p.z) + 0.45; p.h = B.rot;
      this.idle.push({ p, a: r() < 0.5 ? "talk" : "sell" });
    }
    // 城內十字路口：說書人與聽眾
    const cx = -490 + 9, cz = 22;
    const teller = this.crowd.add({ color: 0x7a3b2e, hat: "cap" }); teller.x = cx; teller.z = cz; teller.y = P.terrainH(cx, cz); teller.h = Math.PI / 2;
    this.idle.push({ p: teller, a: "tell" });
    for (let i = 0; i < 14; i++) { const a = -1.3 + (i / 13) * 2.6, R = 2.6 + (i % 2) * 0.9; const p = this.crowd.add({}); p.x = cx + Math.cos(a) * R; p.z = cz + Math.sin(a) * R; p.y = teller.y; p.h = Math.atan2(cx - p.x, cz - p.z); if (i % 5 === 0) p.scale *= 0.65; this.idle.push({ p, a: i % 4 === 0 ? "laugh" : "stand" }); }
    // 城門口：守門的、算命攤
    for (let i = 0; i < 4; i++) { const p = this.crowd.add({ color: 0x4a4a52, hat: "cap" }); p.x = P.gate.x + P.gate.dx / 2 + 2 + i * 0.8; p.z = P.gate.z + (i % 2 ? 4.5 : -4.5); p.y = P.terrainH(p.x, p.z); p.h = Math.PI / 2 * (i % 2 ? -1 : 1) + Math.PI / 2; this.idle.push({ p, a: "stand" }); }
  }
  updateIdle(t) {
    for (const i of this.idle) {
      const p = i.p;
      if (i.a === "sell") anim.sell(p, t);
      else if (i.a === "talk") anim.talk(p, t);
      else if (i.a === "tell") { anim.talk(p, t); p.armL = -0.9 + Math.sin(t * 1.7) * 0.6; p.sideL = 0.4; p.lean = Math.sin(t * 0.9) * 0.08; }
      else if (i.a === "laugh") { anim.stand(p, t); p.lean = -0.1 + Math.max(0, Math.sin(t * 0.8 + p.ph)) * 0.25; p.bob = Math.max(0, Math.sin(t * 9 + p.ph)) * 0.02; }
      else anim.stand(p, t);
    }
  }

  /* ---------- 船 ---------- */
  boatPeople(g, list) {
    // list: [{x,y,z,h,a}] 船上的人（船的座標），每幀轉成世界座標
    return list.map((o) => ({ ...o, p: this.crowd.add({ hat: o.hat ?? "cone", carry: null }), g }));
  }
  placeBoatPeople(arr, t) {
    const v = new THREE.Vector3();
    for (const o of arr) {
      v.set(o.x, o.y, o.z).applyMatrix4(o.g.matrixWorld);
      const p = o.p; p.x = v.x; p.y = v.y; p.z = v.z; p.h = o.g.rotation.y + (o.h ?? Math.PI / 2);
      p.hidden = !o.g.visible;
      if (o.a === "pole") anim.pole(p, t); else if (o.a === "row") { anim.pole(p, t * 1.4); p.lean = 0.15 + Math.sin(t * 2 + p.ph) * 0.12; } else if (o.a === "cheer") anim.cheer(p, t, o.k ?? 1); else if (o.a === "talk") anim.talk(p, t); else anim.stand(p, t);
    }
  }
  buildBoats() {
    this.moored = [];
    for (const m of P.moorings()) {
      const g = m.kind === "cargo" ? cargo(m.seed) : m.kind === "huafang" ? huafang() : wupeng({ L: 8 + (m.seed % 3) });
      g.position.set(m.x, 0, m.z); g.rotation.y = m.rot;
      this.scene.add(g);
      const ppl = [];
      const r = P.rng(m.seed + 3);
      if (m.kind === "cargo") ppl.push({ x: -4.5, y: 0.85, z: 0.6, a: "row" }, { x: 1.5, y: 0.85, z: -0.5, a: "talk" });
      else ppl.push({ x: -(g.userData.L / 2) + 0.6, y: 0.7, z: 0.3, a: r() < 0.5 ? "row" : "stand" });
      this.moored.push({ g, ph: m.x * 0.13, people: this.boatPeople(g, ppl) });
    }
    // 卸貨：碼頭上扛米袋的苦力在船和岸之間來回
    this.porters = [];
    const cargoBoats = this.moored.filter((m) => m.g.userData.L === 12).slice(0, 5);
    for (const m of cargoBoats) {
      const g = m.g, q = P.river.near(g.position.x, g.position.z), rp = P.river.at(q.s);
      const side = Math.sign((g.position.x - rp.x) * rp.nx + (g.position.z - rp.z) * rp.nz) || 1;
      const a = { x: g.position.x, z: g.position.z };
      const b = { x: rp.x + rp.nx * side * (P.RIVER_HW + 6), z: rp.z + rp.nz * side * (P.RIVER_HW + 6) };
      for (let k = 0; k < 3; k++) {
        const p = this.crowd.add({ carry: "sack", hat: "cone" });
        this.porters.push({ p, a, b, u: k / 3, dir: k % 2 ? 1 : -1 });
      }
    }
    // 河上來往的小船（來回划）
    this.movers = [];
    for (const [s0, s1, lane, sp] of [[60, 420, -6, 1.6], [500, 780, 6, 1.9], [120, 400, 7, 1.3], [480, 760, -5, 1.4]]) {
      const g = wupeng({ L: 8 }); this.scene.add(g);
      const ppl = this.boatPeople(g, [{ x: -3.6, y: 0.7, z: 0.3, a: "row" }, { x: 2.8, y: 0.7, z: 0, a: "stand", hat: "cap" }]);
      this.movers.push({ g, s0, s1, lane, sp, s: s0 + Math.random() * (s1 - s0), dir: 1, people: ppl, head: 0 });
    }
  }
  updateBoats(dt, t) {
    for (const m of this.moored) {
      m.g.position.y = Math.sin(t * 1.2 + m.ph) * 0.04 - 0.03;
      m.g.rotation.x = Math.sin(t * 0.8 + m.ph) * 0.015;
      m.g.updateMatrixWorld();
      this.placeBoatPeople(m.people, t);
    }
    for (const w of this.porters) {
      w.u += dt * 0.07;
      const u = w.u % 2, f = u < 1 ? u : 2 - u;          // 去程扛袋、回程空手
      const x = P.lerp(w.a.x, w.b.x, f), z = P.lerp(w.a.z, w.b.z, f);
      const p = w.p; p.carry = u < 1 ? null : "sack";
      p.x = x; p.z = z; p.y = Math.max(0.9, P.followY(x, z, p.y || 1));
      p.h = Math.atan2((w.b.x - w.a.x) * (u < 1 ? 1 : -1), (w.b.z - w.a.z) * (u < 1 ? 1 : -1));
      anim.walk(p, t, 0.9);
    }
    for (const m of this.movers) {
      m.s += m.dir * m.sp * dt;
      if (m.s > m.s1) { m.s = m.s1; m.dir = -1; }
      if (m.s < m.s0) { m.s = m.s0; m.dir = 1; }
      const q = P.river.at(m.s), lane = m.lane * m.dir;
      const want = Math.atan2(-q.tz * m.dir, q.tx * m.dir);
      m.head += wrapA(want - m.head) * Math.min(1, dt * 0.8);
      m.g.position.set(q.x + q.nx * lane, Math.sin(t * 1.3 + m.s0) * 0.04 - 0.02, q.z + q.nz * lane);
      m.g.rotation.set(0, m.head, Math.sin(t * 1.1) * 0.01, "YXZ");
      m.g.updateMatrixWorld();
      this.placeBoatPeople(m.people, t);
    }
  }

  /* ---------- 大船放桅過虹橋（畫的高潮） ---------- */
  buildBigBoat() {
    const g = makeBigBoat(); this.scene.add(g);
    const line = P.bigBoatLine();
    const u = g.userData;
    const crew = [
      { x: -9.2, y: 1.0, z: 0.4, a: "row" }, { x: -8.4, y: 1.0, z: -0.8, a: "row" },             // 船尾搖櫓
      { x: 4.2, y: 1.0, z: 1.6, a: "pole" }, { x: 5.6, y: 1.0, z: -1.6, a: "pole" }, { x: 7.2, y: 1.0, z: 1.4, a: "pole" },   // 撐篙
      { x: 2.2, y: 1.0, z: 0.9, a: "mast" }, { x: 3.4, y: 1.0, z: -0.9, a: "mast" },              // 拉繩放桅
      { x: -4.0, y: u.cabinTop + 0.45, z: 0.6, a: "roof" }, { x: -2.6, y: u.cabinTop + 0.45, z: -0.6, a: "roof" },   // 艙頂上用竿子頂橋
      { x: 8.8, y: 1.15, z: 0, a: "cheer", h: Math.PI / 2 },                                       // 船頭喊叫
    ];
    const ppl = this.boatPeople(g, crew);
    // 長竿（撐篙、頂橋）
    const poles = crew.map((c) => {
      if (c.a !== "pole" && c.a !== "roof") return null;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, c.a === "roof" ? 7 : 6, 5), mat("bamboo"));
      m.castShadow = true; m.userData.prop = true; g.add(m); return m;
    });
    // 放桅的繩子
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x3a3020 });
    const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const rope = new THREE.Line(ropeGeo, ropeMat); g.add(rope);
    this.big = { g, line, s: 0, speed: 1.7, ppl, poles, crew, rope, mastK: 0, distToBridge: 999, wait: 0 };
    this.big.s = line.near(P.bridge.cx, P.bridge.cz).s - 70;      // 開場就在橋前不遠，正準備放桅
  }
  updateBigBoat(dt, t) {
    const B = this.big, g = B.g, L = B.line, u = g.userData;
    const sBridge = L.near(P.bridge.cx, P.bridge.cz).s;
    B.distToBridge = B.s - sBridge;                      // <0：還沒到橋
    // 靠近橋時放慢，桅杆放倒；過橋後再豎起
    const d = B.distToBridge;
    const target = d > -48 && d < 26 ? 1 : 0;
    B.mastK += P.clamp(target - B.mastK, -dt * 0.09, dt * 0.09);
    const slow = d > -60 && d < -42 && B.mastK < 0.98 ? 0.35 : 1;
    B.s += B.speed * slow * dt;
    if (B.s > L.len - 2) B.s = 2;
    const q = L.at(B.s), q2 = L.at(Math.min(L.len, B.s + 4));
    const h = Math.atan2(-(q2.z - q.z), q2.x - q.x);
    g.position.set(q.x, Math.sin(t * 1.1) * 0.05 - 0.04, q.z);
    g.rotation.set(Math.sin(t * 0.7) * 0.012, h, Math.sin(t * 0.9) * 0.01, "YXZ");
    // 桅杆角度（加一點晃動，像是很多人正在使勁）
    const ease = B.mastK * B.mastK * (3 - 2 * B.mastK);
    u.mast.rotation.z = -u.restAngle * ease + (B.mastK > 0.05 && B.mastK < 0.95 ? Math.sin(t * 3) * 0.015 : 0);
    g.updateMatrixWorld();
    const busy = B.mastK > 0.02 && B.mastK < 0.98, underish = Math.abs(d) < 30;
    for (let i = 0; i < B.crew.length; i++) {
      const c = B.crew[i], o = B.ppl[i];
      o.a = c.a === "mast" ? (busy ? "pull" : "stand") : c.a === "roof" ? (underish ? "pole" : "stand") : c.a === "cheer" ? (underish || busy ? "cheer" : "stand") : c.a;
      if (o.a === "pull") o.a = "pole";
    }
    this.placeBoatPeople(B.ppl, t);
    for (let i = 0; i < B.crew.length; i++) {
      const pm = B.poles[i]; if (!pm) continue;
      const c = B.crew[i], sw = Math.sin(t * 1.4 + B.ppl[i].p.ph);
      if (c.a === "roof") {
        // 頂著橋底的長竿：靠近橋時斜斜往上撐
        pm.visible = underish;
        pm.position.set(c.x + 1.6, c.y + 2.6, c.z);
        pm.rotation.set(0, 0, -0.55 + sw * 0.05);
      } else {
        pm.position.set(c.x - 0.6 + sw * 0.4, c.y - 0.2, c.z + Math.sign(c.z) * 0.9);
        pm.rotation.set(Math.sign(c.z) * 0.35, 0, 0.5 + sw * 0.25);
      }
    }
    // 繩子：桅頂 → 船頭
    const pa = B.rope.geometry.attributes.position;
    const top = new THREE.Vector3(0, 10.5, 0); u.mast.localToWorld(top); g.worldToLocal(top);
    pa.setXYZ(0, top.x, top.y, top.z); pa.setXYZ(1, (top.x + 9.6) / 2, (top.y + 1.2) / 2 - 0.6, 0); pa.setXYZ(2, 9.6, 1.2, 0);
    pa.needsUpdate = true;
  }

  /* ---------- 縴夫拉船 ---------- */
  buildTow() {
    const g = cargo(11); this.scene.add(g);
    const side = (() => { const p = P.river.at(P.bridge.s); return p.nz < 0 ? 1 : -1; })();
    const trackers = [];
    for (let i = 0; i < 5; i++) trackers.push(this.crowd.add({ hat: "cone", color: 0xb8a98a }));
    const ppl = this.boatPeople(g, [{ x: -4.5, y: 0.85, z: 0.5, a: "row" }, { x: 3.6, y: 0.85, z: 0, a: "pole" }]);
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3()));
    const rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a3020 })); rope.frustumCulled = false; this.scene.add(rope);
    this.tow = { g, side, s: 80, trackers, ppl, rope };
  }
  updateTow(dt, t) {
    const T = this.tow, g = T.g;
    T.s += 0.75 * dt;
    if (T.s > P.bridge.s - 70) T.s = 40;
    const q = P.river.at(T.s);
    g.position.set(q.x + q.nx * T.side * 7, Math.sin(t * 1.2) * 0.04 - 0.03, q.z + q.nz * T.side * 7);
    g.rotation.y = Math.atan2(-q.tz, q.tx);
    g.updateMatrixWorld();
    this.placeBoatPeople(T.ppl, t);
    const top = new THREE.Vector3(2.4, 8.4, 0).applyMatrix4(g.matrixWorld);
    const pts = [top];
    for (let i = 0; i < T.trackers.length; i++) {
      const s = T.s + 24 + i * 2.2, r = P.river.at(s), p = T.trackers[i];
      p.x = r.x + r.nx * T.side * (P.RIVER_HW + 6) + (i % 2) * 0.5; p.z = r.z + r.nz * T.side * (P.RIVER_HW + 6);
      p.y = P.terrainH(p.x, p.z); p.h = Math.atan2(r.tx, r.tz);
      anim.pull(p, t + i * 0.7);
      if (i === 0 || i === T.trackers.length - 1) pts.push(new THREE.Vector3(p.x, p.y + 1.35, p.z));
    }
    // 繩子：桅頂 → 縴夫（中間微垂）
    const a = pts[0], b = pts[pts.length - 1], c = pts[1];
    const pa = T.rope.geometry.attributes.position;
    for (let i = 0; i < 4; i++) { const k = i / 3; pa.setXYZ(i, P.lerp(a.x, c.x, k), P.lerp(a.y, c.y, k) - Math.sin(k * Math.PI) * 0.8, P.lerp(a.z, c.z, k)); }
    pa.setXYZ(4, P.lerp(c.x, b.x, 0.5), P.lerp(c.y, b.y, 0.5), P.lerp(c.z, b.z, 0.5)); pa.setXYZ(5, b.x, b.y, b.z);
    pa.needsUpdate = true;
  }

  update(dt, t) {
    this.frame++;
    this.updateWalkers(dt, t);
    for (const a of this.agents) a.update(dt, t);
    this.updateIdle(t);
    this.updateBoats(dt, t);
    this.updateBigBoat(dt, t);
    this.updateWatchers(t);
    this.updateTow(dt, t);
    this.crowd.commit();
  }
  wakes() {
    const out = [];
    const add = (g, speed) => out.push({ x: g.position.x, z: g.position.z, heading: Math.atan2(Math.cos(g.rotation.y), -Math.sin(g.rotation.y)), speed });
    add(this.big.g, this.big.speed);
    add(this.tow.g, 0.75);
    for (const m of this.movers) add(m.g, m.sp);
    return out;
  }
  /** 給測試：所有人目前的位置 */
  snapshot() { return this.crowd.people.map((p) => [p.x, p.y, p.z]); }
}
