import * as THREE from 'three';
import { build as CB } from './components.js';
import { getLang } from '../lib/i18n.js';
// Adegan fitur (asli dari features3d.js). Setiap S[k]() mengembalikan { g, update(t, dt) }.
const L = (en, id) => (getLang() === 'id' ? id : en);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const cl = (v) => Math.min(1, Math.max(0, v));
  const sm = (x) => { x = cl(x); return x * x * (3 - 2 * x) };
  const ease = (p) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const back = (p) => { p = cl(p); const c1 = 1.1, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q };

  // ---------- material & helper ----------
  const M = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? .6 : r, metalness: m || 0 });
  const G = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  const ACC = 0xf5b82e;
  const Mt = {
    yel: M(0xe0a81c, .55), cream: M(0xeadfc8, .9), blk: M(0x16171a, .5), dk: M(0x26282b, .65),
    sil: M(0xc9ccd1, .35, .5), wht: M(0xf2f2f2, .5), blue: M(0x2f6fb5, .5), green: M(0x1f7a3a, .6),
    glass: M(0x3a6cff, .15, .5), cap: M(0x24244a, .5)
  };
  const themed = { bone: M(0xf4f4f4, .5) };   // tulang skeleton: terang di tema gelap, gelap di tema terang
  function paint() { themed.bone.color.setHex(document.documentElement.dataset.theme === 'light' ? 0x2c2f34 : 0xf4f4f4) }
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); paint();

  const add = (p, o, x, y, z) => { o.position.set(x || 0, y || 0, z || 0); p.add(o); return o };
  const box = (w, h, d, m, x, y, z, p) => add(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
  const cyl = (r, h, m, x, y, z, p, rx, rz, s) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s || 24), m); o.rotation.set(rx || 0, 0, rz || 0); return add(p, o, x, y, z) };
  const ball = (r, m, x, y, z, p) => add(p, new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m), x, y, z);
  const vec = (a) => V(a[0], a[1], a[2]);
  const tube = (pts, r, m, p) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(vec)), 60, r, 8), m); p.add(o); return o };
  function bone(a, b, r, m) {
    const d = b.clone().sub(a), L = d.length(), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), m);
    o.position.copy(a).add(b).multiplyScalar(.5); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return o;
  }
  const CT = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t };
  const PL = (w, h, tex, x, y, z, p) => add(p, new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })), x, y, z);

  // label melayang (sprite). label.userData.set(teks) untuk mengganti teks.
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath() }
  function label(text, sc, pos, parent) {
    const W = 384, H = 112, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sc = sc || 3; sp.renderOrder = 10; sp.scale.set(sc, sc * H / W, 1);
    let cur = null;
    sp.userData.set = (t) => {
      if (t === cur) return; cur = t;
      x.clearRect(0, 0, W, H); x.font = '600 44px Geist, system-ui, sans-serif';
      const w = Math.min(W - 8, x.measureText(t).width + 56);
      rr(x, (W - w) / 2, 16, w, 80, 40); x.fillStyle = 'rgba(14,14,17,.9)'; x.fill();
      x.lineWidth = 3; x.strokeStyle = 'rgba(245,184,46,.95)'; x.stroke();
      x.fillStyle = '#f4f4f5'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, W / 2, 57);
      tex.needsUpdate = true;
    };
    sp.userData.set(text);
    if (pos) sp.position.set(pos[0], pos[1], pos[2]);
    if (parent) parent.add(sp);
    return sp;
  }

  // ---------- jari & tangan (dipakai beberapa adegan) ----------
  const WIRE = G(ACC, { wireframe: true, transparent: true, opacity: .7 });
  const PT = G(0xff6a1f), TIP = G(ACC);
  // mode: 'solid' (kuning seperti robot), 'skel' (tulang + titik landmark), 'ghost' (kerangka kawat)
  function finger(mode, L, w) {
    const root = new THREE.Group(), js = []; let par = root;
    L.forEach((len, i) => {
      const j = new THREE.Group(); j.position.y = i ? L[i - 1] + .08 : 0; par.add(j);
      if (mode === 'skel') {
        j.add(bone(V(0, 0, 0), V(0, len + (i < L.length - 1 ? .08 : 0), 0), .045, themed.bone));
        ball(.12, PT, 0, 0, 0, j);
        if (i === L.length - 1) ball(.14, TIP, 0, len, 0, j);
      } else {
        const sw = w * (1 - i * .06);
        box(sw, len, .46, mode === 'ghost' ? WIRE : Mt.yel, 0, len / 2, 0, j);
        if (mode === 'solid') box(sw * .5, len * .5, .48, Mt.cream, 0, len / 2, 0, j);
      }
      js.push(j); par = j;
    });
    return { g: root, js, set(t) { js[0].rotation.x = t * 1.3; js[1].rotation.x = t * 1.5; js[2].rotation.x = t * 1.0 } };
  }
  // urutan: telunjuk, tengah, manis, kelingking, jempol (sama seperti robot3d.js)
  const SPEC = [[-.9, .6, .03, [.8, .6, .5], .5], [-.3, .6, 0, [.9, .7, .55], .5], [.3, .6, -.02, [.8, .65, .5], .5], [.9, .6, -.05, [.6, .45, .4], .46], [-1.3, -.7, .95, [.75, .6, .5], .58]];
  function makeHand(mode) {
    const g = new THREE.Group(), fs = [];
    SPEC.forEach((s) => { const f = finger(mode, s[3], s[4]); f.g.position.set(s[0], s[1], 0); f.g.rotation.z = s[2]; g.add(f.g); fs.push(f) });
    if (mode === 'solid') {
      box(2.8, 2.4, .5, Mt.yel, 0, -.5, 0, g);
      box(2.2, 1.9, .1, Mt.cream, .1, -.45, .28, g);
    } else {   // skeleton: pergelangan (1) + 4 titik x 5 jari = 21 landmark
      ball(.14, PT, 0, -1.6, 0, g);
      const w = V(0, -1.6, 0), r = SPEC.map((s) => V(s[0], s[1], 0));
      [4, 0, 3].forEach((i) => g.add(bone(w, r[i], .04, themed.bone)));
      [[4, 0], [0, 1], [1, 2], [2, 3]].forEach((p) => g.add(bone(r[p[0]], r[p[1]], .04, themed.bone)));
    }
    return { g, f: fs, set(i, t) { fs[i].set(t) } };
  }

  // ---------- adegan ----------
  // Tiap adegan: () => { g, update(t, dt), th, ph, r? }
