// 浮島工房 — 遊戲邏輯（純計算，不依賴 three.js，可在 Node 測試）
import { HR, APO, RES, RES_ORDER, NODES, ISLANDS, PLOTS, PORTAL_PAIR, UPGRADES, RECIPES, PLAYER, MOBS, BOSS, BOSS2, BOSS3, HEAT, COLD, FOODS, FOOD_CAP, HELPER, SHEEP, WORKER, RUINS } from "./data.js";

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
    islands: ISLANDS.map((d, i) => { const [cx, cz] = hexCenter(d.q, d.r); return { ...d, w: d.w || 1, idx: i, cx, cz, unlocked: !!d.start }; }),
    paid: {},            // 目標島 id → 已投入的資源
    plots: [], signs: [], nodes: [], slimes: [], lavas: [], warns: [], slicks: [], sheep: [], workers: [], blocks: [], plates: [], ruinsSolved: false, altarLit: false, boss: null, boss2: null, boss3: null, helpers: [], world: 1,
    food: { grill: 0, soup: 0, pie: 0 }, storm: { t: COLD.stormGap, on: false },
    bag: emptyRes(), store: emptyRes(), levels: { axe: 1, pick: 1, sword: 1, bag: 1, boots: 1, coat: 1, stoker: 1, hut: 1 },
    factory: { queue: [], t: 0, cur: null },
    bossDefeated: false, boss2Defeated: false, boss3Defeated: false,
    player: { x: 0, z: -0.2, hp: PLAYER.maxHp, heat: 0, cold: 0, vx: 0, vz: 0, warmT: 0, fastT: 0, slowT: 0, facing: 0, swingT: 0, lastHurt: -99, moving: false, action: null, target: null },
    timers: { deposit: 0, pay: 0, burn: 0, toast: {} },
  };
  G.byId = Object.fromEntries(G.islands.map((i) => [i.id, i]));
  if (save) {
    for (const id of save.unlocked || []) if (G.byId[id]) G.byId[id].unlocked = true;
    Object.assign(G.paid, save.paid || {});
    Object.assign(G.bag, save.bag || {}); Object.assign(G.store, save.store || {});
    Object.assign(G.levels, save.levels || {});
    G.bossDefeated = !!save.bossDefeated; G.boss2Defeated = !!save.boss2Defeated; G.boss3Defeated = !!save.boss3Defeated;
    Object.assign(G.food, save.food || {});
    G.ruinsSolved = !!save.ruinsSolved; G.sheepTame = save.sheepTame || [];
    if (save.player) Object.assign(G.player, { x: save.player.x, z: save.player.z, hp: save.player.hp ?? PLAYER.maxHp, heat: save.player.heat || 0, cold: save.player.cold || 0 });
  }
  for (const isl of G.islands) {
    for (const pid of isl.plots || []) {
      const P = PLOTS[pid];
      G.plots.push({ id: pid, type: P.type || pid, needs: P.needs, w: isl.w, island: isl.id, edge: P.edge, x: isl.cx + plotPos(G, isl, P)[0], z: isl.cz + plotPos(G, isl, P)[1], r: P.r, cost: P.cost || {}, built: !!P.prebuilt || !!save?.built?.includes(pid), paid: save?.plotPaid?.[pid] || {}, eternal: !!P.eternal, fuel: save?.fuel?.[pid] ?? COLD.fuelStart });
    }
  }
  for (const isl of G.islands) if (isl.unlocked) populate(G, isl);
  G.altarLit = G.plots.some((p) => p.type === "altar" && p.built);
  rebuildSigns(G);
  syncHelpers(G);
  syncWorkers(G);
  if (!walkable(G, G.player.x, G.player.z)) Object.assign(G.player, { x: 0, z: -0.2 });
  G.world = islandAt(G, G.player.x, G.player.z)?.w || 1;
  G.player.portalLock = true;
  return G;
}
export function serialize(G) {
  return {
    v: 1,
    unlocked: G.islands.filter((i) => i.unlocked).map((i) => i.id),
    paid: G.paid, bag: G.bag, store: G.store, levels: G.levels, bossDefeated: G.bossDefeated, boss2Defeated: G.boss2Defeated, boss3Defeated: G.boss3Defeated, food: G.food, ruinsSolved: G.ruinsSolved, sheepTame: G.sheep.map((sh) => sh.tame),
    fuel: Object.fromEntries(G.plots.filter((p) => p.type === "fire" && p.built && !p.eternal).map((p) => [p.id, Math.round(p.fuel)])),
    built: G.plots.filter((p) => p.built).map((p) => p.id),
    plotPaid: Object.fromEntries(G.plots.map((p) => [p.id, p.paid])),
    player: { x: G.player.x, z: G.player.z, hp: G.player.hp, heat: G.player.heat, cold: G.player.cold },
  };
}

