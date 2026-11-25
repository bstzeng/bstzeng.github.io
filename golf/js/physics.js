// 球的物理：空氣阻力、旋轉升力（馬格努斯）、風（隨高度變強）、落地彈跳、滾動（坡度、草的阻力）、洞口、旗桿、樹
import { SURF, clamp } from "./course.js";

export const BALL = { m: 0.04593, r: 0.02135 };
const A = Math.PI * BALL.r * BALL.r, RHO = 1.225, G = 9.81;
const K = (0.5 * RHO * A) / BALL.m;

/* 球桿：滿桿的球速 m/s、發射角、後旋 rpm（已校正成對應的飛行距離） */
export const CLUBS = [
  { id: "1W", name: "一號木", v: 70.7, la: 11.5, spin: 2700, carryYd: 245, min: 0.5 },
  { id: "3W", name: "三號木", v: 60.9, la: 12.0, spin: 3500, carryYd: 225, min: 0.4 },
  { id: "5W", name: "五號木", v: 56.9, la: 13.0, spin: 4200, carryYd: 210 },
  { id: "4H", name: "四號鐵木", v: 54.4, la: 13.5, spin: 4600, carryYd: 197 },
  { id: "5I", name: "五號鐵", v: 52.3, la: 14.0, spin: 5200, carryYd: 185 },
  { id: "6I", name: "六號鐵", v: 50.8, la: 15.5, spin: 6000, carryYd: 174 },
  { id: "7I", name: "七號鐵", v: 48.9, la: 17.0, spin: 6800, carryYd: 162 },
  { id: "8I", name: "八號鐵", v: 46.8, la: 19.0, spin: 7600, carryYd: 150 },
  { id: "9I", name: "九號鐵", v: 44.7, la: 21.5, spin: 8300, carryYd: 138 },
  { id: "PW", name: "劈起桿", v: 42.2, la: 24.5, spin: 9000, carryYd: 125 },
  { id: "GW", name: "間隙桿", v: 39.0, la: 27.5, spin: 9500, carryYd: 110 },
  { id: "SW", name: "沙坑桿", v: 35.2, la: 31.0, spin: 10000, carryYd: 93 },
  { id: "LW", name: "高拋桿", v: 30.7, la: 35.0, spin: 10500, carryYd: 74 },
  { id: "PT", name: "推桿", v: 7.0, la: 0, spin: 0, carryYd: 0, putter: true },
];
/* 地面：落地反彈（法向）、落地保留的水平速度、滾動阻力（g 的倍數） */
export const GROUND = {
  [SURF.TEE]: { e: 0.32, keep: 0.72, roll: 0.13 },
  [SURF.FAIRWAY]: { e: 0.32, keep: 0.72, roll: 0.13 },
  [SURF.FRINGE]: { e: 0.26, keep: 0.62, roll: 0.17 },
  [SURF.GREEN]: { e: 0.22, keep: 0.62, roll: 0.068 },
  [SURF.ROUGH]: { e: 0.16, keep: 0.42, roll: 0.36 },
  [SURF.DEEP]: { e: 0.08, keep: 0.25, roll: 0.75 },
  [SURF.BUNKER]: { e: 0.03, keep: 0.12, roll: 1.4 },
  [SURF.PATH]: { e: 0.55, keep: 0.85, roll: 0.06 },
  [SURF.OB]: { e: 0.16, keep: 0.42, roll: 0.36 },
  [SURF.WATER]: { e: 0, keep: 0, roll: 9 },
};
/* 球位影響：球速、旋轉、亂數散布（度） */
export const LIE = {
  [SURF.TEE]: { v: 1, spin: 1, spread: 0 },
  [SURF.FAIRWAY]: { v: 1, spin: 1, spread: 0.3 },
  [SURF.FRINGE]: { v: 0.97, spin: 0.9, spread: 0.5 },
  [SURF.GREEN]: { v: 1, spin: 1, spread: 0 },
  [SURF.ROUGH]: { v: 0.9, spin: 0.62, spread: 1.6 },
  [SURF.DEEP]: { v: 0.76, spin: 0.45, spread: 3.2 },
  [SURF.BUNKER]: { v: 0.78, spin: 0.75, spread: 2.2 },
  [SURF.PATH]: { v: 0.97, spin: 1, spread: 0.6 },
};
export const CUP_R = 0.054, PIN_H = 2.13;

