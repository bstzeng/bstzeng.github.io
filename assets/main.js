(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ========== 粒子文字 ========== */
  const canvas = document.getElementById("particles");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#00f0ff", "#ff2bd6", "#fcee0a", "#00f0ff", "#00f0ff"];
  let W = 0, H = 0, dpr = 1, particles = [];
  const mouse = { x: -9999, y: -9999, down: false };

  function sampleText(text) {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d");
    const size = Math.min(W / (text.length * 1.05), H * 0.32);
    o.fillStyle = "#fff";
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.font = `900 ${size}px "Noto Sans TC", sans-serif`;
    o.fillText(text, W / 2, H * 0.42);
    const data = o.getImageData(0, 0, W, H).data;
    const gap = Math.max(4, Math.round(size / 34));
    const pts = [];
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
      }
    }
    return { pts, gap };
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { pts, gap } = sampleText("覺得厲害");
    const old = particles;
    particles = pts.map(([tx, ty], i) => {
      const p = old[i];
      return {
        x: p ? p.x : Math.random() * W,
        y: p ? p.y : Math.random() * H,
        vx: 0, vy: 0, tx, ty,
        r: gap * 0.38 + Math.random() * gap * 0.2,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      };
    });
  }

  function explode(cx, cy) {
    for (const p of particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) + 0.01;
      const f = 18 + Math.random() * 22;
      p.vx += (dx / d) * f + (Math.random() - 0.5) * 8;
      p.vy += (dy / d) * f + (Math.random() - 0.5) * 8;
    }
  }

  let t = 0;
  function frame() {
    t++;
    ctx.fillStyle = "rgba(7,6,13,0.28)";
    ctx.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.12;
    const glitch = t % 180 < 6; // 偶爾抖一下
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      // 彈簧回到目標
      p.vx += (p.tx - p.x) * 0.012;
      p.vy += (p.ty - p.y) * 0.012;
      // 滑鼠排斥
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) + 0.01;
        const f = (1 - d / R) * 3.2;
        p.vx += (dx / d) * f; p.vy += (dy / d) * f;
      }
      p.vx *= 0.88; p.vy *= 0.88;
      p.x += p.vx; p.y += p.vy;
      const ox = glitch && Math.abs(p.ty - H * 0.42) < 12 ? (Math.random() - 0.5) * 30 : 0;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x + ox, p.y, p.r, p.r);
    }
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    mouse.x = s.clientX - r.left; mouse.y = s.clientY - r.top;
  }
  canvas.addEventListener("mousemove", pointer);
  canvas.addEventListener("touchmove", pointer, { passive: true });
  canvas.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });
  canvas.addEventListener("touchend", () => { mouse.x = mouse.y = -9999; });
  canvas.addEventListener("click", (e) => { pointer(e); explode(mouse.x, mouse.y); });

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 150); });

  const start = () => { build(); if (!reduceMotion) explode(W / 2, H / 2); frame(); };
  (document.fonts && document.fonts.load) ? document.fonts.load('900 64px "Noto Sans TC"', "覺得厲害").then(start, start) : start();

  /* ========== 終端機打字 ========== */
  const lines = [
    "> whoami",
    "  一個喜歡把點子變成畫面的人。",
    "> cat mission.txt",
    "  在這裡實驗粒子、3D、互動與各種奇怪的想法。",
    "  每張卡片都是一個主題，持續擴充中。",
    "> status",
    "  [OK] 首頁上線  [OK] 機關塔 3D 上線",
  ].join("\n");
  const typer = document.getElementById("typer");
  let typed = false;
  function type(i = 0) {
    typer.textContent = lines.slice(0, i);
    if (i < lines.length) setTimeout(() => type(i + 1), lines[i] === "\n" ? 180 : 28);
  }

  /* ========== 數字跳動 ========== */
  function countUp(el) {
    const to = +el.dataset.to, dur = 1400, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (e.target.id === "about" && !typed) {
        typed = true;
        if (reduceMotion) typer.textContent = lines; else type();
        document.querySelectorAll(".count").forEach(countUp);
      }
    }
  }, { threshold: 0.3 });
  io.observe(document.getElementById("about"));

  /* ========== 卡片 3D 傾斜 + 光暈 ========== */
  document.querySelectorAll(".card:not(.locked)").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", x * 100 + "%");
      card.style.setProperty("--my", y * 100 + "%");
      if (!reduceMotion) card.style.transform = `perspective(800px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg) translateY(-4px)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
  });
})();