// 橋蓋在通往目標地塊的那條邊上
function plotPos(G, isl, P) {
  if (!P.edge) return P.pos;
  const t = G.byId[P.edge], dx = t.cx - isl.cx, dz = t.cz - isl.cz, l = Math.hypot(dx, dz);
  return [(dx / l) * (APO - 0.85), (dz / l) * (APO - 0.85)];
}
// 兩座相鄰地塊之間走不走得過去（有些邊要先蓋橋）
export function linked(G, a, b) {
  const br = G.plots.find((p) => p.edge && ((p.island === a.id && p.edge === b.id) || (p.island === b.id && p.edge === a.id)));
  return !br || br.built;
}
function syncWorkers(G) {
  for (const pl of G.plots) if (pl.type === "gather" && pl.built && !G.workers.some((w) => w.plot === pl)) G.workers.push({ plot: pl, x: pl.x + 0.7, z: pl.z + 0.5, node: null, t: 0, id: G.workers.length });
}
function populate(G, isl) {
  const R = rng(isl.idx * 7919 + 17);
  const avoid = [];
  for (const p of G.plots) if (p.island === isl.id) avoid.push([p.x, p.z, p.type === "portal" ? 1.9 : p.r * 0.65 + 0.45]);
  for (const n of NORMALS) avoid.push([isl.cx + n[0] * (APO - 0.95), isl.cz + n[1] * (APO - 0.95), 1.05]);
  avoid.push([isl.cx, isl.cz, isl.plots ? 0.6 : 1.0]);
  if (isl.id === "ruins") {
    for (const [x, z] of RUINS.plates) { avoid.push([isl.cx + x, isl.cz + z, 0.75]); G.plates.push({ x: isl.cx + x, z: isl.cz + z }); }
    for (const [x, z] of RUINS.blocks) { avoid.push([isl.cx + x, isl.cz + z, 0.6]); G.blocks.push({ x: isl.cx + x, z: isl.cz + z, r: RUINS.blockR }); }
    avoid.push([isl.cx + RUINS.chest[0], isl.cz + RUINS.chest[1], 0.8]);
    if (G.ruinsSolved) G.blocks.forEach((b, i) => { b.x = G.plates[i].x; b.z = G.plates[i].z; b.locked = true; G.plates[i].on = true; });
  }
  for (let k = 0; k < (isl.sheep || 0); k++) {
    const a = k * 2.1 + 0.4;
    G.sheep.push({ island: isl.id, x: isl.cx + Math.cos(a) * 1.3, z: isl.cz + Math.sin(a) * 1.3, tx: isl.cx, tz: isl.cz, wander: 0, tame: !!G.sheepTame?.[k], fed: 0, wool: 0, t: 0, id: G.sheep.length });
  }
  for (const [type, count] of Object.entries(isl.nodes || {})) {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 900; tries++) {
        const a = R() * Math.PI * 2, rr = 0.8 + R() * (APO - 1.6);
        const x = isl.cx + Math.cos(a) * rr, z = isl.cz + Math.sin(a) * rr;
        const nr = NODES[type].r, f = tries < 300 ? 1 : tries < 600 ? 0.8 : 0.62; // 擠不下就放寬間距
        if (avoid.some(([ax, az, ar]) => dist(x, z, ax, az) < (ar + nr) * f)) continue;
        avoid.push([x, z, nr + 0.75]);
        G.nodes.push({ type, island: isl.id, x, z, r: nr, hp: NODES[type].hp, given: 0, alive: true, regrow: 0, shake: 0, id: G.nodes.length });
        break;
      }
    }
  }
  // 熔岩裂縫（踩上去會燙傷）
  for (let k = 0; k < (isl.lava || 0); k++) {
    for (let tries = 0; tries < 400; tries++) {
      const a = R() * Math.PI * 2, rr = 0.7 + R() * (APO - 1.5);
      const x = isl.cx + Math.cos(a) * rr, z = isl.cz + Math.sin(a) * rr;
      if (avoid.some(([ax, az, ar]) => dist(x, z, ax, az) < ar * (tries < 200 ? 0.6 : 0.4) + HEAT.lavaR)) continue;
      avoid.push([x, z, HEAT.lavaR + 0.5]);
      G.lavas.push({ island: isl.id, x, z, r: HEAT.lavaR });
      break;
    }
  }
  const mobs = isl.mobs || (isl.slimes ? { slime: isl.slimes } : {});
  for (const [kind, count] of Object.entries(mobs)) for (let k = 0; k < count; k++) {
    const a = R() * Math.PI * 2, rr = 0.8 + R() * 1.6;
    G.slimes.push({ kind, island: isl.id, x: isl.cx + Math.cos(a) * rr, z: isl.cz + Math.sin(a) * rr, hp: MOBS[kind].hp, alive: true, respawn: 0, tx: isl.cx, tz: isl.cz, cd: 1 + R(), wander: 0, flash: 0, id: G.slimes.length });
  }
  if (isl.boss) G.boss = { x: isl.cx, z: isl.cz - 0.5, hp: G.bossDefeated ? 0 : BOSS.hp, alive: !G.bossDefeated, atkT: BOSS.every, warns: [], flash: 0, island: isl.id, anim: 0 };
  if (isl.boss3) G.boss3 = { x: isl.cx, z: isl.cz - 0.6, hp: G.boss3Defeated ? 0 : BOSS3.hp, alive: !G.boss3Defeated, atk: 2, slick: 4, blink: BOSS3.blink, phase: 1, flash: 0, island: isl.id, active: false };
  if (isl.boss2) G.boss2 = { x: isl.cx, z: isl.cz, hp: G.boss2Defeated ? 0 : BOSS2.hp, alive: !G.boss2Defeated, state: "up", st: BOSS2.up, spit: 1, flash: 0, island: isl.id, active: false };
}

function rebuildSigns(G) {
  G.signs = [];
  for (const isl of G.islands) if (isl.unlocked) {
    DIRS.forEach(([dq, dr], k) => {
      const tgt = G.islands.find((o) => o.q === isl.q + dq && o.r === isl.r + dr);
      if (!tgt || tgt.unlocked || (tgt.needs && !G[tgt.needs])) return;
      const n = NORMALS[k];
      G.signs.push({ target: tgt.id, from: isl.id, x: isl.cx + n[0] * (APO - 0.95), z: isl.cz + n[1] * (APO - 0.95), dir: k });
    });
  }
}
function syncHelpers(G) {
  const hut = G.plots.find((p) => p.id === "hut");
  const want = hut && hut.built ? G.levels.hut : 0;
  const wh = homeWarehouse(G);
  while (G.helpers.length < want) G.helpers.push({ x: wh.x + 0.8 + G.helpers.length * 0.6, z: wh.z + 1.1, state: "idle", load: emptyRes(), path: [], repath: 0, id: G.helpers.length });
}

const homeWarehouse = (G) => G.plots.find((p) => p.type === "warehouse" && p.w === G.world) || G.plots.find((p) => p.id === "warehouse");
export const plotAvailable = (G, pl) => G.byId[pl.island].unlocked && (!pl.needs || !!G[pl.needs]) && (!pl.edge || G.byId[pl.edge].unlocked);

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
        if (!nb || !nb.unlocked || !linked(G, isl, nb)) ok = false;
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
    for (const [dq, dr] of DIRS) { const nb = G.islands.find((o) => o.unlocked && o.q === c.q + dq && o.r === c.r + dr); if (nb && !prev.has(nb.id) && linked(G, c, nb)) { prev.set(nb.id, c); q.push(nb); } }
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
  return G.plots.find((pl) => pl.built && pl.type !== "portal" && pl.type !== "well" && !["fire", "gather", "bridge", "altar"].includes(pl.type) && dist(p.x, p.z, pl.x, pl.z) < pl.r + 0.6) || null;
}

