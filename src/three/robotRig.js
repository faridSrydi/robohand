import * as THREE from 'three';

// Model tangan robot (asli dari robot3d.js), tanpa renderer: dipasang sebagai objek di React Three Fiber.
// Urutan jari di sini mengikuti urutan geometri asli; FINGER_ORDER memetakan pose 0-4 (Jempol..Kelingking).
export function createRobotRig() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
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
  // pergelangan tangan berongga (tempat 4 servo ditanam di dalamnya, horn menghadap samping)
  const WRIST_Z = 0.45;
  box(3.2, 0.35, 1.7, white, 0, 0.175, WRIST_Z);                // dudukan bawah di atas base
  box(3.2, 0.4, 1.7, white, 0, 8.8, WRIST_Z);                   // leher atas menyambung ke telapak
  box(3.1, 8.6, 0.16, white, 0, 4.5, WRIST_Z + 0.77);           // dinding depan pergelangan
  box(0.32, 8.6, 0.16, white, -1.39, 4.5, WRIST_Z - 0.72);      // tiang belakang kiri
  box(0.32, 8.6, 0.16, white, 1.39, 4.5, WRIST_Z - 0.72);       // tiang belakang kanan
  box(0.24, 8.6, 0.14, cream, 0, 4.5, WRIST_Z - 0.72);          // tulang tengah belakang
  box(0.14, 8.6, 0.24, white, -1.48, 4.5, WRIST_Z + 0.65);      // rel samping depan kiri
  box(0.14, 8.6, 0.24, white, 1.48, 4.5, WRIST_Z + 0.65);       // rel samping depan kanan

  // 2 LED strip WS2812B vertikal di depan pergelangan dengan cover karet selang LED alis (diffuser silikon)
  // Kiri = Strip 1 (GPIO 22), Kanan = Strip 2 (GPIO 23)
  const LED_COUNT = 34;
  const LED_X = [-1.05, 1.05];
  const TEX_H = 128;
  const ledCanvases = [];
  const ledBaseCanvases = [];
  const ledHaloCanvases = [];
  const ledImgs = [];
  const ledBaseImgs = [];
  const ledHaloImgs = [];
  const ledTextures = [];
  const ledBaseTextures = [];
  const ledHaloTextures = [];
  const ledTubeMats = [];
  const ledHaloMats = [];

  const tubeGeo = new THREE.CylinderGeometry(0.16, 0.16, 9.0, 18, 1, false);
  const haloGeo = new THREE.PlaneGeometry(1.05, 9.15);

  for (let s = 0; s < 2; s++) {
    const sx = LED_X[s];

    // Tekstur warna dasar selang (putih susu saat mati, otomatis hilang ke gelap saat LED menyala agar warna murni & pekat)
    const bc = document.createElement('canvas');
    bc.width = 4;
    bc.height = TEX_H;
    const bctx = bc.getContext('2d');
    const btex = new THREE.CanvasTexture(bc);
    btex.colorSpace = THREE.SRGBColorSpace;
    btex.minFilter = THREE.LinearFilter;
    btex.magFilter = THREE.LinearFilter;
    ledBaseCanvases.push(bctx);
    ledBaseImgs.push(bctx.createImageData(4, TEX_H));
    ledBaseTextures.push(btex);

    // Canvas tekstur emisi diffuser silikon (vertikal 4x128 -> halus menyatu seperti selang silikon)
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = TEX_H;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    ledCanvases.push(ctx);
    ledImgs.push(ctx.createImageData(4, TEX_H));
    ledTextures.push(tex);

    // Cover selang karet silikon: penuh dari ujung bawah hingga ujung atas pergelangan putih (tanpa rel/tutup hitam)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: btex,
      roughness: 0.58,
      metalness: 0.0,
      envMapIntensity: 0.25,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 2.2,
      toneMapped: false,
    });
    ledTubeMats.push(tubeMat);
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(sx, 4.5, WRIST_Z + 0.88);
    tubeMesh.scale.set(1.06, 1, 0.82);
    tubeMesh.castShadow = true;
    tubeMesh.receiveShadow = true;
    g.add(tubeMesh);

    // Lapisan pendaran cahaya lembut (neon bloom) di sekitar selang silikon
    const hc = document.createElement('canvas');
    hc.width = 32;
    hc.height = TEX_H;
    const hctx = hc.getContext('2d');
    const htex = new THREE.CanvasTexture(hc);
    htex.colorSpace = THREE.SRGBColorSpace;
    htex.minFilter = THREE.LinearFilter;
    htex.magFilter = THREE.LinearFilter;
    ledHaloCanvases.push(hctx);
    ledHaloImgs.push(hctx.createImageData(32, TEX_H));
    ledHaloTextures.push(htex);

    const haloMat = new THREE.MeshBasicMaterial({
      map: htex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    ledHaloMats.push(haloMat);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.set(sx, 4.5, WRIST_Z + 1.03);
    g.add(haloMesh);
  }

  // Mesin animasi 11 mode + RGB (sinkron dengan firmware/esp32_hand.ino)
  const ledCfg = [
    { mode: 0, r: 255, g: 170, b: 30, bright: 180, speed: 60, rgb: false },
    { mode: 0, r: 255, g: 170, b: 30, bright: 180, speed: 60, rgb: false },
  ];
  const ledBuf = [new Uint8Array(LED_COUNT * 3), new Uint8Array(LED_COUNT * 3)];
  const ledHeat = [new Uint8Array(LED_COUNT), new Uint8Array(LED_COUNT)];
  const ledStep = [0, 0];
  const ledAcc = [0, 0];
  let ledClockMs = 0;

  function hsvToRgb(hDeg) {
    const h = (((hDeg % 360) + 360) % 360) / 60;
    const f = h - Math.floor(h);
    const q = Math.round(255 * (1 - f));
    const t = Math.round(255 * f);
    switch (Math.floor(h) % 6) {
      case 0: return [255, t, 0];
      case 1: return [q, 255, 0];
      case 2: return [0, 255, t];
      case 3: return [0, q, 255];
      case 4: return [t, 0, 255];
      default: return [255, 0, q];
    }
  }
  function ledPixColor(L, st, i) {
    if (!L.rgb) return [L.r, L.g, L.b];
    const hue = ((st * 700 + i * Math.floor(65536 / LED_COUNT)) & 0xffff) * (360 / 65536);
    return hsvToRgb(hue);
  }
  function bset(s, i, r, g0, b) {
    const o = i * 3;
    ledBuf[s][o] = r; ledBuf[s][o + 1] = g0; ledBuf[s][o + 2] = b;
  }
  function bfill(s, r, g0, b) { for (let i = 0; i < LED_COUNT; i++) bset(s, i, r, g0, b); }
  function bclear(s) { ledBuf[s].fill(0); }
  function bfade(s, keep) {
    const B = ledBuf[s];
    for (let i = 0; i < B.length; i++) B[i] = (B[i] * keep) >> 8;
  }
  function ledFrameMs(s) {
    const sp = Math.max(1, Math.min(100, ledCfg[s].speed || 60));
    return 70 + ((sp - 1) * (10 - 70)) / 99;
  }
  function ledRenderStrip(s) {
    const N = LED_COUNT;
    const L = ledCfg[s];
    const H = ledHeat[s];
    const st = ledStep[s];
    switch (L.mode) {
      case 0: { // Meteor
        bfade(s, 190);
        const pos = st % (N + 14);
        for (let j = 0; j < 3; j++) {
          const idx = pos - j;
          if (idx >= 0 && idx < N) {
            const [r, g0, b] = ledPixColor(L, st, idx);
            bset(s, idx, r, g0, b);
          }
        }
        break;
      }
      case 1: // Warna tetap (atau siklus RGB pelan)
        if (L.rgb) {
          const [r, g0, b] = hsvToRgb(((st * 300) & 0xffff) * (360 / 65536));
          bfill(s, r, g0, b);
        } else {
          bfill(s, L.r, L.g, L.b);
        }
        break;
      case 2: { // Napas
        let v = (Math.sin(st * 0.06 - 1.5708) + 1) / 2;
        v *= v;
        if (L.rgb) {
          for (let i = 0; i < N; i++) {
            const [r, g0, b] = ledPixColor(L, st >> 1, i);
            bset(s, i, r * v, g0 * v, b * v);
          }
        } else {
          bfill(s, L.r * v, L.g * v, L.b * v);
        }
        break;
      }
      case 3: // Pelangi
        for (let i = 0; i < N; i++) {
          const hue = ((st * 600 + i * Math.floor(65536 / N)) & 0xffff) * (360 / 65536);
          const [r, g0, b] = hsvToRgb(hue);
          bset(s, i, r, g0, b);
        }
        break;
      case 4: // Kejar
        bclear(s);
        for (let i = 0; i < N; i++) {
          if ((i + (st >> 1)) % 3 === 0) {
            const [r, g0, b] = ledPixColor(L, st, i);
            bset(s, i, r, g0, b);
          }
        }
        break;
      case 5: { // Pemindai
        bfade(s, 150);
        const cyc = 2 * (N - 1), p = st % cyc, pos = p < N ? p : cyc - p;
        const [r, g0, b] = ledPixColor(L, st, pos);
        bset(s, pos, r, g0, b);
        if (pos > 0) bset(s, pos - 1, r * 0.35, g0 * 0.35, b * 0.35);
        if (pos < N - 1) bset(s, pos + 1, r * 0.35, g0 * 0.35, b * 0.35);
        break;
      }
      case 6: // Berkelip
        bfade(s, 225);
        if (Math.random() < 0.45) {
          const idx = Math.floor(Math.random() * N);
          const [r, g0, b] = ledPixColor(L, st, idx);
          bset(s, idx, r, g0, b);
        }
        if (Math.random() < 0.2) {
          const idx = Math.floor(Math.random() * N);
          const [r, g0, b] = ledPixColor(L, st + 17, idx);
          bset(s, idx, r, g0, b);
        }
        break;
      case 7: // Api
        for (let i = 0; i < N; i++) {
          const d = Math.floor(Math.random() * (Math.floor((55 * 10) / N) + 2));
          H[i] = H[i] > d ? H[i] - d : 0;
        }
        for (let k = N - 1; k >= 2; k--) H[k] = Math.floor((H[k - 1] + H[k - 2] + H[k - 2]) / 3);
        if (Math.random() * 255 < 120) {
          const y = Math.floor(Math.random() * 7);
          H[y] = Math.min(255, H[y] + 160 + Math.floor(Math.random() * 95));
        }
        for (let i = 0; i < N; i++) {
          const t = Math.floor((H[i] * 191) / 255), ramp = (t & 0x3f) << 2;
          if (t & 0x80) bset(s, i, 255, 255, ramp);
          else if (t & 0x40) bset(s, i, 255, ramp, 0);
          else bset(s, i, ramp, 0, 0);
        }
        break;
      case 8: // Gelombang
        for (let i = 0; i < N; i++) {
          let v = (Math.sin(i * 0.45 - st * 0.15) + 1) / 2;
          v *= v;
          const [r, g0, b] = ledPixColor(L, st, i);
          bset(s, i, r * v, g0 * v, b * v);
        }
        break;
      case 9: { // Kedip bergantian
        const phase = Math.floor(ledClockMs / (ledFrameMs(s) * 6));
        const on = phase % 2 === s;
        if (on) {
          if (L.rgb) {
            const [r, g0, b] = hsvToRgb(((phase * 7000) & 0xffff) * (360 / 65536));
            bfill(s, r, g0, b);
          } else {
            bfill(s, L.r, L.g, L.b);
          }
        } else {
          bclear(s);
        }
        break;
      }
      default: // 10 Mati
        bclear(s);
        break;
    }

    // Gambar buffer 34 LED ke tekstur diffuser silikon + pendaran neon dengan interpolasi halus
    const B = ledBuf[s];
    const normBr = Math.max(0.05, Math.min(1, (L.bright || 60) / 255));
    // Kurva perseptual agar kecerahan rendah (misal 24%) tetap terang & jelas di 3D, makin penuh makin menyilaukan
    const br = Math.pow(normBr, 0.42);
    ledTubeMats[s].emissiveIntensity = 1.65 + 1.35 * normBr;
    ledHaloMats[s].opacity = 0.48 + 0.45 * normBr;

    const ctx = ledCanvases[s];
    const bctx = ledBaseCanvases[s];
    const hctx = ledHaloCanvases[s];
    const img = ledImgs[s];
    const bimg = ledBaseImgs[s];
    const himg = ledHaloImgs[s];
    const d = img.data;
    const bd = bimg.data;
    const hd = himg.data;

    for (let y = 0; y < TEX_H; y++) {
      // y=0 adalah puncak strip (LED 33), y=TEX_H-1 adalah dasar strip (LED 0)
      const f = ((TEX_H - 1 - y) / (TEX_H - 1)) * (N - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(N - 1, i0 + 1);
      const frac = f - i0;
      const o0 = i0 * 3;
      const o1 = i1 * 3;
      // Difusi silikon: campur piksel tetangga sedikit supaya cahaya menyatu mulus seperti selang LED alis
      const im1 = Math.max(0, i0 - 1) * 3;
      const ip2 = Math.min(N - 1, i1 + 1) * 3;

      const rLin = (B[o0] * (1 - frac) + B[o1] * frac) * 0.78 + (B[im1] + B[ip2]) * 0.11;
      const gLin = (B[o0 + 1] * (1 - frac) + B[o1 + 1] * frac) * 0.78 + (B[im1 + 1] + B[ip2 + 1]) * 0.11;
      const bLin = (B[o0 + 2] * (1 - frac) + B[o1 + 2] * frac) * 0.78 + (B[im1 + 2] + B[ip2 + 2]) * 0.11;

      const pr = Math.min(255, Math.round(rLin * br));
      const pg = Math.min(255, Math.round(gLin * br));
      const pb = Math.min(255, Math.round(bLin * br));

      // Hilangkan warna putih silikon di bagian yang menyala agar warna LED tampil pekat & murni
      const lit = Math.min(1, Math.max(pr, pg, pb) / 90);
      const unlit = 1 - lit;
      const brBase = Math.round(188 * unlit);
      const bgBase = Math.round(192 * unlit);
      const bbBase = Math.round(198 * unlit);

      for (let x = 0; x < 4; x++) {
        const p = (y * 4 + x) * 4;
        d[p] = pr; d[p + 1] = pg; d[p + 2] = pb; d[p + 3] = 255;
        bd[p] = brBase; bd[p + 1] = bgBase; bd[p + 2] = bbBase; bd[p + 3] = 255;
      }

      // Pendaran luar lembut (berkurang mulus dari tengah ke tepi kiri/kanan dan ujung atas/bawah)
      const edgeY = Math.min(1, y / 5, (TEX_H - 1 - y) / 5);
      for (let x = 0; x < 32; x++) {
        const nx = (x / 31) * 2 - 1; // -1..1
        const fall = Math.max(0, 1 - nx * nx);
        const wGlow = fall * fall * edgeY;
        const hp = (y * 32 + x) * 4;
        hd[hp] = pr;
        hd[hp + 1] = pg;
        hd[hp + 2] = pb;
        hd[hp + 3] = Math.min(255, Math.round(255 * wGlow));
      }
    }

    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);
    hctx.putImageData(himg, 0, 0);
    ledTextures[s].needsUpdate = true;
    ledBaseTextures[s].needsUpdate = true;
    ledHaloTextures[s].needsUpdate = true;
    ledStep[s]++;
  }

  function updateLeds(dt) {
    const dtMs = dt * 1000;
    ledClockMs += dtMs;
    for (let s = 0; s < 2; s++) {
      const fms = ledFrameMs(s);
      ledAcc[s] += dtMs;
      if (ledAcc[s] >= fms) {
        ledAcc[s] %= fms;
        ledRenderStrip(s);
      }
    }
  }
  ledRenderStrip(0);
  ledRenderStrip(1);
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
  // urutan: telunjuk (0), tengah (1), manis (2), kelingking (3), jempol (4)
  finger(-1.85, 2.6, .7, [.6, .55, .55], .8, .03);
  finger(-.6, 2.6, .8, [.75, .65, .6], .8, 0);
  finger(.52, 2.6, .7, [.65, .6, .55], .8, -.02);
  finger(1.55, 2.6, .5, [.45, .4, .4], .8, -.05);
  finger(-3.0, 1.3, .7, [.65, .6, .55], .85, .9);
  // 4 servo di DALAM pergelangan tangan (2 kiri, 2 kanan) untuk telunjuk, tengah, manis, kelingking.
  // Servo ke-5 (jempol) tersembunyi di dalam telapak tangan sehingga tidak ditampilkan di pergelangan.
  // Horn menghadap samping (-X kiri, +X kanan) dan berayun ke belakang (-Z) menarik tali keluar dari lubang samping.
  const SP = [
    { dir: -1, y: 6.4 }, // 0: telunjuk (sisi kiri atas)
    { dir: -1, y: 2.8 }, // 1: tengah   (sisi kiri bawah)
    { dir:  1, y: 6.4 }, // 2: manis    (sisi kanan atas)
    { dir:  1, y: 2.8 }, // 3: kelingking (sisi kanan bawah)
  ];
  const hgs = [];
  SP.forEach((p) => {
    const s = new THREE.Group();
    // Posisi dasar tepat di dinding samping pergelangan; rotasi Y ±90° membuat poros servo (+Z lokal) menghadap samping
    s.position.set(p.dir * 1.48, p.y, WRIST_Z);
    s.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(s);
    // Badan servo masuk ke dalam rongga pergelangan (-Z lokal = ke dalam pergelangan)
    box(1.0, 1.92, 1.36, dark, 0, 0, -0.68, s);
    box(0.96, 2.48, 0.12, dark, 0, 0, -0.06, s);        // kuping baut di sisi pergelangan
    cyl(0.28, 0.24, steel, 0, 0.42, 0.12, s);           // poros gear menghadap samping
    // Horn satu lengan menghadap samping, berayun di bidang YZ (menarik ke belakang -Z saat menutup)
    const hg = new THREE.Group();
    hg.position.set(0, 0.42, 0.26);
    s.add(hg);
    cyl(0.22, 0.14, white, 0, 0, 0, hg);
    box(0.26, 1.34, 0.1, white, 0, 0.56, 0, hg);
    cyl(0.07, 0.14, steel, 0, 1.15, 0.06, hg);          // pin ikat tali di ujung horn
    hgs.push(hg);
    // Lubang/cincin pemandu tali di sisi pergelangan (tali dari dalam telapak & pergelangan keluar di sini)
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12), steel);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(p.dir * 1.62, p.y + 1.38, WRIST_Z + 0.12);
    eye.castShadow = true;
    g.add(eye);
  });
  // tali tendon (hanya 4 yang terlihat keluar dari sisi pergelangan menuju horn; bagian dalam telapak tersembunyi)
  const strs = SP.map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), blk); m.castShadow = true; g.add(m); return m });
  const toLocal = (v) => g.worldToLocal(v.clone());
  function upd(i) {
    if (i >= SP.length) return;
    const p = SP[i];
    const h = toLocal(hgs[i].localToWorld(V(0, 1.15, 0.06)));
    const guideY = p.y + 1.38;
    const exitIn = V(p.dir * 1.46, guideY, WRIST_Z + 0.12);
    const exitOut = V(p.dir * 1.76, guideY, WRIST_Z + 0.12);
    strs[i].geometry.dispose();
    strs[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([exitIn, exitOut, h], false, 'catmullrom', 0.1), 16, 0.022, 6);
  }
  const cur = [0, 0, 0, 0, 0], tgt = [0, 0, 0, 0, 0];
  function pose(i) {
    const t = cur[i], j = fingers[i].js;
    j[0].rotation.x = t * 1.25; j[1].rotation.x = t * 1.5; j[2].rotation.x = t * 1.0;
    // t=0 (buka): horn condong atas-depan; t=1 (tutup): horn berayun ke belakang (-Z) menarik tali
    if (i < SP.length) hgs[i].rotation.z = SP[i].dir * (0.35 - 2.0 * t);
  }
  cur.forEach((_, i) => pose(i)); g.updateMatrixWorld(true); cur.forEach((_, i) => upd(i));
  const FINGER_ORDER = [4, 0, 1, 2, 3];
  return {
    group: g,
    setPose(arr) { for (let i = 0; i < 5; i++) tgt[FINGER_ORDER[i]] = Math.min(1, Math.max(0, arr[i] || 0)); },
    setFingers(n) { for (let i = 0; i < 5; i++) tgt[FINGER_ORDER[i]] = i < n ? 0 : 1; },
    setLeds(arr) {
      if (!Array.isArray(arr) || !arr.length) return;
      for (let s = 0; s < 2; s++) {
        const src = arr[s] || arr[0];
        if (!src) continue;
        const modeChanged = ledCfg[s].mode !== src.mode;
        ledCfg[s] = {
          mode: src.mode ?? 0,
          r: src.r ?? 255,
          g: src.g ?? 170,
          b: src.b ?? 30,
          bright: src.bright ?? 60,
          speed: src.speed ?? 60,
          rgb: Boolean(src.rgb),
        };
        if (modeChanged) {
          bclear(s);
          ledHeat[s].fill(0);
          ledStep[s] = 0;
        }
      }
      // Jika kedua strip identik, samakan langkah animasi supaya sinkron seperti di ESP32.
      if (JSON.stringify(ledCfg[0]) === JSON.stringify(ledCfg[1])) {
        ledStep[1] = ledStep[0];
        ledAcc[1] = ledAcc[0];
        ledBuf[1].set(ledBuf[0]);
      }
      ledRenderStrip(0);
      ledRenderStrip(1);
    },
    update(dt = 1 / 60) {
      const clampedDt = Math.min(dt, 0.05);
      const k = 1 - Math.exp(-clampedDt * 7.5);
      const changed = [];
      for (let i = 0; i < 5; i++) {
        if (Math.abs(tgt[i] - cur[i]) > 0.002) { cur[i] += (tgt[i] - cur[i]) * k; pose(i); changed.push(i); }
      }
      if (changed.length) { g.updateMatrixWorld(true); changed.forEach(upd); }
      updateLeds(clampedDt);
    },
  };
}
