// 日式 NPC：用簡單幾何拼出的人物、柴犬與貓
import * as THREE from 'three';

const mats = new Map();
const mat = (hex) => { let m = mats.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); mats.set(hex, m); } return m; };
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 12, 9),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  robe: new THREE.CylinderGeometry(.72, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 12),
  blob: new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
};
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false });
function part(parent, g, hex, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(G[g], mat(hex));
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m);
  return m;
}
function limb(parent, hex, w, len, x, y, z, d = w) {
  const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
  part(p, 'box', hex, w, len, d, 0, -len / 2, 0);
  return p;
}

const SKIN = [0xf2cfa9, 0xeec39a, 0xf6d8b8];

export const STYLES = {
  traveler: { top: 0x3f8fd0, bottom: 0x3a3f4a, hair: 0x2a1c14, pack: 0xd9822b, hat: 0xf2e7c9 },
  kimono: { robe: true, top: 0xb23a5a, obi: 0xe7c768, hair: 0x18120f, bun: true, sleeves: true },
  kimono2: { robe: true, top: 0x3c5a8f, obi: 0xd9412b, hair: 0x18120f, bun: true, sleeves: true },
  kimono3: { robe: true, top: 0x6a8f5a, obi: 0xf3e9d2, hair: 0x18120f, bun: true, sleeves: true },
  salary: { top: 0x2a2f3a, bottom: 0x2a2f3a, hair: 0x1a1512, tie: 0xb3261e, bag: 0x3a2a1a },
  salary2: { top: 0x55606b, bottom: 0x3a4047, hair: 0x1a1512, tie: 0x1e3a6e, bag: 0x1d1d20 },
  jk: { top: 0xf4f4f4, skirt: 0x23305a, hair: 0x2a1c14, scarf: 0xc8321e, long: true, socks: true },
  jk2: { top: 0x23305a, skirt: 0x23305a, hair: 0x3a2618, scarf: 0xf4f4f4, long: true, socks: true },
  gakuran: { top: 0x1c1c22, bottom: 0x1c1c22, hair: 0x15110e, bag: 0x2a3a5a },
  grandpa: { top: 0x4a5a6a, bottom: 0x4a5a6a, hair: 0xd9d9d9, cane: true, bald: true },
  grandma: { robe: true, top: 0x7a6a8a, obi: 0x4a3a2a, hair: 0xcfcfcf, bun: true, sleeves: true, scale: .92 },
  kid: { top: 0xf4f4f4, bottom: 0x2f4a7a, hair: 0x2a1c14, hat: 0xf5d21f, pack: 0xc8321e, scale: .72 },
  kid2: { top: 0xf7b6c8, skirt: 0xb23a5a, hair: 0x2a1c14, hat: 0xf5d21f, pack: 0xd9412b, scale: .72, socks: true },
  yukata: { robe: true, top: 0xf0efe6, obi: 0x23305a, hair: 0x2a1c14, sleeves: true, towel: true },
  yukata2: { robe: true, top: 0x8fb5c9, obi: 0xf0efe6, hair: 0x18120f, sleeves: true, bun: true, towel: true },
  shopper: { top: 0xe9b44c, skirt: 0x6a4a3a, hair: 0x3a2618, bag: 0xf4f4f4, long: true },
  miko: { robe: true, top: 0xf7f7f2, lower: 0xd2401f, hair: 0x15110e, long: true, sleeves: true },
  clerk: { top: 0x18a058, bottom: 0x2a2f3a, hair: 0x2a1c14, stripe: 0xff7a1a },
  okami: { robe: true, top: 0x4a2a6a, obi: 0xe7c768, hair: 0x18120f, bun: true, sleeves: true },
  staff: { top: 0x1e2a4a, bottom: 0x1e2a4a, hair: 0x1a1512, cap: 0x1e2a4a },
  police: { top: 0x3a5a9a, bottom: 0x1e2a4a, hair: 0x1a1512, cap: 0x1e2a4a },
  chef: { top: 0xf7f7f2, bottom: 0x2a2f3a, hair: 0x1a1512, band: 0xf7f7f2, apron: 0x1e3a6e },
};