/* ================= 主更新 ================= */
export function update(G, dt, mx = 0, mz = 0) {
  G.t += dt;
  const P = G.player;
  const L = Math.hypot(mx, mz);
  if (L > 1) { mx /= L; mz /= L; }
  P.moving = L > 0.08;
  if (P.moving) P.facing = Math.atan2(mx, mz);
  P.speedMul = (G.t < P.fastT ? 1.35 : 1) * (G.t < P.slowT ? 0.6 : 1) * (P.cold >= COLD.max ? 0.55 : P.cold >= COLD.slowAt ? 0.78 : 1);
  const sp = PLAYER.speed * Math.min(1, L) * P.speedMul;
  const wantX = P.moving ? mx * sp : 0, wantZ = P.moving ? mz * sp : 0;
  P.onSlick = G.slicks.some((k) => dist(P.x, P.z, k.x, k.z) < k.r);
  if (P.onSlick) { const k = Math.min(1, dt * 1.6); P.vx += (wantX * 1.15 - P.vx) * k; P.vz += (wantZ * 1.15 - P.vz) * k; } // 滑冰：有慣性，不好轉彎
  else { P.vx = wantX; P.vz = wantZ; }
  if (Math.abs(P.vx) + Math.abs(P.vz) > 1e-3) {
    const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
    if (walkable(G, nx, nz)) { P.x = nx; P.z = nz; }
    else if (walkable(G, nx, P.z)) { P.x = nx; P.vz = 0; }
    else if (walkable(G, P.x, nz)) { P.z = nz; P.vx = 0; }
    else { P.vx = P.vz = 0; }
  }
  // 推開障礙物（樹、石頭、建築、怪物）
  const push = (cx, cz, r) => { const d = dist(P.x, P.z, cx, cz), m = r + 0.35; if (d < m && d > 1e-6) { const nx = P.x + ((P.x - cx) / d) * (m - d), nz = P.z + ((P.z - cz) / d) * (m - d); if (walkable(G, nx, nz)) { P.x = nx; P.z = nz; } } };
  for (const n of G.nodes) if (n.alive) push(n.x, n.z, n.r * 0.8);
  for (const pl of G.plots) if (pl.built && pl.type !== "factory" && pl.type !== "portal" && pl.type !== "bridge") push(pl.x, pl.z, pl.type === "warehouse" ? 1.0 : pl.type === "furnace" ? 0.8 : pl.type === "fire" ? 0.25 : 0.6);
  // 怪物跟主角重疊時，退開的是怪物（不然跑得快的怪會把主角一路推走）
  for (const s of G.slimes) if (s.alive) { const d = dist(P.x, P.z, s.x, s.z), m = 0.7; if (d < m && d > 1e-6) { s.x += ((s.x - P.x) / d) * (m - d); s.z += ((s.z - P.z) / d) * (m - d); } }
  if (G.boss && G.boss.alive) push(G.boss.x, G.boss.z, BOSS.r);
  if (G.boss2 && G.boss2.alive && G.boss2.state === "up") push(G.boss2.x, G.boss2.z, BOSS2.r);
  if (G.boss3 && G.boss3.alive) push(G.boss3.x, G.boss3.z, BOSS3.r);
  G.world = islandAt(G, P.x, P.z)?.w || G.world;
  portalTick(G, dt);

  autoAct(G, dt);
  depositAndPay(G, dt);
  for (const n of G.nodes) { n.shake = Math.max(0, n.shake - dt * 4); if (!n.alive) { n.regrow -= dt; if (n.regrow <= 0) { n.alive = true; n.hp = NODES[n.type].hp; n.given = 0; G.events.push({ type: "regrow", node: n }); } } }
  factoryTick(G, dt);
  helpersTick(G, dt);
  slimesTick(G, dt);
  bossTick(G, dt);
  wormTick(G, dt);
  queenTick(G, dt);
  blocksTick(G);
  sheepTick(G, dt);
  workersTick(G, dt);
  warnsTick(G, G.warns, dt);
  G.warns = G.warns.filter((w) => w.t > -0.35);
  heatTick(G, dt);
  coldTick(G, dt);
  if (G.t - P.lastHurt > PLAYER.regenDelay) P.hp = Math.min(PLAYER.maxHp, P.hp + PLAYER.regen * dt);
  if (P.hp <= 0) {
    const home = G.world === 3 ? G.byId.camp : G.world === 2 ? G.byId.oasis : G.byId.home;
    Object.assign(P, { x: home.cx, z: home.cz - 0.2, hp: 35, heat: 0, cold: 0, vx: 0, vz: 0, lastHurt: G.t });
    G.slicks = [];
    if (G.boss) G.boss.warns = [];
    G.warns = [];
    G.events.push({ type: "death" });
  }
}

