import { Game, world } from './game.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { FX } from './fx.js';
import { drawBackground, drawPlayer, drawEnemy, drawPickup, drawProjectile, drawZone, drawBoss, drawBossBar, drawJoystick, drawUltOverlay } from './render.js';
import { DIFFICULTIES, TIPS, ULT_CHARGE_NEEDED } from './core/config.js';
import { createStore, addLeaderboardEntry, getLeaderboard, applyRunToProfile } from './core/save.js';
import { UPGRADES, META_UPGRADES, STYLES, metaLevel, canBuyMeta, buyMeta, upgradeLevel } from './core/upgrades.js';
import { ACHIEVEMENTS, missionProgress } from './core/missions.js';
import { finalScore, reputationFor, formatMoney, formatScore, shareText } from './core/score.js';
import { dailySeed, createRng } from './core/rng.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const store = createStore(window.localStorage);
let profile = store.load();
const audio = new AudioEngine();
audio.muted = !!profile.muted;
const input = new Input(canvas);
const fx = new FX();
const isTouch = matchMedia('(pointer: coarse)').matches;

let game = null;
let difficulty = 'normal';
let lastT = performance.now();
let scale = 1;
let lastResult = null;
let lastEntry = null;
let transitionReady = false;
let uiRng = createRng(Date.now());

// ---------- РАЗМЕР ----------
function pickWorld() {
  const portrait = window.innerHeight > window.innerWidth;
  const nw = portrait ? 600 : 1000;
  const nh = portrait ? 1000 : 640;
  if (nw !== world.W || nh !== world.H) {
    if (game) game.rescale(nw, nh);
    world.W = nw;
    world.H = nh;
    world.safeTop = portrait ? 210 : 0;
    canvas.width = nw;
    canvas.height = nh;
  }
}

function resize() {
  pickWorld();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  scale = Math.min(vw / world.W, vh / world.H);
  canvas.style.width = `${world.W * scale}px`;
  canvas.style.height = `${world.H * scale}px`;
  const hud = $('hud');
  hud.style.width = canvas.style.width;
  hud.style.height = canvas.style.height;
  hud.style.left = `${(vw - world.W * scale) / 2}px`;
  hud.style.top = `${(vh - world.H * scale) / 2}px`;
}
window.addEventListener('resize', resize);
resize();

// ---------- ЭКРАНЫ ----------
const screens = ['menu', 'howto', 'shop', 'board', 'levelup', 'transition', 'pause', 'gameover', 'victory'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !game || id === 'menu' || id === 'shop' || id === 'board' || id === 'howto');
  $('touch').classList.toggle('hidden', !(isTouch && game && (id === null || id === 'transition')));
}

function toast(text, ms = 1800) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function saveProfile() {
  store.save(profile);
}

// ---------- МЕНЮ ----------
function renderMenu() {
  const list = $('diffList');
  list.innerHTML = '';
  for (const d of Object.values(DIFFICULTIES)) {
    const el = document.createElement('div');
    el.className = `diff${d.id === difficulty ? ' active' : ''}`;
    el.innerHTML = `<b>${d.name}<em>×${d.mult}</em></b><span>${d.desc}</span>`;
    el.onclick = () => { difficulty = d.id; audio.ensure(); audio.click(); renderMenu(); };
    list.appendChild(el);
  }
  $('repText').textContent = profile.reputation;
  $('bestDayText').textContent = profile.bestDay;
  $('tornText').textContent = profile.totalTorn;
  $('styleText').textContent = (STYLES.find((s) => s.id === profile.style) || STYLES[0]).name;
  $('btnMute').textContent = audio.muted ? '🔇 Звук выкл' : '🔊 Звук вкл';
  const seed = dailySeed();
  const today = getLeaderboard(profile, null, seed);
  $('dailyLabel').textContent = today.length ? `· лучший ${formatScore(today[0].score)}` : `· ${seed.slice(6)}`;
}

$('btnStart').onclick = () => startRun(false);
$('btnDaily').onclick = () => startRun(true);
$('btnShop').onclick = () => { audio.ensure(); audio.click(); renderShop(); show('shop'); };
$('btnBoard').onclick = () => { audio.ensure(); audio.click(); renderBoard('normal'); show('board'); };
$('btnHow').onclick = () => { audio.ensure(); audio.click(); show('howto'); };
$('btnMute').onclick = () => { audio.ensure(); audio.setMuted(!audio.muted); profile.muted = audio.muted; saveProfile(); renderMenu(); };
for (const b of document.querySelectorAll('.back')) b.onclick = () => { audio.click(); renderMenu(); show('menu'); };

