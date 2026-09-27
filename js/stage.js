/* ==========================================================================
   STAGE.JS — "object-fit: cover" with a focal point, done in JS
   Why? Transitions need to know exactly where the coin / red sun are on screen.
   Each .stage is sized to cover its box (the .cam) and panned so the focal
   point stays visible. Hotspots are placed in image-space (%) so they stick
   to the photo no matter the screen size.
   ========================================================================== */

import { clamp } from './utils.js';

export class Stage {
  constructor(el) {
    this.el = el;
    this.name = el.dataset.stage;
    this.box = el.parentElement; // .cam
    this.iw = +el.dataset.w;
    this.ih = +el.dataset.h;

    // Desktop focal point + optional portrait/mobile focal point
    this.focusDesktop = { x: +(el.dataset.fx ?? 0.5), y: +(el.dataset.fy ?? 0.5) };
    this.focusMobile = {
      x: +(el.dataset.fxM ?? this.focusDesktop.x),
      y: +(el.dataset.fyM ?? this.focusDesktop.y),
    };

    /** Live focal point — GSAP / the director can tween this, then call layout() */
    this.focus = { ...this.focusDesktop };

    // Place hotspots once (they use % of the stage)
    this.hotspots = {};
    el.querySelectorAll('[data-hotspot]').forEach((h) => {
      const x = +h.dataset.x, y = +h.dataset.y, d = +h.dataset.d;
      h.style.left = `${x * 100}%`;
      h.style.top = `${y * 100}%`;
      h.style.width = `${d * 100}%`;
      this.hotspots[h.dataset.hotspot] = { el: h, x, y, d };
    });

    this.x = 0; this.y = 0; this.W = 0; this.H = 0; this.s = 1;
    this.resetFocus();
  }

  get portrait() {
    return this.box.clientWidth / Math.max(1, this.box.clientHeight) < 0.9;
  }

  /** Base focal point for the current orientation */
  get baseFocus() {
    return this.portrait ? this.focusMobile : this.focusDesktop;
  }

  resetFocus() {
    Object.assign(this.focus, this.baseFocus);
    this.layout();
  }

  /** Compute cover size & pan offset, write a single transform */
  layout() {
    const bw = this.box.clientWidth || window.innerWidth;
    const bh = this.box.clientHeight || window.innerHeight;
    this.bw = bw; this.bh = bh;
    this.s = Math.max(bw / this.iw, bh / this.ih);
    this.W = Math.ceil(this.iw * this.s);
    this.H = Math.ceil(this.ih * this.s);
    this.x = clamp(bw / 2 - this.focus.x * this.W, bw - this.W, 0);
    this.y = clamp(bh / 2 - this.focus.y * this.H, bh - this.H, 0);

    const st = this.el.style;
    st.width = `${this.W}px`;
    st.height = `${this.H}px`;
    st.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
  }

  /** Image-space point (0..1) → box/viewport pixels (ignores .cam transforms) */
  point(px, py) {
    return { x: this.x + px * this.W, y: this.y + py * this.H };
  }

  /** Hotspot centre + diameter in viewport pixels (current focus) */
  hotspot(name) {
    const h = this.hotspots[name];
    if (!h) return { x: this.bw / 2, y: this.bh / 2, d: 100 };
    const p = this.point(h.x, h.y);
    return { ...p, d: h.d * this.W };
  }

  /**
   * Hotspot position for a GIVEN focal point (defaults to the base focus),
   * without touching the DOM. Used by transitions so their math is stable
   * even if the live focus is mid-pan when ScrollTrigger refreshes.
   */
  hotspotFor(name, focus = this.baseFocus) {
    const h = this.hotspots[name];
    const bw = this.box.clientWidth || window.innerWidth;
    const bh = this.box.clientHeight || window.innerHeight;
    const s = Math.max(bw / this.iw, bh / this.ih);
    const W = this.iw * s, H = this.ih * s;
    const x = clamp(bw / 2 - focus.x * W, bw - W, 0);
    const y = clamp(bh / 2 - focus.y * H, bh - H, 0);
    if (!h) return { x: bw / 2, y: bh / 2, d: 100 };
    return { x: x + h.x * W, y: y + h.y * H, d: h.d * W };
  }
}

/** Create a Stage for every [data-stage] element and expose helpers */
export function initStages() {
  const map = new Map();
  document.querySelectorAll('[data-stage]').forEach((el) => map.set(el.dataset.stage, new Stage(el)));

  return {
    get: (name) => map.get(name),
    all: () => [...map.values()],
    /** Re-layout everything (called on resize / ScrollTrigger refreshInit) */
    layoutAll() {
      map.forEach((stage) => stage.layout());
    },
    /** Orientation might have changed → reset focal points to the new base */
    resetAll() {
      map.forEach((stage) => stage.resetFocus());
    },
  };
}