/** 風速隨高度（對數風剖面）：w10 是 10 公尺高的風 */
function windAt(w, y, ground) { const h = Math.max(0.3, y - ground); const k = clamp(Math.log(h / 0.05) / Math.log(10 / 0.05), 0.2, 1.35); return { x: w.x * k, z: w.z * k }; }

/**
 * 從某點打出去，模擬到停下來。
 * shot: {x,y,z, dir(弧度，0 = -z 方向), club, power 0..1, curve（-1..1 左曲右曲）, loft 加減（度）}
 * env: {hole, wind:{x,z}, wet, pin:{x,z}}
 * 回傳 {path:[...{x,y,z,t}], carry, end, state:"rest"|"holed"|"water"|"ob", events}
 */
export function simulate(shot, env, opt = {}) {
  const { hole } = env, club = shot.club;
  const dt = opt.dt || 1 / 240, maxT = opt.maxT || 40;
  let x = shot.x, y = shot.y, z = shot.z;
  const lie = LIE[shot.lie || SURF.TEE] || LIE[SURF.ROUGH];
  const fx = Math.sin(shot.dir), fz = -Math.cos(shot.dir);
  const path = [{ x, y, z, t: 0 }], events = [];
  let state = "fly", t = 0, carry = null, lastDry = { x, y, z }, bounces = 0;
  const wet = env.wet ? 1 : 0;
  if (club.putter) {
    const sp = club.v * shot.power;
    let vx = fx * sp, vz = fz * sp, vy = 0;
    state = "roll";
    return roll({ x, y: hole.height(x, z), z, vx, vy, vz, t, path, events, env, dt, maxT, carry: 0, putt: true, bounces });
  }
  const v0 = club.v * shot.power * lie.v * (opt.noLieLoss ? 1 / lie.v : 1);
  const la = (club.la + (shot.loft || 0) + (1 - shot.power) * 3) * Math.PI / 180;
  let spin = club.spin * (0.55 + 0.45 * shot.power) * lie.spin * (2 * Math.PI / 60);
  // 旋轉軸：純後旋時垂直於飛行方向；左右曲球把軸傾斜
  const tilt = -clamp(shot.curve || 0, -1, 1) * 0.42;      // 正 = 往右曲（右曲球）
  let vx = fx * Math.cos(la) * v0, vy = Math.sin(la) * v0, vz = fz * Math.cos(la) * v0;
  const trees = hole.trees;
  let hitTree = 0, it = 0;
  while (t < maxT) {
    it++;
    // 空中
    const g0 = hole.height(x, z);
    const w = windAt(env.wind, y, g0);
    const rx = vx - w.x, ry = vy, rz = vz - w.z, v = Math.hypot(rx, ry, rz) || 1e-6;
    const S = (spin * BALL.r) / v;
    const Cd = 0.215 + 0.22 * S, Cl = Math.min(0.34, 1.35 * S);
    // 升力方向 = 旋轉軸 × 速度；軸 = (右手方向 傾斜後)
    const hx = Math.hypot(rx, rz) || 1e-6;
    let ax_ = -rz / hx, az_ = rx / hx;                   // 水平、垂直於前進方向（左）
    const axx = ax_ * Math.cos(tilt), axy = Math.sin(tilt), axz = az_ * Math.cos(tilt);
    // L = ω̂ × v̂
    let lx = axy * rz - axz * ry, ly = axz * rx - axx * rz, lz = axx * ry - axy * rx;
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    const fd = K * Cd * v, fl = K * Cl * v * v;
    vx += (-fd * rx + fl * lx) * dt; vy += (-fd * ry + fl * ly - G) * dt; vz += (-fd * rz + fl * lz) * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    spin *= Math.exp(-dt / 24);
    // 樹：樹冠減速亂彈、樹幹反彈
    if ((!hitTree || t - hitTree > 0.25) && y - g0 < 22 && (it & 1) === 0) for (const tr of hole.treesNear ? hole.treesNear(x, z) : trees) {
      const dx = x - tr.x, dz = z - tr.z;
      if (dx * dx + dz * dz > (tr.cr + 1) * (tr.cr + 1)) continue;
      const inCrown = (dx * dx + dz * dz) / (tr.cr * tr.cr) + ((y - tr.cy) / (tr.h - tr.cy + 1)) ** 2 < 1;
      const inTrunk = dx * dx + dz * dz < (tr.trunk + 0.05) ** 2 && y < tr.cy;
      if (inCrown || inTrunk) {
        hitTree = t; events.push({ type: "tree", t, x, y, z });
        const rr = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
        const k = inTrunk ? -0.45 : 0.32;
        vx *= k; vz *= k; vy *= inTrunk ? 0.5 : 0.3;
        vx += (rr - 0.5) * 3; vz += (((rr * 7) % 1) - 0.5) * 3;
        spin *= 0.3;
        break;
      }
    }
    // 旗桿
    const pdx = x - env.pin.x, pdz = z - env.pin.z, ph = hole.height(env.pin.x, env.pin.z);
    if (pdx * pdx + pdz * pdz < 0.03 * 0.03 && y < ph + PIN_H && y > ph) { events.push({ type: "pin", t }); vx *= -0.3; vz *= -0.3; }
    if ((it & 3) === 0 || y < g0 + 0.5) path.push({ x, y, z, t });
    if (y <= g0) {
      // 落地
      if (carry === null) { carry = Math.hypot(x - shot.x, z - shot.z); events.push({ type: "land", t, x, y: g0, z, surf: hole.surface(x, z) }); }
      const surf = hole.surface(x, z);
      if (surf === SURF.WATER) { events.push({ type: "water", t, x, z }); path.push({ x, y: g0, z, t }); return { path, carry, end: { x, y: g0, z }, lastDry, state: "water", events, t }; }
      const gp = GROUND[surf] || GROUND[SURF.ROUGH], n = hole.normal(x, z);
      y = g0 + 0.001;
      const vn = vx * n.x + vy * n.y + vz * n.z;
      let tx = vx - vn * n.x, ty = vy - vn * n.y, tz = vz - vn * n.z;
      // 後旋讓水平速度變小（果嶺上甚至會倒退）
      const spinBrake = clamp(spin * BALL.r * 0.11 * (surf === SURF.GREEN ? 1.25 : surf === SURF.FAIRWAY ? 0.85 : 0.4) * (1 - wet * 0.3), 0, 0.95);
      const keep = clamp(gp.keep * (1 - wet * 0.18) - spinBrake * (bounces === 0 ? 0.55 : 0.2), -0.25, 0.95);
      tx *= keep; ty *= keep; tz *= keep;
      const e = gp.e * (1 - wet * 0.35) * (bounces > 1 ? 0.85 : 1);
      vx = tx - vn * e * n.x; vy = ty - vn * e * n.y; vz = tz - vn * e * n.z;
      spin *= 0.45; bounces++;
      events.push({ type: "bounce", t, x, z, surf });
      if (-vn * e < 0.55 || surf === SURF.BUNKER) return roll({ x, y, z, vx, vy: 0, vz, t, path, events, env, dt, maxT, carry, spin, bounces, startShot: shot });
    }
    if (hole.surface(x, z) !== SURF.WATER) lastDry = { x, y: hole.height(x, z), z };
    if (Math.abs(x) > 5000 || y < -100) break;
  }
  return { path, carry: carry || 0, end: { x, y, z }, state: "rest", events, t };
}