// ---------- МАГАЗИН ----------
function renderShop() {
  $('shopRep').textContent = profile.reputation;
  const list = $('shopList');
  list.innerHTML = '';
  for (const u of META_UPGRADES) {
    const l = metaLevel(profile.meta, u.id);
    const maxed = l >= u.max;
    const el = document.createElement('div');
    el.className = 'shop-item';
    el.innerHTML = `<div><b>${u.name} <span class="lvl">${l}/${u.max}</span></b><span>${u.desc}</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn accent';
    btn.textContent = maxed ? 'Макс' : `${u.cost(l)} реп.`;
    btn.disabled = maxed || !canBuyMeta(profile.meta, profile.reputation, u.id);
    btn.onclick = () => {
      const r = buyMeta(profile.meta, profile.reputation, u.id);
      if (r.ok) { profile.meta = r.meta; profile.reputation = r.reputation; saveProfile(); audio.tea(); renderShop(); }
    };
    el.appendChild(btn);
    list.appendChild(el);
  }
  const sl = $('styleList');
  sl.innerHTML = '';
  for (const s of STYLES) {
    const unlocked = !s.unlock || profile.achievements.includes(s.unlock);
    const el = document.createElement('div');
    el.className = `style-item${profile.style === s.id ? ' active' : ''}`;
    const need = s.unlock ? ACHIEVEMENTS.find((a) => a.id === s.unlock) : null;
    el.innerHTML = `<div><b>${s.name}</b><span>${s.desc}${unlocked ? '' : ` · нужно: ${need ? need.name : ''}`}</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = profile.style === s.id ? 'Выбран' : unlocked ? 'Выбрать' : '🔒';
    btn.disabled = !unlocked || profile.style === s.id;
    btn.onclick = () => { profile.style = s.id; saveProfile(); audio.click(); renderShop(); };
    el.appendChild(btn);
    sl.appendChild(el);
  }
  const al = $('achList');
  al.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const has = profile.achievements.includes(a.id);
    const el = document.createElement('div');
    el.className = `ach-item${has ? '' : ' locked'}`;
    el.innerHTML = `<div><b>${has ? '🏆 ' : '🔒 '}${a.name}</b><span>${a.desc}</span></div>`;
    al.appendChild(el);
  }
}

// ---------- ЛИДЕРБОРД ----------
function renderBoard(tab) {
  const tabs = $('boardTabs');
  tabs.innerHTML = '';
  const seed = dailySeed();
  const defs = [...Object.values(DIFFICULTIES).map((d) => ({ id: d.id, name: d.name })), { id: 'daily', name: `Сегодня (${seed.slice(6)})` }];
  for (const d of defs) {
    const el = document.createElement('div');
    el.className = `tab${d.id === tab ? ' active' : ''}`;
    el.textContent = d.name;
    el.onclick = () => { audio.click(); renderBoard(d.id); };
    tabs.appendChild(el);
  }
  const rows = tab === 'daily' ? getLeaderboard(profile, null, seed) : getLeaderboard(profile, tab);
  const list = $('boardList');
  list.innerHTML = '<div class="board-row head"><span>#</span><span>Дата</span><span>Очки</span><span>День</span><span>Порвано</span></div>';
  if (!rows.length) list.innerHTML += '<p class="muted">Пока пусто. Порвите что-нибудь.</p>';
  rows.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = `board-row${lastEntry && r === lastEntry ? ' me' : ''}`;
    el.innerHTML = `<span>${i + 1}</span><span>${r.dateLabel}${r.won ? ' 🏆' : ''}</span><b>${formatScore(r.score)}</b><span>${r.day}</span><span>${r.torn}</span>`;
    list.appendChild(el);
  });
}

// ---------- ЗАБЕГ ----------
function startRun(daily) {
  audio.ensure();
  audio.click();
  const seed = daily ? dailySeed() : null;
  game = new Game({
    difficulty: daily ? 'normal' : difficulty,
    daily,
    seed,
    profile,
    audio,
    fx,
    input,
    hooks: {
      onLevelUp: showLevelUp,
      onDayTransition: showTransition,
      onGameOver: showGameOver,
      onVictory: () => show('victory'),
      onMissionDone: (m) => toast(`Миссия выполнена: ${m.text}`),
      onBoss: (b) => toast(`БОСС: ${b.name}`, 2500),
      onBossPhase2: (b) => toast(`ПОВЫШЕНИЕ: ${b.phase2Name}`, 3500),
    },
  });
  lastResult = null;
  lastEntry = null;
  fx.particles = [];
  fx.texts = [];
  fx.rings = [];
  show(null);
  audio.setTempo(132);
  audio.startMusic();
  toast(TIPS[uiRng.int(0, TIPS.length - 1)], 3500);
  lastT = performance.now();
}

