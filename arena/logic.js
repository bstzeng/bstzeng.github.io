// 星域戰陣 — 純邏輯（不碰 DOM，可在 node 裡跑平衡測試）
import { UNITS, CARDS, STAR_MUL, MAX_STAGE, TIER_STAGE } from './data.js';

export const W = 480, H = 760, CELL = 60, COLS = 8, ROWS = 4;
export const P_TOP = 500, E_BOT = 260; // 玩家區上緣、敵方區下緣

export function cellPos(team, c, r) {
  return [c * CELL + CELL / 2, team === 0 ? P_TOP + CELL / 2 + r * CELL : E_BOT - CELL / 2 - r * CELL];
}

export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 玩家升級 → 數值修正 ──
export function playerMods(ups) {
  const n = (k) => ups[k] || 0;
  return {
    dmg: 1 + 0.1 * n('atk'), hp: 1 + 0.12 * n('hp'), armor: n('arm'), as: 1 + 0.08 * n('as'), ms: 1 + 0.1 * n('ms'),
    cd: Math.pow(0.9, n('cdr')), ls: 0.05 * n('ls'), bar: 0.12 * n('bar'), range: 1 + 0.1 * n('rng'),
    regen: 0.012 * n('drone') + 0.015 * n('regenall'), sh: 1 + 0.4 * n('shcap'),
    f: { stimfree: n('stimfree'), siege: n('siege'), chstun: n('chstun'), bigstorm: n('bigstorm'), metab: n('metab'), twin: n('twin') },
  };
}
export function enemyMods(stage) {
  const m = 1 + 0.022 * (stage - 1) + 0.0004 * stage * stage;
  return { dmg: m, hp: m, armor: Math.floor(stage / 14), as: 1, ms: 1, cd: 1, ls: 0, bar: 0, range: 1, regen: 0, sh: 1, f: {} };
}

export function supplyCap(save) { return 10 + 2 * (save.ups.cap || 0) + (save.capBought || 0); }
export function capPrice(save) { return 5 + 3 * (save.capBought || 0); }
export function stageGold(stage, ups) {
  const base = 4 + Math.floor(stage * 0.5) + (stage % 10 === 0 ? 10 : 0);
  return Math.round(base * (1 + 0.2 * (ups.gold || 0)));
}
export function unlocked(def, stage) { return stage >= TIER_STAGE[def.tier]; }
export function sellValue(u) { return Math.max(1, Math.floor(UNITS[u.type].cost * Math.pow(3, u.star - 1) / 2)); }

