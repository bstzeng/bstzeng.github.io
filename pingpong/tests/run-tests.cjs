// 公仔桌球：實機測試（Playwright + 本機伺服器）
// 用法：專案根目錄 `python3 -m http.server 8765`，然後 `node pingpong/tests/run-tests.cjs [shots]`
const { chromium } = require("playwright");
const URL = process.env.PP_URL || "http://localhost:8765/pingpong/";
const SHOTS = process.argv.includes("shots");
(async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => window.pingpong);
  if (SHOTS) await p.screenshot({ path: "pingpong/tests/menu.jpg", quality: 80 });

  // 1) 解算精準度：各種旋轉下的落點誤差、是否過網
  const acc = await p.evaluate(() => {
    const g = window.pingpong, V = g.ball.p.constructor;
    let worst = 0, nets = 0;
    for (let i = 0; i < 60; i++) {
      const p0 = new V((Math.random() - 0.5) * 1.2, g.consts.TY + 0.05 + Math.random() * 0.3, 1.3 + Math.random() * 0.6);
      const w = new V((Math.random() - 0.5) * 340, (Math.random() - 0.5) * 340, 0);
      const tx = (Math.random() - 0.5) * 1.2, tz = -0.6 - Math.random() * 0.6;
      const v = g.solveShot(p0, tx, tz, 0.4 + Math.random() * 0.4, w);
      const l = g.simLanding(p0, v, w);
      worst = Math.max(worst, Math.hypot(l.x - tx, l.z - tz));
      if (l.netY < g.consts.TY + g.consts.NET + g.consts.R) nets++;
    }
    return { worst, nets };
  });
  console.log("解算落點最大誤差(m)", acc.worst.toFixed(3), "掛網", acc.nets);
  let ok = acc.worst < 0.05 && acc.nets === 0;

  // 2) 機器人對打：每個難度打 12 分，記錄得失分原因
  for (const d of ["easy", "normal", "hard"]) {
    const r = await p.evaluate(async (d) => {
      const g = window.pingpong;
      g.startGame(d);
      const reasons = {};
      const tst = document.getElementById("toast");
      let lastMsg = "", hits = 0, lastLast = null, target = null, skip = false;
      const t0 = performance.now();
      while (g.st.score.P + g.st.score.A < 12 && g.st.phase !== "over" && performance.now() - t0 < 120000) {
        if (g.st.phase === "serve" && g.st.server === "P" && g.st.timer > 0.5) { g.pad.tx = 0.2; g.pad.tz = 1.6; g.playerServe(); }
        if (g.st.phase === "rally" && g.st.last === "A") {
          if (!target) { skip = Math.random() < 0.2; target = true; }
          const h = skip ? null : g.predictHit(g.ball, "P", 1);
          if (h) { g.pad.tx = h.x - 0.03; g.pad.tz = h.z + Math.sin(performance.now() / 40) * 0.05; }
        } else target = null;
        if (g.st.last !== lastLast) { if (lastLast) hits++; lastLast = g.st.last; }
        if (tst.className.includes("show") && tst.textContent !== lastMsg) { lastMsg = tst.textContent; reasons[lastMsg] = (reasons[lastMsg] || 0) + 1; }
        if (!tst.className.includes("show")) lastMsg = "";
        await new Promise((r) => setTimeout(r, 8));
      }
      return { score: { ...g.st.score }, hits, reasons };
    }, d);
    console.log(d, JSON.stringify(r));
    if (r.score.P + r.score.A < 6) ok = false;
  }

  if (SHOTS) {
    await p.evaluate(() => window.pingpong.startGame("normal"));
    await p.waitForTimeout(800);
    await p.screenshot({ path: "pingpong/tests/serve.jpg", quality: 80 });
    await p.evaluate(() => { const g = window.pingpong; g.pad.tx = 0.3; g.pad.tz = 1.6; g.playerServe(); });
    await p.waitForTimeout(450);
    await p.screenshot({ path: "pingpong/tests/rally.jpg", quality: 80 });
  }
  if (errs.length) { console.log("頁面錯誤：\n" + errs.join("\n")); ok = false; }
  console.log(ok ? "全部通過" : "有失敗");
  await b.close();
  process.exit(ok ? 0 : 1);
})();
