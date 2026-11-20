// 環境：地形、道路、岸線、碼頭、遠山、天空、霧、水面（倒影＋波紋＋船尾浪）
import * as THREE from "three";
import { Batch, M, box, cyl, lathe, rod, tube, surface, ribbon, mat } from "./geo.js";
import * as TX from "./tex.js";
import { river, creek, RIVER_HW, BANK, terrainH, embanked, roadLines, docks, dockLocal, rng, smooth, clamp, bridge, terrace, hillH } from "./layout.js";

/* ---------------- 地形 ---------------- */
function axis(min, max, cMin, cMax, fine, coarse) {
  const a = [];
  let x = min;
  while (x < max) { a.push(x); x += x >= cMin && x < cMax ? fine : coarse; }
  a.push(max);
  return a;
}
export function buildTerrain(scene) {
  const xs = axis(-760, 760, -420, 420, 2.5, 9), zs = axis(-620, 480, -420, 230, 2.5, 9);
  const W = xs.length, H = zs.length;
  const pos = new Float32Array(W * H * 3), col = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2);
  const cEarth = new THREE.Color(0xc6b48c), cGrass = new THREE.Color(0x8c9a68), cGrass2 = new THREE.Color(0x6f8457), cBed = new THREE.Color(0x56635a), cRock = new THREE.Color(0x8b8a7d), cMoss = new THREE.Color(0x5f7552);
  const hs = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = terrainH(xs[i], zs[j]);
  const c = new THREE.Color();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = xs[i], z = zs[j], h = hs[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
    const hx = hs[j * W + Math.min(W - 1, i + 1)] - hs[j * W + Math.max(0, i - 1)];
    const hz = hs[Math.min(H - 1, j + 1) * W + i] - hs[Math.max(0, j - 1) * W + i];
    const slope = Math.hypot(hx, hz) / 5;
    const hill = clamp(hillH(x, z) / 25, 0, 1);
    const town = smooth(40, 0, Math.max(Math.abs(x - 90) - 200, Math.abs(z + 85) - 85)) + smooth(30, 0, Math.max(Math.abs(x + 240) - 100, Math.abs(z + 50) - 80));
    c.copy(cGrass).lerp(cGrass2, hill * 0.8 + Math.sin(x * 0.05) * Math.sin(z * 0.04) * 0.2);
    c.lerp(cEarth, clamp(town, 0, 1) * 0.75);
    if (h < 0.4) c.lerp(cBed, smooth(0.4, -0.8, h));
    c.lerp(cRock, clamp((slope - 0.35) * 1.5, 0, 0.8));
    if (hill > 0.5) c.lerp(cMoss, (hill - 0.5) * 0.6);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.earth(), roughness: 0.97, color: 0xffffff });
  m.map = TX.earth().clone(); m.map.needsUpdate = true;
  m.onBeforeCompile = (sh) => {
    // 只拿貼圖的明暗當細節，不讓顏色變黃
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `
      vec4 tc = texture2D( map, vMapUv );
      float lum = dot(tc.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb *= 0.75 + lum * 0.45;`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/* ---------------- 道路與廣場 ---------------- */
export function buildRoads(b, groundAt) {
  const key = { stone: "flag", earth: "earth", steps: "steps" };
  for (const R of roadLines) {
    const g = ribbon(R.pts, () => R.w / 2, (x, z) => groundAt(x, z) + 0.06, R.kind === "steps" ? 2.4 : 4);
    b.add(key[R.kind], g);
    // 石板路的路緣石
    if (R.kind === "stone") for (const s of [-1, 1]) b.add("stoneDark", ribbon(R.pts, () => 0.18, (x, z) => groundAt(x, z) + 0.1, 2), M([0, 0, 0]));
  }
  // 廣場：門樓前、橋東頭、御街口
  const plaza = (cx, cz, w, d, rot, k = "flag") => {
    const g = surface(Math.ceil(w / 3), Math.ceil(d / 3), (u, v) => {
      const lx = (u - 0.5) * w, lz = (v - 0.5) * d;
      const x = cx + lx * Math.cos(rot) + lz * Math.sin(rot), z = cz - lx * Math.sin(rot) + lz * Math.cos(rot);
      return [x, groundAt(x, z) + 0.07, z];
    }, (u, v) => [(u * w) / 4, (v * d) / 4]);
    b.add(k, g);
  };
  const bw = bridge.toWorld(-bridge.half - 8, 0), be = bridge.toWorld(bridge.half + 6, 0);
  const rot = Math.atan2(bridge.ax, bridge.az);
  plaza(bw.x, bw.z, 18, 26, rot);
  plaza(be.x, be.z, 16, 20, rot);
  plaza(112, -60, 36, 24, 0);
  plaza(112, -136, 50, 22, 0);
}

/* ---------------- 砌石岸線 ---------------- */
export function buildEmbankment(b) {
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const pts = run;
        b.add("stone", surface(pts.length - 1, 1, (u, v) => {
          const i = Math.round(u * (pts.length - 1)); const p = pts[i];
          return [p.x, -1.8 + (BANK + 0.12 + 1.8) * v, p.z];
        }, (u, v) => [u * (pts.length - 1) * 2 / 3, v * 1.3]));
        // 壓頂石＋岸頂石板（蓋住地形在牆後的落差）
        b.add("stoneLight", surface(pts.length - 1, 1, (u, v) => {
          const i = Math.round(u * (pts.length - 1)); const p = pts[i];
          return [p.x - p.ox * 0.15 + p.ox * 0.85 * v, BANK + 0.16, p.z - p.oz * 0.15 + p.oz * 0.85 * v];
        }));
        b.add("flag", surface(pts.length - 1, 1, (u, v) => {
          const i = Math.round(u * (pts.length - 1)); const p = pts[i];
          return [p.x + p.ox * (0.7 + 2.6 * v), BANK + 0.12, p.z + p.oz * (0.7 + 2.6 * v)];
        }, (u, v) => [u * (pts.length - 1) / 2, v]));
      }
      run = [];
    };
    for (let s = 0; s <= river.len; s += 2) {
      const p = river.at(s);
      const ox = side * p.nx, oz = side * p.nz;
      const x = p.x + ox * RIVER_HW, z = p.z + oz * RIVER_HW;
      let skip = !embanked(s, side);
      // 碼頭石階的位置留缺口
      for (const d of docks) { const l = dockLocal(d, x, z); if (Math.abs(l.t) < 3.1 && Math.abs(l.o) < 2) skip = true; }
      if (skip) { flush(); continue; }
      run.push({ x, z, ox, oz });
    }
    flush();
  }
  // 小溪的石岸（短短一段）
}