export const S = {};

  // 01 Hand tracking: webcam -> bidang pandang -> 21 titik landmark
  S.track = () => {
    const g = new THREE.Group(), hand = makeHand('skel'); g.add(hand.g);
    const cam = new THREE.Group(); cam.position.set(0, 1, 8.4); g.add(cam);
    box(2.2, 1.4, 1.3, Mt.blk, 0, 0, .65, cam);
    cyl(.55, .55, Mt.dk, 0, 0, -.1, cam, Math.PI / 2, 0, 28);
    cyl(.34, .12, Mt.glass, 0, 0, -.4, cam, Math.PI / 2, 0, 28);
    const led = ball(.07, G(0xff3b30), .85, .45, -.02, cam);
    const cg = new THREE.ConeGeometry(3.7, 7.6, 4, 1, true);
    const cone = new THREE.Mesh(cg, G(ACC, { transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false }));
    cone.add(new THREE.LineSegments(new THREE.EdgesGeometry(cg), new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .55 })));
    cone.rotation.set(Math.PI / 2, Math.PI / 4, 0); cone.position.set(0, 1, 4.2); g.add(cone);
    const scan = new THREE.Group(); scan.position.z = .4; g.add(scan);
    box(5.2, .06, .06, G(ACC), 0, 0, 0, scan);
    box(5.2, .6, .01, G(ACC, { transparent: true, opacity: .12, depthWrite: false }), 0, -.3, 0, scan);
    label('Webcam', 2.6, [0, 2.5, 8.4], g);
    const lmk = label(L('21 landmarks', '21 landmark'), 3.2, [0, 4, 0], g);
    return {
      g, th: .5, ph: 1.3,
      update(t) {
        lmk.userData.set(L('21 landmarks', '21 landmark'));
        hand.f.forEach((f, i) => f.set(sm(.5 + .5 * Math.sin(t * 1.3 + i * .85))));
        hand.g.rotation.y = Math.sin(t * .7) * .22;
        scan.position.y = 1 + 2.5 * Math.sin(t * 1.4);
        led.visible = Math.sin(t * 5) > -.2;
      }
    };
  };

  // 02 Kontrol suara AI: mikrofon -> gelombang suara -> inti Gemini AI -> tangan robot
  S.voice = () => {
    const g = new THREE.Group();
    // Mikrofon studio kondensor di kiri
    const mic = new THREE.Group(); mic.position.set(-4.3, -.4, 0); g.add(mic);
    cyl(1.15, .18, Mt.dk, 0, -2.0, 0, mic, 0, 0, 28);
    cyl(.14, 1.35, Mt.sil, 0, -1.25, 0, mic, 0, 0, 18);
    cyl(.56, 1.85, Mt.blk, 0, .25, 0, mic, 0, 0, 28);
    cyl(.59, .14, M(ACC, .35, .4), 0, .82, 0, mic, 0, 0, 28);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.56, 20, 14), M(0xcfd3d8, .35, .65));
    cap.scale.set(1, 1.25, 1); cap.position.set(0, 1.35, 0); mic.add(cap);
    const micLed = ball(.09, G(0x22c55e), 0, .35, .58, mic);

    // Gelombang suara konsentris dari mikrofon
    const waves = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.RingGeometry(.75, .86, 40), G(ACC, { transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      r.position.set(-4.3, .95, 0);
      r.rotation.y = Math.PI / 2;
      g.add(r);
      return r;
    });

    // Inti AI + bar equalizer suara di tengah
    const ai = new THREE.Group(); ai.position.set(-.4, .35, 0); g.add(ai);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.88, 1),
      new THREE.MeshStandardMaterial({ color: ACC, emissive: ACC, emissiveIntensity: .45, roughness: .25, metalness: .35, wireframe: true })
    );
    ai.add(core);
    const innerCore = ball(.46, new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: .75, roughness: .2 }), 0, 0, 0, ai);
    const eqBars = [];
    for (let i = 0; i < 7; i++) {
      const bx = -1.35 + i * .45;
      const bar = box(.18, 1.0, .18, G(i % 2 === 0 ? ACC : 0x38bdf8), bx, -1.75, 0, ai);
      eqBars.push(bar);
    }

    // Garis sinyal menuju tangan robot
    const linkCurve = new THREE.QuadraticBezierCurve3(V(-3.4, .95, 0), V(-.4, 2.35, 0), V(3.0, .6, 0));
    const linkLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linkCurve.getPoints(40)), new THREE.LineDashedMaterial({ color: ACC, dashSize: .22, gapSize: .16 }));
    linkLine.computeLineDistances(); g.add(linkLine);
    const pulses = [0, 1, 2].map(() => ball(.13, G(0xffe08a), 0, 0, 0, g));

    // Tangan robot mini di kanan merespons perintah suara
    const handWrap = new THREE.Group(); handWrap.position.set(3.8, -.2, 0); handWrap.scale.setScalar(.82); g.add(handWrap);
    const hand = makeHand('solid'); handWrap.add(hand.g);
    box(2.2, 1.0, .35, Mt.dk, 0, -2.2, 0, handWrap);

    const lbMic = label('Voice AI', 2.4, [-4.3, 3.0, 0], g);
    const lbCmd = label('"Peace"', 3.2, [-.4, 3.2, 0], g);
    const cmds = [
      { en: '"Five fingers"', id: '"Lima jari"', pose: [0, 0, 0, 0, 0] },
      { en: '"Peace"', id: '"Peace"', pose: [0, 0, 1, 1, 1] },
      { en: '"Rock"', id: '"Teknik"', pose: [0, 1, 1, 0, 0] },
      { en: '"Fist"', id: '"Kepal"', pose: [1, 1, 1, 1, 1] },
    ];
    const cur = [0, 0, 0, 0, 0];
    return {
      g, th: .32, ph: 1.24, r: 6.8,
      update(t, dt) {
        dt = dt || .016;
        lbMic.userData.set(L('Voice AI', 'Suara AI'));
        const step = cmds[Math.floor(t / 2.2) % cmds.length];
        lbCmd.userData.set(L(step.en, step.id));
        cur.forEach((c, i) => {
          cur[i] += (step.pose[i] - c) * (1 - Math.exp(-dt * 7));
          hand.set(i, cur[i]);
        });
        waves.forEach((w, i) => {
          const u = (t * .65 + i / 3) % 1;
          w.position.x = -3.7 + u * 2.5;
          w.scale.setScalar(.45 + u * 1.45);
          w.material.opacity = .8 * (1 - u) * (1 - u);
        });
        core.rotation.y = t * .9;
        core.rotation.x = t * .45;
        innerCore.scale.setScalar(.92 + .14 * Math.sin(t * 5));
        eqBars.forEach((b, i) => {
          const h = .35 + .95 * Math.abs(Math.sin(t * 4.5 + i * .7));
          b.scale.y = h;
          b.position.y = -2.2 + h * .5;
        });
        pulses.forEach((b, i) => {
          const u = (t * .42 + i / 3) % 1;
          b.position.copy(linkCurve.getPoint(u));
          b.scale.setScalar(.7 + .5 * Math.sin(u * Math.PI));
        });
        micLed.visible = Math.sin(t * 4) > -.55;
      }
    };
  };

  // 03 LED Ganda & Studio 3D: dua strip WS2812B 34 LED dengan animasi live
  S.led = () => {
    const g = new THREE.Group();
    // Base & rangka tangan tempat 2 strip LED menempel
    box(7.4, .55, 4.4, Mt.dk, 0, -1.6, 0, g);
    box(6.8, .3, 3.8, Mt.yel, 0, -1.2, 0, g);
    // Modul kontroler ESP32 kecil di tengah
    box(2.1, .28, 1.3, Mt.blk, 0, -.92, 0, g);
    box(.7, .12, .7, Mt.sil, .45, -.74, 0, g);

    // Dua strip LED WS2812B (kiri & kanan) masing-masing 14 node bercahaya
    const N = 14;
    const strips = [-1.55, 1.55].map((zOff) => {
      const nodes = [];
      box(6.4, .12, .52, Mt.blk, 0, -.98, zOff, g);
      for (let i = 0; i < N; i++) {
        const x = -2.9 + (5.8 * i) / (N - 1);
        box(.3, .08, .3, Mt.wht, x, -.88, zOff, g);
        const mat = new THREE.MeshStandardMaterial({ color: ACC, emissive: ACC, emissiveIntensity: 1.5, roughness: .2 });
        const bulb = add(g, new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 10), mat), x, -.76, zOff);
        nodes.push({ bulb, mat });
      }
      return nodes;
    });

    // Bar lengkung atas untuk preview 3D studio
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, .05, 12, 64, Math.PI),
      G(ACC, { transparent: true, opacity: .35 })
    );
    halo.position.set(0, -.8, 0);
    g.add(halo);

    label('Strip 1 · 34 LED', 3.2, [-2.1, .9, -1.55], g);
    label('Strip 2 · 34 LED', 3.2, [2.1, .9, 1.55], g);
    const lbMode = label('Rainbow', 2.8, [0, 2.55, 0], g);
    const modes = [
      { en: 'Rainbow', id: 'Pelangi' },
      { en: 'Meteor', id: 'Meteor' },
      { en: 'Scanner', id: 'Pemindai' },
      { en: 'Alternate', id: 'Bergantian' },
    ];
    const tmpCol = new THREE.Color();
    return {
      g, th: .58, ph: 1.12, r: 5.8,
      update(t) {
        const mIdx = Math.floor(t / 2.6) % modes.length;
        lbMode.userData.set(L(modes[mIdx].en, modes[mIdx].id));
        strips.forEach((nodes, sIdx) => {
          nodes.forEach(({ bulb, mat }, i) => {
            const u = i / (N - 1);
            let intensity = 1.3;
            if (mIdx === 0) {
              // Rainbow wave
              tmpCol.setHSL((u + t * .35 + sIdx * .25) % 1, .95, .55);
              intensity = 1.4;
            } else if (mIdx === 1) {
              // Meteor comet
              const head = (t * .85 + sIdx * .5) % 1;
              let d = head - u;
              if (d < 0) d += 1;
              const tail = Math.max(0, 1 - d * 3.2);
              tmpCol.setHSL(.11 + sIdx * .45, .95, .12 + tail * .52);
              intensity = .15 + tail * 2.1;
            } else if (mIdx === 2) {
              // Scanner back-and-forth
              const pos = .5 + .5 * Math.sin(t * 2.8 + sIdx * Math.PI);
              const tail = Math.max(0, 1 - Math.abs(u - pos) * 4.5);
              tmpCol.setHex(sIdx === 0 ? 0xff453a : 0x38bdf8);
              intensity = .12 + tail * 2.2;
            } else {
              // Alternate blink
              const on = ((Math.floor(t * 3.5) + sIdx) % 2) === 0;
              tmpCol.setHex(sIdx === 0 ? 0xf5b82e : 0xa855f7);
              intensity = on ? 1.85 : .08;
            }
            mat.color.copy(tmpCol);
            mat.emissive.copy(tmpCol);
            mat.emissiveIntensity = intensity;
            bulb.scale.setScalar(.85 + Math.min(1, intensity / 2) * .35);
          });
        });
      }
    };
  };

  // 04 Preset pose & mode manual: 0-5 jari + pose custom (Peace, Teknik, Terbuka, Kepal)
  S.gesture = () => {
    const g = new THREE.Group();
    const hand = makeHand('solid'); g.add(hand.g);
    box(2.6, 1.1, .45, Mt.dk, 0, -2.25, 0, g);
    box(5.6, .35, 2.2, Mt.dk, 0, -2.95, .2, g);
    // 5 indikator status jari di dek kontrol
    const dots = [-1.6, -.8, 0, .8, 1.6].map((x) => {
      const m = new THREE.MeshStandardMaterial({ color: ACC, emissive: ACC, emissiveIntensity: 1.2, roughness: .25 });
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .12, 20), m), x, -2.72, .85);
      return m;
    });
    const lb = label('Peace', 3.2, [0, 4.0, 0], g);
    // urutan makeHand: [telunjuk, tengah, manis, kelingking, jempol]
    const poses = [
      { en: 'Peace (2)', id: 'Peace (2)', v: [0, 0, 1, 1, 1] },
      { en: 'Rock / Metal', id: 'Jari Teknik', v: [0, 1, 1, 0, 0] },
      { en: '5 Open', id: '5 Terbuka', v: [0, 0, 0, 0, 0] },
      { en: 'Fist (0)', id: 'Kepal (0)', v: [1, 1, 1, 1, 1] },
    ];
    const cur = [0, 0, 1, 1, 1];
    return {
      g, th: .45, ph: 1.26,
      update(t, dt) {
        dt = dt || .016;
        const p = poses[Math.floor(t / 2.0) % poses.length];
        lb.userData.set(L(p.en, p.id));
        cur.forEach((c, i) => {
          cur[i] += (p.v[i] - c) * (1 - Math.exp(-dt * 7));
          hand.set(i, cur[i]);
          const open = 1 - cur[i];
          dots[i].emissiveIntensity = .15 + open * 1.6;
          dots[i].color.setHex(open > .5 ? ACC : 0x3f434a);
          dots[i].emissive.setHex(open > .5 ? ACC : 0x1a1c20);
        });
      }
    };
  };

  // 02 Koneksi WiFi atau USB: server -> (gelombang WiFi | kabel USB) -> ESP32
  S.conn = () => {
    const g = new THREE.Group();
    const mon = new THREE.Group(); mon.position.set(-5.2, 0, 0); g.add(mon);
    box(4.2, 2.8, .3, Mt.blk, 0, 0, 0, mon);
    PL(3.8, 2.4, CT(512, 320, (x, w, h) => {
      x.fillStyle = '#0c1620'; x.fillRect(0, 0, w, h); x.fillStyle = '#1b2a3a'; x.fillRect(0, 0, w, 36);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(24 + i * 26, 18, 8, 0, 7); x.fill() });
      x.font = '600 30px ui-monospace, Menlo, Consolas, monospace'; x.textBaseline = 'top';
      [['#f5b82e', '$ node server.js'], ['#9fe3a5', 'WebSocket :3000 ready'], ['#9fe3a5', 'ESP32 connected'], ['#cfd6de', '0,0,100,100,0'], ['#cfd6de', '100,0,0,0,100']]
        .forEach((l, i) => { x.fillStyle = l[0]; x.fillText(l[1], 28, 62 + i * 46) });
    }), 0, 0, .16, mon);
    box(.45, .9, .3, Mt.dk, 0, -1.85, -.1, mon); box(1.9, .12, 1.1, Mt.dk, 0, -2.3, -.05, mon);
    box(.12, .3, .5, Mt.dk, 2.16, -.9, .1, mon);

    const esp = CB.esp32 ? CB.esp32() : new THREE.Group();
    if (!CB.esp32) box(5.2, .14, 2.8, Mt.blk, 0, 0, 0, esp);
    esp.position.set(2.4, -2.15, 0); g.add(esp);

    // kabel USB
    const cp = [[-3.05, -.9, .1], [-2.7, -1.75, .9], [-1.7, -2.15, .9], [-1.0, -1.93, .3], [-.55, -1.93, 0]];
    tube(cp, .07, Mt.blk, g);
    box(.7, .3, .5, Mt.sil, -.58, -1.93, 0, g);
    const cab = new THREE.CatmullRomCurve3(cp.map(vec));
    const pulses = [0, 1, 2, 3].map(() => ball(.1, G(0xffffff), 0, 0, 0, g));

    // jalur WiFi: busur putus-putus + paket
    const arc = new THREE.QuadraticBezierCurve3(V(-3.6, 1.7, 0), V(-.4, 4.6, 0), V(3.35, -.9, 0));
    const dl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.getPoints(48)), new THREE.LineDashedMaterial({ color: ACC, dashSize: .26, gapSize: .2 }));
    dl.computeLineDistances(); g.add(dl);
    const pk = [0, 1, 2].map(() => ball(.17, G(0xffe08a), 0, 0, 0, g));
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.RingGeometry(.9, 1.0, 48), G(ACC, { transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(3.35, -1.7, 0); g.add(r); return r;
    });
    label('Server Node.js', 3.6, [-5.2, 2.5, 0], g);
    label('WiFi', 1.8, [-.4, 3.3, 0], g);
    label('USB', 1.6, [-1.9, -.9, .9], g);
    label('ESP32', 2, [2.4, -.4, 0], g);
    return {
      g, th: .35, ph: 1.15, r: 6.6,
      update(t) {
        pk.forEach((b, i) => { const u = (t * .33 + i / 3) % 1; b.position.copy(arc.getPoint(u)); b.scale.setScalar(.7 + .6 * Math.sin(u * Math.PI)) });
        pulses.forEach((b, i) => b.position.copy(cab.getPoint((t * .6 + i / 4) % 1)));
        rings.forEach((r, i) => { const u = (t * .55 + i / 3) % 1; r.scale.setScalar(.4 + 2.4 * u); r.material.opacity = .75 * (1 - u) * (1 - u) });
      }
    };
  };

  // 03 Kalibrasi servo: horn menyapu dari sudut buka ke sudut tutup
  S.cal = () => {
    const g = new THREE.Group();
    const sv = CB.servo ? CB.servo() : new THREE.Group();
    if (!CB.servo) box(4, 3.4, 2, Mt.blk, 0, 0, 0, sv);
    g.add(sv);
    const P = V(1.2, 3.06, 0), th0 = .35, th1 = 2.62;   // 20° dan 150°
    const sector = new THREE.Mesh(new THREE.RingGeometry(.55, 3.1, 64, 1, th0, th1 - th0), G(ACC, { transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(3.06, 3.14, 64, 1, th0, th1 - th0), G(ACC, { side: THREE.DoubleSide }));
    [sector, edge].forEach((m) => { m.rotation.x = -Math.PI / 2; m.position.set(P.x, P.y - .06, P.z); g.add(m) });
    [th0, th1].forEach((a) => { const m = new THREE.Group(); m.position.copy(P); m.rotation.y = a; g.add(m); box(3.4, .04, .1, G(0xffffff), 1.85, -.06, 0, m) });
    const horn = new THREE.Group(); horn.position.copy(P); g.add(horn);
    box(3.5, .14, .55, Mt.wht, 1.2, 0, 0, horn); cyl(.3, .16, Mt.wht, 0, 0, 0, horn);
    [.7, 1.2, 1.7, 2.2, 2.7].forEach((x) => cyl(.07, .16, Mt.sil, x, 0, 0, horn, 0, 0, 12));
    const end = (a) => [P.x + 4.3 * Math.cos(a), P.y + .5, P.z - 4.3 * Math.sin(a)];
    const lbOpen = label(L('Open 20°', 'Buka 20°'), 3, end(th0), g);
    const lbClose = label(L('Close 150°', 'Tutup 150°'), 3.5, end(th1), g);
    const la = label('0°', 1.7, [P.x, P.y + 1.6, P.z], g);
    return {
      g, th: .6, ph: 1.0,
      update(t) {
        lbOpen.userData.set(L('Open 20°', 'Buka 20°'));
        lbClose.userData.set(L('Close 150°', 'Tutup 150°'));
        const p = (t / 5) % 1;
        const u = p < .15 ? 0 : p < .5 ? sm((p - .15) / .35) : p < .65 ? 1 : 1 - sm((p - .65) / .35);
        const a = th0 + (th1 - th0) * u;
        horn.rotation.y = a; la.userData.set(Math.round(a * 180 / Math.PI) + '°');
      }
    };
  };

  // 04 Kecepatan gerak: target melompat, servo mengikuti dengan laju terbatas
  S.speed = () => {
    const g = new THREE.Group();
    const tgt = finger('ghost', [1.1, .9, .8], .9), act = finger('solid', [1.1, .9, .8], .9);
    [[tgt, -4], [act, 1.8]].forEach((a) => {
      const h = new THREE.Group(); h.position.set(a[1], -1.2, 0); h.rotation.y = Math.PI / 2; h.add(a[0].g); g.add(h);
      box(1.4, .5, 1.2, Mt.dk, a[1], -1.45, 0, g);
    });
    // speedometer
    const gg = new THREE.Group(); gg.position.set(-1.1, .9, 0); g.add(gg);
    cyl(1.25, .3, Mt.dk, 0, 0, 0, gg, Math.PI / 2, 0, 40);
    const a0 = -.53, aL = 4.2;
    add(gg, new THREE.Mesh(new THREE.RingGeometry(.85, 1.02, 48, 1, a0, aL), G(ACC, { side: THREE.DoubleSide })), 0, 0, .16);
    for (let k = 0; k <= 8; k++) {
      const an = a0 + aL * k / 8, t = box(.05, .16, .03, G(0xffffff), 1.12 * Math.cos(an), 1.12 * Math.sin(an), .17, gg); t.rotation.z = an - Math.PI / 2;
    }
    const nd = new THREE.Group(); nd.position.z = .22; gg.add(nd);
    box(.07, .95, .04, G(0xff6a1f), 0, .42, 0, nd); ball(.14, Mt.sil, 0, 0, .22, gg);
    label('Target', 1.9, [-4, 3.1, 0], g);
    const lbLim = label(L('Rate-limited', 'Servo dibatasi'), 3.4, [1.8, 3.1, 0], g);
    const lbCap = label(L('Speed cap', 'Batas kecepatan'), 3.6, [-1.1, -1.0, .4], g);
    let cur = 0, ghost = 0, vel = 0; const VMAX = .55;
    return {
      g, th: .3, ph: 1.3,
      update(t, dt) {
        dt = dt || .016;
        lbLim.userData.set(L('Rate-limited', 'Servo dibatasi'));
        lbCap.userData.set(L('Speed cap', 'Batas kecepatan'));
        const tg = (t % 4.4) < 2.2 ? 0 : 1;
        ghost += (tg - ghost) * (1 - Math.exp(-dt * 18));
        const step = Math.max(-VMAX * dt, Math.min(VMAX * dt, tg - cur)); cur += step;
        vel += (Math.abs(step) / dt - vel) * Math.min(1, dt * 12);
        tgt.set(ghost); act.set(sm(cur));
        nd.rotation.z = 2.1 - 4.2 * cl(vel / VMAX);
      }
    };
  };

  // 05 Proteksi daya: arus normal mengalir, lonjakan arus diputus fuse
  S.power = () => {
    const g = new THREE.Group();
    const sh = new THREE.Shape();
    sh.moveTo(0, 3.4); sh.bezierCurveTo(1.2, 3.0, 2.4, 2.9, 3.1, 2.9); sh.lineTo(3.1, .6);
    sh.bezierCurveTo(3.1, -1.6, 1.6, -2.9, 0, -3.6); sh.bezierCurveTo(-1.6, -2.9, -3.1, -1.6, -3.1, .6);
    sh.lineTo(-3.1, 2.9); sh.bezierCurveTo(-2.4, 2.9, -1.2, 3.0, 0, 3.4);
    const sgeo = new THREE.ExtrudeGeometry(sh, { depth: .25, bevelEnabled: true, bevelThickness: .1, bevelSize: .1, bevelSegments: 2 });
    const smat = new THREE.MeshStandardMaterial({ color: ACC, transparent: true, opacity: .14, emissive: ACC, emissiveIntensity: .25, roughness: .5, depthWrite: false });
    const shield = new THREE.Mesh(sgeo, smat); shield.scale.setScalar(1.15); shield.position.set(.3, 0, -2.5); g.add(shield);
    shield.add(new THREE.LineSegments(new THREE.EdgesGeometry(sgeo, 20), new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .55 })));

    // baterai 2 x 18650
    box(3.6, .3, 2.0, Mt.dk, -4.6, -.6, 0, g);
    [-.5, .5].forEach((z) => { cyl(.45, 3.2, Mt.blue, -4.6, 0, z, g, 0, Math.PI / 2, 24); cyl(.2, .15, Mt.sil, -2.95, 0, z, g, 0, Math.PI / 2, 16) });
    // BMS
    box(1.6, .08, 1.2, Mt.green, -1.6, -.35, 0, g); box(.35, .12, .25, Mt.blk, -2.0, -.25, .25, g); box(.35, .12, .25, Mt.blk, -1.4, -.25, -.25, g); box(.2, .18, .2, Mt.sil, -1.1, -.22, .25, g);
    // fuse
    box(2.2, .3, .9, Mt.dk, .7, -.5, 0, g);
    cyl(.3, 1.5, new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: .35, roughness: .1 }), .7, 0, 0, g, 0, Math.PI / 2, 24);
    const fil = cyl(.03, 1.4, G(0xff9a3a), .7, 0, 0, g, 0, Math.PI / 2, 8);
    cyl(.34, .3, Mt.sil, -.05, 0, 0, g, 0, Math.PI / 2, 20); cyl(.34, .3, Mt.sil, 1.45, 0, 0, g, 0, Math.PI / 2, 20);
    // kapasitor + servo (beban)
    cyl(.4, 1.1, Mt.cap, 3.1, .1, 0, g); cyl(.38, .06, Mt.sil, 3.1, .68, 0, g);
    box(1.6, 1.3, 1.1, Mt.blk, 5.2, 0, 0, g); cyl(.25, .3, Mt.sil, 5.7, .75, 0, g);
    // kabel
    box(8.1, .06, .06, Mt.blk, 1.05, 0, 0, g);

    const lbBat = label(L('Battery', 'Baterai'), 2.3, [-4.6, 1.4, 0], g);
    label('BMS 2S 20A', 2.3, [-1.6, 1.3, 0], g);
    label('Fuse 10 A', 2.3, [.7, 1.3, 0], g);
    const lbCapP = label(L('Capacitor', 'Kapasitor'), 2.3, [3.1, 1.7, 0], g);
    label('Servo', 2.3, [5.2, 1.4, 0], g);
    const flow = [0, 1, 2, 3, 4, 5, 6].map(() => ball(.1, G(0xffd45e), 0, 0, 0, g));
    const surge = ball(.2, G(0xff3b30), 0, 0, 0, g);
    const flash = ball(.5, G(0xff7a3a, { transparent: true, depthWrite: false }), 1.45, 0, 0, g); flash.visible = false;
    return {
      g, th: .4, ph: 1.2, r: 6.8,
      update(t) {
        lbBat.userData.set(L('Battery', 'Baterai'));
        lbCapP.userData.set(L('Capacitor', 'Kapasitor'));
        flow.forEach((b, i) => { const u = (t * .17 + i / 7) % 1; b.position.set(-3 + 8.2 * u, 0, 0); b.scale.setScalar(.8 + .3 * Math.sin(t * 6 + i)) });
        const c = (t % 3.6) / 3.6;
        if (c < .55) { const u = c / .55; surge.visible = true; flash.visible = false; surge.position.set(4.4 - 2.95 * u, 0, 0); smat.emissiveIntensity = .25 }
        else {
          surge.visible = false; const f = (c - .55) / .3;
          if (f < 1) { flash.visible = true; flash.scale.setScalar(.3 + 1.7 * f); flash.material.opacity = .85 * (1 - f); smat.emissiveIntensity = .25 + .8 * (1 - f) }
          else { flash.visible = false; smat.emissiveIntensity = .25 }
        }
        fil.material.color.setHex(c > .55 && c < .85 ? 0x555555 : 0xff9a3a);
      }
    };
  };

  // 06 Simulasi 3D: jumlah jari terbuka diatur, sisanya menekuk
  S.sim = () => {
    const g = new THREE.Group(), hand = makeHand('solid'); g.add(hand.g);
    box(2.4, 1.4, .35, Mt.wht, 0, -2.4, 0, g);
    box(7.2, .4, 4.4, Mt.yel, 0, -3.1, .2, g);
    [-2, -1, 0, 1, 2].forEach((x) => box(.9, 1.0, 1.3, Mt.blk, x, -2.4, -.95, g));
    const lb = label(L('Open fingers: 5', 'Jari terbuka: 5'), 3.4, [0, 4, 0], g);
    const seq = [5, 4, 3, 2, 1, 0, 1, 2, 3, 4], cur = [0, 0, 0, 0, 0];
    return {
      g, th: .55, ph: 1.25,
      update(t, dt) {
        dt = dt || .016;
        const n = seq[Math.floor(t / 1.0) % seq.length];
        cur.forEach((c, i) => { cur[i] += ((i < n ? 0 : 1) - c) * (1 - Math.exp(-dt * 6)); hand.set(i, cur[i]) });
        lb.userData.set(L('Open fingers: ', 'Jari terbuka: ') + n);
      }
    };
  };