function autoAct(G, dt) {
  const P = G.player;
  P.swingT -= dt;
  let target = null, bd = 1e9, kind = null;
  for (const s of G.slimes) if (s.alive) { const d = dist(P.x, P.z, s.x, s.z) - 0.35; if (d < PLAYER.reach + 0.45 && d < bd) { bd = d; target = s; kind = "slime"; } }
  if (G.boss2 && G.boss2.alive && G.boss2.state === "up") { const d = dist(P.x, P.z, G.boss2.x, G.boss2.z) - BOSS2.r; if (d < PLAYER.reach + 0.5) { target = G.boss2; kind = "boss2"; bd = d; } }
  if (G.boss && G.boss.alive) { const d = dist(P.x, P.z, G.boss.x, G.boss.z) - BOSS.r; if (d < PLAYER.reach + 0.5) { target = G.boss; kind = "boss"; bd = d; } }
  if (G.boss3 && G.boss3.alive && G.boss3.active) { const d = dist(P.x, P.z, G.boss3.x, G.boss3.z) - BOSS3.r; if (d < PLAYER.reach + 0.5 && (kind !== "slime" || d < bd)) { target = G.boss3; kind = "boss3"; bd = d; } }
  if (!target) {
    const full = bagTotal(G) >= bagCap(G);
    for (const n of G.nodes) if (n.alive) {
      const d = dist(P.x, P.z, n.x, n.z) - n.r;
      if (d < PLAYER.reach + 0.4 && d < bd) { bd = d; target = n; kind = "node"; }
    }
    if (target && full) { toast(G, "full", "背包滿了！回倉庫卸貨"); target = null; }
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
    target.hp -= UPGRADES[def.tool] ? UPGRADES[def.tool].power[G.levels[def.tool] - 1] : 1;
    target.shake = 1;
    G.events.push({ type: "hit", what: target.type, x: target.x, z: target.z });
    let lost = 0;
    if (def.per) { // 邊砍邊掉：每累積 per 點傷害掉一份
      const due = Math.floor((def.hp - Math.max(0, target.hp)) / def.per + 1e-6);
      for (; (target.given || 0) < due; target.given = (target.given || 0) + 1) lost += giveToBag(G, def.drop, [target.x, target.z]);
    }
    if (target.hp <= 0) {
      target.alive = false; target.regrow = def.respawn;
      if (!def.per) lost += giveToBag(G, def.drop, [target.x, target.z]);
      for (const [k, chance] of Object.entries(def.bonus || {})) if (Math.random() < chance) { lost += giveToBag(G, { [k]: 1 }, [target.x, target.z]); G.events.push({ type: "toast", msg: `✨ 釣到 ${RES[k].icon}${RES[k].name}！` }); }
      G.events.push({ type: "break", node: target });
    }
    if (lost) toast(G, "full", "背包滿了！多的直接送回倉庫");
  } else {
    const dmg = UPGRADES.sword.power[G.levels.sword - 1];
    target.hp -= dmg; target.flash = 1;
    G.events.push({ type: "hit", what: kind === "slime" ? target.kind : kind, x: target.x, z: target.z, dmg });
    if (kind === "slime") {
      const d = dist(P.x, P.z, target.x, target.z) || 1;
      target.x += ((target.x - P.x) / d) * 0.45; target.z += ((target.z - P.z) / d) * 0.45;
      if (target.hp <= 0) {
        const def = MOBS[target.kind];
        target.alive = false; target.respawn = def.respawn;
        const drop = { ...def.drop }; if (target.kind === "slime" && Math.random() < 0.4) drop.copper = 1;
        for (const [k, chance] of Object.entries(def.bonus || {})) if (Math.random() < chance) drop[k] = 1;
        giveToBag(G, drop, [target.x, target.z]);
        G.events.push({ type: "slimeDead", kind: target.kind, x: target.x, z: target.z });
      }
    } else if (kind === "boss3") {
      if (target.hp <= 0) {
        target.alive = false; G.boss3Defeated = true; G.warns = []; G.slicks = [];
        for (const m of G.slimes) if (m.temp) m.alive = false;
        giveToBag(G, { frost: 1, silverbar: 8, shard: 4 }, [target.x, target.z]);
        G.events.push({ type: "boss3Dead", x: target.x, z: target.z });
      }
    } else if (kind === "boss2") {
      if (target.hp <= 0) {
        target.alive = false; G.boss2Defeated = true; G.warns = [];
        giveToBag(G, { magma: 1, ruby: 4, steel: 8 }, [target.x, target.z]);
        G.events.push({ type: "boss2Dead", x: target.x, z: target.z });
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
  const wh = homeWarehouse(G);
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
  for (const s of G.signs) if (dist(P.x, P.z, s.x, s.z) < 0.8) { spot = { kind: "sign", s, cost: G.byId[s.target].cost, paid: (G.paid[s.target] ||= {}) }; break; }
  if (!spot) for (const pl of G.plots) if (!pl.built && plotAvailable(G, pl) && dist(P.x, P.z, pl.x, pl.z) < 0.9) { spot = { kind: "plot", pl, cost: pl.cost, paid: pl.paid }; break; }
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
        spot.pl.built = true; syncHelpers(G); syncWorkers(G);
        if (spot.pl.type === "altar") { G.altarLit = true; rebuildSigns(G); G.events.push({ type: "altarLit" }); }
        G.events.push({ type: "build", plot: spot.pl });
      }
      G.payingAt = null;
      break;
    }
  }
}

function factoryTick(G, dt) {
  const F = G.factory;
  const built = (type) => G.plots.find((p) => p.type === type && p.built);
  if (!F.cur && F.queue.length) {
    const R = RECIPES.find((r) => r.id === F.queue[0]);
    if (built(R.at) && canAfford(G, R.from)) { spend(G, R.from); F.cur = R; F.t = 0; }
    F.queue.shift();
  }
  if (F.cur) {
    F.t += dt;
    if (F.t >= F.cur.time) {
      const at = built(F.cur.at);
      for (const [k, n] of Object.entries(F.cur.to)) G.store[k] += n;
      G.events.push({ type: "craft", res: Object.keys(F.cur.to)[0], at: [at.x, at.z] });
      F.cur = null;
    }
  }
}

