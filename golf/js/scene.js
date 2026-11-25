// 擬真場景：地形（多種草、沙、割草條紋、果嶺格線）、水、物理天空＋雲、樹、近景草叢、旗、球、軌跡、雨
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as TX from "./textures.js";
import { SURF, blobDist, TREE_SPECS, fbm, rng, YD } from "./course.js";
import { BALL, CUP_R, PIN_H } from "./physics.js";

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------------- 共用 GLSL ---------------- */
const BLOB_GLSL = `
float blobD(vec2 p, vec4 a, vec4 b, float p2){
  vec2 d = p - a.xy; float c = cos(a.z), s = sin(a.z);
  vec2 l = vec2((d.x*c + d.y*s)/a.w, (-d.x*s + d.y*c)/b.x);
  float r = length(l), th = atan(l.y, l.x);
  return r / (1.0 + b.y*sin(2.0*th + b.z) + b.w*sin(3.0*th + p2));
}`;
const blobU = (b) => [new THREE.Vector4(b.x, b.z, b.rot, b.rx), new THREE.Vector4(b.rz, b.a1, b.p1, b.a2), b.p2];
const WIND = { value: new THREE.Vector2(0, 0) }, TIME = { value: 0 };

export class World {
  constructor(renderer, quality = "high") {
    this.renderer = renderer; this.q = quality;
    this.scene = new THREE.Scene();
    this.hi = quality === "high";
    const N = this.hi ? 1024 : 512;
    // 材質
    this.tx = {
      fair: TX.grass({ n: N, seed: 3, base: [72, 124, 50], vary: 0.1, blades: this.hi ? 60000 : 16000, len: [4, 8], w: 1.1, dry: 0.03 }),
      green: TX.grass({ n: N, seed: 7, base: [70, 128, 56], vary: 0.06, blades: this.hi ? 90000 : 22000, len: [2, 4], w: 0.9, dry: 0.01 }),
      rough: TX.grass({ n: N, seed: 11, base: [62, 98, 40], vary: 0.2, blades: this.hi ? 50000 : 14000, len: [8, 18], w: 1.4, dry: 0.12, clover: 220 }),
      sand: TX.sand(N),
      macro: TX.macro(512),
      water: TX.waterNormal(512),
      bark: TX.bark(256),
      leaves: [TX.foliage(0), TX.foliage(1), TX.foliage(2)],
      tuft: TX.tuft(256),
      dimples: TX.dimples(256),
    };
    this.buildLights();
    this.buildSky();
    this.buildBall();
    this.buildTrail();
    this.buildPreview();
    this.buildRain();
    this.buildTufts();
    this.holeGroup = null;
  }

