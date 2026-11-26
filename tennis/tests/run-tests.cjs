// 公仔網球：實機測試（Playwright + 本機伺服器）
// 用法：專案根目錄 `python3 -m http.server 8765`，然後 `node tennis/tests/run-tests.cjs [shots]`
const { chromium } = require("playwright");
const URL = process.env.TN_URL || "http://localhost:8765/tennis/";
const SHOTS = process.argv.includes("shots");
(async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => window.tennis);
  if (SHOTS) await p.screenshot({ path: "tennis/tests/menu.jpg", quality: 80 });

  const acc = await p.evaluate(() => {
    const g = window.tennis, V = g.ball.p.constructor;
    let worst = 0, nets = 0;
    for (let i = 0; i < 40; i++) {
      const p0 = new V((Math.random() - 0.5) * 8, 0.4 + Math.random() * 1.5, 9 + Math.random() * 4);
      const w = new V(-60 - Math.random() * 120, 0, 0);
      const tx = (Math.random() - 0.5) * 7, tz = -6 - Math.random() * 5;
      const v = g.solveShot(p0, tx, tz, Math.hypot(tx - p0.x, tz - p0.z) / (14 + Math.random() * 14), w, 0.25);
      const l = g.simLanding(p0, v, w);
      worst = Math.max(worst, Math.hypot(l.x - tx, l.z - tz));
      if (l.netY < 0.05) nets++;
    }
    return { worst, nets };
  });
  console.log("解算落點最大誤差(m)", acc.worst.toFixed(3), "掛網", acc.nets);
  let ok = acc.worst < 0.12 && acc.nets === 0;

  for (const d of ["easy", "normal", "hard"]) {
    const r = await p.evaluate(async (d) => {
      const g = window.tennis;
      g.startGame(d);
      const reasons = {};
      const tst = document.getElementById("toast");
      let lastMsg = "", hits = 0, lastLast = null, target = null, skip = false;
      const t0 = performance.now();
      while (g.st.phase !== "over" && performance.now() - t0 < 100000) {
        if (g.st.phase === "serve" && g.st.server === "P" && g.st.timer > 0.4) {
          if (!g.st.tossing) { g.st.tossing = true; g.st.toss = 0; }
          else if (g.st.toss > 0.4) { g.mouse.nx = Math.random() * 2 - 1; g.playerServe(); }
        }
        if (g.st.phase === "rally" && g.st.last === "A") {
          if (!target) { skip = Math.random() < 0.15; target = g.predictHit(g.ball, "P"); }
          if (target && !skip) { g.mouse.x = target.x + 0.6; g.mouse.z = target.z + 0.3; }
        } else target = null;
        if (g.st.last !== lastLast) { if (lastLast) hits++; lastLast = g.st.last; }
        if (tst.className.includes("show") && tst.textContent !== lastMsg) { lastMsg = tst.textContent; reasons[lastMsg] = (reasons[lastMsg] || 0) + 1; }
        if (!tst.className.includes("show")) lastMsg = "";
        await new Promise((r) => setTimeout(r, 8));
      }
      return { games: { ...g.st.games }, pts: { ...g.st.pts }, phase: g.st.phase, hits, reasons };
    }, d);
    console.log(d, JSON.stringify(r));
    if (r.hits < 10) ok = false;
  }

  if (SHOTS) {
    await p.evaluate(() => { window.tennis.startGame("normal"); document.getElementById("over").hidden = true; });
    await p.waitForTimeout(600);
    await p.screenshot({ path: "tennis/tests/serve.jpg", quality: 80 });
    await p.evaluate(() => { const g = window.tennis; g.st.tossing = true; g.st.toss = 0.47; g.playerServe(); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: "tennis/tests/rally.jpg", quality: 80 });
  }
  if (errs.length) { console.log("頁面錯誤：\n" + errs.join("\n")); ok = false; }
  console.log(ok ? "全部通過" : "有失敗");
  await b.close();
  process.exit(ok ? 0 : 1);
})();
