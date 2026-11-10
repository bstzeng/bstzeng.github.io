// 浮島工房 — 世界資料（世界一：綠草森林群島；世界二：熔岩沙漠群島）
export const W2Q = 40;                 // 世界二放在同一張座標圖上很遠的地方（q 位移），用傳送門來回
export const HR = 3.8;                 // 六角島外接圓半徑
export const APO = (HR * Math.sqrt(3)) / 2; // 邊心距

export const RES = {
  wood: { name: "木頭", icon: "🪵", color: 0x9b6a3c, w: 1 },
  stone: { name: "石頭", icon: "🪨", color: 0x9aa0a8, w: 1 },
  copper: { name: "銅礦", icon: "🟠", color: 0xd9773a, w: 1 },
  emerald: { name: "綠寶石", icon: "💎", color: 0x2ee88a, w: 1 },
  plank: { name: "木板", icon: "🟫", color: 0xd8a85f, w: 1 },
  ingot: { name: "銅錠", icon: "🟧", color: 0xf0a040, w: 1 },
  gel: { name: "黏液", icon: "🟢", color: 0x7cff6b, w: 1 },
  core: { name: "守衛者之核", icon: "⭐", color: 0xfcee0a, w: 1 },
  fiber: { name: "纖維", icon: "🌵", color: 0x6fae4a, w: 2 },
  sandstone: { name: "砂岩", icon: "🧱", color: 0xd9a55c, w: 2 },
  iron: { name: "鐵礦", icon: "🔘", color: 0x7a7f8c, w: 2 },
  obsidian: { name: "黑曜石", icon: "⬛", color: 0x2a2438, w: 2 },
  ruby: { name: "紅寶石", icon: "🔴", color: 0xff3355, w: 2 },
  steel: { name: "鐵錠", icon: "🔩", color: 0xc8d0dc, w: 2 },
  glass: { name: "玻璃", icon: "🧊", color: 0x9fe8ff, w: 2 },
  shell: { name: "甲殼", icon: "🦂", color: 0x9a5a34, w: 2 },
  magma: { name: "熔核", icon: "🔥", color: 0xff7a1a, w: 2 },
};
export const RES_ORDER = ["wood", "stone", "copper", "emerald", "plank", "ingot", "gel", "core", "fiber", "sandstone", "iron", "obsidian", "ruby", "steel", "glass", "shell", "magma"];

// 資源節點：hp 為需要的「工具傷害」，工具等級越高打越快
export const NODES = {
  tree: { tool: "axe", hp: 6, per: 2, drop: { wood: 1 }, respawn: 14, r: 0.5 },   // 每 2 點傷害掉 1 個木頭，共 3 個
  bigtree: { tool: "axe", hp: 12, per: 2, drop: { wood: 1 }, respawn: 26, r: 0.7 },
  rock: { tool: "pick", hp: 4, drop: { stone: 2 }, respawn: 18, r: 0.55 },
  copper: { tool: "pick", hp: 5, drop: { copper: 2 }, respawn: 30, r: 0.55 },
  emerald: { tool: "pick", hp: 7, drop: { emerald: 1 }, respawn: 40, r: 0.5, minLevel: 2 },
  cactus: { tool: "axe", hp: 6, per: 2, drop: { fiber: 1 }, respawn: 14, r: 0.45 },
  sandstone: { tool: "pick", hp: 5, drop: { sandstone: 2 }, respawn: 18, r: 0.55 },
  iron: { tool: "pick", hp: 8, drop: { iron: 2 }, respawn: 28, r: 0.55 },
  obsidian: { tool: "pick", hp: 12, drop: { obsidian: 1 }, respawn: 32, r: 0.5, minLevel: 3 },
  ruby: { tool: "pick", hp: 16, drop: { ruby: 1 }, respawn: 40, r: 0.5, minLevel: 4 },
};