  /* ---------- 光、天空、雲 ---------- */
  buildLights() {
    const s = this.scene;
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    const ms = this.hi ? 4096 : 2048;
    this.sun.shadow.mapSize.set(ms, ms);
    const c = this.sun.shadow.camera; c.left = -95; c.right = 95; c.top = 95; c.bottom = -95; c.near = 1; c.far = 900;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.05;
    s.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4d5a32, 0.35);
    s.add(this.hemi);
    this.sunDir = new THREE.Vector3(0.4, 0.6, 0.5).normalize();
  }
  buildSky() {
    this.skyScene = new THREE.Scene();
    const sky = new Sky(); sky.scale.setScalar(4000); this.skyScene.add(sky); this.sky = sky;
    // 雲層：上半球的殼，用碎形雜訊畫雲
    const cg = new THREE.SphereGeometry(1800, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.cloudU = { uSun: { value: new THREE.Vector3() }, uCover: { value: 0.45 }, uDark: { value: 0 }, uSeed: { value: 0 } };
    const cm = new THREE.ShaderMaterial({
      uniforms: this.cloudU, side: THREE.BackSide, transparent: true, depthWrite: false,
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec3 vD; uniform vec3 uSun; uniform float uCover, uDark, uSeed;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int k=0;k<6;k++){ s += a*n(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
        void main(){
          if (vD.y < 0.01) discard;
          vec2 p = vD.xz / (vD.y + 0.12) * 2.2 + uSeed;
          float d = fbm(p), d2 = fbm(p * 2.7 + 5.0);
          float c = smoothstep(1.0 - uCover - 0.05, 1.0 - uCover + 0.32, d * 0.75 + d2 * 0.25);
          float toward = max(dot(normalize(vD), normalize(uSun)), 0.0);
          float shade = fbm(p + normalize(uSun.xz) * 0.25);
          vec3 lit = mix(vec3(1.0, 0.98, 0.95), vec3(1.0, 0.92, 0.82), pow(toward, 4.0));
          vec3 col = mix(lit, vec3(0.58, 0.62, 0.68), clamp((d - shade) * 2.2 + 0.25, 0.0, 1.0) * 0.8);
          col = mix(col, vec3(0.42, 0.44, 0.47), uDark);
          float a = c * smoothstep(0.01, 0.22, vD.y) * (0.92);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.clouds = new THREE.Mesh(cg, cm); this.skyScene.add(this.clouds);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(this.hi ? 1024 : 512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(1, 5000, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }
  /** 天氣：sky 物理參數、太陽、雲量、霧、雨 */
  setWeather(w) {
    this.weather = w;
    const elev = THREE.MathUtils.degToRad(w.sunElev), az = THREE.MathUtils.degToRad(w.sunAz);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = w.overcast ? 12 : w.fog ? 9 : 2.6;
    u.rayleigh.value = w.overcast ? 0.6 : w.sunElev < 12 ? 2.8 : 2.2;
    u.mieCoefficient.value = w.overcast ? 0.02 : 0.003;
    u.mieDirectionalG.value = 0.8;
    this.cloudU.uSun.value.copy(this.sunDir);
    this.cloudU.uCover.value = w.overcast ? 0.92 : w.cloud;
    this.cloudU.uDark.value = w.rain ? 0.65 : w.overcast ? 0.35 : 0;
    this.cloudU.uSeed.value = (w.seed % 100) * 0.37;
    // 重新烤背景天空與環境光
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.update(this.renderer, this.skyScene);
    this.scene.background = this.cubeRT.texture;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = w.overcast ? 0.8 : 0.65;
    this.scene.backgroundIntensity = 1;
    const warm = THREE.MathUtils.clamp((25 - w.sunElev) / 20, 0, 1);
    this.sun.color.setRGB(1, 0.95 - warm * 0.18, 0.88 - warm * 0.35);
    this.sun.intensity = w.overcast ? 0.7 : 3.2 * Math.min(1, 0.35 + w.sunElev / 30);
    this.hemi.intensity = w.overcast ? 0.75 : 0.3;
    const fogCol = w.overcast ? new THREE.Color(0xa4abb2) : w.fog ? new THREE.Color(0xc5cdd3) : new THREE.Color(0xbfd2e4).lerp(new THREE.Color(0xf2c9a0), warm * 0.5);
    this.scene.fog = new THREE.Fog(fogCol, w.fog ? 60 : w.rain ? 250 : 500, w.fog ? 650 : w.rain ? 1800 : 4200);
    this.rain.visible = !!w.rain;
    this.wet = w.rain ? 1 : 0;
    if (this.terrainU) this.terrainU.uWet.value = this.wet;
  }

  /* ---------- 一洞 ---------- */
  loadHole(hole, onProgress = () => {}) {
    if (this.holeGroup) { this.scene.remove(this.holeGroup); this.holeGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const g = new THREE.Group(); this.holeGroup = g; this.hole = hole;
    onProgress(0.1, "整地、鋪草…");
    this.buildTerrain(hole, g);
    onProgress(0.55, "放水…");
    this.buildWater(hole, g);
    onProgress(0.65, "種樹…");
    this.buildTrees(hole, g);
    onProgress(0.85, "插旗、立標樁…");
    this.buildFlag(hole, g);
    this.buildMarkers(hole, g);
    this.scene.add(g);
    this.tuftCenter = null;
    onProgress(1, "完成");
  }
  terrainMaterial(hole) {
    const t = this.tx;
    const U = this.terrainU = {
      uSplat: { value: this.splat }, uBox: { value: new THREE.Vector4(hole.bbox.x0, hole.bbox.z0, hole.bbox.x1 - hole.bbox.x0, hole.bbox.z1 - hole.bbox.z0) },
      tFair: { value: t.fair.map }, tFairN: { value: t.fair.normal }, tGreen: { value: t.green.map }, tGreenN: { value: t.green.normal },
      tRough: { value: t.rough.map }, tRoughN: { value: t.rough.normal }, tSand: { value: t.sand.map }, tSandN: { value: t.sand.normal }, tMacro: { value: t.macro },
      uG0: { value: null }, uG1: { value: null }, uG2: { value: 0 }, uTee: { value: new THREE.Vector4(hole.tee.x, hole.tee.z, hole.tee.w, hole.tee.l) },
      uB0: { value: [] }, uB1: { value: [] }, uB2: { value: [] }, uNB: { value: 0 },
      uWet: { value: this.wet || 0 }, uTime: TIME, uGrid: { value: 0 }, uPin: { value: new THREE.Vector2(hole.pin.x, hole.pin.z) },
    };
    [U.uG0.value, U.uG1.value, U.uG2.value] = blobU(hole.green);
    const bs = hole.bunkers.slice(0, 8);
    for (let i = 0; i < 8; i++) { const b = bs[i] || hole.bunkers[0] || { x: 1e5, z: 1e5, rot: 0, rx: 1, rz: 1, a1: 0, p1: 0, a2: 0, p2: 0 }; const [a, bb, p2] = blobU(b); U.uB0.value.push(a); U.uB1.value.push(bb); U.uB2.value.push(p2); }
    U.uNB.value = bs.length;
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "varying vec3 vWP; varying vec3 vWN;\n" + sh.vertexShader
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;")
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = `varying vec3 vWP; varying vec3 vWN;
        uniform sampler2D uSplat, tFair, tFairN, tGreen, tGreenN, tRough, tRoughN, tSand, tSandN, tMacro;
        uniform vec4 uBox, uG0, uG1, uTee; uniform float uG2, uWet, uTime, uGrid; uniform vec2 uPin;
        uniform vec4 uB0[8], uB1[8]; uniform float uB2[8]; uniform int uNB;
        ${BLOB_GLSL}
        float wFair, wGreen, wSand, wDeep, wFringe, wTee;
        ` + sh.fragmentShader
        .replace("#include <map_fragment>", `
          vec2 xz = vWP.xz;
          vec4 sp = texture2D(uSplat, (xz - uBox.xy) / uBox.zw);
          float mac = texture2D(tMacro, xz / 190.0).r, mac2 = texture2D(tMacro, xz / 41.0).r, en = texture2D(tMacro, xz / 7.0).r - 0.5;
          wFair = smoothstep(0.38, 0.62, sp.r + en * 0.22);
          float beyond = sp.g * 40.0;
          float collar = sp.a * (1.0 - wFair) * (1.0 - smoothstep(1.7, 2.7, beyond + en * 1.4));
          wDeep = smoothstep(11.0, 19.0, beyond + en * 5.0);
          float gd = blobD(xz, uG0, uG1, uG2);
          wGreen = 1.0 - smoothstep(0.988, 1.0, gd);
          wFringe = (1.0 - smoothstep(1.165, 1.185, gd)) * (1.0 - wGreen);
          vec2 tp = abs(xz - uTee.xy) - uTee.zw * 0.5; wTee = 1.0 - smoothstep(-0.15, 0.15, max(tp.x, tp.y));
          wSand = 0.0;
          for (int i = 0; i < 8; i++) { if (i >= uNB) break; float d = blobD(xz, uB0[i], uB1[i], uB2[i]); wSand = max(wSand, 1.0 - smoothstep(0.975, 1.0, d + en * 0.025)); }
          vec3 cR = texture2D(tRough, xz / 4.5).rgb * 0.55 + texture2D(tRough, xz / 15.0).rgb * 0.45;
          cR = mix(cR, cR * vec3(0.78, 0.8, 0.66), wDeep);
          cR = mix(cR, cR * vec3(1.12, 1.05, 0.82), wDeep * smoothstep(0.45, 0.75, mac) * 0.8);
          float lat = sp.b * 160.0 - 80.0;
          float stripe = smoothstep(0.42, 0.58, abs(fract(lat / 18.0) * 2.0 - 1.0));
          vec3 cF = texture2D(tFair, xz / 3.2).rgb * mix(0.86, 1.1, stripe);
          vec3 cC = texture2D(tFair, xz / 2.6).rgb * vec3(0.93, 0.96, 0.9);
          vec3 cG = texture2D(tGreen, xz / 2.2).rgb;
          float c1 = smoothstep(0.45, 0.55, abs(fract((xz.x + xz.y) / 7.0) * 2.0 - 1.0)), c2 = smoothstep(0.45, 0.55, abs(fract((xz.x - xz.y) / 7.0) * 2.0 - 1.0));
          cG *= 0.93 + 0.06 * c1 + 0.04 * c2;
          float ts = smoothstep(0.45, 0.55, abs(fract(xz.x / 3.0) * 2.0 - 1.0));
          vec3 cT = texture2D(tFair, xz / 2.5).rgb * mix(0.9, 1.08, ts);
          vec3 cS = texture2D(tSand, xz / 2.4).rgb * (0.96 + 0.08 * mac2);
          vec3 col = cR;
          col = mix(col, cC, collar); col = mix(col, cF, wFair); col = mix(col, cT, wTee); col = mix(col, cC, wFringe); col = mix(col, cG, wGreen);
          float grassMix = 1.0 - wSand;
          col *= mix(1.0, 0.84 + 0.3 * mac, grassMix * (1.0 - wGreen * 0.75));
          col *= 0.95 + 0.1 * mac2;
          col = mix(col, cS, wSand);
          col *= mix(1.0, mix(0.8, 0.72, wSand), uWet);
          // 洞：黑色的洞口＋白色杯緣
          float dp = length(xz - uPin);
          col = mix(col, vec3(0.92), 1.0 - smoothstep(${CUP_R.toFixed(4)}, ${(CUP_R + 0.008).toFixed(4)}, dp));
          col = mix(col, vec3(0.02), 1.0 - smoothstep(${(CUP_R - 0.006).toFixed(4)}, ${CUP_R.toFixed(4)}, dp));
          // 推桿格線：1 m 格子＋沿下坡方向流動的光點
          if (uGrid > 0.5 && wGreen + wFringe > 0.01) {
            vec2 f = fract(xz); vec2 dl = min(f, 1.0 - f); vec2 fw = fwidth(xz) * 1.2;
            float line = 1.0 - smoothstep(0.0, max(fw.x, 0.02), dl.x) * smoothstep(0.0, max(fw.y, 0.02), dl.y);
            vec2 down = vWN.xz; float slope = length(down);
            vec2 dir = slope > 1e-4 ? down / slope : vec2(0.0);
            vec2 loc = f - 0.5;
            float ph = fract(uTime * (0.25 + min(slope * 30.0, 1.6)));
            float dd = length(loc - dir * (ph - 0.5) * 0.9);
            float dotv = 1.0 - smoothstep(0.022, 0.036, dd);
            vec3 gc = mix(vec3(0.85, 0.95, 1.0), vec3(1.0, 0.55, 0.35), smoothstep(0.012, 0.045, slope));
            float k = (wGreen + wFringe * 0.6);
            col = mix(col, gc, (line * 0.32 + dotv * 0.85) * k);
          }
          diffuseColor.rgb = col;`)
        .replace("#include <roughnessmap_fragment>", `float roughnessFactor = mix(mix(0.94, 0.86, wGreen), 0.97, wSand) - uWet * 0.28 * (1.0 - wSand);`)
        .replace("#include <normal_fragment_maps>", `
          vec2 nR = texture2D(tRoughN, xz / 4.5).xy * 2.0 - 1.0, nF = texture2D(tFairN, xz / 3.2).xy * 2.0 - 1.0, nG = texture2D(tGreenN, xz / 2.2).xy * 2.0 - 1.0, nS = texture2D(tSandN, xz / 2.4).xy * 2.0 - 1.0;
          vec2 nd = nR * 0.9;
          nd = mix(nd, nF * 0.45, max(wFair, wTee)); nd = mix(nd, nG * 0.22, wGreen); nd = mix(nd, nS * 0.7, wSand);
          vec3 nW = normalize(vWN + vec3(nd.x, 0.0, nd.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
    };
    return m;
  }
  buildTerrain(hole, g) {
    const bb = hole.bbox, gr = hole.green;
    // 不均勻網格：果嶺、發球台附近比較密（推桿要精準）
    const step = this.hi ? 2.2 : 3.5;
    const axis = (a0, a1, fine) => {
      const v = []; for (let a = a0; a <= a1; a += step) v.push(a);
      for (const [c0, c1, st] of fine) for (let a = c0; a <= c1; a += st) v.push(a);
      v.sort((p, q) => p - q);
      const out = [v[0]]; for (const a of v) if (a - out[out.length - 1] > st0(a, fine)) out.push(a);
      return out;
      function st0(a, fine) { for (const [c0, c1, st] of fine) if (a >= c0 && a <= c1) return st * 0.6; return step * 0.6; }
    };
    const gR = Math.max(gr.rx, gr.rz) * 1.6 + 6, gs = this.hi ? 0.55 : 0.9;
    const xs = axis(bb.x0, bb.x1, [[gr.x - gR, gr.x + gR, gs], [-8, 8, 1]]);
    const zs = axis(bb.z0, bb.z1, [[gr.z - gR, gr.z + gR, gs], [-8, 16, 1]]);
    const W = xs.length, H = zs.length;
    const pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = xs[i], z = zs[j]; pos[k * 3] = x; pos[k * 3 + 1] = hole.height(x, z); pos[k * 3 + 2] = z; uv[k * 2] = x; uv[k * 2 + 1] = z; }
    const idx = new Uint32Array((W - 1) * (H - 1) * 6); let n = 0;
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    // 地面種類貼圖（1 m 一格）：R 球道、G 離球道多遠、B 側向距離（割草條紋）、A 有沒有球道邊
    const sw = Math.ceil(bb.x1 - bb.x0), shh = Math.ceil(bb.z1 - bb.z0), data = new Uint8Array(sw * shh * 4);
    for (let j = 0; j < shh; j++) for (let i = 0; i < sw; i++) {
      const x = bb.x0 + i + 0.5, z = bb.z0 + j + 0.5, nn = hole.line.near(x, z), fw = hole.fwHalf(nn.s), ad = Math.abs(nn.d);
      const fair = fw > 0 ? 1 - smooth(fw - 0.7, fw + 0.7, ad) : 0;
      let beyond = ad - Math.max(fw, fw > 0 ? fw : 14);
      if (nn.s > hole.len + 25 || ad > hole.obDist(nn.s)) beyond = Math.max(beyond, 30);
      const k = (j * sw + i) * 4;
      data[k] = fair * 255; data[k + 1] = Math.max(0, Math.min(1, beyond / 40)) * 255; data[k + 2] = Math.max(0, Math.min(1, nn.d / 160 + 0.5)) * 255; data[k + 3] = fw > 0 ? 255 : 0;
    }
    if (this.splat) this.splat.dispose();
    this.splat = new THREE.DataTexture(data, sw, shh, THREE.RGBAFormat); this.splat.magFilter = this.splat.minFilter = THREE.LinearFilter; this.splat.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, this.terrainMaterial(hole)); mesh.receiveShadow = true; g.add(mesh); this.terrain = mesh;
    // 遠方地面與山：一大片粗網格，球場範圍內不畫（discard）
    const R = 4200, fs = 70, fx = [], fz = [];
    for (let a = -R; a <= R; a += fs) { fx.push(a + (bb.x0 + bb.x1) / 2); fz.push(a + (bb.z0 + bb.z1) / 2); }
    const fW = fx.length, fH = fz.length, fpos = new Float32Array(fW * fH * 3);
    const cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    for (let j = 0; j < fH; j++) for (let i = 0; i < fW; i++) {
      const x = fx[i], z = fz[j], k = (j * fW + i) * 3;
      const dIn = Math.max(bb.x0 - x, x - bb.x1, bb.z0 - z, z - bb.z1);
      const dc = Math.hypot(x - cx, z - cz);
      let h = hole.baseY + 6 + fbm(x * 0.0022, z * 0.0022, 4, 77) * 40 + smooth(900, 3600, dc) * (90 + fbm(x * 0.001, z * 0.001, 3, 31) * 160);
      if (dIn < 120) h = hole.height(Math.max(bb.x0, Math.min(bb.x1, x)), Math.max(bb.z0, Math.min(bb.z1, z))) * (1 - smooth(0, 120, dIn)) + h * smooth(0, 120, dIn) - 0.6;
      fpos[k] = x; fpos[k + 1] = h; fpos[k + 2] = z;
    }
    const fidx = []; for (let j = 0; j < fH - 1; j++) for (let i = 0; i < fW - 1; i++) { const a = j * fW + i; fidx.push(a, a + fW, a + 1, a + 1, a + fW, a + fW + 1); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fpos, 3)); fg.setIndex(fidx); fg.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0x5f7a3e });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uBox = { value: new THREE.Vector4(bb.x0 + 1, bb.z0 + 1, bb.x1 - 1, bb.z1 - 1) }; sh.uniforms.tRough = { value: this.tx.rough.map }; sh.uniforms.tMacro = { value: this.tx.macro };
      sh.vertexShader = "varying vec3 vWP2;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vWP2; uniform vec4 uBox; uniform sampler2D tRough, tMacro;\n" + sh.fragmentShader
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n if (vWP2.x > uBox.x && vWP2.x < uBox.z && vWP2.z > uBox.y && vWP2.z < uBox.w) discard;")
        .replace("#include <map_fragment>", "vec3 c0 = texture2D(tRough, vWP2.xz / 15.0).rgb; float m0 = texture2D(tMacro, vWP2.xz / 400.0).r; diffuseColor.rgb = c0 * (0.65 + 0.5 * m0) * vec3(0.92, 0.95, 0.85); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.38, 0.26), smoothstep(40.0, 160.0, vWP2.y - " + (hole.baseY + 10).toFixed(1) + "));");
    };
    const far = new THREE.Mesh(fg, fm); far.receiveShadow = false; g.add(far);
  }
  buildWater(hole, g) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1e3c42, roughness: 0.05, metalness: 0.0, normalMap: this.tx.water, normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 1.3 });
    this.waterMat = mat;
    for (const w of hole.waters) {
      const lvl = hole.waterLevel(w), pts = [];
      for (let k = 0; k < 96; k++) {
        const th = (k / 96) * Math.PI * 2, rr = 1.06 * (1 + w.a1 * Math.sin(2 * th + w.p1) + w.a2 * Math.sin(3 * th + w.p2));
        const lx = Math.cos(th) * rr * w.rx, lz = Math.sin(th) * rr * w.rz, c = Math.cos(w.rot), s = Math.sin(w.rot);
        pts.push(new THREE.Vector2(w.x + lx * c - lz * s, -(w.z + lx * s + lz * c)));
      }
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts), 1); geo.rotateX(-Math.PI / 2); geo.translate(0, lvl, 0);
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
    }
    for (const c of hole.creeks) {
      const lvl = hole.creekLevel(c), P = c.line.p, pos = [], idx = [];
      for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1, nx = -tz / L, nz = tx / L; for (const s of [-1, 1]) pos.push(P[i][0] + nx * s * c.w * 1.6, lvl, P[i][1] + nz * s * c.w * 1.6); if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
    }
  }

  /* ---------- 樹 ---------- */
  treeGeometry(kind) {
    if (!this._treeGeo) this._treeGeo = [];
    if (this._treeGeo[kind]) return this._treeGeo[kind];
    const sp = TREE_SPECS[kind], r = rng(kind * 91 + 5);
    const trunkParts = [], cards = [];
    const tr = new THREE.CylinderGeometry(sp.trunk * 0.45, sp.trunk, sp.h * (kind === 1 ? 0.62 : 0.85), 9, 4); tr.translate(0, sp.h * (kind === 1 ? 0.31 : 0.425), 0);
    trunkParts.push(tr);
    if (kind === 1) for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28 + r(), L = sp.cr * 0.9; const b = new THREE.CylinderGeometry(sp.trunk * 0.18, sp.trunk * 0.35, L, 6); b.translate(0, L / 2, 0); b.rotateZ(0.9 + r() * 0.3); b.rotateY(a); b.translate(0, sp.h * 0.45, 0); trunkParts.push(b); }
    const card = (cx, cy, cz, s, rx, ry, rz) => { const p = new THREE.PlaneGeometry(s, s); p.rotateX(rx); p.rotateY(ry); p.rotateZ(rz); p.translate(cx, cy, cz); cards.push(p); };
    if (kind === 0) {
      // 松：一層層往下垂的枝葉
      for (let l = 0; l < 16; l++) { const t = l / 15, y = sp.h * (0.26 + t * 0.72), rad = sp.cr * Math.pow(1 - t, 0.8) + 0.6; for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.28 + l * 0.7; card(Math.cos(a) * rad * 0.5, y, Math.sin(a) * rad * 0.5, rad * 1.35 + 1.0, -Math.PI / 2 + 0.4, -a + Math.PI / 2, 0); card(Math.cos(a) * rad * 0.35, y + 0.4, Math.sin(a) * rad * 0.35, rad * 1.1 + 0.8, 0, -a, 0); } card(0, y + 0.25, 0, rad * 1.9, -Math.PI / 2, l, 0); }
    } else if (kind === 1) {
      // 橡樹：圓圓的大樹冠，葉簇散在表面附近
      for (let k = 0; k < 190; k++) { const u = r() * 6.28, v = Math.acos(2 * r() - 1), rr = 0.35 + Math.pow(r(), 0.5) * 0.75; card(Math.sin(v) * Math.cos(u) * sp.cr * rr, sp.cy + Math.cos(v) * sp.cr * 0.72 * rr, Math.sin(v) * Math.sin(u) * sp.cr * rr, 3.2 + r() * 1.8, r() * 6.28, r() * 6.28, r() * 6.28); }
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, d = r() * sp.cr * 0.6; card(Math.cos(a) * d, sp.cy + sp.cr * 0.55 + r(), Math.sin(a) * d, sp.cr * 1.3, -Math.PI / 2, r() * 6, 0); }
    } else {
      // 柏：細長的柱狀
      for (let k = 0; k < 150; k++) { const t = r(), y = sp.h * (0.1 + t * 0.88), rad = sp.cr * (1 - Math.pow(t, 1.6)) * (0.3 + r() * 0.7), a = r() * 6.28; card(Math.cos(a) * rad, y, Math.sin(a) * rad, 2.0 + r() * 1.4, r() * 6.28, a, r()); }
    }
    // 樹葉的法線：從樹冠中心往外（光影柔和，像一團樹葉）
    const leaf = mergeGeometries(cards.map((c) => c.toNonIndexed()));
    const p = leaf.attributes.position, nrm = leaf.attributes.normal, c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { c.set(p.getX(i), kind === 1 ? (p.getY(i) - sp.cy) * 1.3 : (p.getY(i) - sp.h * 0.6) * 0.35, p.getZ(i)).normalize(); nrm.setXYZ(i, c.x, c.y + 0.25, c.z); }
    nrm.needsUpdate = true;
    const out = { trunk: mergeGeometries(trunkParts.map((t) => t.toNonIndexed())), leaf };
    this._treeGeo[kind] = out; return out;
  }
  buildTrees(hole, g) {
    const kinds = [[], [], []];
    for (const t of hole.trees) kinds[t.kind].push(t);
    // 外圍的森林（補滿地平線）
    const r = rng(hole.n * 3), bb = hole.bbox;
    for (let i = 0; i < (this.hi ? 1400 : 500); i++) { const x = bb.x0 - 80 + r() * (bb.x1 - bb.x0 + 160), z = bb.z0 - 80 + r() * (bb.z1 - bb.z0 + 160); const n = hole.line.near(x, z); if (Math.abs(n.d) < hole.obDist(n.s) + 25 && n.s < hole.len + 50 && n.s > -30) continue; const kind = r() < 0.5 ? 0 : r() < 0.5 ? 1 : 2, s = 0.9 + r() * 0.5, sp = TREE_SPECS[kind]; kinds[kind].push({ x, z, y: hole.height(x, z), kind, s, rot: r() * 6.28, far: true }); }
    const barkMat = new THREE.MeshStandardMaterial({ map: this.tx.bark, roughness: 0.95 });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    kinds.forEach((list, kind) => {
      if (!list.length) return;
      const geo = this.treeGeometry(kind);
      const leafMat = new THREE.MeshStandardMaterial({ map: this.tx.leaves[kind], alphaTest: 0.36, side: THREE.DoubleSide, roughness: 0.8 });
      leafMat.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = WIND; sh.uniforms.uTime = TIME;
        sh.vertexShader = "uniform vec2 uWind; uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sway = (transformed.y / 15.0);
          float gust = sin(uTime * 1.3 + ip.x * 0.07 + ip.z * 0.05) * 0.5 + 0.5;
          transformed.xz += (uWind * 0.025 * (0.6 + gust) + vec2(sin(uTime * 2.1 + ip.x), cos(uTime * 1.7 + ip.z)) * 0.04) * sway * sway * 6.0;`);
      };
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tx.leaves[kind], alphaTest: 0.36 });
      const trunks = new THREE.InstancedMesh(geo.trunk, barkMat, list.length), leaves = new THREE.InstancedMesh(geo.leaf, leafMat, list.length);
      leaves.customDepthMaterial = depth;
      list.forEach((t, i) => {
        e.set(0, t.rot, 0); q.setFromEuler(e); sc.setScalar(t.s); m4.compose(v.set(t.x, t.y - 0.3, t.z), q, sc);
        trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
        col.setHSL(0.24 + (r() - 0.5) * 0.05, 0.35 + r() * 0.2, 0.42 + r() * 0.16); leaves.setColorAt(i, col);
      });
      for (const im of [trunks, leaves]) { im.castShadow = true; im.receiveShadow = true; g.add(im); }
    });
  }

  /* ---------- 旗、標樁 ---------- */
  buildFlag(hole, g) {
    const y = hole.height(hole.pin.x, hole.pin.z);
    const grp = new THREE.Group(); grp.position.set(hole.pin.x, y, hole.pin.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, PIN_H, 10), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35 }));
    pole.position.y = PIN_H / 2; pole.castShadow = true; grp.add(pole);
    const fg = new THREE.PlaneGeometry(0.52, 0.36, 14, 6); fg.translate(0.26, PIN_H - 0.2, 0);
    const fm = new THREE.MeshStandardMaterial({ map: TX.flagTex(hole.n), side: THREE.DoubleSide, roughness: 0.8 });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = TIME; sh.uniforms.uWind = WIND;
      sh.vertexShader = "uniform float uTime; uniform vec2 uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        float ws = clamp(length(uWind) / 9.0, 0.15, 1.2), u = transformed.x / 0.52;
        transformed.z += sin(u * 7.0 - uTime * (4.0 + ws * 6.0)) * 0.05 * u * ws;
        transformed.y -= (1.0 - ws) * u * 0.18;`);
    };
    this.flag = new THREE.Mesh(fg, fm); this.flag.castShadow = true; grp.add(this.flag);
    this.flagGroup = grp; g.add(grp);
  }
  buildMarkers(hole, g) {
    const post = (x, z, color, h = 0.6, r = 0.035) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); m.position.set(x, hole.height(x, z) + h / 2, z); m.castShadow = true; g.add(m); };
    // 發球台標誌
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a5ad8, roughness: 0.3 })); m.position.set(s * 3.2, hole.height(s * 3.2, -1) + 0.1, -1); m.castShadow = true; g.add(m); }
    // 距果嶺 100/150/200 碼樁
    for (const [yd, col] of [[100, 0xd83a2a], [150, 0xf4f4f0], [200, 0x2a5ad8]]) { const s = hole.len - yd * YD; if (s < 30) continue; const p = hole.line.at(s); for (const sd of [-1, 1]) { const d = (hole.fwHalf(s) + 3) * sd; post(p.x - p.tz * d, p.z + p.tx * d, col, 0.7, 0.05); } }
    // 界外白樁
    for (let s = 0; s < hole.len + 40; s += 22) { const p = hole.line.at(Math.min(s, hole.len)), d = hole.obDist(s); for (const sd of [-1, 1]) post(p.x - p.tz * d * sd, p.z + p.tx * d * sd, 0xf2f2ee, 0.9, 0.04); }
    // 水域紅樁
    for (const w of hole.waters) for (let k = 0; k < 24; k++) { const th = (k / 24) * Math.PI * 2, rr = 1.12 * (1 + w.a1 * Math.sin(2 * th + w.p1) + w.a2 * Math.sin(3 * th + w.p2)), lx = Math.cos(th) * rr * w.rx, lz = Math.sin(th) * rr * w.rz, c = Math.cos(w.rot), s = Math.sin(w.rot); post(w.x + lx * c - lz * s, w.z + lx * s + lz * c, 0xd83a2a, 0.6); }
  }

  /* ---------- 球、軌跡、預測線 ---------- */
  buildBall() {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xfbfbf7, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12, normalMap: this.tx.dimples, normalScale: new THREE.Vector2(0.7, 0.7) });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 40, 28), m); this.ball.castShadow = true; this.scene.add(this.ball);
  }
  buildTrail() {
    const N = 600;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4));
    const idx = []; for (let i = 0; i < N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } geo.setIndex(idx);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.trail.frustumCulled = false; this.trail.renderOrder = 5; this.scene.add(this.trail); this.trailN = N;
    const geo2 = geo.clone();
    this.preview = new THREE.Mesh(geo2, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.preview.frustumCulled = false; this.preview.renderOrder = 6; this.scene.add(this.preview);
  }
  /** 把一串點畫成面向鏡頭的帶子；color(i,n) 回傳 [r,g,b,a]；寬度隨距離變（螢幕上大概一樣粗） */
  ribbon(mesh, pts, camera, color, width = 0.0022) {
    const pa = mesh.geometry.attributes.position, ca = mesh.geometry.attributes.color, N = this.trailN;
    const n = Math.min(N, pts.length);
    const cp = camera.position, t = new THREE.Vector3(), to = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, n - 1)] || { x: 0, y: -999, z: 0 };
      const q = pts[Math.min(i + 1, n - 1)] || p, o = pts[Math.max(i - 1, 0)] || p;
      t.set(q.x - o.x, q.y - o.y, q.z - o.z); to.set(cp.x - p.x, cp.y - p.y, cp.z - p.z);
      const dist = to.length(); side.crossVectors(t, to).normalize().multiplyScalar(Math.max(0.02, dist * width));
      if (!isFinite(side.x)) side.set(0, 0, 0);
      pa.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z); pa.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const c = i < n ? color(i, n) : [0, 0, 0, 0];
      ca.setXYZW(i * 2, ...c); ca.setXYZW(i * 2 + 1, ...c);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
    mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
  buildPreview() {
    const ring = (r, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 7; this.scene.add(m); return m; };
    this.landRing = ring(1.6, 0xffffff); this.restRing = ring(0.7, 0xffd84a);
    this.landRing.visible = this.restRing.visible = false;
  }
  placeRing(ring, p, scale = 1) {
    if (!p) { ring.visible = false; return; }
    ring.visible = true; ring.position.set(p.x, this.hole.height(p.x, p.z) + 0.05, p.z); ring.scale.setScalar(scale);
  }

  /* ---------- 雨、草叢 ---------- */
  buildRain() {
    const N = 5000, pos = new Float32Array(N * 6), r = rng(4);
    for (let i = 0; i < N; i++) { const x = (r() - 0.5) * 70, y = r() * 40, z = (r() - 0.5) * 70; pos.set([x, y, z, x, y - 0.6, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.32, fog: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain); this.rainSeed = r;
  }
  buildTufts() {
    const a = new THREE.PlaneGeometry(0.5, 0.42); a.translate(0, 0.21, 0);
    const b = a.clone().rotateY(Math.PI / 2), c = a.clone().rotateY(Math.PI / 4);
    const geo = mergeGeometries([a, b, c]);
    const m = new THREE.MeshStandardMaterial({ map: this.tx.tuft, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    m.onBeforeCompile = (sh) => { sh.uniforms.uWind = WIND; sh.uniforms.uTime = TIME; sh.vertexShader = "uniform vec2 uWind; uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz; float k = transformed.y / 0.42;
      transformed.xz += (uWind * 0.012 + vec2(sin(uTime * 2.3 + ip.x * 1.7), cos(uTime * 1.9 + ip.z * 1.3)) * 0.03) * k * k;`); };
    this.tufts = new THREE.InstancedMesh(geo, m, this.hi ? 3500 : 1200);
    this.tufts.count = 0; this.tufts.frustumCulled = false; this.tufts.receiveShadow = true; this.scene.add(this.tufts);
  }
  placeTufts(cx, cz) {
    const hole = this.hole, r = rng((cx * 13 + cz * 7) | 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0; const max = this.tufts.instanceMatrix.count, R = 34;
    for (let k = 0; k < max * 3 && n < max; k++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const su = hole.surface(x, z);
      if (!(su === SURF.ROUGH || su === SURF.DEEP || su === SURF.OB) || (su === SURF.ROUGH && r() < 0.75)) continue;
      e.set(0, r() * 6.28, 0); q.setFromEuler(e); const sc = (su === SURF.DEEP ? 0.85 : 0.55) * (0.7 + r() * 0.5); s.set(sc, sc * (0.8 + r() * 0.5), sc);
      this.tufts.setMatrixAt(n++, m4.compose(v.set(x, hole.height(x, z) - 0.02, z), q, s));
    }
    this.tufts.count = n; this.tufts.instanceMatrix.needsUpdate = true;
  }

  /* ---------- 每一幀 ---------- */
  update(dt, t, camera, focus, wind) {
    TIME.value = t; WIND.value.set(wind.x, wind.z);
    if (this.waterMat) { this.waterMat.normalMap.offset.set(t * 0.012 + wind.x * t * 0.0006, t * 0.008 + wind.z * t * 0.0006); }
    // 陰影跟著焦點走（貼齊陰影格子，避免閃爍）
    const fx = focus.x, fz = focus.z, fy = focus.y;
    const tex = 190 / this.sun.shadow.mapSize.x;
    const sx = Math.round(fx / tex) * tex, sz = Math.round(fz / tex) * tex;
    this.sun.target.position.set(sx, fy, sz);
    this.sun.position.set(sx, fy, sz).addScaledVector(this.sunDir, 400);
    // 雨跟著鏡頭
    if (this.rain.visible) { const p = this.rain.geometry.attributes.position, a = p.array; for (let i = 0; i < a.length; i += 6) { a[i + 1] -= dt * 22; a[i + 4] -= dt * 22; a[i] += wind.x * dt * 0.4; a[i + 3] += wind.x * dt * 0.4; if (a[i + 1] < -2) { a[i + 1] = 38; a[i + 4] = 37.4; } } p.needsUpdate = true; this.rain.position.set(camera.position.x, camera.position.y - 8, camera.position.z); }
    // 近景草叢：鏡頭低的時候才放
    const low = camera.position.y - this.hole.height(camera.position.x, camera.position.z) < 18;
    this.tufts.visible = low;
    if (low && (!this.tuftCenter || Math.hypot(this.tuftCenter.x - focus.x, this.tuftCenter.z - focus.z) > 9)) { this.tuftCenter = { x: focus.x, z: focus.z }; this.placeTufts(focus.x, focus.z); }
  }
  setGrid(on) { if (this.terrainU) this.terrainU.uGrid.value = on ? 1 : 0; }
  setPin(p) { if (this.terrainU) this.terrainU.uPin.value.set(p.x, p.z); }
}
