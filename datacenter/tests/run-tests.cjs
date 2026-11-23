// 機房日常：實機測試＋截圖（需要 Playwright 與本機伺服器）
// 用法：專案根目錄 `python3 -m http.server 8765`，然後 `node datacenter/tests/run-tests.cjs [shots]`
const { chromium } = require("playwright");
const URL = process.env.DC_URL || "http://localhost:8765/datacenter/?shot=1";
const SHOTS = process.argv.includes("shots");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  await p.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 120000 }).catch(() => {});
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));
  let allOk = errs.length === 0;
  const t0 = Date.now();
  for (const t of ["reachAll", "walk", "allTickets", "wrongPull", "deterministic"]) {
    const r = await p.evaluate((n) => { try { return window.dc.tests[n](); } catch (e) { return { ok: false, error: String(e) + "\n" + e.stack }; } }, t);
    allOk = allOk && r.ok;
    console.log(`== ${t}: ${r.ok ? "通過" : "失敗"} ${JSON.stringify(r)}`);
  }
  // 繪圖效能：各縮放層級畫一幀要多久
  const perf = await p.evaluate(() => { const dc = window.dc, out = {}; dc.begin(1); for (const z of [2.2, 1.2, 0.7, 0.3, 0.1]) { dc.cam.z = z; dc.centerOn(60, 34); const t = performance.now(); for (let k = 0; k < 10; k++) dc.frame(); out[z] = +((performance.now() - t) / 10).toFixed(1); } return out; });
  console.log("== 每幀毫秒（縮放→ms）：", JSON.stringify(perf));
  if (SHOTS) {
    const shot = async (name, fn, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(400); await p.screenshot({ path: `datacenter/screenshots/${name}.jpg`, quality: 82 }); console.log("截圖", name); };
    await p.evaluate(() => { const dc = window.dc; dc.begin(1); dc.simulate(3); dc.S.dialog = dc.S.dialog.slice(0, 1); document.querySelector("#toasts").innerHTML = ""; });
    await shot("1-大廳出發", () => { const dc = window.dc; dc.setFollow(true); dc.centerOn(dc.S.player.x, dc.S.player.y, 1.3); dc.frame(); });
    await shot("2-機房特寫", () => { const dc = window.dc, rk = dc.S.tickets[0].rack, sp = dc.M.rackSpot(rk, "front"); dc.teleport(sp.x, sp.y); dc.S.tools.esd = true; dc.centerOn(sp.x, sp.y, 2.0); dc.frame(); });
    await shot("3-機房", () => { const dc = window.dc; dc.centerOn(54, 34, 0.75); dc.setFollow(false); dc.frame(); });
    await shot("4-熱圖", () => { const dc = window.dc; dc.G.makeTicket("crah", dc.M.rng(2), { crah: dc.M.halls.A.crahs[2] }); dc.simulate(25); dc.R.view.heat = true; dc.centerOn(40, 30, 0.6); dc.frame(); dc.R.view.heat = false; });
    await shot("5-整棟", () => { const dc = window.dc; dc.centerOn(150, 100, 0.105); dc.frame(); });
    await shot("6-特寫面板", () => { const dc = window.dc, t = dc.S.tickets[0], rk = t.rack, sp = dc.M.rackSpot(rk, "front"); dc.teleport(sp.x, sp.y); dc.centerOn(sp.x, sp.y, 1.6); dc.G.scan(rk, t.s); dc.interact(rk.ob, "front"); document.querySelectorAll(".unit").forEach((u) => { if (u.textContent.includes(dc.G.hostname(rk, t.s))) u.click(); }); dc.frame(); });
    await shot("7-倉庫", () => { const dc = window.dc; document.querySelector(".pclose")?.click(); const sh = dc.M.objects.find((o) => o.kind === "shelf"); dc.teleport(226, 41); dc.centerOn(228, 46, 1.1); dc.interact(sh); dc.frame(); });
  }
  await b.close();
  process.exit(allOk ? 0 : 1);
})();