/* ---------------- 碼頭與繫船樁 ---------------- */
export function buildDocks(b) {
  for (const d of docks) {
    const rot = Math.atan2(d.inx, d.inz);
    const P = M([d.x, 0, d.z], [0, rot, 0]);   // 局部：z 朝河心，x 沿岸
    const top = d.top;
    b.add("stone", box(d.w, top + 2.2, d.out), M([0, (top - 2.2) / 2, d.out / 2]), P);
    b.add("stoneLight", box(d.w + 0.3, 0.16, d.out + 0.3), M([0, top + 0.02, d.out / 2]), P);
    // 往岸上的石階
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, y = top + (BANK - top) * ((i + 1) / n);
      b.add("stoneLight", box(6.0, y + 1.5, 0.62), M([0, (y - 1.5) / 2, -0.3 - t0 * 4.2]), P);
    }
    for (const s of [-1, 1]) b.add("stone", box(0.6, BANK + 2, 4.6), M([s * 3.3, (BANK - 2) / 2 + 0.35, -2.3]), P);
    // 繫船樁
    for (const x of [-d.w / 2 + 0.6, -d.w / 6, d.w / 6, d.w / 2 - 0.6]) {
      b.add("stoneLight", lathe([[0, 0], [0.22, 0], [0.2, 0.55], [0.26, 0.6], [0.16, 0.75], [0, 0.78]], 8), M([x, top, d.out - 0.5]), P);
    }
    for (const z of [1.5, 5]) b.add("stoneLight", lathe([[0, 0], [0.2, 0], [0.18, 0.5], [0.24, 0.55], [0, 0.7]], 8), M([d.w / 2 - 0.5, top, z]), P);
    // 木樁防撞
    for (let x = -d.w / 2; x <= d.w / 2; x += 2) b.add("woodDark", cyl(0.14, 0.14, 3.2, 6), M([x, top - 1.5, d.out + 0.12]), P);
    // 貨物
    if (d.name === "貨運碼頭") {
      const r = rng(5);
      for (let i = 0; i < 14; i++) {
        const x = (r() - 0.5) * (d.w - 3), z = 1 + r() * (d.out - 3);
        if (r() < 0.5) b.add("goods1", lathe([[0, 0], [0.3, 0.02], [0.36, 0.25], [0.3, 0.5], [0, 0.52]], 8), M([x, top + 0.02, z], [0, 0, Math.PI / 2]), P);
        else b.add("woodGrain", box(0.8, 0.6, 0.7), M([x, top + 0.32, z], [0, r(), 0]), P);
      }
    }
  }
}

