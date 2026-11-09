// 浮島工房 — 遊戲邏輯（純計算，不依賴 three.js，可在 Node 測試）
import { HR, APO, RES, RES_ORDER, NODES, ISLANDS, PLOTS, UPGRADES, RECIPES, PLAYER, SLIME, BOSS, HELPER } from "./data.js";

const SQ3 = Math.sqrt(3);
// 六個鄰居方向（axial）與對應的邊法向量（世界 xz）
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export function hexCenter(q, r) { return [HR * SQ3 * (q + r / 2), HR * 1.5 * r]; }
const NORMALS = DIRS.map(([q, r]) => { const [x, z] = hexCenter(q, r); const l = Math.hypot(x, z); return [x / l, z / l]; });
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const emptyRes = () => Object.fromEntries(RES_ORDER.map((k) => [k, 0]));

/* ================= 建立 / 存檔 ================= */
export function createGame(save) {
  const G = {
    t: 0, events: [],
    islands: ISLANDS.map((d, i) => { const [cx, cz] = hexCenter(d.q, d.r); return { ...d, idx: i, cx, cz, unlocked: d.id === "home" }; }),
    paid: {},            // 目標島 id → 已投入的資源
    plots: [], signs: [], nodes: [], slimes: [], boss: null, helpers: [],
    bag: emptyRes(), store: emptyRes(), levels: { axe: 1, pick: 1, sword: 1, bag: 1, hut: 1 },
    factory: { queue: [], t: 0, cur: null },
    bossDefeated: false,
    player: { x: 0, z: -0.2, hp: PLAYER.maxHp, facing: 0, swingT: 0, lastHurt: -99, moving: false, action: null, target: null },
    timers: { deposit: 0, pay: 0, toast: {} },
  };
  G.byId = Object.fromEntries(G.islands.map((i) => [i.id, i]));
  if (save) {
    for (const id of save.unlocked || []) if (G.byId[id]) G.byId[id].unlocked = true;
    Object.assign(G.paid, save.paid || {});
    Object.assign(G.bag, save.bag || {}); Object.assign(G.store, save.store || {});
    Object.assign(G.levels, save.levels || {});
    G.bossDefeated = !!save.bossDefeated;
    if (save.player) Object.assign(G.player, { x: save.player.x, z: save.player.z, hp: save.player.hp ?? PLAYER.maxHp });
  }
  for (const isl of G.islands) {
    for (const pid of isl.plots || []) {
      const P = PLOTS[pid];
      G.plots.push({ id: pid, island: isl.id, x: isl.cx + P.pos[0], z: isl.cz + P.pos[1], r: P.r, cost: P.cost || {}, built: !!P.prebuilt || !!save?.built?.includes(pid), paid: save?.plotPaid?.[pid] || {} });
    }
  }
  for (const isl of G.islands) if (isl.unlocked) populate(G, isl);
  rebuildSigns(G);
  syncHelpers(G);
  if (!walkable(G, G.player.x, G.player.z)) Object.assign(G.player, { x: 0, z: -0.2 });
  return G;
}
export function serialize(G) {
  return {
    v: 1,
    unlocked: G.islands.filter((i) => i.unlocked).map((i) => i.id),
    paid: G.paid, bag: G.bag, store: G.store, levels: G.levels, bossDefeated: G.bossDefeated,
    built: G.plots.filter((p) => p.built).map((p) => p.id),
    plotPaid: Object.fromEntries(G.plots.map((p) => [p.id, p.paid])),
    player: { x: G.player.x, z: G.player.z, hp: G.player.hp },
  };
}

