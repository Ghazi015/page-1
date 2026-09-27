/* ==========================================================================
   SMOOTH.JS — Lenis smooth scroll wired into GSAP's ticker + ScrollTrigger
   One single requestAnimationFrame loop (gsap.ticker) drives EVERYTHING:
   Lenis, ScrollTrigger, Three.js and the petal canvas → minimal CPU overhead.
   ========================================================================== */

import { reducedMotion, isTouch } from './config.js';

export function initSmooth() {
  gsap.registerPlugin(ScrollTrigger);

  // Mobile address-bar show/hide shouldn't trigger a full refresh
  ScrollTrigger.config({ ignoreMobileResize: true });

  const lenis = new Lenis({
    lerp: reducedMotion ? 1 : 0.085, // lower = silkier, higher = snappier
    smoothWheel: !reducedMotion,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.15,
    syncTouch: false, // keep native momentum on phones (smoother + cheaper)
    anchors: false, // we handle anchors ourselves (see ui.js)
  });

  // 1) Every Lenis scroll → update ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);

  // 2) Drive Lenis from GSAP's ticker (time is in seconds → Lenis wants ms)
  gsap.ticker.add((time) => lenis.raf(time * 1000));

  // 3) Never "catch up" after a long frame — avoids jumps after tab switches
  gsap.ticker.lagSmoothing(0);

  // Scroll is locked while the loader plays
  lenis.stop();

  // Touch devices: a slightly lighter scrub feels more "native" with momentum scrolling
  if (isTouch) document.documentElement.classList.add('is-touch');

  return lenis;
}