export function makePerson(styleName, seed = 0) {
  const s = STYLES[styleName] || STYLES.traveler;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = SKIN[seed % SKIN.length];
  const o = { group: g, body, legs: [], arms: [], robe: !!s.robe, kind: 'person' };
  if (s.robe) {
    part(body, 'robe', s.lower ?? s.top, .3, .86, .26, 0, .43, 0);
    part(body, 'box', 0x2a2018, .1, .05, .2, -.09, .025, .05); part(body, 'box', 0x2a2018, .1, .05, .2, .09, .025, .05);
    part(body, 'box', s.top, .44, .52, .27, 0, 1.1, 0);
    if (s.obi) part(body, 'box', s.obi, .46, .16, .29, 0, .9, 0);
    if (s.obi && s.bun) part(body, 'box', s.obi, .3, .26, .1, 0, .96, -.17);
  } else {
    const legCol = s.skirt ? (s.socks ? skin : skin) : s.bottom;
    for (const sx of [-1, 1]) {
      const l = limb(body, legCol, .15, .8, sx * .11, .82, 0, .17); o.legs.push(l);
      part(l, 'box', s.skirt ? 0x3a2a1a : 0x1d1d20, .16, .08, .26, 0, -.8, .04);
      if (s.socks) part(l, 'box', 0xf4f4f4, .155, .22, .175, 0, -.66, 0);
    }
    if (s.skirt) part(body, 'robe', s.skirt, .3, .4, .25, 0, .72, 0);
    part(body, 'box', s.top, .42, .56, .25, 0, 1.1, 0);
    if (s.tie) { part(body, 'box', 0xf4f4f4, .12, .3, .02, 0, 1.2, .125); part(body, 'box', s.tie, .05, .28, .02, 0, 1.18, .135); }
    if (s.scarf) part(body, 'box', s.scarf, .2, .1, .04, 0, 1.3, .13);
    if (s.stripe) part(body, 'box', s.stripe, .43, .08, .26, 0, 1.2, 0);
    if (s.apron) part(body, 'box', s.apron, .36, .5, .03, 0, .85, .13);
  }
  for (const sx of [-1, 1]) {
    const a = limb(body, s.top, s.sleeves ? .15 : .12, s.sleeves ? .5 : .56, sx * (s.sleeves ? .3 : .28), 1.34, 0, s.sleeves ? .24 : .14); o.arms.push(a);
    part(a, 'sph', skin, .06, .06, .06, 0, s.sleeves ? -.54 : -.6, 0);
  }
  const head = new THREE.Group(); head.position.set(0, 1.56, 0); body.add(head); o.head = head;
  part(head, 'sph', skin, .17, .18, .17, 0, 0, 0);
  for (const sx of [-1, 1]) part(head, 'box', 0x1d1d20, .03, .045, .02, sx * .065, .01, .16);
  if (!s.bald) { part(head, 'sph', s.hair, .185, .16, .185, 0, .055, -.035); if (s.long) part(head, 'box', s.hair, .3, .34, .1, 0, -.12, -.13); }
  else part(head, 'sph', s.hair, .18, .08, .18, 0, -.02, -.06);
  if (s.bun) part(head, 'sph', s.hair, .09, .09, .09, 0, .2, -.08);
  if (s.hat) { part(head, 'cyl', s.hat, .26, .02, .26, 0, .12, 0); part(head, 'sph', s.hat, .18, .13, .18, 0, .13, 0); }
  if (s.cap) { part(head, 'cyl', s.cap, .18, .09, .18, 0, .15, 0); part(head, 'box', 0x111111, .2, .02, .12, 0, .11, .17); part(head, 'box', 0xd4a93a, .06, .05, .02, 0, .16, .18); }
  if (s.band) part(head, 'cyl', s.band, .18, .05, .18, 0, .08, 0);
  if (s.pack) part(body, 'box', s.pack, .3, .38, .16, 0, 1.12, -.2);
  if (s.bag) part(o.arms[0], 'box', s.bag, .08, .26, .34, 0, -.72, 0);
  if (s.towel) part(body, 'box', 0xfafafa, .46, .06, .1, 0, 1.38, .1);
  if (s.cane) part(o.arms[1], 'box', 0x5a4030, .03, .8, .03, 0, -.9, .1);
  if (styleName === 'miko') { const b = limb(o.arms[1], 0x8a6a48, .03, 1.3, 0, -.5, .1); b.rotation.x = -.5; part(b, 'box', 0xc9a877, .3, .3, .06, 0, -1.3, 0); }
  const sc = s.scale || 1; body.scale.setScalar(sc);
  const blob = new THREE.Mesh(G.blob, blobMat); blob.scale.setScalar(.34 * sc); blob.position.y = .02; g.add(blob);
  o.h = 1.75 * sc;
  return o;
}

export function makeDog() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const C1 = 0xd9893a, C2 = 0xf5e9d6;
  part(body, 'box', C1, .26, .26, .6, 0, .42, 0); part(body, 'box', C2, .2, .1, .5, 0, .31, 0);
  const head = new THREE.Group(); head.position.set(0, .6, .34); body.add(head);
  part(head, 'box', C1, .26, .24, .24, 0, 0, 0); part(head, 'box', C2, .16, .13, .14, 0, -.05, .14); part(head, 'box', 0x1d1d20, .05, .04, .03, 0, -.01, .22);
  for (const sx of [-1, 1]) { part(head, 'box', C1, .08, .1, .05, sx * .09, .16, -.03); part(head, 'box', 0x1d1d20, .03, .03, .02, sx * .07, .04, .125); }
  const tail = part(body, 'sph', C2, .09, .09, .09, 0, .6, -.3);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(limb(body, sz > 0 ? C2 : C1, .08, .3, sx * .09, .3, sz * .22));
  const blob = new THREE.Mesh(G.blob, blobMat); blob.scale.set(.25, 1, .4); blob.position.y = .02; g.add(blob);
  return { group: g, body, legs, arms: [], head, tail, kind: 'dog', h: .9 };
}

