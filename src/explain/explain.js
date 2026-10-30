/* explain.js — герой, #why и #how. Каждый показанный результат map() получен из MapLab.mapInt.
   Потенциометр один на весь урок: герой, #why и подводные камни читают и пишут MapLab.state.pot.
   У лаборатории свои пять чисел. */
(function () {
  'use strict';
  const M = window.MapLab;
  const { mapInt, pwmBits, clamp, highlight, createRulers, createGraph } = M;
  const $ = (id) => document.getElementById(id);

  /* (2 × 20000)² ещё влезает в long, поэтому ответ лаборатории совпадает с настоящей платой. */
  const LIMIT = 20000;

  const fmt = (n) => String(n).replace('-', '−');
  const paren = (n) => (n < 0 ? '(' + fmt(n) + ')' : fmt(n));
  const eq = (s) => '<code class="ex-eq">' + s + '</code>';

  /* Точная запись дроби num/den: лишние цифры отрезаются, а не округляются, многоточие значит «дальше ещё есть». */
  function dec(num, den, digits) {
    const a = Math.abs(num);
    const b = Math.abs(den);
    const scaled = (a % b) * 10 ** digits;
    const exact = scaled % b === 0;
    let frac = String(Math.floor(scaled / b)).padStart(digits, '0');
    if (exact) frac = frac.replace(/0+$/, '');
    const sign = num !== 0 && num < 0 !== den < 0 ? '−' : '';
    return sign + Math.floor(a / b) + (frac ? ',' + frac : '') + (exact ? '' : '…');
  }

  const callHTML = (x, a, b, c, d, y) =>
    'map(<b class="is-in">' + x + '</b>, <span class="is-in">' + a + '</span>, <span class="is-in">' + b +
    '</span>, <span class="is-out">' + c + '</span>, <span class="is-out">' + d + '</span>) ' +
    (y === null ? '= нет результата' : '= <b class="is-out">' + y + '</b>');

  /* --- Светодиод: корпус нарисован физическими цветами, яркость живёт в --glow. --- */
  let ledId = 0;

  function createLed(host, scope) {
    const id = 'ex-led-' + ++ledId;
    const dome = 'M46 172V88a54 54 0 0 1 108 0v84z';
    host.insertAdjacentHTML('beforeend',
      '<svg class="ex-led" viewBox="0 0 200 336" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="' + id + '-leg" x1="0" x2="1"><stop offset="0" stop-color="#6f7c82"/><stop offset=".5" stop-color="#e3e9ea"/><stop offset="1" stop-color="#6f7c82"/></linearGradient>' +
      '<linearGradient id="' + id + '-body" x1="0" x2="1"><stop offset="0" stop-color="#dbe7e7" stop-opacity=".42"/><stop offset=".42" stop-color="#ffffff" stop-opacity=".14"/><stop offset="1" stop-color="#dbe7e7" stop-opacity=".34"/></linearGradient>' +
      '<radialGradient id="' + id + '-lit" cx=".5" cy=".62" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#fff" stop-opacity=".94"/><stop offset="1" stop-color="#fff" stop-opacity=".62"/></radialGradient>' +
      '<radialGradient id="' + id + '-bloom"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      [[64, 306], [88, 332], [108, 306], [130, 292]].map(([x, end]) =>
        '<rect x="' + x + '" y="186" width="7" height="' + (end - 186) + '" rx="1.5" fill="url(#' + id + '-leg)"/>').join('') +
      '<path d="M67 188v-52h30l6 12v40M133 188v-40h-22v40" fill="none" stroke="#8f9ca1" stroke-width="5"/>' +
      '<path d="M78 124h44l-7 20H85z" fill="#a5b1b5"/>' +
      '<rect x="94" y="122" width="12" height="6" rx="1" fill="#f7f7f2"/>' +
      '<path d="' + dome + '" fill="url(#' + id + '-body)" stroke="#dbe7e7" stroke-opacity=".55" stroke-width="2"/>' +
      '<rect x="36" y="172" width="128" height="16" rx="5" fill="url(#' + id + '-body)" stroke="#dbe7e7" stroke-opacity=".55" stroke-width="2"/>' +
      '<path class="ex-led__lit" d="' + dome + '" fill="url(#' + id + '-lit)"/>' +
      '<rect class="ex-led__lit" x="36" y="172" width="128" height="16" rx="5" fill="url(#' + id + '-lit)"/>' +
      '<circle class="ex-led__lit" cx="100" cy="112" r="150" fill="url(#' + id + '-bloom)"/>' +
      '<path d="M64 96c0-25 12-41 32-46" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linecap="round"/>' +
      '</svg>');
    /* Глаз воспринимает яркость нелинейно: половина мощности выглядит ярче половины, поэтому корень. */
    return (value) => (scope || host).style.setProperty('--glow', Math.sqrt(value / 255).toFixed(3));
  }

  document.querySelectorAll('[data-ex-code]').forEach((el) => (el.innerHTML = highlight(el.textContent)));

  /* --- Герой --- */
  const heroLed = createLed($('ex-hero-led'), $('hero'));
  const heroRulers = createRulers($('ex-hero-rulers'), {
    inName: 'Потенциометр: двигай ползунок',
    outName: 'Яркость RGB-светодиода',
    value: M.state.pot,
    onInput: (x) => M.set({ pot: x }),
  });

  function paintHero(pot) {
    const y = mapInt(pot, 0, 1023, 0, 255);
    heroRulers.set(pot);
    heroRulers.el.style.setProperty('--ex-fill', (pot / 1023) * 100 + '%');
    heroLed(y);
    $('ex-hero-call').innerHTML = callHTML(pot, 0, 1023, 0, 255, y);
  }

  /* Вступление идёт мимо MapLab.state: это только картинка, другие виды оно не трогает. */
  let introRaf = 0;
  const stopIntro = () => {
    cancelAnimationFrame(introRaf);
    introRaf = 0;
  };

  function playIntro() {
    if (M.reducedMotion()) return;
    const to = M.state.pot;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const k = Math.min(1, (now - start) / 1500);
      paintHero(Math.round(to * (1 - (1 - k) ** 3)));
      introRaf = k < 1 ? requestAnimationFrame(tick) : 0;
    };
    paintHero(0);
    introRaf = requestAnimationFrame(tick);
  }

  heroRulers.input.addEventListener('pointerdown', () => {
    if (!introRaf) return;
    stopIntro();
    M.set({ pot: heroRulers.value() });
  });

  /* --- #why: два светодиода, график, биты --- */
  const ledRaw = createLed($('ex-why-led-raw'));
  const ledMap = createLed($('ex-why-led-map'));

  function bindPot(id) {
    const input = $(id);
    const output = $(id + '-value');
    input.addEventListener('input', () => M.set({ pot: Number(input.value) }));
    return (pot) => {
      input.value = pot;
      input.style.setProperty('--fill', (pot / 1023) * 100 + '%');
      output.textContent = pot;
    };
  }
  const paintWhyPot = bindPot('ex-why-pot');
  const paintPitPot = bindPot('ex-pit-pot');

  /* График рисуется из настоящих вычислений для каждого из 1024 положений. */
  const chart = (function () {
    const W = 420, H = 262, L = 40, R = 10, T = 30, B = 36;
    const sx = (v) => L + (v / 1023) * (W - L - R);
    const sy = (v) => H - B - (v / 255) * (H - T - B);
    const path = (fn) => {
      let d = '';
      for (let x = 0; x <= 1023; x++) d += (x ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(fn(x)).toFixed(1);
      return d;
    };
    let html = '';
    [64, 128, 192, 255].forEach((v) => {
      html += '<line class="graph__grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/>';
    });
    [256, 512, 768].forEach((v) => {
      html += '<line class="graph__grid" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    });
    html += '<path class="graph__axis" d="M' + L + ' ' + T + 'V' + (H - B) + 'H' + (W - R) + '"/>';
    html += '<path class="ex-chart__raw" d="' + path(pwmBits) + '"/>';
    html += '<path class="ex-chart__map" d="' + path((x) => mapInt(x, 0, 1023, 0, 255)) + '"/>';
    [0, 1, 2, 3].forEach((k) => {
      const a = sx(k * 256) + 2;
      const b = sx(k * 256 + 255) - 2;
      html += '<path class="ex-chart__tooth" d="M' + a + ' ' + (T - 3) + 'V' + (T - 8) + 'H' + b + 'V' + (T - 3) + '"/>';
      html += '<text class="ex-chart__num" x="' + (a + b) / 2 + '" y="' + (T - 12) + '" text-anchor="middle">' + (k + 1) + '</text>';
    });
    [[0, 'start'], [256, 'middle'], [512, 'middle'], [768, 'middle'], [1023, 'end']].forEach(([v, anchor]) => {
      html += '<text x="' + sx(v) + '" y="' + (H - B + 15) + '" text-anchor="' + anchor + '">' + v + '</text>';
    });
    [0, 128, 255].forEach((v) => {
      html += '<text x="' + (L - 5) + '" y="' + (sy(v) + 4) + '" text-anchor="end">' + v + '</text>';
    });
    html += '<text x="' + (L + W - R) / 2 + '" y="' + (H - 4) + '" text-anchor="middle">положение ручки pot</text>';
    html += '<text transform="translate(9 ' + (T + H - B) / 2 + ') rotate(-90)" text-anchor="middle">яркость</text>';
    html += '<path class="graph__guide" data-guide/><circle class="ex-chart__dot-raw" r="5" data-raw/><circle class="graph__dot" r="5" data-map/>';

    const host = $('ex-why-chart');
    host.innerHTML =
      '<svg class="graph ex-chart__svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График яркости. Без map яркость четыре раза проходит от 0 до 255, с map идёт ровной линией от 0 до 255.">' + html + '</svg>';
    const svg = host.firstChild;
    const guide = svg.querySelector('[data-guide]');
    const dotRaw = svg.querySelector('[data-raw]');
    const dotMap = svg.querySelector('[data-map]');

    const scrub = (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      M.set({ pot: clamp(Math.round(((px - L) / (W - L - R)) * 1023), 0, 1023) });
    };
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      scrub(e);
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.buttons) scrub(e);
    });

    return (pot, raw, mapped) => {
      const x = sx(pot);
      guide.setAttribute('d', 'M' + x + ' ' + T + 'V' + (H - B));
      dotRaw.setAttribute('cx', x);
      dotRaw.setAttribute('cy', sy(raw));
      dotMap.setAttribute('cx', x);
      dotMap.setAttribute('cy', sy(mapped));
    };
  })();

  const bitCells = (function () {
    const host = $('ex-bits');
    host.innerHTML =
      '<span class="ex-bits__tag ex-bits__tag--lost">теряются</span><span class="ex-bits__tag ex-bits__tag--kept">попадают в регистр</span>' +
      [512, 256, 128, 64, 32, 16, 8, 4, 2, 1].map((place, i) =>
        '<span class="ex-bit' + (i < 2 ? ' ex-bit--lost' : '') + '"><b></b><small>' + place + '</small></span>').join('');
    return [...host.querySelectorAll('.ex-bit')];
  })();

  function paintWhy(pot, mapped) {
    const raw = pwmBits(pot);
    paintWhyPot(pot);
    ledRaw(raw);
    ledMap(mapped);
    chart(pot, raw, mapped);
    $('ex-why-raw').textContent = raw;
    $('ex-why-raw-sent').textContent = pot;
    $('ex-why-raw-got').textContent = raw;
    $('ex-why-map').textContent = mapped;
    $('ex-why-map-sent').textContent = mapped;
    $('ex-why-map-got').textContent = mapped;

    const laps = Math.floor(pot / 256);
    const lapWord = laps === 1 ? 'полный круг' : 'полных круга';
    $('ex-why-laps').textContent = laps === 0
      ? 'Сейчас ползунок на ' + pot + '. Это меньше одного круга, поэтому число доходит как есть: ' + raw + '.'
      : 'Сейчас ползунок на ' + pot + '. Это ' + laps + ' ' + lapWord + ' по 256 и ещё ' + raw + '. Светодиод получает только остаток: ' + raw + '.';

    const bits = pot.toString(2).padStart(10, '0');
    bitCells.forEach((cell, i) => {
      cell.firstChild.textContent = bits[i];
      cell.classList.toggle('is-one', bits[i] === '1');
    });
    $('ex-bits').setAttribute('aria-label', 'Число ' + pot + ' в двоичной записи: ' + bits);
    $('ex-bits-eq').textContent = pot + ' & 255 = ' + raw;
    $('ex-bits-tooth').textContent = 'Два потерянных бита могут быть 00, 01, 10 или 11. Это четыре сочетания и четыре зубца пилы. Сейчас сочетание ' + bits.slice(0, 2) + ', значит, идёт зубец ' + (laps + 1) + '.';
  }

  /* --- #how, блок 1: тест на 40 вопросов --- */
  const testRulers = createRulers($('ex-test-rulers'), {
    inMin: 0, inMax: 40, outMin: 0, outMax: 100, value: 30,
    inName: 'Верные ответы из 40', outName: 'Баллы из 100',
    onInput: paintTest,
  });

  function paintTest() {
    $('ex-test-call').innerHTML = callHTML(testRulers.value(), 0, 40, 0, 100, testRulers.output());
  }
  paintTest();

  /* --- #how, блоки 3 и 4: лаборатория и разбор вручную --- */
  const lab = { x: 512, inMin: 0, inMax: 1023, outMin: 0, outMax: 255 };

  const SETS = [
    { name: 'Яркость 0–255', r: [0, 1023, 0, 255], out: 'Яркость' },
    { name: 'Частота 200–2000', r: [0, 1023, 200, 2000], out: 'Частота', unit: 'Гц' },
    { name: 'Серво 0–180', r: [0, 1023, 0, 180], out: 'Угол серво в градусах' },
    { name: 'Проценты 0–100', r: [0, 1023, 0, 100], out: 'Проценты', unit: '%' },
    { name: 'Наоборот 255–0', r: [0, 1023, 255, 0], out: 'Яркость наоборот' },
  ];
  const EDGES = [
    { name: 'Значение за шкалой', x: 1200, r: [0, 1023, 0, 255] },
    { name: 'Отрицательные числа', r: [0, 1023, -255, 255] },
    { name: 'Вход наоборот', r: [1023, 0, 0, 255] },
    { name: 'Шкала без длины', x: 100, r: [100, 100, 0, 255] },
  ];
  const sameRange = (r) => r[0] === lab.inMin && r[1] === lab.inMax && r[2] === lab.outMin && r[3] === lab.outMax;

  const labRulers = createRulers($('ex-lab-rulers'), {
    inName: 'Значение', outName: 'Яркость', value: lab.x,
    onInput: (x) => {
      lab.x = x;
      paintLab(false);
    },
  });
  const labOutName = labRulers.el.querySelector('.ruler--out .ruler__name');

  /* createRulers не ждёт значения за шкалой: метка и связь ушли бы за край блока. */
  function pinToEdge() {
    const edge = clamp(labRulers.fraction(), 0, 1) * 100 + '%';
    labRulers.el.querySelector('[data-link]').style.left = edge;
    labRulers.el.querySelector('[data-pin]').style.left = edge;
  }

  const handGraph = createGraph($('ex-hand-graph'), { labelX: 'значение', labelY: 'результат', width: 400, height: 250 });

  const FIELDS = [
    ['x', 'ex-lab-x'], ['inMin', 'ex-lab-in-min'], ['inMax', 'ex-lab-in-max'], ['outMin', 'ex-lab-out-min'], ['outMax', 'ex-lab-out-max'],
  ];

  function fillFields() {
    FIELDS.forEach(([key, id]) => {
      if ($(id) !== document.activeElement) $(id).value = lab[key];
    });
  }

  const pastOutScale = (y) => y < Math.min(lab.outMin, lab.outMax) || y > Math.max(lab.outMin, lab.outMax);

  function labNotes(y) {
    const { x, inMin, inMax, outMin, outMax } = lab;
    const lo = Math.min(inMin, inMax);
    const hi = Math.max(inMin, inMax);
    const outScale = fmt(Math.min(outMin, outMax)) + '…' + fmt(Math.max(outMin, outMax));
    const notes = [];
    if (x < lo || x > hi) {
      let note = 'Значение ' + fmt(x) + ' лежит за шкалой ' + fmt(lo) + '…' + fmt(hi) + '.';
      if (pastOutScale(y)) {
        note += ' map() не останавливается на краю, поэтому результат ' + fmt(y) + ' вышел за шкалу ' + outScale + '. Ограничить его поможет функция <code>constrain()</code>.';
      } else if (outMin !== outMax) {
        note += ' map() не останавливается на краю, но значение вышло совсем немного, и результат ' + fmt(y) + ' пока остался на шкале ' + outScale + '.';
      }
      notes.push(note);
    }
    if (outMin === outMax) notes.push('Новая шкала без длины: начало и конец совпали, поэтому результат всегда равен ' + fmt(outMin) + '.');
    if (inMin > inMax && outMin > outMax) notes.push('Перевёрнуты обе шкалы, поэтому они снова идут в одну сторону.');
    else if (inMin > inMax) notes.push('Шкала входа перевёрнута: она начинается с большего числа. Чем меньше значение, тем дальше ты прошёл.');
    else if (outMin > outMax) notes.push('Шкала выхода перевёрнута: чем больше значение, тем меньше результат.');
    if (Math.min(inMin, inMax, outMin, outMax) < 0) notes.push('Отрицательные числа работают как обычные: шкала просто заходит ниже нуля.');
    if (!notes.length) notes.push('Доля пути на обеих шкалах одна и та же: примерно ' + Math.round(labRulers.fraction() * 100) + '%.');
    return notes;
  }

  /* Разбор идёт ровно в порядке процессора: умножение, целое деление, сложение.
     q берётся из ответа mapInt, поэтому разбор не может разойтись с map(). */
  function handSteps(y) {
    const { x, inMin, inMax, outMin, outMax } = lab;
    const dx = x - inMin;
    const dIn = inMax - inMin;
    const dOut = outMax - outMin;
    const prod = dx * dOut;
    const q = y - outMin;
    const firstDiv = Math.trunc(dx / dIn);
    const wrongOrder = firstDiv * dOut + outMin;
    const hasFrac = prod % dIn !== 0;
    const row = (title, body) => '<li><h4>' + title + '</h4>' + body + '</li>';
    return (
      '<ol class="ex-calc">' +
      row('Сколько прошли от начала шкалы', eq(fmt(x) + ' − ' + paren(inMin) + ' = ' + fmt(dx))) +
      row('Какая это доля всей шкалы',
        '<p>Длина шкалы: ' + eq(fmt(inMax) + ' − ' + paren(inMin) + ' = ' + fmt(dIn)) + '</p>' +
        '<p>Доля: ' + eq(fmt(dx) + ' / ' + paren(dIn) + ' = ' + dec(dx, dIn, 4)) + ', примерно ' + Math.round((dx / dIn) * 100) + '%</p>') +
      row('Сколько это на новой шкале',
        '<p>Длина новой шкалы: ' + eq(fmt(outMax) + ' − ' + paren(outMin) + ' = ' + fmt(dOut)) + '</p>' +
        '<p>Плата считает целыми числами, поэтому сначала умножает, потом делит.</p>' +
        '<p>' + eq(fmt(dx) + ' × ' + paren(dOut) + ' = ' + fmt(prod)) + '</p>' +
        '<p>' + eq(fmt(prod) + ' / ' + paren(dIn) + ' = ' + dec(prod, dIn, 2)) + '</p>' +
        (hasFrac
          ? '<p>Дробь отбрасываем, округления нет: ' + eq(fmt(q)) + (prod / dIn < 0 ? '. Отрицательное число при этом становится ближе к нулю.' : '') + '</p>'
          : '<p>Дроби нет: ' + eq(fmt(q)) + '</p>')) +
      row('Прибавляем начало новой шкалы', eq(fmt(q) + ' + ' + paren(outMin) + ' = ' + fmt(y))) +
      '</ol>' +
      '<p class="ex-calc__end"><span>Ответ совпал с map():</span> <code class="ex-call ex-call--inline">' + callHTML(x, inMin, inMax, outMin, outMax, y) + '</code></p>' +
      (wrongOrder === y
        ? ''
        : '<p class="small">Попробуй поменять порядок. Целое деление ' + fmt(dx) + ' / ' + paren(dIn) + ' даст ' + fmt(firstDiv) +
          ', и ответ станет ' + fmt(firstDiv) + ' × ' + paren(dOut) + ' + ' + paren(outMin) + ' = ' + fmt(wrongOrder) + ' вместо ' + fmt(y) + '. Поэтому умножение идёт первым.</p>')
    );
  }

  function handAlgebra() {
    const { x, inMin, inMax, outMin, outMax } = lab;
    const dIn = inMax - inMin;
    const dOut = outMax - outMin;
    const bNum = outMin * dIn - dOut * inMin;
    const yNum = (x - inMin) * dOut + outMin * dIn;
    const k = dec(dOut, dIn, 4);
    const kFactor = k.startsWith('−') ? '(' + k + ')' : k;
    const b = dec(bNum, dIn, 2);
    const bTail = bNum === 0 ? '' : bNum / dIn < 0 ? ' − ' + b.replace('−', '') : ' + ' + b;
    const y = mapInt(x, inMin, inMax, outMin, outMax);
    const line = (s) => '<p>' + eq(s) + '</p>';
    return (
      (dOut === 0
        ? '<p>Новая шкала без длины, поэтому пропорции здесь нет: результат всегда равен ' + fmt(outMin) + '. Прямая ' + eq('y = kx + b') + ' идёт горизонтально:</p>'
        : '<p>Шаги 2 и 3 вместе дают пропорцию: одна и та же доля на двух шкалах.</p>' +
          line('(x − ' + paren(inMin) + ') / ' + paren(dIn) + ' = (y − ' + paren(outMin) + ') / ' + paren(dOut)) +
          '<p>Выразим y и получим ту же формулу, что внутри map():</p>' +
          line('y = (x − ' + paren(inMin) + ') · ' + paren(dOut) + ' / ' + paren(dIn) + ' + ' + paren(outMin)) +
          '<p>Раскроем скобки и получим уравнение прямой ' + eq('y = kx + b') + ':</p>') +
      line('k = ' + fmt(dOut) + ' / ' + paren(dIn) + ' = ' + k) +
      line('b = ' + paren(outMin) + ' − ' + kFactor + ' · ' + paren(inMin) + ' = ' + b) +
      line('y = ' + k + ' · x' + bTail) +
      '<p>Число <b>k</b> показывает, на сколько меняется результат, когда значение растёт на 1. Число <b>b</b> равно результату при значении 0.</p>' +
      (yNum % dIn === 0
        ? '<p>При x = ' + fmt(x) + ' прямая даёт ровно ' + fmt(y) + ', и map() выдаёт то же число.</p>'
        : '<p>Точная прямая при x = ' + fmt(x) + ' даёт ' + dec(yNum, dIn, 2) + ', а map() выдаёт целое ' + fmt(y) + '.</p>') +
      (x < Math.min(inMin, inMax) || x > Math.max(inMin, inMax) ? '<p class="small">Значение лежит за шкалой, поэтому точка на графике стоит на его краю.</p>' : '')
    );
  }

  function paintLab(rangeChanged) {
    const { x, inMin, inMax, outMin, outMax } = lab;
    const y = mapInt(x, inMin, inMax, outMin, outMax);
    const dead = y === null;
    const preset = SETS.find((s) => sameRange(s.r));

    $('ex-lab-call').innerHTML = callHTML(x, inMin, inMax, outMin, outMax, y);
    $('ex-lab-rulers').hidden = dead;
    $('ex-lab-dead').hidden = !dead;
    $('ex-lab-notes').hidden = dead;
    $('ex-hand-algebra').hidden = dead;
    if (dead) {
      $('ex-lab-dead-eq').textContent = 'откуда_от = откуда_до = ' + fmt(inMin);
      $('ex-hand-steps').innerHTML = '<p>Считать нечего: пришлось бы делить на длину шкалы, а она равна 0. Сделай концы шкалы в лаборатории разными.</p>';
    } else {
      if (rangeChanged) {
        labRulers.setRange({ inMin, inMax, outMin, outMax, unit: preset && preset.unit ? preset.unit : '' });
        labOutName.textContent = preset ? preset.out : 'Результат';
      }
      labRulers.set(x);
      pinToEdge();
      labRulers.el.classList.toggle('ex-outside', pastOutScale(y));
      $('ex-lab-notes').innerHTML = labNotes(y).map((n) => '<li>' + n + '</li>').join('');
      $('ex-hand-steps').innerHTML = handSteps(y);
      $('ex-hand-math').innerHTML = handAlgebra();
      handGraph.setRange({ inMin, inMax, outMin, outMax, x });
    }
    fillFields();
    document.querySelectorAll('#ex-lab .ex-sets button').forEach((b, i) => {
      const s = SETS.concat(EDGES)[i];
      b.setAttribute('aria-pressed', String(sameRange(s.r) && (s.x === undefined ? !EDGES.some((e) => e.x === x && sameRange(e.r)) : s.x === x)));
    });
  }

  function setLab(s) {
    const [inMin, inMax, outMin, outMax] = s.r;
    const x = s.x === undefined ? clamp(lab.x, Math.min(inMin, inMax), Math.max(inMin, inMax)) : s.x;
    Object.assign(lab, { x, inMin, inMax, outMin, outMax });
    hideHint();
    paintLab(true);
  }

  [[SETS, 'ex-lab-sets'], [EDGES, 'ex-lab-edges']].forEach(([list, host]) => {
    list.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = s.name;
      b.addEventListener('click', () => setLab(s));
      $(host).appendChild(b);
    });
  });

  function hideHint() {
    $('ex-lab-hint').hidden = true;
    FIELDS.forEach(([, id]) => $(id).removeAttribute('aria-invalid'));
  }

  FIELDS.forEach(([key, id]) => {
    const field = $(id);
    field.addEventListener('input', () => {
      const v = field.valueAsNumber;
      if (!Number.isInteger(v) || Math.abs(v) > LIMIT) {
        field.setAttribute('aria-invalid', 'true');
        $('ex-lab-hint').textContent = 'Впиши целое число от ' + fmt(-LIMIT) + ' до ' + LIMIT + '. map() работает только с целыми числами.';
        $('ex-lab-hint').hidden = false;
        return;
      }
      hideHint();
      lab[key] = v;
      paintLab(key !== 'x');
    });
    field.addEventListener('change', () => {
      hideHint();
      field.value = lab[key];
    });
  });

  paintLab(true);

  /* --- #how, блок 5: подводные камни --- */
  const zoneBars = [
    { host: 'ex-zones-short', inMax: 1023, outMax: 3 },
    { host: 'ex-zones-even', inMax: 1024, outMax: 4 },
  ].map((z) => {
    const counts = [];
    for (let x = 0; x <= 1023; x++) {
      const y = mapInt(x, 0, z.inMax, 0, z.outMax);
      counts[y] = (counts[y] || 0) + 1;
    }
    const host = $(z.host);
    host.innerHTML =
      '<p class="ex-zones__call"><code>map(pot, 0, ' + z.inMax + ', 0, ' + z.outMax + ')</code> = <b class="is-out" data-y></b></p>' +
      '<div class="ex-zones__bar">' + counts.map((n, y) =>
        '<span style="flex:' + n + ' 1 0"' + (n < 20 ? ' class="is-thin" title="Результат ' + y + ': ' + n + ' положение"' : '') + '>' +
        (n < 20 ? '' : '<b>' + y + '</b><small>' + n + '</small>') + '</span>').join('') + '</div>' +
      counts.map((n, y) => (n < 20 ? '<p class="ex-zones__tail">результат ' + y + ': ' + n + ' положение</p>' : '')).join('');
    return { z, y: host.querySelector('[data-y]'), cells: [...host.querySelectorAll('.ex-zones__bar span')] };
  });

  function paintPits(pot, d) {
    paintPitPot(pot);
    $('ex-pit-at').textContent = pot;

    const mapped = d.mapped;
    const prod = pot * 255;
    $('ex-pit-exact').textContent = dec(prod, 1023, 2);
    $('ex-pit-cut').textContent = mapped;

    zoneBars.forEach(({ z, y, cells }) => {
      const value = mapInt(pot, 0, z.inMax, 0, z.outMax);
      y.textContent = value;
      cells.forEach((c, i) => c.classList.toggle('is-on', i === value));
    });

    const raw = mapInt(pot, 200, 800, 0, 255);
    const safe = clamp(raw, 0, 255);
    const bits = pwmBits(raw);
    const wrong = bits !== safe;
    $('ex-edge-raw').textContent = fmt(raw);
    $('ex-edge-bits').textContent = bits;
    $('ex-edge-bits').className = wrong ? 'is-bad' : '';
    $('ex-edge-safe').textContent = safe;
    $('ex-edge-safe').className = wrong ? 'is-good' : '';

    const wrapped = (prod << 16) >> 16; // что осталось бы от произведения в 16-битном int
    const overflow = wrapped !== prod;
    $('ex-long-prod').textContent = prod;
    $('ex-long-ok').textContent = mapped;
    $('ex-long-wrap').textContent = fmt(wrapped);
    $('ex-long-bad').textContent = fmt(Math.trunc(wrapped / 1023));
    $('ex-long-wrap').className = $('ex-long-bad').className = overflow ? 'is-bad' : '';

    $('ex-volt-map').textContent = mapInt(pot, 0, 1023, 0, 5) + ' В';
    $('ex-volt-real').textContent = d.volts.toFixed(2).replace('.', ',') + ' В';
    $('ex-volt-milli').textContent = mapInt(pot, 0, 1023, 0, 5000) + ' мВ';
  }

  /* --- Один потенциометр на весь урок --- */
  let lastPot = null;
  M.on((s, d) => {
    if (s.pot === lastPot) return;
    lastPot = s.pot;
    stopIntro();
    paintHero(s.pot);
    paintWhy(s.pot, d.mapped);
    paintPits(s.pot, d);
  });

  playIntro();
})();
