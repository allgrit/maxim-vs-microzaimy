import { world } from './game.js';
import { ENEMIES } from './core/config.js';

const FONT = '"Rubik", "Segoe UI", Arial, sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, text, x, y, size = 12, color = '#222', bg = 'rgba(255,255,255,0.9)') {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  rr(ctx, x - w / 2, y - size / 2 - 4, w, size + 8, 6);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function mixHex(a, b, k) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

// tension 0..1: фон темнеет и краснеет, сетка дрожит, в воздухе всё больше бумаги.
export function drawBackground(ctx, scene, t, tension = 0) {
  const k = Math.max(0, Math.min(1, tension));
  ctx.fillStyle = mixHex(scene.bg, '#3a1f2b', k * 0.55);
  ctx.fillRect(0, 0, world.W, world.H);
  ctx.strokeStyle = mixHex(scene.grid, '#6b2a3a', k * 0.5);
  ctx.lineWidth = 1;
  const g = 40;
  const wob = k > 0.6 ? Math.sin(t * 9) * (k - 0.6) * 6 : 0;
  ctx.beginPath();
  for (let x = 0; x <= world.W; x += g) { ctx.moveTo(x + wob, 0); ctx.lineTo(x - wob, world.H); }
  for (let y = 0; y <= world.H; y += g) { ctx.moveTo(0, y - wob); ctx.lineTo(world.W, y + wob); }
  ctx.stroke();
  // декор сцены — раскладывается по сетке относительно размеров арены
  ctx.fillStyle = scene.accent;
  ctx.globalAlpha = 0.25;
  const cols = Math.max(3, Math.round(world.W / 170));
  const stepX = world.W / cols;
  const rows = [60, world.H - 60];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < cols; i++) {
      const x = stepX * (i + 0.5);
      const y = rows[r] + (i % 2) * 20 * (r ? -1 : 1);
      if (scene.name === 'Двор') { ctx.beginPath(); ctx.arc(x, y, 22 + (i % 3) * 6, 0, 6.28); ctx.fill(); }
      else if (scene.name === 'Офис МФО') { rr(ctx, x - 50, y - 26, 100, 52, 6); ctx.fill(); }
      else if (scene.name === 'Колл-центр') { rr(ctx, x - 36, y - 22, 72, 44, 4); ctx.fill(); }
      else if (scene.name === 'Крипто-лофт') { ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 28, y + 16); ctx.lineTo(x - 28, y + 16); ctx.closePath(); ctx.fill(); }
      else { rr(ctx, x - 10, 40, 20, world.H - 80, 6); ctx.fill(); }
    }
  }
  if (scene.name === 'Двор') ctx.fillRect(world.W / 2 - 60, world.H / 2 - 20, 120, 40);
  ctx.globalAlpha = 1;
  // бумажный дождь на фоне — гуще с напряжением
  const rain = Math.floor(k * 26);
  ctx.globalAlpha = 0.18 + k * 0.2;
  ctx.fillStyle = '#fff8e7';
  for (let i = 0; i < rain; i++) {
    const x = ((i * 173 + t * (40 + (i % 4) * 25)) % (world.W + 60)) - 30;
    const y = ((i * 97 + t * (90 + (i % 5) * 30)) % (world.H + 60)) - 30;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3 + i) * 0.6);
    ctx.fillRect(-6, -8, 12, 16);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // виньетка: с напряжением плотнее и краснее, при пике пульсирует
  const pulse = k > 0.75 ? Math.sin(t * 6) * 0.08 : 0;
  const grd = ctx.createRadialGradient(world.W / 2, world.H / 2, world.H * (0.4 - k * 0.2), world.W / 2, world.H / 2, world.H * 0.95);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(${Math.round(40 * k)},0,${Math.round(10 * k)},${0.22 + k * 0.45 + pulse})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, world.W, world.H);
}

