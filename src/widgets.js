/* widgets.js — две шкалы и график. Используются во вступлении, в объяснении и в заданиях. */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});
  const { mapInt, esc } = NS;
  let uid = 0;

  /* Две линейки друг под другом. Верхняя — вход, нижняя — выход, их связывает одна доля пути.
     opts: inMin, inMax, outMin, outMax, value, inName, outName, unit, interactive (по умолчанию true),
     showValues (true), showPercent (true), onInput(x, y, fraction).
     Возвращает { set(x), setRange({inMin,…}), value(), output(), fraction(), el }. */
  function createRulers(host, opts) {
    const o = Object.assign(
      { inMin: 0, inMax: 1023, outMin: 0, outMax: 255, value: 512, inName: 'Вход', outName: 'Выход', unit: '',
        interactive: true, showValues: true, showPercent: true, onInput: null },
      opts
    );
    const id = 'ruler-' + ++uid;
    const el = document.createElement('div');
    el.className = 'rulers';
    el.innerHTML =
      '<div class="ruler ruler--in">' +
        '<div class="ruler__head"><label class="ruler__name" for="' + id + '">' + esc(o.inName) + '</label>' +
        (o.showValues ? '<output class="ruler__value" data-x></output>' : '') + '</div>' +
        '<input class="range" id="' + id + '" type="range" step="1"' + (o.interactive ? '' : ' disabled') + '>' +
        '<div class="ruler__scale"><div class="ruler__ticks" data-in-ticks></div></div>' +
      '</div>' +
      '<div class="rulers__link"><i data-link></i>' + (o.showPercent ? '<span data-pct></span>' : '') + '</div>' +
      '<div class="ruler ruler--out">' +
        '<div class="ruler__scale"><div class="ruler__ticks" data-out-ticks></div><div class="ruler__pin" data-pin></div></div>' +
        '<div class="ruler__head"><span class="ruler__name">' + esc(o.outName) + '</span>' +
        (o.showValues ? '<output class="ruler__value" data-y></output>' : '') + '</div>' +
      '</div>';
    host.appendChild(el);

    const q = (s) => el.querySelector(s);
    const input = q('input');
    const fractionOf = (x) => (o.inMax === o.inMin ? 0 : (x - o.inMin) / (o.inMax - o.inMin));

    function ticks(box, values) {
      let html = '';
      for (let i = 0; i <= 20; i++) {
        const major = i % 5 === 0;
        html += '<i' + (major ? ' class="major"' : '') + ' style="left:' + i * 5 + '%"></i>';
      }
      values.forEach((v, i) => {
        const cls = i === 0 ? ' class="first"' : i === values.length - 1 ? ' class="last"' : '';
        html += '<span' + cls + ' style="left:' + i * 25 + '%">' + v + '</span>';
      });
      box.innerHTML = html;
    }

    // Подписи нижней шкалы — точные результаты map() для подписей верхней.
    function drawScale() {
      const inValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(o.inMin + f * (o.inMax - o.inMin)));
      ticks(q('[data-in-ticks]'), inValues);
      ticks(q('[data-out-ticks]'), inValues.map((v) => mapInt(v, o.inMin, o.inMax, o.outMin, o.outMax)));
      input.min = Math.min(o.inMin, o.inMax);
      input.max = Math.max(o.inMin, o.inMax);
      input.style.direction = o.inMin > o.inMax ? 'rtl' : 'ltr';
    }

    function paint(fire) {
      const x = o.value;
      const y = mapInt(x, o.inMin, o.inMax, o.outMin, o.outMax);
      const f = fractionOf(x);
      const pct = (f * 100).toFixed(1) + '%';
      input.value = x;
      input.style.setProperty('--fill', pct);
      if (o.showValues) {
        q('[data-x]').textContent = x;
        q('[data-y]').textContent = y + (o.unit ? ' ' + o.unit : '');
      }
      q('[data-link]').style.left = pct;
      q('[data-pin]').style.left = pct;
      if (o.showPercent) {
        const p = q('[data-pct]');
        p.textContent = Math.round(f * 100) + '% пути';
        p.style.left = Math.min(92, Math.max(8, f * 100)) + '%';
      }
      if (fire && o.onInput) o.onInput(x, y, f);
    }

    input.addEventListener('input', () => {
      o.value = Number(input.value);
      paint(true);
    });

    drawScale();
    paint(false);

    return {
      el,
      input,
      set(x, fire) {
        o.value = x;
        paint(Boolean(fire));
      },
      setRange(r) {
        Object.assign(o, r);
        drawScale();
        o.value = Math.min(Math.max(o.inMin, o.inMax), Math.max(Math.min(o.inMin, o.inMax), o.value));
        paint(false);
      },
      value: () => o.value,
      output: () => mapInt(o.value, o.inMin, o.inMax, o.outMin, o.outMax),
      fraction: () => fractionOf(o.value),
    };
  }

  /* График линейной зависимости. Шкалы подписаны реальными значениями диапазонов.
     opts: inMin, inMax, outMin, outMax, x, width, height, labelX, labelY, showPoint (true).
     Возвращает { set(x), setRange(r), el }. Цвета только из токенов (.graph в base.css). */
  function createGraph(host, opts) {
    const o = Object.assign(
      { inMin: 0, inMax: 1023, outMin: 0, outMax: 255, x: 512, width: 360, height: 240,
        labelX: 'вход', labelY: 'выход', showPoint: true },
      opts
    );
    const pad = { l: 46, r: 14, t: 14, b: 34 };
    const NSURI = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NSURI, 'svg');
    svg.setAttribute('class', 'graph');
    svg.setAttribute('viewBox', '0 0 ' + o.width + ' ' + o.height);
    svg.setAttribute('role', 'img');
    host.appendChild(svg);

    const w = o.width - pad.l - pad.r;
    const h = o.height - pad.t - pad.b;

    function scales() {
      const loX = Math.min(o.inMin, o.inMax);
      const hiX = Math.max(o.inMin, o.inMax);
      const loY = Math.min(o.outMin, o.outMax, 0);
      const hiY = Math.max(o.outMin, o.outMax);
      return {
        loX, hiX, loY, hiY,
        sx: (v) => pad.l + ((v - loX) / (hiX - loX || 1)) * w,
        sy: (v) => pad.t + h - ((v - loY) / (hiY - loY || 1)) * h,
      };
    }

    function draw() {
      const s = scales();
      const yAt = (v) => mapInt(v, o.inMin, o.inMax, o.outMin, o.outMax);
      const x0 = s.sx(s.loX), x1 = s.sx(s.hiX);
      let html = '';
      [0.25, 0.5, 0.75, 1].forEach((f) => {
        const gy = pad.t + h - f * h;
        const gx = pad.l + f * w;
        html += '<line class="graph__grid" x1="' + pad.l + '" x2="' + (pad.l + w) + '" y1="' + gy + '" y2="' + gy + '"/>';
        html += '<line class="graph__grid" x1="' + gx + '" x2="' + gx + '" y1="' + pad.t + '" y2="' + (pad.t + h) + '"/>';
      });
      html += '<path class="graph__axis" d="M' + pad.l + ' ' + pad.t + 'V' + (pad.t + h) + 'H' + (pad.l + w) + '"/>';
      html += '<path class="graph__line" d="M' + x0 + ' ' + s.sy(yAt(s.loX)) + 'L' + x1 + ' ' + s.sy(yAt(s.hiX)) + '"/>';
      html += '<text x="' + pad.l + '" y="' + (pad.t + h + 16) + '" text-anchor="middle">' + s.loX + '</text>';
      html += '<text x="' + (pad.l + w) + '" y="' + (pad.t + h + 16) + '" text-anchor="end">' + s.hiX + '</text>';
      html += '<text x="' + (pad.l + w / 2) + '" y="' + (pad.t + h + 30) + '" text-anchor="middle">' + esc(o.labelX) + '</text>';
      html += '<text x="' + (pad.l - 6) + '" y="' + (pad.t + h + 4) + '" text-anchor="end">' + s.loY + '</text>';
      html += '<text x="' + (pad.l - 6) + '" y="' + (pad.t + 10) + '" text-anchor="end">' + s.hiY + '</text>';
      html += '<text transform="translate(12 ' + (pad.t + h / 2) + ') rotate(-90)" text-anchor="middle">' + esc(o.labelY) + '</text>';
      if (o.showPoint) {
        const v = Math.min(s.hiX, Math.max(s.loX, o.x));
        const px = s.sx(v), py = s.sy(yAt(v));
        html += '<path class="graph__guide" d="M' + px + ' ' + (pad.t + h) + 'V' + py + 'H' + pad.l + '"/>';
        html += '<circle class="graph__dot" cx="' + px + '" cy="' + py + '" r="6"/>';
      }
      svg.innerHTML = html;
      svg.setAttribute('aria-label', 'График map: от ' + o.inMin + ' до ' + o.inMax + ' в ' + o.outMin + ' до ' + o.outMax);
    }

    draw();
    return {
      el: svg,
      set(x) { o.x = x; draw(); },
      setRange(r) { Object.assign(o, r); draw(); },
    };
  }

  Object.assign(NS, { createRulers, createGraph });
})(typeof window !== 'undefined' ? window : globalThis);
