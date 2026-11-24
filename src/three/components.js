import * as THREE from 'three';
// Model komponen (asli dari components3d.js).

  const M = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? .6 : r, metalness: m || 0 });
  const K = { blk: M(0x16171a, .55), pcb: M(0x15171a, .45), sil: M(0xc9ccd1, .35, .5), gold: M(0xd7a93c, .3, .6), cream: M(0xeadfc8, .9), yel: M(0xe0a81c, .55), wht: M(0xf2f2f2, .5), dk: M(0x050505, .8) };
  const B = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o };
  const C = (r, h, m, x, y, z, p, rx, rz, s) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s || 28), m); o.position.set(x, y, z); o.rotation.set(rx || 0, 0, rz || 0); p.add(o); return o };
  const T = (pts, r, m, p) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(a => new THREE.Vector3(a[0], a[1], a[2]))), 60, r, 8), m); p.add(o); return o };
  const CT = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t };
  const PL = (w, h, tex, x, y, z, p, rx, ry, rz) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: .5, transparent: true })); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o };
  const DISC = (r, h, m, x, y, z, p) => C(r, h, m, x, y, z, p, Math.PI / 2);
  function patch(L, R, ang, tex) {
    const nx = 24, na = 8, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= na; j++) { const a = (j / na - .5) * ang; pos.push(-L / 2 + L * i / nx, R * Math.sin(a), R * Math.cos(a)); uv.push(i / nx, j / na) }
    for (let i = 0; i < nx; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals();
    return new THREE.Mesh(ge, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .4, side: THREE.DoubleSide }));
  }

  export const build = {
    esp32() {
      const g = new THREE.Group();
      B(5.2, .14, 2.8, K.pcb, 0, 0, 0, g);
      B(2.6, .07, 1.9, M(0x0b0b0d, .5), 1.3, .1, 0, g); B(1.8, .24, 1.8, K.sil, .95, .2, 0, g);
      [-.6, -.3, 0, .3, .6].forEach(z => B(.55, .02, .06, K.gold, 2.25, .15, z, g));
      for (let i = 0; i < 15; i++) { const x = -2.3 + i * .33; C(.05, .5, K.gold, x, .05, -1.28, g); C(.05, .5, K.gold, x, .05, 1.28, g) }
      B(.85, .3, .85, K.sil, -2.2, .22, 0, g); B(.05, .14, .5, K.blk, -2.64, .22, 0, g);
      [-.9, .9].forEach(z => { B(.5, .16, .5, K.sil, -1.9, .15, z, g); C(.13, .12, K.blk, -1.9, .27, z, g) });
      B(.75, .18, .55, K.blk, -1.15, .16, -.7, g); B(.45, .18, .28, M(0xd9a03a, .5), -.45, .15, -.85, g); B(.6, .12, .6, M(0x2a2a2e, .4), -1.2, .13, .7, g);
      [-.2, 0, .2, .4].forEach(x => B(.16, .06, .34, K.blk, x, .1, .1, g));
      [[-2.4, -1.2], [-2.4, 1.2], [2.4, -1.2], [2.4, 1.2]].forEach(a => C(.14, .02, K.dk, a[0], .08, a[1], g));
      return g;
    },
    xl4015() {
      const g = new THREE.Group();
      B(5.1, .12, 2.3, M(0x1f4fa8, .45), 0, 0, 0, g);
      B(1.15, .36, 1.05, K.blk, -.95, .24, -.05, g); for (let i = 0; i < 5; i++) B(.09, .05, .38, K.sil, -1.35 + i * .2, .1, .65, g);
      const co = new THREE.Mesh(new THREE.TorusGeometry(.72, .3, 18, 44), M(0xc47a2c, .35, .5)); co.rotation.x = Math.PI / 2; co.position.set(.45, .48, .1); g.add(co);
      const gc = new THREE.Mesh(new THREE.TorusGeometry(.72, .26, 14, 40), M(0x79b36e, .7)); gc.rotation.x = Math.PI / 2; gc.position.set(.45, .34, .1); g.add(gc);
      B(.95, .75, .85, M(0x1d3fa0, .45), .4, .5, -.85, g); C(.13, .08, K.gold, .2, .92, -.85, g, 0, 0, 12).rotation.x = 0;
      [[-2.0, .35], [2.0, -.45]].forEach(a => { B(1.0, .12, 1.0, K.blk, a[0], .1, a[1], g); const c = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .8, 28), M(0xcdd0d4, .3, .5)); c.position.set(a[0], .55, a[1]); g.add(c) });
      [[-2.4, -.95], [-2.4, .95], [2.4, -.95], [2.4, .95]].forEach(a => { B(.5, .05, .5, K.sil, a[0], .08, a[1], g); C(.1, .07, K.dk, a[0], .1, a[1], g) });
      B(.5, .1, .3, K.blk, -.2, .1, .85, g);
      return g;
    },
    servo() {
      const g = new THREE.Group(), bk = M(0x1b1b1e, .5), bk2 = M(0x222226, .5);
      B(4.07, 3.4, 1.97, bk, 0, 0, 0, g); B(5.5, .28, 1.97, bk, 0, .55, 0, g); B(4.07, .45, 1.97, bk2, 0, 1.925, 0, g);
      [[-2.45, -.55], [-2.45, .55], [2.45, -.55], [2.45, .55]].forEach(a => C(.2, .3, K.dk, a[0], .55, a[1], g, 0, 0, 16));
      C(.75, .3, bk2, 1.2, 2.3, 0, g); C(.32, .5, K.sil, 1.2, 2.7, 0, g, 0, 0, 20); C(.12, .06, M(0x777777, .3, .6), 1.2, 3.0, 0, g, 0, 0, 12);
      const tex = CT(512, 270, (x, w, h) => {
        x.fillStyle = '#d8499a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
        x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'italic 600 34px sans-serif'; x.fillText('TowerPro', w / 2, 58);
        x.fillStyle = '#111'; x.fillRect(40, 78, w - 80, 90); x.fillStyle = '#fff'; x.font = 'bold 72px sans-serif'; x.fillText('MG996R', w / 2, 152);
        x.fillStyle = '#fff'; x.font = 'bold 36px sans-serif'; x.fillText('DIGI HI TORQUE', w / 2, 225);
      });
      PL(1.9, 1.0, tex, -.75, 2.16, 0, g, -Math.PI / 2);
      [[0x6b3b1e, -.12], [0xcc2a22, 0], [0xdd8822, .12]].forEach(a => T([[-2.0, -1.0, a[1]], [-3.0, -1.2, a[1] + .2], [-3.8, -.8, a[1] + .5], [-4.4, -.9, a[1] + .9]], .05, M(a[0], .6), g));
      return g;
    },
    battery() {
      const g = new THREE.Group(), L = 6.5, R = .9;
      C(R, L, M(0x1f4fd0, .4), 0, 0, 0, g, 0, -Math.PI / 2, 40);
      C(.72, .08, K.wht, L / 2 + .02, 0, 0, g, 0, -Math.PI / 2); C(.36, .26, K.sil, L / 2 + .12, 0, 0, g, 0, -Math.PI / 2);
      C(R * .9, .05, K.sil, -L / 2 - .01, 0, 0, g, 0, -Math.PI / 2);
      const tex = CT(1024, 128, (x, w, h) => { x.fillStyle = '#dbe6ff'; x.font = 'bold 66px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('+  ICR 18650  3000mAh  3.7V  -', w / 2, h / 2) });
      g.add(patch(5.5, R + .006, .77, tex));
      return g;
    },
    mini360() {
      const g = new THREE.Group();
      B(3.4, .1, 2.2, M(0x1d8a3a, .45), 0, 0, 0, g);
      B(1.7, .55, 1.6, M(0x6c6e73, .5), 1.0, .33, -.2, g);
      B(1.1, .12, 1.0, K.blk, -.8, .11, .45, g); for (let i = 0; i < 4; i++) { B(.07, .05, .2, K.sil, -1.2 + i * .27, .08, .05, g); B(.07, .05, .2, K.sil, -1.2 + i * .27, .08, .95, g) }
      C(.34, .12, K.sil, -.3, .15, -.8, g, 0, 0, 24);
      [[-1.3, -.6], [-.7, -.65], [-1.3, 0], [.35, .85]].forEach(a => B(.4, .1, .28, M(0xb08f5a, .6), a[0], .08, a[1], g));
      [[-1.5, -.9], [-1.5, .9], [1.5, -.9], [1.5, .9]].forEach(a => { C(.2, .03, K.sil, a[0], .06, a[1], g, 0, 0, 20); C(.08, .04, K.dk, a[0], .07, a[1], g, 0, 0, 12) });
      return g;
    },
    fuse() {
      const g = new THREE.Group(), f = new THREE.Group(); f.position.set(-1.9, 0, 0); g.add(f);
      DISC(.82, .7, K.blk, 0, 0, 1.6, f);
      PL(1.5, 1.5, CT(256, 256, (x, w, h) => { x.fillStyle = '#f4f4f4'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.fillText('FUSE', w / 2, 120); x.strokeStyle = '#f4f4f4'; x.lineWidth = 10; x.beginPath(); x.arc(w / 2, 150, 48, .3, 2.7); x.stroke(); x.beginPath(); x.moveTo(w / 2 - 70, 160); x.lineTo(w / 2 - 44, 196); x.lineTo(w / 2 - 20, 160); x.stroke() }), 0, 0, 1.96, f);
      DISC(.9, .12, K.wht, 0, 0, 1.15, f); C(.92, .2, M(0x8b8d91, .4, .5), 0, 0, .9, f, Math.PI / 2, 0, 6);
      DISC(.58, 1.2, M(0x1a1a1c, .5), 0, 0, .2, f); DISC(.5, 1.9, K.blk, 0, 0, -1.1, f);
      B(.6, .05, 1.1, K.sil, 0, .55, -2.0, f); C(.09, .07, K.dk, 0, .58, -2.3, f, 0, 0, 12);
      const s = new THREE.Group(); s.position.set(1.9, -.2, 0); g.add(s);
      B(2.4, 1.3, 1.8, K.blk, 0, -.35, 0, s); B(2.7, .22, 2.1, K.blk, 0, .4, 0, s);
      const r = new THREE.Group(); r.position.set(0, .8, 0); r.rotation.z = .2; s.add(r);
      B(2.0, .6, 1.5, M(0x111214, .35), 0, 0, 0, r);
      PL(1.8, 1.3, CT(256, 200, (x, w, h) => { x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 14; x.beginPath(); x.arc(w * .72, h / 2, 34, 0, 7); x.stroke(); x.fillRect(w * .2 - 6, h / 2 - 34, 12, 68) }), 0, .31, 0, r, -Math.PI / 2);
      B(.12, .8, .4, K.sil, -.5, -1.35, .35, s); B(.12, .8, .4, K.sil, .5, -1.35, .35, s);
      B(.1, .7, .5, M(0x222222, .6), -1.25, -.5, 0, s); B(.1, .7, .5, M(0x222222, .6), 1.25, -.5, 0, s);
      return g;
    },
    charger() {
      const g = new THREE.Group();
      B(3.2, 2.2, 1.5, K.blk, 0, 0, 0, g); B(3.0, 2.4, 1.3, K.blk, 0, 0, 0, g);
      C(.1, 1.1, K.sil, -.95, 0, -1.1, g, Math.PI / 2, 0, 16); C(.1, 1.1, K.sil, .95, 0, -1.1, g, Math.PI / 2, 0, 16);
      PL(2.4, 1.1, CT(512, 240, (x, w, h) => { x.fillStyle = '#b9bcc2'; x.textAlign = 'center'; x.font = 'bold 40px sans-serif'; x.fillText('AC/DC ADAPTER', w / 2, 70); x.font = 'bold 56px sans-serif'; x.fillText('OUTPUT 5V 2A', w / 2, 160) }), 0, 0, .76, g);
      T([[1.6, .2, 0], [2.5, .5, .2], [3.1, 0, .9], [2.5, -.6, 1.5], [1.5, -.3, 1.3], [1.6, .2, 2.1], [2.8, -.2, 2.6], [3.6, -.3, 2.6]], .08, K.blk, g);
      B(.5, .5, .7, K.blk, 3.7, -.3, 2.6, g); B(.9, .22, .55, K.sil, 4.3, -.3, 2.6, g);
      return g;
    },
    frame() {
      const g = new THREE.Group(), e = M(0xcf9e63, .8);
      const wood = CT(512, 512, (x, w, h) => { x.fillStyle = '#d9b07c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { x.strokeStyle = 'rgba(150,100,50,' + (.1 + Math.random() * .2) + ')'; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y = Math.random() * h; x.moveTo(0, y); for (let xx = 0; xx <= w; xx += 64) x.lineTo(xx, y + Math.sin(xx * .02 + i) * 5); x.stroke() } });
      for (let i = 0; i < 5; i++) {
        const top = i === 4 ? new THREE.MeshStandardMaterial({ map: wood, roughness: .8 }) : M(0xdcb683, .8);
        const o = new THREE.Mesh(new THREE.BoxGeometry(6, .18, 4), [e, e, top, e, e, e]); o.position.set(i * .05, i * .2, 0); o.rotation.y = (i - 2) * .06; g.add(o);
      }
      [-1.7, 0, 1.7].forEach((x, i) => { B(1.2, .4, .8, K.yel, x, 1.1, .2, g); B(.7, .18, .5, K.cream, x, 1.25, .2, g); if (i < 2) { B(.15, .12, .12, K.cream, x + .85, 1.1, .05, g); B(.15, .12, .12, K.cream, x + .85, 1.1, .35, g) } });
      T([[-2.4, 1.38, .3], [-1.7, 1.36, .25], [0, 1.36, .25], [1.7, 1.36, .25], [2.4, 1.0, .7], [2.9, .5, 1.6], [2.4, .98, 2.0]], .04, K.blk, g);
      return g;
    },
    led() {
      const g = new THREE.Group();
      const palette = [0x00d4ff, 0x38bdf8, 0xf5b82e, 0xff6a1f, 0xec4899, 0xa855f7, 0x22c55e, 0x06b6d4];
      const padM = M(0xd9a13b, .35, .65);
      const smdBody = M(0xf5f5f7, .45);
      [-.85, .85].forEach((zOff, sIdx) => {
        const strip = new THREE.Group();
        strip.position.set(0, 0, zOff);
        // PCB fleksibel hitam
        B(6.6, .08, .92, K.pcb, 0, 0, 0, strip);
        // Strip difuser tipis di bawah
        B(6.5, .04, .82, M(0x2a2d34, .7), 0, -.05, 0, strip);
        // 8 chip LED SMD 5050 + pad tembaga
        for (let i = 0; i < 8; i++) {
          const x = -2.625 + i * .75;
          const col = palette[(i + sIdx * 3) % palette.length];
          B(.42, .12, .42, smdBody, x, .1, 0, strip);
          const lensMat = new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 1.35,
            roughness: .2,
          });
          C(.15, .06, lensMat, x, .17, 0, strip, 0, 0, 18);
          // Resistor SMD kecil & 3 pad tembaga di sela LED
          if (i < 7) {
            const px = x + .375;
            [-.24, 0, .24].forEach((pz) => B(.14, .03, .1, padM, px, .055, pz, strip));
          }
        }
        // Konektor JST 3-pin + kabel (5V merah, DIN hijau, GND hitam)
        B(.42, .26, .66, K.wht, -3.45, .12, 0, strip);
        [[0xdc2626, -.2], [0x22c55e, 0], [0x1c1d22, .2]].forEach(([wc, wz]) => {
          T([[-3.65, .12, wz], [-4.15, .08, wz * 1.1], [-4.55, -.15, wz * 1.25]], .045, M(wc, .55), strip);
        });
        g.add(strip);
      });
      return g;
    }
  };

// Viewer 3D bersama untuk kartu komponen (sama dengan components3d.js di robotic hand v2).
export function createComponentViewer(canvas) {
  let R;
  try {
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a94, 1.0));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
  d1.position.set(5, 9, 7);
  scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.4);
  d2.position.set(-6, 3, -5);
  scene.add(d2);

  const models = {};
  const tg = new THREE.Vector3();
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  let cur = null;
  let th = 0.6;
  let ph = 1.05;
  let dist = 20;
  let t0 = 0;
  let drag = null;
  let auto = !reduce;
  let vis = true;
  let disposed = false;
  let raf = 0;

  function get(k) {
    if (!models[k]) {
      const g = build[k]();
      const bb = new THREE.Box3().setFromObject(g);
      const c = bb.getCenter(new THREE.Vector3());
      const r = bb.getSize(new THREE.Vector3()).length() / 2;
      g.position.sub(c);
      const h = new THREE.Group();
      h.add(g);
      h.visible = false;
      scene.add(h);
      models[k] = { h, r };
    }
    return models[k];
  }

  function layout() {
    if (!cur) return;
    const asp = cam.aspect || 1;
    dist = cur.r / Math.sin(16 * Math.PI / 180) * 1.35 / Math.min(1, asp * 1.1);
    tg.set(0, -cur.r * 0.38, 0);
  }

  function rs() {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    R.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    layout();
  }

  const ro = new ResizeObserver(rs);
  ro.observe(canvas);
  rs();

  const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; });
  io.observe(canvas);

  const onDown = (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drag = [e.clientX, e.clientY];
    auto = false;
  };
  const onMove = (e) => {
    if (!drag) return;
    th -= (e.clientX - drag[0]) * 0.01;
    ph = Math.min(1.6, Math.max(0.5, ph - (e.clientY - drag[1]) * 0.008));
    drag = [e.clientX, e.clientY];
  };
  const onEnd = () => { drag = null; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (!vis || !cur) return;
    const p = reduce ? 1 : Math.min(1, (performance.now() - t0) / 800);
    const e = 1 - Math.pow(1 - p, 3);
    cur.h.scale.setScalar(0.7 + 0.3 * e);
    cur.h.rotation.y = (1 - e) * -1.2;
    if (auto) th += 0.006;
    cam.position.set(
      tg.x + dist * Math.sin(ph) * Math.sin(th),
      tg.y + dist * Math.cos(ph),
      tg.z + dist * Math.sin(ph) * Math.cos(th)
    );
    cam.lookAt(tg);
    R.render(scene, cam);
  }
  raf = requestAnimationFrame(loop);

  return {
    show(k) {
      if (cur) cur.h.visible = false;
      cur = get(k);
      cur.h.visible = true;
      t0 = performance.now();
      auto = !reduce;
      th = 0.6;
      ph = 1.05;
      layout();
    },
    resize: rs,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onEnd);
      canvas.removeEventListener('pointercancel', onEnd);
      R.dispose();
    },
  };
}

