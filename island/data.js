// 浮島工房 — 世界資料（第一世界：綠草森林群島）
export const HR = 5;                 // 六角島外接圓半徑
export const APO = (HR * Math.sqrt(3)) / 2; // 邊心距

export const RES = {
  wood: { name: "木頭", icon: "🪵", color: 0x9b6a3c },
  stone: { name: "石頭", icon: "🪨", color: 0x9aa0a8 },
  copper: { name: "銅礦", icon: "🟠", color: 0xd9773a },
  emerald: { name: "綠寶石", icon: "💎", color: 0x2ee88a },
  plank: { name: "木板", icon: "🟫", color: 0xd8a85f },
  ingot: { name: "銅錠", icon: "🟧", color: 0xf0a040 },
  gel: { name: "黏液", icon: "🟢", color: 0x7cff6b },
  core: { name: "守衛者之核", icon: "⭐", color: 0xfcee0a },
};
export const RES_ORDER = ["wood", "stone", "copper", "emerald", "plank", "ingot", "gel", "core"];

// 資源節點：hp 為需要的「工具傷害」，工具等級越高打越快
export const NODES = {
  tree: { tool: "axe", hp: 3, drop: { wood: 2 }, respawn: 14, r: 0.5 },
  bigtree: { tool: "axe", hp: 6, drop: { wood: 5 }, respawn: 26, r: 0.75 },
  rock: { tool: "pick", hp: 4, drop: { stone: 2 }, respawn: 18, r: 0.55 },
  copper: { tool: "pick", hp: 5, drop: { copper: 2 }, respawn: 30, r: 0.55 },
  emerald: { tool: "pick", hp: 7, drop: { emerald: 1 }, respawn: 40, r: 0.5, minLevel: 2 },
};

export const ISLANDS = [
  { id: "home", q: 0, r: 0, name: "主島", nodes: { tree: 4, rock: 3 }, plots: ["warehouse", "workbench", "hut"] },
  { id: "pine", q: 1, r: 0, name: "松林", cost: { wood: 8 }, nodes: { tree: 7 } },
  { id: "gravel", q: -1, r: 1, name: "碎石坡", cost: { wood: 14, stone: 6 }, nodes: { rock: 5, tree: 1 } },
  { id: "copper", q: 0, r: 1, name: "銅礦谷", cost: { wood: 24, stone: 18 }, nodes: { copper: 4, rock: 2 }, slimes: 2 },
  { id: "works", q: 0, r: -1, name: "工坊台地", cost: { wood: 30, stone: 24, copper: 8 }, nodes: { tree: 3, rock: 1 }, plots: ["factory"] },
  { id: "oldwood", q: -1, r: 0, name: "古樹林", cost: { plank: 12, stone: 30 }, nodes: { bigtree: 5 }, slimes: 2 },
  { id: "emerald", q: 1, r: 1, name: "翡翠洞窟", cost: { plank: 18, ingot: 10 }, nodes: { emerald: 3, copper: 2 }, slimes: 3 },
  { id: "swamp", q: 2, r: 0, name: "史萊姆沼澤", cost: { ingot: 14, gel: 10 }, nodes: { copper: 3, tree: 2 }, slimes: 5 },
  { id: "boss", q: 3, r: -1, name: "魔王之岩", cost: { plank: 25, ingot: 18, emerald: 6 }, boss: true },
];

// 建築地基（在所屬島上的相對位置）
export const PLOTS = {
  warehouse: { name: "倉庫", pos: [-1.6, -1.0], prebuilt: true, r: 2.0 },
  workbench: { name: "工匠台", pos: [1.7, -1.0], cost: { wood: 12, stone: 6 }, r: 1.5 },
  hut: { name: "小幫手小屋", pos: [0, 1.9], cost: { wood: 24, stone: 18, copper: 6 }, r: 1.5 },
  factory: { name: "加工廠", pos: [0, 0], cost: { stone: 20, copper: 10 }, r: 1.7 },
};

// 工匠台升級：每一項的第 i 個元素是升到 Lv(i+2) 的費用
export const UPGRADES = {
  axe: { name: "斧頭", icon: "🪓", costs: [{ wood: 15, stone: 10 }, { plank: 15, ingot: 8 }], power: [1, 1.6, 2.6] },
  pick: { name: "鎬子", icon: "⛏️", costs: [{ wood: 10, stone: 20, copper: 5 }, { plank: 12, ingot: 10 }], power: [1, 1.6, 2.6] },
  sword: { name: "劍", icon: "🗡️", costs: [{ stone: 10, copper: 10, gel: 4 }, { ingot: 10, emerald: 4 }], power: [8, 14, 24] },
  bag: { name: "背包", icon: "🎒", costs: [{ wood: 18, stone: 10 }, { plank: 12, gel: 8 }, { ingot: 10, emerald: 4 }], power: [20, 40, 70, 110] },
  hut: { name: "第二位小幫手", icon: "🤖", costs: [{ plank: 10, ingot: 6 }], power: [1, 2] },
};

export const RECIPES = [
  { id: "plank", from: { wood: 2 }, to: { plank: 1 }, time: 1.0 },
  { id: "ingot", from: { copper: 2 }, to: { ingot: 1 }, time: 1.6 },
];

export const PLAYER = { speed: 4.2, maxHp: 100, regen: 6, regenDelay: 3, swing: 0.42, reach: 0.85 };
export const SLIME = { hp: 24, dmg: 7, speed: 2.1, aggro: 4.5, cd: 1.0, respawn: 22, drop: { gel: 1 } };
export const BOSS = { hp: 520, r: 1.4, slamR: 2.0, slamDmg: 22, rockR: 1.25, rockDmg: 16, warn: 1.2, every: 2.4 };
export const HELPER = { cap: 10, speed: 4.2 };