function showLevelUp(choices, rerolls) {
  $('lvlNum').textContent = game.level;
  renderChoices(choices);
  $('rerollCount').textContent = rerolls;
  $('btnReroll').disabled = rerolls <= 0;
  show('levelup');
}

function renderChoices(choices) {
  const box = $('choices');
  box.innerHTML = '';
  choices.forEach((c, i) => {
    const u = UPGRADES.find((x) => x.id === c.id);
    const lv = upgradeLevel(game.taken, u.id);
    const el = document.createElement('div');
    el.className = `choice${c.rare ? ' rare' : ''}`;
    el.innerHTML = `<div class="icon">${u.icon}</div>${c.rare ? '<span class="rare-tag">РЕДКИЙ ×2</span>' : ''}<b>${u.name}</b><span>${u.desc}</span><span class="lv">ур. ${lv} → ${lv + (c.rare ? 2 : 1)} / ${u.max}</span>`;
    el.onclick = () => { game.chooseUpgrade(i); show(null); lastT = performance.now(); };
    box.appendChild(el);
  });
}

$('btnReroll').onclick = () => {
  const c = game.rerollChoices();
  if (c) { audio.click(); renderChoices(c); $('rerollCount').textContent = game.rerolls; $('btnReroll').disabled = game.rerolls <= 0; }
};

function showTransition(info) {
  $('npDay').textContent = `День ${info.day} · ${info.scene.name}`;
  $('npHeadline').textContent = info.headline;
  $('npMod').textContent = `${info.modifier.name}: ${info.modifier.desc}`;
  $('npBoss').classList.toggle('hidden', !info.boss);
  if (info.boss) $('npBoss').textContent = `⚠ БОСС: ${info.boss.name}`;
  transitionReady = false;
  setTimeout(() => { transitionReady = true; }, 700);
  show('transition');
}

function resumeFromTransition() {
  if (!game || game.phase !== 'transition' || !transitionReady) return;
  game.resumeAfterTransition();
  show(null);
  lastT = performance.now();
}
$('transition').addEventListener('pointerdown', resumeFromTransition);
window.addEventListener('keydown', (e) => {
  if (game && game.phase === 'transition') { resumeFromTransition(); return; }
  if (!game) return;
  if ((e.key === 'Escape' || e.key === 'p' || e.key === 'з') && (game.phase === 'play' || game.phase === 'paused')) togglePause();
  if (e.key === 'm' || e.key === 'ь') { audio.setMuted(!audio.muted); profile.muted = audio.muted; saveProfile(); toast(audio.muted ? 'Звук выключен' : 'Звук включён', 900); }
});

function togglePause() {
  if (game.phase === 'play') {
    game.phase = 'paused';
    const pl = $('pausePerks');
    pl.innerHTML = game.taken.length ? '' : '<p class="muted">Перков пока нет.</p>';
    const grouped = {};
    for (const t of game.taken) grouped[t.id] = (grouped[t.id] || 0) + (t.rare ? 2 : 1);
    for (const [id, lv] of Object.entries(grouped)) {
      const u = UPGRADES.find((x) => x.id === id);
      const el = document.createElement('div');
      el.className = 'perk';
      el.textContent = `${u.icon} ${u.name} ${lv}`;
      pl.appendChild(el);
    }
    show('pause');
  } else if (game.phase === 'paused') {
    game.phase = 'play';
    show(null);
    lastT = performance.now();
  }
}
$('btnPause').onclick = () => { if (game) togglePause(); };
$('btnResume').onclick = togglePause;
$('btnQuit').onclick = () => { game = null; audio.stopMusic(); audio.stopTension(); renderMenu(); show('menu'); };