function populate(G, isl) {
  const R = rng(isl.idx * 7919 + 17);
  const avoid = [];
  for (const p of G.plots) if (p.island === isl.id) avoid.push([p.x, p.z, p.r * 0.65 + 0.45]);
  for (const n of NORMALS) avoid.push([isl.cx + n[0] * (APO - 0.95), isl.cz + n[1] * (APO - 0.95), 1.05]);
  avoid.push([isl.cx, isl.cz, isl.plots ? 0.6 : 1.0]);
  for (const [type, count] of Object.entries(isl.nodes || {})) {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 900; tries++) {
        const a = R() * Math.PI * 2, rr = 0.8 + R() * (APO - 1.6);
        const x = isl.cx + Math.cos(a) * rr, z = isl.cz + Math.sin(a) * rr;
        const nr = NODES[type].r, f = tries < 300 ? 1 : tries < 600 ? 0.8 : 0.62; // 擠不下就放寬間距
        if (avoid.some(([ax, az, ar]) => dist(x, z, ax, az) < (ar + nr) * f)) continue;
        avoid.push([x, z, nr + 0.75]);
        G.nodes.push({ type, island: isl.id, x, z, r: nr, hp: NODES[type].hp, alive: true, regrow: 0, shake: 0, id: G.nodes.length });
        break;
      }
    }
  }
  for (let k = 0; k < (isl.slimes || 0); k++) {
    const a = R() * Math.PI * 2, rr = 1 + R() * 2.2;
    const s = { island: isl.id, x: isl.cx + Math.cos(a) * rr, z: isl.cz + Math.sin(a) * rr, hp: SLIME.hp, alive: true, respawn: 0, tx: isl.cx, tz: isl.cz, cd: 0, wander: 0, flash: 0, id: G.slimes.length };
    G.slimes.push(s);
  }
  if (isl.boss) G.boss = { x: isl.cx, z: isl.cz - 0.5, hp: G.bossDefeated ? 0 : BOSS.hp, alive: !G.bossDefeated, atkT: BOSS.every, warns: [], flash: 0, island: isl.id, anim: 0 };
}

function rebuildSigns(G) {
  G.signs = [];
  for (const isl of G.islands) if (isl.unlocked) {
    DIRS.forEach(([dq, dr], k) => {
      const tgt = G.islands.find((o) => o.q === isl.q + dq && o.r === isl.r + dr);
      if (!tgt || tgt.unlocked) return;
      const n = NORMALS[k];
      G.signs.push({ target: tgt.id, from: isl.id, x: isl.cx + n[0] * (APO - 0.95), z: isl.cz + n[1] * (APO - 0.95), dir: k });
    });
  }
}
function syncHelpers(G) {
  const hut = G.plots.find((p) => p.id === "hut");
  const want = hut && hut.built ? G.levels.hut : 0;
  const wh = G.plots.find((p) => p.id === "warehouse");
  while (G.helpers.length < want) G.helpers.push({ x: wh.x + 0.8 + G.helpers.length * 0.6, z: wh.z + 1.1, state: "idle", load: emptyRes(), path: [], repath: 0, id: G.helpers.length });
}

/* ================= 地形 ================= */
export function islandAt(G, x, z) {
  let best = null, bd = 1e9;
  for (const isl of G.islands) { const d = dist(x, z, isl.cx, isl.cz); if (d < bd) { bd = d; best = isl; } }
  return bd <= HR + 0.01 ? best : null;
}
export function walkable(G, x, z, margin = 0.38) {
  for (const isl of G.islands) {
    if (!isl.unlocked) continue;
    const dx = x - isl.cx, dz = z - isl.cz;
    if (Math.abs(dx) > HR + 0.1 || Math.abs(dz) > HR + 0.1) continue;
    let inside = true, ok = true;
    for (let k = 0; k < 6; k++) {
      const p = dx * NORMALS[k][0] + dz * NORMALS[k][1];
      if (p > APO) { inside = false; break; }
      if (p > APO - margin) {
        const [dq, dr] = DIRS[k];
        const nb = G.islands.find((o) => o.q === isl.q + dq && o.r === isl.r + dr);
        if (!nb || !nb.unlocked) ok = false;
      }
    }
    if (inside && ok) return true;
  }
  return false;
}
function islandPath(G, fromIsl, toIsl) {
  if (!fromIsl || !toIsl) return [];
  const prev = new Map([[fromIsl.id, null]]), q = [fromIsl];
  while (q.length) {
    const c = q.shift(); if (c === toIsl) break;
    for (const [dq, dr] of DIRS) { const nb = G.islands.find((o) => o.unlocked && o.q === c.q + dq && o.r === c.r + dr); if (nb && !prev.has(nb.id)) { prev.set(nb.id, c); q.push(nb); } }
  }
  const chain = []; let cur = toIsl; while (cur) { chain.unshift(cur); cur = prev.get(cur.id); }
  const pts = [];
  for (let i = 0; i + 1 < chain.length; i++) pts.push([(chain[i].cx + chain[i + 1].cx) / 2, (chain[i].cz + chain[i + 1].cz) / 2]);
  return pts;
}

