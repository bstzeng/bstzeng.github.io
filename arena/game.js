// 星域戰陣 — 介面與主迴圈
import { FACTIONS, UNITS, KITS, CARDS, MAX_STAGE, STAR_MUL, TIER_STAGE } from './data.js';
import * as L from './logic.js';
import { drawShape, drawUnit, makeBackground, drawGrid, drawZones, FX } from './render.js';

const $ = (id) => document.getElementById(id);
const KEY = 'starArenaV1';
const { W, H, CELL, COLS, ROWS, P_TOP } = L;

let save = null;
let phase = 'title';      // title | prep | battle | end
let S = null;             // 目前的戰鬥（備戰時是預覽，不會推進）
let enemy = null, bg = null, bgStage = 0;
let sel = null;           // 選取中的單位：{ u }（自己的）或 { def, star, foe }（敵人 / 商店）
let drag = null, hover = null;
let tab = 'bench', speed = 1, endT = 0;
const fx = new FX();

// ── 存檔 ──
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1 && FACTIONS[s.faction]) return s; } catch (e) { /* 無痕模式等情況 */ } return null; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 存不了就算了 */ } }

// ── 單位小圖示 ──
const iconCache = {};
function icon(type) {
  if (iconCache[type]) return iconCache[type];
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const c = cv.getContext('2d'), d = UNITS[type];
  c.translate(48, 50); c.rotate(-Math.PI / 2);
  drawShape(c, type, Math.min(30, 16 + d.r * 0.75), 0.4, 0, false);
  return (iconCache[type] = cv.toDataURL());
}