// ---------- КОНЕЦ ----------
function finalizeRun(res) {
  const score = finalScore(res.score, DIFFICULTIES[res.difficulty]);
  const missionsDone = res.missions.filter((m) => m.done).length;
  const rep = reputationFor(score, res.day, missionsDone);
  const now = new Date();
  const entry = {
    score, day: res.day, torn: res.torn, difficulty: res.difficulty, daily: res.daily, seed: res.seed,
    dateLabel: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`,
    diffName: res.diffName, won: res.won,
  };
  const pos = addLeaderboardEntry(profile, entry);
  const fresh = applyRunToProfile(profile, { ...res, reputation: rep }, ACHIEVEMENTS);
  saveProfile();
  lastEntry = entry;
  return { score, rep, pos, fresh, entry, missionsDone };
}

function showGameOver(res) {
  audio.stopMusic();
  audio.stopTension();
  const r = finalizeRun(res);
  lastResult = res;
  $('goTitle').textContent = res.won ? 'Дело закрыто' : res.reason === 'debt' ? 'Банкротство' : 'Нервный срыв';
  $('goSub').textContent = res.won
    ? 'Бесконечный режим окончен. Но заявление уже принято.'
    : res.reason === 'debt'
      ? `Долг достиг ${formatMoney(res.debt)}. МФО празднует. Максим — нет.`
      : 'Нервы кончились раньше бумаги. Бывает.';
  $('goScore').textContent = formatScore(r.score);
  $('goRank').textContent = r.pos ? `Место ${r.pos} в таблице${res.daily ? ' ежедневного вызова' : ` (${res.diffName})`} · +${r.rep} репутации` : `+${r.rep} репутации`;
  const s = res.stats;
  $('goStats').innerHTML = [
    ['День', res.day], ['Порвано', s.torn], ['Подписано', s.signed], ['Серия', res.combo],
    ['Боссов', s.bosses], ['Поп-апов', s.popups], ['Заявлений', s.ults], ['Долг', formatMoney(res.debt)],
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  $('goMissions').innerHTML = res.missions.map((m) => `<div class="${m.done ? 'done' : ''}">${m.text} (${missionProgress(m, s)}/${m.goal})</div>`).join('');
  $('goAch').textContent = r.fresh.length ? `Новые достижения: ${r.fresh.map((a) => a.name).join(', ')}` : '';
  show('gameover');
}

$('btnAgain').onclick = () => startRun(lastResult ? lastResult.daily : false);
$('btnMenu').onclick = () => { game = null; renderMenu(); show('menu'); };
$('btnShare').onclick = async () => {
  if (!lastEntry) return;
  const txt = shareText(lastEntry) + `\n${location.href.split('#')[0]}`;
  try {
    if (navigator.share) await navigator.share({ text: txt });
    else { await navigator.clipboard.writeText(txt); toast('Результат скопирован'); }
  } catch { toast('Не удалось поделиться'); }
};
$('btnEndless').onclick = () => { game.continueEndless(); show(null); lastT = performance.now(); audio.startMusic(); };
$('btnFinish').onclick = () => { showGameOver(game.result()); };

// ---------- ТАЧ ----------
for (const b of document.querySelectorAll('.tbtn')) input.bindButton(b, b.dataset.action);

// ---------- HUD ----------
function updateHud() {
  const h = game.hud();
  $('nervesText').textContent = `${Math.max(0, Math.ceil(h.nerves))}/${h.maxNerves}`;
  $('nervesBar').style.width = `${Math.max(0, (h.nerves / h.maxNerves) * 100)}%`;
  $('debtText').textContent = formatMoney(h.debt);
  const dk = h.debt / h.debtLimit;
  const db = $('debtBar');
  db.style.width = `${Math.min(100, dk * 100)}%`;
  db.classList.toggle('danger', dk > 0.7);
  $('interestText').textContent = h.debt > 0 ? `+${formatMoney(h.debt * h.interest)}/с` : '';
  $('levelText').textContent = h.level;
  $('xpText').textContent = `${h.xp}/${h.xpNeed}`;
  $('xpBar').style.width = `${(h.xp / h.xpNeed) * 100}%`;
  $('dayText').textContent = h.bossAlive ? `День ${h.day} · БОСС` : `День ${h.day}`;
  $('dayBar').style.width = h.bossAlive ? `${(h.boss.hp / h.boss.maxHp) * 100}%` : `${(h.dayTime / h.dayLen) * 100}%`;
  $('dayBar').className = `bar-fill ${h.bossAlive ? 'boss' : 'day'}`;
  $('modText').textContent = h.modifier.id === 'none' ? h.scene.name : `${h.modifier.name} · ${h.scene.name}`;
  $('scoreText').textContent = formatScore(h.score);
  const ct = $('comboText');
  ct.textContent = h.combo >= 3 ? `серия ${h.combo} · ×${h.comboMult.toFixed(1)}` : '';
  ct.classList.toggle('hot', h.combo >= 20);
  $('missions').innerHTML = h.missions.map((m) => `<div class="${m.done ? 'done' : ''}">${m.text} <b>${missionProgress(m, h.runStats)}/${m.goal}</b></div>`).join('');
  const dash = $('skillDash');
  dash.classList.toggle('ready', h.dashCharges > 0);
  dash.querySelector('.cd').style.height = h.dashCharges >= h.dashMax ? '0%' : `${(1 - game.player.dashCd / game.stats.dashCooldown) * 100}%`;
  $('dashCharges').textContent = h.dashMax > 1 ? `${h.dashCharges}/${h.dashMax}` : '';
  const ref = $('skillRefuse');
  ref.classList.toggle('ready', h.refuseCd <= 0);
  ref.querySelector('.cd').style.height = `${(1 - h.refuseCd / h.refuseMax) * 100}%`;
  const ult = $('skillUlt');
  ult.classList.toggle('ready', h.ultReady);
  ult.querySelector('.cd').style.height = `${h.ult * 100}%`;
  if (isTouch) {
    const tb = (action, ready, cd) => {
      const el = document.querySelector(`.tbtn[data-action="${action}"]`);
      if (!el) return;
      el.classList.toggle('ready', ready);
      el.querySelector('.cd').style.height = `${cd * 100}%`;
    };
    tb('dash', h.dashCharges > 0, h.dashCharges >= h.dashMax ? 0 : 1 - game.player.dashCd / game.stats.dashCooldown);
    tb('refuse', h.refuseCd <= 0, 1 - h.refuseCd / h.refuseMax);
    tb('ult', h.ultReady, h.ult);
  }
}

// ---------- ЦИКЛ ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!game) {
    drawMenuBackdrop(now / 1000);
    input.endFrame();
    return;
  }
  if (game.phase === 'play') game.update(dt);
  fx.update(dt);
  render(now / 1000);
  if (game) {
    const k = game.tension();
    if (game.phase === 'play') {
      audio.setTension(k);
      heartT -= dt;
      if (k > 0.65 && heartT <= 0) { heartT = 1.4 - (k - 0.65) * 1.6; audio.heartbeat(); }
    } else audio.stopTension();
  }
  if (game) updateHud();
  input.endFrame();
}

function drawMenuBackdrop(t) {
  drawBackground(ctx, { bg: '#e9dcc2', grid: '#dccbaa', accent: '#9bb27c', name: 'Двор' }, t);
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137 + t * 30 * (1 + (i % 3))) % (world.W + 80)) - 40;
    const y = 80 + ((i * 91) % (world.H - 120)) + Math.sin(t * 2 + i) * 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3 + i) * 0.4);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff8e7';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 2;
    ctx.fillRect(-11, -14, 22, 28);
    ctx.strokeRect(-11, -14, 22, 28);
    ctx.restore();
  }
  ctx.restore();
}

let heartT = 0;
function render(t) {
  const k = game.tension();
  const [sx, sy] = fx.shakeOffset();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // при пиковом напряжении картинка теряет цвет и слегка кренится
  if (k > 0.7 && 'filter' in ctx) ctx.filter = `saturate(${1 - (k - 0.7) * 1.3}) contrast(${1 + (k - 0.7) * 0.4})`;
  if (k > 0.85) {
    ctx.translate(world.W / 2, world.H / 2);
    ctx.rotate(Math.sin(t * 1.3) * 0.012 * (k - 0.85) / 0.15);
    ctx.translate(-world.W / 2, -world.H / 2);
  }
  ctx.translate(sx, sy);
  drawBackground(ctx, game.scene, t, k);
  for (const z of game.zones) drawZone(ctx, z);
  for (const e of game.enemies) if (e.type === 'trap') drawEnemy(ctx, e, t, uiRng);
  for (const k of game.pickups) drawPickup(ctx, k, t);
  for (const e of game.enemies) if (e.type !== 'trap' && e.type !== 'popup') drawEnemy(ctx, e, t, uiRng);
  for (const pr of game.projectiles) drawProjectile(ctx, pr, t);
  if (game.boss && !game.boss.dead) drawBoss(ctx, game.boss, t);
  drawPlayer(ctx, game.player, game.stats, game.style, t, k);
  fx.draw(ctx);
  for (const e of game.enemies) if (e.type === 'popup') drawEnemy(ctx, e, t, uiRng);
  if (game.ultActive > 0) drawUltOverlay(ctx, game.ultActive);
  if (game.player.inverted > 0) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#61a88f';
    ctx.fillRect(0, 0, world.W, world.H);
    ctx.restore();
  }
  ctx.restore();
  if ('filter' in ctx) ctx.filter = 'none';
  fx.drawFlash(ctx, world.W, world.H);
  if (game.boss && !game.boss.dead) drawBossBar(ctx, game.boss);
  drawJoystick(ctx, input.joy, canvas.getBoundingClientRect(), scale);
}

renderMenu();
show('menu');
requestAnimationFrame(frame);

// Отладочный доступ для автотестов в браузере.
window.__mvm = { get game() { return game; }, startRun, profile: () => profile, audio, Game, world, ULT_CHARGE_NEEDED };
