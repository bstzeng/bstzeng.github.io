// 浮島工房 — 3D 畫面、操作、介面、音效（遊戲規則都在 logic.js）
import * as THREE from "three";
import { HR, APO, RES, RES_ORDER, NODES, PLOTS, UPGRADES, RECIPES, PLAYER, BOSS, ISLANDS } from "./data.js";
import { createGame, serialize, update, upgrade, enqueue, nearPlot, bagCap, bagTotal, have, canAfford, islandAt } from "./logic.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "island.save.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...serialize(G), played })); } catch {} };
const prefs = (() => { try { return JSON.parse(localStorage.getItem("island.prefs")) || { sound: true }; } catch { return { sound: true }; } })();
const saved = load();
let G = createGame(saved);
let played = saved?.played || 0;
const isSmall = Math.min(innerWidth, innerHeight) < 700;

/* ================= 渲染器 ================= */
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec8e3);
scene.fog = new THREE.Fog(0x7ec8e3, 28, 70);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xdff4ff, 0x3a6a3a, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...o });
const M = {
  grass: mat(0x6cc04a), grass2: mat(0x4fa83d), dirt: mat(0x8a5a33), rock: mat(0x7b8088), rockDark: mat(0x5a5f68),
  trunk: mat(0x7a4b28), leaf: mat(0x3f9b3a), leaf2: mat(0x2f7f35), leafRound: mat(0x58b84a), stone: mat(0x9aa0a8),
  copper: mat(0xe0803a, { emissive: 0x6a2a00, emissiveIntensity: 0.3 }), emerald: mat(0x2ee88a, { emissive: 0x0a7a40, emissiveIntensity: 0.5, roughness: 0.3 }),
  wood: mat(0xb07a45), woodDark: mat(0x7a4b28), roof: mat(0xd2563a), white: mat(0xfff8e8), metal: mat(0x8090a0, { metalness: 0.5, roughness: 0.4 }),
  skin: mat(0xffd2a6), shirt: mat(0xff8a3d), pants: mat(0x3a5a9a), hair: mat(0x4a2a18), dark: mat(0x1a1a22),
  robot: mat(0x40c8c0), slime: new THREE.MeshStandardMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.85, roughness: 0.2 }),
  boss: mat(0x6f766a), moss: mat(0x4a8a3a), eye: new THREE.MeshBasicMaterial({ color: 0x9dff6a }),
  ghost: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }),
};
const islandTheme = { home: 0x6cc04a, pine: 0x4fa83d, gravel: 0x9aa46a, copper: 0xb7a35a, works: 0x7cc45a, oldwood: 0x3f8a3a, emerald: 0x5ac0a0, swamp: 0x6a8a4a, boss: 0x7a7f74 };

/* ================= 海 ================= */
const waterUniforms = { uTime: { value: 0 } };
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 120, 120), new THREE.MeshStandardMaterial({ color: 0x2aa3d8, flatShading: true, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 }));
water.material.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = waterUniforms.uTime;
  sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.z += sin(position.x * 0.45 + uTime * 1.2) * 0.12 + cos(position.y * 0.38 + uTime * 0.9) * 0.1;");
};
water.rotation.x = -Math.PI / 2; water.position.y = -0.55; water.receiveShadow = true;
scene.add(water);

