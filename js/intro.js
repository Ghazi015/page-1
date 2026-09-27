/* ==========================================================================
   INTRO.JS — hero entrance (runs the moment the loader hands over)
   • Photo books fade out while the 3D books "wake up" and start orbiting
   • Split-text title rises through masks
   • Bio card wipes in, stats count up, nav fades down
   ========================================================================== */

import { $, $$, splitText } from './utils.js';

let chars = [];

/** Set hidden start states BEFORE the loader is removed (no flash of content) */
export function prepareHeroIntro() {
  chars = splitText($('#heroTitle')).chars;
  gsap.set(chars, { yPercent: 115, rotate: 7, transformOrigin: '0% 100%' });
  gsap.set('[data-intro]', { autoAlpha: 0, y: 26 });
  gsap.set('[data-intro-card]', { autoAlpha: 0, x: 40, clipPath: 'inset(0% 0% 100% 0% round 28px)' });
}

/** Count-up numbers ([data-count]) */
function countUp() {
  $$('[data-count]').forEach((el) => {
    const obj = { v: 0 };
    gsap.to(obj, {
      v: +el.dataset.count,
      duration: 2,
      ease: 'power3.out',
      onUpdate: () => (el.textContent = String(Math.round(obj.v)).padStart(2, '0')),
    });
  });
}

/** Play the hero entrance */
export function playHeroIntro({ hero3d }) {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

  tl.fromTo('.hero-pulse', { scale: 0.2, opacity: 1 }, { scale: 3.4, opacity: 0, duration: 1.8 }, 0);

  // The painted books dissolve → the real 3D books take over and orbit
  // (skipped when WebGL is unavailable so the painted books stay)
  if (!hero3d.isStub) {
    tl.to('.layer--hero .stage__orig', { opacity: 0, duration: 1.4, ease: 'power2.inOut' }, 0.05)
      .add(hero3d.intro(), 0.05);
  }

  tl
    .to(chars, { yPercent: 0, rotate: 0, duration: 1.5, stagger: 0.028 }, 0.25)
    .to('[data-intro]', { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.08 }, 0.6)
    .to('[data-intro-card]', { autoAlpha: 1, x: 0, clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.5 }, 0.8)
    .to(['#nav', '.progress'], { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.9)
    .add(countUp, 1);

  return tl;
}
