/* ==========================================================================
   UI.JS — micro-interactions & gallery UX
   • Smooth anchor navigation through Lenis
   • Mobile index menu
   • Custom cursor + magnetic buttons + 3D card tilt with glare (fine pointers)
   • Lightbox with keyboard, swipe & backdrop close
   • Live local clock (Asia/Jakarta)
   ========================================================================== */

import { isFinePointer, reducedMotion } from './config.js';
import { $, $$, timeIn } from './utils.js';

export function initUI({ lenis, hero3d }) {
  initAnchors(lenis);
  initMenu();
  initClock();
  initPointerForHero(hero3d);
  if (isFinePointer && !reducedMotion) {
    initCursor();
    initMagnetic();
    initTilt();
  }
  initLightbox(lenis);
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
}

/* ---------- Anchors ------------------------------------------------------ */
function initAnchors(lenis) {
  $$('a[data-scroll]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id && id.startsWith('#') ? $(id) : null;
      if (!target) return;
      e.preventDefault();
      closeMenu();
      lenis.scrollTo(target, {
        duration: reducedMotion ? 0 : 2.4,
        easing: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2), // quart in-out
      });
    });
  });
}

/* ---------- Mobile menu --------------------------------------------------- */
let menuOpen = false;
function initMenu() {
  const btn = $('#menuBtn');
  const menu = $('#menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && menuOpen && closeMenu());
}
function openMenu() {
  const btn = $('#menuBtn');
  const menu = $('#menu');
  menuOpen = true;
  btn.setAttribute('aria-expanded', 'true');
  menu.hidden = false;
  gsap.fromTo(menu, { clipPath: 'circle(0% at 100% 0%)' }, { clipPath: 'circle(150% at 100% 0%)', duration: 0.9, ease: 'expo.out' });
  gsap.fromTo('.menu__list li', { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.1 });
}
function closeMenu() {
  if (!menuOpen) return;
  const btn = $('#menuBtn');
  const menu = $('#menu');
  menuOpen = false;
  btn.setAttribute('aria-expanded', 'false');
  gsap.to(menu, {
    clipPath: 'circle(0% at 100% 0%)', duration: 0.6, ease: 'expo.inOut',
    onComplete: () => (menu.hidden = true),
  });
}

/* ---------- Clock ------------------------------------------------------- */
function initClock() {
  const nav = $('#navClock');
  const bio = $('#bioClock');
  const tick = () => {
    const t = timeIn('Asia/Jakarta');
    if (nav) nav.textContent = `WIB ${t}`;
    if (bio) bio.textContent = `${t} WIB (GMT+7)`;
  };
  tick();
  setInterval(tick, 20000);
}

/* ---------- Pointer → Three.js camera ----------------------------------- */
function initPointerForHero(hero3d) {
  window.addEventListener('pointermove', (e) => {
    hero3d.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  }, { passive: true });
}

/* ---------- Custom cursor ----------------------------------------------- */
function initCursor() {
  const cursor = $('#cursor');
  const dot = $('.cursor__dot', cursor);
  const ring = $('.cursor__ring', cursor);
  const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3.out' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3.out' });

  window.addEventListener('pointermove', (e) => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
  }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    const view = e.target.closest('[data-cursor="view"]');
    const link = e.target.closest('a, button');
    cursor.classList.toggle('is-view', !!view);
    cursor.classList.toggle('is-link', !view && !!link);
  });
  document.addEventListener('pointerleave', () => gsap.to(cursor, { opacity: 0, duration: 0.3 }));
  document.addEventListener('pointerenter', () => gsap.to(cursor, { opacity: 1, duration: 0.3 }));
}

/* ---------- Magnetic buttons ------------------------------------------- */
function initMagnetic() {
  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
    });
  });
}

/* ---------- 3D tilt + glare on cards ------------------------------------ */
function initTilt() {
  $$('.card__media').forEach((media) => {
    media.addEventListener('pointermove', (e) => {
      const r = media.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      gsap.to(media, { '--rx': `${(0.5 - py) * 9}deg`, '--ry': `${(px - 0.5) * 11}deg`, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
      media.style.setProperty('--gx', `${px * 100}%`);
      media.style.setProperty('--gy', `${py * 100}%`);
    });
    media.addEventListener('pointerleave', () => {
      gsap.to(media, { '--rx': '0deg', '--ry': '0deg', duration: 0.9, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
    });
  });
}

/* ---------- Lightbox ---------------------------------------------------- */
function initLightbox(lenis) {
  const dialog = $('#lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const img = $('#lbImg');
  const noEl = $('#lbNo');
  const titleEl = $('#lbTitle');
  const metaEl = $('#lbMeta');
  const cards = $$('.card');
  const items = cards.map((card) => {
    const im = $('img', card);
    return {
      src: im.currentSrc || im.src,
      alt: im.alt,
      title: $('.card__title', card)?.textContent ?? '',
      meta: `${$('.card__no', card)?.textContent ?? ''} · ${$('.card__meta', card)?.textContent ?? ''}`,
    };
  });
  let index = 0;
  let busy = false;

  const fill = (i) => {
    const it = items[i];
    img.src = it.src;
    img.alt = it.alt;
    titleEl.textContent = it.title;
    metaEl.textContent = it.meta;
    noEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
  };

  const open = (i) => {
    index = i;
    fill(i);
    dialog.showModal();
    lenis.stop();
    gsap.fromTo(img, { scale: 0.9, autoAlpha: 0, y: 30 }, { scale: 1, autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' });
    gsap.fromTo('.lightbox__cap > *', { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out', stagger: 0.05, delay: 0.1 });
  };

  const go = (dir) => {
    if (busy) return;
    busy = true;
    const next = (index + dir + items.length) % items.length;
    gsap.to(img, {
      x: -60 * dir, autoAlpha: 0, duration: 0.25, ease: 'power2.in',
      onComplete: () => {
        index = next;
        fill(index);
        gsap.fromTo(img, { x: 60 * dir, autoAlpha: 0 }, {
          x: 0, autoAlpha: 1, duration: 0.5, ease: 'expo.out',
          onComplete: () => (busy = false),
        });
      },
    });
  };

  const close = () => {
    gsap.to(img, { scale: 0.95, autoAlpha: 0, duration: 0.3, ease: 'power2.in', onComplete: () => dialog.close() });
  };

  cards.forEach((card, i) => $('.card__media', card)?.addEventListener('click', () => open(i)));
  $('#lbPrev').addEventListener('click', () => go(-1));
  $('#lbNext').addEventListener('click', () => go(1));
  $('#lbClose').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => lenis.start());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.classList.contains('lightbox__inner')) close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  });

  // Swipe (touch & pen)
  let sx = 0;
  img.addEventListener('pointerdown', (e) => (sx = e.clientX));
  img.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });
}