function helpersTick(G, dt) {
  const P = G.player;
  const wh = homeWarehouse(G);
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
    const def = MOBS[s.kind || "slime"];
    s.flash = Math.max(0, s.flash - dt * 4);
    const isl = G.byId[s.island];
    if (!s.alive) {
      if (s.temp) continue;
      s.respawn -= dt;
      if (s.respawn <= 0) { const a = Math.random() * 6.28; Object.assign(s, { alive: true, hp: def.hp, x: isl.cx + Math.cos(a) * 2, z: isl.cz + Math.sin(a) * 2 }); }
      continue;
    }
    s.cd -= dt; s.wander -= dt;
    let tx = s.tx, tz = s.tz, sp = 0.9, stop = 0.6;
    const dp = dist(s.x, s.z, P.x, P.z);
    if (pIsl === isl && dp < def.aggro) {
      if (!s.angry && def.ranged) s.cd = Math.max(s.cd, 0.4 + Math.random() * def.cd); // 剛發現主角時錯開出手時間，不會好幾隻同時吐
      s.angry = true; sp = def.speed;
      if (def.ranged) { // 保持距離：太近就後退，太遠才靠近
        const keep = def.ranged.keep;
        if (dp < keep - 0.5) { tx = s.x + (s.x - P.x); tz = s.z + (s.z - P.z); stop = 0; }
        else if (dp > keep + 0.7) { tx = P.x; tz = P.z; }
        else { tx = s.x; tz = s.z; }
        if (s.cd <= 0) { s.cd = def.cd; G.warns.push({ x: P.x, z: P.z, r: def.ranged.r, t: def.ranged.warn, T: def.ranged.warn, dmg: def.ranged.dmg, slow: def.ranged.slow, kind: def.ranged.slow ? "ice" : "fire" }); G.events.push({ type: "spit", x: s.x, z: s.z }); }
      } else { tx = P.x; tz = P.z; }
    } else {
      s.angry = false;
      if (s.wander <= 0 || dist(s.x, s.z, tx, tz) < 0.3) { const a = Math.random() * 6.28, r = Math.random() * 3; s.tx = isl.cx + Math.cos(a) * r; s.tz = isl.cz + Math.sin(a) * r; s.wander = 2 + Math.random() * 3; }
    }
    const d = dist(s.x, s.z, tx, tz);
    if (d > stop && d > 1e-3) { const st = Math.min(d, sp * dt); const nx = s.x + ((tx - s.x) / d) * st, nz = s.z + ((tz - s.z) / d) * st; if (dist(nx, nz, isl.cx, isl.cz) < APO - 0.7) { s.x = nx; s.z = nz; } }
    if (s.angry && def.dmg && dp < 0.95 && s.cd <= 0) { s.cd = def.cd; hurt(G, def.dmg, s); }
  }
}
function hurt(G, dmg) {
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
  if (d > 2.2) { const s = Math.min(d - 2.2, 0.9 * dt); const nx = B.x + ((P.x - B.x) / d) * s, nz = B.z + ((P.z - B.z) / d) * s; if (dist(nx, nz, isl.cx, isl.cz) < APO - 1.6) { B.x = nx; B.z = nz; } }
  B.facing = Math.atan2(P.x - B.x, P.z - B.z);
  B.atkT -= dt;
  const enraged = B.hp < BOSS.hp / 2;
  if (B.atkT <= 0) {
    B.atkT = enraged ? BOSS.every * 0.65 : BOSS.every;
    B.anim = 0.6;
    if (Math.random() < 0.5) B.warns.push({ x: P.x, z: P.z, r: BOSS.slamR, t: BOSS.warn, dmg: BOSS.slamDmg, kind: "slam", T: BOSS.warn });
    else {
      const n = enraged ? 5 : 3;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 0.9 + Math.random() * 1.5; B.warns.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, r: BOSS.rockR, t: BOSS.warn + i * 0.12, dmg: BOSS.rockDmg, kind: "rock", T: BOSS.warn + i * 0.12 }); }
    }
    G.events.push({ type: "bossAttack" });
  }
  warnsTick(G, B.warns, dt);
  B.warns = B.warns.filter((w) => w.t > -0.35);
}
// 紅圈預告：倒數到 0 時，站在圈裡就受傷
function warnsTick(G, list, dt) {
  const P = G.player;
  for (const w of list) {
    w.t -= dt;
    if (w.t <= 0 && !w.done) { w.done = true; G.events.push({ type: "boom", x: w.x, z: w.z, r: w.r, kind: w.kind }); if (dist(P.x, P.z, w.x, w.z) < w.r + 0.25) { hurt(G, w.dmg); if (w.slow) P.slowT = G.t + w.slow; } }
  }
}

function wormTick(G, dt) {
  const B = G.boss2; if (!B) return;
  B.flash = Math.max(0, B.flash - dt * 4);
  if (!B.alive) return;
  const P = G.player, isl = G.byId[B.island];
  if (islandAt(G, P.x, P.z) !== isl) { B.hp = Math.min(BOSS2.hp, B.hp + 120 * dt); B.active = false; B.state = "up"; B.st = BOSS2.up; B.x = isl.cx; B.z = isl.cz; return; }
  if (!B.active) { B.active = true; B.st = BOSS2.up; B.spit = 1.2; G.events.push({ type: "bossWake2" }); }
  const enraged = B.hp < BOSS2.hp / 2;
  B.enraged = enraged;
  B.st -= dt;
  if (B.state === "up") {
    B.facing = Math.atan2(P.x - B.x, P.z - B.z);
    B.spit -= dt;
    if (B.spit <= 0) {
      B.spit = BOSS2.spitEvery;
      for (let i = 0; i < (enraged ? 3 : 2); i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 0.8 + Math.random() * 1.2; G.warns.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, r: BOSS2.spitR, t: BOSS2.spitWarn + i * 0.15, T: BOSS2.spitWarn + i * 0.15, dmg: BOSS2.spitDmg, kind: "fire" }); }
      G.events.push({ type: "spit", x: B.x, z: B.z });
    }
    if (B.st <= 0) { // 鑽進地下，瞄準主角現在的位置
      B.state = "under"; B.st = enraged ? BOSS2.under * 0.75 : BOSS2.under;
      let ex = P.x, ez = P.z; const d = dist(ex, ez, isl.cx, isl.cz), lim = APO - 1.2;
      if (d > lim) { ex = isl.cx + ((ex - isl.cx) / d) * lim; ez = isl.cz + ((ez - isl.cz) / d) * lim; }
      B.ex = ex; B.ez = ez;
      G.warns.push({ x: ex, z: ez, r: BOSS2.emergeR, t: B.st, T: B.st, dmg: BOSS2.emergeDmg, kind: "emerge" });
      G.events.push({ type: "burrow", x: B.x, z: B.z });
    }
  } else if (B.st <= 0) {
    B.x = B.ex; B.z = B.ez; B.state = "up"; B.st = enraged ? BOSS2.up * 0.8 : BOSS2.up; B.spit = 0.9;
    G.events.push({ type: "emerge", x: B.x, z: B.z });
  }
  // 半血後：場地外圈冒出熔岩
  if (enraged && dist(P.x, P.z, isl.cx, isl.cz) > APO - BOSS2.ringIn) scald(G, BOSS2.ringDmg * dt, 20 * dt);
}

