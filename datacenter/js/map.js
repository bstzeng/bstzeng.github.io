// 機房夜班：真實尺寸的資料中心平面（一格 = 一塊 0.6 m 高架地板）
// 整棟 300 × 200 格 ≈ 180 m × 120 m。四間資料機房、電力室、電池室、值班室、倉庫、大廳、卸貨區、戶外發電機。

export const W = 300, H = 200, TILE_M = 0.6;
export const T = { OUT: 0, CORR: 1, HALL: 2, PERF: 3, HOT: 4, OFFICE: 5, ELEC: 6, STORE: 7, DOCK: 8, WALL: 9, DOOR: 10, LOBBY: 11, GRASS: 12 };
const WALKABLE = new Set([T.OUT, T.CORR, T.HALL, T.PERF, T.HOT, T.OFFICE, T.ELEC, T.STORE, T.DOCK, T.DOOR, T.LOBBY, T.GRASS]);
export const tiles = new Uint8Array(W * H);
export const solid = new Uint8Array(W * H);
export const roomOf = new Int16Array(W * H).fill(-1);
export const objAt = new Int32Array(W * H).fill(-1);
export const rooms = [];
export const objects = [];
export const racks = [];
export const crahs = [];
export const halls = {};
export const idx = (x, y) => y * W + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const walkable = (x, y) => inMap(x, y) && !solid[idx(x, y)];

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------------- 機型與備品 ---------------- */
export const MODELS = {
  C1: { name: "NX-110 1U 計算節點", u: 1, drives: 4, drive: "SSD-960", psu: "PSU-800", fans: 6, fan: "FAN-1U", nic: "CAT6", watt: 350 },
  C2: { name: "NX-220 2U 計算節點", u: 2, drives: 8, drive: "NVME-3T8", psu: "PSU-800", fans: 4, fan: "FAN-2U", nic: "LC", watt: 600 },
  S4: { name: "ST-424 4U 儲存節點", u: 4, drives: 24, drive: "HDD-2T4", psu: "PSU-1600", fans: 4, fan: "FAN-4U", nic: "LC", watt: 900 },
  G4: { name: "GX-480 4U GPU 節點", u: 4, drives: 8, drive: "NVME-3T8", psu: "PSU-2400", fans: 6, fan: "FAN-4U", nic: "LC", watt: 2600 },
  SW: { name: "SW-48 機櫃頂交換器", u: 1, drives: 0, drive: null, psu: "PSU-800", fans: 0, fan: null, nic: "LC", watt: 200, sw: true },
};
export const PARTS = {
  "SSD-960": { name: "960GB SATA 固態硬碟", icon: "💾", kind: "drive" },
  "NVME-3T8": { name: "3.84TB NVMe 固態硬碟", icon: "💾", kind: "drive" },
  "HDD-2T4": { name: "2.4TB SAS 硬碟", icon: "💿", kind: "drive" },
  "PSU-800": { name: "800W 電源供應器", icon: "🔌", kind: "psu" },
  "PSU-1600": { name: "1600W 電源供應器", icon: "🔌", kind: "psu" },
  "PSU-2400": { name: "2400W 電源供應器", icon: "🔌", kind: "psu" },
  "FAN-1U": { name: "1U 風扇模組", icon: "🌀", kind: "fan" },
  "FAN-2U": { name: "2U 風扇模組", icon: "🌀", kind: "fan" },
  "FAN-4U": { name: "4U 風扇模組", icon: "🌀", kind: "fan" },
  "CAT6": { name: "CAT6 網路線", icon: "🟦", kind: "cable" },
  "LC": { name: "LC-LC 光纖跳線", icon: "🟨", kind: "cable" },
  "BLANK": { name: "1U 盲板", icon: "⬛", kind: "blank" },
  "FILTER": { name: "空調濾網", icon: "🧽", kind: "filter" },
  "SRV-C1": { name: "新機 NX-110（1U）", icon: "📦", kind: "server", model: "C1", size: 2 },
  "SRV-C2": { name: "新機 NX-220（2U）", icon: "📦", kind: "server", model: "C2", size: 3 },
};