// ── 畫布尺寸 ──
const cv = $('cv'), ctx = cv.getContext('2d');
let scale = 1;
function resize() {
  const f = $('field'), fw = f.clientWidth, fh = f.clientHeight;
  const s = Math.min(fw / W, fh / H), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
  scale = s * dpr;
}
window.addEventListener('resize', resize);
function toField(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
function cellAt(x, y) {
  const c = Math.floor(x / CELL), r = Math.floor((y - P_TOP) / CELL);
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? [c, r] : null;
}
const unitAtCell = (c, r) => save.roster.find((u) => u.cell && u.cell[0] === c && u.cell[1] === r);

// ── 小工具 ──
let toastT = 0;
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
function bump(id) { const e = $(id).parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

// ── 擺陣 ──
function autoPlace(u) {
  const d = UNITS[u.type];
  if (L.usedSupply(save) + d.sup > L.supplyCap(save)) return false;
  const rows = d.range < 50 ? [0, 1, 2, 3] : d.atk === 'heal' ? [1, 2, 3, 0] : [2, 3, 1, 0];
  for (const r of rows) for (const c of [3, 4, 2, 5, 1, 6, 0, 7]) if (!unitAtCell(c, r)) { u.cell = [c, r]; return true; }
  return false;
}
function placeAt(u, cell) {
  const occ = unitAtCell(cell[0], cell[1]);
  if (occ === u) return;
  const cap = L.supplyCap(save), used = L.usedSupply(save), d = UNITS[u.type];
  if (u.cell) { if (occ) occ.cell = u.cell; u.cell = cell; }               // 場上互換 / 移動
  else {
    const after = used + d.sup - (occ ? UNITS[occ.type].sup : 0);
    if (after > cap) { toast(`人口不足（${after}/${cap}）`); return; }
    if (occ) occ.cell = null;
    u.cell = cell;
  }
  refresh();
}
function toBench(u) { u.cell = null; refresh(); }
// 一鍵佈陣：全部收回後，從最值錢的單位開始往人口上限內塞
function autoDeploy() {
  for (const u of save.roster) u.cell = null;
  const val = (u) => UNITS[u.type].cost * Math.pow(3, u.star - 1) / UNITS[u.type].sup;
  for (const u of [...save.roster].sort((a, b) => val(b) - val(a))) autoPlace(u);
  sel = null; refresh(); toast('已自動佈陣');
}

function buy(type) {
  const d = UNITS[type];
  if (!L.unlocked(d, save.stage)) return toast(`第 ${TIER_STAGE[d.tier]} 關解鎖`);
  if (save.gold < d.cost) return toast('金幣不足');
  save.gold -= d.cost;
  const u = L.addUnit(save, type);
  if (L.mergeRoster(save.roster)) {
    const m = save.roster.filter((x) => x.type === type).sort((a, b) => b.star - a.star)[0];
    toast(`合成升星！${d.name} ${'★'.repeat(m.star)}`); sel = { u: m };
    if (!m.cell) autoPlace(m);
  } else { autoPlace(u); sel = { u }; }
  bump('gold'); refresh();
}
function sell(u) {
  save.gold += L.sellValue(u);
  save.roster.splice(save.roster.indexOf(u), 1);
  sel = null; bump('gold'); refresh();
}
function buyCap() {
  const p = L.capPrice(save);
  if (save.gold < p) return toast('金幣不足');
  save.gold -= p; save.capBought++; bump('sup'); refresh();
}

// ── 介面更新 ──
function refresh() {
  persist();
  S = L.createBattle(save.roster, save.ups, save.stage, enemy);
  const cap = L.supplyCap(save), used = L.usedSupply(save);
  $('gold').textContent = save.gold;
  $('sup').textContent = `${used}/${cap}`;
  $('supBox').classList.toggle('full', used >= cap);
  $('stageNo').textContent = `STAGE ${String(save.stage).padStart(2, "0")}/${MAX_STAGE}`;
  const sub = $('stageSub');
  sub.textContent = enemy.boss ? `⚠ 首領：${enemy.list[0].variant ? '狂化·' : ''}${UNITS[enemy.list[0].type].name}` : `敵軍：${FACTIONS[enemy.fac].name} × ${enemy.list.length}`;
  sub.classList.toggle('boss', enemy.boss);
  $('bGo').disabled = used === 0;
  if (sel && sel.u && !save.roster.includes(sel.u)) sel = null;
  renderInfo(); renderPane();
}

function statLine(d, star, boss) {
  const m = STAR_MUL[star - 1];
  const parts = [`HP ${Math.round(d.hp * m)}`];
  if (d.sh) parts.push(`盾 ${Math.round(d.sh * m)}`);
  if (d.atk !== 'heal') parts.push(`攻 ${Math.round(d.dmg * m)}`); else parts.push(`治療 ${Math.round(d.dmg * m)}`);
  parts.push(d.range > 50 ? `射程 ${d.range}` : '近戰', `甲 ${d.armor + star - 1}`);
  return parts.join(' · ');
}
function renderInfo() {
  const el = $('info');
  if (phase === 'battle') {
    const a = S.units.filter((u) => u.team === 0).length, b = S.units.filter((u) => u.team === 1).length;
    el.innerHTML = `<div class="txt"><b>交戰中</b><span class="st">我軍 ${a} ／ 敵軍 ${b}</span><br>全軍自動向前衝鋒，技能冷卻完畢會自動施放。</div>`;
    return;
  }
  if (!sel) { el.innerHTML = '<div class="txt">拖曳單位到下方格子擺陣 · 點選單位查看能力 · 到「兵營」花金幣擴軍<br>三個相同單位自動合成升星；全軍開戰後一律向前衝鋒。</div>'; return; }
  const d = sel.u ? UNITS[sel.u.type] : sel.def, star = sel.u ? sel.u.star : sel.star;
  let acts = '';
  if (sel.u) acts = `<div class="acts">${sel.u.cell ? '<button class="mini" data-act="bench">收回</button>' : '<button class="mini" data-act="field">上場</button>'}<button class="mini sell" data-act="sell">賣出 +${L.sellValue(sel.u)}</button></div>`;
  else if (sel.shop) acts = `<div class="acts"><button class="mini sell" data-act="buy">購買 ◎${d.cost}</button></div>`;
  el.innerHTML = `<div class="txt"><b>${sel.foe ? '敵 · ' : ''}${esc(d.name)} ${'★'.repeat(star)}</b><span class="st">${statLine(d, star, sel.boss)} · 人口 ${d.sup}</span><br>${d.skill ? `<em>${esc(d.skill.name)}</em>：${esc(d.skill.desc)}` : ''}</div>${acts}`;
}
$('info').addEventListener('click', (e) => {
  const a = e.target.dataset.act;
  if (!a || !sel) return;
  if (a === 'bench') toBench(sel.u);
  else if (a === 'field') { if (!autoPlace(sel.u)) toast('人口不足或沒有空格'); refresh(); }
  else if (a === 'sell') sell(sel.u);
  else if (a === 'buy') buy(sel.def.id);
});

function tileHTML(d, o = {}) {
  return `<div class="tile ${o.cls || ''}" ${o.attr || ''}>
    ${o.cost !== undefined ? `<span class="cost">◎${o.cost}</span>` : ''}<span class="sp">▲${d.sup}</span>
    <img src="${icon(d.id)}" alt="">${o.star > 1 ? `<span class="star">${'★'.repeat(o.star)}</span>` : ''}${o.q ? '<button class="q" data-q="1">?</button>' : ''}
    <span class="nm">${esc(o.label || d.name)}</span></div>`;
}
function renderPane() {
  const p = $('pane');
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  p.className = 'pane' + (tab === 'tech' ? ' list' : '');
  if (tab === 'bench') {
    const bench = save.roster.filter((u) => !u.cell);
    p.innerHTML = bench.length ? bench.map((u) => tileHTML(UNITS[u.type], { star: u.star, cls: sel && sel.u === u ? 'sel' : '', attr: `data-uid="${u.uid}"` })).join('')
      : '<p class="empty">待命區是空的。到「兵營」買兵，或把場上的單位拖下來。</p>';
  } else if (tab === 'shop') {
    const list = Object.values(UNITS).filter((d) => d.fac === save.faction && d.tier < 9).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
    p.innerHTML = list.map((d) => {
      const ok = L.unlocked(d, save.stage);
      return tileHTML(d, { cost: d.cost, q: true, cls: (ok ? '' : 'lock ') + (save.gold < d.cost ? 'poor' : ''), attr: `data-buy="${d.id}"`, label: ok ? d.name : `第${TIER_STAGE[d.tier]}關解鎖` });
    }).join('') + `<div class="tile ${save.gold < L.capPrice(save) ? 'poor' : ''}" data-cap="1"><span class="cost">◎${L.capPrice(save)}</span><span style="font-size:1.6rem;margin-top:14px;color:var(--ok)">▲+1</span><span class="nm">擴充人口</span></div>`;
  } else {
    const own = CARDS.filter((c) => save.ups[c.id]);
    p.innerHTML = own.length ? own.map((c) => `<div class="trow"><i>${c.icon}</i><b>${esc(c.name)}</b><span>${esc(c.desc)}</span><em>${c.max > 1 ? 'Lv.' + save.ups[c.id] : '✓'}</em></div>`).join('')
      : '<p class="empty">還沒有永久升級。每過一關可以三選一。</p>';
  }
}
$('tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) { tab = e.target.dataset.tab; renderPane(); } });
$('pane').addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (!t || phase !== 'prep') return;
  if (t.dataset.cap) return buyCap();
  if (t.dataset.buy) {
    if (e.target.dataset.q) { sel = { def: UNITS[t.dataset.buy], star: 1, shop: true }; renderInfo(); }
    else buy(t.dataset.buy);
  }
});

// ── 拖曳（待命區 → 戰場、戰場內移動、戰場 → 待命區）──
const ghost = $('ghost');
function startDrag(u, e) {
  drag = { u, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
  sel = { u }; renderInfo(); renderPane();
}
$('pane').addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-uid]');
  if (!t || phase !== 'prep') return;
  const u = save.roster.find((x) => x.uid === +t.dataset.uid);
  if (u) { e.preventDefault(); startDrag(u, e); }
});
cv.addEventListener('pointerdown', (e) => {
  if (phase !== 'prep') return;
  const [x, y] = toField(e), cell = cellAt(x, y);
  if (cell) {
    const u = unitAtCell(cell[0], cell[1]);
    if (u) return startDrag(u, e);
    if (sel && sel.u && !sel.u.cell) return placeAt(sel.u, cell);                 // 先點待命區單位、再點空格
    sel = null; renderInfo(); renderPane(); return;
  }
  // 點敵人看情報
  const foe = S.units.find((m) => m.team === 1 && Math.hypot(m.x - x, m.y - y) < m.r + 10);
  sel = foe ? { def: foe.def, star: foe.star, foe: true, boss: foe.boss } : null;
  renderInfo(); renderPane();
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { drag.moved = true; ghost.src = icon(drag.u.type); ghost.hidden = false; }
  if (!drag.moved) return;
  ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
  const [x, y] = toField(e); hover = cellAt(x, y);
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; ghost.hidden = true;
  if (d.moved && e.type !== 'pointercancel') {
    const [x, y] = toField(e), cell = cellAt(x, y);
    if (cell) placeAt(d.u, cell);
    else if (d.u.cell && (y > H || y < P_TOP - 30 || x < 0 || x > W)) toBench(d.u);
  }
  hover = null;
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// ── 流程 ──
function enterPrep() {
  phase = 'prep';
  enemy = L.genEnemy(save.stage);
  if (bgStage !== Math.ceil(save.stage / 10)) { bg = makeBackground(save.stage); bgStage = Math.ceil(save.stage / 10); }
  fx.clear(); sel = null;
  $('cmd').classList.remove('battle'); $('bGo').hidden = false; $('bAuto').hidden = false; $('bSpd').hidden = true;
  for (const id of ['ovStart', 'ovEnd', 'ovMenu']) $(id).hidden = true;
  resize(); refresh();
  if (save.pending) showWin();
}
$('bGo').addEventListener('click', () => {
  if (phase !== 'prep' || L.usedSupply(save) === 0) return;
  S = L.createBattle(save.roster, save.ups, save.stage, enemy);
  phase = 'battle'; sel = null; drag = null; ghost.hidden = true; fx.clear();
  $('cmd').classList.add('battle'); $('bGo').hidden = true; $('bAuto').hidden = true; $('bSpd').hidden = false;
  resize(); renderInfo();
});
$('bAuto').addEventListener('click', () => { if (phase === 'prep') autoDeploy(); });
$('bSpd').addEventListener('click', () => { speed = speed % 3 + 1; $('bSpd').textContent = `▶ x${speed}`; });

function finishBattle() {
  phase = 'end';
  if (S.winner === 0) {
    const gold = L.stageGold(save.stage, save.ups);
    save.gold += gold;
    save.pending = { gold, cards: L.rollCards(save).map((c) => c.id) };
    persist(); showWin();
  } else {
    save.gold += 2; persist();
    $('endBody').innerHTML = `<h2 class="lose">任務失敗</h2><p class="lead">第 ${save.stage} 關的敵軍守住了陣線。<br>獲得補給 <em>◎2</em>，調整陣型或擴軍後再戰。</p><button class="btn" id="bRetry">重新整備</button>`;
    $('ovEnd').hidden = false;
    $('bRetry').onclick = enterPrep;
  }
}
function showWin() {
  const pd = save.pending, cards = pd.cards.map((id) => CARDS.find((c) => c.id === id)).filter(Boolean);
  const last = save.stage >= MAX_STAGE;
  $('endBody').innerHTML = `<h2 class="win">第 ${save.stage} 關 突破！</h2><p class="lead">戰利品 <em>◎${pd.gold}</em>　${cards.length ? '選擇一項永久升級：' : ''}</p>
    <div class="pick">${cards.map((c) => `<button class="opt" data-card="${c.id}" style="--c:${c.fac ? FACTIONS[c.fac].color : '#6fd3ff'}"><span class="ic">${c.icon}</span><span><b>${esc(c.name)}${c.fac ? '<small>陣營專屬</small>' : c.max > 1 ? `<small>LV ${(save.ups[c.id] || 0) + 1}/${c.max}</small>` : ''}</b><span>${esc(c.desc)}</span></span></button>`).join('')}</div>
    ${cards.length ? '' : `<button class="btn" data-card="">繼續</button>`}`;
  $('ovEnd').hidden = false;
  $('endBody').onclick = (e) => {
    const b = e.target.closest('[data-card]');
    if (!b) return;
    const id = b.dataset.card;
    if (id) save.ups[id] = (save.ups[id] || 0) + 1;
    delete save.pending;
    $('endBody').onclick = null;
    if (last) { save.cleared = true; persist(); return showClear(); }
    save.stage++; enterPrep();
  };
}
function showClear() {
  $('endBody').innerHTML = `<h2 class="win">星域制霸！</h2><p class="lead">你率領 <em>${FACTIONS[save.faction].name}</em> 突破了全部 ${MAX_STAGE} 關。<br>換個陣營再挑戰一次吧。</p><button class="btn" id="bAgain">重新開始</button>`;
  $('ovEnd').hidden = false;
  $('bAgain').onclick = () => { save = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } showTitle(); };
}

function showTitle() {
  phase = 'title';
  $('ovEnd').hidden = true; $('ovMenu').hidden = true; $('ovStart').hidden = false;
  const body = $('startBody'), old = load();
  const facs = () => {
    body.innerHTML = `<p class="lead">選擇你的陣營</p><div class="pick">${Object.values(FACTIONS).map((f) => `<button class="opt" data-fac="${f.id}" style="--c:${f.color}"><span class="ic"><img src="${icon({ fed: 'trooper', lum: 'blade', brood: 'clawling' }[f.id])}" alt=""></span><span><b>${f.name}<small>${f.en}</small></b><span>${f.desc}</span></span></button>`).join('')}</div>`;
    body.onclick = (e) => { const b = e.target.closest('[data-fac]'); if (b) kits(b.dataset.fac); };
  };
  const kits = (fac) => {
    const f = FACTIONS[fac];
    body.innerHTML = `<p class="lead"><em>${f.name}</em> — 選擇起始部隊</p><div class="pick">${KITS[fac].map((k, i) => `<button class="opt" data-kit="${i}" style="--c:${f.color}"><span class="ic"><img src="${icon(k.units[0])}" alt=""></span><span><b>${k.name}</b><span class="row">${k.units.map((u) => `<img src="${icon(u)}" alt="${UNITS[u].name}">`).join('')}</span></span></button>`).join('')}</div><button class="btn ghostbtn" data-back="1">← 重選陣營</button>`;
    body.onclick = (e) => {
      if (e.target.closest('[data-back]')) return facs();
      const b = e.target.closest('[data-kit]');
      if (!b) return;
      save = L.newSave(fac);
      for (const t of KITS[fac][+b.dataset.kit].units) autoPlace(L.addUnit(save, t));
      body.onclick = null; enterPrep();
    };
  };
  if (old && !old.cleared) {
    body.innerHTML = `<p class="lead">科幻自走棋 · 擺陣、衝鋒、闖 ${MAX_STAGE} 關<br>存檔：<em>${FACTIONS[old.faction].name}</em> · 第 ${old.stage} 關</p><button class="btn" data-go="cont">繼續作戰</button><button class="btn ghostbtn" data-go="new">重新開始</button>`;
    body.onclick = (e) => { const g = e.target.dataset.go; if (g === 'cont') { save = old; body.onclick = null; enterPrep(); } else if (g === 'new') facs(); };
  } else facs();
}
$('bMenu').addEventListener('click', () => { if (phase === 'prep' || phase === 'battle') $('ovMenu').hidden = false; });
$('bResume').addEventListener('click', () => { $('ovMenu').hidden = true; });
$('bReset').addEventListener('click', () => { save = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } showTitle(); });