/* ================= 資源 ================= */
export const bagCap = (G) => UPGRADES.bag.power[G.levels.bag - 1];
export const bagTotal = (G) => RES_ORDER.reduce((s, k) => s + G.bag[k], 0);
export const have = (G, k) => G.bag[k] + G.store[k];
export function canAfford(G, cost) { return Object.entries(cost).every(([k, n]) => have(G, k) >= n); }
function spend(G, cost) {
  for (const [k, n] of Object.entries(cost)) { const fromStore = Math.min(G.store[k], n); G.store[k] -= fromStore; G.bag[k] -= n - fromStore; }
}
function giveToBag(G, drop, from) {
  let lost = 0;
  for (const [k, n] of Object.entries(drop)) for (let i = 0; i < n; i++) {
    if (bagTotal(G) < bagCap(G)) { G.bag[k]++; G.events.push({ type: "fly", res: k, from, to: "player" }); }
    else { G.store[k]++; lost++; }
  }
  return lost;
}
function toast(G, key, msg, every = 2.5) {
  if ((G.timers.toast[key] ?? -99) + every > G.t) return;
  G.timers.toast[key] = G.t; G.events.push({ type: "toast", msg });
}

/* ================= 玩家指令（介面呼叫） ================= */
export function upgrade(G, key) {
  const U = UPGRADES[key], lv = G.levels[key];
  const cost = U.costs[lv - 1];
  if (!cost) return false;
  if (!canAfford(G, cost)) { toast(G, "afford", "資源不足", 0.5); return false; }
  spend(G, cost); G.levels[key] = lv + 1;
  if (key === "hut") syncHelpers(G);
  G.events.push({ type: "upgrade", key, level: lv + 1 });
  return true;
}
export function enqueue(G, recipeId, n) {
  const R = RECIPES.find((r) => r.id === recipeId);
  let added = 0;
  for (let i = 0; i < n; i++) {
    const need = Object.fromEntries(Object.entries(R.from).map(([k, v]) => [k, v * (G.factory.queue.filter((q) => q === recipeId).length + 1)]));
    if (!canAfford(G, need)) break;
    G.factory.queue.push(recipeId); added++;
  }
  if (!added) toast(G, "afford", "原料不足", 0.5);
  return added;
}
export function nearPlot(G) {
  const p = G.player;
  return G.plots.find((pl) => pl.built && dist(p.x, p.z, pl.x, pl.z) < pl.r + 0.6) || null;
}