/* ================= 島 ================= */
const islandMeshes = new Map();
function hexGeo(rTop, rBot, h) { const g = new THREE.CylinderGeometry(rTop, rBot, h, 6); g.rotateY(0); return g; }
function buildIsland(isl) {
  const g = new THREE.Group(); g.position.set(isl.cx, 0, isl.cz);
  const top = new THREE.Mesh(hexGeo(HR - 0.02, HR - 0.02, 0.36), mat(islandTheme[isl.id] || 0x6cc04a)); top.position.y = -0.18; top.receiveShadow = true; g.add(top);
  const dirt = new THREE.Mesh(hexGeo(HR * 0.985, HR * 0.86, 1.0), M.dirt); dirt.position.y = -0.86; g.add(dirt);
  const base = new THREE.Mesh(hexGeo(HR * 0.86, HR * 0.3, 2.6), isl.id === "boss" ? M.rockDark : M.rock); base.position.y = -2.66; g.add(base);
  // 草叢與小花
  const R = mulberry(isl.idx * 31 + 5);
  const tuft = new THREE.ConeGeometry(0.08, 0.28, 4);
  const tufts = new THREE.InstancedMesh(tuft, M.grass2, 26);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) { const a = R() * 6.28, r = R() * (APO - 0.4); m4.makeTranslation(Math.cos(a) * r, 0.1, Math.sin(a) * r); tufts.setMatrixAt(i, m4); }
  g.add(tufts);
  if (isl.id === "boss") for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4 + R(), 5), M.rockDark); const a = i * 1.05 + 0.4; sp.position.set(Math.cos(a) * (APO - 0.7), 0.6, Math.sin(a) * (APO - 0.7)); sp.castShadow = true; g.add(sp); }
  if (isl.id === "swamp") for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.6 + R() * 0.4, 7), mat(0x3a5a2a)); p.rotation.x = -Math.PI / 2; const a = R() * 6.28, r = 1 + R() * 2.5; p.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r); g.add(p); }
  // 浪花
  const foam = new THREE.Mesh(new THREE.RingGeometry(HR * 0.99, HR * 1.12, 6, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.rotation.z = Math.PI / 2; foam.position.y = -0.5; g.add(foam);
  g.userData.foam = foam;
  scene.add(g);
  islandMeshes.set(isl.id, { g, rise: 0 });
}
// 尚未開通的島：海面下的淡淡影子
const ghosts = new Map();
function buildGhost(isl) {
  const m = new THREE.Mesh(hexGeo(HR - 0.05, HR - 0.05, 0.1), M.ghost);
  m.position.set(isl.cx, -0.62, isl.cz); scene.add(m); ghosts.set(isl.id, m);
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ================= 資源節點 ================= */
const nodeMeshes = new Map();
function makeNode(n) {
  const g = new THREE.Group(); g.position.set(n.x, 0, n.z);
  const R = mulberry(n.id * 97 + 3);
  const live = new THREE.Group(); g.add(live);
  if (n.type === "tree" || n.type === "bigtree") {
    const big = n.type === "bigtree", s = big ? 1.5 : 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 0.9 * s, 6), M.trunk); trunk.position.y = 0.45 * s; trunk.castShadow = true; live.add(trunk);
    if (big || ["home", "works", "swamp"].includes(n.island)) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 * s, 0), M.leafRound); c.position.y = 1.25 * s; c.castShadow = true; live.add(c);
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), M.leaf); c2.position.set(0.3 * s, 1.55 * s, 0.1); c2.castShadow = true; live.add(c2);
    } else {
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.62 - k * 0.15, 0.7, 7), k % 2 ? M.leaf2 : M.leaf); c.position.y = 0.9 + k * 0.38; c.castShadow = true; live.add(c); }
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.19 * s, 0.22, 6), M.trunk); stump.position.y = 0.11; g.add(stump);
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), n.type === "rock" ? M.stone : M.rock);
    rock.scale.set(1, 0.75, 0.9); rock.position.y = 0.3; rock.rotation.y = R() * 6; rock.castShadow = true; live.add(rock);
    if (n.type === "copper" || n.type === "emerald") {
      for (let k = 0; k < 5; k++) {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(n.type === "emerald" ? 0.2 : 0.14, 0), n.type === "emerald" ? M.emerald : M.copper);
        const a = k * 1.3 + R(); cr.position.set(Math.cos(a) * 0.36, 0.4 + R() * 0.3, Math.sin(a) * 0.36); cr.scale.y = 1.6; cr.rotation.z = (R() - 0.5); live.add(cr);
      }
    }
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), M.rock); rubble.position.y = 0.08; g.add(rubble);
  }
  live.rotation.y = R() * 6.28;
  scene.add(g);
  nodeMeshes.set(n, { g, live, grow: n.alive ? 1 : 0 });
}