/* ---------------- 遠山（層層淡入晨霧） ---------------- */
export function buildMountains(scene) {
  const layers = [
    { R: 760, H: 150, col: 0x557f6c, top: 0x7ea08a, n: 7, seed: 1 },
    { R: 1050, H: 260, col: 0x6a8f80, top: 0x93ad9c, n: 6, seed: 2 },
    { R: 1450, H: 380, col: 0x86a39a, top: 0xadc0b6, n: 5, seed: 3 },
    { R: 2000, H: 520, col: 0xa3b8b2, top: 0xc6d2cb, n: 4, seed: 4 },
  ];
  const group = new THREE.Group();
  for (const L of layers) {
    const r = rng(L.seed * 97);
    const peaks = Array.from({ length: L.n * 3 }, () => ({ a: -Math.PI * 0.95 + r() * Math.PI * 1.9, h: L.H * (0.45 + r() * 0.75), w: 0.08 + r() * 0.12 }));
    const segA = 220, segV = 6;
    const pos = [], col = [], idx = [];
    const c0 = new THREE.Color(L.col), c1 = new THREE.Color(L.top), cc = new THREE.Color();
    for (let i = 0; i <= segA; i++) {
      const a = -Math.PI + (2 * Math.PI * i) / segA;       // 繞一圈；北方（-z）最高
      let h = 0;
      for (const p of peaks) { const d = Math.atan2(Math.sin(a - p.a), Math.cos(a - p.a)); h = Math.max(h, p.h * Math.exp(-(d * d) / (p.w * p.w))); }
      h += Math.sin(a * 23 + L.seed) * L.H * 0.04 + Math.sin(a * 57) * L.H * 0.02;
      const north = 0.45 + 0.55 * Math.max(0, -Math.cos(a));
      h *= north;
      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const R = L.R * (1 + 0.08 * (1 - v));
        const x = Math.sin(a) * R, z = -Math.cos(a) * R;
        pos.push(x, -20 + (h + 20) * Math.pow(v, 0.9), z);
        cc.copy(c0).lerp(c1, Math.pow(v, 1.5));
        col.push(cc.r, cc.g, cc.b);
      }
    }
    for (let i = 0; i < segA; i++) for (let j = 0; j < segV; j++) { const a = i * (segV + 1) + j, b = a + segV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(g, m));
  }
  scene.add(group);
  return group;
}