// ---------- viewer bersama (persis seperti features3d.js) ----------
export function createFeatureViewer(canvas, { onReady } = {}) {
  let R;
  try {
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  // Pencahayaan studio cerah setara features3d.js untuk Three.js r165
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a94, 1.45));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.65); d1.position.set(6, 10, 8); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.75); d2.position.set(-7, 3, -6); scene.add(d2);

  const tg = new THREE.Vector3();
  const cache = {};
  let cur = null, prev = null, tIn = 0, tOut = 0, follow = 0, resume = 0, drag = null;
  let vis = true, auto = !reduce, disposed = false, raf = 0, readyFired = false;
  let th = 0.6, ph = 1.1, dist = 34, tth = 0.6, tph = 1.1, tdist = 34, clock = 0, last = performance.now();

  function get(k) {
    if (!cache[k]) {
      const s = S[k]();
      const g = s.g;
      const bb = new THREE.Box3().setFromObject(g);
      const c = bb.getCenter(new THREE.Vector3());
      const r = s.r || bb.getSize(new THREE.Vector3()).length() / 2;
      g.position.sub(c);
      const h = new THREE.Group();
      h.add(g);
      h.visible = false;
      scene.add(h);
      cache[k] = { h, s, r, th: s.th == null ? 0.6 : s.th, ph: s.ph == null ? 1.1 : s.ph };
    }
    return cache[k];
  }

  function layout() {
    if (!cur) return;
    const asp = cam.aspect || 1;
    tdist = cur.r / Math.sin(16 * Math.PI / 180) * 1.28 / Math.min(1, asp * 1.1);
    tg.set(0, -cur.r * 0.13, 0);
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

  const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; }, { rootMargin: '80px' });
  io.observe(canvas);

  const onDown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = [e.clientX, e.clientY];
    auto = false;
    follow = 0;
    tph = ph;
  };
  const onMove = (e) => {
    if (!drag) return;
    th -= (e.clientX - drag[0]) * 0.01;
    ph = Math.min(1.75, Math.max(0.45, ph - (e.clientY - drag[1]) * 0.008));
    tph = ph;
    drag = [e.clientX, e.clientY];
  };
  const onEnd = () => {
    if (!drag) return;
    drag = null;
    if (!reduce) resume = performance.now() + 3500;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);

  function show(k) {
    const n = get(k);
    if (n === cur) return;
    const now = performance.now();
    const isFirst = !cur;
    if (prev && prev !== n) {
      prev.h.visible = false;
      prev.h.scale.setScalar(1);
      prev.h.rotation.y = 0;
    }
    prev = cur;
    cur = n;
    n.h.visible = true;
    if (reduce) {
      if (prev) prev.h.visible = false;
      prev = null;
      tIn = now - 9e3;
    } else {
      tOut = now;
      tIn = now + (prev ? 240 : 0);
    }
    tth = n.th;
    tph = n.ph;
    follow = now + 1400;
    layout();
    if (isFirst) {
      th = tth;
      ph = tph;
      dist = tdist;
    }
  }

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!vis || !cur) return;
    clock += dt;

    // transisi: adegan lama mengecil sambil berputar, adegan baru muncul membesar dengan sedikit pantulan
    if (prev) {
      const p = cl((now - tOut) / 320);
      const e = p * p * p;
      prev.h.scale.setScalar(Math.max(0.001, 1 - e));
      prev.h.rotation.y = e * 1.1;
      prev.s.update(clock, dt);
      if (p >= 1) {
        prev.h.visible = false;
        prev.h.scale.setScalar(1);
        prev.h.rotation.y = 0;
        prev = null;
      }
    }

    const p = cl((now - tIn) / 850);
    cur.h.scale.setScalar(Math.max(0.001, back(p)));
    cur.h.rotation.y = (1 - ease(p)) * -1.3;
    cur.s.update(clock, dt);

    // kamera
    if (drag == null && !auto && resume && now > resume) { auto = true; resume = 0; }
    if (auto && drag == null) th += 0.0032 * dt * 60;
    if (now < follow) th += Math.atan2(Math.sin(tth - th), Math.cos(tth - th)) * Math.min(1, dt * 5);
    ph += (tph - ph) * Math.min(1, dt * 4.5);
    dist += (tdist - dist) * Math.min(1, dt * 5);
    cam.position.set(
      tg.x + dist * Math.sin(ph) * Math.sin(th),
      tg.y + dist * Math.cos(ph),
      tg.z + dist * Math.sin(ph) * Math.cos(th)
    );
    cam.lookAt(tg);
    R.render(scene, cam);

    if (!readyFired) {
      readyFired = true;
      onReady?.();
    }
  }
  raf = requestAnimationFrame(loop);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    R.dispose();
  }

  return { show, dispose };
}