export const ISLANDS = [
  { id: "home", q: 0, r: 0, start: true, name: "主島", nodes: { tree: 3, rock: 2 }, plots: ["warehouse", "workbench", "hut"] },
  { id: "pine", q: 1, r: 0, name: "松林", cost: { wood: 8 }, nodes: { tree: 7 } },
  { id: "gravel", q: -1, r: 1, name: "碎石坡", cost: { wood: 14, stone: 6 }, nodes: { rock: 5, tree: 1 } },
  { id: "copper", q: 0, r: 1, name: "銅礦谷", cost: { wood: 24, stone: 18 }, nodes: { copper: 4, rock: 2 }, slimes: 2 },
  { id: "works", q: 0, r: -1, name: "工坊台地", cost: { wood: 30, stone: 24, copper: 8 }, nodes: { tree: 3, rock: 1 }, plots: ["factory"] },
  { id: "oldwood", q: -1, r: 0, name: "古樹林", cost: { plank: 12, stone: 30 }, nodes: { bigtree: 5 }, slimes: 2 },
  { id: "emerald", q: 1, r: 1, name: "翡翠洞窟", cost: { plank: 18, ingot: 10 }, nodes: { emerald: 3, copper: 2 }, slimes: 3 },
  { id: "swamp", q: 2, r: 0, name: "史萊姆沼澤", cost: { ingot: 14, gel: 10 }, nodes: { copper: 3, tree: 2 }, slimes: 5 },
  { id: "boss", q: 3, r: -1, name: "魔王之岩", cost: { plank: 25, ingot: 18, emerald: 6 }, boss: true, plots: ["portal"] },
  // ---- 世界二：熔岩沙漠（heat = 每秒上升的熱度；lava = 熔岩裂縫數；mobs = 怪物）----
  { id: "oasis", w: 2, q: W2Q, r: 0, start: true, name: "綠洲", nodes: { cactus: 3, sandstone: 2 }, plots: ["warehouse2", "well0", "portal2"] },
  { id: "cactus", w: 2, q: W2Q + 1, r: 0, name: "仙人掌原", cost: { fiber: 16 }, nodes: { cactus: 6 } },
  { id: "sand", w: 2, q: W2Q - 1, r: 1, name: "砂岩丘", cost: { fiber: 24, sandstone: 12 }, nodes: { sandstone: 5, cactus: 1 } },
  { id: "iron", w: 2, q: W2Q, r: 1, name: "鐵礦脈", cost: { fiber: 30, sandstone: 30 }, nodes: { iron: 4, sandstone: 2 }, mobs: { scorpion: 2 } },
  { id: "forge", w: 2, q: W2Q, r: -1, name: "鍛造台地", cost: { sandstone: 40, iron: 16 }, nodes: { cactus: 2 }, plots: ["furnace", "workbench2"] },
  { id: "rift", w: 2, q: W2Q - 1, r: 0, name: "熔岩裂谷", cost: { steel: 10, glass: 8 }, nodes: { obsidian: 4 }, heat: 3, lava: 4, plots: ["well_rift"] },
  { id: "ruby", w: 2, q: W2Q + 1, r: 1, name: "紅寶石礦坑", cost: { steel: 14, glass: 10, shell: 6 }, nodes: { ruby: 3, iron: 2 }, heat: 3.5, lava: 2, mobs: { scorpion: 3 }, plots: ["well_ruby"] },
  { id: "nest", w: 2, q: W2Q + 2, r: 0, name: "火蜥蜴巢", cost: { steel: 16, obsidian: 8, shell: 8 }, nodes: { iron: 3, obsidian: 1 }, heat: 4, lava: 1, mobs: { salamander: 3 } },
  { id: "rim", w: 2, q: W2Q + 3, r: -1, name: "火山口外圍", cost: { obsidian: 14, ruby: 4, glass: 12 }, nodes: { obsidian: 3, ruby: 2 }, heat: 6, lava: 5, plots: ["well_rim"] },
  { id: "crater", w: 2, q: W2Q + 4, r: -2, name: "火山口", cost: { steel: 24, ruby: 8, obsidian: 16 }, heat: 2.5, boss2: true },
];

// 建築地基（在所屬島上的相對位置）
export const PLOTS = {
  warehouse: { name: "倉庫", pos: [-1.25, -0.8], prebuilt: true, r: 1.6 },
  workbench: { name: "工匠台", pos: [1.2, -0.75], cost: { wood: 12, stone: 6 }, r: 1.3 },
  hut: { name: "小幫手小屋", pos: [0.1, 1.55], cost: { wood: 24, stone: 18, copper: 6 }, r: 1.3 },
  factory: { name: "加工廠", pos: [0, 0], cost: { stone: 20, copper: 10 }, r: 1.5 },
  // type：建築種類（不寫就等於 id）；needs：出現的條件
  portal: { type: "portal", name: "傳送門：熔岩沙漠", pos: [0, 1.5], cost: { core: 1, plank: 10 }, r: 0.9, needs: "bossDefeated" },
  portal2: { type: "portal", name: "傳送門：森林群島", pos: [0.1, 1.55], prebuilt: true, r: 0.9 },
  warehouse2: { type: "warehouse", name: "倉庫", pos: [-1.25, -0.8], prebuilt: true, r: 1.6 },
  well0: { type: "well", name: "水井", pos: [1.3, -0.7], prebuilt: true, r: 1.2 },
  well_rift: { type: "well", name: "水井", pos: [0, 0], cost: { sandstone: 12, glass: 4 }, r: 1.2 },
  well_ruby: { type: "well", name: "水井", pos: [0, 0], cost: { sandstone: 12, glass: 4 }, r: 1.2 },
  well_rim: { type: "well", name: "水井", pos: [0, 0], cost: { sandstone: 16, glass: 8, steel: 6 }, r: 1.2 },
  furnace: { type: "furnace", name: "熔爐", pos: [-1.1, 0.1], cost: { sandstone: 20, iron: 10 }, r: 1.4 },
  workbench2: { type: "workbench", name: "工匠台", pos: [1.2, 0.2], cost: { fiber: 12, sandstone: 8 }, r: 1.3 },
};
export const PORTAL_PAIR = { portal: "portal2", portal2: "portal" };

