// Частицы, кольца, всплывающие тексты, тряска и вспышки.
export class FX {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.shakeAmt = 0;
    this.flashColor = null;
    this.flashAlpha = 0;
    this.slowmo = 0;
  }

  shreds(x, y, n = 8, color = '#fff', spread = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * spread;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        w: 3 + Math.random() * 6, h: 5 + Math.random() * 9,
        life: 0.6 + Math.random() * 0.6, max: 1, color, kind: 'rect', g: 220,
      });
    }
  }

  sparks(x, y, n = 10, color = '#ffd166', speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, vr: 0, w: 3, h: 3, life: 0.3 + Math.random() * 0.3, color, kind: 'dot', g: 0 });
    }
  }

  confetti(x, y, n = 40) {
    const colors = ['#ff5964', '#ffe74c', '#38618c', '#35a7ff', '#6bd425'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 200 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, w: 5, h: 8, life: 1.2 + Math.random() * 0.8, color: colors[i % colors.length], kind: 'rect', g: 300 });
    }
  }

  ghost(x, y, r, color) {
    this.particles.push({ x, y, vx: 0, vy: 0, rot: 0, vr: 0, w: r, h: r, life: 0.25, color, kind: 'ghost', g: 0 });
  }

  ring(x, y, r0, r1, color, dur = 0.4, width = 3) {
    this.rings.push({ x, y, r0, r1, color, t: 0, dur, width });
  }

  text(x, y, str, color = '#fff', size = 16, dur = 1) {
    this.texts.push({ x, y, str, color, size, t: 0, dur, vy: -40 });
  }

  shake(a) {
    this.shakeAmt = Math.min(24, this.shakeAmt + a);
  }

  flash(color, alpha = 0.35) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= 0.98;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const t of this.texts) {
      t.t += dt;
      t.y += t.vy * dt;
    }
    this.texts = this.texts.filter((t) => t.t < t.dur);
    this.shakeAmt *= Math.pow(0.02, dt);
    if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.6);
    if (this.slowmo > 0) this.slowmo -= dt;
  }

  shakeOffset() {
    if (!this.shakeAmt) return [0, 0];
    return [(Math.random() - 0.5) * this.shakeAmt * 2, (Math.random() - 0.5) * this.shakeAmt * 2];
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
      ctx.fillStyle = p.color;
      if (p.kind === 'rect') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ghost') {
        ctx.globalAlpha = p.life * 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = r.t / r.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const t of this.texts) {
      const k = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `bold ${t.size}px "Rubik", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }

  drawFlash(ctx, w, h) {
    if (this.flashAlpha > 0 && this.flashColor) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