/* ================= 主更新 ================= */
export function update(G, dt, mx = 0, mz = 0) {
  G.t += dt;
  const P = G.player;
  const L = Math.hypot(mx, mz);
  if (L > 1) { mx /= L; mz /= L; }
  P.moving = L > 0.08;
  if (P.moving) {
    P.facing = Math.atan2(mx, mz);
    const sp = PLAYER.speed * Math.min(1, L);
    const nx = P.x + mx * sp * dt, nz = P.z + mz * sp * dt;
    if (walkable(G, nx, nz)) { P.x = nx; P.z = nz; }
    else if (walkable(G, nx, P.z)) P.x = nx;
    else if (walkable(G, P.x, nz)) P.z = nz;
  }
  // 推開障礙物（樹、石頭、建築、怪物）
  const push = (cx, cz, r) => { const d = dist(P.x, P.z, cx, cz), m = r + 0.35; if (d < m && d > 1e-6) { const nx = P.x + ((P.x - cx) / d) * (m - d), nz = P.z + ((P.z - cz) / d) * (m - d); if (walkable(G, nx, nz)) { P.x = nx; P.z = nz; } } };
  for (const n of G.nodes) if (n.alive) push(n.x, n.z, n.r * 0.8);
  for (const pl of G.plots) if (pl.built && pl.id !== "factory") push(pl.x, pl.z, pl.id === "warehouse" ? 1.0 : 0.6);
  for (const s of G.slimes) if (s.alive) push(s.x, s.z, 0.35);
  if (G.boss && G.boss.alive) push(G.boss.x, G.boss.z, BOSS.r);

  autoAct(G, dt);
  depositAndPay(G, dt);
  for (const n of G.nodes) { n.shake = Math.max(0, n.shake - dt * 4); if (!n.alive) { n.regrow -= dt; if (n.regrow <= 0) { n.alive = true; n.hp = NODES[n.type].hp; G.events.push({ type: "regrow", node: n }); } } }
  factoryTick(G, dt);
  helpersTick(G, dt);
  slimesTick(G, dt);
  bossTick(G, dt);
  if (G.t - P.lastHurt > PLAYER.regenDelay) P.hp = Math.min(PLAYER.maxHp, P.hp + PLAYER.regen * dt);
  if (P.hp <= 0) {
    const home = G.byId.home;
    Object.assign(P, { x: home.cx, z: home.cz - 0.2, hp: 35, lastHurt: G.t });
    if (G.boss) G.boss.warns = [];
    G.events.push({ type: "death" });
  }
}

function autoAct(G, dt) {
  const P = G.player;
  P.swingT -= dt;
  let target = null, bd = 1e9, kind = null;
  for (const s of G.slimes) if (s.alive) { const d = dist(P.x, P.z, s.x, s.z) - 0.35; if (d < PLAYER.reach + 0.45 && d < bd) { bd = d; target = s; kind = "slime"; } }
  if (G.boss && G.boss.alive) { const d = dist(P.x, P.z, G.boss.x, G.boss.z) - BOSS.r; if (d < PLAYER.reach + 0.5) { target = G.boss; kind = "boss"; bd = d; } }
  if (!target) {
    const full = bagTotal(G) >= bagCap(G);
    for (const n of G.nodes) if (n.alive) {
      const d = dist(P.x, P.z, n.x, n.z) - n.r;
      if (d < PLAYER.reach + 0.4 && d < bd) { bd = d; target = n; kind = "node"; }
    }
    if (target && full) { toast(G, "full", "背包滿了！回主島倉庫卸貨"); target = null; }
    if (target && NODES[target.type].minLevel > G.levels.pick) { toast(G, "minlv", `需要 Lv${NODES[target.type].minLevel} 鎬子（到工匠台升級）`); target = null; }
  }
  P.target = target; P.action = target ? (kind === "node" ? NODES[target.type].tool : "sword") : null;
  if (!target) return;
  if (!P.moving) P.facing = Math.atan2(target.x - P.x, target.z - P.z);
  if (P.swingT > 0) return;
  P.swingT = PLAYER.swing;
  G.events.push({ type: "swing", tool: P.action, x: target.x, z: target.z });
  if (kind === "node") {
    const def = NODES[target.type];
    target.hp -= UPGRADES[def.tool].power[G.levels[def.tool] - 1];
    target.shake = 1;
    G.events.push({ type: "hit", what: target.type, x: target.x, z: target.z });
    if (target.hp <= 0) {
      target.alive = false; target.regrow = def.respawn;
      const lost = giveToBag(G, def.drop, [target.x, target.z]);
      G.events.push({ type: "break", node: target });
      if (lost) toast(G, "full", "背包滿了！多的直接送回倉庫");
    }
  } else {
    const dmg = UPGRADES.sword.power[G.levels.sword - 1];
    target.hp -= dmg; target.flash = 1;
    G.events.push({ type: "hit", what: kind, x: target.x, z: target.z, dmg });
    if (kind === "slime") {
      const d = dist(P.x, P.z, target.x, target.z) || 1;
      target.x += ((target.x - P.x) / d) * 0.45; target.z += ((target.z - P.z) / d) * 0.45;
      if (target.hp <= 0) {
        target.alive = false; target.respawn = SLIME.respawn;
        const drop = { ...SLIME.drop }; if (Math.random() < 0.4) drop.copper = 1;
        giveToBag(G, drop, [target.x, target.z]);
        G.events.push({ type: "slimeDead", x: target.x, z: target.z });
      }
    } else if (target.hp <= 0) {
      target.alive = false; target.warns = []; G.bossDefeated = true;
      giveToBag(G, { core: 1, emerald: 4, ingot: 8 }, [target.x, target.z]);
      G.events.push({ type: "bossDead", x: target.x, z: target.z });
    }
  }
}

