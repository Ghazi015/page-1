/* ==========================================================================
   UTILS.JS — small, dependency-free helpers
   ========================================================================== */

/** Clamp a value between min and max */
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** Linear interpolation */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent smoothing (lambda ≈ responsiveness) */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Map progress p into a 0→1 sub-segment [a, b] */
export const seg = (p, a, b) => clamp((p - a) / (b - a));

/** Smoothstep easing for director math */
export const smooth = (t) => t * t * (3 - 2 * t);

/** Deterministic pseudo-random (so scrubbed animations are stable between refreshes) */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Debounce (used for resize) */
export function debounce(fn, wait = 150) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), wait);
  };
}

/** Shorthand selectors */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Preload & decode images. Calls onProgress(0..1) after each image.
 * Never rejects: a broken image just counts as loaded so the site can't hang.
 */
export function preloadImages(urls, onProgress = () => {}) {
  let done = 0;
  const unique = [...new Set(urls)];
  const tick = () => onProgress(++done / unique.length);

  return Promise.all(
    unique.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(() => {
              tick();
              resolve(img);
            });
          };
          img.onerror = () => {
            tick();
            resolve(null);
          };
          img.src = src;
        })
    )
  );
}

/**
 * Split text into masked words → chars, preserving inline elements (<em>, <strong>…)
 * and line wrappers. Screen readers get the original text through aria-label.
 * Returns { words: HTMLElement[], chars: HTMLElement[] }
 */
export function splitText(el, { chars = true } = {}) {
  if (el._split) return el._split;

  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const words = [];
  const allChars = [];

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            return;
          }
          const mask = document.createElement('span');
          mask.className = 'w';
          mask.setAttribute('aria-hidden', 'true');
          const inner = document.createElement('span');
          inner.className = 'w__i';
          if (chars) {
            [...part].forEach((ch) => {
              const c = document.createElement('span');
              c.className = 'c';
              c.textContent = ch;
              inner.appendChild(c);
              allChars.push(c);
            });
          } else {
            inner.textContent = part;
          }
          mask.appendChild(inner);
          frag.appendChild(mask);
          words.push(inner);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
        child.setAttribute('aria-hidden', 'true');
        walk(child);
      }
    });
  };

  walk(el);
  el._split = { words, chars: allChars };
  return el._split;
}

/** Format local time for a given IANA zone, e.g. "14:05" */
export function timeIn(zone = 'Asia/Jakarta') {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date());
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
