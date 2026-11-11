// 建模工具：把大量方塊／圓柱合併成少數幾個網格（頂點色），並把招牌文字畫進同一張貼圖
import * as THREE from 'three';

export function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _v = new THREE.Vector3(), _c = new THREE.Color(), _n = new THREE.Matrix3();
const _l = new THREE.Matrix4(), _w = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}
function prismGeo() {
  const a = [
    -.5, -.5, .5, .5, -.5, .5, 0, .5, .5,
    .5, -.5, -.5, -.5, -.5, -.5, 0, .5, -.5,
    -.5, -.5, -.5, -.5, -.5, .5, 0, .5, .5,
    -.5, -.5, -.5, 0, .5, .5, 0, .5, -.5,
    .5, -.5, .5, .5, -.5, -.5, 0, .5, -.5,
    .5, -.5, .5, 0, .5, -.5, 0, .5, .5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  g.computeVertexNormals();
  return g;
}
const GEO = {
  box: prep(new THREE.BoxGeometry(1, 1, 1)),
  plane: prep(new THREE.PlaneGeometry(1, 1)),
  prism: prismGeo(),
  pyr: prep(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4)),
};
const cache = new Map();
function geo(key, make) {
  let g = cache.get(key);
  if (!g) { g = prep(make()); cache.set(key, g); }
  return g;
}

export class Batch {
  constructor(uv = false) { this.pos = []; this.nor = []; this.col = []; this.uv = uv ? [] : null; }
  add(g, m, hex, r) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const uv = g.attributes.uv ? g.attributes.uv.array : null;
    _n.getNormalMatrix(m); _c.setHex(hex);
    const cnt = p.length / 3;
    for (let i = 0; i < cnt; i++) {
      _v.fromArray(p, i * 3).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z);
      _v.fromArray(n, i * 3).applyMatrix3(_n).normalize(); this.nor.push(_v.x, _v.y, _v.z);
      this.col.push(_c.r, _c.g, _c.b);
      if (this.uv) {
        if (uv && r) this.uv.push(r.u0 + uv[i * 2] * (r.u1 - r.u0), r.v0 + uv[i * 2 + 1] * (r.v1 - r.v0));
        else this.uv.push(0, 0);
      }
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
  get tris() { return this.pos.length / 9; }
}

const FONT = '"Noto Sans JP","Noto Sans TC","Hiragino Sans","Yu Gothic","Microsoft JhengHei","PingFang TC",sans-serif';