/* ================= 建築 / 建造牌 ================= */
function labelSprite(w = 256, h = 128) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  sp.userData = { c, tex, key: "" };
  return sp;
}
function drawLabel(sp, title, lines) {
  const key = title + lines.join("|");
  if (sp.userData.key === key) return;
  sp.userData.key = key;
  const { c, tex } = sp.userData, g = c.getContext("2d");
  const fs = 30, lh = 36;
  c.height = 56 + lines.length * lh; c.width = 300;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(255,248,232,0.95)"; roundRect(g, 4, 4, c.width - 8, c.height - 8, 18); g.fill();
  g.lineWidth = 5; g.strokeStyle = "#8a5a33"; g.stroke();
  g.fillStyle = "#8a5a33"; g.font = `900 ${fs}px "Noto Sans TC", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(title, c.width / 2, 32);
  g.font = `700 ${fs - 4}px "JetBrains Mono", "Noto Sans TC", sans-serif`;
  lines.forEach((l, i) => { g.fillStyle = l.ok ? "#2e8b2e" : "#203040"; g.fillText(l.text, c.width / 2, 56 + 14 + i * lh); });
  tex.needsUpdate = true;
  const s = 0.0052;
  sp.scale.set(c.width * s, c.height * s, 1);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function costLines(cost, paid) { return Object.entries(cost).map(([k, n]) => ({ text: `${RES[k].icon} ${paid[k] || 0}/${n}`, ok: (paid[k] || 0) >= n })); }

const plotMeshes = new Map();
function buildPlot(pl) {
  const old = plotMeshes.get(pl.id); if (old) scene.remove(old.g);
  const g = new THREE.Group(); g.position.set(pl.x, 0, pl.z);
  if (!pl.built) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.08, 6), M.wood); pad.position.y = 0.04; g.add(pad);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), M.woodDark); p.position.set(x, 0.3, z); g.add(p); }
    const lab = labelSprite(); lab.position.y = 1.7; g.add(lab); g.userData.label = lab;
  } else if (pl.id === "warehouse") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.4), M.wood); body.position.y = 0.55; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.8, 4), M.roof); roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.05), M.woodDark); door.position.set(0, 0.38, 0.72); g.add(door);
    for (const [x, z] of [[1.15, 0.4], [1.2, -0.2], [1.05, 0.95]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), M.wood); cr.position.set(x, 0.2, z); cr.castShadow = true; g.add(cr); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(pl.r - 0.15, pl.r, 40), new THREE.MeshBasicMaterial({ color: 0xffc940, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); g.userData.ring = ring;
  } else if (pl.id === "workbench") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.7), M.wood); top.position.y = 0.7; top.castShadow = true; g.add(top);
    for (const [x, z] of [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), M.woodDark); l.position.set(x, 0.33, z); g.add(l); }
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.25), M.metal); anvil.position.set(-0.2, 0.87, 0); g.add(anvil);
    const ham = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), M.metal); ham.position.set(0.3, 0.8, 0.1); ham.rotation.y = 0.6; g.add(ham);
  } else if (pl.id === "hut") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.9, 8), M.white); body.position.y = 0.45; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 8), mat(0x40c8c0)); roof.position.y = 1.25; roof.castShadow = true; g.add(roof);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), M.metal); ant.position.y = 1.8; g.add(ant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); bulb.position.y = 2.06; g.add(bulb);
  } else if (pl.id === "factory") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.5), mat(0xc9b28a)); body.position.y = 0.6; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 1.6), M.roof); roof.position.y = 1.27; g.add(roof);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 8), M.rock); chim.position.set(0.6, 1.7, -0.3); chim.castShadow = true; g.add(chim);
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 6, 10), M.metal); gear.position.set(-0.4, 0.7, 0.78); g.add(gear);
    g.userData.gear = gear; g.userData.chim = chim;
  }
  scene.add(g);
  plotMeshes.set(pl.id, { g });
}

const signMeshes = [];
function rebuildSignMeshes() {
  for (const s of signMeshes) scene.remove(s.g);
  signMeshes.length = 0;
  for (const s of G.signs) {
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), M.woodDark); post.position.y = 0.5; g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.08), M.wood); board.position.y = 0.95; g.add(board);
    const tgt = G.byId[s.target];
    board.rotation.y = Math.atan2(tgt.cx - s.x, tgt.cz - s.z);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: 0xffc940, transparent: true, opacity: 0.35, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; g.add(pad);
    const lab = labelSprite(); lab.position.y = 2.0; g.add(lab);
    scene.add(g); signMeshes.push({ g, s, lab, pad });
  }
}

/* ================= 角色 ================= */
function makePerson() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.32, 4, 8), M.shirt); body.position.y = 0.62; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M.skin); head.position.y = 1.08; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hair); hair.position.y = 1.1; hair.rotation.x = -0.25; g.add(hair);
  for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.dark); e.position.set(x, 1.1, 0.2); g.add(e); }
  const legs = [], arms = [];
  for (const x of [-0.11, 0.11]) { const l = new THREE.Group(); l.position.set(x, 0.38, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.14), M.pants); m.position.y = -0.18; m.castShadow = true; l.add(m); g.add(l); legs.push(l); }
  for (const x of [-0.29, 0.29]) { const a = new THREE.Group(); a.position.set(x, 0.82, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.1), M.shirt); m.position.y = -0.17; a.add(m); const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M.skin); h.position.y = -0.36; a.add(h); g.add(a); arms.push(a); }
  // 工具（右手）
  const tools = {};
  const handle = () => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.woodDark); h.position.y = -0.55; return h; };
  tools.axe = new THREE.Group(); tools.axe.add(handle()); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.22), M.metal); b.position.set(0, -0.76, 0.1); tools.axe.add(b); }
  tools.pick = new THREE.Group(); tools.pick.add(handle()); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.46), M.metal); b.position.set(0, -0.78, 0); tools.pick.add(b); }
  tools.sword = new THREE.Group(); { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.12), mat(0xdfe8f0, { metalness: 0.6, roughness: 0.3 })); b.position.y = -0.7; tools.sword.add(b); const gd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.26), M.wood); gd.position.y = -0.4; tools.sword.add(gd); }
  for (const t of Object.values(tools)) { t.visible = false; t.rotation.x = Math.PI; t.position.y = -0.36; arms[1].add(t); }
  // 背包 + 背上的資源方塊
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.18), M.wood); pack.position.set(0, 0.68, -0.26); g.add(pack);
  const stack = new THREE.Group(); stack.position.set(0, 0.92, -0.28); g.add(stack);
  return { g, legs, arms, tools, stack, body, head };
}
const cubeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const resMat = Object.fromEntries(RES_ORDER.map((k) => [k, mat(RES[k].color, k === "emerald" || k === "core" ? { emissive: RES[k].color, emissiveIntensity: 0.4 } : {})]));
function setStack(stack, counts, max = 24) {
  const want = [];
  for (const k of RES_ORDER) for (let i = 0; i < counts[k]; i++) want.push(k);
  const n = Math.min(max, want.length);
  const key = want.slice(0, n).join(",");
  if (stack.userData.key === key) return;
  stack.userData.key = key;
  while (stack.children.length) stack.remove(stack.children[0]);
  for (let i = 0; i < n; i++) { const c = new THREE.Mesh(cubeGeo, resMat[want[i]]); c.position.set(((i % 2) - 0.5) * 0.17, Math.floor(i / 2) * 0.17, 0); c.rotation.y = (i * 0.37) % 0.3; stack.add(c); }
}
const hero = makePerson(); scene.add(hero.g);
const heroShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false }));
heroShadow.rotation.x = -Math.PI / 2; scene.add(heroShadow);

const helperMeshes = [];
function makeHelper() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 10), M.robot); body.position.y = 0.38; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white); head.position.y = 0.6; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x2affd0 })); eye.position.set(0, 0.68, 0.17); g.add(eye);
  for (const x of [-0.12, 0.12]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.dark); w.rotation.z = Math.PI / 2; w.position.set(x * 1.6, 0.1, 0); g.add(w); }
  const stack = new THREE.Group(); stack.position.set(0, 0.86, 0); g.add(stack);
  scene.add(g);
  return { g, stack, body };
}

const slimeMeshes = new Map();
function makeSlime(s) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), M.slime.clone()); body.scale.y = 0.75; body.position.y = 0.27; body.castShadow = true; g.add(body);
  for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), M.dark); e.position.set(x, 0.38, 0.28); g.add(e); }
  scene.add(g); slimeMeshes.set(s, { g, body });
}

let bossMesh = null;
function makeBoss() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), M.boss.clone()); body.position.y = 1.3; body.scale.set(1.1, 1.0, 0.9); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), M.boss); head.position.y = 2.55; head.castShadow = true; g.add(head);
  const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.moss); moss.position.set(0.2, 2.95, -0.1); moss.scale.set(1.2, 0.4, 1); g.add(moss);
  for (const x of [-0.22, 0.22]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), M.eye); e.position.set(x, 2.6, 0.55); g.add(e); }
  const arms = [];
  for (const x of [-1.35, 1.35]) { const a = new THREE.Group(); a.position.set(x, 1.9, 0); const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.boss); fist.position.y = -0.9; fist.castShadow = true; a.add(fist); g.add(a); arms.push(a); }
  for (const x of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), M.boss); l.position.set(x, 0.35, 0); g.add(l); }
  scene.add(g);
  bossMesh = { g, body, arms };
}
const warnMeshes = new Map();

/* ================= 飛行中的資源 / 特效 ================= */
const flyers = [], bursts = [], pops = [];
function worldOf(ref) {
  if (ref === "player") return new THREE.Vector3(G.player.x, 1.2, G.player.z);
  if (typeof ref === "string" && ref.startsWith("helper")) { const h = G.helpers[+ref.slice(6)]; return new THREE.Vector3(h.x, 0.9, h.z); }
  return new THREE.Vector3(ref[0], 0.8, ref[1]);
}
function spawnFlyer(e) {
  const from = worldOf(e.from), toRef = e.to;
  const m = new THREE.Mesh(cubeGeo, resMat[e.res]); m.position.copy(from); scene.add(m);
  flyers.push({ m, from, toRef, t: 0, dur: 0.38 + Math.random() * 0.12 });
}
function burst(x, z, color, n = 8, y = 0.6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat(color)); m.position.set(x, y, z); scene.add(m);
    bursts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), t: 0 });
  }
}
function popText(x, z, text, color = "#fff") {
  const sp = labelSprite(); const { c, tex } = sp.userData; c.width = 160; c.height = 80;
  const g = c.getContext("2d"); g.font = '900 54px "JetBrains Mono", sans-serif'; g.textAlign = "center"; g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.7)"; g.strokeText(text, 80, 54); g.fillStyle = color; g.fillText(text, 80, 54);
  tex.needsUpdate = true; sp.scale.set(0.9, 0.45, 1); sp.position.set(x, 1.6, z); scene.add(sp);
  pops.push({ sp, t: 0 });
}
let shake = 0;

/* ================= 音效 ================= */
let ac = null;
function sfx(f, dur = 0.1, type = "sine", vol = 0.12, f2) {
  if (!ac || !prefs.sound) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.15, vol = 0.15, freq = 800) {
  if (!ac || !prefs.sound) return;
  const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; const g = ac.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination); s.start();
}
let lastPick = 0;

/* ================= 輸入 ================= */
const input = { keys: new Set(), joy: null, mx: 0, mz: 0 };
const KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
addEventListener("keydown", (e) => { if (KEYS[e.code]) { input.keys.add(e.code); e.preventDefault(); } });
addEventListener("keyup", (e) => input.keys.delete(e.code));
const joyEl = $("joy");
canvas.addEventListener("pointerdown", (e) => {
  input.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  canvas.setPointerCapture(e.pointerId);
  joyEl.style.display = "block"; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px";
});
canvas.addEventListener("pointermove", (e) => {
  if (!input.joy || e.pointerId !== input.joy.id) return;
  let dx = e.clientX - input.joy.x, dy = e.clientY - input.joy.y; const l = Math.hypot(dx, dy), R = 55;
  if (l > R) { // 手指拖太遠時，搖桿底座跟著走
    input.joy.x += (dx / l) * (l - R); input.joy.y += (dy / l) * (l - R);
    joyEl.style.left = input.joy.x + "px"; joyEl.style.top = input.joy.y + "px";
    dx = e.clientX - input.joy.x; dy = e.clientY - input.joy.y;
  }
  input.joy.dx = dx / R; input.joy.dy = dy / R;
  joyEl.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endJoy = () => { input.joy = null; joyEl.style.display = "none"; joyEl.firstElementChild.style.transform = ""; };
canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);
function readInput() {
  let x = 0, z = 0;
  for (const k of input.keys) { x += KEYS[k][0]; z += KEYS[k][1]; }
  if (input.joy) { x += input.joy.dx; z += input.joy.dy; }
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  return l < 0.15 ? [0, 0] : [x, z];
}

/* ================= UI ================= */
let toastT = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1900); }
const resEls = {};
function renderRes() {
  const box = $("res");
  for (const k of RES_ORDER) {
    const n = have(G, k);
    if (!resEls[k]) { if (!n && k !== "wood" && k !== "stone") continue; const s = document.createElement("span"); box.appendChild(s); resEls[k] = { el: s, n: -1 }; }
    const r = resEls[k];
    if (r.n !== n) { if (r.n >= 0 && n > r.n) { r.el.classList.add("bump"); setTimeout(() => r.el.classList.remove("bump"), 150); } r.n = n; r.el.textContent = `${RES[k].icon}${n}`; }
  }
  const hp = Math.max(0, G.player.hp);
  $("hpFill").style.transform = `scaleX(${hp / PLAYER.maxHp})`; $("hpTxt").textContent = `❤ ${Math.ceil(hp)}`;
  const bt = bagTotal(G), bc = bagCap(G);
  $("bagFill").style.transform = `scaleX(${bt / bc})`; $("bagTxt").textContent = `🎒 ${bt}/${bc}`;
  $("bagFill").parentElement.classList.toggle("full", bt >= bc);
  const B = G.boss;
  $("bossBar").hidden = !(B && B.alive && B.active);
  if (B) $("bossFill").style.transform = `scaleX(${Math.max(0, B.hp) / BOSS.hp})`;
}
function costHTML(cost) { return Object.entries(cost).map(([k, n]) => `<span class="${have(G, k) >= n ? "" : "no"}">${RES[k].icon}${n}</span>`).join(" "); }
let panelFor = null, panelSig = "";
function renderPanel() {
  const pl = nearPlot(G);
  const id = pl && ["workbench", "factory", "hut"].includes(pl.id) ? pl.id : null;
  const panel = $("panel");
  if (!id) { panel.hidden = true; panelFor = null; return; }
  let html = "", title = PLOTS[id].name;
  const keys = id === "workbench" ? ["axe", "pick", "sword", "bag"] : id === "hut" ? ["hut"] : [];
  for (const k of keys) {
    const U = UPGRADES[k], lv = G.levels[k], cost = U.costs[lv - 1];
    const desc = k === "bag" ? `容量 ${U.power[lv - 1]}${cost ? " → " + U.power[lv] : ""}` : k === "hut" ? `小幫手 ${G.helpers.length} 位` : `Lv${lv}${cost ? " → Lv" + (lv + 1) : "（最高）"}`;
    html += `<div class="item"><div class="ic">${U.icon}</div><div><b>${U.name}</b><small>${desc}</small><small>${cost ? costHTML(cost) : "已滿級"}</small></div>${cost ? `<button class="mini" data-up="${k}" ${canAfford(G, cost) ? "" : "disabled"}>升級</button>` : ""}</div>`;
  }
  if (id === "hut") html += `<p class="note">小幫手會在你背包快滿的時候走到你身邊，把資源搬回倉庫。走路速度跟你一樣，離家越遠來回越久。</p>`;
  if (id === "factory") {
    for (const R of RECIPES) {
      const [fk, fn] = Object.entries(R.from)[0], [tk] = Object.keys(R.to);
      const q = G.factory.queue.filter((x) => x === R.id).length + (G.factory.cur?.id === R.id ? 1 : 0);
      html += `<div class="item"><div class="ic">${RES[tk].icon}</div><div><b>${RES[tk].name}</b><small>${RES[fk].icon}${fn} → ${RES[tk].icon}1 · 排隊 ${q}</small>${G.factory.cur?.id === R.id ? `<div class="prog"><i style="transform:scaleX(${G.factory.t / R.time})"></i></div>` : ""}</div><div><button class="mini" data-q="${R.id}" data-n="1">+1</button><button class="mini" data-q="${R.id}" data-n="10">+10</button></div></div>`;
    }
    html += `<p class="note">加工用的是倉庫和背包裡的原料，成品放進倉庫。</p>`;
  }
  const sig = id + html;
  if (sig !== panelSig) { $("panelTitle").textContent = title; $("panelBody").innerHTML = html; panelSig = sig; }
  panel.hidden = false; panelFor = id;
}
$("panelBody").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.up) { if (upgrade(G, b.dataset.up)) { sfx(660, 0.12, "triangle", 0.15); sfx(990, 0.2, "triangle", 0.12); save(); } }
  if (b.dataset.q) { const n = enqueue(G, b.dataset.q, +b.dataset.n); if (n) sfx(520, 0.08, "square", 0.06); }
  panelSig = "";
});
function tipText() {
  const P = G.player, wb = G.plots.find((p) => p.id === "workbench");
  if (G.bossDefeated) return "🎉 第一世界完成！可以繼續採集、升級";
  if (bagTotal(G) >= bagCap(G)) return "🎒 背包滿了！回到主島的倉庫（黃色圈）卸貨";
  if (!wb.built) return "🌲 靠近樹木和石頭自動採集，然後站上地基蓋「工匠台」";
  if (!G.byId.pine.unlocked) return "🪧 站上島邊的建造牌投入木頭，開通新的小島";
  const hut = G.plots.find((p) => p.id === "hut");
  if (G.byId.copper.unlocked && !hut.built) return "🤖 蓋好「小幫手小屋」，它會幫你把資源搬回家";
  const fac = G.plots.find((p) => p.id === "factory");
  if (G.byId.works.unlocked && !fac.built) return "🏭 在工坊台地蓋「加工廠」，把木頭做成木板、銅礦煉成銅錠";
  if (G.byId.boss.unlocked) return "🗿 擊敗石頭守衛者！地上的紅圈是攻擊預告，快閃開";
  return "🪧 繼續開通小島，⚠ 外圍島有史萊姆，到工匠台升級劍";
}

/* ================= 建立場景 ================= */
for (const isl of G.islands) { if (isl.unlocked) buildIsland(isl); else buildGhost(isl); }
for (const n of G.nodes) makeNode(n);
for (const pl of G.plots) if (G.byId[pl.island].unlocked) buildPlot(pl);
for (const s of G.slimes) makeSlime(s);
if (G.boss) makeBoss();
rebuildSignMeshes();

/* ================= 事件 → 特效 ================= */
function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case "fly": spawnFlyer(e); if (e.to === "player" && performance.now() - lastPick > 60) { sfx(880 + Math.random() * 200, 0.06, "sine", 0.06); lastPick = performance.now(); } break;
      case "swing": hero.swing = 0.3; break;
      case "hit":
        if (e.what === "tree" || e.what === "bigtree") { noise(0.08, 0.25, 600); burst(e.x, e.z, 0x9b6a3c, 5, 0.9); }
        else if (e.what === "slime" || e.what === "boss") { noise(0.06, 0.2, 1500); popText(e.x, e.z, `-${e.dmg}`, "#ffd040"); burst(e.x, e.z, e.what === "slime" ? 0x7cff6b : 0x7b8088, 5, 0.8); }
        else { sfx(1400 + Math.random() * 300, 0.05, "triangle", 0.08); noise(0.05, 0.15, 2500); burst(e.x, e.z, 0x9aa0a8, 5, 0.5); }
        break;
      case "break": sfx(300, 0.2, "triangle", 0.1, 150); break;
      case "regrow": { const nm = nodeMeshes.get(e.node); if (nm) nm.grow = 0.05; break; }
      case "toast": toast(e.msg); break;
      case "unlock": {
        if (ghosts.has(e.island.id)) { scene.remove(ghosts.get(e.island.id)); ghosts.delete(e.island.id); }
        buildIsland(e.island); islandMeshes.get(e.island.id).rise = 0.001;
        for (const n of G.nodes) if (!nodeMeshes.has(n)) makeNode(n);
        for (const s of G.slimes) if (!slimeMeshes.has(s)) makeSlime(s);
        for (const pl of G.plots) if (pl.island === e.island.id) buildPlot(pl);
        if (G.boss && !bossMesh) makeBoss();
        rebuildSignMeshes();
        toast(`🏝️ 開通了「${e.island.name}」！`); shake = 0.5;
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx(f, 0.25, "triangle", 0.14), i * 90)); noise(0.6, 0.2, 500);
        save(); break;
      }
      case "build": buildPlot(e.plot); toast(`🔨 蓋好了「${PLOTS[e.plot.id].name}」`); noise(0.1, 0.3, 400); setTimeout(() => noise(0.1, 0.3, 400), 150); sfx(784, 0.3, "triangle", 0.12); save(); break;
      case "upgrade": toast(`⬆ ${UPGRADES[e.key].name} 升到 Lv${e.level}`); break;
      case "craft": sfx(1200, 0.12, "sine", 0.06); break;
      case "hurt": sfx(160, 0.15, "square", 0.1, 90); shake = Math.max(shake, 0.25); try { navigator.vibrate?.(30); } catch {} break;
      case "death": toast("💫 你被打倒了，回到主島休息（不會掉東西）"); sfx(400, 0.6, "sine", 0.15, 80); break;
      case "slimeDead": sfx(500, 0.15, "sine", 0.12, 1200); burst(e.x, e.z, 0x7cff6b, 12, 0.4); break;
      case "bossWake": toast("🗿 石頭守衛者醒了！"); sfx(80, 0.8, "sawtooth", 0.15, 50); break;
      case "boom": noise(0.35, 0.35, 300); shake = Math.max(shake, 0.4); burst(e.x, e.z, 0x8a8f96, 10, 0.3); break;
      case "bossDead":
        shake = 1; burst(e.x, e.z, 0xfcee0a, 30, 1.5); [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx(f, 0.4, "triangle", 0.16), i * 120));
        save(); setTimeout(() => { $("clearTxt").innerHTML = `獲得 ⭐ 守衛者之核！<br>遊玩時間 ${Math.floor(played / 60)} 分 ${Math.floor(played % 60)} 秒`; $("clear").hidden = false; }, 1600);
        break;
    }
  }
  G.events.length = 0;
}

/* ================= 主迴圈 ================= */
let last = performance.now(), running = false, saveT = 0, uiT = 0, walkPhase = 0;
const camTarget = new THREE.Vector3(), tmp = new THREE.Vector3();
const camOff = innerHeight > innerWidth ? new THREE.Vector3(0, 15, 11.5) : new THREE.Vector3(0, 11.5, 9.5);
camTarget.set(G.player.x, 0, G.player.z);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running) {
    const [mx, mz] = readInput();
    update(G, dt, mx, mz);
    played += dt;
    handleEvents();
    saveT += dt; if (saveT > 3) { saveT = 0; save(); }
  }
  const t = performance.now() / 1000;
  waterUniforms.uTime.value = t;

  // 主角
  const P = G.player;
  hero.g.position.set(P.x, 0, P.z);
  let dr = P.facing - hero.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.g.rotation.y += dr * Math.min(1, dt * 14);
  if (P.moving) walkPhase += dt * 11; else walkPhase *= 0.85;
  hero.legs[0].rotation.x = Math.sin(walkPhase) * 0.6; hero.legs[1].rotation.x = -Math.sin(walkPhase) * 0.6;
  hero.arms[0].rotation.x = -Math.sin(walkPhase) * 0.5;
  hero.swing = Math.max(0, (hero.swing || 0) - dt);
  const sw = hero.swing > 0 ? Math.sin((1 - hero.swing / 0.3) * Math.PI) : 0;
  hero.arms[1].rotation.x = P.action ? -1.2 - sw * -2.2 + (sw ? -1 : 0) : Math.sin(walkPhase) * 0.5;
  if (P.action) hero.arms[1].rotation.x = -2.3 + sw * 2.2;
  for (const [k, m] of Object.entries(hero.tools)) m.visible = P.action === k;
  hero.g.position.y = P.moving ? Math.abs(Math.sin(walkPhase)) * 0.06 : 0;
  hero.g.visible = true;
  setStack(hero.stack, G.bag);
  heroShadow.position.set(P.x, 0.02, P.z);
  const hurtRecent = G.t - P.lastHurt < 0.15;
  hero.body.material.emissive.setHex(hurtRecent ? 0xff0000 : 0x000000); hero.body.material.emissiveIntensity = hurtRecent ? 0.6 : 0;

  // 小幫手
  while (helperMeshes.length < G.helpers.length) helperMeshes.push(makeHelper());
  G.helpers.forEach((h, i) => {
    const m = helperMeshes[i]; m.g.position.set(h.x, h.moving ? Math.abs(Math.sin(t * 12)) * 0.05 : 0, h.z);
    if (h.facing !== undefined) m.g.rotation.y = h.facing;
    setStack(m.stack, h.load, 12);
  });

  // 島升起
  for (const [id, im] of islandMeshes) {
    if (im.rise > 0 && im.rise < 1) { im.rise = Math.min(1, im.rise + dt / 1.6); const e = 1 - Math.pow(1 - im.rise, 3); im.g.position.y = -3.5 * (1 - e); }
    im.g.userData.foam.material.opacity = 0.35 + Math.sin(t * 2 + im.g.position.x) * 0.12;
  }
  // 節點
  for (const [n, nm] of nodeMeshes) {
    const target = n.alive ? 1 : 0;
    if (n.alive && nm.grow < 1) nm.grow = Math.min(1, nm.grow + dt * 1.8);
    if (!n.alive) nm.grow = Math.max(0, nm.grow - dt * 6);
    nm.live.scale.setScalar(Math.max(0.001, nm.grow));
    nm.live.visible = nm.grow > 0.01;
    nm.live.rotation.z = Math.sin(t * 40) * 0.08 * n.shake;
    nm.g.position.y = islandMeshes.get(n.island)?.g.position.y || 0;
    void target;
  }
  // 建築動畫
  const fac = plotMeshes.get("factory");
  if (fac?.g.userData.gear) { fac.g.userData.gear.rotation.z += dt * (G.factory.cur ? 4 : 0.3); if (G.factory.cur && Math.random() < dt * 6) { const c = fac.g.userData.chim; burst(c.parent.position.x + 0.6, c.parent.position.z - 0.3, 0xdddddd, 1, 2.3); } }
  const wh = plotMeshes.get("warehouse"); if (wh?.g.userData.ring) wh.g.userData.ring.material.opacity = bagTotal(G) ? 0.45 + Math.sin(t * 5) * 0.25 : 0.25;
  // 標籤只在主角附近顯示，避免畫面太擠
  const near = (x, z, r = 6.5) => Math.hypot(x - P.x, z - P.z) < r;
  for (const pl of G.plots) { const pm = plotMeshes.get(pl.id); if (pm?.g.userData.label) { pm.g.userData.label.visible = near(pl.x, pl.z); drawLabel(pm.g.userData.label, PLOTS[pl.id].name, costLines(pl.cost, pl.paid)); } }
  for (const sm of signMeshes) {
    const isl = G.byId[sm.s.target];
    sm.lab.visible = near(sm.s.x, sm.s.z, 5.5);
    drawLabel(sm.lab, `開通「${isl.name}」`, costLines(isl.cost, G.paid[isl.id] || {}));
    const paying = G.payingAt && G.payingAt.s === sm.s;
    sm.pad.material.opacity = paying ? 0.6 + Math.sin(t * 10) * 0.2 : 0.3;
  }

  // 史萊姆
  for (const [s, sm] of slimeMeshes) {
    sm.g.visible = s.alive && !!G.byId[s.island].unlocked;
    if (!sm.g.visible) continue;
    const hop = Math.abs(Math.sin(t * (s.angry ? 9 : 5) + s.id));
    sm.g.position.set(s.x, hop * 0.25, s.z);
    sm.body.scale.set(1 + (1 - hop) * 0.15, 0.75 - (1 - hop) * 0.15, 1 + (1 - hop) * 0.15);
    sm.g.rotation.y = Math.atan2(P.x - s.x, P.z - s.z);
    sm.body.material.color.setHex(s.flash > 0 ? 0xffffff : s.angry ? 0xff8a6b : 0x7cff6b);
  }
  // 魔王
  const B = G.boss;
  if (bossMesh && B) {
    bossMesh.g.visible = B.alive;
    bossMesh.g.position.set(B.x, 0, B.z);
    if (B.facing !== undefined) bossMesh.g.rotation.y = B.facing;
    const lift = B.anim > 0 ? Math.sin((1 - B.anim / 0.6) * Math.PI) : 0;
    bossMesh.arms.forEach((a) => (a.rotation.x = -lift * 2.2));
    bossMesh.body.scale.y = 1 + Math.sin(t * 2) * 0.03;
    bossMesh.body.material.color.setHex(B.flash > 0 ? 0xffffff : 0x6f766a);
    const seen = new Set();
    for (const w of B.warns) {
      seen.add(w);
      let wm = warnMeshes.get(w);
      if (!wm) {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(w.r - 0.08, w.r, 40), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false }));
        const fill = new THREE.Mesh(new THREE.CircleGeometry(w.r, 40), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.35, depthWrite: false }));
        ring.rotation.x = fill.rotation.x = -Math.PI / 2; ring.position.y = 0.04; fill.position.y = 0.03;
        g.add(ring, fill); g.position.set(w.x, 0, w.z); scene.add(g);
        wm = { g, fill }; warnMeshes.set(w, wm);
      }
      const k = Math.min(1, Math.max(0.02, 1 - w.t / w.T));
      wm.fill.scale.setScalar(k);
      wm.g.visible = w.t > 0;
    }
    for (const [w, wm] of warnMeshes) if (!seen.has(w)) { scene.remove(wm.g); warnMeshes.delete(w); }
  }

  // 飛行資源
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const to = worldOf(f.toRef);
    f.m.position.lerpVectors(f.from, to, k); f.m.position.y += Math.sin(k * Math.PI) * 1.2;
    f.m.rotation.x += dt * 10; f.m.rotation.y += dt * 8;
    if (k >= 1) { scene.remove(f.m); flyers.splice(i, 1); }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; b.v.y -= 12 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 8;
    if (b.t > 0.8 || b.m.position.y < -0.5) { scene.remove(b.m); b.m.geometry.dispose(); bursts.splice(i, 1); }
  }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.sp.position.y += dt * 1.2; p.sp.material.opacity = 1 - p.t; if (p.t > 1) { scene.remove(p.sp); pops.splice(i, 1); } }

  // 鏡頭：固定角度跟著主角
  camTarget.lerp(tmp.set(P.x, 0, P.z), 1 - Math.exp(-dt * 5));
  shake = Math.max(0, shake - dt * 1.5);
  camera.position.copy(camTarget).add(camOff);
  camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3;
  camera.lookAt(camTarget.x, 0.5, camTarget.z);
  sun.position.set(camTarget.x + 8, 18, camTarget.z + 6); sun.target.position.copy(camTarget);

  uiT += dt; if (uiT > 0.1) { uiT = 0; renderRes(); renderPanel(); $("tip").textContent = tipText(); }
  renderer.render(scene, camera);
}

/* ================= 選單 ================= */
$("bPlay").onclick = () => {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  ac?.resume?.();
  $("start").hidden = true; running = true;
};
$("bMenu").onclick = () => { running = false; $("optSound").checked = prefs.sound; $("menu").hidden = false; };
$("bResume").onclick = () => { $("menu").hidden = true; running = true; };
$("optSound").onchange = (e) => { prefs.sound = e.target.checked; try { localStorage.setItem("island.prefs", JSON.stringify(prefs)); } catch {} };
$("bReset").onclick = () => { if (confirm("確定要刪除進度、重新開始嗎？")) { try { localStorage.removeItem(SAVE_KEY); } catch {} location.reload(); } };
$("bClear").onclick = () => { $("clear").hidden = true; };
if (saved) $("bPlay").textContent = "繼續冒險";
document.addEventListener("visibilitychange", () => { if (document.hidden) { save(); last = performance.now(); } });
addEventListener("pagehide", save);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

window.__island = { get G() { return G; }, camera };
renderRes();
requestAnimationFrame((tt) => { last = tt; frame(tt); });
