/* ==========================================================================
   SCROLL.JS — every scroll-driven animation, created in PAGE ORDER
   ─────────────────────────────────────────────────────────────────────────
   Architecture
   • Content (<main>) scrolls normally over a fixed "world" of photo layers.
   • Empty .transit spacers give each scene change its own scroll distance.
   • Each transition = one scrubbed GSAP timeline (t1 … t4). Timelines only
     animate the FX elements they own, so they never fight each other.
   • A tiny "director" reads all timeline progresses and decides which
     layers are visible, the theme, the petal weather and the sun pan.
     → deterministic even if the user jumps straight to the footer.
   ========================================================================== */

import { CONFIG, reducedMotion } from './config.js';
import { $, $$, clamp, lerp, seg, smooth, seeded, splitText } from './utils.js';

export function initScroll({ stages, hero3d, petals }) {
  /* ---------- References ------------------------------------------------ */
  const world = $('#world');
  const L = {};
  $$('[data-layer]').forEach((el) => (L[el.dataset.layer] = el));
  const cams = {};
  $$('[data-cam]').forEach((el) => (cams[el.dataset.cam] = el));
  const S = {
    sun: stages.get('sun'),
    red: stages.get('red'),
    sakura: stages.get('sakura'),
  };
  const fx = {
    strips: $('#fxStrips'),
    flash: $('.fx-flash--gold'),
    disk: $('#fxDisk'),
    diskRed: $('.fx-disk__red'),
    cut: $('.fx-cut'),
    leak: $('.fx-leak'),
    bloom: $('.fx-bloom'),
    white: $('.fx-white'),
    birds: $('#fxBirds'),
  };
  const caps = [1, 2, 3, 4].map((n) => $(`[data-cap="${n}"]`));
  const scrub = CONFIG.scrub;
  const vw = () => world.clientWidth || window.innerWidth;
  const vh = () => world.clientHeight || window.innerHeight;
  const T = {}; // timelines
  const IR = { immediateRender: false }; // shorthand, see note below
  // NOTE: every fromTo uses immediateRender:false so nothing is applied at
  // creation time; values are only written when a timeline actually plays.

  /* ---------- Helpers --------------------------------------------------- */
  const visCache = new Map();
  const show = (el, v) => {
    if (!el || visCache.get(el) === v) return;
    visCache.set(el, v);
    el.style.visibility = v ? 'visible' : 'hidden';
  };

  /** Fade an element in, hold, fade out — inside a timeline */
  const pulse = (tl, el, at, inDur, hold, outDur, peak = 1, fromY = 0) => {
    tl.fromTo(el, { autoAlpha: 0, y: fromY }, { autoAlpha: peak, y: 0, duration: inDur, ease: 'power2.out', ...IR }, at);
    tl.fromTo(el, { autoAlpha: peak, y: 0 }, { autoAlpha: 0, y: -fromY, duration: outDur, ease: 'power2.in', ...IR }, at + inDur + hold);
  };

  const DISK = 200; // .fx-disk base size in px
  const coin = () => S.sun.hotspotFor('coin');
  const redSun = () => S.red.hotspotFor('redsun');
  /** Scale needed for the disk (centred at h) to cover the whole viewport */
  const coverScale = (h) => {
    const dx = Math.max(h.x, vw() - h.x);
    const dy = Math.max(h.y, vh() - h.y);
    return (Math.hypot(dx, dy) * 2.1) / DISK;
  };

  /** Camera zoom origins sit on the hotspots → zooms "come out of" them */
  const setOrigins = () => {
    const c = coin();
    cams.sun.style.transformOrigin = `${c.x}px ${c.y}px`;
    const r = redSun();
    cams.red.style.transformOrigin = `${r.x}px ${r.y}px`;
  };

  /* ---------- Torn-paper strips (Red → Hanami) --------------------------- */
  const STRIPS = CONFIG.strips;
  const JAG = 16; // px of jaggedness on each torn edge
  const ROWS = 14;
  const rnd = seeded(5);
  const edges = Array.from({ length: STRIPS + 1 }, (_, i) =>
    Array.from({ length: ROWS + 1 }, () => (i === 0 || i === STRIPS ? 0 : (rnd() - 0.5) * 2 * JAG))
  );
  const stripEls = Array.from({ length: STRIPS }, () => {
    const el = document.createElement('div');
    el.className = 'fx-strip';
    const img = document.createElement('img');
    img.src = 'assets/img/red.webp';
    img.alt = '';
    img.decoding = 'async';
    el.appendChild(img);
    fx.strips.appendChild(el);
    return el;
  });

  /** Position strips so together they look exactly like the red layer */
  const layoutStrips = () => {
    const st = S.red;
    st.layout();
    const sw = vw() / STRIPS;
    stripEls.forEach((el, i) => {
      const left = i * sw - JAG;
      const width = sw + JAG * 2;
      el.style.left = `${left}px`;
      el.style.width = `${width}px`;
      const img = el.firstChild;
      img.style.width = `${st.W}px`;
      img.style.height = `${st.H}px`;
      img.style.left = `${st.x - left}px`;
      img.style.top = `${st.y}px`;
      const pts = [];
      for (let k = 0; k <= ROWS; k++) pts.push(`${(JAG + edges[i][k]).toFixed(1)}px ${((k / ROWS) * 100).toFixed(2)}%`);
      for (let k = ROWS; k >= 0; k--) pts.push(`${(JAG + sw + edges[i + 1][k]).toFixed(1)}px ${((k / ROWS) * 100).toFixed(2)}%`);
      el.style.clipPath = `polygon(${pts.join(',')})`;
    });
  };

  /* ---------- Director --------------------------------------------------- */
  let sunPan = 0;
  const sunFaceFocus = { x: 0.34, y: 0.4 };
  const lastSunFocus = { x: -1, y: -1 };

  function director() {
    const p1 = T.t1 ? T.t1.progress() : 0;
    const p2 = T.t2 ? T.t2.progress() : 0;
    const p3 = T.t3 ? T.t3.progress() : 0;
    const p4 = T.t4 ? T.t4.progress() : 0;

    // Which photo layer is on screen
    show(L.hero, p1 < 0.5);
    show(L.sun, p1 >= 0.5 && p2 < 0.45);
    show(L.red, p2 >= 0.45 && p3 < 0.06);
    show(fx.strips, p3 >= 0.06 && p3 < 0.78);
    show(L.sakura, p3 >= 0.04 && p4 < 0.5);
    show(L.album, p4 >= 0.5);

    // Only render WebGL while the hero layer is visible
    hero3d.active = p1 < 0.5;

    // Sun layer: pan from the coin toward her face while reading, back to the coin for t2
    const base = S.sun.baseFocus;
    const pan = smooth(sunPan) * (1 - smooth(seg(p2, 0, 0.18)));
    const fxv = lerp(base.x, sunFaceFocus.x, pan);
    const fyv = lerp(base.y, sunFaceFocus.y, pan);
    if (Math.abs(fxv - lastSunFocus.x) > 0.0005 || Math.abs(fyv - lastSunFocus.y) > 0.0005) {
      S.sun.focus.x = lastSunFocus.x = fxv;
      S.sun.focus.y = lastSunFocus.y = fyv;
      S.sun.layout();
    }

    // Petal weather: ambient in Red Sun City & Hanami, a storm during t3
    const storm = seg(p3, 0.12, 0.42) * (1 - seg(p3, 0.62, 0.95));
    const ambient = lerp(0.14, 0.3, seg(p3, 0.5, 0.9)) * seg(p2, 0.7, 1) * (1 - seg(p4, 0.05, 0.55));
    const intensity = Math.max(ambient, storm);
    petals.active = intensity > 0.002;
    petals.set(intensity, 0.35 + storm * 3.2, seg(p3, 0.2, 0.55));

    // Theme: dark for prologue & golden hour, light (paper) afterwards
    const theme = p2 >= 0.6 ? 'light' : 'dark';
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  }

  /* ==================================================================== */
  /* 00 · HERO — content drifts away, the 3D system tilts                  */
  /* ==================================================================== */
  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => hero3d.setScroll(self.progress),
  });
  gsap.to('.hero__inner', {
    yPercent: -14,
    opacity: 0.15,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  /* ==================================================================== */
  /* T1 · HERO → GOLDEN HOUR                                              */
  /* Dive into the light of the book… and emerge from the sun in her hand */
  /* ==================================================================== */
  const dive = { v: 0 };
  gsap.set('.coin', { autoAlpha: 0 });
  T.t1 = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: director,
    scrollTrigger: { trigger: '#t1', start: 'top 65%', end: 'bottom bottom', scrub, invalidateOnRefresh: true },
  });
  T.t1
    .fromTo(dive, { v: 0 }, {
      v: 1, duration: 0.5, ease: 'power2.in', ...IR,
      onUpdate: () => gsap.set(cams.hero, { scale: hero3d.setDive(dive.v) }),
    }, 0)
    .fromTo(fx.flash, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: 'power2.in', ...IR }, 0.32)
    // Sun layer starts deep inside the coin and pulls back to reveal her
    .fromTo(cams.sun, { scale: 5 }, { scale: 1, duration: 0.5, ease: 'power3.out', ...IR }, 0.5)
    // Coin FX (huge rotating gradients) only appear once the camera is almost out → cheap
    .fromTo('.coin', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14, ...IR }, 0.8)
    .fromTo(fx.flash, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, ease: 'power1.out', ...IR }, 0.5);
  pulse(T.t1, caps[0], 0.6, 0.12, 0.12, 0.12, 1, 40);

  /* Chapter I reading progress → director pans the sun layer (mobile) */
  ScrollTrigger.create({
    trigger: '#golden',
    start: 'top 60%',
    end: 'bottom 40%',
    onUpdate: (self) => {
      sunPan = self.progress;
      director();
    },
  });

  /* ==================================================================== */
  /* T2 · GOLDEN HOUR → RED SUN CITY                                      */
  /* The golden sun spins up, swallows the screen, turns red and lands as */
  /* the red sun of the next photo.                                       */
  /* ==================================================================== */
  T.t2 = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: director,
    scrollTrigger: { trigger: '#t2', start: 'top 65%', end: 'bottom bottom', scrub, invalidateOnRefresh: true },
  });
  T.t2
    .fromTo('.coin__spin', { rotation: 0, scale: 1 }, { rotation: 260, scale: 1.6, duration: 0.35, ease: 'power2.in', ...IR }, 0)
    // disk appears exactly on the coin…
    .fromTo(fx.disk,
      { autoAlpha: 0, x: () => coin().x - DISK / 2, y: () => coin().y - DISK / 2, scale: () => coin().d / DISK },
      { autoAlpha: 1, duration: 0.03, ...IR }, 0.15)
    // …grows to fill the screen…
    .fromTo(fx.disk, { scale: () => coin().d / DISK }, { scale: () => coverScale(coin()), duration: 0.27, ease: 'power3.in', ...IR }, 0.18)
    // …turns from gold to red…
    .fromTo(fx.diskRed, { opacity: 0 }, { opacity: 1, duration: 0.14, ...IR }, 0.36)
    // …and shrinks onto the red sun of photo 1
    .fromTo(fx.disk,
      { x: () => coin().x - DISK / 2, y: () => coin().y - DISK / 2, scale: () => coverScale(coin()) },
      { x: () => redSun().x - DISK / 2, y: () => redSun().y - DISK / 2, scale: () => redSun().d / DISK, duration: 0.33, ease: 'power3.inOut', ...IR }, 0.45)
    .fromTo(cams.red, { scale: 1.18 }, { scale: 1, duration: 0.45, ease: 'power2.out', ...IR }, 0.45)
    .fromTo(fx.disk, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.1, ...IR }, 0.8)
    // Collage details settle in
    .fromTo('.red__tear--l', { yPercent: 105 }, { yPercent: 0, duration: 0.2, ease: 'power3.out', ...IR }, 0.72)
    .fromTo('.red__tear--r', { yPercent: 105 }, { yPercent: 0, duration: 0.2, ease: 'power3.out', ...IR }, 0.76)
    .fromTo('.red__hud-v', { scaleY: 0 }, { scaleY: 1, duration: 0.14, ...IR }, 0.8)
    .fromTo('.red__hud-h', { scaleX: 0 }, { scaleX: 1, duration: 0.14, ...IR }, 0.84)
    .fromTo('.red__hud-tag', { autoAlpha: 0 }, { autoAlpha: 0.7, duration: 0.1, ...IR }, 0.9);
  pulse(T.t2, caps[1], 0.5, 0.12, 0.14, 0.12, 1, 40);

  /* Chapter II · collage parallax (desktop only) */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 769px)', () => {
    $$('.collage__item[data-speed]').forEach((item) => {
      const speed = +item.dataset.speed;
      gsap.fromTo(item, { y: () => speed * vh() }, {
        y: () => -speed * vh(),
        ease: 'none',
        scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
      });
    });
  });

  /* ==================================================================== */
  /* T3 · RED SUN CITY → HANAMI  (the detailed one)                        */
  /* 1 red slash · 2 paper tears into strips that fall with the wind       */
  /* 3 petal storm (red → pink) · 4 birds escape · 5 pink light leak       */
  /* 6 bloom flash · 7 Hanami focuses in · 8 kanji caption                 */
  /* ==================================================================== */
  gsap.set(fx.birds, { autoAlpha: 0 });
  T.t3 = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: director,
    scrollTrigger: { trigger: '#t3', start: 'top 65%', end: 'bottom bottom', scrub, invalidateOnRefresh: true },
  });
  const R3 = seeded(9);
  const stripRot = stripEls.map(() => (R3() - 0.5) * 34);
  const stripDx = stripEls.map(() => (R3() - 0.15) * 160);

  T.t3
    // collage extras fade before the tear
    .fromTo(['.red__tear', '.red__hud'], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.06, ...IR }, 0)
    // 1 — the slash
    .fromTo(fx.cut, { autoAlpha: 1, scaleX: 0 }, { scaleX: 1, duration: 0.07, ease: 'power2.inOut', ...IR }, 0)
    .fromTo(fx.cut, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.05, ...IR }, 0.1)
    // 2 — strips peel & fall, left to right like the wind
    .fromTo(stripEls,
      { yPercent: 0, rotation: 0, x: 0, transformOrigin: '50% 0%' },
      {
        yPercent: 118,
        rotation: (i) => stripRot[i],
        x: (i) => stripDx[i],
        duration: 0.34,
        ease: 'power2.in',
        stagger: { each: 0.035, from: 'start' },
        ...IR,
      }, 0.1)
    // 7 — Hanami pulls into focus behind the tearing paper
    .fromTo(cams.sakura, { scale: 1.35 }, { scale: 1, duration: 0.62, ease: 'power2.out', ...IR }, 0.08)
    // 4 — a flock escapes across the frame
    .fromTo(fx.birds, { autoAlpha: 1, x: () => -vw() * 0.35, y: () => vh() * 0.12 },
      { x: () => vw() * 1.05, y: () => -vh() * 0.4, duration: 0.5, ease: 'power1.in', ...IR }, 0.12)
    // 5 — pink light leak sweeps through
    .fromTo(fx.leak, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04, ...IR }, 0.2)
    .fromTo(fx.leak, { xPercent: -45 }, { xPercent: 45, duration: 0.34, ease: 'power1.inOut', ...IR }, 0.2)
    .fromTo(fx.leak, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.06, ...IR }, 0.5);

  // Optional depth-of-field blur (high tier only — filters are expensive on phones)
  if (CONFIG.useBlur) {
    T.t3.fromTo(S.sakura.el, { filter: 'blur(14px) brightness(1.2)' }, { filter: 'blur(0px) brightness(1)', duration: 0.5, ease: 'power2.out', ...IR }, 0.14);
  }

  // 6 — bloom flash, 8 — caption with kanji watermark
  pulse(T.t3, fx.bloom, 0.34, 0.08, 0.04, 0.16, 0.85);
  pulse(T.t3, caps[2], 0.55, 0.12, 0.16, 0.12, 1, 40);
  T.t3.fromTo(caps[2].querySelector('.fx-caption__kanji'), { scale: 0.85, rotation: -4 }, { scale: 1.1, rotation: 2, duration: 0.45, ...IR }, 0.5);

  /* Chapter III · horizontal gallery (desktop). Mobile uses native swipe. */
  mm.add('(min-width: 769px)', () => {
    const track = $('#hscrollTrack');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '#hscroll',
        start: 'top top',
        end: () => `+=${dist()}`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
    ScrollTrigger.sort();
  });

  /* ==================================================================== */
  /* T4 · HANAMI → THE ALBUM                                              */
  /* Everything dissolves into white paper; the notebook returns.         */
  /* ==================================================================== */
  T.t4 = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: director,
    scrollTrigger: { trigger: '#t4', start: 'top 65%', end: 'bottom bottom', scrub, invalidateOnRefresh: true },
  });
  T.t4
    .fromTo(fx.white, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'power2.in', ...IR }, 0.1)
    .fromTo(fx.white, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35, ease: 'power2.out', ...IR }, 0.55)
    .fromTo(cams.album, { scale: 1.3, yPercent: 8 }, { scale: 1, yPercent: 0, duration: 0.5, ease: 'power3.out', ...IR }, 0.5);
  pulse(T.t4, caps[3], 0.56, 0.12, 0.12, 0.12, 1, 40);

  /* ==================================================================== */
  /* CHAPTER CONTENT REVEALS                                               */
  /* ==================================================================== */

  // Split-text titles (everything except the hero, which intro.js handles)
  $$('main [data-split]').forEach((el) => {
    if (el.id === 'heroTitle') return;
    const { words } = splitText(el, { chars: false });
    gsap.fromTo(words, { yPercent: 110, rotate: 4 }, {
      yPercent: 0, rotate: 0, duration: 1.3, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  // Eyebrows, ledes & counters fade up
  $$('.chapter__head .eyebrow, .chapter__lede, .chapter__count, .contact__lede, .contact__actions, .contact .eyebrow').forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 24 }, {
      autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  // Gallery cards: curtain-wipe the photo, lift the card
  const cards = $$('.card');
  gsap.set(cards, { autoAlpha: 0, y: 70 });
  ScrollTrigger.batch(cards, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => {
      gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 });
      gsap.fromTo(batch.map((c) => c.querySelector('.card__media')),
        { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out', stagger: 0.1, clearProps: 'clipPath' });
    },
  });

  /* ==================================================================== */
  /* NAV STATE + PROGRESS                                                 */
  /* ==================================================================== */
  const navLinks = $$('[data-nav]');
  const progressLabel = $('#progressLabel');
  const setActive = (i) => {
    navLinks.forEach((a) => a.classList.toggle('is-active', +a.dataset.nav === i));
    if (progressLabel) progressLabel.textContent = String(i).padStart(2, '0');
  };
  // Active chapter = last chapter whose top has passed 55% of the viewport.
  // Computed from scroll position (robust even when jumping far with the menu).
  const chapterEls = $$('main [data-chapter]');
  let chapterStarts = [];
  let activeChapter = -1;
  const measureChapters = () => {
    chapterStarts = chapterEls.map((el) => el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55);
  };
  const updateActive = (y) => {
    let a = 0;
    chapterStarts.forEach((start, i) => { if (y >= start) a = i; });
    if (a !== activeChapter) {
      activeChapter = a;
      setActive(+chapterEls[a].dataset.chapter);
    }
  };
  ScrollTrigger.addEventListener('refresh', () => {
    measureChapters();
    updateActive(window.scrollY);
  });
  measureChapters();
  setActive(0);

  const bar = $('#progressBar');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      bar.style.transform = `scaleY(${self.progress.toFixed(4)})`;
      updateActive(self.scroll());
    },
  });

  /* ==================================================================== */
  /* REFRESH PLUMBING                                                     */
  /* ==================================================================== */
  const beforeRefresh = () => {
    stages.layoutAll();
    setOrigins();
    layoutStrips();
  };
  ScrollTrigger.addEventListener('refreshInit', beforeRefresh);
  ScrollTrigger.addEventListener('refresh', director);
  beforeRefresh();
  director();

  return { director, timelines: T };
}