export function makeCat() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const C1 = 0xf2f0ea, C2 = 0x3a3a3a, C3 = 0xd9893a;
  part(body, 'sph', C1, .15, .17, .19, 0, .17, 0);
  const head = new THREE.Group(); head.position.set(0, .4, .1); body.add(head);
  part(head, 'sph', C1, .12, .11, .11, 0, 0, 0); part(head, 'sph', C3, .07, .06, .07, .06, .05, -.02); part(head, 'sph', C2, .06, .05, .06, -.07, .05, -.03);
  for (const sx of [-1, 1]) { const e = part(head, 'cone', sx > 0 ? C3 : C2, .04, .08, .04, sx * .07, .12, 0); part(head, 'box', 0x1d1d20, .02, .03, .01, sx * .045, .01, .105); }
  const tail = limb(body, C2, .04, .3, 0, .08, -.18); tail.rotation.x = -2.2;
  const blob = new THREE.Mesh(G.blob, blobMat); blob.scale.setScalar(.2); blob.position.y = .02; g.add(blob);
  return { group: g, body, legs: [], arms: [], head, tail, kind: 'cat', h: .7 };
}

export const TALK = {
  kimono: { name: '和服女士', lines: ['こんにちは～ 今天天氣真好，很適合散步呢。', '神社參道的櫻花開得正美，一定要去看看喔。', '這件和服是在商店街的「きもの 京」訂做的。'] },
  salary: { name: '上班族', lines: ['お疲れ様です… 今天又要加班了。', '下班後想去居酒屋喝一杯啊。', '電車在櫻町與湯之里之間來回，很準時的。'] },
  jk: { name: '女高中生', lines: ['放學後要跟朋友去ニコマート買飯糰！', '聽說神社的戀愛籤超靈驗的…', '五重塔那邊拍照很好看喔！'] },
  gakuran: { name: '男高中生', lines: ['社團練習好累～ 好想吃拉麵。', '平交道噹噹響的時候千萬不要闖喔。'] },
  grandpa: { name: '老爺爺', lines: ['年輕人，泡過湯之里的溫泉了嗎？對腰很好喔。', '我在這條街住了七十年囉。', '以前這裡只有神社和一條鐵路呢。'] },
  grandma: { name: '老奶奶', lines: ['哎呀，是觀光客嗎？歡迎歡迎。', '和菓子店的大福是我每天的小確幸。'] },
  kid: { name: '小學生', lines: ['我的書包是不是很帥！', '柴犬小麻糬最喜歡被摸頭了！', '公園的溜滑梯是全鎮最高的！'] },
  yukata: { name: '浴衣旅客', lines: ['剛泡完溫泉，來瓶咖啡牛奶最棒了！', '露天風呂的楓葉好漂亮，你也快去泡吧。'] },
  shopper: { name: '主婦', lines: ['今天超市的蘿蔔特價呢。', '晚餐煮什麼好呢… 還是買可樂餅吧。'] },
  miko: { name: '巫女', lines: ['歡迎來到櫻山神社。參拜是「二禮二拍手一禮」喔。', '旁邊的授與所可以抽御神籤。', '御神木已經有八百年的歷史了。'] },
  clerk: { name: '超商店員', lines: ['いらっしゃいませ～！炸雞剛起鍋喔。', '要加熱便當嗎？', '集點卡要幫您蓋章嗎？'] },
  okami: { name: '旅館女將', lines: ['歡迎光臨湯之里溫泉。露天風呂請從右手邊的竹籬門進去。', '泉質是美肌之湯，請慢慢享受。'] },
  staff: { name: '站務員', lines: ['電車行駛於櫻町與湯之里之間。', '電車停靠時，在月台上按「乘車」就能上車。', '請勿超越黃線，謝謝合作。'] },
  police: { name: '警察', lines: ['有什麼需要幫忙的嗎？', '迷路的話可以看右上角的地圖喔。'] },
  dog: { name: '柴犬 小麻糬', lines: ['汪！（開心地搖尾巴）', '汪汪！（把頭湊過來讓你摸）'] },
  cat: { name: '三花貓', lines: ['喵～（瞇起眼睛）', '……（打了個大呵欠）'] },
};
