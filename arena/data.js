// 星域戰陣 — 資料表（陣營、兵種、升級卡、起始編隊）
// 三個原創陣營：鋼鐵聯邦（人類機甲）、晶耀聖族（靈能護盾）、蟲巢群落（蟲群）

export const FACTIONS = {
  fed: {
    id: 'fed', name: '鋼鐵聯邦', en: 'IRON FEDERATION', color: '#4da3ff', dark: '#12263f',
    desc: '槍砲與鋼鐵。射程長、火力穩定，靠醫護兵與攻城砲撐起戰線。',
  },
  lum: {
    id: 'lum', name: '晶耀聖族', en: 'LUMEN CONCLAVE', color: '#ffd45a', dark: '#3a2c0c',
    desc: '靈能與護盾。單位昂貴但精銳，護盾脫戰後會自動回充。',
  },
  brood: {
    id: 'brood', name: '蟲巢群落', en: 'BROOD SWARM', color: '#c45cff', dark: '#2c1240',
    desc: '數量就是力量。便宜、快速、成群結隊，用蟲海淹沒敵人。',
  },
};

// range 0 = 近戰；atk 決定攻擊表現與特殊判定
// tier 依關卡解鎖：1 開局、2 第 4 關、3 第 9 關、4 第 14 關
export const UNITS = {
  // ── 鋼鐵聯邦 ──
  trooper: {
    fac: 'fed', name: '陸戰兵', tier: 1, cost: 2, sup: 1, hp: 55, sh: 0, dmg: 6, range: 110, cd: 0.6, spd: 62, armor: 0, r: 9,
    atk: 'bullet', skill: { id: 'stim', name: '戰鬥激素', cd: 12, desc: '接敵時注射激素：攻速 +50%、移速 +30%，持續 6 秒（消耗 8 生命）。' },
  },
  scorcher: {
    fac: 'fed', name: '火焰兵', tier: 1, cost: 3, sup: 2, hp: 135, sh: 0, dmg: 9, range: 42, cd: 0.9, spd: 60, armor: 1, r: 11,
    atk: 'flame', splash: 34, skill: { id: 'flameburst', name: '烈焰爆燃', cd: 8, desc: '噴出大範圍烈焰，對目標周圍造成 2.5 倍傷害。普攻本身帶濺射。' },
  },
  medic: {
    fac: 'fed', name: '醫護兵', tier: 1, cost: 3, sup: 1, hp: 70, sh: 0, dmg: 9, range: 95, cd: 0.5, spd: 64, armor: 0, r: 9,
    atk: 'heal', skill: { id: 'nanoburst', name: '奈米脈衝', cd: 12, desc: '不會攻擊，持續治療受傷友軍；定期釋放脈衝治療周圍所有友軍。' },
  },
  sniper: {
    fac: 'fed', name: '幽影狙擊手', tier: 2, cost: 5, sup: 2, hp: 90, sh: 0, dmg: 22, range: 215, cd: 1.5, spd: 58, armor: 0, r: 9,
    atk: 'snipe', skill: { id: 'snipe', name: '致命狙殺', cd: 7, desc: '鎖定射程內最強壯的敵人，造成 5 倍無視護甲的傷害。' },
  },
  tank: {
    fac: 'fed', name: '破城砲車', tier: 2, cost: 6, sup: 3, hp: 210, sh: 0, dmg: 38, range: 250, cd: 2.4, spd: 40, armor: 2, r: 15,
    atk: 'shell', splash: 40, skill: { id: 'hexshell', name: '高爆彈', cd: 9, desc: '超遠射程的範圍砲擊；定期發射高爆彈，傷害 2.5 倍、範圍更大。' },
  },
  dread: {
    fac: 'fed', name: '無畏戰艦', tier: 4, cost: 10, sup: 6, hp: 650, sh: 0, dmg: 14, range: 150, cd: 0.35, spd: 42, armor: 3, r: 24,
    atk: 'bullet', skill: { id: 'nova', name: '湮滅主砲', cd: 12, desc: '浮空重型戰艦，連射光束砲；主砲充能後對目標造成毀滅性傷害。' },
  },
  // ── 晶耀聖族 ──
  blade: {
    fac: 'lum', name: '光刃衛士', tier: 1, cost: 3, sup: 2, hp: 90, sh: 50, dmg: 16, range: 0, cd: 0.9, spd: 64, armor: 1, r: 10,
    atk: 'melee', skill: { id: 'charge', name: '衝鋒', cd: 8, desc: '發現敵人時高速突進貼身，以雙光刃近戰。' },
  },
  stalker: {
    fac: 'lum', name: '相位獵手', tier: 1, cost: 4, sup: 2, hp: 80, sh: 60, dmg: 13, range: 150, cd: 1.0, spd: 76, armor: 1, r: 11,
    atk: 'bolt', skill: { id: 'blink', name: '相位閃現', cd: 12, desc: '護盾被打破時向後瞬移並回復 60% 護盾。' },
  },
  sentinel: {
    fac: 'lum', name: '護盾哨衛', tier: 2, cost: 4, sup: 2, hp: 50, sh: 60, dmg: 7, range: 130, cd: 0.8, spd: 60, armor: 0, r: 10,
    atk: 'beam', skill: { id: 'guardian', name: '守護力場', cd: 14, desc: '展開力場，周圍友軍受到的傷害 -35%，持續 6 秒。' },
  },
  psion: {
    fac: 'lum', name: '靈能祭司', tier: 2, cost: 6, sup: 3, hp: 50, sh: 55, dmg: 6, range: 170, cd: 1.2, spd: 56, armor: 0, r: 10,
    atk: 'bolt', skill: { id: 'storm', name: '靈能風暴', cd: 9, desc: '在敵人最密集處召喚雷暴，3 秒內持續造成大量範圍傷害。' },
  },
  strider: {
    fac: 'lum', name: '熾光行者', tier: 3, cost: 8, sup: 5, hp: 250, sh: 150, dmg: 20, range: 200, cd: 1.6, spd: 52, armor: 1, r: 19,
    atk: 'sweep', skill: { id: 'sweepP', name: '熱能橫掃', cd: 0, desc: '被動：高聳的四足機甲，熱能射線橫掃一整排敵人。' },
  },
  ark: {
    fac: 'lum', name: '星穹方舟', tier: 4, cost: 11, sup: 6, hp: 400, sh: 320, dmg: 30, range: 180, cd: 1.2, spd: 40, armor: 2, r: 25,
    atk: 'beam', skill: { id: 'warp', name: '時空凝滯', cd: 14, desc: '旗艦級浮空艦；張開凝滯場，範圍內敵人移動與攻擊速度 -55%。' },
  },
  // ── 蟲巢群落 ──
  clawling: {
    fac: 'brood', name: '利爪蟲', tier: 1, cost: 1, sup: 1, hp: 38, sh: 0, dmg: 6, range: 0, cd: 0.5, spd: 112, armor: 0, r: 7,
    atk: 'melee', skill: { id: 'adrenal', name: '腎上腺', cd: 0, desc: '被動：超高速近戰單位，生命低於一半時攻速 +40%。' },
  },
  burster: {
    fac: 'brood', name: '爆酸蟲', tier: 1, cost: 2, sup: 1, hp: 32, sh: 0, dmg: 55, range: 0, cd: 0.1, spd: 98, armor: 0, r: 7,
    atk: 'burst', splash: 46, skill: { id: 'burstP', name: '酸液自爆', cd: 0, desc: '被動：衝到敵人面前自爆，對周圍造成大量範圍傷害。' },
  },
  spitter: {
    fac: 'brood', name: '酸噬蟲', tier: 1, cost: 3, sup: 2, hp: 145, sh: 0, dmg: 11, range: 85, cd: 1.1, spd: 66, armor: 1, r: 11,
    atk: 'acid', skill: { id: 'regen', name: '急速再生', cd: 14, desc: '生命低於 45% 時，4 秒內回復 40% 最大生命。' },
  },
  spiner: {
    fac: 'brood', name: '棘刺獸', tier: 2, cost: 4, sup: 2, hp: 85, sh: 0, dmg: 14, range: 140, cd: 0.65, spd: 66, armor: 0, r: 10,
    atk: 'spine', skill: { id: 'frenzy', name: '狂暴', cd: 10, desc: '進入狂暴，攻速 +60%，持續 4 秒。' },
  },
  mother: {
    fac: 'brood', name: '育母蟲', tier: 3, cost: 7, sup: 4, hp: 230, sh: 0, dmg: 12, range: 200, cd: 1.8, spd: 46, armor: 1, r: 17,
    atk: 'spawn', skill: { id: 'spawnP', name: '寄生孵化', cd: 0, desc: '被動：每次攻擊都會在目標身旁孵出一隻短命的寄生幼蟲。' },
  },
  behemoth: {
    fac: 'brood', name: '巨甲獸', tier: 4, cost: 10, sup: 6, hp: 800, sh: 0, dmg: 30, range: 0, cd: 1.0, spd: 66, armor: 4, r: 24,
    atk: 'cleave', splash: 42, skill: { id: 'stomp', name: '震地踐踏', cd: 9, desc: '重甲巨獸，骨刃橫掃一片；定期踐踏地面，暈眩周圍敵人 1.2 秒。' },
  },
  // 召喚物（不可購買）
  broodling: {
    fac: 'brood', name: '寄生幼蟲', tier: 9, cost: 0, sup: 0, hp: 26, sh: 0, dmg: 4, range: 0, cd: 0.6, spd: 100, armor: 0, r: 5,
    atk: 'melee', skill: null,
  },
};
for (const k in UNITS) UNITS[k].id = k;