// ── 主迴圈 ──
let last = performance.now(), acc = 0, time = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (!S || !bg) return;
  if (phase === 'battle' && $('ovMenu').hidden) {
    acc += dt * speed;
    while (acc >= STEP) {
      acc -= STEP;
      L.step(S, STEP);
      if (S.ev.length) { fx.feed(S.ev); S.ev.length = 0; }
      if (S.winner !== null) break;
    }
    fx.update(dt * speed);
    if (S.winner !== null) { endT += dt; if (endT > 1.1) { endT = 0; finishBattle(); } }
    if (Math.floor(time * 4) !== Math.floor((time - dt) * 4)) renderInfo();
  } else fx.update(dt);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const sh = fx.shake;
  if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  ctx.drawImage(bg, 0, 0, W, H);
  fx.drawDecals(ctx);
  if (phase === 'prep') {
    const occ = new Set(save.roster.filter((u) => u.cell).map((u) => u.cell.join(',')));
    drawGrid(ctx, time, occ, drag && drag.moved ? hover : null, true);
  }
  drawZones(ctx, S.zones, time);
  const us = S.units.slice().sort((a, b) => a.y - b.y);
  for (const u of us) {
    if (drag && drag.moved && u.src === drag.u) continue;
    drawUnit(ctx, u, time, phase !== 'prep' || u.team === 1 || true);
    if (phase === 'prep' && sel && sel.u && u.src === sel.u) { ctx.strokeStyle = '#9dffc4'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 9, time * 2, time * 2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  fx.draw(ctx);
  if (phase === 'battle' && S.t < 1.6) {
    ctx.globalAlpha = Math.min(1, (1.6 - S.t) * 2); ctx.textAlign = 'center';
    ctx.font = '900 34px Orbitron, sans-serif'; ctx.fillStyle = '#eaf6ff'; ctx.shadowColor = '#3fb0ff'; ctx.shadowBlur = 18;
    ctx.fillText('ENGAGE', W / 2, H / 2 + 12); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}

showTitle();
requestAnimationFrame(frame);
// 測試用
window.__arena = { get save() { return save; }, get S() { return S; }, get phase() { return phase; }, setSpeed(n) { speed = n; } };