/* ---------------- 天空 ---------------- */
export function buildSky(scene, sunDir) {
  const g = new THREE.SphereGeometry(5000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 zen = vec3(0.62, 0.74, 0.74);
        vec3 hor = vec3(0.93, 0.90, 0.80);
        vec3 c = mix(hor, zen, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c += vec3(1.0, 0.82, 0.55) * (pow(s, 12.0) * 0.35 + pow(s, 300.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

/* ---------------- 霧（遠山山腳、河灣） ---------------- */
export function buildMist(scene) {
  const tex = TX.mistTex();
  const list = [];
  const r = rng(55);
  const add = (x, y, z, w, h, op) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, fog: true }));
    s.position.set(x, y, z); s.scale.set(w, h, 1);
    s.userData = { x0: x, sp: 2 + r() * 4, ph: r() * 6 };
    scene.add(s); list.push(s);
  };
  for (let i = 0; i < 22; i++) { const a = -Math.PI * 0.9 + r() * Math.PI * 1.8; const R = 650 + r() * 900; add(Math.sin(a) * R, 30 + r() * 120, -Math.cos(a) * R, 500 + r() * 500, 90 + r() * 80, 0.55); }
  // 河灣上游、下游的薄霧
  for (let i = 0; i < 10; i++) { const p = river.at(r() < 0.5 ? r() * 260 : river.len - r() * 300); add(p.x, 4 + r() * 6, p.z, 160 + r() * 120, 22 + r() * 12, 0.35); }
  // 後山的雲帶
  for (let i = 0; i < 8; i++) add(120 + r() * 300, 30 + r() * 25, -360 - r() * 120, 200 + r() * 120, 30, 0.4);
  return list;
}

/* ---------------- 水面 ---------------- */
export class Water {
  constructor(renderer, scene, { quality = 1 } = {}) {
    this.renderer = renderer; this.scene = scene;
    const size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
    this.rt = new THREE.WebGLRenderTarget(Math.max(256, size.x * 0.5 * quality) | 0, Math.max(256, size.y * 0.5 * quality) | 0, { type: THREE.HalfFloatType });
    this.mirror = new THREE.PerspectiveCamera();
    this.texMat = new THREE.Matrix4();
    this.uniforms = {
      uTime: { value: 0 },
      uRefl: { value: this.rt.texture },
      uTexMat: { value: this.texMat },
      uBoats: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uFlow: { value: new THREE.Vector2(1, 0.05).normalize() },
    };
    const m = new THREE.MeshStandardMaterial({ color: 0x5f7f72, roughness: 0.55, metalness: 0.0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = "uniform mat4 uTexMat;\nvarying vec4 vRefl;\nvarying vec3 vW;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
        vec4 wpW = modelMatrix * vec4(transformed, 1.0);
        vW = wpW.xyz; vRefl = uTexMat * wpW;`);
      sh.fragmentShader = `uniform float uTime; uniform sampler2D uRefl; uniform vec4 uBoats[8]; uniform vec2 uFlow;
        varying vec4 vRefl; varying vec3 vW;
        vec2 waveN(vec2 p, float t) {
          vec2 n = vec2(0.0);
          vec2 f = uFlow, g = vec2(-uFlow.y, uFlow.x);
          float a;
          a = dot(p, f) * 0.9 - t * 1.4;  n += f * cos(a) * 0.045;
          a = dot(p, normalize(f + g * 0.6)) * 1.7 - t * 2.1; n += normalize(f + g * 0.6) * cos(a) * 0.03;
          a = dot(p, normalize(f - g * 0.8)) * 2.9 - t * 2.6; n += normalize(f - g * 0.8) * cos(a) * 0.022;
          a = dot(p, g) * 4.3 + sin(dot(p, f) * 0.3) * 2.0 - t * 1.2; n += g * cos(a) * 0.012;
          a = dot(p, normalize(f * 0.3 + g)) * 7.1 - t * 3.3; n += normalize(f * 0.3 + g) * cos(a) * 0.01;
          return n;
        }
        float wake(vec2 p, out vec2 dn) {
          float foam = 0.0; dn = vec2(0.0);
          for (int i = 0; i < 8; i++) {
            vec4 b = uBoats[i];
            if (b.w < 0.05) continue;
            vec2 fw = vec2(sin(b.z), cos(b.z));
            vec2 rt = vec2(fw.y, -fw.x);
            vec2 d = p - b.xy;
            float back = -dot(d, fw) - b.w * 0.0;
            float side = dot(d, rt);
            if (back < -5.0 || back > 60.0) continue;
            float k = clamp(b.w / 3.0, 0.0, 1.0);
            float arm = abs(abs(side) - max(back, 0.0) * 0.36 - 1.0);
            float env = exp(-arm * arm / (0.5 + back * 0.08)) * exp(-max(back, 0.0) / 22.0) * step(0.0, back + 4.0);
            float rip = sin(back * 3.2 - uTime * 7.0 + abs(side) * 1.5);
            dn += rt * sign(side) * env * rip * 0.12 * k;
            float stern = exp(-side * side / 1.6) * exp(-max(back - 4.0, 0.0) / 8.0) * step(3.5, back);
            foam += (env * 0.35 + stern * 0.45) * k;
          }
          return foam;
        }
        ` + sh.fragmentShader
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          vec2 wn = waveN(vW.xz, uTime);
          vec2 wd; float foam = wake(vW.xz, wd);
          wn += wd;
          vec3 nW = normalize(vec3(-wn.x, 1.0, -wn.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`)
        .replace("#include <opaque_fragment>", `
          vec2 ruv = vRefl.xy / vRefl.w + wn * 0.06;
          vec3 refl = texture2D(uRefl, ruv).rgb;
          float fres = 0.22 + 0.78 * pow(1.0 - clamp(dot(normalize(vViewPosition), -normal) * -1.0 + 0.0, 0.0, 1.0), 3.0);
          fres = clamp(0.12 + 0.6 * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0), 0.0, 1.0);
          // 低飽和的青綠河水，倒影偏淡
          outgoingLight = mix(outgoingLight, refl * vec3(0.78, 0.86, 0.82), fres * 0.62);
          outgoingLight += vec3(0.85, 0.88, 0.82) * foam * 0.35;
          #include <opaque_fragment>`);
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1200).rotateX(-Math.PI / 2), m);
    this.mesh.position.set(0, 0, -60);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.enabled = true;
  }
  setBoats(list) {
    const arr = this.uniforms.uBoats.value;
    for (let i = 0; i < arr.length; i++) {
      const b = list[i];
      if (b) arr[i].set(b.x, b.z, b.heading, b.speed); else arr[i].set(0, 0, 0, 0);
    }
  }
  /** 從水面下對稱的位置拍一張倒影（與船、橋同一幀更新） */
  render(camera) {
    if (!this.enabled) return;
    const cam = camera;
    const mc = this.mirror;
    mc.copy(cam);
    const p = cam.position;
    mc.position.set(p.x, -p.y, p.z);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const target = p.clone().add(dir);
    target.y = -target.y;
    mc.up.set(0, -1, 0).applyQuaternion(new THREE.Quaternion()).set(0, 1, 0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    mc.up.set(up.x, -up.y, up.z);
    mc.lookAt(target);
    mc.far = cam.far;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    // 投影到貼圖座標
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    // 斜裁切面：只拍水面以上的東西
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05);
    plane.applyMatrix4(mc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = mc.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0; pm.elements[14] = cp.w;
    this.mesh.visible = false;
    const r = this.renderer;
    const old = r.getRenderTarget(), oldShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, mc);
    r.setRenderTarget(old);
    r.shadowMap.autoUpdate = oldShadow;
    this.mesh.visible = true;
  }
  resize(w, h, quality = 1) { this.rt.setSize(Math.max(256, w * 0.5 * quality) | 0, Math.max(256, h * 0.5 * quality) | 0); }
}
