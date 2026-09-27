/* ==========================================================================
   LOADER.JS — preload → the notebook falls → camera zoom → cover opens →
   the first page (photo 4) expands into the full-screen hero.
   ========================================================================== */

import { reducedMotion } from './config.js';
import { $, preloadImages } from './utils.js';

/** Everything the first minutes of the experience need */
const ASSETS = [
  'assets/img/book-cover.webp',
  'assets/img/book-rings.png',
  'assets/img/hero.webp',
  'assets/img/hero-clean.webp',
  'assets/img/leather.jpg',
  'assets/img/sun.webp',
  'assets/img/red.webp',
  'assets/img/sakura.webp',
  'assets/img/album.webp',
];

/**
 * @param {{ onReveal: Function }} opts — onReveal fires the moment the hero is fully on screen
 * @returns {Promise<void>} resolves when the loader has been removed
 */
export async function runLoader({ onReveal }) {
  const root = $('#loader');
  const countEl = $('#loaderCount');
  const bar = $('#loaderBar');
  const scene = $('#loaderScene');
  const lb = $('#lb');
  const body = $('.lb__body', lb);
  const cover = $('.lb__cover', lb);
  const shadow = $('.lb__shadow', lb);
  const pageGlow = $('.lb__page-glow', lb);
  const pageImg = $('.lb__page img', lb);
  const page = $('.lb__page', lb);
  const sheen = $('.lb__sheen', lb);
  const portal = $('#loaderPortal');
  const portalCam = $('.cam', portal);
  const dustWrap = $('#lbDust');
  const skip = $('#loaderSkip');

  /* ---------- 1. Progress counter ------------------------------------- */
  const shown = { v: 0 };
  const render = () => {
    countEl.textContent = String(Math.round(shown.v)).padStart(3, '0');
    bar.style.transform = `scaleX(${shown.v / 100})`;
  };

  let skipped = false;
  const minTime = new Promise((r) => setTimeout(r, reducedMotion ? 150 : 1100));
  skip.addEventListener('click', () => {
    skipped = true;
    tl?.timeScale(7);
  });

  await Promise.all([
    preloadImages(ASSETS, (p) =>
      gsap.to(shown, { v: p * 100, duration: 0.5, ease: 'power2.out', overwrite: true, onUpdate: render })
    ),
    document.fonts ? document.fonts.ready : Promise.resolve(),
    minTime,
  ]);
  await gsap.to(shown, { v: 100, duration: 0.35, overwrite: true, onUpdate: render });

  /* ---------- 2. Reduced motion: simple crossfade --------------------- */
  if (reducedMotion) {
    await gsap.to(root, { autoAlpha: 0, duration: 0.4 });
    root.remove();
    onReveal();
    return;
  }

  /* ---------- 3. Impact dust particles --------------------------------- */
  const dust = Array.from({ length: 16 }, () => {
    const s = document.createElement('span');
    dustWrap.appendChild(s);
    return s;
  });
  gsap.set(dustWrap, { y: () => lb.offsetHeight / 2 });

  /** Book scale so the page fills most of the screen */
  const zoomScale = () => {
    const r = lb.getBoundingClientRect();
    return Math.min((window.innerHeight * 0.84) / r.height, (window.innerWidth * 0.9) / r.width);
  };

  /** clip-path matching the book page's current rect */
  const pageClip = () => {
    const r = page.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    return `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round 6px)`;
  };

  gsap.set(portal, { autoAlpha: 0 });

  /* ---------- 4. The cinematic timeline -------------------------------- */
  var tl = gsap.timeline({ defaults: { ease: 'power3.inOut' } });
  if (skipped) tl.timeScale(7);

  tl.set(lb, { autoAlpha: 1 })
    // FALL — accelerating, tumbling slightly in 3D
    .fromTo(lb,
      { y: () => -window.innerHeight * 0.95, rotation: -22, rotationX: 38, rotationY: -24 },
      { y: 0, rotation: -3, rotationX: 0, rotationY: 0, duration: 1.05, ease: 'power2.in' })
    .fromTo(shadow, { scale: 0.25, opacity: 0 }, { scale: 1, opacity: 0.6, duration: 1.05, ease: 'power2.in' }, '<')
    .addLabel('impact')

    // IMPACT — bounce, squash & stretch, dust, camera shake
    .to(lb, {
      keyframes: [
        { y: -26, rotation: -1, duration: 0.2, ease: 'power2.out' },
        { y: 0, rotation: 0, duration: 0.3, ease: 'bounce.out' },
      ],
    }, 'impact')
    .to(body, {
      transformOrigin: '50% 100%',
      keyframes: [
        { scaleY: 0.955, scaleX: 1.03, duration: 0.07, ease: 'power1.out' },
        { scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.45)' },
      ],
    }, 'impact')
    .to(shadow, { keyframes: [{ scale: 0.8, opacity: 0.35, duration: 0.2 }, { scale: 1, opacity: 0.6, duration: 0.3 }] }, 'impact')
    .fromTo(dust,
      { x: 0, y: 0, scale: 0.4, opacity: 0.9 },
      {
        x: (i) => (i % 2 ? 1 : -1) * (40 + Math.random() * 150),
        y: () => -8 - Math.random() * 46,
        scale: () => 1.5 + Math.random() * 2.5,
        opacity: 0, duration: 1.1, ease: 'power3.out',
      }, 'impact')
    .to(scene, {
      keyframes: [
        { x: -7, y: 4, duration: 0.05 }, { x: 6, y: -3, duration: 0.05 },
        { x: -3, y: 2, duration: 0.05 }, { x: 0, y: 0, duration: 0.1 },
      ],
      ease: 'none',
    }, 'impact')
    .to('.loader__meta', { autoAlpha: 0, y: 24, duration: 0.6, ease: 'power2.inOut' }, 'impact+=0.3')

    // ZOOM — the camera pushes in on the notebook
    .addLabel('zoom', 'impact+=0.75')
    .to(scene, { scale: () => zoomScale(), duration: 1.4, ease: 'power3.inOut' }, 'zoom')
    .to(shadow, { opacity: 0, duration: 0.6 }, 'zoom')
    .fromTo(sheen, { xPercent: -70 }, { xPercent: 70, duration: 1.2, ease: 'power2.inOut' }, 'zoom+=0.2')

    // OPEN — cover swings open on the spiral, light spills out of the page
    .addLabel('open', 'zoom+=1.15')
    .to(cover, { rotationY: -172, duration: 1.55, ease: 'power3.inOut' }, 'open')
    .to(pageGlow, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 'open+=0.35')
    .to(pageImg, { scale: 1.12, duration: 1.7, ease: 'power2.out' }, 'open')
    .to('.loader__paper', { opacity: 0, duration: 1.2, ease: 'power2.inOut' }, 'open+=0.3')
    .add(() => root.classList.add('is-dark'), 'open+=0.6')

    // PORTAL — the page grows into the full-screen hero
    .addLabel('portal', 'open+=1.3')
    .to(portal, { autoAlpha: 1, duration: 0.35, ease: 'power1.out' }, 'portal')
    .fromTo(portal,
      { clipPath: () => pageClip() },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: 1.25, ease: 'expo.inOut', immediateRender: false }, 'portal')
    .fromTo(portalCam, { scale: 1.3 }, { scale: 1, duration: 1.35, ease: 'expo.inOut', immediateRender: false }, 'portal')
    .to(scene, { scale: '+=0.8', autoAlpha: 0, duration: 1, ease: 'expo.in' }, 'portal')
    .addLabel('done', 'portal+=1.35');

  // The portal is pixel-identical to the hero layer underneath → remove & reveal
  await new Promise((resolve) => tl.add(resolve, 'done'));
  root.remove();
  onReveal();
}