export function drawPlayer(ctx, p, stats, style, t, tension = 0) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // радиус разрыва
  ctx.strokeStyle = 'rgba(53,167,255,0.25)';
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, stats.tearRadius, 0, 6.28);
  ctx.stroke();
  ctx.setLineDash([]);
  if (p.invuln > 0 && p.dashTimer <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.5;
  const bob = Math.sin(p.walk) * 2;
  ctx.scale(p.face, 1);
  // рюкзак
  ctx.fillStyle = '#7b4b2a';
  rr(ctx, -20, -8 + bob, 12, 20, 4);
  ctx.fill();
  // тело
  ctx.fillStyle = style.id === 'suit' ? '#2b2d42' : style.id === 'robe' ? '#c9a9d6' : '#38618c';
  rr(ctx, -12, -6 + bob, 24, 24, 6);
  ctx.fill();
  if (style.id === 'suit') { ctx.fillStyle = '#d7263d'; ctx.fillRect(-2, -4 + bob, 4, 12); }
  // ноги
  ctx.fillStyle = '#2b2d42';
  const l = Math.sin(p.walk) * 4;
  ctx.fillRect(-9, 16 + bob, 7, 8 + l);
  ctx.fillRect(2, 16 + bob, 7, 8 - l);
  // голова
  ctx.fillStyle = p.hurtFlash > 0 ? '#ffb3a7' : p.signFlash > 0 ? '#ffd6dc' : '#f4c6a0';
  ctx.beginPath();
  ctx.arc(0, -16 + bob, 13, 0, 6.28);
  ctx.fill();
  // кепка
  ctx.fillStyle = style.id === 'suit' ? '#111' : '#d7263d';
  ctx.beginPath();
  ctx.arc(0, -19 + bob, 13, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(0, -20 + bob, 18, 4);
  // Максим сдаёт: мешки под глазами, щетина, пот и дрожь растут с напряжением
  const k = tension;
  if (k > 0.3) {
    ctx.fillStyle = `rgba(90,60,110,${(k - 0.3) * 0.9})`;
    ctx.beginPath();
    ctx.ellipse(5, -12 + bob, 4, 2, 0, 0, 6.28);
    ctx.fill();
  }
  if (k > 0.5) {
    ctx.fillStyle = `rgba(60,40,30,${(k - 0.5) * 1.4})`;
    for (let i = 0; i < 6; i++) ctx.fillRect(-6 + i * 2.5, -6 + bob + (i % 2), 1.2, 1.2);
  }
  if (k > 0.6 && Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = '#9be1ff';
    ctx.beginPath();
    ctx.ellipse(-10, -20 + bob + (t % 1) * 8, 2, 3, 0, 0, 6.28);
    ctx.fill();
  }
  if (k > 0.8) ctx.translate((Math.random() - 0.5) * 2, 0);
  // глаза
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(5, -15 + bob, k > 0.7 ? 1.4 : 2, 0, 6.28);
  ctx.fill();
  if (p.signFlash > 0) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(4, -10 + bob, 3, 0, 6.28);
    ctx.stroke();
  } else {
    ctx.fillRect(1, -9 + bob, 7, 2);
  }
  ctx.restore();
  // цепь
  if (p.chained) {
    ctx.save();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.chained.x, p.chained.y);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawEnemy(ctx, e, t, rng) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.hitFlash > 0;
  switch (e.type) {
    case 'contract': {
      ctx.rotate(Math.sin(e.t * 6 + e.phase) * 0.25);
      ctx.fillStyle = flash ? '#ffe' : '#fff8e7';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      rr(ctx, -11, -14, 22, 28, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9aa';
      for (let i = 0; i < 4; i++) ctx.fillRect(-7, -9 + i * 5, 14 - (i % 2) * 4, 2);
      ctx.strokeStyle = '#d7263d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(4, 7, 4, 0, 6.28);
      ctx.stroke();
      if (e.revealed) label(ctx, 'банк', 0, -22, 9, '#fff', '#d7263d');
      break;
    }
    case 'flyer': {
      ctx.rotate(e.t * 8);
      ctx.fillStyle = '#ffe74c';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 1.5;
      rr(ctx, -8, -10, 16, 20, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d7263d';
      ctx.fillRect(-5, -6, 10, 3);
      ctx.fillRect(-5, 0, 10, 2);
      break;
    }
    case 'promoter': {
      const bob = Math.sin(e.t * 12) * 2;
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(-8, 12 + bob, 6, 8);
      ctx.fillRect(2, 12 + bob, 6, 8);
      ctx.fillStyle = flash ? '#fff' : '#ffe74c';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      rr(ctx, -13, -8 + bob, 26, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d7263d';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ЗАЙМЫ', 0, 6 + bob);
      ctx.fillStyle = '#f4c6a0';
      ctx.beginPath();
      ctx.arc(0, -18 + bob, 11, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-4, -20 + bob, 2, 2);
      ctx.fillRect(2, -20 + bob, 2, 2);
      ctx.beginPath();
      ctx.arc(0, -14 + bob, 4, 0, Math.PI);
      ctx.fill();
      // стопка листовок
      ctx.fillStyle = '#ffe74c';
      ctx.fillRect(12, -2 + bob, 10, 12);
      if (e.quoteT > 0) label(ctx, e.quote, 0, -40, 11);
      break;
    }
    case 'call': {
      const k = e.ringNow / e.ring;
      ctx.strokeStyle = `rgba(53,167,255,${0.55})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.ringNow, 0, 6.28);
      ctx.stroke();
      ctx.fillStyle = 'rgba(53,167,255,0.12)';
      ctx.fill();
      for (let i = 0; i < 2; i++) {
        const rr2 = ((t * 1.2 + i * 0.5) % 1) * e.ringNow;
        ctx.strokeStyle = `rgba(53,167,255,${(1 - rr2 / e.ringNow) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, rr2, 0, 6.28);
        ctx.stroke();
      }
      ctx.rotate(Math.sin(t * 30) * 0.2 * k);
      ctx.fillStyle = flash ? '#fff' : '#2b2d42';
      rr(ctx, -9, -15, 18, 30, 4);
      ctx.fill();
      ctx.fillStyle = '#35a7ff';
      rr(ctx, -6, -11, 12, 20, 2);
      ctx.fill();
      ctx.rotate(-Math.sin(t * 30) * 0.2 * k);
      label(ctx, e.quote, 0, -32, 10, '#fff', '#2b2d42');
      break;
    }
    case 'sms': {
      const a = Math.atan2(e.vy, e.vx);
      ctx.rotate(a);
      ctx.fillStyle = flash ? '#fff' : '#6bd425';
      rr(ctx, -14, -7, 28, 14, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-9, -2, 6, 3);
      ctx.fillRect(-1, -2, 8, 3);
      break;
    }
    case 'trap': {
      const armK = e.arm / ENEMIES.trap.armTime;
      ctx.strokeStyle = armK > 0 ? '#d7263d' : '#ff5964';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2 + armK * 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, 6.28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(215,38,61,${0.08 + armK * 0.35})`;
      ctx.fill();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.bezierCurveTo(-6, -8, 4, 12, 14, -4);
      ctx.stroke();
      const bl = Math.floor(t * 3) % 2 === 0;
      if (bl || armK > 0) label(ctx, 'Подпишите здесь ✍', 0, -e.r - 10, 10, '#fff', '#d7263d');
      break;
    }
    case 'popup': {
      const w = e.w; const h = e.h;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = flash ? '#eef' : '#ffffff';
      rr(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#2b5fd9';
      rr(ctx, -w / 2, -h / 2, w, 26, 6);
      ctx.fill();
      ctx.fillRect(-w / 2, -h / 2 + 14, w, 12);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Займ-Экспресс', -w / 2 + 10, -h / 2 + 13);
      ctx.fillStyle = '#d7263d';
      rr(ctx, w / 2 - 24, -h / 2 + 4, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('✕', w / 2 - 14, -h / 2 + 14);
      ctx.fillStyle = '#2b2d42';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(e.text, 0, 2);
      ctx.fillStyle = '#2a9d3a';
      rr(ctx, -40, 16, 80, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText('ЗАБРАТЬ', 0, 27);
      ctx.fillStyle = '#2b2d42';
      for (let i = 0; i < e.hp; i++) ctx.fillRect(-w / 2 + 10 + i * 10, h / 2 - 8, 6, 3);
      break;
    }
    case 'collector': {
      const sh = Math.sin(t * 40) * 1.2;
      ctx.translate(sh, 0);
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(-12, 14, 9, 12);
      ctx.fillRect(3, 14, 9, 12);
      ctx.fillStyle = flash ? '#fff' : '#1b1b2f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      rr(ctx, -20, -10, 40, 30, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4c6a0';
      ctx.beginPath();
      ctx.arc(0, -22, 14, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-9, -27, 7, 3);
      ctx.fillRect(2, -27, 7, 3);
      ctx.fillRect(-6, -14, 12, 2);
      // цепь
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(18, 4);
      ctx.quadraticCurveTo(30 + Math.sin(t * 6) * 6, 16, 24, 30);
      ctx.stroke();
      ctx.setLineDash([]);
      // хп
      ctx.fillStyle = '#000';
      ctx.fillRect(-20, -44, 40, 5);
      ctx.fillStyle = '#ff5964';
      ctx.fillRect(-20, -44, 40 * (e.hp / (e.maxHp * (e.hpScaleRef || 1))), 5);
      if (e.quoteT > 0) label(ctx, e.quote, 0, -56, 11, '#fff', '#1b1b2f');
      break;
    }
    case 'robocall': {
      ctx.fillStyle = flash ? '#fff' : '#9a8bc4';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      rr(ctx, -18, -14, 36, 30, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(-2, -30, 4, 16);
      ctx.beginPath();
      ctx.arc(0, -32, 4 + Math.sin(t * 10) * 1.5, 0, 6.28);
      ctx.fillStyle = '#ff5964';
      ctx.fill();
      ctx.fillStyle = '#35a7ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(-12 + i * 9, -6, 6, 6 + ((Math.floor(t * 6) + i) % 3) * 3);
      label(ctx, 'АВТОДОЗВОН', 0, 26, 9, '#fff', '#2b2d42');
      break;
    }
    case 'mimic': {
      const j = e.token ? 0 : (rng.next() - 0.5) * 3;
      ctx.translate(j, j);
      if (e.token) {
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, 6.28);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#b8860b';
        ctx.font = `bold 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('₮', 0, 1);
      } else {
        drawTea(ctx, t, '#a7c28c');
      }
      break;
    }
    case 'drone': {
      ctx.fillStyle = flash ? '#fff' : '#38618c';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      rr(ctx, -12, -6, 24, 12, 4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      for (const sx of [-16, 16]) {
        ctx.beginPath();
        ctx.moveTo(sx * 0.6, -4);
        ctx.lineTo(sx, -12);
        ctx.stroke();
        ctx.fillStyle = 'rgba(43,45,66,0.5)';
        ctx.beginPath();
        ctx.ellipse(sx, -12, 10, 3 + Math.sin(t * 40) * 2, 0, 0, 6.28);
        ctx.fill();
      }
      ctx.fillStyle = '#fff8e7';
      ctx.fillRect(-6, 6, 12, 8);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function drawTea(ctx, t, color = '#6bd425') {
  const bob = Math.sin(t * 3) * 2;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = 2;
  rr(ctx, -10, -8 + bob, 20, 18, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 1 + bob, 5, -1.3, 1.3);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-8, -6 + bob, 16, 5);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5, -12 + bob);
    ctx.quadraticCurveTo(i * 5 + 3, -18 + bob + Math.sin(t * 4 + i) * 2, i * 5, -24 + bob);
    ctx.stroke();
  }
}

export function drawPickup(ctx, k, t) {
  ctx.save();
  ctx.translate(k.x, k.y);
  if (k.kind === 'xp') {
    ctx.rotate(k.t * 3);
    ctx.fillStyle = '#fff8e7';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -5);
    ctx.lineTo(5, -3);
    ctx.lineTo(3, 5);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (k.kind === 'tea') {
    drawTea(ctx, t);
  } else if (k.kind === 'cert') {
    const bob = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2b5fd9';
    ctx.lineWidth = 2.5;
    rr(ctx, -12, -16 + bob, 24, 32, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b5fd9';
    ctx.font = `bold 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ОТКАЗ', 0, -4 + bob);
    ctx.strokeStyle = '#2a9d3a';
    ctx.beginPath();
    ctx.arc(0, 7 + bob, 5, 0, 6.28);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(43,95,217,0.5)';
    ctx.beginPath();
    ctx.arc(0, bob, 22 + Math.sin(t * 5) * 3, 0, 6.28);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawProjectile(ctx, pr, t) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  if (pr.kind === 'chain') {
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(pr.owner.x - pr.x, pr.owner.y - pr.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, 6.28);
    ctx.fill();
  } else if (pr.kind === 'page') {
    ctx.rotate(t * 6);
    ctx.fillStyle = '#fff8e7';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 2;
    rr(ctx, -9, -12, 18, 24, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(-5, -6, 10, 2);
    ctx.fillRect(-5, -1, 10, 2);
    ctx.fillRect(-5, 4, 6, 2);
  }
  ctx.restore();
}

export function drawZone(ctx, z) {
  ctx.save();
  const k = Math.min(1, z.t / z.dur);
  if (z.kind === 'stamp') {
    ctx.translate(z.x, z.y);
    if (z.t < z.dur) {
      ctx.strokeStyle = '#2a9d3a';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, z.r, 0, 6.28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(42,157,58,${0.1 + k * 0.3})`;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * k, 0, 6.28);
      ctx.fill();
      ctx.globalAlpha = 0.5 + k * 0.5;
      ctx.rotate(-0.3);
      ctx.translate(0, -120 * (1 - k));
    } else {
      ctx.rotate(-0.3);
    }
    ctx.strokeStyle = '#2a9d3a';
    ctx.lineWidth = 4;
    rr(ctx, -50, -18, 100, 36, 4);
    ctx.stroke();
    ctx.fillStyle = '#2a9d3a';
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ОДОБРЕНО', 0, 1);
  } else if (z.kind === 'line') {
    ctx.strokeStyle = `rgba(215,38,61,${0.3 + k * 0.5})`;
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(z.x, z.y);
    ctx.lineTo(z.x + z.dir[0] * z.len, z.y + z.dir[1] * z.len);
    ctx.stroke();
  } else if (z.kind === 'shock') {
    ctx.strokeStyle = `rgba(255,140,66,${1 - k})`;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, 6.28);
    ctx.stroke();
  } else if (z.kind === 'stakingPull') {
    ctx.translate(z.x, z.y);
    ctx.rotate(z.t * 2);
    ctx.strokeStyle = 'rgba(97,168,143,0.7)';
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, z.r, 0, 6.28);
    ctx.stroke();
    ctx.fillStyle = 'rgba(97,168,143,0.12)';
    ctx.fill();
    ctx.setLineDash([]);
    ctx.fillStyle = '#61a88f';
    ctx.font = `bold 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₮', 0, 0);
  }
  ctx.restore();
}

export function drawBoss(ctx, b, t) {
  ctx.save();
  ctx.translate(b.x, b.y);
  const flash = b.hitFlash > 0;
  const stunned = b.stun > 0;
  if (stunned) ctx.rotate(Math.sin(t * 20) * 0.08);
  const sc = b.scale || 1;
  ctx.scale(sc, sc);
  switch (b.id) {
    case 'director': {
      ctx.fillStyle = flash ? '#fff' : '#2b2d42';
      rr(ctx, -26, -10, 52, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-6, -8, 12, 30);
      ctx.fillStyle = '#d7263d';
      ctx.fillRect(-3, -6, 6, 22);
      ctx.fillStyle = '#f4c6a0';
      ctx.beginPath();
      ctx.arc(0, -28, 20, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-14, -34, 10, 4);
      ctx.fillRect(4, -34, 10, 4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -20, 8, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-8, -16, 16, 3);
      // стопка договоров
      ctx.fillStyle = '#fff8e7';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { rr(ctx, 28 + i * 2, 4 - i * 3, 24, 30, 2); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'vitek': {
      ctx.fillStyle = flash ? '#fff' : '#1b1b2f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      rr(ctx, -34, -14, 68, 50, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4c6a0';
      ctx.beginPath();
      ctx.arc(0, -34, 22, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-15, -42, 12, 5);
      ctx.fillRect(3, -42, 12, 5);
      ctx.fillRect(-8, -24, 16, 3);
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(34, 10);
      ctx.quadraticCurveTo(60 + Math.sin(t * 8) * 10, 20, 50, 50);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd166';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ДОЛГ', 0, 12);
      break;
    }
    case 'alena': {
      const beams = b.phase2 ? [b.beamA, b.beamA + Math.PI] : [b.beamA];
      for (const ang of beams) {
        ctx.save();
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, 700, 0);
        g.addColorStop(0, 'rgba(255,89,100,0.8)');
        g.addColorStop(1, 'rgba(255,89,100,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -9, 700, 18);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ВАШ ЗВОНОК ОЧЕНЬ ВАЖЕН ДЛЯ НАС', 60, 0);
        ctx.restore();
      }
      ctx.fillStyle = flash ? '#fff' : '#9a8bc4';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      rr(ctx, -28, -22, 56, 48, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2d42';
      rr(ctx, -20, -14, 40, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#35a7ff';
      ctx.fillRect(-14, -8, 10, 6);
      ctx.fillRect(4, -8, 10, 6);
      ctx.fillStyle = '#ff5964';
      ctx.beginPath();
      ctx.arc(0, -34, 5 + Math.sin(t * 12) * 2, 0, 6.28);
      ctx.fill();
      ctx.fillRect(-2, -30, 4, 10);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('АЛЁНА', 0, 16);
      break;
    }
    case 'microcoin': {
      ctx.rotate(Math.sin(t * 2) * 0.1);
      ctx.fillStyle = flash ? '#fff' : '#61a88f';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.28;
        ctx.lineTo(Math.cos(a) * 32, Math.sin(a) * 32);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₮', 0, 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(-16, -26, 32, 6);
      break;
    }
    case 'history': {
      ctx.fillStyle = flash ? '#fff' : '#fff8e7';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      rr(ctx, -36, -46, 72, 92, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9aa';
      for (let i = 0; i < 9; i++) ctx.fillRect(-26, -34 + i * 8, 52 - (i % 3) * 10, 3);
      ctx.strokeStyle = '#d7263d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(14, 28, 12, 0, 6.28);
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-12, -14, 4, 0, 6.28);
      ctx.arc(12, -14, 4, 0, 6.28);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 4, 10, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#d7263d';
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('КРЕДИТНАЯ', 0, -40);
      break;
    }
    default:
      break;
  }
  if (stunned) label(ctx, 'ОГЛУШЁН', 0, -b.r - 26, 11, '#fff', '#2b5fd9');
  ctx.restore();
}

export function drawBossBar(ctx, b) {
  const w = Math.min(560, world.W - 40);
  const x = world.W / 2 - w / 2;
  const y = world.safeTop ? world.safeTop + 14 : 84;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, x - 6, y - 6, w + 12, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#333';
  rr(ctx, x, y + 12, w, 10, 5);
  ctx.fill();
  ctx.fillStyle = b.phase2 ? '#ff5964' : '#ffd166';
  rr(ctx, x, y + 12, Math.max(6, (w * Math.max(0, b.hp)) / b.maxHp), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = b.phase2 && b.def.phase2Name ? b.def.phase2Name : b.def.name;
  ctx.font = `bold ${name.length > 38 ? 10 : 12}px ${FONT}`;
  ctx.fillText(name, world.W / 2, y + 3);
  ctx.restore();
}

export function drawJoystick(ctx, joy, canvasRect, scale) {
  if (!joy.active) return;
  ctx.save();
  const cx = (joy.cx - canvasRect.left) / scale;
  const cy = (joy.cy - canvasRect.top) / scale;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, 6.28);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx + joy.dx * 48, cy + joy.dy * 48, 20, 0, 6.28);
  ctx.fill();
  ctx.restore();
}

export function drawUltOverlay(ctx, k) {
  ctx.save();
  ctx.globalAlpha = 0.18 * Math.min(1, k);
  ctx.fillStyle = Math.floor(performance.now() / 120) % 2 ? '#2b5fd9' : '#d7263d';
  ctx.fillRect(0, 0, world.W, 18);
  ctx.fillRect(0, world.H - 18, world.W, 18);
  ctx.restore();
}

// ---------- Игровые подсказки без текста ----------
function chevron(ctx, x, y, angle, size, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, -size * 0.6);
  ctx.lineTo(size * 0.4, 0);
  ctx.lineTo(-size * 0.5, size * 0.6);
  ctx.stroke();
  ctx.restore();
}

function counterIcon(ctx, x, y, counter, t) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(t * 8) * 0.08;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, 6.28);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  if (counter === 'tear') {
    // две руки рвут лист
    ctx.fillStyle = '#fff8e7';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-1, -9); ctx.lineTo(-3, 9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(8, -9); ctx.lineTo(8, 9); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d7263d';
    ctx.beginPath(); ctx.moveTo(-1, -9); ctx.lineTo(1, -3); ctx.lineTo(-2, 2); ctx.lineTo(0, 9); ctx.stroke();
  } else if (counter === 'dash') {
    ctx.strokeStyle = '#35a7ff';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(9, 0); ctx.lineTo(3, 6); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-6, -5); ctx.moveTo(-12, 5); ctx.lineTo(-6, 5); ctx.stroke();
  } else if (counter === 'refuse') {
    ctx.strokeStyle = '#35a7ff';
    ctx.beginPath(); ctx.arc(0, 0, 6 + (t * 3 % 1) * 8, 0, 6.28); ctx.stroke();
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.28); ctx.fill();
  } else if (counter === 'x') {
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); ctx.stroke();
  } else if (counter === 'avoid') {
    ctx.strokeStyle = '#d7263d';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.stroke();
  } else if (counter === 'pick') {
    ctx.strokeStyle = '#2a9d3a';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(0, 8); ctx.lineTo(6, 2); ctx.stroke();
  }
  ctx.restore();
}

export function drawSpotlight(ctx, sp, t) {
  const tg = sp.target;
  const k = Math.min(1, sp.t / 0.25);
  const fade = sp.t > sp.dur - 0.3 ? (sp.dur - sp.t) / 0.3 : 1;
  const r = (tg.r || 20) + 26;
  ctx.save();
  ctx.globalAlpha = 0.45 * k * fade;
  // затемнение с «дыркой» на цели
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(0, 0, world.W, world.H);
  ctx.arc(tg.x, tg.y, r + 10, 0, 6.28, true);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#ffe74c';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.arc(tg.x, tg.y, r, 0, 6.28);
  ctx.stroke();
  ctx.setLineDash([]);
  // плашка: название и пиктограмма контрмеры
  const y = tg.y - r - 30;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(sp.label).width;
  const bw = tw + 62;
  const bx = Math.max(6, Math.min(world.W - bw - 6, tg.x - bw / 2));
  const by = Math.max(world.safeTop + 6, y - 20);
  ctx.fillStyle = '#fff8e7';
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = 3;
  rr(ctx, bx, by, bw, 40, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b2d42';
  ctx.fillText(sp.label, bx + 12, by + 20);
  counterIcon(ctx, bx + bw - 24, by + 20, sp.counter, t);
  ctx.restore();
}

// Шаги первого забега: стрелки вокруг Максима, подсветка ближайшего договора, радиус рук.
export function drawTutorial(ctx, step, game, t, isTouch) {
  const p = game.player;
  ctx.save();
  if (step === 'move') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        const k = (t * 1.2 + j / 3) % 1;
        const d = 40 + k * 34;
        chevron(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, a, 16, '#ffe74c', (1 - k) * 0.9);
      }
    }
    if (isTouch) {
      // палец, который ведут по экрану
      const fx = p.x + Math.sin(t * 2) * 40;
      const fy = p.y + 90;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, fy, 40, 0, 6.28); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(fx, fy, 16, 0, 6.28); ctx.fill();
    }
  } else if (step === 'tear') {
    let best = null;
    let bd = Infinity;
    for (const e of game.enemies) {
      if (e.dead || e.type !== 'contract') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    // радиус рук мигает
    ctx.strokeStyle = `rgba(255,231,76,${0.5 + Math.sin(t * 6) * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, game.stats.tearRadius, 0, 6.28);
    ctx.stroke();
    if (best) {
      const a = Math.atan2(best.y - p.y, best.x - p.x);
      const d0 = game.stats.tearRadius + 10;
      const d1 = Math.max(d0 + 1, bd - 30);
      for (let j = 0; j < 3; j++) {
        const k = (t * 1.2 + j / 3) % 1;
        chevron(ctx, p.x + Math.cos(a) * (d0 + (d1 - d0) * k), p.y + Math.sin(a) * (d0 + (d1 - d0) * k), a, 16, '#ffe74c', 1 - k * 0.7);
      }
      ctx.strokeStyle = '#ffe74c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(best.x, best.y, 26 + Math.sin(t * 8) * 4, 0, 6.28);
      ctx.stroke();
      counterIcon(ctx, best.x, best.y - 44, 'tear', t);
    }
  } else if (step === 'dash') {
    counterIcon(ctx, p.x, p.y - 52, 'dash', t);
    const k = (t * 1.5) % 1;
    chevron(ctx, p.x + 30 + k * 40, p.y, 0, 18, '#35a7ff', 1 - k);
  } else if (step === 'refuse') {
    counterIcon(ctx, p.x, p.y - 52, 'refuse', t);
    ctx.strokeStyle = `rgba(53,167,255,${1 - (t * 1.2 % 1)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20 + (t * 1.2 % 1) * game.stats.refuseRadius, 0, 6.28);
    ctx.stroke();
  }
  ctx.restore();
}
