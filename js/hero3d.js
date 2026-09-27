/* ==========================================================================
   HERO3D.JS — Three.js scene: antique books orbiting the glowing book
   ─────────────────────────────────────────────────────────────────────────
   • The background photo (photo 4, cleaned) already contains the glowing book.
   • 3D books + loose pages orbit around the screen centre on tilted rings,
     following the same diagonal as the original photo.
   • An invisible "occluder" disc writes depth at the centre, so books that
     pass BEHIND the light truly disappear behind it → real orbit illusion.
   • Budget-aware: DPR cap, FPS cap, instancing for pages, no post-processing.
   ========================================================================== */

import * as THREE from 'three';
import { CONFIG, reducedMotion } from './config.js';
import { clamp, damp, lerp, seeded } from './utils.js';

const TAU = Math.PI * 2;
const CORE_R = 0.06; // radius of the bright core, as a fraction of the photo width
const CAM_Z = 12;

const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Hero3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./stage.js').Stage} stage — hero stage (to match the photo's scale)
   */
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.active = true;
    this.pointer = { x: 0, y: 0 }; // target (-1..1)
    this.cur = { x: 0, y: 0 }; // smoothed
    this.state = { reveal: 0, dive: 0, scroll: 0 };
    this.time = 0;
    this.acc = 0;
    this.frameInterval = 1 / CONFIG.hero.fps;
    this.motion = reducedMotion ? 0.25 : 1;
    this.rand = seeded(42);

    this.#initRenderer();
    this.#initLights();
    this.#initMaterials();
    this.#initSystem();
    this.#initBooks();
    this.#initPages();
    this.#initDust();
    this.#initCore();
    this.resize();
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                              */
  /* ------------------------------------------------------------------ */

  #initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: CONFIG.hero.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(CONFIG.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    this.camera.position.set(0, 0, CAM_Z);
  }

  #initLights() {
    // Cool space ambience + warm light radiating from the glowing book
    this.scene.add(new THREE.AmbientLight(0x9aa6ff, 0.6));
    this.scene.add(new THREE.HemisphereLight(0xc4d4ff, 0x1a0c05, 0.4));

    this.coreLight = new THREE.PointLight(0xffc27a, 36, 0, 1.6);
    this.scene.add(this.coreLight);

    const key = new THREE.DirectionalLight(0xfff1dc, 0.65);
    key.position.set(-3, 4, 8);
    this.scene.add(key);
  }

  /** Small procedural canvas textures (no extra downloads) */
  #canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  #initMaterials() {
    const leather = new THREE.TextureLoader().load('assets/img/leather.jpg');
    leather.colorSpace = THREE.SRGBColorSpace;
    leather.anisotropy = 4;

    // Page edges: fine stripes (vertical for the fore-edge, horizontal for top/bottom)
    const stripes = (vertical) =>
      this.#canvasTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#e9dcc0';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 64; i += 2) {
          g.fillStyle = i % 4 ? 'rgba(120,90,50,.18)' : 'rgba(255,255,255,.35)';
          vertical ? g.fillRect(i, 0, 1, h) : g.fillRect(0, i, w, 1);
        }
      });

    // A touch of self-illumination keeps covers readable on the dark side of the orbit
    const cover = new THREE.MeshStandardMaterial({
      map: leather, roughness: 0.55, metalness: 0.25,
      emissive: 0xffffff, emissiveMap: leather, emissiveIntensity: 0.42,
    });
    const spine = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6, metalness: 0.2, emissive: 0x2a160a, emissiveIntensity: 0.6 });
    const edgeV = new THREE.MeshStandardMaterial({ map: stripes(true), roughness: 0.9 });
    const edgeH = new THREE.MeshStandardMaterial({ map: stripes(false), roughness: 0.9 });

    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    this.bookMaterials = [edgeV, spine, edgeH, edgeH, cover, cover];
    this.bookGeometry = new THREE.BoxGeometry(0.62, 0.86, 0.16);

    // Loose page with faux text lines
    this.pageTexture = this.#canvasTexture(192, 256, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w);
      grd.addColorStop(0, '#f6ecd6');
      grd.addColorStop(1, '#cdb58c');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(60,40,20,.55)';
      g.fillRect(28, 26, 90, 7);
      for (let y = 48; y < h - 24; y += 10) {
        const len = 120 + Math.random() * 20 - (Math.random() < 0.15 ? 60 : 0);
        g.fillStyle = 'rgba(60,40,20,.32)';
        g.fillRect(24, y, len, 3);
      }
    });

    // Soft round sprite for dust + glow
    this.dotTexture = this.#canvasTexture(64, 64, (g, w) => {
      const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,220,160,.6)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, w);
    });
  }

  /** Orbit system: an outer group (screen-plane rotation) with tilted rings inside */
  #initSystem() {
    this.system = new THREE.Group();
    this.scene.add(this.system);

    // Each ring is a slightly different tilt → layered, organic orbits
    this.rings = [0.3, 0.46, 0.38].map((tilt) => {
      const g = new THREE.Group();
      g.rotation.x = tilt;
      this.system.add(g);
      return g;
    });
  }

  #initBooks() {
    const R = this.rand;
    this.books = [];
    const n = CONFIG.hero.books;

    for (let i = 0; i < n; i++) {
      const ring = i % 2; // inner / outer ring
      const mesh = new THREE.Mesh(this.bookGeometry, this.bookMaterials);
      mesh.rotation.set(R() * TAU, R() * TAU, R() * TAU);
      this.rings[ring].add(mesh);

      this.books.push({
        mesh,
        r: ring ? lerp(3.7, 5.4, R()) : lerp(2.0, 3.1, R()),
        a: (i / n) * TAU + R() * 0.6,
        y: (R() - 0.5) * 0.6,
        speed: (ring ? 0.1 : 0.17) * lerp(0.75, 1.3, R()),
        axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        spin: lerp(0.25, 0.9, R()),
        scale: lerp(0.55, 1.0, R()),
        delay: R() * 0.5,
      });
    }
  }

  #initPages() {
    const R = this.rand;
    const n = CONFIG.hero.pages;
    const mat = new THREE.MeshStandardMaterial({
      map: this.pageTexture,
      side: THREE.DoubleSide,
      roughness: 0.85,
      emissive: new THREE.Color(0x3a2408),
      emissiveIntensity: 0.35,
    });
    this.pagesMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.46), mat, n);
    this.pagesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pagesMesh.frustumCulled = false;
    this.rings[2].add(this.pagesMesh);

    this.dummy = new THREE.Object3D();
    this.pages = Array.from({ length: n }, () => ({
      r: lerp(1.7, 5.8, R()),
      a: R() * TAU,
      y: (R() - 0.5) * 0.9,
      speed: lerp(0.12, 0.3, R()),
      rot: new THREE.Euler(R() * TAU, R() * TAU, R() * TAU),
      rs: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(2.2),
      scale: lerp(0.6, 1.0, R()),
      delay: R() * 0.6,
    }));
  }

  #initDust() {
    const R = this.rand;
    const n = CONFIG.hero.dust;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU;
      const r = lerp(1.2, 7, Math.pow(R(), 0.7));
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (R() - 0.5) * 1.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMaterial = new THREE.PointsMaterial({
      size: 0.07,
      map: this.dotTexture,
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, this.dustMaterial);
    this.rings[1].add(this.dust);
  }

  #initCore() {
    // Invisible depth-only disc = the light's "body". Books behind it get hidden.
    this.occluder = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    this.occluder.renderOrder = -1;
    this.scene.add(this.occluder);

    // Additive bloom sprite that breathes on top of the photo's glow
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.dotTexture,
        color: 0xffd08a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.glow.position.z = 0.05;
    this.scene.add(this.glow);
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  /** Match canvas + orbit layout to the viewport */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const aspect = w / h;
    const portrait = aspect < 0.9;
    // Diagonal band like the original photo (steeper on portrait screens)
    this.system.rotation.z = portrait ? 1.05 : 0.49;
    this.radiusScale = portrait ? 0.6 : clamp(aspect / 1.65, 0.75, 1.05);
    this.bookScale = portrait ? 0.78 : 1;

    // Convert the photo's bright-core radius (px) into world units at z = 0
    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * CAM_Z;
    const worldPerPx = visibleH / h;
    this.coreR = CORE_R * (this.stage?.W || w) * worldPerPx;
    this.occluder.scale.setScalar(this.coreR);
    this.glow.scale.setScalar(this.coreR * 6);
  }

  /** Pointer in normalised device coords (-1..1) */
  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** Hero scroll progress (0..1) → gentle tilt of the system */
  setScroll(p) {
    this.state.scroll = p;
  }

  /**
   * Dive into the light (Hero → Golden Hour).
   * Returns the CSS scale the background must use to stay in sync with the camera.
   */
  setDive(v) {
    this.state.dive = v;
    const z = lerp(CAM_Z, 4.4, v);
    this.camera.position.z = z;
    this.renderer.toneMappingExposure = 1.1 + v * 1.4;
    return CAM_Z / z;
  }

  /** Intro: books "wake up" and begin to orbit */
  intro() {
    return gsap.to(this.state, { reveal: 1, duration: 2.8, ease: 'power2.out' });
  }

  /** Called every tick from the shared GSAP ticker */
  update(dt) {
    if (!this.active) return;
    this.acc += dt;
    if (this.acc < this.frameInterval * 0.92) return; // FPS cap
    const step = Math.min(this.acc, 0.1);
    this.acc = 0;
    this.time += step;

    const { reveal, dive, scroll } = this.state;
    const speedMul = (reveal * (1 + dive * 5)) * this.motion;

    // Smooth pointer → camera parallax (origin always stays centred)
    this.cur.x = damp(this.cur.x, this.pointer.x, 3, step);
    this.cur.y = damp(this.cur.y, this.pointer.y, 3, step);
    const sway = Math.sin(this.time * 0.25) * 0.25 * this.motion;
    this.camera.position.x = this.cur.x * 0.8 + sway;
    this.camera.position.y = this.cur.y * 0.5;
    this.camera.lookAt(0, 0, 0);

    this.system.rotation.x = scroll * 0.35;

    // Books
    const rs = this.radiusScale;
    for (const b of this.books) {
      b.a += b.speed * speedMul * step;
      b.mesh.position.set(Math.cos(b.a) * b.r * rs, b.y, Math.sin(b.a) * b.r * rs);
      b.mesh.rotateOnAxis(b.axis, b.spin * step * (0.3 + speedMul));
      const t = clamp(reveal * 1.6 - b.delay);
      b.mesh.visible = t > 0.001;
      b.mesh.scale.setScalar(Math.max(0.0001, easeOutBack(t)) * b.scale * this.bookScale);
    }

    // Pages (instanced)
    const d = this.dummy;
    this.pages.forEach((p, i) => {
      p.a += p.speed * speedMul * step;
      p.rot.x += p.rs.x * step * (0.2 + speedMul);
      p.rot.y += p.rs.y * step * (0.2 + speedMul);
      p.rot.z += p.rs.z * step * (0.2 + speedMul);
      d.position.set(Math.cos(p.a) * p.r * rs, p.y + Math.sin(this.time + i) * 0.08, Math.sin(p.a) * p.r * rs);
      d.rotation.copy(p.rot);
      const t = clamp(reveal * 1.6 - p.delay);
      d.scale.setScalar(Math.max(0.0001, t) * p.scale * this.bookScale);
      d.updateMatrix();
      this.pagesMesh.setMatrixAt(i, d.matrix);
    });
    this.pagesMesh.instanceMatrix.needsUpdate = true;

    // Dust drifts slowly
    this.dust.rotation.y += step * 0.03 * (1 + dive * 6) * this.motion;
    this.dustMaterial.opacity = 0.85 * reveal;

    // Core: occluder faces the camera, glow breathes
    this.occluder.quaternion.copy(this.camera.quaternion);
    this.glow.material.opacity = (0.35 + Math.sin(this.time * 1.6) * 0.1) * reveal + dive * 0.6;
    this.coreLight.intensity = 36 + Math.sin(this.time * 1.6) * 6 + dive * 60;

    this.renderer.render(this.scene, this.camera);
  }
}