function depositAndPay(G, dt) {
  const P = G.player, T = G.timers;
  const wh = G.plots.find((p) => p.id === "warehouse");
  if (dist(P.x, P.z, wh.x, wh.z) < wh.r + 0.4 && bagTotal(G) > 0) {
    T.deposit -= dt;
    while (T.deposit <= 0 && bagTotal(G) > 0) {
      T.deposit += 0.045;
      const k = RES_ORDER.find((r) => G.bag[r] > 0);
      G.bag[k]--; G.store[k]++;
      G.events.push({ type: "fly", res: k, from: "player", to: [wh.x, wh.z] });
    }
  } else T.deposit = 0;

  // 站在建造牌 / 地基上：資源一個一個投進去
  let spot = null;
  for (const s of G.signs) if (dist(P.x, P.z, s.x, s.z) < 1.0) { spot = { kind: "sign", s, cost: G.byId[s.target].cost, paid: (G.paid[s.target] ||= {}) }; break; }
  if (!spot) for (const pl of G.plots) if (!pl.built && G.byId[pl.island].unlocked && dist(P.x, P.z, pl.x, pl.z) < 1.1) { spot = { kind: "plot", pl, cost: pl.cost, paid: pl.paid }; break; }
  G.payingAt = spot;
  if (!spot) { T.pay = 0; return; }
  T.pay -= dt;
  while (T.pay <= 0) {
    T.pay += 0.055;
    const need = Object.entries(spot.cost).find(([k, n]) => (spot.paid[k] || 0) < n && have(G, k) > 0);
    if (!need) {
      const missing = Object.entries(spot.cost).filter(([k, n]) => (spot.paid[k] || 0) < n);
      if (missing.length) toast(G, "missing", "還缺 " + missing.map(([k, n]) => `${RES[k].icon}${n - (spot.paid[k] || 0)}`).join(" "), 3);
      break;
    }
    const k = need[0];
    if (G.bag[k] > 0) G.bag[k]--; else G.store[k]--;
    spot.paid[k] = (spot.paid[k] || 0) + 1;
    const tx = spot.kind === "sign" ? spot.s.x : spot.pl.x, tz = spot.kind === "sign" ? spot.s.z : spot.pl.z;
    G.events.push({ type: "fly", res: k, from: "player", to: [tx, tz] });
    const done = Object.entries(spot.cost).every(([kk, n]) => (spot.paid[kk] || 0) >= n);
    if (done) {
      if (spot.kind === "sign") {
        const isl = G.byId[spot.s.target]; isl.unlocked = true; delete G.paid[isl.id];
        populate(G, isl); rebuildSigns(G);
        G.events.push({ type: "unlock", island: isl });
      } else {
        spot.pl.built = true; syncHelpers(G);
        G.events.push({ type: "build", plot: spot.pl });
      }
      G.payingAt = null;
      break;
    }
  }
}

