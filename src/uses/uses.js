/* uses.js — раздел #uses: шесть живых мини-примеров и идеи проектов.
   Все числа на подписях и в строках кода считаются только через MapLab.mapInt. */
(function () {
  'use strict';
  const { mapInt, reducedMotion } = window.MapLab;

  const WIDTH = 320;
  const HEIGHT = 192;
  const share = (v, lo, hi) => mapInt(v, lo, hi, 0, 100) / 100;

  /* Строка map() в цветах раздела: диапазон датчика бирюзовый, диапазон устройства и результат медные. */
  const colorLine = (line) =>
    line.replace(
      /^int (\w+) = map\((.+), (-?\d+), (-?\d+), (-?\d+), (-?\d+)\);$/,
      '<span class="t-com">int</span> <span class="use-c-out">$1</span> = map(<span class="use-c-in">$2, $3, $4</span>, <span class="use-c-out">$5, $6</span>);'
    );

  /* Лента писков парктроника: 3 секунды в 292 единицах картинки. */
  const BEEP_MS = 80;
  const TAPE_MS = 3000;
  const TAPE_X = 14;
  const PX_PER_MS = 292 / TAPE_MS;
  const BEEP_W = (BEEP_MS * PX_PER_MS).toFixed(1);

  const servoTicks = [0, 30, 60, 90, 120, 150, 180]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const at = (r) => (160 - r * Math.cos(a)).toFixed(1) + ' ' + (150 - r * Math.sin(a)).toFixed(1);
      return 'M' + at(96) + 'L' + at(102);
    })
    .join('');

  const WALL_BRICKS = 'M0 74H34M0 90H34M0 106H34M0 122H34M0 138H34M12 58V74M24 74V90M12 90V106M24 106V122M12 122V138M24 138V150';

  const CARDS = [
    {
      id: 'servo',
      title: 'Сервопривод',
      src: 'потенциометр, 0–1023',
      inName: 'потенциометр',
      outName: 'угол',
      inVar: 'pot',
      outVar: 'angle',
      args: [0, 1023, 0, 180],
      start: 256,
      ends: ['0', '1023'],
      show: (y) => y + '°',
      story:
        'Сервопривод поворачивается на заданный угол от 0° до 180°. Так двигаются суставы робота-руки и шлагбаум на модели парковки.',
      fine:
        '<b>Упрощение:</b> здесь один сустав, у настоящей руки их несколько.',
      svg: `
        <path class="use-track" d="M70 150A90 90 0 0 1 250 150"/>
        <path class="use-trail use-tw" data-k="trail" pathLength="180" d="M70 150A90 90 0 0 1 250 150"/>
        <path class="use-line" d="${servoTicks}"/>
        <text x="53" y="154" text-anchor="end">0°</text>
        <text x="160" y="40" text-anchor="middle">90°</text>
        <text x="267" y="154">180°</text>
        <path class="use-line" d="M92 182H228"/>
        <path class="use-device" d="M112 148h12v-12a4 4 0 0 1 4-4h64a4 4 0 0 1 4 4v12h12v12h-12v22H124v-22h-12z"/>
        <g class="use-tw" data-k="arm" style="transform-origin:160px 150px">
          <path class="use-grip" d="M96 142L85 138L76 145M96 158L85 162L76 155"/>
          <rect class="use-f-out" x="93" y="138" width="11" height="24" rx="3"/>
          <path class="use-f-out" d="M160 141L102 145V155L160 159z"/>
        </g>
        <circle class="use-f-out" cx="160" cy="150" r="11"/>
        <circle class="use-f-2" cx="160" cy="150" r="4"/>`,
      scene(q) {
        const arm = q('arm');
        const trail = q('trail');
        return {
          paint(x, y) {
            arm.style.transform = 'rotate(' + y + 'deg)';
            trail.style.strokeDasharray = y + ' 180';
          },
        };
      },
    },
    {
      id: 'park',
      title: 'Парктроник',
      src: 'датчик расстояния, 5–100 см',
      inName: 'до стены',
      outName: 'пауза',
      inVar: 'cm',
      outVar: 'pause',
      args: [5, 100, 50, 1000],
      start: 40,
      inUnit: ' см',
      ends: ['5 см', '100 см'],
      show: (y) => y + ' мс',
      story:
        'Машина сдаёт назад, ультразвуковой датчик измеряет расстояние до стены. Чем ближе стена, тем короче пауза и тем чаще писк.',
      fine:
        '<b>Упрощение:</b> в настоящей машине датчиков несколько. Писк здесь только нарисован.',
      svg: `
        <path class="use-f-2" d="M0 58H34V150H0z"/>
        <path class="use-thin" d="${WALL_BRICKS}"/>
        <path class="use-line" d="M34 58V150M0 150H${WIDTH}"/>
        <rect class="use-f-in use-tw" data-k="gap" x="34" y="127" width="1" height="2" style="transform-origin:34px 0"/>
        <g class="use-tw" data-k="car"><g transform="translate(0 100)">
          <path class="use-device" d="M3 40Q0 40 0 36V26Q0 20 6 19L17 17 29 6Q32 3 36 3H60Q64 3 67 6L79 17 92 20Q100 22 100 30V36Q100 40 96 40Z"/>
          <path class="use-glass" d="M23 17L32 8H46V17ZM50 8H60L70 17H50Z"/>
          <circle class="use-body" cx="22" cy="40" r="10"/><circle class="use-body" cx="78" cy="40" r="10"/>
          <rect class="use-f-in" x="-2" y="24" width="4" height="8" rx="1"/>
          <path class="use-rings" data-k="rings" d="M38-4Q50-12 62-4M30-15Q50-30 70-15"/>
        </g></g>
        <rect class="use-f-2" x="14" y="157" width="292" height="14" rx="2"/>
        <path class="use-f-out" data-k="beeps"/>
        <rect class="use-f-in" data-k="head" x="14" y="154" width="2" height="20"/>
        <text x="14" y="187">полоска = писк, просвет = пауза</text>
        <text x="306" y="187" text-anchor="end">3 с</text>`,
      scene(q) {
        const car = q('car');
        const gap = q('gap');
        const beeps = q('beeps');
        const head = q('head');
        const rings = q('rings');
        let period = 1;
        let t = 0;
        return {
          paint(x, y) {
            const rear = mapInt(x, 5, 100, 44, 214);
            car.style.transform = 'translateX(' + rear + 'px)';
            gap.style.transform = 'scaleX(' + (rear - 34) + ')';
            period = BEEP_MS + y;
            let d = '';
            for (let at = 0; at + BEEP_MS <= TAPE_MS; at += period) {
              d += 'M' + (TAPE_X + at * PX_PER_MS).toFixed(1) + ' 157h' + BEEP_W + 'v14h-' + BEEP_W + 'z';
            }
            beeps.setAttribute('d', d);
          },
          frame(dt) {
            t = (t + dt) % TAPE_MS;
            rings.style.opacity = t % period < BEEP_MS ? 1 : 0.15;
            head.setAttribute('x', (TAPE_X + t * PX_PER_MS).toFixed(1));
          },
        };
      },
    },
    {
      id: 'screen',
      title: 'Автояркость экрана',
      src: 'фоторезистор, 0–1023',
      inName: 'свет',
      outName: 'яркость',
      inVar: 'light',
      outVar: 'bright',
      args: [0, 1023, 20, 255],
      start: 700,
      ends: ['0 темно', '1023 светло'],
      show: (y) => String(y),
      story:
        'На солнце экран ярче, в темноте тусклее. Шкала начинается с 20, иначе ночью экран погаснет совсем.',
      fine:
        '<b>Упрощение:</b> телефон считает яркость сложнее, здесь показана только идея.',
      svg: `
        <defs><radialGradient id="use-glow">
          <stop offset="0.45" style="stop-color:var(--out);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--out);stop-opacity:0"/>
        </radialGradient></defs>
        <rect class="use-dim" y="50" width="${WIDTH}" height="114"/>
        <rect class="use-f-sky use-tw" data-k="sky" y="50" width="${WIDTH}" height="114"/>
        <path class="use-stars use-tw" data-k="stars" d="M36 66h.01M72 88h.01M108 58h.01M138 92h.01M22 112h.01M160 66h.01"/>
        <g class="use-tw" data-k="sun">
          <path class="use-rays" d="M112 68V56M112 124V136M84 96H72M140 96H152M92 76L84 68M132 76L140 68M92 116L84 124M132 116L140 124"/>
          <circle class="use-f-in" cx="112" cy="96" r="20"/>
        </g>
        <rect class="use-f-2" y="164" width="${WIDTH}" height="40"/>
        <path class="use-line" d="M0 164H${WIDTH}"/>
        <ellipse class="use-tw" data-k="glow" fill="url(#use-glow)" cx="230" cy="118" rx="84" ry="90"/>
        <rect class="use-phone" x="196" y="54" width="68" height="128" rx="10"/>
        <rect class="use-screen" x="201" y="64" width="58" height="108" rx="3"/>
        <text class="use-ontime" x="230" y="90" text-anchor="middle">12:30</text>
        <path class="use-onlines" d="M209 104H251M209 114H243M209 124H251M209 134H235"/>
        <rect class="use-oncard" x="209" y="144" width="42" height="18" rx="3"/>
        <rect class="use-dim use-tw" data-k="dim" x="201" y="64" width="58" height="108" rx="3"/>
        <circle class="use-f-in" cx="230" cy="59" r="2.5"/>`,
      scene(q) {
        const sun = q('sun');
        const sky = q('sky');
        const stars = q('stars');
        const dim = q('dim');
        const glow = q('glow');
        return {
          paint(x, y) {
            sun.style.transform = 'translateY(' + mapInt(x, 0, 1023, 112, 0) + 'px)';
            sky.style.opacity = share(x, 0, 600); // день начинается, когда солнце над горизонтом
            stars.style.opacity = share(x, 400, 0); // за границами диапазона браузер обрежет до 0 и 1
            dim.style.opacity = share(y, 255, 0);
            glow.style.opacity = share(y, 0, 255);
          },
        };
      },
    },
    {
      id: 'soil',
      title: 'Влажность почвы',
      src: 'датчик влажности, 350–850',
      inName: 'датчик',
      outName: 'влажность',
      inVar: 'raw',
      outVar: 'water',
      args: [850, 350, 0, 100],
      start: 600,
      ends: ['350 мокро', '850 сухо'],
      show: (y) => y + '%',
      story:
        'Сухая почва даёт большое число, поэтому шкала перевёрнута: 850 значит 0%, а 350 значит 100%.',
      fine:
        '<b>Калибровка:</b> числа зависят от модели датчика. Измерь свой в сухой и в мокрой почве и подставь эти значения.',
      svg: `
        <g class="use-tw" data-k="plant" style="transform-origin:102px 112px">
          <path class="use-stem" d="M102 112V54"/>
          <g class="use-tw" data-k="leafR1" style="transform-origin:102px 90px"><path class="use-leaf" d="M102 90Q116 70 138 78Q124 96 102 90Z"/></g>
          <g class="use-tw" data-k="leafL1" style="transform-origin:102px 90px"><path class="use-leaf" d="M102 90Q88 70 66 78Q80 96 102 90Z"/></g>
          <g class="use-tw" data-k="leafR2" style="transform-origin:102px 70px"><path class="use-leaf" d="M102 70Q112 56 130 60Q118 76 102 70Z"/></g>
          <g class="use-tw" data-k="leafL2" style="transform-origin:102px 70px"><path class="use-leaf" d="M102 70Q92 56 74 60Q86 76 102 70Z"/></g>
          <circle class="use-leaf" cx="102" cy="50" r="7"/>
        </g>
        <path class="use-f-2" d="M56 112H172L162 180H66Z"/>
        <path class="use-f-wet use-tw" data-k="wet" d="M56 112H172L162 180H66Z"/>
        <g class="use-f-in" data-k="drops">
          <path class="use-tw" d="M82 132q5 7 0 10q-5-3 0-10z"/><path class="use-tw" d="M126 124q5 7 0 10q-5-3 0-10z"/>
          <path class="use-tw" d="M100 158q5 7 0 10q-5-3 0-10z"/><path class="use-tw" d="M136 150q5 7 0 10q-5-3 0-10z"/>
          <path class="use-tw" d="M72 118q5 7 0 10q-5-3 0-10z"/><path class="use-tw" d="M112 140q5 7 0 10q-5-3 0-10z"/>
          <path class="use-tw" d="M86 160q5 7 0 10q-5-3 0-10z"/><path class="use-tw" d="M124 160q5 7 0 10q-5-3 0-10z"/>
        </g>
        <path class="use-prongs" d="M146 88V156M154 88V156"/>
        <rect class="use-sensor" x="139" y="72" width="22" height="18" rx="2"/>
        <path class="use-pot" d="M48 106H180V114H172L162 182H66L56 114H48Z"/>
        <rect class="use-gauge" x="214" y="60" width="24" height="122" rx="3"/>
        <rect class="use-f-out use-tw" data-k="level" x="214" y="60" width="24" height="122" rx="3" style="transform-origin:0 182px"/>
        <text x="246" y="68">100%</text><text x="246" y="125">50%</text><text x="246" y="182">0%</text>`,
      scene(q) {
        const plant = q('plant');
        const wet = q('wet');
        const level = q('level');
        const leaves = [['leafR1', 1], ['leafL1', -1], ['leafR2', 1], ['leafL2', -1]].map(([k, side]) => [q(k), side]);
        const drops = [...q('drops').children];
        return {
          paint(x, y) {
            plant.style.transform = 'rotate(' + mapInt(y, 0, 100, -14, 0) + 'deg)';
            const droop = mapInt(y, 0, 100, 50, 0);
            leaves.forEach(([leaf, side]) => (leaf.style.transform = 'rotate(' + side * droop + 'deg)'));
            wet.style.opacity = mapInt(y, 0, 100, 0, 45) / 100;
            level.style.transform = 'scaleY(' + y / 100 + ')';
            const shown = mapInt(y, 0, 100, 0, drops.length);
            drops.forEach((d, i) => (d.style.opacity = i < shown ? 1 : 0));
          },
        };
      },
    },
    {
      id: 'stick',
      title: 'Джойстик робота',
      src: 'ось Y джойстика, 0–1023',
      inName: 'джойстик',
      outName: 'скорость',
      inVar: 'y',
      outVar: 'speed',
      args: [0, 1023, -255, 255],
      start: 800,
      ends: ['0 назад', '512 центр', '1023 вперёд'],
      show: (y) => String(y).replace('-', '−'),
      story:
        'Плюс значит вперёд, минус значит назад, около нуля робот стоит. Знак говорит мотору, куда крутиться, а в <code>analogWrite</code> идёт число без минуса.',
      fine:
        '<b>Настоящий джойстик</b> в покое даёт не ровно 512. Поэтому маленькую скорость считают нулём.',
      svg: `
        <path class="use-line" d="M122 176H${WIDTH}"/>
        <path class="use-road" data-k="road" d="M122 184H${WIDTH}"/>
        <rect class="use-sensor" x="26" y="150" width="76" height="26" rx="6"/>
        <g class="use-tw" data-k="stick" style="transform-origin:64px 150px">
          <path class="use-stick" d="M64 142V96"/>
          <circle class="use-f-in" cx="64" cy="88" r="13"/>
        </g>
        <path class="use-sensor" d="M44 150a20 12 0 0 1 40 0z"/>
        <path class="use-line" d="M198 106V92"/><circle class="use-f-out" cx="198" cy="89" r="4"/>
        <rect class="use-device" x="176" y="106" width="108" height="46" rx="10"/>
        <rect class="use-glass" x="258" y="116" width="18" height="14" rx="3"/>
        <g data-k="w1"><circle class="use-body" cx="202" cy="158" r="17"/><path class="use-line" d="M202 145V171M189 158H215"/></g>
        <g data-k="w2"><circle class="use-body" cx="258" cy="158" r="17"/><path class="use-line" d="M258 145V171M245 158H271"/></g>
        <path class="use-arrow" data-k="arrow"/>
        <text class="use-word" x="230" y="62" text-anchor="middle" data-k="word"></text>`,
      scene(q) {
        const stick = q('stick');
        const arrow = q('arrow');
        const word = q('word');
        const road = q('road');
        const wheels = [[q('w1'), 202], [q('w2'), 258]];
        let speed = 0;
        let turn = 0;
        return {
          paint(x, y) {
            speed = y;
            stick.style.transform = 'rotate(' + mapInt(x, 0, 1023, -30, 30) + 'deg)';
            const len = mapInt(Math.abs(y), 0, 255, 0, 84);
            const dir = Math.sign(y);
            arrow.setAttribute('d', len < 8 ? 'M218 74H242' : 'M230 74h' + dir * len + 'm' + -dir * 9 + ' -7l' + dir * 9 + ' 7l' + -dir * 9 + ' 7');
            word.textContent = y === 0 ? 'стоп' : Math.abs(y) < 25 ? 'почти стоп' : y > 0 ? 'вперёд' : 'назад';
          },
          frame(dt) {
            turn += speed * dt * 0.0036;
            wheels.forEach(([w, cx]) => w.setAttribute('transform', 'rotate(' + turn.toFixed(1) + ' ' + cx + ' 158)'));
            road.style.strokeDashoffset = (turn * 0.3).toFixed(1);
          },
        };
      },
    },
    {
      id: 'theremin',
      title: 'Терменвокс',
      src: 'датчик расстояния, 5–50 см',
      inName: 'до руки',
      outName: 'частота',
      inVar: 'cm',
      outVar: 'freq',
      args: [5, 50, 2000, 200],
      start: 14,
      inUnit: ' см',
      ends: ['5 см', '50 см'],
      show: (y) => y + ' Гц',
      story:
        'На этом инструменте играют, не касаясь его. Рука ближе, звук выше. Частоты те же <span class="use-nb">200–2000 Гц</span>, что в шаге 3 нашего проекта.',
      fine:
        '<b>Упрощение:</b> настоящий терменвокс чувствует руку антеннами, а мы берём датчик расстояния. Звук здесь только нарисован.',
      svg: `
        <defs><clipPath id="use-wave-clip"><rect x="14" y="146" width="292" height="36" rx="6"/></clipPath></defs>
        <text x="22" y="59">датчик</text>
        <rect class="use-sensor" x="22" y="66" width="10" height="68" rx="2"/>
        <rect class="use-f-in" x="32" y="71" width="12" height="23" rx="2"/>
        <rect class="use-f-in" x="32" y="103" width="12" height="23" rx="2"/>
        <rect class="use-f-in use-tw" data-k="gap" x="44" y="97" width="1" height="2" style="transform-origin:44px 0"/>
        <g class="use-tw" data-k="hand">
          <path class="use-finger" d="M5 84V64M13 84V56M21 84V58M29 84V66M31 104L42 90"/>
          <rect class="use-f-in" x="1" y="80" width="32" height="38" rx="12"/>
          <rect class="use-f-in" x="8" y="112" width="18" height="24"/>
        </g>
        <rect class="use-f-outsoft" x="14" y="146" width="292" height="36" rx="6"/>
        <g clip-path="url(#use-wave-clip)"><path class="use-wave" data-k="wave"/></g>`,
      scene(q) {
        const hand = q('hand');
        const gap = q('gap');
        const wave = q('wave');
        let length = 100;
        let shift = 0;
        return {
          paint(x, y) {
            const px = mapInt(x, 5, 50, 66, 268);
            hand.style.transform = 'translateX(' + px + 'px)';
            gap.style.transform = 'scaleX(' + (px - 44) + ')';
            length = 26000 / y; // длина волны на картинке: выше частота, плотнее волна
            const half = (length / 2).toFixed(1);
            const hump = 'q' + (length / 4).toFixed(1) + ' -24 ' + half + ' 0';
            wave.setAttribute('d', 'M14 164' + hump + ('t' + half + ' 0').repeat(Math.ceil(300 / (length / 2)) + 2));
          },
          frame(dt) {
            shift = (shift + dt * 0.05) % length;
            wave.setAttribute('transform', 'translate(' + (-shift).toFixed(1) + ' 0)');
          },
        };
      },
    },
  ];

  const IDEAS = [
    { name: 'Ночник', what: 'Фоторезистор и светодиод. Чем темнее в комнате, тем ярче свет.', code: 'int led = map(light, 0, 1023, 255, 0);' },
    { name: 'Метроном', what: 'Потенциометр и buzzer. Ручка задаёт темп в ударах в минуту, пауза между щелчками равна <code>60000 / bpm</code> мс.', code: 'int bpm = map(pot, 0, 1023, 40, 208);' },
    { name: 'Индикатор уровня', what: 'Потенциометр и ряд из 8 светодиодов. Число говорит, сколько зажечь. Восьмой загорится только на 1023.', code: 'int count = map(pot, 0, 1023, 0, 8);' },
    { name: 'Цветной термометр', what: 'Датчик температуры и RGB-светодиод. В холоде свет синий, в тепле красный: на синий канал идёт <code>255 - red</code>.', code: 'int red = map(tempC, 15, 35, 0, 255);' },
    { name: 'Указатель света', what: 'Два фоторезистора, <code>l</code> слева и <code>r</code> справа, и сервопривод. Стрелка поворачивается туда, где светлее.', code: 'int angle = map(r - l, -500, 500, 0, 180);' },
    { name: 'Игра на реакцию', what: 'Кнопка, светодиод и <code>millis()</code>. Чем быстрее нажал после вспышки, тем больше очков.', code: 'int score = map(ms, 150, 1000, 100, 0);' },
  ];

  /* Анимация идёт только у карточек на экране. Скрытая вкладка останавливает её сама: rAF там не вызывается. */
  const scenes = new Map();
  const running = new Set();
  let raf = 0;
  let last = 0;

  function tick(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    running.forEach((s) => s.frame(dt));
    raf = running.size && !reducedMotion() ? requestAnimationFrame(tick) : 0;
  }

  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const s = scenes.get(e.target);
      if (e.isIntersecting) running.add(s);
      else running.delete(s);
    });
    if (running.size && !raf && !reducedMotion()) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  });

  function addCard(c, host) {
    const min = Math.min(c.args[0], c.args[1]);
    const max = Math.max(c.args[0], c.args[1]);
    const line = 'int ' + c.outVar + ' = map(' + c.inVar + ', ' + c.args.join(', ') + ');';
    const el = document.createElement('article');
    el.className = 'use-card';
    el.id = 'use-' + c.id;
    el.innerHTML = `
      <header class="use-card__head">
        <h3>${c.title}</h3>
        <p class="use-src"><b>Откуда число:</b> ${c.src}</p>
      </header>
      <div class="use-scene"><svg class="use-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${c.svg}
        <text x="14" y="20">${c.inName}</text>
        <text class="use-num use-num--in" x="14" y="42" data-k="x"></text>
        <text x="306" y="20" text-anchor="end">${c.outName}</text>
        <text class="use-num use-num--out" x="306" y="42" text-anchor="end" data-k="y"></text>
      </svg></div>
      <div class="use-ctl">
        <input class="range" id="use-${c.id}-range" type="range" min="${min}" max="${max}" step="1" value="${c.start}" aria-label="${c.title}: ${c.inName}">
        <div class="use-ends">${c.ends.map((t) => '<span>' + t + '</span>').join('')}</div>
      </div>
      <pre class="code use-code">${colorLine(line)}
<span class="t-com">// ${c.inVar} = <b class="use-c-in" data-k="lx"></b>, ${c.outVar} = <b class="use-c-out" data-k="ly"></b></span></pre>
      <p class="use-story">${c.story}</p>
      <p class="use-fine">${c.fine}</p>`;
    host.appendChild(el);

    const q = (k) => el.querySelector('[data-k="' + k + '"]');
    const input = el.querySelector('input');
    const labelX = q('x');
    const labelY = q('y');
    const liveX = q('lx');
    const liveY = q('ly');
    const scene = c.scene(q);

    function paint() {
      const x = Number(input.value);
      const y = mapInt(x, ...c.args);
      const shown = c.show(y);
      input.style.setProperty('--fill', ((x - min) / (max - min)) * 100 + '%');
      input.setAttribute('aria-valuetext', x + (c.inUnit || '') + ', ' + c.outName + ' ' + shown);
      labelX.textContent = x + (c.inUnit || '');
      labelY.textContent = shown;
      liveX.textContent = x;
      liveY.textContent = y;
      scene.paint(x, y);
    }
    input.addEventListener('input', paint);
    paint();

    if (scene.frame) {
      scenes.set(el, scene);
      watcher.observe(el);
    }
  }

  const cardsHost = document.getElementById('use-cards');
  CARDS.forEach((c) => addCard(c, cardsHost));

  document.getElementById('use-ideas').innerHTML = IDEAS.map(
    (i) => `<li class="use-idea"><b>${i.name}</b><span>${i.what}</span><code class="code use-idea__code">${colorLine(i.code)}</code></li>`
  ).join('');
})();