export class Atlas {
  constructor(size = 2048) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#888'; this.ctx.fillRect(0, 0, size, size);
    this.x = 4; this.y = 4; this.rowH = 0; this.map = new Map();
  }
  alloc(w, h) {
    if (this.x + w + 4 > this.size) { this.x = 4; this.y += this.rowH + 6; this.rowH = 0; }
    if (this.y + h + 4 > this.size) { console.warn('atlas full'); return { x: 4, y: 4 }; }
    const r = { x: this.x, y: this.y };
    this.x += w + 6; this.rowH = Math.max(this.rowH, h);
    return r;
  }
  rect(x, y, w, h) {
    const s = this.size, i = 1.5;
    return { u0: (x + i) / s, u1: (x + w - i) / s, v0: 1 - (y + h - i) / s, v1: 1 - (y + i) / s, aspect: w / h };
  }
  custom(key, w, h, draw) {
    if (this.map.has(key)) return this.map.get(key);
    const { x, y } = this.alloc(w, h), c = this.ctx;
    c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip();
    draw(c, w, h);
    c.restore();
    const r = this.rect(x, y, w, h);
    this.map.set(key, r);
    return r;
  }
  text(str, o = {}) {
    const bg = o.bg || '#ffffff', fg = o.fg || '#111111', vertical = !!o.vertical;
    const key = 't|' + str + '|' + bg + '|' + fg + '|' + (vertical ? 1 : 0) + '|' + (o.border || '');
    if (this.map.has(key)) return this.map.get(key);
    const c = this.ctx, px = 32, chars = [...str];
    c.font = `900 ${px}px ${FONT}`;
    let w, h;
    if (vertical) { w = 46; h = chars.length * 36 + 12; }
    else { w = Math.ceil(c.measureText(str).width) + 20; h = 46; }
    return this.custom(key, w, h, (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      if (o.border) { c.strokeStyle = o.border; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4); }
      c.fillStyle = fg; c.font = `900 ${px}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (vertical) {
        chars.forEach((ch, i) => {
          const cy = 6 + i * 36 + 18;
          if (ch === 'ー' || ch === '〜' || ch === '-') {
            c.save(); c.translate(w / 2, cy); c.rotate(Math.PI / 2); c.fillText(ch, 0, 0); c.restore();
          } else c.fillText(ch, w / 2, cy + 2);
        });
      } else c.fillText(str, w / 2, h / 2 + 2);
    });
  }
  texture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
}

export class Kit {
  constructor(atlas) {
    this.atlas = atlas;
    this.b = { solid: new Batch(), unlit: new Batch(), win: new Batch(), lamp: new Batch(), glass: new Batch(), sign: new Batch(true) };
    this.M = new THREE.Matrix4(); this.ry = 0; this.st = [];
    this.cols = []; this.halos = [];
  }
  push(x = 0, y = 0, z = 0, ry = 0) {
    this.st.push([this.M.clone(), this.ry]);
    _t.makeRotationY(ry).setPosition(x, y, z);
    this.M.multiply(_t); this.ry += ry;
  }
  pop() { const s = this.st.pop(); this.M = s[0]; this.ry = s[1]; }
  wpos(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }
  _add(batch, g, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, r) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _l.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    _w.multiplyMatrices(this.M, _l);
    this.b[batch].add(g, _w, color, r);
  }
  // y = 底部高度
  box(x, y, z, w, h, d, color, batch = 'solid') { this._add(batch, GEO.box, x, y + h / 2, z, w, h, d, color); }
  // y = 中心高度，可旋轉
  boxR(x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0, batch = 'solid') { this._add(batch, GEO.box, x, y, z, w, h, d, color, rx, ry, rz); }
  cyl(x, y, z, rt, rb, h, color, seg = 8, batch = 'solid', rx = 0, rz = 0) {
    const g = geo(`c${rt.toFixed(3)}|${rb.toFixed(3)}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
    this._add(batch, g, x, y + (rx || rz ? 0 : h / 2), z, 1, h, 1, color, rx, 0, rz);
  }
  ball(x, y, z, r, color, sy = 1, batch = 'solid', detail = 1) {
    const g = geo('i' + detail, () => new THREE.IcosahedronGeometry(1, detail));
    this._add(batch, g, x, y, z, r, r * sy, r, color);
  }
  cone(x, y, z, r, h, color, seg = 7, batch = 'solid') {
    const g = geo('k' + seg, () => new THREE.ConeGeometry(1, 1, seg));
    this._add(batch, g, x, y + h / 2, z, r, h, r, color);
  }
  pyr(x, y, z, w, h, d, color, batch = 'solid') { this._add(batch, GEO.pyr, x, y + h / 2, z, w, h, d, color); }
  // 山牆屋頂：屋脊沿本地 z 軸
  gable(x, y, z, w, h, d, wallC, roofC, ov = .6, t = .18) {
    this._add('solid', GEO.prism, x, y + h / 2, z, w, h, d, wallC);
    const a = Math.atan2(h, w / 2), half = w / 2 + ov, s = half / Math.cos(a) + .12;
    for (const sg of [-1, 1])
      this.boxR(x + sg * half / 2, y + h - (half / 2) * Math.tan(a) + t * .6, z, s, t, d + ov * 2, roofC, 0, 0, -sg * a);
    this.box(x, y + h + t * .1, z, .36, .24, d + ov * 2 + .1, roofC);
  }
  sign(text, x, y, z, w, h, o = {}) {
    const r = o.rect || this.atlas.text(text, o);
    if (w == null) w = h * r.aspect;
    if (h == null) h = w / r.aspect;
    this._add('sign', GEO.plane, x, y, z, w, h, 1, 0xffffff, o.rx || 0, o.ry || 0, 0, r);
    if (o.double) this._add('sign', GEO.plane, x, y, z, w, h, 1, 0xffffff, 0, (o.ry || 0) + Math.PI, 0, r);
    return w;
  }
  aabb(x, z, w, d) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [cx, cz] of [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]]) {
      _v.set(cx, 0, cz).applyMatrix4(this.M);
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z);
    }
    return { x0, x1, z0, z1 };
  }
  collide(x, z, w, d, h = 50) {
    const c = this.aabb(x, z, w, d); c.h = h;
    this.cols.push(c);
    return c;
  }
  halo(x, y, z, hex = 0xffc27a) { const p = this.wpos(x, y, z); this.halos.push(p.x, p.y, p.z, hex); }
}
