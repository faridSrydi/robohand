// Model 3D robot tangan (three.js r128). Pakai: const r=createRobot(canvas,{auto:true}); r.setFingers(3);
function createRobot(canvas, o) {
  o = o || {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, .1, 300);
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.shadowMap.enabled = true; R.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77777f, 1.0));
  const dl = new THREE.DirectionalLight(0xffffff, .8); dl.position.set(12, 40, 30); dl.castShadow = true;
  dl.shadow.mapSize.set(2048, 2048); const sc = dl.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 34; sc.bottom = -16; sc.near = 1; sc.far = 140; scene.add(dl);
  const g = new THREE.Group(); scene.add(g);
  const M = (col, r) => new THREE.MeshStandardMaterial({ color: col, roughness: r });
  const yel = M(0xe0a81c, .55), cream = M(0xeadfc8, .9), pan = M(0xf0e9db, .95), wood = M(0xa8572f, .85), woodL = M(0xc29760, .9), base = M(0xe0a81c, .55), blk = M(0x111111, .5), steel = M(0xb7babe, .3), blue = M(0x2f6fb5, .5), white = M(0xf4f4f4, .5);
  function box(w, h, d, m, x, y, z, p) { p = p || g; const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; p.add(o); return o }
  function cyl(r, h, m, x, y, z, p) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; p.add(o); return o }
  function ext(pts, d, m, z, p) { const s = new THREE.Shape(); pts.forEach((q, i) => i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1])); const o = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), m); o.position.z = z - d / 2; o.castShadow = o.receiveShadow = true; p.add(o) }
  function tube(pts, r, m) { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 6), m); o.castShadow = true; g.add(o) }

  // dudukan berongga: lubang kotak di atas (belakang tangan) memperlihatkan mesin
  const dark = M(0x222426, .7), pcbG = M(0x1f7a3a, .6), pcbB = M(0x1b4f9c, .6), pcbK = M(0x15171a, .6), pcbR = M(0xb03030, .6), red = M(0xcc2a22, .6), cell = M(0x2a7fb8, .45), capM = M(0x24244a, .5);
  function plate(w, h, hs, d, m) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    hs.forEach(q => { const p = new THREE.Path(); p.moveTo(q[0], q[1]); p.lineTo(q[2], q[1]); p.lineTo(q[2], q[3]); p.lineTo(q[0], q[3]); p.closePath(); s.holes.push(p) });
    const o = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), m); o.castShadow = o.receiveShadow = true; g.add(o); return o
  }
  function vc(r, h, m, x, y, z) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), m); o.position.set(x, y, z); o.castShadow = true; g.add(o) }
  box(9, .1, 7, base, 0, -1.55, 0); box(9, 1.5, .2, base, 0, -.75, 3.4); box(.2, 1.5, 7, base, -4.4, -.75, 0); box(.2, 1.5, 7, base, 4.4, -.75, 0);
  const tp = plate(9, 7, [[-4.1, .4, 4.1, 3.3]], .1, base); tp.rotation.x = -Math.PI / 2; tp.position.set(0, -.1, 0);
  const bw = plate(9, 1.5, [[-1.9, -.675, -.9, -.225], [-3.6, -.3, -2.8, .2], [.05, -.3, .55, .2]], .2, base); bw.position.set(0, -.75, -3.5);
  // baterai 2x18650 + holder (kiri jika dilihat dari belakang)
  box(3.4, .5, 1.9, dark, 2.4, -1.25, -2.3);
  [-2.75, -1.85].forEach(z => { const o = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 3.2, 20), cell); o.rotation.z = Math.PI / 2; o.position.set(2.4, -.95, z); o.castShadow = true; g.add(o); box(.1, .3, .3, steel, 4.05, -.95, z); box(.1, .3, .3, steel, .75, -.95, z) });
  // BMS 2S
  box(1.8, .06, .8, pcbG, 3.0, -1.42, -1.0); box(.3, .1, .2, blk, 3.4, -1.36, -1.0); box(.3, .1, .2, blk, 2.7, -1.36, -1.0);
  // XL4015
  box(2.2, .06, .95, pcbB, .7, -1.42, -.95); box(.55, .45, .55, dark, .3, -1.17, -.95); box(.6, .3, .5, steel, 1.3, -1.22, -.95); box(.15, .12, .15, M(0xd4a000, .4), 1.7, -1.35, -.6);
  vc(.24, .7, capM, -.9, -1.12, -1.0); vc(.16, .45, capM, -.9, -1.27, -1.85);
  // ESP32
  box(2.4, .06, 1.2, pcbK, -2.2, -1.42, -1.0); box(1.1, .12, .9, steel, -2.8, -1.33, -1.0); box(.3, .18, .25, steel, -1.0, -1.32, -1.0); box(2.2, .15, .1, blk, -2.2, -1.33, -1.5); box(2.2, .15, .1, blk, -2.2, -1.33, -.5);
  // modul charger USB-C (port di dinding belakang)
  box(1.9, .06, 1.0, pcbR, -1.4, -1.42, -2.7); box(.5, .35, .5, dark, -.8, -1.2, -2.6); box(.9, .3, .5, steel, -1.4, -1.22, -3.05);
  // Mini360
  box(.8, .05, .5, pcbB, -3.1, -1.43, -1.85); box(.3, .2, .3, dark, -3.2, -1.3, -1.85);
  // dinding belakang dari kanan (dilihat dari belakang): saklar, USB-C, fuse
  box(.9, .55, .5, blk, -3.2, -.8, -3.0); const rk = box(.5, .3, .2, M(0xd33a2c, .5), -3.2, -.8, -3.38); rk.rotation.x = .3;
  cyl(.3, .35, M(0x222222, .6), .3, -.8, -3.58, g); cyl(.2, .9, steel, .3, -.8, -3.0, g);
  // kabel dalam
  tube([V(2.2, -1.38, -1.1), V(1.95, -1.15, -1.1), V(1.75, -1.38, -1.1)], .03, red);
  tube([V(2.2, -1.38, -.85), V(1.95, -1.15, -.85), V(1.75, -1.38, -.85)], .03, blk);
  tube([V(-.3, -1.35, -2.3), V(.4, -.8, -1.9), V(1.4, -.5, -1.5), V(2.2, -1.3, -1.15)], .03, red);
  tube([V(-.2, -1.35, -2.5), V(.5, -.7, -2.0), V(1.5, -.45, -1.6), V(2.3, -1.3, -.85)], .03, blk);
  tube([V(.15, -.85, -2.85), V(-.5, -.45, -2.3), V(-2.4, -.45, -2.3), V(-3.0, -.8, -2.8)], .03, red);
  tube([V(-3.0, -1.38, -1.7), V(-2.9, -1.2, -1.65), V(-2.8, -1.3, -1.5)], .03, red);
  // pergelangan putih (servo dipasang langsung di belakangnya)
  box(2.4, 9.0, 0.35, white, 0, 4.5, 0);
  // telapak
  const PG = new THREE.Group(); PG.position.set(0, 13, 0); PG.scale.set(1.5, 1.5, 1.5); g.add(PG);
  ext([[-2.3, 2.8], [1.9, 2.6], [2.35, 2.3], [2.45, -0.5], [2.3, -2.0], [0.9, -2.8], [-2.0, -2.66], [-2.48, -1.92], [-1.65, -1.9], [-1.65, 1.05], [-2.3, 1.05]], 0.5, yel, 0, PG);
  ext([[-1.5, 2.1], [-0.5, 2.0], [0, 1.85], [0.8, 2.1], [1.7, 2.05], [1.95, 1.0], [1.95, -0.8], [1.75, -1.6], [1.2, -2.3], [-1.5, -2.3]], 0.05, pan, 0.26, PG);
  box(0.55, 2.9, 0.3, woodL, -2.0, -0.45, 0, PG); box(0.5, 0.25, 0.34, cream, -2.0, 0.2, 0, PG); box(0.5, 0.25, 0.34, cream, -2.0, -0.9, 0, PG);
  // ibu jari
  ext([[-2.3, 1.0], [-3.0, 1.4], [-3.55, 0.45], [-3.35, -1.1], [-2.3, -1.7]], 0.5, yel, 0, PG);
  // jari bersendi (3 ruas)
  const fingers = [];
  function finger(x, y0, rail, segs, w, rot) {
    const f = new THREE.Group(); f.position.set(x, y0, 0); f.rotation.z = rot; PG.add(f);
    box(.1, rail, .3, cream, -w * .28, rail / 2, 0, f); box(.1, rail, .3, cream, w * .28, rail / 2, 0, f);
    const js = []; let par = f;
    segs.forEach((L, i) => {
      const sw = w * (1 - i * .04), j = new THREE.Group(); j.position.y = i ? segs[i - 1] + .26 : rail; par.add(j);
      box(sw, L, .5, yel, 0, L / 2, 0, j); box(sw * .5, L * .45, .52, cream, 0, L * .5, 0, j);
      if (i < segs.length - 1) { box(.1, .26, .3, cream, -sw * .28, L + .13, 0, j); box(.1, .26, .3, cream, sw * .28, L + .13, 0, j) }
      else cyl(.07, .14, steel, 0, L - .18, .3, j);
      js.push(j); par = j
    });
    fingers.push({ f, js, tl: V(0, segs[segs.length - 1] - .18, .36) });
  }
  // urutan: telunjuk, tengah, manis, kelingking, jempol
  finger(-1.85, 2.6, .7, [.6, .55, .55], .8, .03);
  finger(-.6, 2.6, .8, [.75, .65, .6], .8, 0);
  finger(.52, 2.6, .7, [.65, .6, .55], .8, -.02);
  finger(1.55, 2.6, .5, [.45, .4, .4], .8, -.05);
  finger(-3.0, 1.3, .7, [.65, .6, .55], .85, .9);
  // servo MG996R berdiri + horn 5 cm
  const SP = [[-.6, 4.3], [-.6, 1.5], [.6, 7.1], [.6, 4.3], [-.6, 7.1]], hgs = [], wc = [0xcc3322, 0xdd8822, 0x5a3a20];
  SP.forEach((p, i) => {
    const s = new THREE.Group(); s.position.set(p[0], p[1], -.175); s.rotation.y = Math.PI; g.add(s);
    box(1.0, 2.07, 1.6, dark, 0, 0, .8, s); box(.95, 2.76, .13, dark, 0, 0, 1.0, s); cyl(.3, .3, steel, 0, .53, 1.75, s);
    const hg = new THREE.Group(); hg.position.set(0, .53, 2.0); s.add(hg);
    cyl(.22, .15, white, 0, 0, 0, hg); box(.3, 2.54, .1, white, 0, 0, 0, hg); cyl(.07, .14, steel, 0, -1.15, .05, hg);
    hgs.push(hg);
    wc.forEach((col, j) => {
      const sg = Math.sign(p[0]), x0 = p[0] + sg * .5, y0 = p[1] - .9, xe = -1.7 - i * .3, xs = sg * (1.4 + j * .06);
      tube([V(x0, y0, -.9), V(xs, y0 - .3, -1.0 - j * .05), V(xs, .9, -1.0 - j * .05), V(xs * .8, .3, -1.85 - j * .04), V(xe, .35, -1.85 - j * .04), V(xe, -1.2, -1.0 - j * .12)], .025, M(col, .6))
    });
  });
  // tali tendon (dibangun ulang saat jari bergerak)
  const strs = fingers.map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), blk); m.castShadow = true; g.add(m); return m });
  function upd(i) {
    const F = fingers[i], h = hgs[i].localToWorld(V(0, -1.15, .05)), dx = (i - 2) * .1, b = F.f.localToWorld(V(0, .2, .4));
    const pts = [F.js[F.js.length - 1].localToWorld(F.tl.clone())];
    F.js.slice().reverse().forEach(j => pts.push(j.localToWorld(V(0, 0, .4))));
    pts.push(b, V(b.x, b.y - .5, 0), V(b.x * .5, 11.4, 0), V(0, 8.6, -.45), V(h.x + dx, h.y + .6, -2.5), V(h.x, h.y, -2.15));
    strs[i].geometry.dispose(); strs[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .03, 6);
  }
  const cur = [0, 0, 0, 0, 0], tgt = [0, 0, 0, 0, 0];
  function pose(i) { const t = cur[i], j = fingers[i].js; j[0].rotation.x = t * 1.25; j[1].rotation.x = t * 1.5; j[2].rotation.x = t * 1.0; hgs[i].rotation.z = Math.PI + Math.sign(SP[i][0]) * 1.6 * t }
  cur.forEach((_, i) => pose(i)); g.updateMatrixWorld(true); cur.forEach((_, i) => upd(i));
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: .35 }));
  gr.rotation.x = -Math.PI / 2; gr.position.y = -1.65; gr.receiveShadow = true; scene.add(gr);
  // kamera orbit
  const D0 = o.dist || 52, TY = o.ty || 10.6; let D = D0;
  let intro = !matchMedia("(prefers-reduced-motion:reduce)").matches;
  const introT0 = performance.now(), introDur = 1800;
  function introMult(p) {
    if (p <= 0.36) {
      const u = p / 0.36;
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      return 1.48 - (1.48 - 0.72) * e;
    }
    const v = (p - 0.36) / (1 - 0.36);
    const e = v * v * v * (v * (v * 6 - 15) + 10);
    return 0.72 + (1.0 - 0.72) * e;
  }
  let th = .45, ph = 1.4, dist = intro ? D * 1.48 : D, tdist = D, tth = null, auto = o.auto !== false; const tg = V(0, TY, 0); let tty = TY;
  function rs() { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); D = D0 * Math.max(1, .7 / cam.aspect); if (!intro) tdist = D }
  new ResizeObserver(rs).observe(canvas); rs();
  if (intro) dist = D * 1.48;
  let drag = null, pointers = new Map(), pinchDist0 = 0, pinchCamDist0 = dist;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    auto = false; tth = null; intro = false; tdist = dist;
    if (pointers.size === 1) {
      drag = [e.clientX, e.clientY];
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchCamDist0 = dist;
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist0 > 4) {
        const scale = curDist / pinchDist0;
        tdist = dist = Math.min(90, Math.max(14, pinchCamDist0 / scale));
      }
    } else if (pointers.size === 1 && drag) {
      th -= (e.clientX - drag[0]) * .008;
      ph = Math.min(2.2, Math.max(.5, ph - (e.clientY - drag[1]) * .008));
      drag = [e.clientX, e.clientY];
    }
  });
  function endPointer(e) {
    try { canvas.releasePointerCapture(e.pointerId) } catch (err) { }
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const r = Array.from(pointers.values())[0];
      drag = [r.x, r.y];
      pinchDist0 = 0;
    } else if (pointers.size === 0) {
      drag = null;
      pinchDist0 = 0;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => {
    if (o.wheel === false) return;
    e.preventDefault();
    intro = false;
    const factor = e.ctrlKey ? .01 : .0015;
    tdist = dist = Math.min(90, Math.max(14, dist * (1 + e.deltaY * factor)));
  }, { passive: false });
  (function loop() {
    const ch = []; cur.forEach((c, i) => { if (Math.abs(tgt[i] - c) > .002) { cur[i] += (tgt[i] - c) * .12; pose(i); ch.push(i) } });
    if (ch.length) { g.updateMatrixWorld(true); ch.forEach(upd) }
    if (tth !== null) { let d = tth - th; d = Math.atan2(Math.sin(d), Math.cos(d)); th += d * .12; if (Math.abs(d) < .002) tth = null } else if (auto) th += (intro ? .006 : .004);
    if (intro) {
      const p = Math.min(1, (performance.now() - introT0) / introDur);
      dist = D * introMult(p);
      if (p >= 1) { intro = false; tdist = D }
    } else {
      dist += (tdist - dist) * .1;
    }
    tg.y += (tty - tg.y) * .1;
    cam.position.set(tg.x + dist * Math.sin(ph) * Math.sin(th), tg.y + dist * Math.cos(ph), tg.z + dist * Math.sin(ph) * Math.cos(th)); cam.lookAt(tg);
    R.render(scene, cam); requestAnimationFrame(loop)
  })();
  return {
    setFingers(n) { for (let i = 0; i < 5; i++)tgt[i] = i < n ? 0 : 1 },
    setPose(arr) { if (Array.isArray(arr)) { for (let i = 0; i < 5; i++) tgt[i] = arr[i] ? 1 : 0; } },
    setAuto(v) { auto = v; if (v) tth = null }, toggleAuto() { auto = !auto; if (auto) tth = null; return auto }, isAuto() { return auto },
    view(n) { intro = false; auto = false; tdist = D; tty = TY; ph = 1.4; if (n === 'front') tth = .45; else if (n === 'back') tth = Math.PI + .35; else { tth = Math.PI + .2; ph = .8; tdist = 26; tty = 1 } }
  };``````````````````````````
}