/* ==========================================================================
   PETALS.JS — lightweight 2D canvas petal system
   Used for the ambient petals of Red Sun City / Hanami and for the big
   petal STORM in the Red → Hanami transition.
   • Pre-rendered petal sprites (drawImage is very cheap)
   • Pooled particles, no allocations per frame
   • Stops rendering entirely when not needed
   ========================================================================== */

import { CONFIG, reducedMotion } from './config.js';
import { clamp, lerp, seeded } from './utils.js';

/** Draw one petal shape into an offscreen canvas */
function makeSprite(inner, outer) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2);
  const grd = g.createLinearGradient(0, -s / 2, 0, s / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.beginPath();
  // Teardrop petal with a small notch at the tip (sakura style)
  g.moveTo(0, 26);
  g.bezierCurveTo(22, 12, 20, -18, 5, -26);
  g.lineTo(0, -20);
  g.lineTo(-5, -26);
  g.bezierCurveTo(-20, -18, -22, 12, 0, 26);
  g.fill();
  // Subtle centre vein
  g.strokeStyle = 'rgba(255,255,255,.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 22);
  g.quadraticCurveTo(2, 0, 0, -18);
  g.stroke();
  return c;
}

export class Petals {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.active = false;
    this.max = reducedMotion ? Math.round(CONFIG.petals.max * 0.3) : CONFIG.petals.max;
    this.params = { intensity: 0, wind: 0.4, pink: 0 };
    this.frameInterval = 1 / CONFIG.petals.fps;
    this.acc = 0;
    this.time = 0;
    this.cleared = true;

    this.sprites = {
      red: makeSprite('#ff8a78', '#c9261d'),
      pink: makeSprite('#fff1f5', '#f39ab4'),
    };

    const R = seeded(11);
    this.pool = Array.from({ length: this.max }, () => ({
      alive: false, x: 0, y: 0, z: 0, size: 0, vy: 0, rot: 0, vr: 0, flip: 0, vf: 0, phase: R() * 6.28, pinkRoll: R(),
    }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(CONFIG.dpr, 1.5);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  }

  /** intensity 0..1, wind (px/s multiplier), pink 0..1 (red → sakura) */
  set(intensity, wind, pink) {
    this.params.intensity = intensity;
    this.params.wind = wind;
    this.params.pink = pink;
  }

  #spawn(p, fromLeft) {
    p.alive = true;
    p.z = lerp(0.35, 1.2, Math.random()); // depth → size & speed
    p.size = lerp(8, 22, Math.random()) * p.z;
    if (fromLeft) {
      p.x = -30;
      p.y = Math.random() * this.h;
    } else {
      p.x = Math.random() * (this.w + 200) - 100;
      p.y = -30 - Math.random() * this.h * 0.3;
    }
    p.vy = lerp(30, 70, Math.random()) * p.z;
    p.rot = Math.random() * 6.28;
    p.vr = (Math.random() - 0.5) * 2.4;
    p.flip = Math.random() * 6.28;
    p.vf = lerp(1.5, 4, Math.random());
  }

  update(dt) {
    if (!this.active) {
      if (!this.cleared) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.cleared = true;
      }
      return;
    }
    this.acc += dt;
    if (this.acc < this.frameInterval * 0.92) return;
    const step = Math.min(this.acc, 0.1);
    this.acc = 0;
    this.time += step;

    const { intensity, wind, pink } = this.params;
    const target = Math.round(this.max * clamp(intensity));
    const windPx = wind * 120; // px/s
    const storm = wind > 1.5;
    const g = this.ctx;
    const dpr = this.dpr;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cleared = false;

    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.alive) {
        if (i < target) this.#spawn(p, storm && Math.random() < 0.7);
        else continue;
      }

      // Motion: gravity + wind + sway
      p.x += (windPx * p.z + Math.sin(this.time * 1.3 + p.phase) * 24) * step;
      p.y += (p.vy + Math.cos(this.time + p.phase) * 10) * step;
      p.rot += p.vr * step;
      p.flip += p.vf * step;

      // Out of bounds → respawn only if still within the active budget
      if (p.y > this.h + 40 || p.x > this.w + 60 || p.x < -80) {
        p.alive = false;
        if (i < target) this.#spawn(p, storm && Math.random() < 0.7);
        else continue;
      }

      // 3D flutter: scale X by cos(flip)
      const sx = Math.cos(p.flip) * (p.size / 64);
      const sy = p.size / 64;
      const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
      g.setTransform(cos * sx * dpr, sin * sx * dpr, -sin * sy * dpr, cos * sy * dpr, p.x * dpr, p.y * dpr);
      g.globalAlpha = clamp(0.35 + p.z * 0.55, 0, 0.95);
      g.drawImage(p.pinkRoll < pink ? this.sprites.pink : this.sprites.red, -32, -32);
    }
    g.globalAlpha = 1;
  }
}