/* ---------------- 房間 ---------------- */
const interior = new Uint8Array(W * H);
function fill(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[idx(x, y)] = t; }
function room(name, kind, x0, y0, x1, y1, floor) {
  const id = rooms.length;
  rooms.push({ id, name, kind, x0, y0, x1, y1 });
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (x < x0 || x > x1 || y < y0 || y > y1) { if (!interior[i]) tiles[i] = T.WALL; }
    else { tiles[i] = floor; interior[i] = 1; roomOf[i] = id; }
  }
  return rooms[id];
}
function door(x0, y0, x1, y1, label) { fill(x0, y0, x1, y1, T.DOOR); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) interior[idx(x, y)] = 1; if (label) doors.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, label }); }
export const doors = [];

/* ---------------- 物件 ---------------- */
export function addObject(o) {
  const id = objects.length;
  const ob = { id, h: 1, w: 1, d: 1, ...o };
  objects.push(ob);
  if (!o.noBlock) for (let y = ob.y; y < ob.y + ob.d; y++) for (let x = ob.x; x < ob.x + ob.w; x++) { const i = idx(x, y); objAt[i] = id; solid[i] = 1; }
  else for (let y = ob.y; y < ob.y + ob.d; y++) for (let x = ob.x; x < ob.x + ob.w; x++) objAt[idx(x, y)] = id;
  return ob;
}
export function removeObject(ob) {
  ob.removed = true;
  for (let y = ob.y; y < ob.y + ob.d; y++) for (let x = ob.x; x < ob.x + ob.w; x++) { const i = idx(x, y); if (objAt[i] === ob.id) { objAt[i] = -1; solid[i] = tiles[i] === T.WALL ? 1 : 0; } }
}

/* ---------------- 機房：機櫃排、冷熱通道、空調 ---------------- */
// 每間 100 × 60 格（60 m × 36 m）：10 排、每排 3 段 × 20 櫃 = 600 櫃
export const ROWS = 10, SEG = 3, PER_SEG = 20;
function rackColX(x0, pos) { const s = Math.floor(pos / PER_SEG); return x0 + 16 + s * (PER_SEG + 4) + (pos % PER_SEG); }
function rowY(y0, r) { const pair = r >> 1; return y0 + 10 + pair * 8 + (r & 1) * 4; }