// 工匠台升級：每一項的第 i 個元素是升到 Lv(i+2) 的費用
export const UPGRADES = {
  axe: { name: "斧頭", icon: "🪓", costs: [{ wood: 15, stone: 10 }, { plank: 15, ingot: 8 }, { steel: 10, fiber: 20 }, { steel: 20, ruby: 4 }], power: [1, 1.6, 2.6, 4, 6] },
  pick: { name: "鎬子", icon: "⛏️", costs: [{ wood: 10, stone: 20, copper: 5 }, { plank: 12, ingot: 10 }, { steel: 12, glass: 6 }, { steel: 20, obsidian: 10, ruby: 2 }], power: [1, 1.6, 2.6, 4, 6] },
  sword: { name: "劍", icon: "🗡️", costs: [{ stone: 10, copper: 10, gel: 4 }, { ingot: 10, emerald: 4 }, { steel: 12, shell: 6 }, { steel: 20, ruby: 6, obsidian: 8 }], power: [8, 14, 24, 38, 58] },
  bag: { name: "背包", icon: "🎒", costs: [{ wood: 18, stone: 10 }, { plank: 12, gel: 8 }, { ingot: 10, emerald: 4 }, { glass: 10, shell: 10 }], power: [20, 40, 70, 110, 160] },
  boots: { name: "隔熱靴", icon: "🥾", costs: [{ fiber: 20, shell: 6 }, { glass: 12, obsidian: 10 }], power: [1, 0.65, 0.4] },
  hut: { name: "第二位小幫手", icon: "🤖", costs: [{ plank: 10, ingot: 6 }], power: [1, 2] },
};

// at：在哪一種建築加工
export const RECIPES = [
  { id: "plank", at: "factory", from: { wood: 2 }, to: { plank: 1 }, time: 1.0 },
  { id: "ingot", at: "factory", from: { copper: 2 }, to: { ingot: 1 }, time: 1.6 },
  { id: "steel", at: "furnace", from: { iron: 2 }, to: { steel: 1 }, time: 1.6 },
  { id: "glass", at: "furnace", from: { sandstone: 2 }, to: { glass: 1 }, time: 1.2 },
];

export const PLAYER = { speed: 4.2, maxHp: 100, regen: 6, regenDelay: 3, swing: 0.42, reach: 0.85 };
export const MOBS = {
  slime: { hp: 24, dmg: 7, speed: 2.1, aggro: 3.0, cd: 1.0, respawn: 22, drop: { gel: 1 }, r: 0.35 },
  scorpion: { hp: 55, dmg: 11, speed: 2.8, aggro: 3.0, cd: 0.9, respawn: 26, drop: { shell: 1 }, r: 0.38 },
  // 火蜥蜴：保持距離吐火球（落點有紅圈預告）
  salamander: { hp: 70, dmg: 0, speed: 1.9, aggro: 4.2, cd: 2.4, respawn: 30, drop: { shell: 2 }, r: 0.4, ranged: { keep: 2.1, warn: 1.0, r: 0.75, dmg: 14 } },
};
export const SLIME = MOBS.slime;
export const BOSS = { hp: 520, r: 1.1, slamR: 1.6, slamDmg: 22, rockR: 1.0, rockDmg: 16, warn: 1.2, every: 2.4 };
export const HELPER = { cap: 10, speed: 4.2 };
// 熱度：0–100。滿了之後持續扣血；站在水井旁邊快速降溫
export const HEAT = { max: 100, burn: 7, wellR: 1.6, wellCool: 45, idleCool: 10, lavaR: 0.5, lavaDmg: 16, lavaHeat: 30 };
// 熔岩巨蟲：冒出地面時才打得到；鑽地後會從主角腳下衝出來；半血後場地外圈冒出熔岩
export const BOSS2 = { hp: 2600, r: 0.8, up: 4.5, under: 1.5, emergeR: 1.2, emergeDmg: 22, spitEvery: 2.6, spitR: 0.8, spitDmg: 12, spitWarn: 1.1, ringIn: 1.5, ringDmg: 9 };
