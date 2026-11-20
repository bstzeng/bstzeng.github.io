// 清明上河圖：實機測試＋截圖（需要 Playwright 與本機伺服器）
// 用法：專案根目錄 `python3 -m http.server 8765`，然後 `node qingming/tests/run-tests.cjs [shots]`
const { chromium } = require("playwright");
const URL = process.env.QM_URL || "http://localhost:8765/qingming/?shot=1";
const SHOTS = process.argv.includes("shots");
(async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => document.body.classList.contains("ready") || window.__err, null, { timeout: 300000 }).catch(() => {});
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
  let allOk = errs.length === 0;
  if (SHOTS) {
    const shot = async (name, fn, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(200); await p.screenshot({ path: `qingming/screenshots/${name}.jpg`, quality: 80 }); console.log("截圖", name); };
    for (const [n, x] of [["paint-1-郊野", 520], ["paint-2-汴河", 230], ["paint-3-虹橋", 10], ["paint-4-街市", -200], ["paint-5-城門", -380], ["paint-6-城內", -520]]) {
      await shot(n, (x) => { const q = window.qingming; q.setMode("paint", { x }); q.simulate(1.5); q.frame(); }, x);
    }
    await shot("paint-7-大船過橋", () => { const q = window.qingming, B = q.world.life.big; B.s = B.line.near(q.P.bridge.cx, q.P.bridge.cz).s - 8; B.mastK = 1; q.setMode("paint", { x: 15 }); q.simulate(0.5); q.frame(); });
    await shot("walk-1-橋上", () => { const q = window.qingming, B = q.P.bridge, s = B.toWorld(14, -1.5); q.setMode("walk", { at: { x: s.x, z: s.z, yaw: Math.atan2(B.ax, B.az) } }); q.player.pitch = -0.12; q.frame(0.3); });
    await shot("walk-2-街市", () => { const q = window.qingming; q.setMode("walk", { at: { x: -150, z: 17, yaw: Math.PI / 2 } }); q.frame(0.3); });
    await shot("walk-3-城門", () => { const q = window.qingming; q.setMode("walk", { at: { x: -330, z: 5, yaw: Math.PI / 2 } }); q.player.pitch = 0.05; q.frame(0.3); });
  }
  for (const t of ["panLimits", "moving", "bridgeWalk", "gateWalk", "bigBoat"]) {
    const r = await p.evaluate((n) => { try { return window.qingming.tests[n](); } catch (e) { return { ok: false, error: String(e) + e.stack }; } }, t);
    allOk = allOk && r.ok;
    console.log(`== ${t}: ${r.ok ? "通過" : "失敗"} ${JSON.stringify(r)}`);
  }
  await b.close();
  process.exit(allOk ? 0 : 1);
})();