function buildServers(r, kind) {
  // 從 U42 往下排：U42 機櫃頂交換器，然後依機型排滿，偶爾留空（有盲板）
  const list = [{ u: 42, model: "SW" }];
  let u = 40;
  const model = { c1: "C1", c2: "C2", s4: "S4", g4: "G4" }[kind];
  const h = MODELS[model].u;
  const maxN = { c1: 30, c2: 16, s4: 8, g4: 5 }[kind];
  let n = 0;
  while (u - h + 1 >= 3 && n < maxN) {
    if (r() < 0.12) { u -= h; continue; }           // 留空
    list.push({ u: u - h + 1, model });              // u = 最底下那一格
    u -= h; n++;
    if (kind === "g4") u -= 1;                        // GPU 機之間留散熱空間
  }
  return list;
}
function hall(letter, x0, y0) {
  const R = room(`${letter} 機房`, "hall", x0, y0, x0 + 99, y0 + 59, T.HALL);
  const hallInfo = { letter, x0, y0, x1: x0 + 99, y1: y0 + 59, room: R, racks: [], crahs: [] };
  halls[letter] = hallInfo;
  const r = rng(letter.charCodeAt(0) * 7919);
  // 冷通道（有孔地板）、熱通道
  for (let rr = 0; rr < ROWS; rr++) {
    const y = rowY(y0, rr), front = rr & 1 ? 1 : -1;
    for (let s = 0; s < SEG; s++) {
      const xa = rackColX(x0, s * PER_SEG), xb = xa + PER_SEG - 1;
      const cold = front < 0 ? y - 2 : y + 2, hot = front < 0 ? y + 2 : y - 2;
      fill(xa, cold, xb, cold + 1, T.PERF);
      fill(xa, hot, xb, hot + 1, T.HOT);
    }
  }
  // 機櫃
  for (let rr = 0; rr < ROWS; rr++) {
    const y = rowY(y0, rr), front = rr & 1 ? 1 : -1;
    for (let pos = 0; pos < SEG * PER_SEG; pos++) {
      const x = rackColX(x0, pos);
      const t = r();
      const kind = t < 0.42 ? "c1" : t < 0.72 ? "c2" : t < 0.88 ? "s4" : "g4";
      const servers = buildServers(r, kind).map((s, i) => ({ ...s, i, faults: {}, pulled: {}, up: true, serial: `SN${letter}${(rr + 1) * 1000 + pos}${String(s.u).padStart(2, "0")}${Math.floor(r() * 90 + 10)}` }));
      const label = `${letter}${String(rr + 1).padStart(2, "0")}-${String(pos + 1).padStart(2, "0")}`;
      const ob = addObject({ kind: "rack", x, y, w: 1, d: 2, h: 2.0, hall: letter, row: rr, pos, front, label, rackKind: kind });
      const rack = { id: racks.length, ob, hall: letter, row: rr, pos, front, label, kind, servers, blanks: [], pdu: { A: { on: true, amps: 0 }, B: { on: true, amps: 0 } } };
      // 空的 U 都有盲板
      const used = new Set(); for (const s of servers) for (let k = 0; k < MODELS[s.model].u; k++) used.add(s.u + k);
      for (let u2 = 1; u2 <= 42; u2++) if (!used.has(u2)) rack.blanks.push(u2);
      ob.rack = rack;
      racks.push(rack); hallInfo.racks.push(rack);
    }
  }
  // 精密空調：沿左右牆
  let n = 1;
  for (const side of [0, 1]) for (let k = 0; k < 7; k++) {
    const x = side ? x0 + 96 : x0 + 1, y = y0 + 6 + k * 7;
    const ob = addObject({ kind: "crah", x, y, w: 3, d: 4, h: 2.0, hall: letter, label: `CRAH-${letter}${n++}` });
    const c = { id: crahs.length, ob, hall: letter, label: ob.label, ok: true, fault: null, cx: x + 1.5, cy: y + 2 };
    ob.crah = c; crahs.push(c); hallInfo.crahs.push(c);
  }
  // 機房下方：配電櫃、滅火器
  for (let k = 0; k < 6; k++) addObject({ kind: "pdu", x: x0 + 18 + k * 12, y: y0 + 54, w: 3, d: 2, h: 1.9, label: `配電櫃 ${letter}-${k + 1}` });
  for (const [x, y] of [[x0 + 6, y0 + 2], [x0 + 92, y0 + 2], [x0 + 6, y0 + 56], [x0 + 92, y0 + 56]]) addObject({ kind: "extinguisher", x, y, h: 0.7 });
  return hallInfo;
}