/** 地上滾：坡度讓球加速或轉彎，草的阻力讓球停下；洞口判定 */
function roll(o) {
  let { x, y, z, vx, vz, t } = o;
  const { path, events, env, dt } = o, hole = env.hole, wet = env.wet ? 1 : 0;
  const pinY = hole.height(env.pin.x, env.pin.z);
  let lastSurf = null, still = 0, lastDry = { x, y, z }, it = 0;
  while (t < o.maxT) {
    it++;
    const surf = hole.surface(x, z);
    if (surf === SURF.WATER) { events.push({ type: "water", t, x, z }); return { path, carry: o.carry, end: { x, y, z }, lastDry, state: "water", events, t }; }
    lastDry = { x, y, z };
    const gp = GROUND[surf] || GROUND[SURF.ROUGH], n = hole.normal(x, z, 0.1);
    const sp = Math.hypot(vx, vz);
    // 坡度造成的加速度（沿地面的重力分量）
    const gx = G * n.x * n.y, gz = G * n.z * n.y;
    const mu = gp.roll * (1 + wet * 0.35) * (sp < 0.4 ? 1.25 : 1);
    if (sp < 0.025) {
      // 靜止：坡度大過靜摩擦才會再動
      if (Math.hypot(gx, gz) < mu * G * 1.15) { still++; if (still > 3) break; vx = 0; vz = 0; }
      else { vx += gx * dt; vz += gz * dt; }
    } else {
      still = 0;
      const dec = mu * G * dt;
      const nsp = Math.max(0, sp - dec);
      vx = (vx / sp) * nsp + gx * dt; vz = (vz / sp) * nsp + gz * dt;
    }
    x += vx * dt; z += vz * dt; t += dt;
    y = hole.height(x, z);
    // 洞口
    const dx = x - env.pin.x, dz = z - env.pin.z, dd = Math.hypot(dx, dz), v = Math.hypot(vx, vz);
    if (dd < CUP_R) {
      if (v < 1.45 || (dd < CUP_R * 0.45 && v < 1.9)) { events.push({ type: "holed", t }); path.push({ x: env.pin.x, y: pinY - 0.06, z: env.pin.z, t }); return { path, carry: o.carry, end: { x: env.pin.x, y: pinY - 0.06, z: env.pin.z }, state: "holed", events, t }; }
      // 速度太快：彈出、方向偏一點
      const k = 0.6; const ang = Math.atan2(vz, vx) + (dx * vz - dz * vx > 0 ? 0.35 : -0.35);
      vx = Math.cos(ang) * v * k; vz = Math.sin(ang) * v * k; events.push({ type: "lip", t });
    }
    if ((it & 3) === 0 || surf !== lastSurf) path.push({ x, y, z, t });
    lastSurf = surf;
    if (surf === SURF.OB && !o.putt) { /* 界外判定交給呼叫端（看停下來的位置） */ }
  }
  path.push({ x, y, z, t });
  return { path, carry: o.carry, end: { x, y, z }, lastDry, state: "rest", events, t };
}

/** 最常用的：某支桿滿桿在無風時的飛行距離（測試、球童建議用） */
export function carryOf(club, hole, power = 1) {
  const r = simulate({ x: 0, y: hole.height(0, 0), z: 0, dir: 0, club, power, lie: SURF.TEE }, { hole: FLAT, wind: { x: 0, z: 0 }, pin: { x: 9999, z: 9999 } }, { maxT: 15 });
  return r.carry;
}
/** 完全平坦、沒有障礙的測試場地 */
export const FLAT = { height: () => 0, normal: () => ({ x: 0, y: 1, z: 0 }), surface: () => SURF.FAIRWAY, trees: [], treesNear: () => [] };