export const TIER_STAGE = { 1: 1, 2: 4, 3: 9, 4: 14 };

// 起始編隊：選好陣營後三選一
export const KITS = {
  fed: [
    { name: '步兵班', units: ['trooper', 'trooper', 'trooper', 'trooper'] },
    { name: '火力組', units: ['scorcher', 'trooper', 'trooper'] },
    { name: '持久戰', units: ['scorcher', 'medic', 'trooper'] },
  ],
  lum: [
    { name: '光刃雙衛', units: ['blade', 'blade'] },
    { name: '獵手小隊', units: ['stalker', 'stalker'] },
    { name: '均衡編制', units: ['blade', 'stalker'] },
  ],
  brood: [
    { name: '蟲海', units: ['clawling', 'clawling', 'clawling', 'clawling', 'clawling', 'clawling', 'clawling'] },
    { name: '酸蝕前線', units: ['spitter', 'spitter', 'clawling'] },
    { name: '自爆突襲', units: ['burster', 'burster', 'clawling', 'clawling', 'clawling'] },
  ],
};

// 永久升級卡：過關後三選一。max = 可疊加次數
export const CARDS = [
  { id: 'atk', icon: '⚔', name: '武器研發', desc: '全軍傷害 +10%', max: 10 },
  { id: 'arm', icon: '🛡', name: '裝甲鍍層', desc: '全軍護甲 +1', max: 6 },
  { id: 'hp', icon: '✚', name: '結構強化', desc: '全軍生命與護盾 +12%', max: 10 },
  { id: 'as', icon: '≫', name: '射控系統', desc: '全軍攻擊速度 +8%', max: 8 },
  { id: 'ms', icon: '➤', name: '推進器', desc: '全軍移動速度 +10%', max: 4 },
  { id: 'cdr', icon: '✦', name: '技能超載', desc: '技能冷卻 -10%', max: 5 },
  { id: 'ls', icon: '♥', name: '奈米修復', desc: '造成傷害的 5% 回復自身', max: 4 },
  { id: 'bar', icon: '◈', name: '開場力場', desc: '開戰時獲得 12% 最大生命的屏障', max: 4 },
  { id: 'cap', icon: '▲', name: '擴編指揮', desc: '人口上限 +2', max: 8 },
  { id: 'gold', icon: '◎', name: '戰利回收', desc: '過關金幣 +20%', max: 4 },
  { id: 'rng', icon: '⌖', name: '光學瞄具', desc: '遠程單位射程 +10%', max: 3 },
  // 陣營專屬（各只能拿一次）
  { id: 'stimfree', fac: 'fed', icon: '💉', name: '純化激素', desc: '陸戰兵的戰鬥激素不再扣血，持續時間 +3 秒', max: 1 },
  { id: 'siege', fac: 'fed', icon: '🎯', name: '攻城校準', desc: '破城砲車與狙擊手射程 +25%', max: 1 },
  { id: 'drone', fac: 'fed', icon: '🔧', name: '維修無人機', desc: '全軍每秒回復 1.2% 最大生命', max: 1 },
  { id: 'shcap', fac: 'lum', icon: '🔷', name: '護盾增幅', desc: '全軍護盾 +40%', max: 1 },
  { id: 'chstun', fac: 'lum', icon: '⚡', name: '雷霆衝鋒', desc: '光刃衛士衝鋒命中時暈眩目標 1.2 秒', max: 1 },
  { id: 'bigstorm', fac: 'lum', icon: '🌩', name: '靈能共鳴', desc: '靈能風暴與時空凝滯範圍 +35%', max: 1 },
  { id: 'metab', fac: 'brood', icon: '🧬', name: '代謝加速', desc: '利爪蟲與爆酸蟲移速、攻速 +30%', max: 1 },
  { id: 'twin', fac: 'brood', icon: '🥚', name: '雙生孵化', desc: '開戰時每隻利爪蟲額外孵出一隻', max: 1 },
  { id: 'regenall', fac: 'brood', icon: '🩸', name: '再生腺體', desc: '全軍每秒回復 1.5% 最大生命', max: 1 },
];

export const MAX_STAGE = 50;
export const STAR_MUL = [1, 1.8, 3.2];