// 三選一升級卡
export function rollCards(save, rnd = Math.random) {
  const pool = CARDS.filter((c) => (!c.fac || c.fac === save.faction) && (save.ups[c.id] || 0) < c.max);
  const out = [];
  while (out.length < 3 && pool.length) {
    // 陣營專屬卡權重較高，讓玩家有機會看到
    const wts = pool.map((c) => (c.fac ? 1.6 : 1));
    let x = rnd() * wts.reduce((a, b) => a + b, 0), i = 0;
    while (i < pool.length - 1 && (x -= wts[i]) > 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// 買進後自動三合一升星。回傳是否有合成
export function mergeRoster(roster) {
  let merged = false, again = true;
  while (again) {
    again = false;
    const groups = {};
    for (const u of roster) (groups[u.type + ':' + u.star] ||= []).push(u);
    for (const k in groups) {
      const g = groups[k];
      if (g.length >= 3 && g[0].star < 3) {
        g.sort((a, b) => (b.cell ? 1 : 0) - (a.cell ? 1 : 0));
        g[0].star++;
        roster.splice(roster.indexOf(g[1]), 1);
        roster.splice(roster.indexOf(g[2]), 1);
        merged = again = true;
        break;
      }
    }
  }
  return merged;
}

// ── 敵軍編成 ──
export function genEnemy(stage) {
  const rnd = rng32(stage * 7919 + 13);
  const facs = ['fed', 'lum', 'brood'];
  const fac = facs[Math.floor(rnd() * 3)];
  const boss = stage % 10 === 0;
  let budget = 4 + stage * 1.5 + stage * stage * 0.032;
  const pool = Object.values(UNITS).filter((d) => d.fac === fac && d.tier < 9 && unlocked(d, stage));
  const list = [];
  if (boss) {
    const top = pool.reduce((a, b) => (b.cost > a.cost ? b : a));
    list.push({ type: top.id, star: stage < 30 ? 1 : stage < 50 ? 2 : 3, boss: true });
    budget *= 0.55;
  }
  const minCost = Math.min(...pool.map((d) => d.cost));
  let guard = 0;
  while (budget >= minCost && guard++ < 400) {
    const ok = pool.filter((d) => d.cost <= budget);
    // 偏好貴一點的單位，避免後期全是雜兵
    const d = ok[Math.floor(Math.pow(rnd(), 0.75) * ok.length)];
    list.push({ type: d.id, star: 1 });
    budget -= d.cost;
  }
  const maxUnits = Math.min(COLS * ROWS - 2, Math.floor(5 + stage * 0.5));
  while (list.length > maxUnits) {
    const g = {};
    for (const u of list) if (!u.boss) (g[u.type + ':' + u.star] ||= []).push(u);
    const k = Object.keys(g).find((k) => g[k].length >= 3 && g[k][0].star < 3);
    if (k) { g[k][0].star++; list.splice(list.indexOf(g[k][1]), 1); list.splice(list.indexOf(g[k][2]), 1); }
    else { // 沒得合成：把最便宜的丟掉
      let mi = -1;
      list.forEach((u, i) => { if (!u.boss && (mi < 0 || UNITS[u.type].cost * u.star < UNITS[list[mi].type].cost * list[mi].star)) mi = i; });
      list.splice(mi, 1);
    }
  }
  // 擺位：近戰在前排、遠程在後排
  const used = new Set();
  const place = (rows) => {
    for (let tries = 0; tries < 80; tries++) {
      const r = rows[Math.floor(rnd() * rows.length)], c = Math.floor(rnd() * COLS);
      if (!used.has(c + ',' + r)) { used.add(c + ',' + r); return [c, r]; }
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!used.has(c + ',' + r)) { used.add(c + ',' + r); return [c, r]; }
    return [0, 0];
  };
  for (const u of list) {
    const d = UNITS[u.type];
    u.cell = u.boss ? place([1]) : place(d.range < 50 ? [0, 1] : d.atk === 'heal' ? [1, 2] : [2, 3]);
  }
  return { fac, boss, list };
}

// ── 戰鬥模擬 ──
let UID = 1;
function mk(S, type, star, team, x, y, mods, boss) {
  const d = UNITS[type], sm = STAR_MUL[star - 1], hm = sm * (boss ? 2.2 : 1), dm = sm * (boss ? 1.4 : 1), f = mods.f;
  let range = d.range;
  if (range > 50) range *= mods.range * (f.siege && (type === 'tank' || type === 'sniper') ? 1.25 : 1);
  const fast = f.metab && (type === 'clawling' || type === 'burster') ? 1.3 : 1;
  const u = {
    id: UID++, team, type, def: d, star, boss: !!boss, x, y, alive: true,
    r: d.r * 1.3 * (1 + 0.14 * (star - 1)) * (boss ? 1.4 : 1),
    maxHp: d.hp * hm * mods.hp, maxSh: d.sh * hm * mods.hp * mods.sh, dmg: d.dmg * dm * mods.dmg,
    armor: d.armor + mods.armor + (star - 1), range, cd: d.cd / (mods.as * fast), spd: d.spd * mods.ms * fast,
    ls: mods.ls, regen: mods.regen, f,
    atkT: S.rnd() * 0.4, skillCd: d.skill && d.skill.cd ? d.skill.cd * mods.cd : 0, skillT: 0,
    tgt: null, reT: 0, face: team === 0 ? -Math.PI / 2 : Math.PI / 2, lastHit: -9, flash: 0, atkAnim: 0,
    stimT: 0, frenzyT: 0, chargeT: 0, guardT: 0, regenT: 0, stunT: 0, slowT: 0, bar: 0,
  };
  u.hp = u.maxHp; u.sh = u.maxSh; u.bar = u.maxHp * mods.bar;
  u.skillT = u.skillCd * (0.25 + 0.3 * S.rnd());
  S.units.push(u);
  return u;
}

export function createBattle(roster, ups, stage, enemy) {
  const S = { t: 0, units: [], zones: [], ev: [], winner: null, rnd: rng32(stage * 31 + 7), stage };
  const pm = playerMods(ups), em = enemyMods(stage);
  for (const u of roster) {
    if (!u.cell) continue;
    const [x, y] = cellPos(0, u.cell[0], u.cell[1]);
    const m = mk(S, u.type, u.star, 0, x, y, pm);
    m.src = u;
    if (pm.f.twin && u.type === 'clawling') mk(S, u.type, u.star, 0, x + 14, y + 10, pm);
  }
  for (const e of enemy.list) {
    const [x, y] = cellPos(1, e.cell[0], e.cell[1]);
    mk(S, e.type, e.star, 1, x, y, em, e.boss);
  }
  S.pm = pm; S.em = em;
  return S;
}

function heal(S, u, amt) {
  if (!u.alive || amt <= 0) return;
  u.hp = Math.min(u.maxHp, u.hp + amt);
}
function hit(S, src, t, dmg, pure) {
  if (!t.alive) return;
  if (t.guardT > 0) dmg *= 0.65;
  const total = dmg;
  if (t.bar > 0) { const a = Math.min(t.bar, dmg); t.bar -= a; dmg -= a; }
  if (dmg > 0 && t.sh > 0) { const a = Math.min(t.sh, dmg); t.sh -= a; dmg -= a; }
  if (dmg > 0) t.hp -= pure ? dmg : Math.max(dmg * 0.2, dmg - t.armor);
  t.lastHit = S.t; t.flash = 0.12;
  if (src && src.ls && src.alive) heal(S, src, total * src.ls);
  if (t.def.skill && t.def.skill.id === 'blink' && t.sh <= 0 && t.skillT <= 0 && t.hp > 0) {
    S.ev.push({ k: 'blink', x: t.x, y: t.y, team: t.team });
    t.y = Math.max(t.r, Math.min(H - t.r, t.y + (t.team === 0 ? 85 : -85)));
    t.sh = t.maxSh * 0.6; t.skillT = t.skillCd; t.tgt = null;
    S.ev.push({ k: 'blink', x: t.x, y: t.y, team: t.team }, { k: 'txt', x: t.x, y: t.y, s: '相位閃現', team: t.team });
  }
  if (t.hp <= 0) { t.alive = false; S.ev.push({ k: 'die', x: t.x, y: t.y, r: t.r, fac: t.def.fac, team: t.team, big: t.r > 16 }); }
}
function splash(S, src, x, y, rad, dmg, except) {
  for (const e of S.units) if (e.alive && e.team !== src.team && e !== except && Math.hypot(e.x - x, e.y - y) <= rad + e.r) hit(S, src, e, dmg);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const edge = (a, b) => dist(a, b) - a.r - b.r;

function attack(S, u, t) {
  const d = u.def, a = d.atk;
  u.atkAnim = 0.15;
  if (a === 'heal') { heal(S, t, u.dmg); S.ev.push({ k: 'shot', a, x1: u.x, y1: u.y, x2: t.x, y2: t.y }); return; }
  if (a === 'burst') {
    const rad = d.splash * (1 + 0.1 * (u.star - 1));
    splash(S, u, u.x, u.y, rad, u.dmg);
    u.alive = false;
    S.ev.push({ k: 'boom', x: u.x, y: u.y, r: rad, c: 'acid' });
    return;
  }
  S.ev.push({ k: 'shot', a, x1: u.x, y1: u.y, x2: t.x, y2: t.y, r: u.r, team: u.team });
  const tx = t.x, ty = t.y;
  if (u.chargeHit) { u.chargeHit = false; if (u.f.chstun) t.stunT = Math.max(t.stunT, 1.2); }
  hit(S, u, t, u.dmg);
  if (a === 'flame' || a === 'shell' || a === 'cleave') splash(S, u, tx, ty, d.splash, u.dmg * 0.6, t);
  if (a === 'shell') S.ev.push({ k: 'boom', x: tx, y: ty, r: d.splash, c: 'fire' });
  if (a === 'sweep') for (const e of S.units) if (e.alive && e.team !== u.team && e !== t && Math.abs(e.x - tx) < 78 && Math.abs(e.y - ty) < 30) hit(S, u, e, u.dmg);
  if (a === 'spawn') {
    const mine = S.units.filter((e) => e.alive && e.owner === u.id).length;
    if (mine < 4) {
      const b = mk(S, 'broodling', u.star, u.team, tx + (S.rnd() - 0.5) * 30, ty + (u.team === 0 ? 16 : -16), u.team === 0 ? S.pm : S.em);
      b.owner = u.id; b.life = 7;
      S.ev.push({ k: 'boom', x: b.x, y: b.y, r: 12, c: 'acid' });
    }
  }
}

function castSkill(S, u, t, engaged) {
  const sk = u.def.skill;
  const say = () => S.ev.push({ k: 'txt', x: u.x, y: u.y - u.r, s: sk.name, team: u.team });
  const done = () => { u.skillT = u.skillCd; say(); };
  const big = u.f.bigstorm ? 1.35 : 1;
  switch (sk.id) {
    case 'stim':
      if (!engaged || u.stimT > 0) return;
      if (!u.f.stimfree) u.hp = Math.max(1, u.hp - 8 * STAR_MUL[u.star - 1]);
      u.stimT = u.f.stimfree ? 9 : 6; done(); break;
    case 'flameburst':
      if (!engaged) return;
      splash(S, u, t.x, t.y, 55, u.dmg * 2.5); S.ev.push({ k: 'boom', x: t.x, y: t.y, r: 55, c: 'fire' }); done(); break;
    case 'nanoburst': {
      const hurt = S.units.filter((e) => e.alive && e.team === u.team && e.hp < e.maxHp * 0.8 && dist(e, u) < 100);
      if (hurt.length < 2) return;
      for (const e of S.units) if (e.alive && e.team === u.team && dist(e, u) < 100) heal(S, e, u.dmg * 5);
      S.ev.push({ k: 'ring', x: u.x, y: u.y, r: 100, c: '#6dffb0' }); done(); break;
    }
    case 'snipe': {
      let best = null;
      for (const e of S.units) if (e.alive && e.team !== u.team && edge(u, e) <= u.range * 1.3 && (!best || e.hp + e.sh > best.hp + best.sh)) best = e;
      if (!best) return;
      S.ev.push({ k: 'shot', a: 'snipeX', x1: u.x, y1: u.y, x2: best.x, y2: best.y });
      hit(S, u, best, u.dmg * 5, true); done(); break;
    }
    case 'hexshell':
      if (!engaged) return;
      S.ev.push({ k: 'shot', a: 'shell', x1: u.x, y1: u.y, x2: t.x, y2: t.y, r: u.r }, { k: 'boom', x: t.x, y: t.y, r: 64, c: 'fire', big: true });
      splash(S, u, t.x, t.y, 64, u.dmg * 2.5); done(); break;
    case 'nova':
      if (!engaged) return;
      S.ev.push({ k: 'shot', a: 'nova', x1: u.x, y1: u.y, x2: t.x, y2: t.y }, { k: 'boom', x: t.x, y: t.y, r: 40, c: 'nova', big: true });
      hit(S, u, t, u.dmg * 18); splash(S, u, t.x, t.y, 40, u.dmg * 5, t); done(); break;
    case 'charge': {
      const e = t ? edge(u, t) : 999;
      if (!t || e < 30 || e > 230) return;
      u.chargeT = 1.1; u.chargeHit = true; done(); break;
    }
    case 'guardian': {
      if (!engaged) return;
      for (const e of S.units) if (e.alive && e.team === u.team && dist(e, u) < 115) e.guardT = 6;
      S.ev.push({ k: 'ring', x: u.x, y: u.y, r: 115, c: '#7ff6ff' }); done(); break;
    }
    case 'storm': {
      let best = null, bn = 0;
      for (const e of S.units) {
        if (!e.alive || e.team === u.team || dist(u, e) > u.range + 120) continue;
        let n = 0;
        for (const o of S.units) if (o.alive && o.team === e.team && dist(o, e) < 55) n += o.def.sup || 0.5;
        if (n > bn) { bn = n; best = e; }
      }
      if (!best) return;
      S.zones.push({ k: 'storm', x: best.x, y: best.y, r: 58 * big, t: 3, tick: 0, team: u.team, dmg: 14 * STAR_MUL[u.star - 1] * (u.dmg / (u.def.dmg * STAR_MUL[u.star - 1])), src: u });
      done(); break;
    }
    case 'warp':
      if (!engaged) return;
      S.zones.push({ k: 'warp', x: t.x, y: t.y, r: 100 * big, t: 4.5, tick: 0, team: u.team }); done(); break;
    case 'regen':
      if (u.hp > u.maxHp * 0.45) return;
      u.regenT = 4; done(); break;
    case 'frenzy':
      if (!engaged) return;
      u.frenzyT = 4; done(); break;
    case 'stomp': {
      if (!t || edge(u, t) > 20) return;
      for (const e of S.units) if (e.alive && e.team !== u.team && dist(e, u) < 68 + u.r) { e.stunT = Math.max(e.stunT, 1.2); hit(S, u, e, u.dmg); }
      S.ev.push({ k: 'ring', x: u.x, y: u.y, r: 68 + u.r, c: '#ffb070', shake: true }); done(); break;
    }
  }
}

export function step(S, dt) {
  if (S.winner !== null) return;
  S.t += dt;
  const us = S.units;
  // 區域效果
  for (const z of S.zones) {
    z.t -= dt; z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.3;
      for (const e of us) {
        if (!e.alive || e.team === z.team || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r) continue;
        if (z.k === 'storm') hit(S, z.src, e, z.dmg, true); else e.slowT = 0.5;
      }
    }
  }
  S.zones = S.zones.filter((z) => z.t > 0);

  let minY = [1e9, 1e9], maxY = [-1e9, -1e9];
  for (const u of us) if (u.alive) { minY[u.team] = Math.min(minY[u.team], u.y); maxY[u.team] = Math.max(maxY[u.team], u.y); }

  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (!u.alive) continue;
    if (u.life !== undefined && (u.life -= dt) <= 0) { u.alive = false; S.ev.push({ k: 'die', x: u.x, y: u.y, r: u.r, fac: 'brood', team: u.team }); continue; }
    u.flash -= dt; u.atkAnim -= dt;
    for (const k of ['stimT', 'frenzyT', 'chargeT', 'guardT', 'regenT', 'stunT', 'slowT']) if (u[k] > 0) u[k] -= dt;
    if (u.regen) heal(S, u, u.maxHp * u.regen * dt);
    if (u.regenT > 0) heal(S, u, u.maxHp * 0.1 * dt);
    if (u.maxSh && S.t - u.lastHit > 4 && u.sh < u.maxSh) u.sh = Math.min(u.maxSh, u.sh + u.maxSh * 0.1 * dt);
    if (u.stunT > 0) continue;
    const slow = u.slowT > 0 ? 0.45 : 1;
    const healer = u.def.atk === 'heal';

    // 選目標（每 0.25 秒重選）
    u.reT -= dt;
    if (!u.tgt || !u.tgt.alive || u.reT <= 0 || (healer && u.tgt.hp >= u.tgt.maxHp)) {
      u.reT = 0.25;
      let best = null, bd = 1e9;
      for (const e of us) {
        if (!e.alive || e === u) continue;
        if (healer) {
          if (e.team !== u.team || e.def.atk === 'heal' || e.life !== undefined) continue;
          const dd = dist(u, e) + (e.hp < e.maxHp ? -400 * (1 - e.hp / e.maxHp) - 300 : 0);
          if (dd < bd) { bd = dd; best = e; }
        } else if (e.team !== u.team) {
          const dd = dist(u, e) - e.r + (u.tgt === e ? -12 : 0);
          if (dd < bd) { bd = dd; best = e; }
        }
      }
      u.tgt = best;
    }
    const t = u.tgt;
    const fwd = u.team === 0 ? -1 : 1;
    const reach = Math.max(u.range, 5);
    let mvx = 0, mvy = 0;
    if (t) {
      const e = edge(u, t), dc = dist(u, t) || 1;
      const inRange = e <= reach;
      const engaged = !healer && e <= reach + 30;
      if (u.skillCd && (u.skillT -= dt) <= 0) castSkill(S, u, t, engaged);
      if (!u.alive) continue;
      if (healer) {
        // 醫護兵：跟在友軍後方，有人受傷就治療
        const wounded = t.hp < t.maxHp;
        u.atkT -= dt * slow;
        if (wounded && inRange) { if (u.atkT <= 0) { attack(S, u, t); u.atkT = u.cd; } }
        else if (wounded || e > 34) { mvx = (t.x - u.x) / dc; mvy = (t.y - u.y) / dc; }
        u.face = Math.atan2(t.y - u.y, t.x - u.x);
      } else {
        const asm = (u.stimT > 0 ? 1.5 : 1) * (u.frenzyT > 0 ? 1.6 : 1) * (u.type === 'clawling' && u.hp < u.maxHp * 0.5 ? 1.4 : 1) * slow;
        u.atkT -= dt * asm;
        if (inRange) {
          u.face = Math.atan2(t.y - u.y, t.x - u.x);
          u.chargeT = 0;
          if (u.atkT <= 0) { attack(S, u, t); u.atkT = u.cd; }
        } else {
          // 向前衝（A 過去）：敵人進入警戒範圍才轉向，否則一路往前
          const ahead = u.team === 0 ? minY[1] < u.y + 20 : maxY[0] > u.y - 20;
          if (dc < u.range + 170 || !ahead) { mvx = (t.x - u.x) / dc; mvy = (t.y - u.y) / dc; }
          else { mvy = fwd; mvx = Math.max(-0.35, Math.min(0.35, (t.x - u.x) / 300)); }
        }
      }
    } else if (!healer) mvy = fwd * 0.5;
    if (mvx || mvy) {
      const sp = u.spd * slow * (u.stimT > 0 ? 1.3 : 1) * (u.chargeT > 0 ? 3.2 : 1);
      u.x += mvx * sp * dt; u.y += mvy * sp * dt;
      u.face = Math.atan2(mvy, mvx); u.moving = true;
    } else u.moving = false;
  }

  // 互相推開，避免疊在一起
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.92;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d > 0.01 ? dx / d : S.rnd() - 0.5, ny = d > 0.01 ? dy / d : 0.5;
      const ma = a.r * a.r, mb = b.r * b.r, push = (min - d) * 0.6;
      a.x -= nx * push * mb / (ma + mb); a.y -= ny * push * mb / (ma + mb);
      b.x += nx * push * ma / (ma + mb); b.y += ny * push * ma / (ma + mb);
    }
    a.x = Math.max(a.r, Math.min(W - a.r, a.x)); a.y = Math.max(a.r, Math.min(H - a.r, a.y));
  }

  let n0 = 0, n1 = 0;
  for (const u of us) if (u.alive) u.team === 0 ? n0++ : n1++;
  S.units = us.filter((u) => u.alive);
  if (n1 === 0 && n0 > 0) S.winner = 0;
  else if (n0 === 0) S.winner = 1;
  else if (S.t > 100) S.winner = 1; // 超時算敗
}

export function newSave(faction) {
  return { v: 1, faction, stage: 1, gold: 3, roster: [], ups: {}, capBought: 0, uid: 1, cleared: false };
}
export function addUnit(save, type) {
  const u = { uid: save.uid++, type, star: 1, cell: null };
  save.roster.push(u);
  return u;
}
export function usedSupply(save) { return save.roster.reduce((s, u) => s + (u.cell ? UNITS[u.type].sup : 0), 0); }
export { MAX_STAGE };