function factoryTick(G, dt) {
  const F = G.factory;
  const fac = G.plots.find((p) => p.id === "factory");
  if (!fac || !fac.built) return;
  if (!F.cur && F.queue.length) {
    const R = RECIPES.find((r) => r.id === F.queue[0]);
    if (canAfford(G, R.from)) { spend(G, R.from); F.cur = R; F.t = 0; F.queue.shift(); }
    else { F.queue.shift(); }
  }
  if (F.cur) {
    F.t += dt;
    if (F.t >= F.cur.time) {
      for (const [k, n] of Object.entries(F.cur.to)) G.store[k] += n;
      G.events.push({ type: "craft", res: Object.keys(F.cur.to)[0], at: [fac.x, fac.z] });
      F.cur = null;
    }
  }
}

function helpersTick(G, dt) {
  const P = G.player;
  const wh = G.plots.find((p) => p.id === "warehouse");
  const homeSpot = (h) => [wh.x + 0.9 + h.id * 0.6, wh.z + 1.2];
  for (const h of G.helpers) {
    const loadN = RES_ORDER.reduce((s, k) => s + h.load[k], 0);
    let goal = null;
    if (h.state === "idle") {
      const busy = G.helpers.some((o) => o !== h && o.state === "go");
      if (!busy && bagTotal(G) >= Math.min(HELPER.cap, Math.max(4, bagCap(G) * 0.35)) && dist(P.x, P.z, wh.x, wh.z) > 3.2) { h.state = "go"; h.repath = 0; }
      else goal = homeSpot(h);
    }
    if (h.state === "go") {
      goal = [P.x, P.z];
      if (dist(h.x, h.z, P.x, P.z) < 1.15) {
        let n = 0;
        for (const k of RES_ORDER) while (G.bag[k] > 0 && n < HELPER.cap) { G.bag[k]--; h.load[k]++; n++; G.events.push({ type: "fly", res: k, from: "player", to: "helper" + h.id }); }
        h.state = n ? "back" : "idle"; h.repath = 0;
        if (n) G.events.push({ type: "toast", msg: `🤖 小幫手帶走 ${n} 個資源` });
      }
      if (bagTotal(G) === 0) h.state = "back";
    }
    if (h.state === "back") {
      goal = [wh.x, wh.z];
      if (dist(h.x, h.z, wh.x, wh.z) < wh.r + 0.3) {
        for (const k of RES_ORDER) while (h.load[k] > 0) { h.load[k]--; G.store[k]++; G.events.push({ type: "fly", res: k, from: "helper" + h.id, to: [wh.x, wh.z] }); }
        h.state = "idle";
      }
    }
    if (!goal) continue;
    // 沿著島與島之間的邊中點走（避免走進海裡）
    h.repath -= dt;
    if (h.repath <= 0) { h.path = [...islandPath(G, islandAt(G, h.x, h.z), islandAt(G, goal[0], goal[1])), goal]; h.repath = 0.4; }
    else h.path[h.path.length - 1] = goal;
    let wp = h.path[0];
    if (wp && dist(h.x, h.z, wp[0], wp[1]) < 0.25 && h.path.length > 1) { h.path.shift(); wp = h.path[0]; }
    if (!wp) continue;
    const d = dist(h.x, h.z, wp[0], wp[1]);
    h.moving = d > 0.3;
    if (h.moving) { const s = Math.min(d, HELPER.speed * dt); h.x += ((wp[0] - h.x) / d) * s; h.z += ((wp[1] - h.z) / d) * s; h.facing = Math.atan2(wp[0] - h.x, wp[1] - h.z); }
  }
}

