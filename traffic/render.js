// 塞車模擬器：Canvas 繪圖
import { LW } from "./engine.js";

const TAPER = 60;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.cam = { x: 0, y: 0, z: 1 };
    this.colorMode = "speed";
    this.selected = null;
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
  }
  toWorld(px, py) { return { x: (px - this.W / 2) / this.cam.z + this.cam.x, y: (py - this.H / 2) / this.cam.z + this.cam.y }; }
  fit(b, pad = 40) {
    const w = Math.max(50, b.x1 - b.x0), h = Math.max(50, b.y1 - b.y0);
    this.cam.z = Math.min((this.W - pad * 2) / w, (this.H - pad * 2) / h);
    this.cam.x = (b.x0 + b.x1) / 2; this.cam.y = (b.y0 + b.y1) / 2;
  }
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of this.net.roads) for (let i = 0; i < r.path.n; i++) {
      const x = r.path.x[i], y = r.path.y[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0: x0 - 20, y0: y0 - 20, x1: x1 + 20, y1: y1 + 20 };
  }

  /* ---------- 道路幾何（只算一次） ---------- */
  setNet(net) { this.net = net; this.build(); }

  laneW(r, L, s) {
    // 車道寬度比例（含漸變段）
    const g = r.laneSeg(L, s);
    if (!g) return 0;
    let w = 1;
    const endOut = g[1] >= r.len - 0.5 || r.outs.some((o) => o.lane === L && Math.abs(o.at - g[1]) < 1);
    if (!endOut && g[1] - s < TAPER) w = Math.min(w, Math.max(0, (g[1] - s) / TAPER));
    const startIn = g[0] < 0.5 || this.net.roads.some((q) => q.outs.some((o) => o.to === r && o.toLane === L && Math.abs(o.toS - g[0]) < 1));
    if (!startIn && s - g[0] < TAPER) w = Math.min(w, Math.max(0, (s - g[0]) / TAPER));
    return w;
  }

  build() {
    this.roadGeo = [];
    for (const r of this.net.roads) {
      if (!r.draw) continue;
      const geo = { r, asphalt: [], lines: [] };
      const step = r.len > 600 ? 4 : 2;
      for (let L = 0; L < r.lanes; L++) {
        for (const g of r.segs[L]) {
          if (g[1] - g[0] < 0.5) continue;
          const left = [], right = [];
          const n = Math.max(2, Math.ceil((g[1] - g[0]) / step));
          for (let i = 0; i <= n; i++) {
            const s = g[0] + (g[1] - g[0]) * i / n;
            const w = this.laneW(r, L, Math.min(s, g[1] - 0.01) + (i === 0 ? 0.01 : 0));
            const lat0 = r.lat(L) - LW / 2;
            const a = r.path.at(s, lat0 - 0.15), b = r.path.at(s, lat0 + LW * w + 0.15);
            left.push(a); right.push(b);
          }
          const p = new Path2D();
          p.moveTo(left[0].x, left[0].y);
          for (const q of left) p.lineTo(q.x, q.y);
          for (let i = right.length - 1; i >= 0; i--) p.lineTo(right[i].x, right[i].y);
          p.closePath();
          geo.asphalt.push(p);
        }
      }
      // 車道線
      const marks = r.name !== "路口";
      if (marks) {
        const urban = r.kind === "urban";
        for (let b = -1; b < r.lanes; b++) {
          let run = null, runType = null;
          const flush = () => {
            if (run && run.pts.length > 1) geo.lines.push(run);
            run = null; runType = null;
          };
          for (let s = 0; s <= r.len + 0.01; s += 2) {
            const ss = Math.min(s, r.len);
            const wl = b >= 0 ? this.laneW(r, b, ss) : 0;
            const wr = b + 1 < r.lanes ? this.laneW(r, b + 1, ss) : 0;
            let type = null, lat;
            if (wl > 0 && wr > 0) { type = r.noLCAt(ss) ? "solid" : "dash"; lat = r.lat(b) + LW / 2; }
            else if (wl > 0) { type = "edgeR"; lat = r.lat(b) - LW / 2 + LW * wl; }
            else if (wr > 0) { type = b === -1 ? "edgeL" : "edgeR2"; lat = r.lat(b + 1) - LW / 2; }
            if (type !== runType) {
              flush();
              if (type) {
                const color = type === "edgeL" ? (urban ? "#f5c542" : "#f5c542") : "#e9ecf2";
                run = { pts: [], color, dash: type === "dash" ? (urban ? [3, 5] : [4, 8]) : null, w: type === "dash" ? 0.15 : 0.18 };
                runType = type;
              }
            }
            if (run) { const p = r.path.at(ss, lat); run.pts.push(p); }
          }
          flush();
        }
      }
      for (const ln of geo.lines) {
        const p = new Path2D();
        p.moveTo(ln.pts[0].x, ln.pts[0].y);
        for (const q of ln.pts) p.lineTo(q.x, q.y);
        ln.path = p;
      }
      this.roadGeo.push(geo);
    }
  }

  /* ---------- 繪製 ---------- */
  draw(sim, ui = {}) {
    const ctx = this.ctx, { z } = this.cam, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0c1018";
    ctx.fillRect(0, 0, this.W, this.H);
    const T = (a = 1) => ctx.setTransform(dpr * z * a, 0, 0, dpr * z * a, dpr * (this.W / 2 - this.cam.x * z), dpr * (this.H / 2 - this.cam.y * z));
    T();
    const px = 1 / z; // 一個像素是幾公尺

    this.drawGrid(ctx, px);
    for (const d of this.net.deco) if (d.type === "street" || d.type === "shoulderline" || d.type === "parking") this.drawDeco(ctx, d, sim, px, true);

    // 柏油
    ctx.fillStyle = "#363c47";
    ctx.strokeStyle = "#363c47";
    ctx.lineWidth = 0.3;
    for (const g of this.roadGeo) for (const p of g.asphalt) { ctx.fill(p); ctx.stroke(p); }
    // 車道線
    for (const g of this.roadGeo) for (const ln of g.lines) {
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = Math.max(ln.w, px * 0.8);
      ctx.setLineDash(ln.dash || []);
      ctx.stroke(ln.path);
    }
    ctx.setLineDash([]);

    this.drawSignals(ctx, sim, px);
    for (const r of this.net.roads) for (const b of r.blocks) if (b.on) this.drawBlock(ctx, r, b, px);
    for (const d of this.net.deco) if (!["street", "shoulderline", "parking", "tunnel", "fog", "bridge"].includes(d.type)) this.drawDeco(ctx, d, sim, px);

    // 車輛
    for (const v of sim.vs) this.drawVehicle(ctx, sim, v, px);

    for (const d of this.net.deco) if (["tunnel", "fog", "bridge"].includes(d.type)) this.drawDeco(ctx, d, sim, px);

    this.drawLabels(ctx, sim, px);

    // 選取的車
    if (this.selected && sim.vs.includes(this.selected)) {
      const p = sim.pose(this.selected);
      ctx.strokeStyle = "#ff2bd6";
      ctx.lineWidth = 2.5 * px;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(this.selected.len * 0.8, 10 * px), 0, Math.PI * 2); ctx.stroke();
    }
  }

  drawGrid(ctx, px) {
    const step = px > 2 ? 500 : px > 0.6 ? 100 : 50;
    const tl = this.toWorld(0, 0), br = this.toWorld(this.W, this.H);
    ctx.strokeStyle = "rgba(0,240,255,0.05)";
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let x = Math.floor(tl.x / step) * step; x < br.x; x += step) { ctx.moveTo(x, tl.y); ctx.lineTo(x, br.y); }
    for (let y = Math.floor(tl.y / step) * step; y < br.y; y += step) { ctx.moveTo(tl.x, y); ctx.lineTo(br.x, y); }
    ctx.stroke();
  }

  drawSignals(ctx, sim, px) {
    for (const r of this.net.roads) {
      if (r.laneSignal) {
        for (let L = 0; L < r.lanes; L++) {
          const ls = r.laneSignal[L];
          if (!ls || !r.laneSeg(L, r.len - 0.5)) continue;
          const st = ls.sig.state(ls.group, sim.t);
          const a = r.path.at(r.len - 0.3, r.lat(L) - LW / 2 + 0.2), b = r.path.at(r.len - 0.3, r.lat(L) + LW / 2 - 0.2);
          ctx.strokeStyle = st === "G" ? "#2bff88" : st === "Y" ? "#ffd23f" : "#ff3b4e";
          ctx.lineWidth = Math.max(0.9, 3 * px);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (r.yieldEnd) {
        const a = r.path.at(r.len - 1, r.lat(0) - LW / 2), b = r.path.at(r.len - 1, r.lat(r.lanes - 1) + LW / 2);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.3, px); ctx.setLineDash([0.8, 0.8]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (r.gate) {
        const open = sim.t >= r.gate.next;
        const a = r.path.at(r.len - 0.5, -2), b = r.path.at(r.len - 0.5, open ? -1 : 2);
        ctx.strokeStyle = open ? "#2bff88" : "#ff3b4e"; ctx.lineWidth = Math.max(0.4, 2 * px);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  rect(ctx, x, y, h, len, wid, color) {
    const c = Math.cos(h), s = Math.sin(h);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(h);
    ctx.fillStyle = color;
    ctx.fillRect(-len / 2, -wid / 2, len, wid);
    ctx.restore();
    return { c, s };
  }

  drawBlock(ctx, r, b, px) {
    const mid = (b.s0 + b.s1) / 2, lat = r.lat(b.lane);
    const p = r.path.at(Math.min(mid, r.len), lat);
    const cone = (s, l) => {
      const q = r.path.at(Math.min(s, r.len), l);
      ctx.fillStyle = "#ff8a00";
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.35, 2 * px), 0, Math.PI * 2); ctx.fill();
    };
    if (b.kind === "crash") {
      this.rect(ctx, p.x, p.y, p.h + 0.5, 4.6, 1.8, "#d14");
      const q = r.path.at(Math.min(mid + 6, r.len), lat + 0.4);
      this.rect(ctx, q.x, q.y, q.h - 0.7, 4.6, 1.8, "#888");
      for (let s = b.s0 - 25; s < b.s0; s += 5) cone(s, lat + (b.s0 - s) / 25 * 1.2 - 0.6);
      this.flash(ctx, p, px);
    } else if (b.kind === "work") {
      const n = Math.ceil((b.s1 - b.s0) / 6);
      for (let i = 0; i <= n; i++) {
        const s = b.s0 + i * 6, q = r.path.at(Math.min(s, r.len), lat);
        this.rect(ctx, q.x, q.y, q.h, 3, 2.6, i % 2 ? "#ff8a00" : "#f2f2f2");
      }
      for (let s = b.s0 - 40; s < b.s0; s += 5) cone(s, lat + LW / 2 - (s - b.s0 + 40) / 40 * LW * 0.9);
    } else if (b.kind === "mwork") {
      const q = r.path.at(Math.min(b.s1 - 4, r.len), lat);
      this.rect(ctx, q.x, q.y, q.h, 7, 2.4, "#ffd23f");
      const q2 = r.path.at(Math.min(b.s0 + 3, r.len), lat);
      this.rect(ctx, q2.x, q2.y, q2.h, 4, 2.4, "#ff8a00");
      this.flash(ctx, q2, px);
      for (let s = b.s0 - 30; s < b.s0; s += 6) cone(s, lat);
    } else if (b.kind === "park") {
      this.rect(ctx, p.x, p.y, p.h, 4.6, 1.8, "#8a8f99");
      this.rect(ctx, r.path.at(b.s1 - 2, lat).x, r.path.at(b.s1 - 2, lat).y, p.h, 1.2, 1.6, "#5a5f69");
    } else if (b.kind === "truck") {
      const q = r.path.at(Math.min(b.s1 - 6, r.len), lat);
      this.rect(ctx, q.x, q.y, q.h, 12, 2.5, "#9aa0aa");
      const c = r.path.at(Math.min(b.s1 - 1, r.len), lat);
      this.rect(ctx, c.x, c.y, c.h, 2.4, 2.4, "#5a6170");
      this.flash(ctx, q, px);
      const tri = r.path.at(Math.max(0, b.s0 - 30), lat);
      ctx.fillStyle = "#ff3b4e";
      ctx.beginPath(); ctx.arc(tri.x, tri.y, Math.max(0.5, 2 * px), 0, Math.PI * 2); ctx.fill();
    }
  }

  flash(ctx, p, px) {
    if (Math.floor(performance.now() / 400) % 2) return;
    ctx.fillStyle = "rgba(255,59,78,.35)";
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(6, 10 * px), 0, Math.PI * 2); ctx.fill();
  }

  band(ctx, r, s0, s1, lat0, lat1) {
    ctx.beginPath();
    const n = Math.max(2, Math.ceil((s1 - s0) / 5));
    for (let i = 0; i <= n; i++) { const p = r.path.at(s0 + (s1 - s0) * i / n, lat0); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    for (let i = n; i >= 0; i--) { const p = r.path.at(s0 + (s1 - s0) * i / n, lat1); ctx.lineTo(p.x, p.y); }
    ctx.closePath();
  }

  label(ctx, text, x, y, px, o = {}) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sx = (x - this.cam.x) * this.cam.z + this.W / 2, sy = (y - this.cam.y) * this.cam.z + this.H / 2;
    if (sx < -200 || sx > this.W + 200 || sy < -50 || sy > this.H + 50) { ctx.restore(); return; }
    ctx.font = `${o.bold ? 700 : 500} ${o.size || 12}px "Noto Sans TC", sans-serif`;
    ctx.textAlign = o.align || "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width;
    if (o.bg !== false) {
      ctx.fillStyle = o.bg || "rgba(7,6,13,.75)";
      const x0 = o.align === "left" ? sx - 4 : o.align === "right" ? sx - w - 4 : sx - w / 2 - 4;
      ctx.fillRect(x0, sy - 9, w + 8, 18);
    }
    ctx.fillStyle = o.color || "#e8e6f5";
    ctx.fillText(text, sx, sy);
    ctx.restore();
  }

  drawDeco(ctx, d, sim, px) {
    if (d.type === "tunnel") {
      const r = d.road;
      ctx.fillStyle = "rgba(8,8,14,.62)";
      this.band(ctx, r, d.s0, d.s1, -2.5, r.lat(r.lanes - 1) + LW / 2 + 2.5); ctx.fill();
      ctx.strokeStyle = "#8b86a8"; ctx.lineWidth = Math.max(0.6, 2 * px); ctx.stroke();
      for (const s of [d.s0, d.s1]) {
        ctx.fillStyle = "#5c5873";
        this.band(ctx, r, s - 3, s + 3, -4, r.lat(r.lanes - 1) + LW / 2 + 4); ctx.fill();
      }
      const p = r.path.at((d.s0 + d.s1) / 2, -10);
      this.label(ctx, "隧道（禁止變換車道）", p.x, p.y, px, { color: "#c9c4e6" });
    } else if (d.type === "fog") {
      if (d.zone && d.zone.on === false) return;
      const r = d.road;
      const g = ctx.createLinearGradient(r.path.at(d.s0).x, 0, r.path.at(d.s1).x, 0);
      g.addColorStop(0, "rgba(220,225,235,0)"); g.addColorStop(0.12, "rgba(220,225,235,.55)");
      g.addColorStop(0.88, "rgba(220,225,235,.55)"); g.addColorStop(1, "rgba(220,225,235,0)");
      ctx.fillStyle = g;
      this.band(ctx, r, d.s0, d.s1, -25, r.lat(r.lanes - 1) + 25); ctx.fill();
      const p = r.path.at((d.s0 + d.s1) / 2, -32);
      this.label(ctx, "🌫 濃霧區", p.x, p.y, px);
    } else if (d.type === "grade") {
      const r = d.road;
      ctx.fillStyle = "rgba(255,138,0,.10)";
      this.band(ctx, r, d.s0, d.s1, -6, r.lat(r.lanes) + 6); ctx.fill();
      const p = r.path.at(d.s0 + 60, -12);
      this.label(ctx, "⛰ " + d.text, p.x, p.y, px, { color: "#ffb35c" });
    } else if (d.type === "crash") {
      const p = d.road.path.at(d.s, d.lat + 1);
      this.rect(ctx, p.x, p.y, p.h + 0.4, 4.6, 1.8, "#d14");
      const q = d.road.path.at(d.s + 7, d.lat + 1.3);
      this.rect(ctx, q.x, q.y, q.h - 0.3, 4.6, 1.8, "#aaa");
      this.flash(ctx, p, px);
      const l = d.road.path.at(d.s, d.lat + 12);
      this.label(ctx, "🚨 路肩事故", l.x, l.y, px);
    } else if (d.type === "bridge") {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(d.x - d.w / 2 + 3, d.y0, d.w, d.y1 - d.y0);
      ctx.fillStyle = "#454b57";
      ctx.fillRect(d.x - d.w / 2, d.y0, d.w, d.y1 - d.y0);
      ctx.strokeStyle = "#f5c542"; ctx.lineWidth = Math.max(0.2, px);
      ctx.beginPath(); ctx.moveTo(d.x, d.y0); ctx.lineTo(d.x, d.y1); ctx.stroke();
      ctx.strokeStyle = "#aab"; ctx.lineWidth = Math.max(0.5, 1.5 * px);
      ctx.strokeRect(d.x - d.w / 2, d.y0, d.w, d.y1 - d.y0);
      this.label(ctx, "跨越橋（地方道路）", d.x, d.y0 + 20, px);
    } else if (d.type === "street") {
      ctx.fillStyle = "#2c313a";
      ctx.fillRect(d.x - d.w / 2, d.y0, d.w, d.y1 - d.y0);
      ctx.strokeStyle = "#f5c542"; ctx.lineWidth = Math.max(0.2, px);
      ctx.beginPath(); ctx.moveTo(d.x, d.y0); ctx.lineTo(d.x, d.y1); ctx.stroke();
    } else if (d.type === "parking") {
      ctx.fillStyle = "#2c313a"; ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = "#e9ecf2"; ctx.lineWidth = Math.max(0.15, px * 0.8);
      for (let x = d.x + 3; x < d.x + d.w; x += 3) { ctx.beginPath(); ctx.moveTo(x, d.y); ctx.lineTo(x, d.y + 6); ctx.moveTo(x, d.y + d.h); ctx.lineTo(x, d.y + d.h - 6); ctx.stroke(); }
      for (let i = 0; i < 40; i++) {
        const cx = d.x + 1.5 + (i % 20) * 3 + 0.5, cy = i < 20 ? d.y + 2.5 : d.y + d.h - 2.5;
        ctx.fillStyle = `hsl(${(i * 47) % 360} 45% 55%)`; ctx.fillRect(cx - 0.8, cy - 2, 1.6, 4);
      }
      this.label(ctx, "🅿 景點停車場（客滿）", d.x + d.w / 2, d.y - 8, px);
    } else if (d.type === "busstop") {
      const p = d.road.path.at(d.s, d.road.lat(d.road.lanes - 1) + LW / 2 + 1.2);
      ctx.fillStyle = "#4aa3ff"; ctx.fillRect(p.x - 6, p.y - 0.6, 12, 1.2);
      const l = d.road.path.at(d.s, d.road.lat(d.road.lanes - 1) + 9);
      this.label(ctx, "🚏 公車站", l.x, l.y, px);
    } else if (d.type === "sign") {
      const p = d.road.path.at(d.s, d.road.lat(d.road.lanes - 1) + LW / 2 + 4);
      ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const sx = (p.x - this.cam.x) * this.cam.z + this.W / 2, sy = (p.y - this.cam.y) * this.cam.z + this.H / 2;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#e0202e"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy + 8, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.font = "700 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.text, sx, sy + 8.5);
      ctx.restore();
    } else if (d.type === "shoulderline") {
      const r = d.road;
      ctx.fillStyle = "#2a2f37";
      this.band(ctx, r, d.s0, d.s1, r.lat(3) - LW / 2, r.lat(3) + LW / 2); ctx.fill();
    }
  }

  drawLabels(ctx, sim, px) {
    for (const r of this.net.roads) {
      if (r.src) {
        const p = r.path.at(Math.min(30, r.len / 2), r.lat(r.lanes - 1) + LW / 2 + 9);
        const q = r.src.queue > 0 ? `（排隊 ${r.src.queue}）` : "";
        this.label(ctx, `▶ ${r.src.name} ${r.src.flow} 輛/時${q}`, p.x, p.y, px, { color: r.src.queue > 3 ? "#ff8a9a" : "#9ff7ff", align: "left" });
      }
    }
  }

  vColor(v) {
    if (this.colorMode === "type") {
      if (v.type === "truck") return "#ff9f1c";
      if (v.type === "bus") return "#4aa3ff";
      return `hsl(${v.hue} 55% 68%)`;
    }
    const ref = Math.max(8, Math.min(v.road.vmax, v.vff || v.road.vmax));
    const k = Math.max(0, Math.min(1, v.v / ref));
    return `hsl(${Math.round(k * 125)} 85% ${55 - (1 - k) * 5}%)`;
  }

  drawVehicle(ctx, sim, v, px) {
    const p = sim.pose(v);
    const minL = 3 * px;
    const len = Math.max(v.len, minL), wid = Math.max(v.wid, minL * 0.5);
    const c = Math.cos(p.h), s = Math.sin(p.h), z = this.cam.z, d = this.dpr;
    ctx.setTransform(d * z * c, d * z * s, -d * z * s, d * z * c, d * ((p.x - this.cam.x) * z + this.W / 2), d * ((p.y - this.cam.y) * z + this.H / 2));
    ctx.fillStyle = this.vColor(v);
    ctx.fillRect(-len / 2, -wid / 2, len, wid);
    if (z > 1.5) {
      if (v.type === "car") {
        ctx.fillStyle = "rgba(10,14,22,.75)";
        ctx.fillRect(len / 2 - 1.7, -wid / 2 + 0.2, 0.75, wid - 0.4);
        ctx.fillRect(-len / 2 + 0.4, -wid / 2 + 0.25, 0.5, wid - 0.5);
      } else {
        ctx.fillStyle = v.type === "bus" ? "rgba(10,14,22,.55)" : "rgba(255,255,255,.35)";
        if (v.type === "bus") { ctx.fillRect(-len / 2 + 0.6, -wid / 2 + 0.2, len - 1.2, 0.35); ctx.fillRect(-len / 2 + 0.6, wid / 2 - 0.55, len - 1.2, 0.35); }
        else ctx.fillRect(len / 2 - 2.4, -wid / 2, 0.25, wid);
      }
      if (v.acc < -1.2) {
        ctx.fillStyle = "#ff2030";
        ctx.fillRect(-len / 2 - 0.15, -wid / 2 + 0.1, 0.35, 0.45);
        ctx.fillRect(-len / 2 - 0.15, wid / 2 - 0.55, 0.35, 0.45);
      }
      if (v.lcFrom >= 0 && Math.floor(performance.now() / 300) % 2) {
        const right = v.lane > v.lcFrom ? 1 : -1;
        ctx.fillStyle = "#ffb000";
        ctx.fillRect(len / 2 - 0.5, right * wid / 2 - 0.25, 0.5, 0.5);
        ctx.fillRect(-len / 2, right * wid / 2 - 0.25, 0.5, 0.5);
      }
    }
    ctx.setTransform(d * z, 0, 0, d * z, d * (this.W / 2 - this.cam.x * z), d * (this.H / 2 - this.cam.y * z));
  }

  pick(sim, px, py) {
    const w = this.toWorld(px, py);
    let best = null, bd = Math.max(8, 14 / this.cam.z);
    for (const v of sim.vs) {
      const p = sim.pose(v);
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}

/* ---------- 圖表 ---------- */
export function drawSeries(cv, series) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const L = 34, R = 34, Tp = 10, B = 18;
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1;
  ctx.font = "10px sans-serif"; ctx.fillStyle = "#8b86a8";
  for (let i = 0; i <= 4; i++) {
    const y = Tp + (H - Tp - B) * i / 4;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
  }
  if (series.length < 2) { ctx.fillText("模擬開始後顯示…", L + 6, H / 2); return; }
  const t0 = series[0].t, t1 = series[series.length - 1].t;
  const maxF = Math.max(1000, ...series.map((p) => p.flow)) * 1.1;
  const X = (t) => L + (W - L - R) * (t - t0) / Math.max(1, t1 - t0);
  const line = (key, max, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    series.forEach((p, i) => { const y = Tp + (H - Tp - B) * (1 - p[key] / max); i ? ctx.lineTo(X(p.t), y) : ctx.moveTo(X(p.t), y); });
    ctx.stroke();
  };
  line("flow", maxF, "#ff2bd6");
  line("speed", 120, "#00f0ff");
  ctx.fillStyle = "#00f0ff"; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) ctx.fillText(String(120 - i * 30), L - 4, Tp + (H - Tp - B) * i / 4 + 3);
  ctx.fillStyle = "#ff2bd6"; ctx.textAlign = "left";
  for (let i = 0; i <= 4; i++) ctx.fillText(String(Math.round(maxF * (1 - i / 4) / 100) * 100), W - R + 4, Tp + (H - Tp - B) * i / 4 + 3);
  ctx.fillStyle = "#8b86a8"; ctx.textAlign = "center";
  const fmt = (t) => `${Math.floor(t / 60)}分`;
  ctx.fillText(fmt(t0), L + 12, H - 4); ctx.fillText(fmt(t1), W - R - 12, H - 4);
}

export function speedColor(kmh) {
  if (kmh < 0) return null;
  const k = Math.max(0, Math.min(1, kmh / 100));
  return `hsl(${Math.round(k * 125)} 85% ${45 + k * 10}%)`;
}

export function drawHeat(cv, heat, mainLen) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#07060d"; ctx.fillRect(0, 0, W, H);
  if (!heat.length) { ctx.fillStyle = "#8b86a8"; ctx.font = "11px sans-serif"; ctx.fillText("模擬開始後顯示…", 8, H / 2); return; }
  const L = 30, B = 14;
  const cols = heat.length, nb = heat[0].length;
  const cw = (W - L) / Math.max(cols, 60), bh = (H - B) / nb;
  for (let c = 0; c < cols; c++) {
    const col = heat[c];
    for (let i = 0; i < nb; i++) {
      const col2 = speedColor(col[i]);
      if (!col2) continue;
      ctx.fillStyle = col2;
      ctx.fillRect(L + c * cw, H - B - (i + 1) * bh, Math.ceil(cw), Math.ceil(bh));
    }
  }
  ctx.fillStyle = "#8b86a8"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`${(mainLen / 1000).toFixed(1)}km`, L - 3, 10);
  ctx.fillText("0", L - 3, H - B);
  ctx.textAlign = "left"; ctx.fillText("← 時間（最近 40 分鐘）→", L + 4, H - 2);
}
