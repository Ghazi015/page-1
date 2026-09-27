/* ==========================================================================
   MAIN.JS — boot orchestrator
   Order matters:
   1. Smooth scroll (Lenis ↔ ScrollTrigger on GSAP's ticker)
   2. Stages (photo layout math)  →  3. Three.js hero  →  4. Petals
   5. Hide hero text  →  6. Scroll timelines (page order)  →  7. UI
   8. One shared render loop  →  9. Loader → hero intro
   ========================================================================== */

import { CONFIG } from './config.js';
import { initSmooth } from './smooth.js';
import { initStages } from './stage.js';
import { Hero3D } from './hero3d.js';
import { Petals } from './petals.js';
import { runLoader } from './loader.js';
import { prepareHeroIntro, playHeroIntro } from './intro.js';
import { initScroll } from './scroll.js';
import { initUI } from './ui.js';
import { $, debounce } from './utils.js';

// Always start at the first page of the book
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* 1 ─ Smooth scroll */
const lenis = initSmooth();

/* 2 ─ Stages */
const stages = initStages();

/* 3 ─ Three.js hero (graceful fallback if WebGL is unavailable) */
let hero3d;
try {
  hero3d = new Hero3D($('#heroCanvas'), stages.get('hero'));
} catch (err) {
  console.warn('[JOSC] WebGL unavailable — using the painted books instead.', err);
  hero3d = {
    isStub: true,
    active: false,
    setPointer() {},
    setScroll() {},
    setDive: () => 1,
    intro: () => gsap.to({}, { duration: 0.1 }),
    update() {},
    resize() {},
  };
}

/* 4 ─ Petals */
const petals = new Petals($('#petalCanvas'));

/* 5 ─ Hero text starts hidden (revealed by the intro) */
prepareHeroIntro();

/* 6 ─ Scroll timelines */
initScroll({ stages, hero3d, petals });

/* 7 ─ UI micro-interactions */
initUI({ lenis, hero3d });

/* 8 ─ ONE render loop for everything (GSAP ticker already drives Lenis) */
let revealed = false;
gsap.ticker.add((time, deltaTime) => {
  const dt = Math.min(deltaTime / 1000, 0.1);
  if (revealed) hero3d.update(dt); // no WebGL work while the loader plays
  petals.update(dt);
});

// Resize: re-layout photos + canvases, then let ScrollTrigger recalc
let wasPortrait = window.innerWidth / window.innerHeight < 0.9;
window.addEventListener('resize', debounce(() => {
  const portrait = window.innerWidth / window.innerHeight < 0.9;
  if (portrait !== wasPortrait) {
    wasPortrait = portrait;
    stages.resetAll(); // orientation changed → new focal points
  }
  stages.layoutAll();
  hero3d.resize();
  petals.resize();
  ScrollTrigger.refresh();
}, 200));

/* 9 ─ Loader → hero */
runLoader({
  onReveal: () => {
    document.documentElement.classList.remove('is-loading');
    revealed = true;
    playHeroIntro({ hero3d });
    lenis.start();
    ScrollTrigger.refresh();
  },
});

// Handy for debugging from the browser console (e.g. JOSC.lenis.scrollTo('#hanami'))
window.JOSC = { lenis, stages, hero3d, petals, CONFIG };
