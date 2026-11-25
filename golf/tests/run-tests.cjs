// 翠嶺高爾夫：實機測試＋截圖（Playwright + 本機伺服器）
// 用法：專案根目錄 `python3 -m http.server 8765`，然後 `node golf/tests/run-tests.cjs [shots]`
const { chromium } = require("playwright");
const URL = process.env.GOLF_URL || "http://localhost:8765/golf/?shot=1";
const SHOTS = process.argv.includes("shots");
(async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => window.golf, null, { timeout: 300000 });
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
  let allOk = errs.length === 0;
  const list = (process.env.TESTS || "lengths,clubs,putts,water,play18").split(",");
  for (const t of list) {
    const t0 = Date.now();
    const r = await p.evaluate(async (n) => { try { return await window.golf.tests[n](); } catch (e) { return { ok: false, error: String(e) + "\n" + e.stack }; } }, t);
    allOk = allOk && r.ok;
    console.log(`== ${t}: ${r.ok ? "通過" : "失敗"} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${JSON.stringify(r)}`);
  }
  if (SHOTS) {
    const shot = async (name, fn, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(150); await p.screenshot({ path: `golf/screenshots/${name}.jpg`, quality: 84 }); console.log("截圖", name); };
    const W = (w) => `(async () => { const g = window.golf; g.cfg.weather = "${w}"; g.cfg.time = "${w === "clear" ? "morning" : "noon"}"; g.G.seed = 12345; g.rollWeather(); })()`;
    await p.evaluate(W("clear"));
    await shot("1-發球台", async () => { const g = window.golf; await g.loadHole(1); g.endFlyover(); g.simulate(0.6); g.render(); });
    await shot("2-球道第二桿", async () => { const g = window.golf; g.aiShot(); g.quickShot(g.G.power, 0); g.simulate(0.8); g.render(); });
    await shot("3-果嶺推桿格線", async () => { const g = window.golf; const h = g.G.hole; let a = 2.4; for (let k = 0; k < 30; k++) { const x = h.pin.x + Math.cos(a) * 7, z = h.pin.z + Math.sin(a) * 7; if (h.surface(x, z) === g.C.SURF.GREEN) { g.placeBall(x, z); break; } a += 0.4; } g.toAim(); g.simulate(0.8); g.render(); });
    await shot("4-球在空中", async () => { const g = window.golf; await g.loadHole(7); g.endFlyover(); g.simulate(0.3); g.recommend(); g.fire(1, 0); g.simulate(2.4); g.render(); });
    await shot("5-落點鏡頭", async () => { const g = window.golf; g.simulate(3.6); g.render(); });
    await shot("6-空拍", async () => { const g = window.golf; await g.loadHole(12); g.endFlyover(); g.setCam("top"); g.simulate(1.2); g.render(); });
    await p.evaluate(W("rain"));
    await shot("7-雨天水塘", async () => { const g = window.golf; await g.loadHole(3); g.endFlyover(); g.simulate(1); g.render(); });
    await p.evaluate(W("clear"));
    await shot("8-黃昏", async () => { const g = window.golf; g.cfg.time = "evening"; g.rollWeather(); await g.loadHole(18); g.endFlyover(); g.setCam("target"); g.simulate(1.2); g.render(); });
  }
  await b.close();
  process.exit(allOk ? 0 : 1);
})();
