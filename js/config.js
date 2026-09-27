/* ==========================================================================
   CONFIG.JS — device detection & performance tiers
   Everything that costs CPU/GPU reads its budget from here, so tuning the
   experience for a low-end phone is a one-file job.
   ========================================================================== */

const mq = (query) => window.matchMedia(query).matches;

const cores = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || 4; // Chrome only; defaults to 4 elsewhere

export const isTouch = mq('(hover: none), (pointer: coarse)');
export const isFinePointer = mq('(hover: hover) and (pointer: fine)');
export const reducedMotion = mq('(prefers-reduced-motion: reduce)');
export const isSmallScreen = mq('(max-width: 768px)');

/** 'low' = phones / weak CPUs, 'high' = desktops & strong tablets */
export const tier = cores <= 4 || memory <= 4 || isSmallScreen ? 'low' : 'high';

export const CONFIG = {
  tier,

  /** Device pixel ratio cap for canvases (biggest single perf lever on phones) */
  dpr: Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1.25 : 1.75),

  /** Three.js hero scene budget */
  hero: {
    books: tier === 'low' ? 10 : 16,
    pages: tier === 'low' ? 12 : 24,
    dust: tier === 'low' ? 160 : 420,
    fps: tier === 'low' ? 30 : 60, // render cap
    antialias: tier !== 'low',
  },

  /** 2D petal canvas budget */
  petals: {
    max: tier === 'low' ? 90 : 190,
    fps: tier === 'low' ? 30 : 60,
  },

  /** Torn-paper strips for the Red → Hanami transition */
  strips: tier === 'low' ? 6 : 9,

  /** Smoothing applied to every scrubbed ScrollTrigger (seconds). Same value
      everywhere keeps overlapping timelines deterministic. */
  scrub: reducedMotion ? true : 1,

  /** Use CSS blur filters during transitions (expensive → high tier only) */
  useBlur: tier === 'high' && !reducedMotion,
};

// Expose the tier to CSS (e.g. to disable backdrop-filter on low-end phones)
document.documentElement.classList.add(`tier-${tier}`);
if (isFinePointer) document.documentElement.classList.add('has-cursor');
