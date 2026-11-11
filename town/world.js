// 桜町：地圖配置與所有靜態建築
import * as THREE from 'three';
import { Kit, rng } from './kit.js';

export const SL = 0.15;                       // 人行道／街區高度
export const XROADS = [-60, 0, 60];           // 南北向道路
export const ZROADS = [-70, -25, 25, 70];     // 東西向道路
export const CROSS_X = [-60, 0, 60];          // 平交道
export const STATIONS = [
  { x: -105, name: '桜町', kana: 'さくらまち', en: 'Sakuramachi', zh: '櫻町站' },
  { x: 105, name: '湯の里', kana: 'ゆのさと', en: 'Yunosato', zh: '湯之里站' },
];
export const BOUND = { x: 133, z: 124 };

const C = {
  asphalt: 0x3f4248, side: 0xb9b6ae, line: 0xe9e7df, yellow: 0xe8b923,
  wood: 0x4a3324, woodL: 0x8a6a48, woodD: 0x30221a, plaster: 0xeee6d3, white: 0xf3f1ea,
  tile: 0x3d4654, tileB: 0x4d5b6e, tileBr: 0x5d4030, tileG: 0x35524a,
  verm: 0xd2401f, stone: 0x9b978c, stoneD: 0x6f6c66, grass: 0x7aa957, leaf: 0x3f7d3a, leafD: 0x2a5533,
  sakura: 0xf5b5cc, sakura2: 0xf9cfe0, glassDark: 0x2c3a48, concrete: 0xa9a79f, metal: 0x7b8187,
  black: 0x1d1d20, red: 0xc8321e, bamboo: 0xb99b5a, gold: 0xd4a93a,
};
const HOUSE_WALL = [0xefe8d8, 0xe6dcc6, 0xd9d4c8, 0xcdb99a, 0x8a6a4c, 0xf2efe6, 0xbfc8c9];
const ROOFS = [C.tile, C.tileB, C.tileBr, C.tileG, 0x34393f];
const BLDG = [0xc9c4b8, 0xb5b9bd, 0xd8cdb8, 0x9aa7b0, 0xb08f7a, 0xdad6cf, 0x8f9a8c, 0xc7b3a5];
const APT = [0xe8dfd0, 0xe3cfc4, 0xcfd6d9, 0xd9d2c0, 0xc4cbb8];
const CARS = [0xf2f2f2, 0xc9ccd1, 0xd03a2a, 0x2f5fa8, 0xf0c62a, 0x2e2e33, 0x8ec6c0];

const SHOPS_M = [
  ['ラーメン', '麺屋 さくら', 0xb3261e], ['寿司', '寿司処 海', 0x1e3a6e], ['そば', '手打ちそば', 0x22313f],
  ['居酒屋', '酒処 たぬき', 0x7a1f1f], ['焼鳥', 'やきとり 鳥吉', 0x8a2a12], ['お茶', 'お茶の井筒', 0x3f5d2a],
  ['和菓子', '菓子司 月うさぎ', 0x7a3d5a], ['うどん', 'うどん 福', 0x243a5e], ['たこ焼', 'たこ焼 だるま', 0xb3261e],
  ['地酒', '酒蔵 桜正宗', 0x2b2b2b], ['甘味', '甘味処 花', 0xa23b5a], ['天ぷら', '天ぷら 松', 0x1e3a6e],
  ['定食', '食堂 まんぷく', 0x7a4a12], ['呉服', 'きもの 京', 0x4a2a6a], ['古本', '古書 ふくろう', 0x3a3a2a],
  ['とうふ', '豆腐 白川', 0x2d5a6a], ['団子', '茶屋 みたらし', 0x6a4a1a], ['漬物', '京つけもの', 0x4a5a22],
];
const SHOPS_Z = [
  ['カラオケ', 0xe91e63], ['ドラッグ', 0x1565c0], ['書店', 0x2e7d32], ['カレー', 0xf9a825], ['牛丼', 0xe65100],
  ['歯科', 0x00838f], ['学習塾', 0x283593], ['不動産', 0x2e7d32], ['美容室', 0xad1457], ['ゲーム', 0x6a1b9a],
  ['パン', 0x8d6e63], ['喫茶', 0x5d4037], ['写真館', 0x37474f], ['麻雀', 0x1b5e20], ['電器', 0xc62828],
  ['弁当', 0xef6c00], ['花屋', 0x388e3c], ['銀行', 0x0d47a1], ['ホテル', 0x4527a0], ['居酒屋', 0xb71c1c],
  ['焼肉', 0xb71c1c], ['整骨院', 0x00796b], ['古着', 0x6d4c41], ['英会話', 0x1976d2],
];
const ADS = [['桜ビール', 0xf9a825, '#3a1a00'], ['湯の里温泉', 0x1e3a6e, '#ffffff'], ['ニコマート', 0x18a058, '#ffffff'], ['さくら銀行', 0xd81b60, '#ffffff'], ['旅は電車で', 0x00838f, '#ffffff']];
export const SIGN_TEXT = SHOPS_M.map((s) => s[0] + s[1]).join('') + SHOPS_Z.map((s) => s[0]).join('') + ADS.map((s) => s[0]).join('') +
  '営業中本日のおすすめ一品料理コーポ桜ハイツ湯の里さくら荘メゾン桜町おでんからあげ新発売コーヒー100円おにぎりゆ桜湯交番KOBAN月極駐車場神社桜山授与所おみくじ絵馬奉納旅館露天風呂男女♨お手洗公園駅12:00ニコマートNICO MARTさくらまちゆのさと';
const css = (h) => '#' + h.toString(16).padStart(6, '0');
const shade = (h, f = .8) => (Math.round(((h >> 16) & 255) * f) << 16) | (Math.round(((h >> 8) & 255) * f) << 8) | Math.round((h & 255) * f);