function queenTick(G, dt) {
  const B = G.boss3; if (!B) return;
  B.flash = Math.max(0, B.flash - dt * 4);
  if (!B.alive) return;
  const P = G.player, isl = G.byId[B.island];
  if (islandAt(G, P.x, P.z) !== isl) {
    B.hp = Math.min(BOSS3.hp, B.hp + 200 * dt); B.active = false; B.phase = 1; B.summoned = false; G.slicks = [];
    for (const m of G.slimes) if (m.temp) m.alive = false;
    return;
  }
  if (!B.active) { B.active = true; B.atk = 2; G.events.push({ type: "bossWake3" }); }
  const phase = B.hp > BOSS3.hp * 0.66 ? 1 : B.hp > BOSS3.hp * 0.33 ? 2 : 3;
  if (phase !== B.phase) { B.phase = phase; G.events.push({ type: "bossPhase", phase }); }
  const d = dist(B.x, B.z, P.x, P.z);
  if (d > 2.4) { const s = Math.min(d - 2.4, 1.2 * dt); const nx = B.x + ((P.x - B.x) / d) * s, nz = B.z + ((P.z - B.z) / d) * s; if (dist(nx, nz, isl.cx, isl.cz) < APO - 1.0) { B.x = nx; B.z = nz; } }
  B.facing = Math.atan2(P.x - B.x, P.z - B.z);
  B.atk -= dt; B.slick -= dt; B.blink -= dt;
  if (B.atk <= 0) { // 冰柱
    B.atk = phase === 3 ? BOSS3.every * 0.8 : BOSS3.every;
    for (let i = 0; i < 1 + phase; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 0.9 + Math.random() * 1.4; G.warns.push({ x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r, r: BOSS3.icR, t: BOSS3.icWarn + i * 0.14, T: BOSS3.icWarn + i * 0.14, dmg: BOSS3.icDmg, slow: 1.2, kind: "ice" }); }
    G.events.push({ type: "bossAttack" });
  }
  if (phase >= 2 && B.slick <= 0) { // 把主角腳下凍成滑冰
    B.slick = BOSS3.slickEvery;
    G.slicks.push({ x: P.x, z: P.z, r: BOSS3.slickR, ttl: BOSS3.slickTtl });
    if (G.slicks.length > 3) G.slicks.shift();
    G.events.push({ type: "slick", x: P.x, z: P.z });
  }
  if (B.blink <= 0) { // 瞬移
    B.blink = BOSS3.blink;
    const a = Math.random() * 6.28, r = Math.random() * (APO - 1.6);
    G.events.push({ type: "blink", x: B.x, z: B.z });
    B.x = isl.cx + Math.cos(a) * r; B.z = isl.cz + Math.sin(a) * r;
  }
  if (phase === 3 && !B.summoned) { // 召喚雪狼
    B.summoned = true;
    for (let i = 0; i < 2; i++) { const a = i * Math.PI + 0.5; G.slimes.push({ kind: "wolf", temp: true, island: isl.id, x: isl.cx + Math.cos(a) * 2.2, z: isl.cz + Math.sin(a) * 2.2, hp: MOBS.wolf.hp, alive: true, respawn: 0, tx: isl.cx, tz: isl.cz, cd: 1, wander: 0, flash: 0, id: G.slimes.length }); }
    G.events.push({ type: "summon" });
  }
  for (const k of G.slicks) k.ttl -= dt;
  G.slicks = G.slicks.filter((k) => k.ttl > 0);
}