/* ---------------- 整棟建築 ---------------- */
export const places = {};
(function build() {
  fill(0, 0, W - 1, H - 1, T.GRASS);
  fill(3, 3, 296, 175, T.WALL);
  fill(3, 176, 296, 191, T.OUT);                          // 戶外柏油（發電機場）
  fill(297, 84, 299, 160, T.OUT);                         // 大門、卸貨門外的車道
  // 走廊
  room("北走廊", "corr", 4, 66, 251, 71, T.CORR);
  room("南走廊", "corr", 4, 106, 251, 111, T.CORR);
  room("中央走廊", "corr", 208, 4, 215, 173, T.CORR);
  room("東走廊", "corr", 246, 4, 251, 173, T.CORR);
  // 機房
  hall("A", 4, 4); hall("B", 106, 4); hall("C", 4, 114); hall("D", 106, 114);
  // 電力室、電池室
  const elec = [["電力室 A", 4, 50], ["電池室 A", 53, 103], ["電力室 B", 106, 152], ["電池室 B", 155, 205]];
  for (const [n, a, b] of elec) room(n, n.startsWith("電池") ? "battery" : "elec", a, 74, b, 103, T.ELEC);
  // 支援區
  room("值班室", "noc", 218, 4, 244, 30, T.OFFICE);
  room("備品倉庫", "store", 218, 33, 244, 62, T.STORE);
  room("更衣室", "locker", 218, 75, 244, 92, T.OFFICE);
  room("保全室", "security", 218, 95, 244, 103, T.OFFICE);
  room("網路匯接室", "mmr", 218, 114, 244, 140, T.HALL);
  room("組裝測試間", "staging", 218, 143, 244, 173, T.STORE);
  room("休息室", "break", 253, 4, 294, 30, T.OFFICE);
  room("退貨區", "rma", 253, 33, 294, 62, T.STORE);
  room("大廳", "lobby", 253, 75, 294, 103, T.LOBBY);
  room("卸貨區", "dock", 253, 114, 294, 173, T.DOCK);
  // 門
  for (const x of [28, 76]) { door(x, 64, x + 2, 65); door(x, 112, x + 2, 113); }
  for (const x of [132, 180]) { door(x, 64, x + 2, 65); door(x, 112, x + 2, 113); }
  door(206, 30, 207, 32); door(206, 140, 207, 142);
  door(20, 72, 21, 73); door(20, 104, 21, 105); door(70, 72, 71, 73); door(125, 72, 126, 73); door(125, 104, 126, 105); door(180, 72, 181, 73);
  door(216, 15, 217, 16); door(245, 15, 245, 16); door(216, 45, 217, 47); door(245, 45, 245, 47);
  door(245, 82, 245, 83); door(245, 98, 245, 99); door(245, 125, 245, 126); door(245, 155, 245, 157);
  door(252, 15, 252, 16); door(252, 45, 252, 46); door(252, 88, 252, 90, "安檢門"); door(252, 140, 252, 142);
  door(295, 87, 296, 90, "大門"); door(295, 150, 296, 158, "卸貨門"); door(210, 174, 213, 175, "往發電機場");
  for (let i = 0; i < W * H; i++) if (tiles[i] === T.WALL) solid[i] = 1;

  /* 支援區的物件 */
  // 值班室：監控牆、座位
  addObject({ kind: "videowall", x: 221, y: 5, w: 20, d: 1, h: 2.6, label: "監控大螢幕" });
  for (const y of [12, 18, 24]) for (const x of [222, 230, 238]) addObject({ kind: "desk", x, y, w: 5, d: 2, h: 0.75, label: "值班座位" });
  // 倉庫：備品架
  const shelfParts = [["SSD-960", "NVME-3T8", "HDD-2T4"], ["PSU-800", "PSU-1600", "PSU-2400"], ["FAN-1U", "FAN-2U", "FAN-4U"], ["CAT6", "LC", "BLANK", "FILTER"]];
  shelfParts.forEach((parts, k) => addObject({ kind: "shelf", x: 220, y: 36 + k * 6, w: 12, d: 2, h: 2.2, label: ["硬碟架", "電源架", "風扇架", "線材・雜項架"][k], parts }));
  addObject({ kind: "shelf", x: 234, y: 36, w: 2, d: 20, h: 2.2, label: "備用架", parts: [] , decor: true });
  // 退貨區
  addObject({ kind: "rma", x: 262, y: 44, w: 4, d: 3, h: 1.0, label: "退貨箱（壞零件放這裡）" });
  for (const [x, y] of [[272, 38], [278, 38], [284, 50], [270, 54]]) addObject({ kind: "pallet", x, y, w: 3, d: 3, h: 1.1 });
  // 更衣室：置物櫃、防靜電工具台
  addObject({ kind: "locker", x: 220, y: 76, w: 16, d: 1, h: 2.0, label: "置物櫃" });
  addObject({ kind: "toolbench", x: 226, y: 86, w: 6, d: 2, h: 0.9, label: "工具台（防靜電手環、工具）" });
  addObject({ kind: "bench", x: 238, y: 84, w: 4, d: 1, h: 0.45 });
  // 保全室
  addObject({ kind: "desk", x: 224, y: 98, w: 6, d: 2, h: 0.75, label: "保全監視器" });
  // 大廳
  addObject({ kind: "reception", x: 270, y: 84, w: 8, d: 3, h: 1.1, label: "服務台" });
  for (const [x, y] of [[258, 78], [258, 96], [288, 78], [288, 96]]) addObject({ kind: "plant", x, y, w: 1, d: 1, h: 1.2 });
  addObject({ kind: "sofa", x: 260, y: 90, w: 2, d: 5, h: 0.8 });
  // 休息室
  for (const [x, y] of [[260, 12], [270, 12], [280, 12], [260, 22], [270, 22]]) addObject({ kind: "table", x, y, w: 3, d: 3, h: 0.75 });
  addObject({ kind: "vending", x: 290, y: 6, w: 2, d: 2, h: 1.9, label: "飲料機" });
  addObject({ kind: "sofa", x: 284, y: 20, w: 6, d: 2, h: 0.8 });
  // 網路匯接室：網路櫃
  for (const y of [118, 126, 134]) for (let x = 222; x < 242; x++) addObject({ kind: "netrack", x, y, w: 1, d: 2, h: 2.1 });
  // 組裝測試間：待上架設備、工作台
  addObject({ kind: "staging", x: 220, y: 146, w: 10, d: 2, h: 1.6, label: "待上架新機" });
  for (const y of [154, 162]) addObject({ kind: "workbench", x: 222, y, w: 8, d: 3, h: 0.9 });
  // 卸貨區
  for (const [x, y] of [[258, 120], [264, 120], [270, 120], [258, 128], [276, 140], [284, 160]]) addObject({ kind: "pallet", x, y, w: 3, d: 3, h: 1.2 });
  addObject({ kind: "forklift", x: 280, y: 128, w: 2, d: 3, h: 1.8 });
  // 電力室：UPS、配電盤；電池室：電池架
  for (const [n, a, b] of elec) {
    if (n.startsWith("電池")) for (let y = 78; y <= 98; y += 5) addObject({ kind: "battery", x: a + 4, y, w: b - a - 8, d: 2, h: 1.6, label: `${n} 電池架` });
    else { for (let k = 0; k < 6; k++) addObject({ kind: "ups", x: a + 6 + k * 6, y: 78, w: 4, d: 2, h: 1.9, label: `${n} UPS-${k + 1}` }); addObject({ kind: "switchgear", x: a + 6, y: 92, w: 30, d: 2, h: 2.1, label: `${n} 配電盤` }); }
  }
  // 戶外：發電機、儲油槽、冷卻水塔、樹
  for (let k = 0; k < 8; k++) addObject({ kind: "generator", x: 10 + k * 24, y: 181, w: 14, d: 6, h: 3.0, label: `柴油發電機 G${k + 1}` });
  addObject({ kind: "tank", x: 225, y: 182, w: 10, d: 5, h: 2.6, label: "儲油槽" });
  for (let k = 0; k < 3; k++) addObject({ kind: "tower", x: 244 + k * 16, y: 180, w: 10, d: 10, h: 4.0, label: "冷卻水塔" });
  const rt = rng(99);
  for (let k = 0; k < 70; k++) { const x = Math.floor(rt() * W), y = Math.floor(rt() * H); if (tiles[idx(x, y)] === T.GRASS && !solid[idx(x, y)]) addObject({ kind: "tree", x, y, h: 3 }); }

  places.lobby = { x: 282, y: 92 }; places.locker = { x: 229, y: 89 }; places.store = { x: 226, y: 46 }; places.noc = { x: 231, y: 28 };
})();

export function roomAt(x, y) { const i = roomOf[idx(Math.floor(x), Math.floor(y))]; return i >= 0 ? rooms[i] : null; }
export function rackByLabel(label) { return racks.find((r) => r.ob.label === label); }
/** 機櫃前面／後面站的位置 */
export function rackSpot(rack, side = "front") {
  const ob = rack.ob, f = rack.front * (side === "front" ? 1 : -1);
  return { x: ob.x, y: f < 0 ? ob.y - 1 : ob.y + 2 };
}
/** 物件旁邊最近的可站位置 */
export function standSpot(ob, from) {
  let best = null;
  for (let y = ob.y - 1; y <= ob.y + ob.d; y++) for (let x = ob.x - 1; x <= ob.x + ob.w; x++) {
    if (x >= ob.x && x < ob.x + ob.w && y >= ob.y && y < ob.y + ob.d) continue;
    if (!walkable(x, y)) continue;
    const d = from ? Math.hypot(x - from.x, y - from.y) : 0;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}
export function nearestWalkable(x, y, maxR = 12) {
  x = Math.round(x); y = Math.round(y);
  if (walkable(x, y)) return { x, y };
  for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return null;
}