export function buildWorld(scene, atlas) {
  const R = rng(20261111), K = new Kit(atlas);
  const info = {
    kit: K, colliders: K.cols, slabs: [], zones: [], hz: [], inter: [], spots: [], bldgs: [],
    steam: [], waters: [], wires: [], crossings: [], count: 0, pool: null, landmarks: [],
  };
  const pick = (a) => a[Math.floor(R() * a.length)];
  let mi = 0, zi = 0;
  const shopsM = SHOPS_M.slice().sort(() => R() - .5), shopsZ = SHOPS_Z.slice().sort(() => R() - .5);

  // ---------- 貼圖 ----------
  const rShelf = [0, 1, 2].map((k) => atlas.custom('shelf' + k, 256, 128, (c, w, h) => {
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, w, h);
    const cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#f06292', '#6d4c41', '#00acc1', '#fafafa'];
    for (let r = 0; r < 4; r++) {
      c.fillStyle = '#b9b3a4'; c.fillRect(0, r * 32 + 28, w, 4);
      for (let x = 2; x < w - 8;) { const bw = 8 + Math.floor(R() * 12); c.fillStyle = pick(cols); c.fillRect(x, r * 32 + 5 + Math.floor(R() * 5), bw, 23); x += bw + 2; }
    }
  }));
  const rFridge = atlas.custom('fridge', 512, 128, (c, w, h) => {
    c.fillStyle = '#dff3fb'; c.fillRect(0, 0, w, h);
    const cols = ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#fdd835', '#6d4c41', '#ffffff', '#00acc1'];
    for (let r = 0; r < 4; r++) for (let x = 6; x < w - 8; x += 10) { c.fillStyle = pick(cols); c.fillRect(x, r * 31 + 6, 7, 22); }
    c.fillStyle = '#7d8a91'; for (let x = 0; x <= w; x += 64) c.fillRect(x - 3, 0, 6, h);
    for (let r = 1; r < 4; r++) { c.fillStyle = '#b8c7cd'; c.fillRect(0, r * 31 + 1, w, 3); }
  });
  const rLogo = atlas.custom('nico', 944, 64, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7a1a'; c.fillRect(0, 0, w, 12); c.fillStyle = '#18a058'; c.fillRect(0, 52, w, 12);
    c.fillStyle = '#18a058'; c.font = '900 34px "Noto Sans JP","Noto Sans TC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ニコマート　NICO MART', w / 2, 33);
    c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(w / 2 - 250, 32, 13, 0, 7); c.fill(); c.beginPath(); c.arc(w / 2 + 250, 32, 13, 0, 7); c.fill();
  });
  const rLogo2 = atlas.custom('nico2', 128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7a1a'; c.fillRect(0, 0, w, 26); c.fillStyle = '#18a058'; c.fillRect(0, 102, w, 26);
    c.fillStyle = '#18a058'; c.font = '900 46px "Noto Sans JP","Noto Sans TC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ニコ', w / 2, 66);
  });
  const rVend = [0xd9d9d9, 0xc62828, 0x1e63b5].map((col, k) => atlas.custom('vend' + k, 96, 176, (c, w, h) => {
    c.fillStyle = css(col); c.fillRect(0, 0, w, h);
    c.fillStyle = '#f7fbff'; c.fillRect(8, 8, w - 16, 92);
    const cols = ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#fdd835', '#6d4c41', '#00acc1', '#f06292'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { c.fillStyle = pick(cols); c.fillRect(13 + i * 12, 13 + r * 29, 9, 20); c.fillStyle = r < 2 ? '#2a6fdb' : '#e53935'; c.fillRect(13 + i * 12, 35 + r * 29, 9, 3); }
    c.fillStyle = '#222'; c.fillRect(14, 112, 30, 16); c.fillRect(54, 110, 26, 30); c.fillStyle = '#111'; c.fillRect(14, 146, w - 28, 18);
  }));
  const rEma = atlas.custom('ema', 256, 128, (c, w, h) => {
    c.fillStyle = '#6b4a2c'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      const x = 6 + i * 28 + (r % 2) * 8, y = 6 + r * 40;
      c.fillStyle = pick(['#e7c58f', '#dcb77c', '#f0d6a8']); c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + 11, y); c.lineTo(x + 22, y + 8); c.lineTo(x + 22, y + 30); c.lineTo(x, y + 30); c.fill();
      c.fillStyle = pick(['#c0392b', '#333', '#8e44ad']); c.fillRect(x + 5, y + 13, 12, 3); c.fillRect(x + 5, y + 19, 9, 3);
    }
  });
  const rKuji = atlas.custom('kuji', 256, 128, (c, w, h) => {
    c.fillStyle = '#7a5536'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 5; r++) { c.fillStyle = '#3a2718'; c.fillRect(0, 10 + r * 24, w, 3); for (let x = 4; x < w - 6; x += 7 + Math.floor(R() * 5)) { c.fillStyle = '#fbfbf6'; c.fillRect(x, 6 + r * 24, 5, 14 + Math.floor(R() * 6)); } }
  });
  const rCharm = atlas.custom('charm', 256, 96, (c, w, h) => {
    c.fillStyle = '#fff6dd'; c.fillRect(0, 0, w, h);
    const cols = ['#d32f2f', '#f9a825', '#7b1fa2', '#1976d2', '#388e3c', '#e91e63', '#ffffff'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 10; i++) { c.fillStyle = pick(cols); c.fillRect(10 + i * 24, 8 + r * 44, 15, 30); c.fillStyle = '#d4a93a'; c.fillRect(10 + i * 24, 8 + r * 44, 15, 5); }
  });
  const rTicket = atlas.custom('ticket', 256, 128, (c, w, h) => {
    c.fillStyle = '#cfd6da'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2; i++) { const x = 12 + i * 124; c.fillStyle = '#4a5a66'; c.fillRect(x, 10, 108, 108); c.fillStyle = '#9fe0ff'; c.fillRect(x + 10, 20, 60, 44); c.fillStyle = '#ffd54f'; for (let k = 0; k < 6; k++) c.fillRect(x + 12 + (k % 3) * 20, 74 + Math.floor(k / 3) * 18, 14, 12); c.fillStyle = '#111'; c.fillRect(x + 78, 30, 20, 60); }
  });
  function nameBoard(st, i) {
    return atlas.custom('st' + i, 384, 192, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b7a4b'; c.fillRect(0, 118, w, 16);
      c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 58px "Noto Sans JP","Noto Sans TC",sans-serif'; c.fillText(st.kana, w / 2, 48);
      c.font = '900 30px "Noto Sans JP","Noto Sans TC",sans-serif'; c.fillText(st.name, w / 2, 98);
      c.font = '700 22px sans-serif'; c.fillText(st.en, w / 2, 164);
      c.fillStyle = '#1b7a4b'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
    });
  }

  // ---------- 小工具 ----------
  function win(x, y, z, w, h, lit, frame = C.woodD, bars = 0) {
    K.box(x, y - .08, z, w + .16, h + .16, .05, frame);
    if (lit) K.box(x, y, z + .02, w, h, .06, pick([0xffffff, 0xfff1d6, 0xffe2b0]), 'win');
    else K.box(x, y, z + .02, w, h, .06, C.glassDark);
    for (let i = 0; i < bars; i++) K.box(x - w / 2 + (i + 1) * w / (bars + 1), y, z + .05, .05, h, .04, frame);
  }
  function tree(x, z, kind = 'round', s = 1) {
    if (kind === 'sakura' || kind === 'maple') {
      const cols = kind === 'sakura' ? [C.sakura, C.sakura2, 0xf29fbe] : [0xc8452c, 0xe0692c, 0xa8321e];
      K.cyl(x, 0, z, .15 * s, .26 * s, 2.3 * s, 0x4a3528, 6);
      K.boxR(x + .5 * s, 2.5 * s, z, .14 * s, 1.4 * s, .14 * s, 0x4a3528, 0, 0, -.7);
      K.boxR(x - .45 * s, 2.6 * s, z + .2 * s, .13 * s, 1.3 * s, .13 * s, 0x4a3528, .3, 0, .7);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.283 + R(), rr = (i < 5 ? 1.3 : 0) * s;
        K.ball(x + Math.sin(a) * rr, (3.1 + (i < 5 ? R() * .5 : .9)) * s, z + Math.cos(a) * rr, (1.15 + R() * .5) * s, pick(cols), .78);
      }
      K.collide(x, z, .5, .5, 3);
    } else if (kind === 'cedar') {
      K.cyl(x, 0, z, .2 * s, .32 * s, 3 * s, 0x4b3626, 6);
      for (let i = 0; i < 4; i++) K.cone(x, (2 + i * 1.9) * s, z, (2.3 - i * .45) * s, 3.2 * s, i % 2 ? C.leafD : 0x24492d, 7);
      K.collide(x, z, .6, .6, 4);
    } else if (kind === 'pine') {
      K.boxR(x, 1.4 * s, z, .26 * s, 3 * s, .26 * s, 0x5a4030, 0, 0, .18);
      K.ball(x - .4 * s, 3.1 * s, z, 1.5 * s, 0x2f5a3a, .45); K.ball(x + .7 * s, 2.3 * s, z + .3 * s, 1.1 * s, 0x37683f, .45); K.ball(x - 1 * s, 2.1 * s, z - .3 * s, .9 * s, 0x2f5a3a, .45);
      K.collide(x, z, .5, .5, 3);
    } else if (kind === 'bush') {
      K.ball(x, .35 * s, z, .7 * s, pick([C.leaf, 0x4f8f45, 0x356b38]), .7, 'solid', 0);
    } else if (kind === 'bamboo') {
      for (let i = 0; i < 6; i++) { const bx = x + (R() - .5) * 1.4, bz = z + (R() - .5) * 1.4, hh = 4 + R() * 2.5; K.cyl(bx, 0, bz, .05, .06, hh, 0x6f9a4a, 5); K.ball(bx, hh, bz, .7, 0x5a8f3f, .6, 'solid', 0); }
    } else {
      K.cyl(x, 0, z, .16 * s, .22 * s, 2.2 * s, 0x5a4030, 6);
      K.ball(x, 3.2 * s, z, 1.6 * s, pick([C.leaf, 0x4b8a43]), .9); K.ball(x + .7 * s, 2.7 * s, z + .4 * s, 1.1 * s, 0x356b38, .9);
      K.collide(x, z, .5, .5, 3);
    }
  }
  function toro(x, z, s = 1) { // 石燈籠
    K.box(x, 0, z, .7 * s, .2 * s, .7 * s, C.stoneD); K.cyl(x, .2 * s, z, .14 * s, .18 * s, 1.1 * s, C.stone, 6);
    K.box(x, 1.3 * s, z, .6 * s, .12 * s, .6 * s, C.stone); K.box(x, 1.42 * s, z, .42 * s, .42 * s, .42 * s, 0xffd98a, 'lamp');
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(x + a * .2 * s, 1.42 * s, z + b * .2 * s, .08 * s, .42 * s, .08 * s, C.stone);
    K.pyr(x, 1.84 * s, z, .95 * s, .4 * s, .95 * s, C.stoneD); K.ball(x, 2.3 * s, z, .1 * s, C.stone, 1, 'solid', 0);
    K.halo(x, 1.65 * s, z, 0xffc27a); K.collide(x, z, .6 * s, .6 * s, 2);
  }
  function chochin(x, y, z, col = 0xe2452c) {
    K.cyl(x, y, z, .25, .25, .6, col, 8, 'lamp'); K.cyl(x, y - .06, z, .15, .15, .07, C.black, 8); K.cyl(x, y + .59, z, .15, .15, .07, C.black, 8);
    K.halo(x, y + .3, z, col === 0xe2452c ? 0xff7a4a : 0xffe0a0);
  }
  function bench(x, z, ry = 0, y = 0) {
    K.push(x, y, z, ry);
    K.box(0, .4, 0, 1.7, .08, .45, C.woodL); K.box(0, .7, -.22, 1.7, .35, .06, C.woodL);
    for (const s of [-1, 1]) K.box(s * .7, 0, 0, .08, .4, .4, C.metal);
    K.collide(0, 0, 1.7, .5, 1);
    K.pop();
  }
  function vending(x, z, ry = 0, y = 0) {
    const k = Math.floor(R() * 3);
    K.push(x, y, z, ry);
    K.box(0, 0, 0, 1.0, 1.85, .72, [0xd9d9d9, 0xc62828, 0x1e63b5][k]);
    K.sign(null, 0, .95, .37, .92, 1.72, { rect: rVend[k] });
    K.collide(0, 0, 1.0, .75, 2);
    const p = K.wpos(0, 0, 1.0);
    info.inter.push({ x: p.x, z: p.z, r: 1.5, label: '買飲料', kind: 'vend' });
    K.halo(0, 1.3, .6, 0xcfe8ff);
    K.pop();
  }
  function car(x, z, ry = 0, col) {
    col = col ?? pick(CARS);
    const truck = R() < .22;
    K.push(x, 0, z, ry);
    K.box(0, .28, 0, 1.48, .5, 3.3, col);
    if (truck) { K.box(0, .78, .95, 1.44, .75, 1.2, col); K.box(0, 1.0, 1.0, 1.46, .4, 1.0, C.glassDark); K.box(0, .78, -.65, 1.44, .28, 1.9, shade(col, .85)); }
    else { K.box(0, .78, -.1, 1.4, .1, 2.3, col); K.box(0, .88, -.1, 1.36, .42, 2.2, C.glassDark); K.box(0, 1.3, -.1, 1.4, .1, 2.2, col); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(sx * .72, .3, sz * 1.05, .3, .3, .2, C.black, 10, 'solid', 0, Math.PI / 2);
    for (const sx of [-1, 1]) { K.box(sx * .5, .52, 1.66, .3, .14, .04, 0xfff3c4, 'lamp'); K.box(sx * .5, .52, -1.66, .3, .14, .04, 0xc21a1a, 'lamp'); }
    K.collide(0, 0, 1.6, 3.4, 1.6);
    K.pop();
  }
  function bike(x, z, ry = 0) {
    K.push(x, 0, z, ry);
    for (const s of [-1, 1]) K.cyl(0, .33, s * .5, .33, .33, .05, C.black, 10, 'solid', 0, Math.PI / 2);
    K.boxR(0, .6, 0, .05, .05, 1.0, pick([0x2f5fa8, 0xd03a2a, 0xcfcfcf, 0x2e7d32]), .25); K.box(0, .55, -.3, .06, .4, .06, C.metal); K.box(0, .92, -.3, .16, .06, .26, C.black);
    K.box(0, .6, .45, .06, .5, .06, C.metal); K.box(0, 1.08, .45, .5, .04, .04, C.metal); K.box(0, .8, .7, .3, .22, .25, C.metal);
    K.pop();
  }
  function nobori(x, z, text, col, ry = 0) { // 旗幟
    K.push(x, 0, z, ry);
    K.cyl(0, 0, 0, .03, .03, 3.1, 0xdddddd, 5); K.box(.3, 3.0, 0, .62, .04, .04, 0xdddddd); K.cyl(0, 0, 0, .2, .2, .12, C.stoneD, 8);
    K.sign(text, .33, 1.95, 0, .56, 2.0, { vertical: true, bg: css(col), fg: '#ffffff', double: true });
    K.pop();
  }
  function fence(x0, z0, x1, z1, style = 'wire', h = 1.2, solid = true) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), alongX = Math.abs(dx) > Math.abs(dz);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = alongX ? L : .1, d = alongX ? .1 : L;
    if (style === 'wire') {
      K.box(cx, h - .08, cz, alongX ? L : .05, .05, alongX ? .05 : L, 0x6f7f72); K.box(cx, h * .5, cz, alongX ? L : .04, .04, alongX ? .04 : L, 0x6f7f72);
      K.box(cx, .1, cz, alongX ? L : .02, h - .2, alongX ? .02 : L, 0x8a978c);
      const n = Math.max(1, Math.round(L / 3));
      for (let i = 0; i <= n; i++) K.box(x0 + dx * i / n, 0, z0 + dz * i / n, .08, h, .08, 0x5d6b60);
    } else if (style === 'bamboo') {
      K.box(cx, 0, cz, alongX ? L : .12, h, alongX ? .12 : L, C.bamboo);
      for (const yy of [.35, h - .35]) K.box(cx, yy, cz, alongX ? L : .2, .1, alongX ? .2 : L, 0x5a4326);
      const n = Math.max(1, Math.round(L / 2.4));
      for (let i = 0; i <= n; i++) K.cyl(x0 + dx * i / n, 0, z0 + dz * i / n, .09, .09, h + .15, 0x6b5330, 6);
    } else if (style === 'verm') {
      K.box(cx, h - .12, cz, alongX ? L : .14, .12, alongX ? .14 : L, C.verm); K.box(cx, h * .45, cz, alongX ? L : .1, .1, alongX ? .1 : L, C.verm);
      const n = Math.max(1, Math.round(L / 1.6));
      for (let i = 0; i <= n; i++) { const px = x0 + dx * i / n, pz = z0 + dz * i / n; K.box(px, 0, pz, .16, h, .16, C.verm); K.box(px, h, pz, .2, .08, .2, C.black); }
    } else if (style === 'block') {
      K.box(cx, 0, cz, alongX ? L : .18, h, alongX ? .18 : L, 0xcfc9ba); K.box(cx, h, cz, alongX ? L : .26, .06, alongX ? .26 : L, 0xa9a396);
    } else if (style === 'hedge') {
      K.box(cx, 0, cz, alongX ? L : .7, h, alongX ? .7 : L, 0x3f7a3c);
    }
    if (solid) K.collide(cx, cz, Math.max(w, .25), Math.max(d, .25), h);
  }
  function torii(x, z, s = 1) {
    K.push(x, 0, z, 0);
    for (const sx of [-1, 1]) {
      K.cyl(sx * 2.7 * s, 0, 0, .27 * s, .33 * s, 6.1 * s, C.verm, 10); K.cyl(sx * 2.7 * s, 0, 0, .42 * s, .42 * s, .5 * s, C.black, 10);
      K.collide(sx * 2.7 * s, 0, .8 * s, .8 * s, 6);
    }
    K.box(0, 4.5 * s, 0, 6.6 * s, .36 * s, .32 * s, C.verm);
    K.box(0, 5.7 * s, 0, 7.4 * s, .34 * s, .5 * s, C.verm); K.box(0, 6.04 * s, 0, 8.2 * s, .3 * s, .7 * s, C.black);
    for (const sx of [-1, 1]) K.boxR(sx * 3.9 * s, 6.3 * s, 0, .9 * s, .26 * s, .7 * s, C.black, 0, 0, sx * .28);
    K.box(0, 4.86 * s, 0, .7 * s, .86 * s, .16 * s, C.black);
    K.sign('神社', 0, 5.28 * s, .1 * s, .5 * s, .74 * s, { vertical: true, bg: '#1b2a4a', fg: '#e7c768' });
    K.pop();
  }

  // ---------- 建築產生器（本地座標：正面朝 +z，原點在地塊中心）----------
  function house(W, D) {
    const w = Math.min(W - 2.4, 7.5 + R() * 3), d = Math.min(D - 5.5, 7 + R() * 2.5), fl = R() < .7 ? 2 : 1, fh = 2.8, h = fl * fh;
    const zc = -D / 2 + 1.6 + d / 2, zf = zc + d / 2, wall = pick(HOUSE_WALL), roof = pick(ROOFS), trim = pick([C.woodD, 0x5a4636, 0x3a3a3a]);
    K.box(0, 0, zc, w + .1, .35, d + .1, C.stoneD);
    K.box(0, .35, zc, w, h - .35, d, wall);
    if (fl === 2) K.box(0, fh - .1, zc, w + .08, .16, d + .08, trim);
    K.push(0, h, zc, Math.PI / 2); K.gable(0, 0, 0, d, 1.5 + R() * .5, w, wall, roof, .7); K.pop();
    const sd = R() < .5 ? -1 : 1, dx = sd * (w / 2 - 1.3);
    K.box(dx, .35, zf + .03, 1.3, 2.0, .08, trim); K.box(dx, .5, zf + .06, 1.0, 1.75, .05, 0xdccfae);
    K.boxR(dx, 2.62, zf + .55, 2.0, .1, 1.3, roof, .22);
    K.box(dx, 0, zf + .6, 1.5, .3, 1.0, C.stone);
    win(-dx * .75, 1.1, zf, 2.0, 1.3, R() < .6, trim, 3);
    if (fl === 2) {
      win(dx * .8, fh + 1.0, zf, 1.5, 1.1, R() < .5, trim, 1);
      if (R() < .6) {
        const bx = -dx * .75;
        K.box(bx, fh + .25, zf + .03, 2.2, 1.9, .06, R() < .5 ? C.glassDark : 0xfff1d6, R() < .5 ? 'solid' : 'win');
        K.box(bx, fh + .1, zf + .55, 2.8, .1, 1.1, trim); K.box(bx, fh + .2, zf + 1.07, 2.8, .85, .06, 0xdedbd2);
        if (R() < .7) K.box(bx + (R() - .5), fh + .5, zf + 1.12, 1.1, .7, .14, pick([0xf7f3ea, 0xf2c6cf, 0xbcd7ee, 0xf5e6a8]));
      } else win(-dx * .75, fh + 1.0, zf, 1.5, 1.1, R() < .5, trim, 1);
    }
    for (const s of [-1, 1]) {
      K.push(s * w / 2, 0, zc, s * Math.PI / 2);
      win(0, 1.2, 0, 1.2, 1.0, R() < .4, trim); if (fl === 2) win(1, fh + 1.1, 0, 1.1, .9, R() < .4, trim);
      K.pop();
    }
    if (R() < .6) K.box(-sd * (w / 2 + .35), .1, zc - d / 4, .5, .6, .8, 0xdcdcdc); // 冷氣室外機
    const gz = D / 2 - .45, gx0 = -W / 2 + .3, gx1 = W / 2 - .3, st = pick(['block', 'block', 'hedge']);
    if (dx - 1.1 - gx0 > .5) fence(gx0, gz, dx - 1.1, gz, st, st === 'hedge' ? .9 : 1.1);
    if (gx1 - dx - 1.1 > .5) fence(dx + 1.1, gz, gx1, gz, st, st === 'hedge' ? .9 : 1.1);
    for (const s of [-1, 1]) K.box(dx + s * 1.1, 0, gz, .3, 1.3, .3, C.stone);
    const tx = -dx * .9, tz = zf + (gz - zf) / 2;
    if (R() < .75) tree(Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, tx)), tz, pick(['round', 'pine', 'sakura', 'maple', 'bush']), .6 + R() * .2);
    if (R() < .6) tree(sd * (W / 2 - .9), tz - .4, 'bush', .9);
    return K.collide(0, zc, w, d, h + 1);
  }

  function machiya(W, D) {
    const shop = shopsM[mi++ % shopsM.length];
    const w = W - .5, d = Math.min(D - 2.2, 10.5), zf = D / 2 - 1.0, zc = zf - d / 2, h1 = 3.0, h2 = 2.4;
    const wood = pick([C.wood, 0x54392a, 0x3f2d22]), up = R() < .6 ? C.plaster : wood, roof = pick([C.tile, C.tileB, 0x34393f]);
    K.box(0, 0, zc, w, h1, d, wood); K.box(0, h1, zc, w - .1, h2, d - .1, up);
    K.push(0, h1 + h2, zc, Math.PI / 2); K.gable(0, 0, 0, d, 1.5, w, up, roof, .5); K.pop();
    K.boxR(0, h1 + .08, zf + .75, w + .3, .14, 1.9, roof, .3);
    for (const s of [-1, 1]) K.box(s * (w / 2 - .12), 0, zf + .03, .22, h1, .1, C.woodD);
    const nW = Math.max(2, Math.floor(w / 3.2));
    for (let i = 0; i < nW; i++) win((i + .5) * w / nW - w / 2, h1 + .85, zf - .04, w / nW - 1.1, 1.05, R() < .65, C.woodD, 4);
    K.box(0, .3, zf + .02, w - 1.0, 2.2, .06, 0xfff0cf, 'win');
    K.box(0, 0, zf + .03, w - .6, .3, .08, C.woodD); K.box(0, 2.5, zf + .03, w - .6, .5, .08, C.woodD);
    for (const s of [-1, 1]) { const x0 = s * 1.2, x1 = s * (w / 2 - .5), n = Math.max(2, Math.floor(Math.abs(x1 - x0) / .28)); for (let i = 0; i <= n; i++) K.box(x0 + (x1 - x0) * i / n, .3, zf + .06, .07, 2.2, .05, C.woodD); }
    K.box(0, 2.42, zf + .32, 2.7, .06, .06, C.woodD);
    const light = shop[2] === 0xfafafa;
    K.sign(shop[0], 0, 2.02, zf + .32, 2.4, .78, { bg: css(shop[2]), fg: light ? '#222222' : '#ffffff', double: true });
    let sh = .72; const r = atlas.text(shop[1], { bg: '#3b2616', fg: '#f1d9a0', border: '#1d120a' });
    if (sh * r.aspect > w - 1.4) sh = (w - 1.4) / r.aspect;
    K.sign(shop[1], 0, h1 + .45 + sh / 2 - .25, zf + 1.25, null, sh, { rect: r }); K.box(0, h1 + .1, zf + 1.2, sh * r.aspect + .1, sh + .25, .08, 0x1d120a);
    const ls = R() < .5 ? -1 : 1;
    chochin(ls * 1.75, 1.65, zf + .5); if (R() < .4) chochin(-ls * 1.75, 1.65, zf + .5);
    if (R() < .5) { K.box(-ls * (w / 2 - 1.2), 0, zf + .55, .6, .9, .05, 0x2b2118); K.sign(pick(['営業中', '本日のおすすめ', '一品料理']), -ls * (w / 2 - 1.2), .5, zf + .59, .5, null, { vertical: true, bg: '#2b2118', fg: '#ffffff' }); }
    else { K.cyl(-ls * (w / 2 - 1), 0, zf + .5, .22, .16, .35, 0x8a5a3a, 8); K.ball(-ls * (w / 2 - 1), .7, zf + .5, .4, C.leaf, 1, 'solid', 0); }
    const c = K.collide(0, zc, w, d, h1 + h2 + 1); c.shop = shop[0];
    return c;
  }

  function zakkyo(W, D) {
    const shop = shopsZ[zi++ % shopsZ.length], shop2 = shopsZ[(zi + 7) % shopsZ.length];
    const w = W - .8, d = Math.min(D - 2.4, 12), zf = D / 2 - 1.2, zc = zf - d / 2, fl = 3 + Math.floor(R() * 3.6), fh = 3.0, h = fl * fh + .5, col = pick(BLDG);
    K.box(0, 0, zc, w, h, d, col); K.box(0, h, zc, w + .2, .25, d + .2, shade(col, .8));
    for (let f = 1; f < fl; f++) {
      const y = f * fh + .9, lit = R() < .55;
      K.box(0, y, zf + .02, w - 1.0, 1.5, .06, lit ? pick([0xffffff, 0xfff1d6, 0xe8f4ff]) : C.glassDark, lit ? 'win' : 'solid');
      const n = Math.floor(w / 1.8); for (let i = 1; i < n; i++) K.box(-w / 2 + .5 + i * (w - 1) / n, y, zf + .04, .12, 1.5, .06, col);
      for (const s of [-1, 1]) { K.push(s * w / 2, 0, zc, s * Math.PI / 2); const l2 = R() < .35; K.box(0, y + .2, .02, 1.4, 1.0, .06, l2 ? 0xfff1d6 : C.glassDark, l2 ? 'win' : 'solid'); K.pop(); }
    }
    K.box(0, .2, zf + .02, w - 1.4, 2.3, .06, 0xfff3d8, 'win'); K.box(0, 0, zf + .05, .1, 2.5, .06, C.metal);
    K.boxR(0, 2.72, zf + .6, w - .5, .08, 1.3, shop[1], .35);
    K.box(0, 2.95, zf + .02, w - .3, .9, .14, shop[1]);
    let sh = .74; const r = atlas.text(shop[0], { bg: css(shop[1]), fg: '#ffffff' });
    if (sh * r.aspect > w - 1) sh = (w - 1) / r.aspect;
    K.sign(shop[0], 0, 3.4, zf + .1, null, sh, { rect: r });
    // 袖看板
    const sx = R() < .5 ? -1 : 1, n = [...shop2[0]].length, hh = Math.min(n * .92, h - fh - 1.2), x = sx * (w / 2 - .25), yc = fh + .8 + hh / 2;
    K.box(x, yc - hh / 2 - .1, zf + .72, .16, hh + .2, 1.0, 0x2a2a2e);
    K.sign(shop2[0], x + .09, yc, zf + .72, .86, hh, { vertical: true, bg: css(shop2[1]), fg: '#ffffff', ry: Math.PI / 2 });
    K.sign(shop2[0], x - .09, yc, zf + .72, .86, hh, { vertical: true, bg: css(shop2[1]), fg: '#ffffff', ry: -Math.PI / 2 });
    // 屋頂
    K.cyl(w / 4, h + .25, zc - d / 4, .8, .8, 1.5, 0xc9cdd0, 10); K.box(-w / 4, h + .25, zc, 1.2, .7, .8, 0xd5d5d5); K.box(-w / 4 + 1.5, h + .25, zc + 1, .9, .6, .7, 0xcacaca);
    if (R() < .4 && w > 8) {
      const ad = pick(ADS), bw = w * .8, bh = 2.3;
      K.box(0, h + .25, zf - .6, bw, .1, .1, C.metal); for (const s of [-1, 1]) K.box(s * bw * .4, h + .25, zf - .6, .12, 1.0, .12, C.metal);
      K.box(0, h + 1.0, zf - .62, bw + .2, bh + .2, .12, 0x2a2a2e);
      const rr = atlas.text(ad[0], { bg: css(ad[1]), fg: ad[2] }); let ah = bh; if (ah * rr.aspect > bw) ah = bw / rr.aspect;
      K.box(0, h + 1.1, zf - .55, bw, bh, .04, ad[1], 'lamp'); K.sign(ad[0], 0, h + 1.1 + bh / 2, zf - .5, null, ah, { rect: rr });
    }
    const c = K.collide(0, zc, w, d, h + 1); c.shop = shop[0];
    return c;
  }

  function apartment(W, D) {
    const w = W - 1.6, d = Math.min(D - 5, 8.5), zc = -D / 2 + 1.2 + d / 2, zf = zc + d / 2, fl = 3 + Math.floor(R() * 3), fh = 2.75, h = fl * fh, col = pick(APT), rc = pick([0xdedbd2, 0x9fb2bd, 0xb9a48f]);
    K.box(0, 0, zc, w, h, d, col); K.box(0, h, zc, w + .3, .3, d + .3, shade(col, .78));
    const units = Math.max(2, Math.floor(w / 3.6));
    for (let f = 0; f < fl; f++) {
      const y = f * fh;
      for (let u = 0; u < units; u++) {
        const x = (u + .5) * w / units - w / 2, lit = R() < .5;
        K.box(x, y + .25, zf + .02, 2.1, 2.0, .06, lit ? pick([0xffffff, 0xfff1d6]) : C.glassDark, lit ? 'win' : 'solid');
        if (f > 0 && R() < .45) K.box(x + (R() - .5), y + 1.3, zf + .95, .8 + R() * .5, .75, .05, pick([0xffffff, 0xf2c6cf, 0xbcd7ee, 0xf5e6a8, 0xa8d5b5]));
        if (f > 0 && u > 0) K.box(-w / 2 + u * w / units, y, zf + .6, .06, fh - .3, 1.2, shade(col, .9));
      }
      if (f > 0) { K.box(0, y - .06, zf + .6, w, .12, 1.2, shade(col, .85)); K.box(0, y + .06, zf + 1.17, w, .95, .06, rc); }
    }
    K.box(-w / 2 - .7, 0, zc, 1.4, h, 3.2, shade(col, .9)); // 樓梯間
    for (const s of [-1, 1]) { K.push(s * (s < 0 ? w / 2 + 1.4 : w / 2), 0, zc, s * Math.PI / 2); for (let f = 0; f < fl; f++) K.box(0, f * fh + 1.2, .02, 1.0, 1.0, .06, C.glassDark); K.pop(); }
    const gz = D / 2 - .5;
    fence(-W / 2 + .3, gz, -2.5, gz, 'block', .9);
    K.sign(pick(['コーポ桜', 'ハイツ湯の里', 'さくら荘', 'メゾン桜町']), -W / 2 + 2, .5, gz + .11, null, .42, { bg: '#2d2d2d', fg: '#f1d9a0' });
    if (R() < .8) car(W / 2 - 1.8, zf + 2.3 > gz - 1 ? gz - 2 : zf + 2.5, Math.PI / 2 * (R() < .5 ? 1 : -1));
    if (R() < .7) { bike(.5, zf + 1.9, .2); bike(1.2, zf + 1.9, -.1); }
    return K.collide(-.35, zc, w + 1.4, d, h + 1);
  }

  function konbini(W, D) {
    const w = 13, d = Math.min(D - 3.6, 9.5), zc = -D / 2 + .6 + d / 2, zf = zc + d / 2, zb = zc - d / 2, h = 3.5;
    K.box(0, 0, zc, w - .3, .04, d - .3, 0xd3d1c8, 'unlit');
    for (let i = -5; i <= 5; i++) K.box(i * 1.1, .04, zc, .03, .005, d - .6, 0xbdbbb2, 'unlit');
    K.box(0, 0, zb + .15, w, h, .3, C.white); K.box(0, 0, zb + .32, w - .6, h, .04, 0xe9e5d8, 'unlit');
    for (const s of [-1, 1]) { K.box(s * (w / 2 - .15), 0, zc, .3, h, d, C.white); K.box(s * (w / 2 - .32), 0, zc, .04, h, d - .6, 0xe4e0d2, 'unlit'); K.collide(s * (w / 2 - .15), zc, .3, d, h); }
    K.collide(0, zb + .15, w, .3, h);
    K.box(0, 2.7, zf - .15, w, h - 2.7, .3, C.white);
    const Ls = w / 2 - 1.3;
    for (const s of [-1, 1]) {
      const xs = s * (1.3 + Ls / 2);
      K.box(xs, 0, zf - .15, Ls, .45, .3, C.white); K.box(xs, .45, zf - .15, Ls, 2.25, .06, 0xbfe3f0, 'glass');
      K.box(s * 1.3, 0, zf - .15, .12, 2.7, .32, C.metal); K.collide(xs, zf - .15, Ls, .3, h);
      K.sign(pick(['おでん', 'からあげ', '新発売', 'コーヒー100円']), xs + s * .8, 1.7, zf - .1, null, .5, { bg: s > 0 ? '#e53935' : '#fdd835', fg: s > 0 ? '#ffffff' : '#222222' });
    }
    K.box(0, h, zc, w + .4, .25, d + .4, 0xe4e4e0);
    K.box(0, h - .08, zc, w - .6, .04, d - .6, 0xc9c7bf, 'unlit');
    for (const lx of [-4, 0, 4]) K.box(lx, h - .13, zc, .5, .05, d - 2, 0xffffff, 'unlit');
    K.box(0, 2.75, zf + .12, w + .4, .95, .25, C.white);
    K.sign(null, 0, 3.22, zf + .26, 13.2, .9, { rect: rLogo });
    // 貨架
    const Lg = d - 4.6, zg = zb + 1.7 + Lg / 2;
    [-4.0, -1.6].forEach((gx, i) => {
      K.box(gx, 0, zg, .8, 1.5, Lg, 0xe8e6de, 'unlit'); K.collide(gx, zg, .8, Lg, 1.5);
      K.sign(null, gx + .41, .8, zg, Lg, 1.4, { rect: rShelf[i], ry: Math.PI / 2 }); K.sign(null, gx - .41, .8, zg, Lg, 1.4, { rect: rShelf[(i + 1) % 3], ry: -Math.PI / 2 });
    });
    K.sign(null, -w / 2 + .36, 1.15, zc - .3, d - 2, 2.0, { rect: rShelf[2], ry: Math.PI / 2 });
    K.sign(null, 0, 1.3, zb + .36, w - 1, 2.3, { rect: rFridge });
    K.collide(-w / 2 + .5, zc - .3, .5, d - 2, 2); K.collide(0, zb + .55, w - 1, .5, 2);
    // 櫃台
    const cx = w / 2 - 2.3;
    K.box(cx, 0, zc + .3, .8, 1.0, 4.2, 0xe9e4d8, 'unlit'); K.box(cx, 1.0, zc + .3, .9, .05, 4.3, 0x18a058, 'unlit');
    K.box(cx, 1.05, zc + 1.2, .4, .3, .4, 0x333333, 'unlit'); K.box(cx, 1.05, zc - .8, .6, .5, .9, 0xffd27a, 'lamp');
    K.collide(cx, zc + .3, .8, 4.2, 1.2);
    const cp = K.wpos(w / 2 - 1.1, 0, zc + .3);
    info.spots.push({ type: 'clerk', x: cp.x, z: cp.z, ry: K.ry - Math.PI / 2 });
    const ip = K.wpos(cx - 1.1, 0, zc + .3);
    info.inter.push({ x: ip.x, z: ip.z, r: 1.7, label: '購物', kind: 'konbini' });
    info.zones.push({ kind: 'konbini', indoor: true, ...K.aabb(0, zc, w - .6, d - .6) });
    // 店外
    const fz = (zf + D / 2) / 2;
    K.box(0, 0, fz, W - .4, .02, D / 2 - zf, 0x4a4d53);
    for (let i = -2; i <= 2; i++) if (i) K.box(i * 2.6, .02, fz, .1, .01, D / 2 - zf - .6, C.line);
    K.box(-w / 2 + .9, 0, zf + .4, .6, .9, .5, 0x4f6f8f); K.box(-w / 2 + 1.6, 0, zf + .4, .6, .9, .5, 0x8f4f4f);
    nobori(-3.6, zf + .9, 'おにぎり', 0xe53935); nobori(3.6, zf + .9, 'からあげ', 0xf57c00);
    const px = W / 2 - .8, pz = D / 2 - .8;
    K.cyl(px, 0, pz, .1, .12, 5.2, 0xdedede, 6); K.box(px, 5.2, pz, 1.7, 1.7, .3, 0xffffff);
    K.sign(null, px, 6.05, pz + .16, 1.6, 1.6, { rect: rLogo2 }); K.sign(null, px, 6.05, pz - .16, 1.6, 1.6, { rect: rLogo2, ry: Math.PI });
    K.halo(0, 3.2, zf + .6, 0xffffff); K.halo(px, 6, pz, 0xffffff);
    const c = K.aabb(0, zc, w, d); c.kind = 'konbini';
    const lp = K.wpos(0, 0, zc); info.landmarks.push({ x: lp.x, z: lp.z, t: '超商', c: '#18a058' });
    return c;
  }

  function sento(W, D) {
    const w = W - 1.5, d = D - 4.5, zc = -D / 2 + 1 + d / 2, zf = zc + d / 2, h = 4.4;
    K.box(0, 0, zc, w, h, d, C.plaster); K.box(0, 0, zc, w + .1, 1.2, d + .1, 0x6b8fa3);
    K.gable(0, h, zc, w, 2.6, d, C.plaster, C.tile, .8, .24);
    K.gable(0, 2.9, zf + 1.1, 5, 1.3, 2.2, C.plaster, C.tile, .5);
    for (const s of [-1, 1]) K.box(s * 2.2, 0, zf + 2, .22, 2.9, .22, C.woodD);
    K.box(0, 0, zf + .03, 3.6, 2.6, .06, 0xfff0cf, 'win');
    K.sign('ゆ', -1, 2.1, zf + 2.05, 1.5, .9, { bg: '#1e3a6e', fg: '#ffffff', double: true }); K.sign('ゆ', 1, 2.1, zf + 2.05, 1.5, .9, { bg: '#b3261e', fg: '#ffffff', double: true });
    K.sign('桜湯', 0, h + 1.2, zf + .12, null, 1.0, { bg: '#3b2616', fg: '#f1d9a0', border: '#1d120a' });
    K.cyl(w / 2 - 1.2, 0, zc - d / 2 + 1.4, .45, .7, 15, 0x9a8f84, 10); K.cyl(w / 2 - 1.2, 14, zc - d / 2 + 1.4, .5, .5, .5, 0x5f5750, 10);
    for (const s of [-1, 1]) win(s * (w / 2 - 1.5), 2.6, zf, 1.4, .9, true, C.woodD, 3);
    chochin(-2.6, 1.7, zf + 2.1, 0xf5ead0); chochin(2.6, 1.7, zf + 2.1, 0xf5ead0);
    return K.collide(0, zc, w, d, h + 3);
  }

  function koban(W, D) {
    const w = 6.5, d = 6, zc = D / 2 - 1.5 - d / 2, zf = zc + d / 2, h = 6;
    K.box(0, 0, zc, w, h, d, 0xe9e6dc); K.box(0, h, zc, w + .8, .3, d + .8, 0x4d5b6e); K.box(0, 3, zc, w + .1, .25, d + .1, 0x1e3a6e);
    K.box(0, .1, zf + .02, 3.2, 2.4, .06, 0xfff3d8, 'win'); K.box(0, 2.62, zf + .5, 4, .12, 1.2, 0x4d5b6e);
    K.sign('交番 KOBAN', 0, 3.6, zf + .06, null, .6, { bg: '#1e3a6e', fg: '#ffffff' });
    K.ball(0, 2.95, zf + .9, .2, 0xff3b30, 1, 'lamp', 0); K.halo(0, 2.95, zf + .9, 0xff5040);
    win(0, 4.4, zf, 3, 1.1, true, 0x4d5b6e, 2);
    const p = K.wpos(2.4, 0, zf + 1.2); info.spots.push({ type: 'police', x: p.x, z: p.z, ry: K.ry });
    if (W > 9) { tree(-W / 2 + 1.6, D / 2 - 2, 'sakura', .8); bench(-W / 2 + 1.8, zc - 1, Math.PI / 2); }
    return K.collide(0, zc, w, d, h + 1);
  }

  function parking(W, D) {
    K.box(0, 0, 0, W - .5, .03, D - .5, 0x4a4d53);
    const n = Math.floor((W - 1.5) / 2.7);
    for (let i = 0; i <= n; i++) K.box(-W / 2 + .8 + i * 2.7, .03, -D / 4, .1, .01, D / 2 - 1, C.line);
    for (let i = 0; i < n; i++) if (R() < .6) car(-W / 2 + .8 + (i + .5) * 2.7, -D / 4, R() < .5 ? 0 : Math.PI);
    K.cyl(W / 2 - .7, 0, D / 2 - .7, .06, .06, 3, C.metal, 6);
    K.sign('月極駐車場', W / 2 - .7, 3.3, D / 2 - .7, null, .5, { bg: '#1565c0', fg: '#ffffff', double: true });
    vending(-W / 2 + 1, D / 2 - .9, 0);
    return null;
  }

  const GEN = { house, machiya, zakkyo, apartment, konbini, sento, koban, parking };
  function chooseType(zone) {
    const r = R();
    if (zone === 'com') return r < .48 ? 'machiya' : r < .92 ? 'zakkyo' : r < .96 ? 'apartment' : 'parking';
    return r < .6 ? 'house' : r < .8 ? 'apartment' : r < .88 ? 'machiya' : r < .94 ? 'zakkyo' : 'parking';
  }
  function placeLot(cx, cz, W, D, ry, type) {
    K.push(cx, SL, cz, ry);
    const c = GEN[type](W, D);
    if (c) { info.bldgs.push({ ...c, type }); info.count++; }
    // 門口偶爾放販賣機
    if ((type === 'machiya' || type === 'zakkyo') && R() < .16) vending(W / 2 - .7, D / 2 - .5, 0);
    K.pop();
  }
  function split(L, min, max) {
    const out = []; let rem = L;
    while (rem > max + min) { const w = min + R() * (max - min); out.push(w); rem -= w; }
    if (rem > max) out.push(rem / 2, rem / 2); else out.push(rem);
    return out;
  }
  // 一排地塊。face: 'N' 'S' 'E' 'W' 為正面朝向；fixed: { index: type }
  function row(x0, x1, z0, z1, face, zone, fixed = {}, fixedW = {}) {
    const alongX = face === 'N' || face === 'S';
    let a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const D = alongX ? z1 - z0 : x1 - x0;
    const ry = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[face];
    const lots = [];
    if (fixedW.first) { lots.push([a0, fixedW.first, fixed.first]); a0 += fixedW.first; }
    let tail = null;
    if (fixedW.last) { tail = [a1 - fixedW.last, fixedW.last, fixed.last]; a1 -= fixedW.last; }
    let p = a0;
    if (a1 - a0 > 4) for (const w of split(a1 - a0, zone === 'com' ? 8.5 : 10, zone === 'com' ? 13 : 14.5)) { lots.push([p, w, null]); p += w; }
    if (tail) lots.push(tail);
    for (const [s, w, t] of lots) {
      const c = s + w / 2, type = t || chooseType(zone);
      if (alongX) placeLot(c, (z0 + z1) / 2, w, D, ry, type); else placeLot((x0 + x1) / 2, c, w, D, ry, type);
    }
  }
  function slab(x0, x1, z0, z1, color = C.side, kind = 'town') {
    const e = 2; x0 -= e; x1 += e; z0 -= e; z1 += e;
    K.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, SL, z1 - z0, color);
    info.slabs.push({ x0, x1, z0, z1, kind });
  }

  // ---------- 地面 ----------
  K.box(0, -.45, 0, 2 * BOUND.x + 4, .5, 2 * BOUND.z + 6, C.asphalt);
  const COLS = { A: [-130, -66], B: [-54, -6], C: [6, 54], D: [66, 130] };
  for (const k in COLS) {
    const [a, b] = COLS[k];
    slab(a, b, -64, -31); slab(a, b, -19, -5); slab(a, b, 5, 19); slab(a, b, 31, 64);
    if (k === 'C') slab(a, b, 76, 93.5, 0x86b266, 'park'); else slab(a, b, 76, 93.5);
    slab(a, b, 102.5, 121);
  }
  slab(-130, -66, -93.5, -76); slab(-130, -66, -121, -102.5);
  slab(-54, -36, -121, -76); slab(36, 54, -121, -76);
  slab(-32, 32, -121, -76, 0xd3ccb7, 'shrine');
  slab(66, 130, -121, -76, 0xaaa392, 'onsen');

  // ---------- 街區 ----------
  for (const k in COLS) {
    const [a, b] = COLS[k];
    // R2
    row(a, b, -64, -48, 'N', 'res');
    if (k === 'D') row(a, b, -47, -31, 'S', 'com', { first: 'konbini' }, { first: 14 }); else row(a, b, -47, -31, 'S', 'com');
    // R3 / R4（鐵路兩側）
    row(a, b, -19, -5, 'N', 'com');
    if (k === 'A') row(-80, -66, 5, 19, 'S', 'com', { first: 'konbini' }, { first: 14 });
    else if (k === 'D') row(66, 80, 5, 19, 'S', 'com', { first: 'koban' }, { first: 14 });
    else row(a, b, 5, 19, 'S', 'com');
    // R5
    if (k === 'C') row(a, b, 31, 47, 'N', 'com', { last: 'konbini' }, { last: 14 }); else row(a, b, 31, 47, 'N', 'com');
    if (k === 'B') row(a, b, 48, 64, 'S', 'res', { first: 'sento' }, { first: 15 }); else row(a, b, 48, 64, 'S', 'res');
    // R6
    if (k !== 'C') row(a, b, 76, 93.5, 'N', 'res');
    row(a, b, 102.5, 121, 'N', 'res');
  }
  row(-130, -66, -93.5, -76, 'S', 'res'); row(-130, -66, -121, -102.5, 'S', 'res');
  row(-54, -36, -121, -76, 'W', 'res'); row(36, 54, -121, -76, 'E', 'res');

  // ---------- 道路標線 ----------
  const mk = (x, z, w, d, col = C.line) => K.box(x, .05, z, w, .02, d, col);
  for (const x of XROADS) {
    const z0 = x === 0 ? -66 : -BOUND.z;
    for (let z = z0 + 3; z < BOUND.z - 2; z += 5) { if (Math.abs(z) < 5 || ZROADS.some((r) => Math.abs(z - r) < 8)) continue; mk(x, z, .15, 2.4); }
    for (const sg of [-1, 1]) mk(x, sg * 4.2, 7, .4);
  }
  for (const z of ZROADS) for (let x = -BOUND.x + 3; x < BOUND.x - 2; x += 5) { if (XROADS.some((r) => Math.abs(x - r) < 8)) continue; mk(x, z, 2.4, .15, z === -70 || z === 70 ? C.line : C.yellow); }
  for (const x of XROADS) for (const z of ZROADS) for (const s of [-1, 1]) {
    if (!(x === 0 && z === -70 && s === -1)) for (let i = 0; i < 6; i++) mk(x - 3.1 + i * 1.24, z + s * 5.7, .6, 2.6);
    for (let i = 0; i < 6; i++) mk(x + s * 5.7, z - 3.1 + i * 1.24, 2.6, .6);
  }

  // ---------- 鐵路 ----------
  K.box(0, .05, 0, 2 * BOUND.x, .07, 5, 0x7a726a);
  for (let x = -BOUND.x + 1; x < BOUND.x; x += 1.25) { if (CROSS_X.some((c) => Math.abs(x - c) < 6.4)) continue; K.box(x, .12, 0, .3, .06, 2.4, 0x4b3d32); }
  for (const s of [-1, 1]) K.box(0, .18, s * .72, 2 * BOUND.x - 2, .1, .09, 0x8f959c);
  for (const xc of CROSS_X) {
    K.box(xc, .05, 0, 12.6, .11, 5.4, C.asphalt);
    for (const s of [-1, 1]) { K.box(xc, .16, s * .72, 12.6, .02, .2, 0x2b2d31); mk(xc, s * 2.6, 12.4, .12, C.yellow); }
    for (const s of [-1, 1]) K.collide(xc + s * 6.45, 0, .3, 5.4, 2);
  }
  { // 鐵路圍欄（平交道與月台留空）
    const gaps = (extra) => { const g = CROSS_X.map((c) => [c - 6.3, c + 6.3]).concat(extra).sort((a, b) => a[0] - b[0]); const segs = []; let p = -BOUND.x; for (const [a, b] of g) { if (a > p) segs.push([p, a]); p = b; } if (p < BOUND.x) segs.push([p, BOUND.x]); return segs; };
    for (const [a, b] of gaps([])) fence(a, -2.75, b, -2.75, 'wire', 1.2);
    for (const [a, b] of gaps(STATIONS.map((s) => [s.x - 21, s.x + 21]))) fence(a, 2.75, b, 2.75, 'wire', 1.2);
    for (const s of [-1, 1]) { K.box(s * (BOUND.x - 1.5), .1, 0, .5, 1.1, 2.6, 0x555b61); K.box(s * (BOUND.x - 1.5), 1.0, 0, .6, .4, 2.8, C.yellow); }
  }
  for (let x = -120; x <= 120; x += 30) { // 架線柱
    K.box(x, 0, -2.35, .18, 6.7, .18, 0x566067); K.box(x, 6.3, -1.0, .1, .1, 2.9, 0x566067); K.boxR(x, 5.6, -1.6, .06, .06, 1.9, 0x566067, .75);
  }
  info.wires.push([-BOUND.x, 5.9, 0, BOUND.x, 5.9, 0, 0], [-BOUND.x, 6.25, 0, BOUND.x, 6.25, 0, 0]);
  // 平交道設備
  for (const xc of CROSS_X) {
    const cr = { x: xc, arms: [], lamps: [], closed: false, k: 0, barrier: [] };
    for (const s of [-1, 1]) {
      const px = xc - s * 5.9, pz = s * 3.35;
      K.cyl(px, 0, pz, .09, .09, 3.6, C.yellow, 8); K.cyl(px, 0, pz, .1, .1, .5, C.black, 8); K.cyl(px, 1.2, pz, .1, .1, .5, C.black, 8); K.cyl(px, 2.4, pz, .1, .1, .5, C.black, 8);
      K.boxR(px, 3.3, pz + s * .08, 1.5, .16, .04, C.yellow, 0, 0, .6); K.boxR(px, 3.3, pz + s * .08, 1.5, .16, .04, C.yellow, 0, 0, -.6);
      K.box(px, 2.5, pz + s * .1, .95, .34, .1, C.black); K.box(px, .6, pz, .4, .7, .4, 0x555b61);
      for (const o of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0x330000 }));
        lamp.position.set(px + o * .27, 2.67, pz + s * .17); scene.add(lamp); cr.lamps.push(lamp);
      }
      const piv = new THREE.Group(); piv.position.set(px, 1.15, pz + s * .3); piv.rotation.y = s > 0 ? 0 : Math.PI;
      const arm = new THREE.Group();
      const m1 = new THREE.Mesh(new THREE.BoxGeometry(10, .1, .1), new THREE.MeshLambertMaterial({ color: C.yellow })); m1.position.x = 5; arm.add(m1);
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.9, .11, .11), new THREE.MeshLambertMaterial({ color: 0x1d1d20 })); b.position.x = 1.2 + i * 2; arm.add(b); }
      arm.rotation.z = 1.4; piv.add(arm); scene.add(piv); cr.arms.push(arm);
      cr.barrier.push({ x0: xc - 6.4, x1: xc + 6.4, z0: pz + s * .3 - .15, z1: pz + s * .3 + .15, h: 2 });
    }
    info.crossings.push(cr);
  }

  // ---------- 車站 ----------
  STATIONS.forEach((st, i) => {
    const rb = nameBoard(st, i);
    K.push(st.x, 0, 0, 0);
    K.box(0, 0, 4.3, 30, 1.1, 4.7, C.concrete);
    K.box(0, 1.1, 2.2, 30, .02, .45, 0xf1f1f1); K.box(0, 1.1, 2.95, 30, .025, .4, C.yellow);
    const ra = Math.atan2(.95, 6);
    for (const s of [-1, 1]) {
      K.boxR(s * 18, .56, 4.3, 6.1, .16, 4.7, C.concrete, 0, 0, -s * ra); K.box(s * 16.5, 0, 4.3, 3, .6, 4.5, 0x8f8d86);
      K.boxR(s * 18, 1.5, 6.55, 6.1, .06, .06, 0xdedede, 0, 0, -s * ra);
      info.hz.push({ x0: st.x + (s > 0 ? 15 : -21), x1: st.x + (s > 0 ? 21 : -15), z0: 1.9, z1: 6.7, axis: 'x', ha: s > 0 ? 1.1 : SL, hb: s > 0 ? SL : 1.1 });
    }
    info.hz.push({ x0: st.x - 15, x1: st.x + 15, z0: 1.9, z1: 6.7, ha: 1.1, hb: 1.1 });
    K.box(0, 1.1, 6.58, 30, 1.0, .06, 0xdedede); K.box(0, 2.1, 6.58, 30, .06, .1, 0x8d969c);
    K.collide(0, 6.75, 42, .2, 3); K.collide(0, 1.85, 42, .2, 3);
    for (let x = -12; x <= 12; x += 6) { K.box(x, 1.1, 5.9, .2, 3.2, .2, 0x52616b); K.boxR(x, 4.15, 4.4, .12, .12, 3.4, 0x52616b, -.07); }
    K.boxR(0, 4.35, 4.1, 27, .14, 5.4, 0x60717c, -.07); K.box(0, 4.05, 1.5, 27, .3, .08, 0xf1f1f1);
    for (const x of [-9, -3, 3, 9]) { K.box(x, 4.12, 4.2, 1.6, .06, .2, 0xfff6dd, 'lamp'); K.halo(x, 3.9, 4.2, 0xfff0d0); }
    for (const x of [-8, 8]) { K.sign(null, x, 3.0, 5.7, 2.2, 1.1, { rect: rb, double: true }); for (const s of [-1, 1]) K.box(x + s * 1.0, 1.1, 5.7, .08, 1.4, .08, 0x52616b); }
    bench(-3, 5.6, Math.PI, 1.1); bench(3, 5.6, Math.PI, 1.1);
    vending(12.6, 5.8, Math.PI, 1.1);
    K.box(0, 3.5, 5.9, .9, .9, .25, 0xffffff); K.sign('12:00', 0, 3.95, 5.76, .8, null, { bg: '#ffffff', fg: '#222222', ry: Math.PI });
    const sp = K.wpos(-10.5, 0, 4.9); info.spots.push({ type: 'staff', x: sp.x, z: sp.z, ry: Math.PI, y: 1.1 });
    // 站房
    K.push(0, SL, 13.4, 0);
    const w = 18, d = 7.6, h = 3.5;
    K.box(0, 0, 0, w, h, d, 0xe6dcc6); K.box(0, 0, 0, w + .1, 1.0, d + .1, 0x6a4a34);
    K.push(0, h, 0, Math.PI / 2); K.gable(0, 0, 0, d, 2.0, w, 0xe6dcc6, C.tile, .9, .22); K.pop();
    K.box(0, 0, d / 2 + .03, 5, 2.8, .06, 0x2a2118); K.box(0, .1, d / 2 + .05, 4.4, 2.5, .06, 0xfff0cf, 'win');
    K.boxR(0, 3.05, d / 2 + 1, 8, .12, 2.2, C.tile, .2); for (const s of [-1, 1]) K.box(s * 3.6, 0, d / 2 + 1.9, .2, 2.8, .2, C.woodD);
    K.sign(st.name + '駅', 0, 4.25, d / 2 + .5, null, 1.15, { bg: '#17335c', fg: '#ffffff', border: '#e7c768' });
    K.sign(null, -6, 1.6, d / 2 + .05, 3.2, 1.6, { rect: rTicket }); win(6, 1.7, d / 2, 2.6, 1.3, true, C.woodD, 3);
    K.sign(null, -6, 1.6, -d / 2 - .05, 3.2, 1.6, { rect: rTicket, ry: Math.PI });
    K.cyl(8.4, 0, d / 2 + 1.2, .28, .28, 1.0, 0xd03a2a, 10); K.box(8.4, 1.0, d / 2 + 1.2, .5, .5, .5, 0xd03a2a); // 郵筒
    bench(-4, d / 2 + .7, 0); chochin(-2.9, 1.9, d / 2 + .4, 0xf5ead0); chochin(2.9, 1.9, d / 2 + .4, 0xf5ead0);
    K.collide(0, 0, w, d, h + 2);
    info.bldgs.push({ ...K.aabb(0, 0, w, d), type: 'station' }); info.count++;
    K.pop();
    car(i ? -14 : 14, 15.5, Math.PI / 2, 0xf0c62a);
    for (let b = 0; b < 5; b++) bike((i ? 13 : -13) + b * .7, 10.2, (R() - .5) * .3);
    tree(i ? 17 : -17, 15, 'sakura', .95); tree(i ? -18.5 : 18.5, 12, 'sakura', .85);
    K.pop();
    info.landmarks.push({ x: st.x, z: 10, t: st.zh, c: '#17335c' });
  });

  // ---------- 神社 ----------
  K.push(0, SL, 0, 0);
  {
    K.box(0, 0, -89, 4.4, .04, 28.5, 0xbdb8aa);
    torii(0, -77.4, 1.25); torii(0, -91.5, .9);
    K.box(4.9, 0, -75.6, .7, .3, .7, C.stoneD); K.box(4.9, .3, -75.6, .5, 2.6, .5, C.stone);
    K.sign('桜山神社', 4.9, 1.65, -75.34, .42, 2.3, { vertical: true, bg: '#9b978c', fg: '#1d1d20' });
    for (const z of [-81.5, -86.5, -96, -100]) for (const s of [-1, 1]) toro(s * 3.3, z, 1);
    for (const s of [-1, 1]) { // 狛犬
      K.box(s * 5.2, 0, -100.6, 1.1, 1.0, 1.5, C.stone); K.box(s * 5.2, 1.0, -100.5, .6, .7, 1.0, 0xa9a59a); K.ball(s * 5.2, 1.95, -100.1, .38, 0xa9a59a, 1, 'solid', 0);
      K.box(s * 5.2, 1.0, -100.05, .5, .9, .3, 0xa9a59a); K.collide(s * 5.2, -100.6, 1.1, 1.5, 2);
    }
    // 拜殿
    const PH = .9;
    K.box(0, 0, -109, 14, PH, 10, 0xb5b0a2);
    for (let i = 0; i < 3; i++) K.box(0, 0, -103.7 - .0 + i * .6 - .0, 6, PH - (i + 1) * .225 + .0, .6, 0xa9a498);
    info.hz.push({ x0: -7, x1: 7, z0: -114, z1: -104, ha: PH + SL, hb: PH + SL });
    info.hz.push({ x0: -3, x1: 3, z0: -104, z1: -102.2, axis: 'z', ha: PH + SL, hb: SL });
    K.box(0, PH, -110.5, 11, 3.4, 6, C.plaster); K.box(0, PH, -110.5, 11.1, .5, 6.1, C.verm);
    K.collide(0, -110.5, 11, 6, 6);
    K.box(0, PH, -107.44, 4.2, 2.9, .12, 0x3a2414); for (let i = -3; i <= 3; i++) K.box(i * .6, PH, -107.36, .06, 2.9, .05, C.gold);
    for (const s of [-1, 1]) { K.box(s * 3.9, PH + .9, -107.45, 2.2, 1.5, .1, 0x3f6b4f); for (let i = 0; i < 6; i++) K.box(s * 3.9 - .9 + i * .36, PH + .9, -107.39, .08, 1.5, .05, C.verm); }
    for (const x of [-5.6, -2.2, 2.2, 5.6]) { K.cyl(x, PH, -104.6, .2, .22, 3.4, C.verm, 10); K.box(x, PH, -104.6, .6, .15, .6, C.stoneD); }
    for (const s of [-1, 1]) { K.cyl(s * 5.6, PH, -107.4, .2, .22, 3.4, C.verm, 10); K.cyl(s * 5.6, PH, -113.5, .2, .22, 3.4, C.verm, 10); }
    K.box(0, PH + 3.4, -109, 12, .36, 9.6, C.verm); K.box(0, PH + 3.05, -104.6, 11.6, .26, .26, C.verm);
    K.push(0, PH + 3.76, -109, Math.PI / 2); K.gable(0, 0, 0, 12.4, 3.3, 15.5, C.plaster, 0x3d5f55, 1.3, .3); K.pop();
    for (const s of [-1, 1]) { K.boxR(s * 8.6, PH + 7.9, -108.4, .16, 2.6, .16, C.gold, .55); K.boxR(s * 8.6, PH + 7.9, -109.6, .16, 2.6, .16, C.gold, -.55); }
    for (let i = -2; i <= 2; i++) K.cyl(i * 2.6, PH + 7.42, -109, .2, .2, 1.3, C.gold, 8, 'solid', Math.PI / 2, 0);
    K.boxR(0, PH + 3.7, -103.4, 7, .2, 3.4, 0x3d5f55, .32); // 向拜
    K.box(0, PH, -105.4, 1.9, .75, .9, 0x5a3a22); for (let i = -3; i <= 3; i++) K.box(i * .25, PH + .75, -105.4, .08, .04, .9, 0x2a1a0f);
    K.collide(0, -105.4, 1.9, .9, 2);
    K.cyl(0, PH + 1.0, -104.9, .05, .05, 2.5, 0xd9412b, 6); K.ball(0, PH + 3.25, -104.9, .22, C.gold, 1, 'solid', 0);
    K.cyl(0, PH + 2.85, -104.45, .15, .15, 5.2, 0xd8c48a, 8, 'solid', 0, Math.PI / 2);
    for (const x of [-1.6, -.55, .55, 1.6]) { K.box(x, PH + 2.25, -104.4, .2, .45, .03, 0xffffff); K.box(x + .08, PH + 1.95, -104.4, .2, .35, .03, 0xffffff); }
    for (const s of [-1, 1]) chochin(s * 4.6, PH + 2.1, -104.3, 0xf5ead0);
    info.inter.push({ x: 0, z: -103.9, r: 2.4, label: '參拜', kind: 'pray' });
    info.bldgs.push({ x0: -7, x1: 7, z0: -114, z1: -104, type: 'shrine' }); info.count++;
    // 本殿
    K.box(0, 0, -118.6, 6.4, 1.3, 4, C.stone); K.box(0, 1.3, -118.6, 4.6, 2.6, 2.8, C.plaster); K.box(0, 1.3, -118.6, 4.7, .4, 2.9, C.verm);
    K.gable(0, 3.9, -118.6, 5, 1.8, 3.6, C.verm, 0x3d5f55, .7, .22);
    K.collide(0, -118.6, 6.4, 4, 5); info.bldgs.push({ x0: -3.2, x1: 3.2, z0: -120.6, z1: -116.6, type: 'shrine' }); info.count++;
    // 授與所
    K.push(18, 0, -91, -Math.PI / 2);
    K.box(0, 0, 0, 9, 3.0, 5.5, C.plaster); K.box(0, 0, 0, 9.1, 1.0, 5.6, C.wood);
    K.push(0, 3, 0, Math.PI / 2); K.gable(0, 0, 0, 5.5, 1.5, 9, C.plaster, C.tile, .8); K.pop();
    K.box(0, 1.0, 2.78, 6.4, 1.5, .06, 0xfff0cf, 'win'); K.sign(null, 0, 1.55, 2.83, 6, 1.0, { rect: rCharm });
    K.box(0, .95, 3.05, 6.8, .1, .6, C.woodL); K.boxR(0, 2.9, 3.3, 9.4, .12, 1.6, C.tile, .25);
    K.sign('授与所', 0, 2.55, 2.84, null, .5, { bg: '#3b2616', fg: '#f1d9a0' });
    K.sign('おみくじ', -3.9, 1.6, 2.84, .5, 1.9, { vertical: true, bg: '#b3261e', fg: '#ffffff' });
    K.collide(0, 0, 9, 5.5, 5); info.bldgs.push({ ...K.aabb(0, 0, 9, 5.5), type: 'shrine' }); info.count++;
    K.pop();
    info.spots.push({ type: 'miko', x: 13.6, z: -91, ry: -Math.PI / 2 });
    info.inter.push({ x: 13.2, z: -93.4, r: 2.0, label: '抽籤', kind: 'kuji' });
    // 繪馬／籤架
    for (const [x, rct, t] of [[-9, rEma, '絵馬'], [9, rKuji, 'おみくじ']]) {
      K.push(x, 0, -98, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const s of [-1, 1]) K.box(s * 1.6, 0, 0, .14, 2.2, .14, C.verm);
      K.box(0, 2.2, 0, 3.6, .12, .5, C.verm); K.sign(null, 0, 1.35, 0, 3.1, 1.5, { rect: rct, double: true });
      K.collide(0, 0, 3.4, .4, 2); K.pop();
    }
    // 手水舍
    K.push(-10.5, 0, -86.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * 1.5, 0, sz * 1.1, .18, 2.6, .18, C.woodD);
    K.gable(0, 2.6, 0, 3.6, 1.0, 3.0, C.wood, 0x3d5f55, .6);
    K.box(0, 0, 0, 2.0, .75, 1.1, C.stoneD); K.box(0, .75, 0, 1.7, .03, .8, 0x7fc4d8, 'glass');
    K.box(0, .95, 0, 2.2, .04, .04, C.bamboo); for (const x of [-.6, 0, .6]) K.box(x, .95, .12, .06, .06, .4, C.bamboo);
    K.collide(0, 0, 2.0, 1.1, 1); K.pop();
    info.count++;
    // 五重塔
    K.push(-21, 0, -107, 0);
    K.box(0, 0, 0, 8, .6, 8, C.stone);
    let y = .6;
    for (let i = 0; i < 5; i++) {
      const s = 5.4 - i * .5;
      K.box(0, y, 0, s, 2.1, s, C.verm); K.box(0, y + .3, 0, s + .06, 1.2, s * .5, C.plaster); K.box(0, y + .3, 0, s * .5, 1.2, s + .06, C.plaster);
      K.box(0, y + 1.85, 0, s + .5, .3, s + .5, C.woodD);
      K.pyr(0, y + 2.1, 0, s + 4.0, 1.25, s + 4.0, 0x353b45); K.box(0, y + 2.08, 0, s + 4.1, .1, s + 4.1, 0x2a2f37);
      y += 3.1;
    }
    K.pyr(0, y, 0, 2.2, 1.2, 2.2, 0x353b45);
    K.cyl(0, y + .3, 0, .08, .12, 4.6, C.gold, 6); for (let i = 0; i < 6; i++) K.cyl(0, y + 1.6 + i * .42, 0, .34 - i * .03, .34 - i * .03, .1, C.gold, 8);
    K.collide(0, 0, 5.6, 5.6, 20); info.bldgs.push({ ...K.aabb(0, 0, 5.6, 5.6), type: 'shrine' }); info.count++;
    K.pop();
    info.zones.push({ kind: 'pagoda', x0: -31, x1: -11, z0: -117, z1: -97 });
    info.landmarks.push({ x: -21, z: -107, t: '五重塔', c: '#8a2a12' }, { x: 0, z: -109, t: '神社', c: '#d2401f' });
    // 御神木
    K.cyl(21, 0, -113, .8, 1.1, 8, 0x4b3626, 9); K.cyl(21, 1.5, -113, 1.0, 1.0, .22, 0xd8c48a, 9);
    for (const [dx, dy, dz, r] of [[0, 10, 0, 4], [2.4, 8.4, 1, 2.8], [-2.2, 8.8, -1.2, 3], [.6, 12.2, -.8, 2.6]]) K.ball(21 + dx, dy, -113 + dz, r, C.leafD, .85);
    for (const x of [-.5, .5]) K.box(21 + x, 1.1, -111.95, .18, .4, .03, 0xffffff);
    K.collide(21, -113, 2, 2, 8);
    for (let z = -80.5; z > -101; z -= 6.6) for (const s of [-1, 1]) tree(s * 8, z, 'sakura', 1.05);
    for (let z = -80; z > -120; z -= 5.6) for (const s of [-1, 1]) if (!(s < 0 && z < -97 && z > -117) && !(s > 0 && Math.abs(z + 91) < 6)) tree(s * 29.5, z, 'cedar', .9 + R() * .4);
    for (let x = -26; x <= 26; x += 5.4) if (Math.abs(x) > 6 && Math.abs(x - 21) > 4) tree(x, -120.3, 'cedar', 1 + R() * .4);
    for (const x of [-14, 14]) tree(x, -80, 'pine', 1);
    fence(-33.6, -74.6, -33.6, -122.6, 'verm', 1.3); fence(33.6, -74.6, 33.6, -122.6, 'verm', 1.3); fence(-33.6, -122.6, 33.6, -122.6, 'verm', 1.3);
    fence(-33.6, -74.6, -6.5, -74.6, 'verm', 1.3); fence(6.5, -74.6, 33.6, -74.6, 'verm', 1.3);
    for (const x of [-26, -20, -14, 14, 20, 26]) nobori(x, -75.4, '奉納', 0xc8321e);
  }
  K.pop();

  // ---------- 溫泉 ----------
  K.push(0, SL, 0, 0);
  {
    // 旅館
    K.push(86, 0, -97, 0);
    const w = 30, d = 13;
    K.box(0, 0, 0, w, 3.3, d, C.wood); K.box(0, 3.3, 0, w - .4, 3.0, d - .4, C.plaster);
    K.push(0, 6.3, 0, Math.PI / 2); K.gable(0, 0, 0, d, 3.0, w, C.plaster, C.tile, 1.1, .26); K.pop();
    K.boxR(0, 3.4, d / 2 + .95, w + 1.6, .16, 2.3, C.tile, .26);
    for (const s of [-1, 1]) K.boxR(s * (w / 2 + .95), 3.4, 0, 2.3, .16, d + 1.6, C.tile, 0, 0, -s * .26);
    for (let i = 0; i < 9; i++) { const x = -w / 2 + 1.9 + i * 3.28; win(x, 3.3 + 1.0, d / 2 - .2, 2.2, 1.4, R() < .75, C.woodD, 3); K.box(x, 3.5, d / 2 - .02, .12, 2.8, .12, C.woodD); }
    K.box(0, 3.5, d / 2 + .25, w - .4, .7, .08, C.wood);
    for (let i = 0; i < 8; i++) { const x = -w / 2 + 2.2 + i * 3.65; if (Math.abs(x) < 4.5) continue; win(x, .9, d / 2, 2.4, 1.6, R() < .8, C.woodD, 5); }
    K.gable(0, 3.25, d / 2 + 1.9, 7.6, 1.8, 3.8, C.plaster, C.tile, .6, .22);
    for (const sx of [-1, 1]) for (const z of [.2, 3.6]) K.box(sx * 3.4, 0, d / 2 + z, .26, 3.25, .26, C.woodD);
    K.box(0, 0, d / 2 + .03, 4.6, 2.7, .06, 0xfff0cf, 'win'); K.box(0, 0, d / 2 + 1.9, 6.6, .12, 3.6, C.stone);
    K.box(0, 2.96, d / 2 + 3.6, 5.2, .07, .07, C.woodD);
    K.sign('湯の里温泉', 0, 2.5, d / 2 + 3.6, 4.6, .9, { bg: '#1e3a6e', fg: '#ffffff', double: true });
    K.sign('旅館 湯の里', 0, 4.15, d / 2 + 3.86, null, .7, { bg: '#3b2616', fg: '#f1d9a0', border: '#1d120a' });
    for (const s of [-1, 1]) { chochin(s * 2.9, 1.9, d / 2 + 3.75, 0xf5ead0); toro(s * 5.5, d / 2 + 7, 1.1); tree(s * 9, d / 2 + 5.5, 'pine', 1.1); tree(s * 12.5, d / 2 + 3, 'bush', 1.2); tree(s * 13.5, d / 2 + 7.5, 'maple', .9); }
    K.box(0, 0, d / 2 + 9, 2.6, .05, 10.4, 0xbdb8aa);
    K.collide(0, 0, w, d, 9);
    info.bldgs.push({ ...K.aabb(0, 0, w, d), type: 'onsen' }); info.count++;
    const op = K.wpos(3.2, 0, d / 2 + 5); info.spots.push({ type: 'okami', x: op.x, z: op.z, ry: 0 });
    K.pop();
    K.box(104, 0, -77.2, .6, 3.0, .6, C.woodD); K.sign('♨ 湯の里温泉', 104, 1.7, -76.88, .5, 2.6, { vertical: true, bg: '#f5ead0', fg: '#b3261e' });
    K.collide(104, -77.2, .6, .6, 3);
    // 露天風呂
    const fx0 = 105, fx1 = 128.5, fz0 = -120, fz1 = -83;
    fence(fx0, fz0, fx1, fz0, 'bamboo', 2.3); fence(fx1, fz0, fx1, fz1, 'bamboo', 2.3); fence(fx0, fz0, fx0, fz1, 'bamboo', 2.3);
    fence(fx0, fz1, 111.2, fz1, 'bamboo', 2.3); fence(113.8, fz1, fx1, fz1, 'bamboo', 2.3);
    for (const s of [-1, 1]) K.box(112.5 + s * 1.4, 0, fz1, .24, 2.9, .24, C.woodD);
    K.push(112.5, 2.9, fz1, Math.PI / 2); K.gable(0, 0, 0, 1.6, .7, 3.6, C.wood, C.tile, .4); K.pop();
    K.sign('露天風呂', 112.5, 2.35, fz1, 2.4, .8, { bg: '#b3261e', fg: '#ffffff', double: true });
    for (let z = -75.5; z > fz1 + .5; z -= 1.3) K.box(112.5 + ((z * 10 | 0) % 2 ? .25 : -.25), 0, z, .9, .05, .8, 0x8b877d);
    // 脫衣所
    K.push(109.6, 0, -89.5, Math.PI / 2);
    K.box(0, 0, 0, 7, 2.9, 5, C.wood); K.push(0, 2.9, 0, Math.PI / 2); K.gable(0, 0, 0, 5, 1.4, 7, C.wood, C.tile, .6); K.pop();
    for (const [x, t, c] of [[-1.6, '男', '#1e3a6e'], [1.6, '女', '#b3261e']]) { K.box(x, 0, 2.53, 1.5, 2.2, .06, 0xfff0cf, 'win'); K.sign(t, x, 1.75, 2.7, 1.4, .8, { bg: c, fg: '#ffffff', double: true }); }
    K.collide(0, 0, 7, 5, 5); info.bldgs.push({ ...K.aabb(0, 0, 7, 5), type: 'onsen' }); info.count++;
    K.pop();
    K.box(119.5, 0, -91, 12, .08, 9, 0x8a6a48); for (let i = 0; i < 12; i++) K.box(113.6 + i * 1.0, .08, -91, .04, .005, 9, 0x6a4e34);
    bench(123, -86, 0); bench(126.5, -91, -Math.PI / 2);
    for (let i = 0; i < 4; i++) { K.cyl(116.5 + i * 1.2, .08, -94.6, .2, .2, .3, 0xc9a877, 8); K.cyl(116.9 + i * 1.2, .08, -94.0, .16, .13, .2, 0xd8b98a, 8); }
    const P = { x: 117.3, z: -106.5, r: 7.2 };
    K.cyl(P.x, .005, P.z, P.r + .4, P.r + .4, .03, 0x55615f, 22);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2; if (Math.abs(a) < .22 || a > Math.PI * 2 - .22) continue;
      const rr = P.r + .1 + R() * .3, x = P.x + Math.sin(a) * rr, z = P.z + Math.cos(a) * rr, s = .65 + R() * .45;
      K.ball(x, .3, z, s, pick([0x7d7a73, 0x8f8b82, 0x67655f]), .7 + R() * .3, 'solid', 0); K.collide(x, z, 1.0, 1.0, 1);
    }
    K.ball(P.x - 1.5, .3, P.z - 1, 1.1, 0x7d7a73, .8, 'solid', 0); K.ball(P.x - .5, .2, P.z - 1.8, .7, 0x67655f, .8, 'solid', 0); K.collide(P.x - 1.2, P.z - 1.2, 1.8, 1.8, 1);
    K.ball(P.x, .6, P.z - P.r - .6, 1.6, 0x67655f, .9, 'solid', 0); K.cyl(P.x, 1.5, P.z - P.r + .5, .1, .1, 1.6, C.bamboo, 6, 'solid', Math.PI / 2 - .25, 0);
    K.boxR(P.x, .9, P.z - P.r + 1.25, .14, 1.0, .06, 0xeafcff, .12, 0, 0, 'unlit');
    toro(P.x + 8.3, P.z + 5.5, 1.1); toro(P.x - 8.6, P.z - 3, 1);
    tree(125.5, -116.5, 'maple', 1.2); tree(108.5, -116, 'maple', 1.1); tree(126, -98, 'maple', 1.0); tree(108, -101, 'bamboo'); tree(109.5, -111, 'bamboo'); tree(124, -110.5, 'bamboo');
    const water = new THREE.Mesh(new THREE.CircleGeometry(P.r + .2, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x79cfd0, transparent: true, opacity: .78 }));
    water.position.set(P.x, SL + .36, P.z); scene.add(water); info.waters.push(water);
    info.pool = { x: P.x, z: P.z, r: P.r - .3 }; info.steam.push({ x: P.x, z: P.z, r: P.r - 1, y: SL + .4 });
    info.landmarks.push({ x: 100, z: -98, t: '溫泉', c: '#b3261e' });
    for (let x = 70; x < 103; x += 5.5) tree(x, -116 + (R() - .5) * 4, pick(['cedar', 'round', 'maple']), 1 + R() * .3);
    for (let z = -108; z < -80; z += 7) tree(68.5, z, pick(['round', 'pine']), .9);
    car(72, -80, Math.PI / 2, 0xf2f2f2);
    fence(64.4, -122.6, 64.4, -74.6, 'block', 1.2); fence(64.4, -122.6, 131.6, -122.6, 'block', 1.2);
  }
  K.pop();

  // ---------- 公園 ----------
  K.push(0, SL, 0, 0);
  {
    for (const [x, z] of [[9, 79], [20, 91], [31, 91.5], [41, 79.5], [51, 79], [9.5, 90]]) tree(x, z, 'sakura', 1.05);
    bench(14, 80, 0); bench(36, 80, 0); bench(47, 91.5, Math.PI);
    // 鞦韆
    K.push(17, 0, 86, 0);
    for (const s of [-1, 1]) { K.boxR(s * 1.8, 1.25, .5, .08, 2.7, .08, 0x2f6fb5, .35); K.boxR(s * 1.8, 1.25, -.5, .08, 2.7, .08, 0x2f6fb5, -.35); }
    K.box(0, 2.45, 0, 3.8, .1, .1, 0x2f6fb5);
    for (const x of [-.8, .8]) { for (const s of [-1, 1]) K.box(x + s * .22, .55, 0, .02, 1.9, .02, 0x777777); K.box(x, .5, 0, .55, .05, .25, 0xd03a2a); }
    K.collide(0, 0, 3.8, 1.2, 2); K.pop();
    // 溜滑梯
    K.push(27, 0, 87, 0);
    K.box(0, 0, 0, 1.2, 1.7, 1.2, 0xf0c62a); K.boxR(2.1, .95, 0, 3.6, .08, .9, 0x2f9e6a, 0, 0, -.5); K.boxR(-1.0, .85, 0, .1, 1.9, .8, 0x8a8f96, 0, 0, .35);
    K.collide(.8, 0, 4.4, 1.2, 2); K.pop();
    K.box(35, 0, 87, 3.8, .14, 3.8, 0xe2cf9c); for (const [a, b, w2, d2] of [[35, 85, 4, .2], [35, 89, 4, .2], [33, 87, .2, 4], [37, 87, .2, 4]]) K.box(a, 0, b, w2, .24, d2, C.woodL);
    K.cyl(44.5, .02, 86, 3.2, 3.2, .04, 0x5ba7c2, 16, 'glass');
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; K.ball(44.5 + Math.sin(a) * 3.4, .1, 86 + Math.cos(a) * 3.4, .45 + R() * .3, 0x8f8b82, .6, 'solid', 0); }
    K.collide(44.5, 86, 5, 5, .5); toro(48.6, 86, 1);
    K.cyl(30, 0, 78.6, .07, .07, 3.6, 0x52616b, 6); K.box(30, 3.6, 78.6, .7, .7, .2, 0xffffff);
    K.push(51, 0, 90.5, Math.PI); K.box(0, 0, 0, 3.4, 2.6, 3, 0xd9d4c8); K.push(0, 2.6, 0, Math.PI / 2); K.gable(0, 0, 0, 3, .9, 3.4, 0xd9d4c8, C.tileG, .5); K.pop(); K.sign('お手洗', 0, 2.1, 1.53, null, .4, { bg: '#1565c0', fg: '#ffffff' }); K.collide(0, 0, 3.4, 3, 3); K.pop(); info.count++;
    K.box(24, 0, 75.2, .3, 1.5, .3, C.stone); K.sign('桜町公園', 24, .85, 75.04, .34, 1.3, { vertical: true, bg: '#9b978c', fg: '#1d1d20', ry: Math.PI });
    fence(4.6, 74.6, 22, 74.6, 'hedge', .8); fence(26, 74.6, 55.4, 74.6, 'hedge', .8); fence(4.6, 94.9, 55.4, 94.9, 'hedge', .8);
    info.spots.push({ type: 'cat', x: 36.4, z: 81.2, ry: .6 });
    info.landmarks.push({ x: 30, z: 85, t: '公園', c: '#2e7d32' });
  }
  K.pop();

  // ---------- 電線桿、路燈、行道樹 ----------
  K.push(0, SL, 0, 0);
  const nearX = (v) => XROADS.some((r) => Math.abs(v - r) < 9), nearZ = (v) => ZROADS.some((r) => Math.abs(v - r) < 9);
  function pole(x, z, alongX) {
    K.cyl(x, 0, z, .1, .14, 8.3, 0x7d7469, 6);
    K.box(x, 7.5, z, alongX ? .1 : 1.6, .1, alongX ? 1.6 : .1, 0x5d564e); K.box(x, 6.7, z, alongX ? .08 : 1.0, .08, alongX ? 1.0 : .08, 0x5d564e);
    if (R() < .4) K.cyl(x + (alongX ? 0 : .35), 6.0, z + (alongX ? .35 : 0), .22, .22, .6, 0x8a8f96, 8);
    if (R() < .3) { K.box(x, 2.0, z, .28, .7, .28, 0x2e7d32); }
    K.collide(x, z, .3, .3, 8);
    return [x, z];
  }
  function lamp(x, z, dx, dz) {
    K.cyl(x, 0, z, .07, .09, 5, 0x66707a, 6); K.box(x + dx * .6, 4.95, z + dz * .6, dx ? 1.3 : .08, .08, dz ? 1.3 : .08, 0x66707a);
    K.box(x + dx * 1.2, 4.82, z + dz * 1.2, .5, .12, .5, 0xfff2cc, 'lamp'); K.halo(x + dx * 1.2, 4.6, z + dz * 1.2, 0xffe2a8);
    K.collide(x, z, .25, .25, 5);
  }
  function wire(a, b, alongX) {
    for (const [o, y] of [[-.7, 7.6], [.7, 7.6], [0, 6.8]]) info.wires.push([a[0] + (alongX ? 0 : o), y + SL, a[1] + (alongX ? o : 0), b[0] + (alongX ? 0 : o), y + SL, b[1] + (alongX ? o : 0), .55]);
  }
  for (const z of ZROADS) {
    let prev = null;
    for (let x = -BOUND.x + 6; x < BOUND.x - 4; x += 24) { if (nearX(x)) { x -= 12; continue; } const p = pole(x, z - 4.45, true); if (prev) wire(prev, p, true); prev = p; }
    for (let x = -BOUND.x + 18; x < BOUND.x - 4; x += 24) { if (nearX(x)) continue; lamp(x, z + 4.45, 0, -1); }
  }
  for (const xr of XROADS) {
    let prev = null;
    for (let z = (xr === 0 ? -58 : -BOUND.z + 8); z < BOUND.z - 4; z += 24) { if (nearZ(z) || Math.abs(z) < 7) { z -= 12; continue; } const p = pole(xr - 4.45, z, false); if (prev) wire(prev, p, false); prev = p; }
    for (let z = (xr === 0 ? -46 : -BOUND.z + 20); z < BOUND.z - 4; z += 24) { if (nearZ(z) || Math.abs(z) < 7) continue; lamp(xr + 4.45, z, -1, 0); }
  }
  // 參道櫻花行道樹（中央大道）
  for (let z = -60; z < 66; z += 11) { if (nearZ(z) || Math.abs(z) < 8) continue; for (const s of [-1, 1]) tree(s * 5.1, z + (s > 0 ? 5 : 0), 'sakura', .8); }
  // 道路反射鏡
  for (const [x, z] of [[-64.4, -93.6], [-64.4, 93.4], [64.4, 93.4], [4.4, 93.4], [-4.4, 102.6]]) { K.cyl(x, 0, z, .05, .05, 2.8, 0xf08a1c, 6); K.cyl(x, 2.9, z, .38, .38, .06, 0xf08a1c, 12, 'solid', Math.PI / 2, 0); K.cyl(x, 2.9, z + .04, .31, .31, .04, 0xcfe3ee, 12, 'solid', Math.PI / 2, 0); }
  K.pop();

  // ---------- 外圍 ----------
  for (const s of [-1, 1]) { K.collide(s * (BOUND.x + .6), 0, 1, 2 * BOUND.z + 4, 9); K.collide(0, s * (BOUND.z + .6), 2 * BOUND.x + 4, 1, 9); }
  for (let i = 0; i < 230; i++) {
    const side = Math.floor(R() * 4), t = R() * 2 - 1, o = 3 + R() * 34;
    let x, z;
    if (side < 2) { x = (side ? 1 : -1) * (BOUND.x + 2 + o); z = t * (BOUND.z + 30); } else { z = (side === 2 ? 1 : -1) * (BOUND.z + 3 + o); x = t * (BOUND.x + 30); }
    if (Math.abs(z) < 5 && Math.abs(x) > BOUND.x) continue;
    tree(x, z, pick(['cedar', 'round', 'round', 'sakura']), 1.1 + R() * .7);
  }
  for (const x of XROADS) for (const s of [-1, 1]) { if (x === 0 && s < 0) continue; K.box(x, .05, s * (BOUND.z + 1.2), 8, 1.0, .3, 0xf0c62a); K.box(x, .5, s * (BOUND.z + 1.05), 8, .25, .05, C.black); }
  for (const z of ZROADS) for (const s of [-1, 1]) { K.box(s * (BOUND.x + 1.5), .05, z, .3, 1.0, 8, 0xf0c62a); K.box(s * (BOUND.x + 1.35), .5, z, .05, .25, 8, C.black); }
  for (let i = 0; i < 26; i++) { // 遠山
    const a = i / 26 * Math.PI * 2 + R() * .2, rr = 330 + R() * 120;
    K.ball(Math.sin(a) * rr, -12, Math.cos(a) * rr, 70 + R() * 70, pick([0x4f7a55, 0x5a8560, 0x466e4f]), .42 + R() * .25);
  }

  // ---------- NPC 路網 ----------
  const nodes = new Map(), nid = (x, z) => x + ',' + z;
  function line(pts, off) {
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]; if (!nodes.has(nid(x, z))) nodes.set(nid(x, z), { x, z, e: [] });
      if (i) { const a = nodes.get(nid(...pts[i - 1])), b = nodes.get(nid(x, z)); a.e.push({ to: b, off }); b.e.push({ to: a, off }); }
    }
  }
  for (const z of ZROADS) line([-129, -60, 0, 60, 129].map((x) => [x, z]), 5);
  line([-121, -98, -70, -25, 25, 70, 98, 121].map((z) => [-60, z]), 5);
  line([-121, -70, -25, 25, 70, 98, 121].map((z) => [60, z]), 5);
  line([-70, -25, 25, 70, 98, 121].map((z) => [0, z]), 5);
  line([[0, -70], [0, -84], [0, -100]], 1.3);
  line([-129, -60, 0, 60, 129].map((x) => [x, 98]), 1.5);
  line([[-129, -98], [-60, -98]], 1.5);
  info.nodes = [...nodes.values()];

  return info;
}