/* ================= 遺跡冰塊 / 雪羊 / 採集工人 ================= */
function blocksTick(G) {
  if (!G.blocks.length || G.ruinsSolved) return;
  const P = G.player, isl = G.byId.ruins;
  if (islandAt(G, P.x, P.z) !== isl) { // 離開遺跡：還沒卡進壓力板的冰塊回到原位
    G.blocks.forEach((b, i) => { if (!b.locked) { b.x = isl.cx + RUINS.blocks[i][0]; b.z = isl.cz + RUINS.blocks[i][1]; } });
    return;
  }
  const lim = APO - 1.05;
  for (const b of G.blocks) {
    if (b.locked) { const d0 = dist(P.x, P.z, b.x, b.z), m0 = b.r + 0.33; if (d0 < m0 && d0 > 1e-6) { const px = P.x + ((P.x - b.x) / d0) * (m0 - d0), pz = P.z + ((P.z - b.z) / d0) * (m0 - d0); if (walkable(G, px, pz)) { P.x = px; P.z = pz; } } continue; }
    const d = dist(P.x, P.z, b.x, b.z), m = b.r + 0.33;
    if (d >= m || d < 1e-6) continue;
    let nx = (b.x - P.x) / d, nz = (b.z - P.z) / d;
    // 輔助：大致朝著某個空壓力板推的時候，冰塊會稍微往板子的方向修正
    let best = null, bdot = 0.6;
    for (const q of G.plates) if (!q.on) { const l = dist(b.x, b.z, q.x, q.z) || 1, dt = ((q.x - b.x) / l) * nx + ((q.z - b.z) / l) * nz; if (dt > bdot) { bdot = dt; best = [(q.x - b.x) / l, (q.z - b.z) / l]; } }
    if (best) { nx += best[0] * 0.9; nz += best[1] * 0.9; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
    let bx = b.x + nx * (m - d), bz = b.z + nz * (m - d);
    const dc = dist(bx, bz, isl.cx, isl.cz);
    if (dc > lim) { bx = isl.cx + ((bx - isl.cx) / dc) * lim; bz = isl.cz + ((bz - isl.cz) / dc) * lim; }
    if (G.blocks.some((o) => o !== b && dist(bx, bz, o.x, o.z) < b.r + o.r)) { bx = b.x; bz = b.z; }
    b.x = bx; b.z = bz;
    // 推到壓力板附近就會自己卡進去
    const pl = G.plates.find((q) => !q.on && dist(b.x, b.z, q.x, q.z) < 0.55);
    if (pl) { b.x = pl.x; b.z = pl.z; b.locked = true; pl.on = true; G.events.push({ type: "plate", x: pl.x, z: pl.z }); }
    const d2 = dist(P.x, P.z, b.x, b.z); // 推不動的話，把主角擋回去
    if (d2 < m && d2 > 1e-6) { const px = P.x - ((b.x - P.x) / d2) * (m - d2), pz = P.z - ((b.z - P.z) / d2) * (m - d2); if (walkable(G, px, pz)) { P.x = px; P.z = pz; } }
  }
  if (G.plates.every((pl) => pl.on)) {
    G.ruinsSolved = true;
    giveToBag(G, RUINS.reward, [isl.cx + RUINS.chest[0], isl.cz + RUINS.chest[1]]);
    G.events.push({ type: "ruinsSolved" });
  }
}
function sheepTick(G, dt) {
  const P = G.player;
  for (const sh of G.sheep) {
    const isl = G.byId[sh.island];
    sh.wander -= dt;
    if (sh.wander <= 0 || dist(sh.x, sh.z, sh.tx, sh.tz) < 0.2) { const a = Math.random() * 6.28, r = 0.5 + Math.random() * 1.7; sh.tx = isl.cx + Math.cos(a) * r; sh.tz = isl.cz + Math.sin(a) * r; sh.wander = 3 + Math.random() * 4; }
    const dp = dist(sh.x, sh.z, P.x, P.z);
    sh.near = dp < 1.3;
    if (!sh.near) { const d = dist(sh.x, sh.z, sh.tx, sh.tz); if (d > 0.2) { const st = Math.min(d, 0.7 * dt); sh.x += ((sh.tx - sh.x) / d) * st; sh.z += ((sh.tz - sh.z) / d) * st; sh.facing = Math.atan2(sh.tx - sh.x, sh.tz - sh.z); sh.moving = true; } else sh.moving = false; }
    else { sh.moving = false; sh.facing = Math.atan2(P.x - sh.x, P.z - sh.z); }
    if (!sh.tame) {
      if (sh.near && have(G, "berry") > 0 && G.t - (sh.fedAt || 0) > 0.35) {
        sh.fedAt = G.t; if (G.bag.berry > 0) G.bag.berry--; else G.store.berry--;
        sh.fed++; G.events.push({ type: "fly", res: "berry", from: "player", to: [sh.x, sh.z] });
        if (sh.fed >= SHEEP.feed) { sh.tame = true; sh.t = SHEEP.every * 0.6; G.events.push({ type: "tame", x: sh.x, z: sh.z }); }
      } else if (sh.near && have(G, "berry") === 0) toast(G, "sheep", "🐑 雪羊想吃莓果（餵 4 個就會跟你回家）", 5);
    } else {
      if (sh.wool < SHEEP.max) { sh.t += dt; if (sh.t >= SHEEP.every) { sh.t = 0; sh.wool++; } }
      if (sh.near && sh.wool > 0) { giveToBag(G, { wool: sh.wool }, [sh.x, sh.z]); sh.wool = 0; G.events.push({ type: "shear", x: sh.x, z: sh.z }); }
    }
  }
}
function workersTick(G, dt) {
  for (const w of G.workers) {
    const pl = w.plot;
    if (!w.node || !w.node.alive) {
      w.node = null; w.t = 0;
      let bd = 1e9;
      for (const n of G.nodes) if (n.alive && n.island === pl.island && (NODES[n.type].minLevel || 1) <= G.levels.pick && !G.workers.some((o) => o !== w && o.node === n)) { const d = dist(w.x, w.z, n.x, n.z); if (d < bd) { bd = d; w.node = n; } }
    }
    const tx = w.node ? w.node.x : pl.x + 0.7, tz = w.node ? w.node.z : pl.z + 0.5, stop = w.node ? w.node.r + 0.45 : 0.15;
    const d = dist(w.x, w.z, tx, tz);
    w.moving = d > stop + 0.03; w.working = false;
    if (w.moving) { const st = Math.min(d - stop, WORKER.speed * dt); w.x += ((tx - w.x) / d) * st; w.z += ((tz - w.z) / d) * st; w.facing = Math.atan2(tx - w.x, tz - w.z); }
    else if (w.node) {
      w.working = true; w.t += dt; w.node.shake = 0.6;
      if (w.t >= WORKER.work) {
        const n = w.node, def = NODES[n.type];
        const times = def.per ? Math.round(def.hp / def.per) - (n.given || 0) : 1;
        for (const [k, v] of Object.entries(def.drop)) { G.store[k] += v * Math.max(1, times); G.events.push({ type: "fly", res: k, from: [n.x, n.z], to: [pl.x, pl.z] }); }
        n.alive = false; n.regrow = def.respawn; n.hp = 0;
        G.events.push({ type: "break", node: n });
        w.node = null; w.t = 0;
      }
    }
  }
}

/* ================= 寒冷 / 營火 / 暴風雪 / 料理 ================= */
export function nearFire(G) {
  const P = G.player;
  return G.plots.some((pl) => pl.type === "fire" && pl.built && (pl.eternal || pl.fuel > 0) && dist(P.x, P.z, pl.x, pl.z) < COLD.fireR);
}
function coldTick(G, dt) {
  const P = G.player, T = G.timers, isl = islandAt(G, P.x, P.z);
  // 暴風雪：只在冰原計時
  const S = G.storm;
  if (G.world === 3) {
    S.t -= dt;
    if (!S.on && S.t <= 4 && !S.warned) { S.warned = true; G.events.push({ type: "stormSoon" }); }
    if (S.t <= 0) { S.on = !S.on; S.warned = false; S.t = S.on ? COLD.stormOn : COLD.stormGap + Math.random() * 16; G.events.push({ type: S.on ? "stormStart" : "stormEnd" }); }
  }
  // 營火：燒柴、添柴
  for (const pl of G.plots) if (pl.type === "fire" && pl.built && !pl.eternal) {
    if (G.world === 3) pl.fuel = Math.max(0, pl.fuel - dt);
    const near = dist(P.x, P.z, pl.x, pl.z) < 1.3;
    if (pl.fuel <= COLD.fuelMax - COLD.perLog && have(G, "cedar") > 0 && ((near && G.t - (T.log || 0) > 0.25) || (G.levels.stoker > 1 && pl.fuel < 45 && G.store.cedar > 0))) {
      if (near) T.log = G.t;
      if (near && G.bag.cedar > 0) G.bag.cedar--; else if (G.store.cedar > 0) G.store.cedar--; else continue;
      pl.fuel += COLD.perLog;
      if (near) G.events.push({ type: "fly", res: "cedar", from: "player", to: [pl.x, pl.z] });
    }
  }
  let rate = (isl?.cold || 0) * UPGRADES.coat.power[G.levels.coat - 1];
  if (S.on && isl?.blizzard) rate *= COLD.stormMul;
  const B = G.boss3;
  if (B && B.alive && B.active && B.phase === 3 && isl?.id === B.island) rate += BOSS3.whiteout;
  if (G.t < P.warmT) rate = 0;
  P.warming = nearFire(G);
  if (P.warming) P.cold -= COLD.fireWarm * dt;
  else if (rate > 0) P.cold += rate * dt;
  else P.cold -= COLD.idleWarm * dt;
  P.cold = Math.max(0, Math.min(COLD.max, P.cold));
  if (P.cold >= COLD.max) {
    P.hp -= COLD.freeze * dt; P.lastHurt = G.t;
    if (G.t - T.burn > 0.6) { T.burn = G.t; G.events.push({ type: "freeze", x: P.x, z: P.z }); }
    toast(G, "cold", "🥶 快凍僵了！到營火旁取暖，或喝熱湯", 4);
  }
}
export function cook(G, id) {
  const F = FOODS[id];
  if (!G.plots.some((p) => p.type === "kitchen" && p.built)) return false;
  if (G.food[id] >= FOOD_CAP) { toast(G, "afford", `最多帶 ${FOOD_CAP} 份`, 0.5); return false; }
  if (!canAfford(G, F.from)) { toast(G, "afford", "材料不足", 0.5); return false; }
  spend(G, F.from); G.food[id]++;
  G.events.push({ type: "cook", id });
  return true;
}
export function eat(G, id) {
  const F = FOODS[id], P = G.player;
  if (!G.food[id] || G.t - (G.timers.eat ?? -9) < 0.8) return false;
  G.timers.eat = G.t; G.food[id]--;
  if (F.heal) P.hp = Math.min(PLAYER.maxHp, P.hp + F.heal);
  if (F.warm) { P.warmT = G.t + F.warm; P.cold = Math.max(0, P.cold - 50); }
  if (F.fast) P.fastT = G.t + F.fast;
  G.events.push({ type: "eat", id });
  return true;
}

/* ================= 熱度 / 熔岩 / 傳送門 ================= */
function scald(G, dmg, heat) {
  const P = G.player;
  P.hp -= dmg; P.heat = Math.min(HEAT.max, P.heat + heat); P.lastHurt = G.t;
  if (G.t - G.timers.burn > 0.5) { G.timers.burn = G.t; G.events.push({ type: "burn", x: P.x, z: P.z }); }
}
export function nearWell(G) {
  const P = G.player;
  return G.plots.some((pl) => pl.type === "well" && pl.built && dist(P.x, P.z, pl.x, pl.z) < HEAT.wellR);
}
function heatTick(G, dt) {
  const P = G.player, isl = islandAt(G, P.x, P.z);
  for (const l of G.lavas) if (dist(P.x, P.z, l.x, l.z) < l.r) { scald(G, HEAT.lavaDmg * dt, HEAT.lavaHeat * dt); break; }
  const rate = (isl?.heat || 0) * UPGRADES.boots.power[G.levels.boots - 1];
  P.cooling = nearWell(G);
  if (P.cooling) P.heat -= HEAT.wellCool * dt;
  else if (rate > 0) P.heat += rate * dt;
  else P.heat -= HEAT.idleCool * dt;
  P.heat = Math.max(0, Math.min(HEAT.max, P.heat));
  if (P.heat >= HEAT.max) { scald(G, HEAT.burn * dt, 0); toast(G, "hot", "🥵 太熱了！快到水井旁邊降溫", 4); }
}
function portalTick(G, dt) {
  const P = G.player;
  const near = G.plots.find((pl) => pl.type === "portal" && pl.built && dist(P.x, P.z, pl.x, pl.z) < 1.2);
  if (!near) { P.portalLock = false; P.portalT = 0; return; }
  // 要在門上站定一下才傳送，路過不會誤觸
  if (P.portalLock || P.moving || P.action || dist(P.x, P.z, near.x, near.z) > 0.7) { P.portalT = 0; return; }
  P.portalT = (P.portalT || 0) + dt;
  if (P.portalT < 0.9) return;
  P.portalT = 0;
  const dest = G.plots.find((pl) => pl.id === PORTAL_PAIR[near.id]);
  if (!dest || !dest.built) return;
  P.x = dest.x; P.z = dest.z - 0.1; P.portalLock = true; G.world = dest.w;
  if (G.boss) G.boss.warns = [];
  G.warns = [];
  // 小幫手跟著過去，身上的貨直接進倉庫
  const wh = homeWarehouse(G);
  for (const h of G.helpers) { for (const k of RES_ORDER) { G.store[k] += h.load[k]; h.load[k] = 0; } Object.assign(h, { x: wh.x + 0.9 + h.id * 0.6, z: wh.z + 1.2, state: "idle", path: [], repath: 0 }); }
  G.events.push({ type: "teleport", world: G.world });
}
