/* scene3d.js — 3D-сцена урока на Three.js r128. Единственный источник геометрии — CIRCUIT:
   x и y в мм стали осями X и Z, ось Y смотрит вверх, одна единица сцены равна одному миллиметру.
   Кадр рисуется только по запросу (invalidate), тени пересчитываются только при изменении сборки. */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});

  /* Высоты над столом, мм. */
  const STANDOFF = 3;
  const PCB_T = 1.6;
  const PCB_TOP = STANDOFF + PCB_T;
  const HEADER_H = 8.5;
  const HEADER_TOP = PCB_TOP + HEADER_H;
  const BB_TOP = 8.5;
  const TIP_IN = 3;       // наконечник провода уходит в отверстие
  const TIP_OUT = 1.3;    // и виден над ним
  const SLEEVE = 3.2;      // пластиковая гильза над наконечником
  const END = TIP_OUT + SLEEVE;
  const FALL = 26;        // с какой высоты падает новая деталь
  const EXPOSURE = 0.82;

  const WIRE_R = 0.85;
  const P = 2.54;

  /* Начальные направления камеры, от цели к камере. Расстояние считает fitView. */
  const VIEWS = {
    iso: [-0.2, 0.95, 1],
    top: [0, 1, 0.0006],
    front: [0, 0.22, 1],
    side: [1, 0.34, 0.16],
  };
  // Коврик и вся собранная схема: по ним камера вписывается, поэтому между шагами вид не прыгает.
  const MAT = { x: [-15, 169], y: [-26, 71] };
  const BUILD = { x: [-7, 161], y: [-18, 63], h: 26 };

  const fall = (t) => (t < 0.72 ? 1 - (t / 0.72) * (t / 0.72) : 0.05 * Math.sin(((t - 0.72) / 0.28) * Math.PI));
  const smooth = (t) => t * t * (3 - 2 * t);
  const tokens = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function webglReady() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return Boolean(gl);
    } catch (e) {
      return false;
    }
  }

  function createScene3D(host, opts) {
    const C = NS.CIRCUIT;
    const THREE = root.THREE;
    const el = document.createElement('div');
    el.className = 's3d';
    host.appendChild(el);

    const showFailure = () => {
      el.innerHTML =
        '<div class="s3d-msg"><b>3D-вид здесь не запустился</b>' +
        '<span>Этому компьютеру или браузеру не хватает WebGL. Переключись на 2D: там та же схема, и всё работает.</span></div>';
    };
    const stub = {
      setStep() {}, setUpto() {}, highlight() {}, setCamera() {}, setLabels() {}, resize() {},
      destroy() { el.remove(); },
    };
    if (!THREE || !THREE.OrbitControls || !webglReady()) {
      showFailure();
      return stub;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      showFailure();
      return stub;
    }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const canvas = renderer.domElement;
    canvas.className = 's3d-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '3D-модель: Arduino Uno, макетка и детали. Стрелки поворачивают вид, плюс и минус приближают.');
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const stage = new THREE.Color(tokens('--stage') || '#f4f7f6');
    scene.background = stage.clone();
    const camera = new THREE.PerspectiveCamera(18, 2, 40, 3200);
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.minDistance = 90;
    controls.maxDistance = 1500;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.enableZoom = false; // колесо листает страницу, пока по сцене не щёлкнули

    /* --- Материалы и текстуры --- */
    const textures = [];
    const painters = [];
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const std = (hex, roughness, metalness = 0, extra) =>
      new THREE.MeshStandardMaterial(Object.assign({ color: srgb(hex), roughness, metalness }, extra));

    const M = {
      black: std('#17191c', 0.52),
      dark: std('#26292d', 0.46),
      metal: std('#cfd4d8', 0.3, 1),
      steel: std('#aeb4ba', 0.42, 1),
      gold: std('#dcb65c', 0.3, 1),
      nylon: std('#ece9df', 0.58),
      board: std('#f3f1ea', 0.62),
      boardLow: std('#dcd9cf', 0.7),
      pcbEdge: std('#3e6f66', 0.6),
      legs: std('#c2c7cc', 0.34, 1),
    };

    function canvasTexture(w, h, paint) {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = aniso;
      const redraw = () => {
        ctx.clearRect(0, 0, w, h);
        paint(ctx, w, h);
        tex.needsUpdate = true;
      };
      redraw();
      textures.push(tex);
      painters.push(redraw);
      return tex;
    }

    // UV у ExtrudeGeometry равны координатам формы: совмещаем холст с прямоугольником на плане.
    function planUV(tex, x0, y0, w, h) {
      tex.flipY = false;
      tex.repeat.set(1 / w, 1 / h);
      tex.offset.set(-x0 / w, -y0 / h);
      return tex;
    }

    const mono = () => tokens('--font-mono') || 'monospace';
    function say(ctx, k, str, x, y, size, o) {
      const q = o || {};
      ctx.save();
      ctx.translate(x * k, y * k);
      if (q.rot) ctx.rotate(q.rot);
      ctx.font = (q.weight || 600) + ' ' + size * k + 'px ' + (q.font || mono());
      ctx.textAlign = q.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = q.color || '#f2f7f6';
      ctx.fillText(str, 0, 0);
      ctx.restore();
    }

    /* --- Геометрия --- */
    function rr(x0, y0, x1, y1, r) {
      const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
      const s = new THREE.Shape();
      s.moveTo(x0 + a, y0);
      s.lineTo(x1 - b, y0);
      s.quadraticCurveTo(x1, y0, x1, y0 + b);
      s.lineTo(x1, y1 - c);
      s.quadraticCurveTo(x1, y1, x1 - c, y1);
      s.lineTo(x0 + d, y1);
      s.quadraticCurveTo(x0, y1, x0, y1 - d);
      s.lineTo(x0, y0 + a);
      s.quadraticCurveTo(x0, y0, x0 + a, y0);
      return s;
    }

    // Плита из формы на плане: верх на высоте top, скошенные края внутрь контура.
    function slab(shape, top, height, bevel = 0.2, seg = 5) {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: height - 2 * bevel,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: 2,
        curveSegments: seg,
      });
      g.rotateX(Math.PI / 2);
      g.translate(0, top - bevel, 0);
      return g;
    }
    const rbox = (w, d, h, r = 0.25, b = 0.14) => slab(rr(-w / 2, -d / 2, w / 2, d / 2, r), h, h, b);
    const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

    function put(parent, geo, mat, x = 0, h = 0, y = 0, cast = true) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, h, y);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    /* Ломаная со скруглёнными углами. */
    function filleted(pts, radius) {
      const path = new THREE.CurvePath();
      let from = pts[0];
      for (let i = 1; i < pts.length - 1; i++) {
        const v = pts[i];
        const a = pts[i - 1];
        const b = pts[i + 1];
        const da = a.distanceTo(v);
        const db = b.distanceTo(v);
        const p0 = v.clone().lerp(a, Math.min(radius, da * 0.48) / da);
        const p1 = v.clone().lerp(b, Math.min(radius, db * 0.48) / db);
        path.add(new THREE.LineCurve3(from, p0));
        path.add(new THREE.QuadraticBezierCurve3(p0, v, p1));
        from = p1;
      }
      path.add(new THREE.LineCurve3(from, pts[pts.length - 1]));
      return path;
    }

    const V = (x, h, y) => new THREE.Vector3(x, h, y);

    /* --- Окружение и свет --- */
    function buildEnvironment() {
      const env = new THREE.Scene();
      env.background = new THREE.Color('#616a6a');
      const lamp = (w, h, x, y, z, power) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }));
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        env.add(m);
      };
      lamp(16, 11, -1, 9, -1, 2.0);      // большой софтбокс сверху
      lamp(3, 14, -11, 4, 4, 2.2);         // длинная полоса слева
      lamp(3, 14, 11, 5, -5, 1.5);       // и справа
      lamp(16, 4, 2, 3, 12, 1.5);     // низкая полоса спереди, блик на вертикальных гранях
      lamp(30, 30, 0, -9, 0, 0.16);      // тёмный пол даёт контраст металлу
      const pmrem = new THREE.PMREMGenerator(renderer);
      const target = pmrem.fromScene(env, 0.025, 0.1, 60);
      pmrem.dispose();
      env.traverse((n) => {
        if (n.isMesh) {
          n.geometry.dispose();
          n.material.dispose();
        }
      });
      scene.environment = target.texture;
      return target;
    }
    const envTarget = buildEnvironment();

    const midX = (MAT.x[0] + MAT.x[1]) / 2;
    const midY = (MAT.y[0] + MAT.y[1]) / 2;
    const key = new THREE.DirectionalLight('#fff4e6', 1.75);
    key.position.set(midX - 95, 230, midY - 120);
    key.target.position.set(midX, 0, midY);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -135, right: 135, top: 105, bottom: -105, near: 60, far: 460 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.18;
    scene.add(key, key.target);

    // Свет RGB-светодиода живёт в сцене всегда: включать и выключать источник дороже, чем менять яркость.
    const ledLight = new THREE.PointLight('#ffffff', 0, 64, 2);
    scene.add(ledLight);

    /* --- Стол --- */
    function buildTable() {
      const x0 = MAT.x[0];
      const y0 = MAT.y[0];
      const w = MAT.x[1] - x0;
      const d = MAT.y[1] - y0;
      const k = 8;
      const tex = planUV(
        canvasTexture(w * k, d * k, (ctx, cw, ch) => {
          ctx.fillStyle = '#bccbc6';
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = 'rgba(14,60,66,.14)';
          for (let i = 0; i <= w / 10; i++) {
            ctx.lineWidth = i % 5 === 3 ? 2.4 : 1.2;
            ctx.beginPath();
            ctx.moveTo((i * 10 + 4) * k, 0);
            ctx.lineTo((i * 10 + 4) * k, ch);
            ctx.stroke();
          }
          for (let i = 0; i <= d / 10; i++) {
            ctx.lineWidth = i % 5 === 3 ? 2.4 : 1.2;
            ctx.beginPath();
            ctx.moveTo(0, (i * 10 + 3) * k);
            ctx.lineTo(cw, (i * 10 + 3) * k);
            ctx.stroke();
          }
          // Мягкая тень-контакт под платами: она запечена и не считается в кадре.
          ctx.fillStyle = 'rgba(16,44,48,.42)';
          ctx.shadowColor = 'rgba(16,44,48,.55)';
          ctx.shadowBlur = 5 * k;
          ctx.fillRect((C.UNO.x - x0) * k, (C.UNO.y - y0) * k, C.UNO.w * k, C.UNO.h * k);
          ctx.fillRect((C.BB.x - x0) * k, (C.BB.y - y0) * k, C.BB.w * k, C.BB.h * k);
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
        }),
        x0, y0, w, d
      );
      const table = put(scene, slab(rr(x0, y0, x0 + w, y0 + d, 6), 0, 1.6, 0.3), [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }), std('#c9d3d0', 0.8)], 0, 0, 0, false);
      table.userData.noDim = true;

      const shade = canvasTexture(512, 300, (ctx, cw, ch) => {
        ctx.fillStyle = 'rgba(16,44,48,.3)';
        ctx.shadowColor = 'rgba(16,44,48,.3)';
        ctx.shadowBlur = 22;
        ctx.fillRect(44, 44, cw - 88, ch - 88);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      });
      const under = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.17, d * 1.3), new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false, toneMapped: false }));
      under.rotation.x = -Math.PI / 2;
      under.position.set(x0 + w / 2 + 2, -1.7, y0 + d / 2 + 2.5);
      scene.add(under);
    }

    /* --- Arduino Uno --- */
    const CHIP = { x: 47.7, y: 36.8 };

    function paintUno(ctx, cw, ch) {
      const k = cw / C.UNO.w;
      ctx.fillStyle = '#047a85';
      ctx.fillRect(0, 0, cw, ch);

      // Дорожки под маской: чуть светлее самой платы.
      ctx.strokeStyle = 'rgba(150,240,240,.2)';
      ctx.lineWidth = 0.26 * k;
      ctx.lineJoin = 'round';
      const route = (pts) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
        ctx.stroke();
      };
      Object.keys(C.UNO_TOP).forEach((pin, i) => {
        const a = C.pos('uno:' + pin);
        const end = CHIP.x - 16.5 + (i % 14) * P;
        const bend = 11.5 + (i % 5) * 1.05;
        route([[a.x, a.y], [a.x, bend], [end, bend + Math.abs(a.x - end) * 0.35], [end, CHIP.y - 4]]);
      });
      Object.keys(C.UNO_BOTTOM).forEach((pin, i) => {
        const a = C.pos('uno:' + pin);
        route([[a.x, a.y], [a.x, 44 - (i % 3) * 0.7], [CHIP.x - 16.5 + (i % 14) * P, CHIP.y + 4]]);
      });
      [[9, 24], [11.5, 30], [14, 35], [23, 24], [26, 27], [24, 34]].forEach(([x, y], i) => route([[x, y], [x + 5 + i, y + 3], [x + 5 + i, y + 8]]));
      ctx.fillStyle = 'rgba(150,240,240,.16)';
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc((6 + ((i * 37) % 56)) * k, (24 + ((i * 23) % 20)) * k, 0.3 * k, 0, 7);
        ctx.fill();
      }

      // Кольца крепёжных отверстий.
      UNO_HOLES.forEach(([x, y]) => {
        ctx.fillStyle = '#d7c07a';
        ctx.beginPath();
        ctx.arc(x * k, y * k, 2.3 * k, 0, 7);
        ctx.fill();
      });

      // Подписи пинов: как на плате, поворот на 90° и текст к гребёнке.
      const silk = '#f3f8f7';
      Object.keys(C.UNO_TOP).forEach((pin) => {
        const a = C.pos('uno:' + pin);
        say(ctx, k, C.UNO_LABEL[pin], a.x, 4.5, 1.5, { rot: -Math.PI / 2, align: 'right', color: silk });
      });
      Object.keys(C.UNO_BOTTOM).forEach((pin) => {
        const a = C.pos('uno:' + pin);
        say(ctx, k, C.UNO_LABEL[pin], a.x, 48.9, 1.5, { rot: -Math.PI / 2, align: 'left', color: silk });
      });

      ctx.strokeStyle = silk;
      ctx.lineWidth = 0.22 * k;
      const rule = (x0, x1, y) => {
        ctx.beginPath();
        ctx.moveTo(x0 * k, y * k);
        ctx.lineTo(x1 * k, y * k);
        ctx.stroke();
      };
      const px = (pin) => C.pos('uno:' + pin).x;
      rule(px('D13') - 1, px('D0') + 1, 10.7);
      say(ctx, k, 'DIGITAL (PWM~)', (px('D13') + px('D0')) / 2, 12.3, 1.75, { color: silk });
      rule(px('IOREF') - 1, px('VIN') + 1, 43.9);
      say(ctx, k, 'POWER', (px('IOREF') + px('VIN')) / 2, 42.5, 1.75, { color: silk });
      rule(px('A0') - 1, px('A5') + 1, 43.9);
      say(ctx, k, 'ANALOG IN', (px('A0') + px('A5')) / 2, 42.5, 1.75, { color: silk });

      // Надпись UNO в капсуле, без логотипа.
      ctx.lineWidth = 0.34 * k;
      ctx.beginPath();
      ctx.moveTo(42 * k, 15.3 * k);
      ctx.lineTo(53 * k, 15.3 * k);
      ctx.arc(53 * k, 19 * k, 3.7 * k, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(42 * k, 22.7 * k);
      ctx.arc(42 * k, 19 * k, 3.7 * k, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.stroke();
      say(ctx, k, 'UNO', 47.5, 19.1, 5, { color: silk, weight: 700, font: tokens('--font-display') });

      say(ctx, k, 'RX', 31.2, 19.6, 1.4, { color: silk });
      say(ctx, k, 'TX', 31.2, 16.9, 1.4, { color: silk });
      say(ctx, k, 'L', 31.2, 12.6, 1.4, { color: silk });
      say(ctx, k, 'ON', 60, 15, 1.4, { color: silk });
      say(ctx, k, 'ICSP', 63.5, 22, 1.4, { color: silk });
      say(ctx, k, 'RESET', 6.4, 9.1, 1.25, { color: silk });
    }

    const UNO_HOLES = [[13.97, 50.8], [15.24, 2.54], [66.04, 7.62], [66.04, 35.56]];

    function unoShape() {
      // Контур Uno с клином справа. Гребёнка D0–D7 в CIRCUIT стоит у самого края, поэтому верхний угол срезан мягче.
      const s = new THREE.Shape();
      const w = C.UNO.w;
      const h = C.UNO.h;
      s.moveTo(1.2, 0);
      s.lineTo(w - 2.6, 0);
      s.lineTo(w - 1, 1.6);
      s.lineTo(w - 1, 12.4);
      s.lineTo(w, 13.4);
      s.lineTo(w, h - 2.54);
      s.lineTo(w - 2.54, h);
      s.lineTo(1.2, h);
      s.quadraticCurveTo(0, h, 0, h - 1.2);
      s.lineTo(0, 1.2);
      s.quadraticCurveTo(0, 0, 1.2, 0);
      UNO_HOLES.forEach(([x, y]) => {
        const p = new THREE.Path();
        p.absarc(x, y, 1.6, 0, Math.PI * 2, true);
        s.holes.push(p);
      });
      return s;
    }

    function buildUno() {
      const g = new THREE.Group();
      scene.add(g);
      const T = PCB_TOP;

      const pcbTex = planUV(canvasTexture(2048, 1593, paintUno), 0, 0, C.UNO.w, C.UNO.h);
      const pcbMat = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.5, envMapIntensity: 0.6 });
      put(g, slab(unoShape(), T, PCB_T, 0.1, 6), [pcbMat, M.pcbEdge]);
      UNO_HOLES.forEach(([x, y]) => {
        put(g, new THREE.CylinderGeometry(2.2, 2.4, STANDOFF, 20).translate(0, STANDOFF / 2, 0), M.nylon, x, 0, y);
        put(g, lathe([[2.2, 0], [2.2, 0.25], [1.7, 0.55], [0, 0.55]], 20), M.steel, x, T, y); // головка винта
      });

      // Гребёнки: отверстия одной текстурой с повтором по длине.
      const holeTex = canvasTexture(64, 64, (ctx) => {
        ctx.fillStyle = '#1c1e21';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#34373b';
        ctx.fillRect(13, 13, 38, 38);
        ctx.fillStyle = '#050506';
        ctx.fillRect(19, 19, 26, 26);
        ctx.fillStyle = '#6a6252';
        ctx.fillRect(25, 37, 14, 3);
      });
      holeTex.wrapS = holeTex.wrapT = THREE.RepeatWrapping;
      planUV(holeTex, 0, 0, P, P);
      const headerMat = [new THREE.MeshStandardMaterial({ map: holeTex, roughness: 0.5 }), M.black];
      [C.UNO_TOP, C.UNO_BOTTOM].forEach((row) => {
        const pins = Object.keys(row);
        let start = 0;
        for (let i = 1; i <= pins.length; i++) {
          if (i < pins.length && row[pins[i]] - row[pins[i - 1]] === 100) continue;
          const n = i - start;
          const a = C.pos('uno:' + pins[start]);
          put(g, slab(rr(0, 0, n * P, P, 0.2), HEADER_H, HEADER_H, 0.12, 2), headerMat, a.x - P / 2, T, a.y - P / 2);
          start = i;
        }
      });

      // USB-B: полая жестяная коробка, внутри тёмный колодец и пластиковый язычок.
      const usbY = 9.34;
      const usb = rr(0, 0, 12, 10.9, 0.7);
      usb.holes.push(rr(0.45, 0.45, 11.55, 10.45, 0.4));
      const usbGeo = new THREE.ExtrudeGeometry(usb, { depth: 16, bevelEnabled: false, curveSegments: 4 });
      usbGeo.rotateY(-Math.PI / 2);
      put(g, usbGeo, M.metal, 9.65, T, usbY);
      put(g, new THREE.BoxGeometry(12.2, 10, 11.1), M.black, 3.6, T + 5.45, usbY + 6);
      put(g, new THREE.BoxGeometry(3.4, 3.1, 7.6), M.nylon, -4.2, T + 5.6, usbY + 6, false);

      // Разъём питания.
      const jackY = 41.1;
      const jack = rr(0, 0, 9, 11, [0.5, 0.5, 2, 2]);
      const bore = new THREE.Path();
      bore.absarc(4.5, 5.6, 3.15, 0, Math.PI * 2, true);
      jack.holes.push(bore);
      const jackGeo = new THREE.ExtrudeGeometry(jack, { depth: 14.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 2, curveSegments: 12 });
      jackGeo.rotateY(-Math.PI / 2);
      put(g, jackGeo, M.black, 12.6, T, jackY);
      put(g, new THREE.CylinderGeometry(3.3, 3.3, 11.6, 24).rotateZ(Math.PI / 2), M.dark, 6.2, T + 5.6, jackY + 4.5);
      put(g, new THREE.CylinderGeometry(1, 1, 8.6, 16).rotateZ(Math.PI / 2), M.metal, 2.4, T + 5.6, jackY + 4.5, false);

      // ATmega328P в панельке.
      const chipTex = canvasTexture(1024, 204, (ctx, cw, ch) => {
        const k = cw / 35.2;
        ctx.fillStyle = '#26282c';
        ctx.fillRect(0, 0, cw, ch);
        say(ctx, k, 'ATMEGA328P-PU', 15.5, 3.5, 2, { color: '#b9bec2', weight: 500 });
        ctx.fillStyle = '#17181b';
        ctx.beginPath();
        ctx.arc(cw, ch / 2, 1.5 * k, 0, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(32.6 * k, 5.6 * k, 0.65 * k, 0, 7);
        ctx.fill();
      });
      planUV(chipTex, -17.6, -3.5, 35.2, 7);
      put(g, rbox(37.4, 10, 2.5, 0.3, 0.14), M.black, CHIP.x, T, CHIP.y);
      const dipPins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 2.2, 1.5), M.metal, 28);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 28; i++) {
        dummy.position.set(CHIP.x + (i % 14 - 6.5) * P, T + 3.3, CHIP.y + (i < 14 ? -3.75 : 3.75));
        dummy.updateMatrix();
        dipPins.setMatrixAt(i, dummy.matrix);
      }
      g.add(dipPins);
      put(g, slab(rr(-17.6, -3.5, 17.6, 3.5, 0.3), 3.5, 3.5, 0.3, 2), [new THREE.MeshStandardMaterial({ map: chipTex, roughness: 0.5 }), M.dark], CHIP.x, T + 2.5, CHIP.y);

      // Кварц, конденсаторы, кнопка сброса, стабилизатор.
      put(g, rbox(11.8, 4.8, 3.6, 2.35, 0.3), M.metal, 18.4, T, 28.2);
      const capTop = canvasTexture(128, 128, (ctx, cw) => {
        ctx.fillStyle = '#c8cdd1';
        ctx.fillRect(0, 0, cw, cw);
        ctx.fillStyle = '#16181b';
        ctx.fillRect(0, 0, cw * 0.38, cw);
        ctx.strokeStyle = 'rgba(40,44,48,.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cw * 0.5, cw * 0.18);
        ctx.lineTo(cw * 0.5, cw * 0.82);
        ctx.moveTo(cw * 0.18, cw * 0.5);
        ctx.lineTo(cw * 0.82, cw * 0.5);
        ctx.stroke();
      });
      const capTopMat = new THREE.MeshStandardMaterial({ map: capTop, roughness: 0.34, metalness: 0.65 });
      [[16.8, 45.2], [24.2, 45.2]].forEach(([x, y]) => {
        put(g, rbox(6.8, 6.8, 1.3, 0.5, 0.15), M.black, x, T, y);
        put(g, lathe([[3.15, 0], [3.15, 5], [2.95, 5.35], [0, 5.35]], 32), M.metal, x, T + 0.4, y);
        const lid = put(g, new THREE.CircleGeometry(2.9, 32).rotateX(-Math.PI / 2), capTopMat, x, T + 5.76, y, false);
        lid.rotation.y = Math.PI;
      });
      put(g, rbox(6.2, 6.2, 1.5, 0.3, 0.12), M.steel, 6.4, T, 5);
      put(g, lathe([[1.9, 0], [1.9, 1.5], [1.55, 1.75], [0, 1.75]], 24), std('#b5472f', 0.45), 6.4, T + 1.5, 5);
      put(g, rbox(6.6, 3.6, 1.6, 0.14, 0.1), M.black, 7, T + 0.1, 36.3);
      put(g, new THREE.BoxGeometry(3.4, 0.28, 1.6), M.steel, 7, T + 0.15, 33.6);
      [-2.3, 0, 2.3].forEach((d) => put(g, new THREE.BoxGeometry(0.7, 0.26, 1.6), M.steel, 7 + d, T + 0.14, 38.8, false));

      // 16U2 и мелкие детали.
      put(g, rbox(5.6, 5.6, 1.1, 0.12, 0.08), M.dark, 19.4, T, 19.2);
      put(g, rbox(3.2, 3.2, 1.1, 0.12, 0.08), M.dark, 18.6, T, 34.2);
      const smd = [
        [12.6, 15.6, 1.6, 0.9, 0.6, '#1d1f22'], [12.6, 18, 1.6, 0.9, 0.6, '#1d1f22'], [12.6, 20.4, 1.6, 0.9, 0.6, '#c9a982'],
        [24.4, 15.2, 0.9, 1.6, 0.6, '#c9a982'], [24.4, 18.6, 0.9, 1.6, 0.6, '#1d1f22'], [24.4, 22.4, 0.9, 1.6, 0.6, '#c9a982'],
        [21.8, 38.9, 3, 1.6, 1, '#1d1f22'], [29.5, 26.6, 1.6, 0.9, 0.6, '#c9a982'], [33, 26.6, 1.6, 0.9, 0.6, '#1d1f22'],
        [37, 26.6, 1.6, 0.9, 0.6, '#c9a982'], [41, 28.6, 3.2, 1.3, 0.9, '#3b3f44'], [56, 26.4, 1.6, 0.9, 0.6, '#1d1f22'],
        [59, 26.4, 1.6, 0.9, 0.6, '#c9a982'], [8.8, 28.2, 1.6, 0.9, 0.6, '#c9a982'], [27.6, 8.8, 1.6, 0.9, 0.6, '#1d1f22'],
        [13, 35.5, 2, 1.25, 0.7, '#c9a982'], [13, 38.4, 2, 1.25, 0.7, '#c9a982'],
      ];
      const small = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std('#ffffff', 0.48), smd.length);
      smd.forEach(([x, y, w, d, h, color], i) => {
        dummy.position.set(x, T + h / 2, y);
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        small.setMatrixAt(i, dummy.matrix);
        small.setColorAt(i, srgb(color));
      });
      small.castShadow = true;
      g.add(small);
      // Светодиоды платы. ON горит: Uno подключена.
      [[27.9, 12.6, '#d9c23a'], [27.9, 16.9, '#d9c23a'], [27.9, 19.6, '#d9c23a']].forEach(([x, y, c]) => put(g, new THREE.BoxGeometry(1.6, 0.6, 0.9), std(c, 0.35), x, T + 0.3, y, false));
      put(g, new THREE.BoxGeometry(1.6, 0.6, 0.9), std('#59e07f', 0.4, 0, { emissive: srgb('#35e06b'), emissiveIntensity: 1.6 }), 60, T + 0.3, 17.1, false);

      // ICSP: две гребёнки 2×3.
      [[63.5, 27.2], [14.9, 7.2]].forEach(([x, y]) => {
        put(g, rbox(5.1, 7.62, 2.5, 0.2, 0.12), M.black, x, T, y);
        const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.64, 6, 0.64), M.gold, 6);
        for (let i = 0; i < 6; i++) {
          dummy.position.set(x + (i % 2 ? 1.27 : -1.27), T + 3, y + (((i / 2) | 0) - 1) * P);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          pins.setMatrixAt(i, dummy.matrix);
        }
        pins.castShadow = true;
        g.add(pins);
      });
      return g;
    }

    /* --- Макетка --- */
    function paintBoard(ctx, cw, ch) {
      const k = cw / C.BB.w;
      const X = (x) => (x - C.BB.x) * k;
      const Y = (y) => (y - C.BB.y) * k;
      ctx.fillStyle = '#f3f1ea';
      ctx.fillRect(0, 0, cw, ch);

      // Канавки между рейками и рабочим полем.
      const railY = (r) => C.rowY(C.RAIL_UNITS[r]);
      const split = [(railY('tp') + C.rowY(C.ROW_UNITS.j)) / 2, (railY('bn') + C.rowY(C.ROW_UNITS.a)) / 2];
      split.forEach((y) => {
        ctx.fillStyle = 'rgba(60,56,48,.13)';
        ctx.fillRect(0, Y(y) - 0.32 * k, cw, 0.64 * k);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillRect(0, Y(y) + 0.32 * k, cw, 0.14 * k);
      });

      // Линии реек: цвет берём из того, какая рейка рядом.
      const line = (rail, side) => {
        ctx.fillStyle = rail[1] === 'p' ? '#d4332a' : '#2f6fd0';
        ctx.fillRect(X(C.colX(1)) - 0.8 * k, Y(railY(rail) + side * 1.72) - 0.17 * k, (C.colX(30) - C.colX(1) + 1.6) * k, 0.34 * k);
      };
      [['tn', 'tp'], ['bn', 'bp']].forEach(([a, b]) => {
        const [up, down] = railY(a) < railY(b) ? [a, b] : [b, a];
        line(up, -1);
        line(down, 1);
        [C.colX(1) - 2.5, C.colX(30) + 2.5].forEach((x) => {
          [up, down].forEach((r) => say(ctx, k, r[1] === 'p' ? '+' : '−', x, railY(r) - C.BB.y, 2.6, { color: r[1] === 'p' ? '#d4332a' : '#2f6fd0', weight: 700 }));
        });
      });

      const hole = (x, y) => {
        const hx = X(x);
        const hy = Y(y);
        ctx.fillStyle = 'rgba(70,64,54,.16)';
        ctx.fillRect(hx - 0.74 * k, hy - 0.74 * k, 1.48 * k, 1.48 * k);
        ctx.fillStyle = '#2d2b28';
        ctx.fillRect(hx - 0.54 * k, hy - 0.54 * k, 1.08 * k, 1.08 * k);
        ctx.fillStyle = '#0f0e0d';
        ctx.fillRect(hx - 0.38 * k, hy - 0.38 * k, 0.76 * k, 0.5 * k);
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(hx - 0.54 * k, hy + 0.56 * k, 1.08 * k, 0.1 * k);
      };
      for (let c = 1; c <= C.BB.cols; c++) {
        C.ROWS_TOPDOWN.forEach((r) => hole(C.colX(c), C.rowY(C.ROW_UNITS[r])));
        if (C.railHoleExists(c)) C.RAILS.forEach((r) => hole(C.colX(c), railY(r)));
      }

      const ink = '#5f5c55';
      C.ROWS_TOPDOWN.forEach((r) => {
        const y = C.rowY(C.ROW_UNITS[r]) - C.BB.y;
        say(ctx, k, r, C.colX(1) - 2.5 - C.BB.x, y, 1.75, { color: ink, weight: 500 });
        say(ctx, k, r, C.colX(30) + 2.5 - C.BB.x, y, 1.75, { color: ink, weight: 500 });
      });
      for (let c = 0; c <= C.BB.cols; c += 5) {
        const n = Math.max(1, c);
        const x = C.colX(n) - C.BB.x;
        say(ctx, k, String(n), x, C.rowY(C.ROW_UNITS.j) - 2.25 - C.BB.y, 1.6, { color: ink, weight: 500 });
        say(ctx, k, String(n), x, C.rowY(C.ROW_UNITS.a) + 2.25 - C.BB.y, 1.6, { color: ink, weight: 500 });
      }
    }

    function buildBoard() {
      const g = new THREE.Group();
      scene.add(g);
      const { x, y, w, h } = C.BB;
      const midY = (C.rowY(C.ROW_UNITS.e) + C.rowY(C.ROW_UNITS.f)) / 2;
      const half = 1.55;
      const depth = 1.5;
      const tex = planUV(canvasTexture(2048, 1356, paintBoard), x, y, w, h);
      const topMat = [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), M.board];
      put(g, slab(rr(x, y, x + w, y + h, 1.3), BB_TOP - depth, BB_TOP - depth, 0.2), M.boardLow);
      put(g, slab(rr(x, y, x + w, midY - half, [1.3, 1.3, 0.12, 0.12]), BB_TOP, depth + 0.2, 0.16), topMat);
      put(g, slab(rr(x, midY + half, x + w, y + h, [0.12, 0.12, 1.3, 1.3]), BB_TOP, depth + 0.2, 0.16), topMat);
      return g;
    }

    /* --- Детали --- */
    const items = new Map();
    const newItem = (id) => {
      const g = new THREE.Group();
      g.name = id;
      scene.add(g);
      items.set(id, g);
      return g;
    };

    // Вертикальная ножка: верх на высоте top, низ в отверстии. userData.ref нужен проверке координат.
    function leg(g, ref, top, w = 0.5, d = 0.5) {
      const p = C.pos(ref);
      const low = BB_TOP - TIP_IN;
      const m = put(g, new THREE.BoxGeometry(w, top - low, d), M.legs, p.x, (top + low) / 2, p.y, false);
      m.userData.ref = ref;
      m.userData.tip = low;
      return m;
    }

    let knob;
    let knobTop = 0;
    let knobAt = null;
    function buildPot() {
      const part = C.PARTS.pot;
      const g = newItem('pot');
      const mid = C.pos(part.legs.out);
      const y = mid.y - 6;
      const low = BB_TOP + 1.8;
      const bodyH = 6.4;
      Object.values(part.legs).forEach((ref) => leg(g, ref, low + 0.5, 0.95, 0.36));
      put(g, rbox(15.4, 15.4, bodyH, 1.5, 0.35), std('#2b2f33', 0.5), mid.x, low, y);
      put(g, lathe([[7, 0], [7, 0.5], [6.5, 0.72], [6.5, 0.72], [0, 0.72]], 48), M.steel, mid.x, low + bodyH, y);

      knob = new THREE.Group();
      knob.position.set(mid.x, low + bodyH + 0.72, y);
      g.add(knob);
      const dark = std('#212429', 0.42);
      put(knob, lathe([[7.9, 0], [7.9, 1], [7.9, 1], [6.9, 2], [6.9, 2], [0, 2]], 56), dark);

      const grip = new THREE.Shape();
      const lobes = 18;
      const n = lobes * 6;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const q = 6.5 + 0.28 * Math.cos(a * lobes);
        const px = q * Math.cos(a);
        const py = q * Math.sin(a);
        if (i) grip.lineTo(px, py);
        else grip.moveTo(px, py);
      }
      put(knob, slab(grip, 8.6, 6.9, 0.4, 1), dark, 0, 2, 0);
      put(knob, lathe([[5.55, 0], [5.55, 0.25], [5.35, 0.4], [5.35, 0.4], [0, 0.4]], 48), std('#3a3f45', 0.3, 0.75), 0, 10.55, 0);

      const white = std('#ffffff', 0.5);
      put(knob, new THREE.BoxGeometry(1.05, 0.14, 5.1), white, 0, 11.02, -2.75, false);
      put(knob, new THREE.BoxGeometry(1.05, 8.3, 0.5), white, 0, 6.2, -6.56, false);
      put(knob, new THREE.BoxGeometry(1.05, 1.3, 0.3), white, 0, 1.5, -7.72, false).rotation.x = -0.74;
      knobTop = knob.position.y + 10.9;
      knobAt = V(mid.x, knobTop, y);
    }

    let ledDome;
    let ledCore;
    let ledGlow;
    let ledAt;
    function buildRgb() {
      const part = C.PARTS.rgb;
      const g = newItem('rgb');
      const refs = [part.legs.r, part.legs.k, part.legs.g, part.legs.b];
      const pts = refs.map((r) => C.pos(r));
      const cx = (pts[0].x + pts[3].x) / 2;
      const cy = pts[0].y;
      const low = BB_TOP + 6;

      refs.forEach((ref, i) => {
        const p = pts[i];
        const top = cx + (i - 1.5) * 0.72;
        const curve = new THREE.CubicBezierCurve3(V(top, low + 1, cy), V(top, low - 3.6, cy), V(p.x, BB_TOP + 3.4, cy), V(p.x, BB_TOP - TIP_IN, cy));
        const m = put(g, new THREE.TubeGeometry(curve, 16, 0.24, 6, false), M.legs, 0, 0, 0, false);
        m.userData.ref = ref;
        m.userData.tip = BB_TOP - TIP_IN;
      });

      // Кристалл с чашечкой внутри купола.
      put(g, lathe([[0, 0], [0.95, 0], [1.2, 0.7], [0.8, 0.7], [0, 0.45]], 16), M.steel, cx - 0.2, low + 1.5, cy, false);
      ledCore = put(g, new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshStandardMaterial({ color: srgb('#ece9df'), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }), cx, low + 2.6, cy, false);

      const dome = [[0, 0], [2.95, 0], [2.95, 0], [2.95, 0.95], [2.95, 0.95], [2.52, 1], [2.52, 1], [2.52, 5.8]];
      for (let a = 8; a <= 90; a += 8) {
        const t = (a * Math.PI) / 180;
        dome.push([2.52 * Math.cos(t), 5.8 + 2.9 * Math.sin(t)]);
      }
      ledDome = put(g, lathe(dome, 36), new THREE.MeshStandardMaterial({
        color: srgb('#aebcc4'), roughness: 0.16, transparent: true, opacity: 0.74,
        emissive: 0xffffff, emissiveIntensity: 0, depthWrite: false,
      }), cx, low, cy);
      ledDome.userData.noDim = true;
      // Свечение гаснет к краю линзы: контур купола виден и на полной яркости.
      ledDome.material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          'totalEmissiveRadiance *= pow(saturate(dot(normal, normalize(vViewPosition))), 1.6);'
        );
      };

      // Ореол: яркая точка кристалла и слабый свет вокруг, сквозь него детали видны.
      const halo = canvasTexture(128, 128, (ctx, w) => {
        const r = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        r.addColorStop(0, 'rgba(255,255,255,1)');
        r.addColorStop(0.05, 'rgba(255,255,255,.75)');
        r.addColorStop(0.12, 'rgba(255,255,255,.3)');
        r.addColorStop(0.3, 'rgba(255,255,255,.14)');
        r.addColorStop(0.6, 'rgba(255,255,255,.04)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = r;
        ctx.fillRect(0, 0, w, w);
      });
      ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
      ledGlow.position.set(cx, low + 2.6, cy);
      ledGlow.renderOrder = 1;
      ledGlow.visible = false;
      g.add(ledGlow);

      ledAt = V(cx, low + 6, cy);
      ledLight.position.set(cx, low + 4.6, cy);
    }

    function buildResistor(id) {
      const part = C.PARTS[id];
      const g = newItem(id);
      const a = C.pos(part.legs.a);
      const b = C.pos(part.legs.b);
      const h = BB_TOP + 2.4;
      const midY = (a.y + b.y) / 2;
      const path = filleted([V(a.x, BB_TOP - TIP_IN, a.y), V(a.x, h, a.y), V(a.x, h, b.y), V(b.x, BB_TOP - TIP_IN, b.y)], 1.3);
      put(g, new THREE.TubeGeometry(path, 44, 0.26, 6, false), M.legs, 0, 0, 0, false);
      [[part.legs.a, a], [part.legs.b, b]].forEach(([ref, p]) => {
        const end = put(g, new THREE.SphereGeometry(0.26, 6, 4), M.legs, p.x, BB_TOP - TIP_IN, p.y, false);
        end.userData.ref = ref;
        end.userData.tip = BB_TOP - TIP_IN;
      });
      put(g, resistorGeo, resistorMat, a.x, h, midY);
    }

    // Колодка 6,3 мм: равномерный по длине профиль, чтобы полоски текстуры легли точно.
    const resistorProfile = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const y = -3.15 + 6.3 * t;
      const edge = Math.min(t, 1 - t);
      const bulge = Math.exp(-Math.pow((edge - 0.13) / 0.1, 2)) * 0.13;
      resistorProfile.push([edge < 0.012 ? 0.35 : Math.min(1.12, 0.32 + edge * 26) + bulge - 0.13, y]);
    }
    const resistorGeo = lathe(resistorProfile, 20).rotateX(Math.PI / 2);
    const resistorTex = canvasTexture(8, 256, (ctx, w, h) => {
      ctx.fillStyle = '#d8bb8c';
      ctx.fillRect(0, 0, w, h);
      [[0.14, 0.08, '#c62a1f'], [0.3, 0.08, '#c62a1f'], [0.46, 0.08, '#6a3714'], [0.76, 0.09, '#c8a13c']].forEach(([at, len, color]) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, at * h, w, len * h);
      });
    });
    const resistorMat = new THREE.MeshStandardMaterial({ map: resistorTex, roughness: 0.42 });

    let membrane;
    let buzzAt;
    function buildBuzzer() {
      const part = C.PARTS.buz;
      const g = newItem('buz');
      const a = C.pos(part.legs.plus);
      const b = C.pos(part.legs.minus);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const low = BB_TOP + 0.5;
      const H = 9.2;
      Object.values(part.legs).forEach((ref) => leg(g, ref, low + 0.5, 0.6, 0.6));
      put(g, new THREE.CylinderGeometry(6, 6, 0.5, 40).translate(0, 0.25, 0), M.dark, x, low, y);
      put(g, lathe([[6, 0], [6, H - 0.7], [5.8, H - 0.2], [5.4, H], [5.4, H], [1.5, H], [1.3, H - 0.14], [1.3, H - 1.7]], 56), M.black, x, low + 0.4, y);
      membrane = put(g, new THREE.CircleGeometry(1.34, 24).rotateX(-Math.PI / 2), std('#a48a4f', 0.38, 0.9), x, low + 0.4 + H - 1.5, y, false);
      const mark = canvasTexture(128, 128, (ctx, w) => {
        ctx.clearRect(0, 0, w, w);
        ctx.strokeStyle = '#eef1f0';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 34, w / 2);
        ctx.lineTo(w / 2 + 34, w / 2);
        ctx.moveTo(w / 2, w / 2 - 34);
        ctx.lineTo(w / 2, w / 2 + 34);
        ctx.stroke();
      });
      const plus = put(g, new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: mark, transparent: true, roughness: 0.6, depthWrite: false }), x, low + 0.4 + H + 0.02, y - 3.4, false);
      plus.userData.noDim = true;
      buzzAt = V(x, low + 0.4 + H, y);
    }

    let cap;
    function buildButton() {
      const part = C.PARTS.btn;
      const g = newItem('btn');
      const pts = Object.values(part.legs).map((r) => C.pos(r));
      const x = pts.reduce((s, p) => s + p.x, 0) / 4;
      const y = pts.reduce((s, p) => s + p.y, 0) / 4;
      const low = BB_TOP + 0.5;
      Object.values(part.legs).forEach((ref) => leg(g, ref, low + 0.5, 0.9, 0.4));
      put(g, rbox(9.4, 9.4, 3.7, 0.5, 0.22), M.black, x, low, y);
      put(g, rbox(8.6, 8.6, 0.3, 0.3, 0.06), M.steel, x, low + 3.7, y);
      [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].forEach(([dx, dy]) =>
        put(g, new THREE.CylinderGeometry(0.42, 0.42, 0.25, 12), M.dark, x + dx, low + 4.1, y + dy, false));
      cap = new THREE.Group();
      cap.position.set(x, low + 3.9, y);
      g.add(cap);
      put(cap, new THREE.CylinderGeometry(2.1, 2.1, 1, 24).translate(0, 0.4, 0), M.dark);
      put(cap, lathe([[3.1, 0.7], [3.1, 2.4], [2.9, 2.75], [2.4, 2.95], [0, 3]], 36), std('#e8b324', 0.42));
    }

    /* --- Провода --- */
    const wireMats = new Map();
    function wireMat(color) {
      if (!wireMats.has(color)) wireMats.set(color, std(C.WIRE_COLORS[color].hex, 0.4));
      return wireMats.get(color);
    }
    const surfaceAt = (ref) => (ref.startsWith('uno:') ? HEADER_TOP : BB_TOP);

    function wirePath(w) {
      const pts = C.wirePoints(w);
      const a = pts[0];
      const b = pts[pts.length - 1];
      const ha = surfaceAt(w.from) + END;
      const hb = surfaceAt(w.to) + END;
      if (pts.length === 2) {
        const span = Math.hypot(b.x - a.x, b.y - a.y);
        const lift = 1.6 + span * 0.5;
        return new THREE.CubicBezierCurve3(V(a.x, ha, a.y), V(a.x, ha + lift, a.y), V(b.x, hb + lift, b.y), V(b.x, hb, b.y));
      }
      const [, c1, c2] = pts;
      const reach = Math.abs(c1.y - a.y);
      const run = Math.abs(c2.x - c1.x);
      const shoulder = 13 + reach * 0.3;
      const sag = Math.max(5.5, shoulder - 4 - run * 0.09);
      return filleted([
        V(a.x, ha, a.y),
        V(a.x, ha + 6.5, a.y),
        V(c1.x, shoulder + 3, c1.y),
        V((c1.x + c2.x) / 2, sag, c1.y),
        V(c2.x, shoulder + 3, c2.y),
        V(b.x, hb + 8, b.y),
        V(b.x, hb, b.y),
      ], 9);
    }

    const sleeveGeo = new THREE.CylinderGeometry(WIRE_R + 0.1, 1.2, SLEEVE, 14).translate(0, SLEEVE / 2, 0);
    const tipGeo = new THREE.CylinderGeometry(0.33, 0.33, TIP_IN + TIP_OUT + 0.4, 8).translate(0, (TIP_IN + TIP_OUT + 0.4) / 2 - TIP_IN, 0);

    function buildWire(w) {
      const g = newItem(w.id);
      const mat = wireMat(w.color);
      const path = wirePath(w);
      const segments = Math.min(150, Math.max(26, Math.round(path.getLength() * 1.1)));
      put(g, new THREE.TubeGeometry(path, segments, WIRE_R, 9, false), mat);
      [w.from, w.to].forEach((ref) => {
        const p = C.pos(ref);
        const top = surfaceAt(ref);
        const tip = put(g, tipGeo, M.metal, p.x, top, p.y, false);
        tip.userData.ref = ref;
        tip.userData.tip = top - TIP_IN;
        put(g, sleeveGeo, mat, p.x, top + TIP_OUT, p.y);
      });
    }

    /* --- Сборка сцены --- */
    buildTable();
    const base = [buildUno(), buildBoard()];
    buildPot();
    buildRgb();
    ['r1', 'r2', 'r3'].forEach(buildResistor);
    buildBuzzer();
    buildButton();
    C.WIRES.forEach(buildWire);

    const ringGeo = new THREE.RingGeometry(0.965, 1, 56).rotateX(-Math.PI / 2);
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
      r.position.copy(buzzAt);
      r.position.y += 0.1;
      r.visible = false;
      scene.add(r);
      return r;
    });

    /* --- Подписи --- */
    const labelBox = document.createElement('div');
    labelBox.className = 's3d-labels';
    labelBox.hidden = true;
    el.appendChild(labelBox);
    const pcbMid = C.UNO.h / 2;
    const labels = [
      { id: null, text: 'Arduino Uno', at: V(C.UNO.w * 0.5, PCB_TOP + 1, pcbMid - 6) },
      { id: null, text: 'Макетка', at: V(C.colX(28), BB_TOP, C.rowY(C.ROW_UNITS.g)) },
      { id: 'pot', text: 'Потенциометр', at: knobAt.clone() },
      { id: 'rgb', text: 'RGB-светодиод', at: ledAt.clone().setY(ledAt.y + 3) },
      { id: 'buz', text: 'Buzzer', at: buzzAt.clone() },
      { id: 'btn', text: 'Кнопка', at: V(cap.position.x, cap.position.y + 3, cap.position.z) },
    ].map((l) => {
      const node = document.createElement('div');
      node.className = 's3d-label';
      node.innerHTML = '<i></i><span></span>';
      node.lastChild.textContent = l.text;
      node.hidden = true;
      labelBox.appendChild(node);
      return Object.assign(l, { node, stem: node.firstChild, pill: node.lastChild, w: 0, h: 0 });
    });

    let labelsOn = false;
    const probe = new THREE.Vector3();
    function placeLabels() {
      if (!labelsOn) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const STEM = 22;
      const live = [];
      labels.forEach((l) => {
        probe.copy(l.at).project(camera);
        const x = ((probe.x + 1) / 2) * W;
        const y = ((1 - probe.y) / 2) * H;
        const off = (l.id && !items.get(l.id).visible) || probe.z > 1 || x < 0 || x > W || y < 0 || y > H;
        l.node.hidden = off;
        if (off) return;
        if (!l.w) {
          l.w = l.pill.offsetWidth;
          l.h = l.pill.offsetHeight;
        }
        l.x = x;
        l.y = y;
        live.push(l);
      });
      // Нижние метки ставим первыми, остальные поднимаем, пока не перестанут накладываться.
      live.sort((a, b) => b.y - a.y);
      const taken = [];
      live.forEach((l) => {
        const left = Math.min(W - l.w - 4, Math.max(4, l.x - l.w / 2));
        let top = l.y - STEM - l.h;
        for (let again = true; again; ) {
          again = false;
          taken.forEach((t) => {
            if (left < t.left + t.w + 6 && left + l.w + 6 > t.left && top < t.top + t.h + 4 && top + l.h + 4 > t.top) {
              top = t.top - l.h - 4;
              again = true;
            }
          });
        }
        top = Math.max(4, top);
        taken.push({ left, top, w: l.w, h: l.h });
        l.node.style.transform = 'translate(' + Math.round(l.x) + 'px,' + Math.round(l.y) + 'px)';
        l.stem.style.height = Math.max(0, Math.round(l.y - top - l.h)) + 'px';
        l.pill.style.transform = 'translate(' + Math.round(left - l.x) + 'px,' + Math.round(top - l.y) + 'px)';
      });
    }

    const hint = document.createElement('div');
    hint.className = 's3d-hint';
    el.appendChild(hint);
    const paintHint = () => {
      hint.textContent = step === 3 ? 'Тяни мышью, чтобы повернуть. Ручку можно крутить, кнопку нажимать.' : 'Тяни мышью, чтобы повернуть. Ручку можно крутить.';
    };
    const dropHint = () => hint.remove();

    /* --- Кадр по запросу --- */
    let raf = 0;
    let dirty = false;
    let dead = false;
    let onScreen = true;
    let ringTimer = 0;
    const drops = [];
    let tween = null;

    function invalidate() {
      dirty = true;
      if (!raf && !dead && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function draw() {
      renderer.render(scene, camera);
      placeLabels();
    }

    function frame(now) {
      raf = 0;
      dirty = false;
      let busy = false;

      if (tween) {
        const t = Math.min(1, (now - (tween.start || (tween.start = now))) / tween.ms);
        const e = smooth(t);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
        const dir = tween.fromDir.clone().lerp(tween.toDir, e).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, THREE.MathUtils.lerp(tween.fromDist, tween.toDist, e));
        if (t >= 1) tween = null;
        else busy = true;
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        const t = (now - (d.start || (d.start = now + d.delay))) / 440;
        d.group.position.y = t < 0 ? FALL : t >= 1 ? 0 : FALL * fall(t);
        if (t >= 1) drops.splice(i, 1);
        renderer.shadowMap.needsUpdate = true;
        busy = true;
      }

      if (tone != null) tickTone(now);

      controls.update();
      draw();
      if (busy) invalidate();
      else if (tone != null && !NS.reducedMotion()) {
        clearTimeout(ringTimer);
        ringTimer = setTimeout(invalidate, 45); // 20 кадров в секунду хватает кольцам, слабому компьютеру легче
      }
    }

    controls.addEventListener('change', invalidate);
    controls.addEventListener('start', () => {
      userMoved = true;
      tween = null;
      dropHint();
    });

    /* --- Камера --- */
    let view = 'iso';
    let userMoved = false;
    const corners = [];
    MAT.x.forEach((x) => MAT.y.forEach((y) => corners.push(V(x, 0, y))));
    BUILD.x.forEach((x) => BUILD.y.forEach((y) => corners.push(V(x, BUILD.h, y))));
    const boxMid = V(midX, 8, midY);

    // Точное вписывание рамки: для каждого угла считаем нужное расстояние, потом центрируем.
    function fitView(name) {
      const dir = new THREE.Vector3().fromArray(VIEWS[name]).normalize();
      const right = new THREE.Vector3().crossVectors(V(0, 1, 0), dir);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const tanH = tanV * camera.aspect;
      const pts = corners.map((p) => {
        const q = p.clone().sub(boxMid);
        return { x: q.dot(right), y: q.dot(up), z: q.dot(dir) };
      });
      let ox = 0;
      let oy = 0;
      let dist = 0;
      for (let i = 0; i < 6; i++) {
        dist = 0;
        pts.forEach((p) => {
          dist = Math.max(dist, p.z + Math.abs(p.x - ox) / tanH, p.z + Math.abs(p.y - oy) / tanV);
        });
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        pts.forEach((p) => {
          const k = dist / (dist - p.z);
          x0 = Math.min(x0, (p.x - ox) * k);
          x1 = Math.max(x1, (p.x - ox) * k);
          y0 = Math.min(y0, (p.y - oy) * k);
          y1 = Math.max(y1, (p.y - oy) * k);
        });
        ox += (x0 + x1) / 2;
        oy += (y0 + y1) / 2;
      }
      const target = boxMid.clone().addScaledVector(right, ox).addScaledVector(up, oy);
      return { dir, target, dist: dist * 1.05 };
    }

    function jumpTo(name) {
      const f = fitView(name);
      controls.target.copy(f.target);
      camera.position.copy(f.target).addScaledVector(f.dir, f.dist);
      controls.update();
    }

    function setCamera(name) {
      if (!VIEWS[name]) return;
      view = name;
      userMoved = false;
      if (NS.reducedMotion()) {
        tween = null;
        jumpTo(name);
        invalidate();
        return;
      }
      const f = fitView(name);
      const from = camera.position.clone().sub(controls.target);
      tween = {
        start: 0, ms: 520,
        fromTarget: controls.target.clone(), toTarget: f.target,
        fromDir: from.clone().normalize(), toDir: f.dir,
        fromDist: from.length(), toDist: f.dist,
      };
      invalidate();
    }

    let size = { w: 0, h: 0 };
    function resize() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h || (w === size.w && h === size.h)) return;
      size = { w, h };
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!userMoved) {
        tween = null;
        jumpTo(view);
      }
      labels.forEach((l) => (l.w = 0));
      if (onScreen && !document.hidden) draw(); // setSize стирает буфер: кадр нужен сразу
      else dirty = true;
    }

    /* --- Шаги, сборка, подсветка --- */
    let step = -1;
    let upto = null;
    let lit = null;
    const itemVisible = (it, i) => (upto == null ? it.step <= step : i <= upto);

    function syncItems(animate) {
      const fresh = [];
      C.ITEMS.forEach((it, i) => {
        const g = items.get(it.id);
        const show = itemVisible(it, i);
        if (show && !g.visible) fresh.push(g);
        if (!show) g.position.y = 0;
        g.visible = show;
      });
      drops.length = 0;
      items.forEach((g) => (g.position.y = 0));
      if (animate && !NS.reducedMotion()) {
        fresh.forEach((group, i) => {
          group.position.y = FALL;
          drops.push({ group, delay: i * 42, start: 0 });
        });
      }
      syncTone();
      syncLed();
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    }

    function setStep(n) {
      if (n === step && upto == null) return;
      const first = step < 0;
      step = n;
      upto = null;
      paintHint();
      syncItems(!first);
    }

    function setUpto(i) {
      upto = i;
      syncItems(true);
    }

    const dimmed = new Map();
    function dimOf(m) {
      if (!dimmed.has(m)) {
        const d = m.clone();
        d.color.multiplyScalar(0.34);
        d.emissive.setRGB(0.62, 0.66, 0.65);
        d.emissiveIntensity = 1;
        d.emissiveMap = null;
        d.envMapIntensity = m.envMapIntensity * 0.4;
        dimmed.set(m, d);
      }
      return dimmed.get(m);
    }
    function setDim(obj, on) {
      obj.traverse((n) => {
        if (!n.isMesh || n.userData.noDim) return;
        if (!n.userData.mat) n.userData.mat = n.material;
        const m = n.userData.mat;
        n.material = !on ? m : Array.isArray(m) ? m.map(dimOf) : dimOf(m);
      });
    }

    function highlight(id) {
      const next = items.has(id) ? id : null;
      if (next === lit) return;
      lit = next;
      items.forEach((g, key) => setDim(g, lit != null && key !== lit));
      base.forEach((g) => setDim(g, lit != null));
      invalidate();
    }

    /* --- Живое состояние --- */
    let pot = -1;
    let led = -1;
    let tone = null;
    let pressed = false;

    function setKnob(value) {
      knob.rotation.y = -(((value / 1023) * 270 - 135) * Math.PI) / 180;
    }

    function syncLed() {
      const k = items.get('rgb').visible ? Math.max(0, led) / 255 : 0;
      const g = Math.pow(k, 0.6); // глаз различает слабый свет лучше, чем даёт линейная шкала
      ledDome.material.emissiveIntensity = 3.6 * Math.pow(k, 0.8);
      ledDome.material.opacity = 0.74 + 0.25 * g;
      ledCore.material.emissiveIntensity = 6 * g;
      ledGlow.visible = k > 0;
      ledGlow.material.opacity = 0.38 * g;
      const span = 22 + 10 * g;
      ledGlow.scale.set(span, span, 1);
      ledLight.intensity = 0.65 * g; // свет умножается на цвет деталей: отверстия и полоски остаются видны
      // Белое на светлом не видно, поэтому сцена притухает, как у камеры с автоэкспозицией.
      renderer.toneMappingExposure = EXPOSURE * (1 - 0.38 * g);
      scene.background.copy(stage).multiplyScalar(1 - 0.2 * g);
    }

    function syncTone() {
      const on = tone != null && items.get('buz').visible;
      rings.forEach((r, i) => {
        r.visible = on;
        if (on) {
          r.material.color.set(tokens('--out'));
          if (NS.reducedMotion()) {
            const p = (i + 0.6) / rings.length;
            const R = 7 + p * 14;
            r.scale.set(R, 1, R);
            r.material.opacity = (1 - p) * 0.8;
          }
        }
      });
      if (!on) membrane.position.y = buzzAt.y - 1.5;
    }

    function tickTone(now) {
      if (!rings[0].visible || NS.reducedMotion()) return;
      const period = 1150 - ((tone - 200) / 1800) * 760;
      rings.forEach((r, i) => {
        const p = (now / period + i / rings.length) % 1;
        const R = 6.4 + p * 15;
        r.scale.set(R, 1, R);
        r.material.opacity = (1 - p) * (1 - p) * 0.95;
      });
      membrane.position.y = buzzAt.y - 1.5 + Math.sin(now * 0.075) * 0.32;
    }

    let seenStep = NS.state.step;
    let seenUpto = NS.state.upto;
    function onState(s, d) {
      if (s.step !== seenStep) {
        seenStep = s.step;
        setStep(s.step);
      }
      if (s.upto !== seenUpto) {
        seenUpto = s.upto;
        setUpto(s.upto);
      }
      let changed = false;
      if (d.pot !== pot) {
        pot = d.pot;
        setKnob(pot);
        changed = true;
      }
      if (d.led !== led) {
        led = d.led;
        syncLed();
        changed = true;
      }
      if (d.tone !== tone) {
        tone = d.tone;
        syncTone();
        changed = true;
      }
      if (d.pressed !== pressed) {
        pressed = d.pressed;
        cap.position.y += pressed ? -1.25 : 1.25;
        renderer.shadowMap.needsUpdate = true;
        changed = true;
      }
      if (changed) invalidate();
    }

    /* --- Мышь и палец: ручка, кнопка, камера --- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const flat = new THREE.Plane(V(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    let drag = null;

    function aim(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }

    function pick(e) {
      aim(e);
      if (items.get('pot').visible && raycaster.intersectObject(knob, true).length) return 'knob';
      if (items.get('btn').visible && raycaster.intersectObject(cap, true).length) return 'button';
      return null;
    }

    // Угол ручки под курсором, по часовой от «вверх». Если смотрим почти сбоку, плоскость ручки
    // вырождается в линию, и крутим просто движением мыши вправо-влево.
    function knobAngle(e) {
      aim(e);
      const ray = raycaster.ray;
      if (Math.abs(ray.direction.y) < 0.28) return e.clientX * 0.012;
      flat.constant = -knobTop;
      if (!ray.intersectPlane(flat, hitPoint)) return drag.last;
      return Math.atan2(hitPoint.x - knobAt.x, knobAt.z - hitPoint.z);
    }

    function onDown(e) {
      if (e.button !== 0) return;
      const what = pick(e);
      controls.enableZoom = true;
      if (!what) return;
      e.preventDefault();
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      dropHint();
      if (what === 'button') {
        drag = { what, id: e.pointerId };
        NS.press(true);
        return;
      }
      drag = { what, id: e.pointerId, value: NS.state.pot, last: 0 };
      drag.last = knobAngle(e);
      canvas.style.cursor = 'grabbing';
    }

    function onMove(e) {
      if (!drag) {
        if (e.pointerType === 'mouse' && !e.buttons) {
          const what = pick(e);
          canvas.style.cursor = what === 'knob' ? 'grab' : what === 'button' ? 'pointer' : '';
        }
        return;
      }
      if (e.pointerId !== drag.id || drag.what !== 'knob') return;
      const a = knobAngle(e);
      let delta = a - drag.last;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      drag.last = a;
      drag.value = NS.clamp(drag.value + (delta * 1023) / (Math.PI * 1.5), 0, 1023);
      NS.set({ pot: Math.round(drag.value) });
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.what === 'button') NS.press(false);
      drag = null;
      controls.enabled = true;
      canvas.style.cursor = '';
    }

    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const onLeave = () => {
      if (!isFull()) controls.enableZoom = false;
    };
    const isFull = () => {
      const p = el.closest('.panel');
      return Boolean(p) && (p.classList.contains('is-max') || document.fullscreenElement === p);
    };
    canvas.addEventListener('pointerleave', onLeave);
    const onFull = (e) => {
      if (e.target.contains(el)) controls.enableZoom = e.detail.full;
    };
    document.addEventListener('lab:fullchange', onFull);

    canvas.addEventListener('keydown', (e) => {
      const spin = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      const zoom = { '+': 0.9, '=': 0.9, '-': 1.1 }[e.key];
      if (!spin && !zoom) return;
      e.preventDefault();
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (spin) {
        s.theta += spin[0] * 0.14;
        s.phi = NS.clamp(s.phi + spin[1] * 0.1, 0.01, controls.maxPolarAngle);
      } else {
        s.radius = NS.clamp(s.radius * zoom, controls.minDistance, controls.maxDistance);
      }
      camera.position.setFromSpherical(s).add(controls.target);
      userMoved = true;
      tween = null;
      dropHint();
      invalidate();
    });

    canvas.addEventListener('webglcontextlost', () => {
      if (!dead) showFailure();
    });

    /* --- Видимость и размер --- */
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen && dirty) invalidate();
    });
    io.observe(el);
    const onVisibility = () => {
      if (!document.hidden && dirty) invalidate();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Шрифты подгружаются позже первого рисунка: перерисуем шелкографию и подписи.
    if (document.fonts) {
      const faces = ['600 40px "JetBrains Mono"', '500 40px "JetBrains Mono"', '700 40px Unbounded', '600 16px "Golos Text"'];
      Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)))
        .then(() => document.fonts.ready)
        .then(() => {
          if (dead) return;
          painters.forEach((p) => p());
          labels.forEach((l) => (l.w = 0));
          invalidate();
        });
    }

    setStep(typeof opts === 'object' && opts && opts.step != null ? opts.step : NS.state.step);
    const off = NS.on(onState);
    resize();
    invalidate();

    return {
      renderer, scene, camera, controls,
      setStep, setUpto, highlight, setCamera, resize,
      setLabels(on) {
        labelsOn = Boolean(on);
        labelBox.hidden = !labelsOn;
        if (!labelsOn) labels.forEach((l) => (l.node.hidden = true));
        invalidate();
      },
      destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(ringTimer);
        off();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('lab:fullchange', onFull);
        controls.dispose();
        const mats = new Set(dimmed.values());
        scene.traverse((n) => {
          if (n.geometry) n.geometry.dispose();
          [].concat(n.userData.mat || n.material || []).forEach((m) => mats.add(m));
        });
        mats.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        envTarget.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        el.remove();
      },
    };
  }

  NS.createScene3D = createScene3D;
})(typeof window !== 'undefined' ? window : globalThis);