function slimesTick(G, dt) {
  const P = G.player;
  const pIsl = islandAt(G, P.x, P.z);
  for (const s of G.slimes) {
    s.flash = Math.max(0, s.flash - dt * 4);
    const isl = G.byId[s.island];
    if (!s.alive) {
      s.respawn -= dt;
      if (s.respawn <= 0) { const a = Math.random() * 6.28; Object.assign(s, { alive: true, hp: SLIME.hp, x: isl.cx + Math.cos(a) * 2, z: isl.cz + Math.sin(a) * 2 }); }
      continue;
    }
    s.cd -= dt; s.wander -= dt;
    let tx = s.tx, tz = s.tz, sp = 0.9;
    const dp = dist(s.x, s.z, P.x, P.z);
    if (pIsl === isl && dp < SLIME.aggro) { tx = P.x; tz = P.z; sp = SLIME.speed; s.angry = true; }
    else {
      s.angry = false;
      if (s.wander <= 0 || dist(s.x, s.z, tx, tz) < 0.3) { const a = Math.random() * 6.28, r = Math.random() * 3; s.tx = isl.cx + Math.cos(a) * r; s.tz = isl.cz + Math.sin(a) * r; s.wander = 2 + Math.random() * 3; }
    }
    const d = dist(s.x, s.z, tx, tz);
    if (d > 0.6) { const st = Math.min(d, sp * dt); const nx = s.x + ((tx - s.x) / d) * st, nz = s.z + ((tz - s.z) / d) * st; if (dist(nx, nz, isl.cx, isl.cz) < APO - 0.7) { s.x = nx; s.z = nz; } }
    if (s.angry && dp < 0.95 && s.cd <= 0) { s.cd = SLIME.cd; hurt(G, SLIME.dmg, s); }
  }
}
function hurt(G, dmg, src) {
  const P = G.player;
  P.hp -= dmg; P.lastHurt = G.t;
  G.events.push({ type: "hurt", dmg, x: P.x, z: P.z });
}

function bossTick(G, dt) {
  const B = G.boss; if (!B) return;
  B.flash = Math.max(0, B.flash - dt * 4); B.anim = Math.max(0, B.anim - dt);
  if (!B.alive) return;
  const P = G.player, isl = G.byId[B.island];
  const onIsland = islandAt(G, P.x, P.z) === isl;
  if (!onIsland) { B.hp = Math.min(BOSS.hp, B.hp + 60 * dt); B.warns = []; B.active = false; return; }
  if (!B.active) { B.active = true; B.atkT = 1.5; G.events.push({ type: "bossWake" }); }
  const d = dist(B.x, B.z, P.x, P.z);
  if (d > 2.6) { const s = Math.min(d - 2.6, 0.9 * dt); const nx = B.x + ((P.x - B.x) / d) * s, nz = B.z + ((P.z - B.z) / d) * s; if (dist(nx, nz, isl.cx, isl.cz) < APO - 1.6) { B.x = nx; B.z = nz; } }
  B.facing = Math.atan2(P.x - B.x, P.z - B.z);
  B.atkT -= dt;
  const enraged = B.hp < BOSS.hp / 2;
  if (B.atkT <= 0) {
    B.atkT = enraged ? BOSS.every * 0.65 : BOSS.every;
    B.anim = 0.6;
    if (Math.random() < 0.5) B.warns.push({ x: P.x, z: P.z, r: BOSS.slamR, t: BOSS.warn, dmg: BOSS.slamDmg, kind: "slam", T: BOSS.warn });
    else {
      const n = enraged ? 5 : 3;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 1 + Math.random() * 2; B.warns.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, r: BOSS.rockR, t: BOSS.warn + i * 0.12, dmg: BOSS.rockDmg, kind: "rock", T: BOSS.warn + i * 0.12 }); }
    }
    G.events.push({ type: "bossAttack" });
  }
  for (const w of B.warns) {
    w.t -= dt;
    if (w.t <= 0 && !w.done) { w.done = true; G.events.push({ type: "boom", x: w.x, z: w.z, r: w.r, kind: w.kind }); if (dist(P.x, P.z, w.x, w.z) < w.r + 0.25) hurt(G, w.dmg, B); }
  }
  B.warns = B.warns.filter((w) => w.t > -0.35);
}
