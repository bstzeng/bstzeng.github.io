// 溪山行旅：實機測試（需要 Playwright 與一個本機伺服器）
// 用法：在專案根目錄 `python3 -m http.server 8765`，然後 `node xishan/tests/run-tests.cjs`
// 測三件事：橋面能走通、渡船穿橋不穿模、碼頭可以上下船；另外走一遍完整步行路線。
const { chromium } = require("playwright");
const URL = process.env.XISHAN_URL || "http://localhost:8765/xishan/?shot=1";
(async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 240000 });
  let allOk = true;
  for (const t of ["bridgeWalk", "boatClearance", "dock"]) {
    const r = await p.evaluate((n) => window.xishan.tests[n](), t);
    allOk = allOk && r.ok;
    console.log(`== ${t}: ${r.ok ? "通過" : "失敗"}\n${JSON.stringify(r, null, 1)}`);
  }
  const route = await p.evaluate(() => {
    const x = window.xishan, L = x.L, P = x.player, legs = [];
    const go = (name, tx, tz) => {
      let t = 0, stuck = 0;
      while (t < 400 && Math.hypot(tx - P.x, tz - P.z) > 1.2) {
        P.yaw = Math.atan2(-(tx - P.x), -(tz - P.z));
        if (!x.walkStep(1 / 20, 1, 0, true)) { if (++stuck > 40) break; } else stuck = 0;
        t += 1 / 20;
      }
      const ok = Math.hypot(tx - P.x, tz - P.z) < 1.5;
      legs.push(`${ok ? "✓" : "✗"} ${name}（高度 ${P.y.toFixed(1)}，${P.kind}）`);
      return ok;
    };
    const e = L.bridge.toWorld(L.bridge.half + 8, 0);
    x.setMode("walk", { at: { x: e.x, z: e.z } });
    const pts = [["市街", -80, -78], ["市街", -30, -56], ["市街", 30, -46], ["御街口", 112, -48], ["御街", 112, -140], ["西側石階下", 75.5, -149], ["爬上高台", 75.5, -170], ["台上", 112, -177], ["大殿台基", 112, -188], ["走下台基踏步", 112, -179], ["台上往東", 150, -179], ["繞過東配殿", 150, -220], ["後方石階頂", 112, -222.5], ["下到宮苑", 112, -243], ["宮苑小徑", 140, -236], ["宮苑後門", 145, -258], ["出後門", 145, -268], ["山徑起點", 165, -262], ["山徑", 196, -282], ["觀景亭", L.pavilion.x, L.pavilion.z]];
    let ok = true;
    for (const [n, a, c] of pts) ok = go(n, a, c) && ok;
    return { ok, legs };
  });
  allOk = allOk && route.ok;
  console.log(`== 步行路線：${route.ok ? "通過" : "失敗"}\n` + route.legs.join("\n"));
  await b.close();
  process.exit(allOk ? 0 : 1);
})();
