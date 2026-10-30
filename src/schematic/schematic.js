/* schematic.js — 2D-схема в стиле Tinkercad: плата, макетка, детали и провода на SVG.
   Положение всего берётся из CIRCUIT, единицы viewBox — миллиметры.
   Плата и макетка рисуются один раз и общие для всех экземпляров, живое обновляется точечно. */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});
  const { CIRCUIT: C, clamp, esc, state, sim, set, on, press, reducedMotion } = NS;

  const n2 = (v) => Math.round(v * 100) / 100;
  const R = (x, y, w, h, a = '') => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${a}/>`;
  const O = (x, y, r, a = '') => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" ${a}/>`;
  const T = (x, y, s, a = '') => `<text x="${n2(x)}" y="${n2(y)}" ${a}>${esc(s)}</text>`;
  const sq = (p, s) => `M${n2(p.x - s / 2)} ${n2(p.y - s / 2)}h${s}v${s}h${-s}z`;
  const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const center = (points) => ({ x: avg(points.map((p) => p.x)), y: avg(points.map((p) => p.y)) });

  // Точка на окружности: 0° вверху, по часовой стрелке плюс.
  function polar(c, r, deg) {
    const a = (deg * Math.PI) / 180;
    return { x: c.x + r * Math.sin(a), y: c.y - r * Math.cos(a) };
  }
  function arcPath(c, r, from, to) {
    const p = polar(c, r, from);
    const q = polar(c, r, to);
    return `M${n2(p.x)} ${n2(p.y)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${n2(q.x)} ${n2(q.y)}`;
  }

  /* --- Градиенты: один общий набор на страницу. --- */
  function ensureDefs() {
    if (document.getElementById('sch-defs')) return;
    const stops = (list) =>
      list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
    const lin = (id, list, x2 = 0, y2 = 1) => `<linearGradient id="sch-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
    const rad = (id, list, fx = 0.5, fy = 0.5) => `<radialGradient id="sch-${id}" fx="${fx}" fy="${fy}">${stops(list)}</radialGradient>`;
    const box = document.createElement('div');
    box.innerHTML =
      '<svg id="sch-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      lin('pcb', [[0, '#11a3a9'], [0.55, '#0a939a'], [1, '#06828a']], 0.35, 1) +
      lin('steel', [[0, '#f4f6f7'], [0.3, '#cfd5da'], [0.55, '#f6f7f8'], [1, '#a9b2b9']]) +
      lin('steelh', [[0, '#a9b2b9'], [0.4, '#eef1f3'], [1, '#bcc4ca']], 1, 0) +
      lin('lead', [[0, '#8e979e'], [0.5, '#eceff1'], [1, '#8e979e']], 1, 0) +
      lin('black', [[0, '#3a3f45'], [0.5, '#1f2327'], [1, '#14171a']]) +
      lin('hdr', [[0, '#34383d'], [1, '#17191c']]) +
      lin('jack', [[0, '#2b2f34'], [0.45, '#3c4148'], [1, '#121417']]) +
      lin('chip', [[0, '#3b3f45'], [1, '#232629']]) +
      lin('bb', [[0, '#f1f0ea'], [1, '#e4e2da']]) +
      lin('groove', [[0, '#a9a89f'], [0.4, '#c8c7be'], [1, '#f4f3ee']]) +
      lin('cyl', [[0, '#000', 0.34], [0.32, '#fff', 0.3], [0.62, '#000', 0], [1, '#000', 0.36]], 1, 0) +
      lin('wiretip', [[0, '#eef1f3'], [1, '#9aa4ab']]) +
      rad('knob', [[0, '#4a4f56'], [0.7, '#26292e'], [1, '#0e1012']], 0.38, 0.3) +
      rad('cap', [[0, '#ffe680'], [0.65, '#f5c21c'], [1, '#c08c05']], 0.38, 0.32) +
      rad('buz', [[0, '#34383e'], [0.72, '#1c1f23'], [0.93, '#2c3036'], [1, '#0f1113']], 0.42, 0.36) +
      rad('dome', [[0, '#fff', 0.95], [0.5, '#eef4f8', 0.55], [1, '#cbd6dd', 0.72]], 0.36, 0.3) +
      rad('core', [[0, '#fff'], [0.68, '#fff'], [0.82, '#fff', 0.82], [1, '#fff', 0]]) +
      rad('glow', [[0, '#fff'], [0.34, '#fff'], [0.55, '#fffbe6', 0.95], [0.78, '#ffecb4', 0.5], [1, '#ffe59a', 0]]) +
      '</defs></svg>';
    document.body.appendChild(box.firstChild);
  }

  /* --- Arduino Uno. Контур как у настоящей платы: срез справа сверху и нос справа. --- */
  const UNO_OUTLINE =
    'M1 0H66.1L67.6 1.5V12.7L68.58 13.7V48.26L66.04 50.8V52.34A1 1 0 0 1 65.04 53.34H1A1 1 0 0 1 0 52.34V1A1 1 0 0 1 1 0Z';

  function headerGroups(table) {
    const groups = [];
    let prev = null;
    for (const [name, mil] of Object.entries(table)) {
      if (prev == null || mil - prev > 100) groups.push([]);
      groups[groups.length - 1].push(name);
      prev = mil;
    }
    return groups;
  }

  function headerArt(names) {
    const pts = names.map((n) => C.pos('uno:' + n));
    const a = pts[0];
    const b = pts[pts.length - 1];
    return (
      R(a.x - 1.27, a.y - 1.27, b.x - a.x + 2.54, 2.54, 'rx=".35" fill="url(#sch-hdr)"') +
      `<path fill="#060708" stroke="#5c636b" stroke-width=".14" d="${pts.map((p) => sq(p, 1.25)).join('')}"/>`
    );
  }

  function pinLabels(names, top) {
    return names
      .filter((n) => C.UNO_LABEL[n])
      .map((n) => {
        const p = C.pos('uno:' + n);
        const y = top ? p.y + 1.75 : p.y - 1.75;
        return `<text class="sch-pinlabel" transform="translate(${n2(p.x)} ${n2(y)}) rotate(-90)" dy=".36em" text-anchor="${top ? 'end' : 'start'}">${esc(C.UNO_LABEL[n])}</text>`;
      })
      .join('');
  }

  function pinBlock(x, y, cols, rows) {
    const p = C.PITCH;
    let pins = '';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pins += sq({ x: x + i * p, y: y + j * p }, 0.8);
    return R(x - 1.27, y - 1.27, cols * p, rows * p, 'rx=".3" fill="url(#sch-hdr)"') + `<path fill="#d6b65c" d="${pins}"/>`;
  }

  function unoArt() {
    const top = headerGroups(C.UNO_TOP);
    const bottom = headerGroups(C.UNO_BOTTOM);
    const allNames = [...top.flat(), ...bottom.flat()];
    const chip = { x: 29.6, y: 33, w: 35.6, h: 5.8, legX: 31 };
    let s = '';

    s += `<path d="${UNO_OUTLINE}" fill="#0b2a2e" fill-opacity=".09" transform="translate(.8 1.1)"/>`;
    s += `<path d="${UNO_OUTLINE}" fill="#0b2a2e" fill-opacity=".16" transform="translate(.35 .5)"/>`;
    s += `<path d="${UNO_OUTLINE}" fill="url(#sch-pcb)"/>`;

    // Дорожки под лаком: от гребёнок к ножкам чипа.
    let traces = '';
    allNames.forEach((name, i) => {
      if (!C.UNO_LABEL[name]) return;
      const p = C.pos('uno:' + name);
      const legX = chip.legX + (i % 14) * C.PITCH;
      traces += p.y < 20
        ? `M${n2(p.x)} 13.2V${n2(19 + (i % 5))}L${n2(legX)} 30.4V32.2`
        : `M${n2(p.x)} 42.4L${n2(legX)} 40.2`;
    });
    s += `<path d="${traces}" fill="none" stroke="#7ee0e2" stroke-opacity=".16" stroke-width=".32"/>`;

    // Крепёжные отверстия.
    [[13.97, 50.8], [15.24, 2.54], [66.04, 17.78], [66.04, 45.72]].forEach(([x, y]) => {
      s += O(x, y, 1.95, 'fill="#d9c47c"') + O(x, y, 1.5, 'fill="var(--stage)"');
    });

    // Кнопка reset.
    s += R(3.4, 2.5, 6, 6, 'rx=".5" fill="url(#sch-steelh)" stroke="#6f7a82" stroke-width=".14"');
    s += O(6.4, 5.5, 2.25, 'fill="#23262a"') + O(6.4, 5.5, 1.8, 'fill="#c62f2f"') + O(5.9, 5, 0.6, 'fill="#fff" fill-opacity=".35"');

    // USB.
    s += R(-5.3, 9.5, 16.4, 12.2, 'rx=".5" fill="url(#sch-steel)" stroke="#7d868d" stroke-width=".16"');
    s += '<path d="M-4.4 9.6V21.6M8.6 9.6V21.6" fill="none" stroke="#8a939a" stroke-width=".2"/>';
    s += R(0.6, 12, 5.4, 1.3, 'rx=".3" fill="#9aa4ab" fill-opacity=".55"') + R(0.6, 17.9, 5.4, 1.3, 'rx=".3" fill="#9aa4ab" fill-opacity=".55"');
    s += O(9.9, 11.6, 0.4, 'fill="#8a939a"') + O(9.9, 19.6, 0.4, 'fill="#8a939a"');

    // Гнездо питания.
    s += R(-2.5, 40.4, 14, 9.6, 'rx=".6" fill="url(#sch-jack)"');
    s += R(-2.5, 41, 1.5, 8.4, 'rx=".3" fill="#4a4f56"');
    s += '<path d="M1 42.2H10.4M1 48.2H10.4" stroke="#54595f" stroke-width=".22" fill="none"/>';

    // Конденсаторы.
    [[15.6, 44.9], [22.4, 44.9]].forEach(([x, y]) => {
      s += R(x - 3.1, y - 3.1, 6.2, 6.2, 'rx=".6" fill="#2b2e33"');
      s += O(x, y, 2.75, 'fill="url(#sch-steel)" stroke="#77818a" stroke-width=".14"');
      s += `<path d="${arcPath({ x, y }, 2.75, -60, 60)}Z" fill="#23262a"/>`;
    });

    // Стабилизатор.
    s += R(9.5, 33.2, 7.2, 3.8, 'rx=".2" fill="#2a2d31"') + R(16.7, 33.7, 1.6, 2.8, 'fill="#c8cfd4"');
    s += R(8.1, 33.5, 1.4, 0.8, 'fill="#c8cfd4"') + R(8.1, 34.7, 1.4, 0.8, 'fill="#c8cfd4"') + R(8.1, 35.9, 1.4, 0.8, 'fill="#c8cfd4"');

    // Малые детали и светодиоды.
    [[13.5, 24.4], [20.4, 31.4], [24, 31.4], [20.4, 37.4], [24, 37.4], [23.2, 11.6], [59.6, 21.8], [57, 27.6], [60.2, 27.6]].forEach(([x, y], i) => {
      s += R(x, y, 2, 1.1, `rx=".12" fill="${i % 3 === 1 ? '#2c2f33' : '#b89a72'}"`) + R(x, y, 0.42, 1.1, 'fill="#d9dee2"') + R(x + 1.58, y, 0.42, 1.1, 'fill="#d9dee2"');
    });
    [[27.4, 17.6, '#f3b23a', 'L'], [27.4, 20.4, '#f3b23a', 'TX'], [27.4, 23.2, '#f3b23a', 'RX'], [56.4, 18.4, '#46d07a', 'ON']].forEach(([x, y, color, label]) => {
      s += R(x, y - 0.6, 1.9, 1.2, `rx=".2" fill="${color}"`) + R(x + 0.3, y - 0.32, 1.3, 0.64, 'rx=".15" fill="#fff" fill-opacity=".45"');
      s += T(x + 2.5, y, label, 'class="sch-silk" dy=".36em"');
    });

    // Чип USB и второй разъём ICSP.
    s += R(14.4, 14.6, 5.2, 5.2, 'rx=".2" fill="url(#sch-chip)"') + pinBlock(16.2, 7.2, 2, 2);

    // Кварц.
    s += R(13.2, 26.2, 12, 4.6, 'rx="2.3" fill="url(#sch-steel)" stroke="#7d868d" stroke-width=".16"');
    s += R(14, 26.9, 10.4, 3.2, 'rx="1.6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".2"');

    // Чип DIP-28 в панельке.
    s += R(chip.x - 0.6, chip.y - 1.5, chip.w + 1.2, chip.h + 3, 'rx=".35" fill="#17191c"');
    let legs = '';
    for (let i = 0; i < 14; i++) {
      const x = chip.legX + i * C.PITCH;
      legs += `M${n2(x - 0.45)} ${chip.y - 1.05}h.9v1.05h-.9z` + `M${n2(x - 0.45)} ${chip.y + chip.h}h.9v1.05h-.9z`;
    }
    s += `<path d="${legs}" fill="#c5ccd2"/>`;
    s += R(chip.x, chip.y, chip.w, chip.h, 'rx=".3" fill="url(#sch-chip)"');
    s += `<path d="M${chip.x} ${n2(chip.y + chip.h / 2 - 1)}a1 1 0 0 1 0 2z" fill="#14161a"/>`;
    s += O(chip.x + 2.1, chip.y + chip.h - 1.1, 0.42, 'fill="#14161a"');
    s += T(chip.x + chip.w / 2, chip.y + chip.h / 2, 'ATMEGA328P', 'class="sch-chiptext" dy=".36em" text-anchor="middle"');

    // Главный ICSP.
    s += pinBlock(63.63, 24.13, 2, 3);

    // Гребёнки и шелкография.
    [...top, ...bottom].forEach((g) => (s += headerArt(g)));
    top.forEach((g) => (s += pinLabels(g, true)));
    bottom.forEach((g) => (s += pinLabels(g, false)));

    const xOf = (name) => C.pos('uno:' + name).x;
    s += `<path d="M${n2(xOf('D13'))} 13.4H${n2(xOf('D8') + 1.2)}M${n2(xOf('D7') - 1.2)} 13.4H${n2(xOf('D0'))}" fill="none" stroke="#fff" stroke-width=".22"/>`;
    s += T((xOf('D13') + xOf('D0')) / 2, 15.7, 'DIGITAL (PWM~)', 'class="sch-silk" text-anchor="middle"');
    s += T((xOf('IOREF') + xOf('VIN')) / 2, 42.4, 'POWER', 'class="sch-silk" text-anchor="middle"');
    s += T((xOf('A0') + xOf('A5')) / 2, 45.2, 'ANALOG IN', 'class="sch-silk" text-anchor="middle"');
    s += T(64.9, 22.2, 'ICSP', 'class="sch-silk" text-anchor="middle"');
    s += T(45.4, 27.6, 'UNO', 'class="sch-brand" text-anchor="middle"');

    // Зоны наведения на пины.
    allNames.filter((n) => C.UNO_LABEL[n]).forEach((n) => {
      const p = C.pos('uno:' + n);
      const y = p.y < 20 ? 1 : 41.6;
      s += R(p.x - 1.27, y, 2.54, 11, `class="sch-pin" data-pin="${n}" fill="transparent"`);
    });
    return s;
  }

  /* --- Макетная плата. --- */
  function bbArt() {
    const { x, y, w, h, cols } = C.BB;
    const rowY = (r) => C.rowY(C.ROW_UNITS[r]);
    const railY = (r) => C.rowY(C.RAIL_UNITS[r]);
    const RED = '#d6322a';
    const BLUE = '#2a62d6';
    let s = '';

    s += R(x + 0.8, y + 1.1, w, h, 'rx="1.4" fill="#0b2a2e" fill-opacity=".08"');
    s += R(x + 0.35, y + 0.5, w, h, 'rx="1.2" fill="#0b2a2e" fill-opacity=".14"');
    s += R(x, y, w, h, 'rx="1.2" fill="url(#sch-bb)" stroke="#cfcdc4" stroke-width=".18"');

    // Канавка посередине.
    const mid = (rowY('f') + rowY('e')) / 2;
    s += R(x, mid - 1.55, w, 3.1, 'fill="url(#sch-groove)"');
    s += `<path d="M${x} ${n2(mid - 1.55)}h${w}" stroke="#94938b" stroke-width=".16"/>`;
    s += `<path d="M${x} ${n2(mid + 1.55)}h${w}" stroke="#fff" stroke-width=".22"/>`;

    const body = s;
    s = '';

    // Линии реек и знаки + и −.
    const x0 = C.colX(1) - 1.1;
    const x1 = C.colX(cols) + 1.1;
    const lineOf = (rail) => (rail[1] === 'p' ? RED : BLUE);
    [['tn', 'tp'], ['bn', 'bp']].forEach((pair) => {
      const [a, b] = railY(pair[0]) < railY(pair[1]) ? pair : [pair[1], pair[0]];
      s += R(x0, railY(a) - 1.92, x1 - x0, 0.44, `rx=".2" fill="${lineOf(a)}"`);
      s += R(x0, railY(b) + 1.48, x1 - x0, 0.44, `rx=".2" fill="${lineOf(b)}"`);
      pair.forEach((rail) => {
        const plus = rail[1] === 'p';
        [C.colX(1), C.colX(cols) + C.PITCH].forEach((sx) => {
          s += T(sx, railY(rail), plus ? '+' : '−', `class="sch-sign" fill="${plus ? RED : BLUE}" dy=".35em" text-anchor="middle"`);
        });
      });
    });

    // Отверстия одним контуром: их 400, отдельные узлы ни к чему.
    const holes = [];
    for (let c = 1; c <= cols; c++) {
      C.ROWS_TOPDOWN.forEach((r) => holes.push(C.pos(r + c)));
      if (C.railHoleExists(c)) C.RAILS.forEach((r) => holes.push(C.pos(r + c)));
    }
    s += `<path d="${holes.map((p) => sq({ x: p.x + 0.12, y: p.y + 0.12 }, 1.02)).join('')}" fill="#fff"/>`;
    s += `<path d="${holes.map((p) => sq(p, 1.02)).join('')}" fill="#454b51"/>`;

    // Номера столбцов и буквы рядов.
    const numbers = [1];
    for (let c = 5; c <= cols; c += 5) numbers.push(c);
    // Провод идёт поверх строки с номерами: такой номер отодвигаем влево, иначе его не прочитать.
    const wired = new Set(C.WIRES.flatMap((w) => [w.from, w.to]));
    const number = (c, row, y) =>
      wired.has(row + c)
        ? T(C.colX(c) - 1.15, y, String(c), 'class="sch-bbtext" dy=".35em" text-anchor="end"')
        : T(C.colX(c), y, String(c), 'class="sch-bbtext" dy=".35em" text-anchor="middle"');
    numbers.forEach((c) => {
      s += number(c, 'j', rowY('j') - 2.75) + number(c, 'a', rowY('a') + 2.75);
    });
    C.ROWS_TOPDOWN.forEach((r) => {
      s += T(C.colX(1) - C.PITCH, rowY(r), r, 'class="sch-bbtext" dy=".35em" text-anchor="middle"');
      s += T(C.colX(cols) + C.PITCH, rowY(r), r, 'class="sch-bbtext" dy=".35em" text-anchor="middle"');
    });

    s += R(x, y, w, h, 'class="sch-bb-hit" fill="transparent"');
    return { body, marks: s };
  }

  // Свечение ложится между корпусом макетки и разметкой: свет не смывает отверстия и номера.
  function boardsArt() {
    const bb = bbArt();
    return {
      under: `<g class="sch-board">${unoArt()}</g><g class="sch-board">${bb.body}</g>`,
      over: `<g class="sch-board">${bb.marks}</g>`,
    };
  }

  let boards = null;

  /* --- Детали. Каждая функция возвращает графику и рамку для подсветки. --- */
  const contact = (p) => O(p.x, p.y, 0.62, 'fill="#dfe4e7" stroke="#79848c" stroke-width=".14"');

  function potArt(part) {
    const legs = Object.values(part.legs).map(C.pos);
    const out = C.pos(part.legs.out);
    const c = { x: out.x, y: out.y - 7.3 };
    const hw = 6.15;
    const body = c.y + hw;
    let s = '';
    legs.forEach((p) => {
      s += R(p.x - 0.5, Math.min(p.y, body) - 0.5, 1, Math.abs(p.y - body) + 0.5, 'fill="url(#sch-lead)"') + contact(p);
    });
    s += R(c.x - hw + 0.25, c.y - hw + 0.35, 2 * hw, 2 * hw, 'rx="1.1" fill="#0b2a2e" fill-opacity=".22"');
    s += R(c.x - hw, c.y - hw, 2 * hw, 2 * hw, 'rx="1" fill="url(#sch-black)"');
    s += `<path class="sch-track" pathLength="270" d="${arcPath(c, 5.45, -135, 135)}"/>`;
    s += `<path class="sch-track-on" pathLength="270" stroke-dasharray="135 270" d="${arcPath(c, 5.45, -135, 135)}"/>`;

    let knurl = '';
    for (let a = 0; a < 360; a += 9) {
      const p = polar(c, 3.95, a);
      const q = polar(c, 4.55, a);
      knurl += `M${n2(p.x)} ${n2(p.y)}L${n2(q.x)} ${n2(q.y)}`;
    }
    const mark = [polar(c, 1.1, 0), polar(c, 4.3, 0)];
    s += `<g class="sch-ctl sch-knob" data-cx="${n2(c.x)}" data-cy="${n2(c.y)}">`;
    s += O(c.x, c.y, 6.1, 'fill="transparent"');
    s += O(c.x, c.y, 6.05, 'class="sch-focus"');
    s += O(c.x, c.y, 4.65, 'fill="url(#sch-knob)" stroke="#0a0b0d" stroke-width=".2"');
    s += `<g class="sch-rotor"><path d="${knurl}" stroke="#6a7078" stroke-width=".2" fill="none"/>`;
    s += `<path d="M${n2(mark[0].x)} ${n2(mark[0].y)}L${n2(mark[1].x)} ${n2(mark[1].y)}" stroke="#fff" stroke-width=".85" stroke-linecap="round" fill="none"/></g>`;
    s += '</g>';
    return { art: s, box: { x: c.x - hw - 0.8, y: c.y - hw - 0.8, w: 2 * hw + 1.6, h: 2 * hw + out.y - body + 1.5 } };
  }

  const DOME_DROP = 2.6; // купол ниже ряда ножек: так он не закрывает резисторы и провод катода

  function rgbArt(part) {
    const names = ['r', 'k', 'g', 'b'];
    const legs = names.map((k) => C.pos(part.legs[k]));
    const c = center(legs);
    c.y += DOME_DROP;
    const LEG_COLOR = ['#d92d20', '#1d2630', '#16a34a', '#2563eb'];
    let s = '';
    legs.forEach((p, i) => {
      const bx = c.x + (i - 1.5) * 0.8;
      const by = c.y + (i === 1 ? 1.5 : 0.5);
      s += `<path class="sch-lead${i === 1 ? ' sch-lead--long' : ''}" d="M${n2(bx)} ${n2(by)}C${n2(bx)} ${n2(by - 1.8)} ${n2(p.x)} ${n2(p.y + 1.6)} ${n2(p.x)} ${n2(p.y)}"/>`;
    });
    legs.forEach((p) => (s += contact(p)));
    s += O(c.x, c.y, 2.85, 'fill="#dfe6ea" fill-opacity=".5" stroke="#7f8b93" stroke-width=".18"');
    s += O(c.x, c.y, 2.4, 'fill="url(#sch-dome)" stroke="#fff" stroke-opacity=".7" stroke-width=".12"');
    s += O(c.x, c.y, 3.5, 'class="sch-core" fill="url(#sch-core)" opacity="0"');
    legs.forEach((p, i) => {
      s += T(p.x, p.y - 2, names[i].toUpperCase(), `class="sch-legname" fill="${LEG_COLOR[i]}" dy=".35em" text-anchor="middle"`);
    });
    const xs = legs.map((p) => p.x);
    const top = Math.min(...legs.map((p) => p.y));
    const left = Math.min(...xs);
    return { art: s, box: { x: left - 1.2, y: top - 3.2, w: Math.max(...xs) - left + 2.4, h: Math.max(c.y, top) - top + 6.4 } };
  }

  function resArt(part) {
    const a = C.pos(part.legs.a);
    const b = C.pos(part.legs.b);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
    const L = clamp(len - 2.4, 2.6, 6.6);
    const y0 = (len - L) / 2;
    const y1 = y0 + L;
    const w = 1.04;
    const neck = 0.88;
    const body =
      `M${-w + 0.42} ${y0}H${w - 0.42}Q${w} ${y0} ${w} ${y0 + 0.5}V${y0 + 1}Q${w} ${y0 + 1.3} ${neck} ${y0 + 1.4}` +
      `V${y1 - 1.4}Q${w} ${y1 - 1.3} ${w} ${y1 - 1}V${y1 - 0.5}Q${w} ${y1} ${w - 0.42} ${y1}H${-w + 0.42}` +
      `Q${-w} ${y1} ${-w} ${y1 - 0.5}V${y1 - 1}Q${-w} ${y1 - 1.3} ${-neck} ${y1 - 1.4}V${y0 + 1.4}Q${-w} ${y0 + 1.3} ${-w} ${y0 + 1}V${y0 + 0.5}Q${-w} ${y0} ${-w + 0.42} ${y0}Z`;
    const bands = [[0.15, '#c7281f'], [0.34, '#c7281f'], [0.53, '#6b4226'], [0.8, '#c8a03a']];
    let s = R(-0.27, 0, 0.54, len, 'fill="url(#sch-lead)"');
    s += `<path d="${body}" fill="#e2c79c" stroke="#8a6c47" stroke-width=".14"/>`;
    bands.forEach(([f, color]) => (s += R(-1, y0 + L * f, 2, 0.66, `fill="${color}"`)));
    s += `<path d="${body}" fill="url(#sch-cyl)"/>`;
    return {
      art: contact(a) + contact(b) + `<g transform="translate(${n2(a.x)} ${n2(a.y)}) rotate(${n2(deg)})">${s}</g>`,
      box: { x: Math.min(a.x, b.x) - 1.2, y: Math.min(a.y, b.y) - 0.9, w: Math.abs(a.x - b.x) + 2.4, h: Math.abs(a.y - b.y) + 1.8 },
    };
  }

  function buzzerArt(part) {
    const p = C.pos(part.legs.plus);
    const m = C.pos(part.legs.minus);
    const c = center([p, m]);
    const r = 6;
    let s = O(c.x + 0.25, c.y + 0.35, r, 'fill="#0b2a2e" fill-opacity=".22"');
    s += O(c.x, c.y, r, 'fill="url(#sch-buz)" stroke="#0a0b0d" stroke-width=".16"');
    s += O(c.x, c.y, 4.5, 'fill="none" stroke="#fff" stroke-opacity=".09" stroke-width=".2"');
    s += O(c.x, c.y, 1.25, 'fill="#050506" stroke="#585e65" stroke-width=".22"');
    s += T(p.x, p.y + 0.9, '+', 'class="sch-buzplus" dy=".35em" text-anchor="middle"');
    s += '<g class="sch-waves" style="display:none">';
    for (let i = 0; i < 6; i++) s += '<path class="sch-wave"/>';
    s += '</g>';
    return { art: s, box: { x: c.x - r - 0.8, y: c.y - r - 0.8, w: 2 * r + 1.6, h: 2 * r + 1.6, rx: r + 0.8 }, c };
  }

  function buttonArt(part) {
    const legs = Object.values(part.legs).map(C.pos);
    const c = center(legs);
    const hw = 3;
    let s = '';
    legs.forEach((p) => {
      const edge = p.y < c.y ? c.y - hw : c.y + hw;
      s += R(p.x - 0.55, Math.min(p.y, edge) - 0.2, 1.1, Math.abs(p.y - edge) + 0.4, 'fill="url(#sch-lead)"') + contact(p);
    });
    s += R(c.x - hw + 0.2, c.y - hw + 0.3, 2 * hw, 2 * hw, 'rx=".7" fill="#0b2a2e" fill-opacity=".22"');
    s += R(c.x - hw, c.y - hw, 2 * hw, 2 * hw, 'rx=".6" fill="url(#sch-black)" stroke="#0a0b0d" stroke-width=".14"');
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => (s += O(c.x + dx * 2.2, c.y + dy * 2.2, 0.34, 'fill="#7b8289"')));
    s += `<g class="sch-ctl sch-btn">`;
    s += R(c.x - hw - 0.6, c.y - hw - 0.6, 2 * hw + 1.2, 2 * hw + 1.2, 'fill="transparent"');
    s += R(c.x - hw - 0.5, c.y - hw - 0.5, 2 * hw + 1, 2 * hw + 1, 'class="sch-focus" rx="1"');
    s += O(c.x + 0.15, c.y + 0.25, 2.05, 'class="sch-capshadow" fill="#000" fill-opacity=".45"');
    s += `<g class="sch-cap">${O(c.x, c.y, 1.95, 'fill="url(#sch-cap)" stroke="#9c7204" stroke-width=".14"')}</g>`;
    s += '</g>';
    return { art: s, box: { x: c.x - hw - 1.3, y: c.y - hw - 1.3, w: 2 * hw + 2.6, h: 2 * hw + 2.6 } };
  }

  const ART = { pot: potArt, rgb: rgbArt, res: resArt, buzzer: buzzerArt, button: buttonArt };

  /* --- Провода. --- */
  function roundedPath(pts, radius) {
    let d = `M${n2(pts[0].x)} ${n2(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const a = pts[i - 1];
      const b = pts[i + 1];
      const la = Math.hypot(a.x - p.x, a.y - p.y);
      const lb = Math.hypot(b.x - p.x, b.y - p.y);
      const k = Math.min(radius, la / 2, lb / 2);
      d += `L${n2(p.x + ((a.x - p.x) / la) * k)} ${n2(p.y + ((a.y - p.y) / la) * k)}`;
      d += `Q${n2(p.x)} ${n2(p.y)} ${n2(p.x + ((b.x - p.x) / lb) * k)} ${n2(p.y + ((b.y - p.y) / lb) * k)}`;
    }
    const z = pts[pts.length - 1];
    return d + `L${n2(z.x)} ${n2(z.y)}`;
  }

  function tipArt(p, q, end) {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    const e = { x: p.x + ((q.x - p.x) / l) * 1.9, y: p.y + ((q.y - p.y) / l) * 1.9 };
    const d = `M${n2(p.x)} ${n2(p.y)}L${n2(e.x)} ${n2(e.y)}`;
    return (
      `<path d="${d}" stroke="#7c868e" stroke-width="1.34" fill="none"/>` +
      `<path d="${d}" stroke="#d9dfe3" stroke-width=".92" fill="none"/>` +
      O(p.x, p.y, 0.56, `class="sch-end" data-end="${end}" fill="#5d666e"`)
    );
  }

  function wireArt(w) {
    const pts = C.wirePoints(w).filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
    if (pts.length === 1) pts.push({ x: pts[0].x, y: pts[0].y + 0.01 }); // оба конца в одном отверстии
    const d = roundedPath(pts, 2.4);
    const color = (C.WIRE_COLORS[w.color] || C.WIRE_COLORS.black).hex;
    const n = pts.length;
    const mid = n > 2 ? { x: (pts[1].x + pts[n - 2].x) / 2, y: pts[1].y } : center(pts);
    const art =
      `<path class="sch-halo" d="${d}"/>` +
      `<path class="sch-w-shadow" d="${d}" transform="translate(.24 .34)"/>` +
      `<path class="sch-w-out" d="${d}"/>` +
      `<path class="sch-w-core" d="${d}" stroke="${color}"/>` +
      `<path class="sch-w-shine" d="${d}"/>` +
      tipArt(pts[0], pts[1], 'from') +
      tipArt(pts[n - 1], pts[n - 2], 'to') +
      `<path class="sch-w-hit" d="${d}"/>`;
    return { art, badge: mid };
  }

  function badgeArt(p) {
    return (
      `<g class="sch-badge" transform="translate(${n2(p.x)} ${n2(p.y)})"><circle r="2.5"/>` +
      '<path class="sch-badge-ok" d="M-1.2 .1L-.3 1L1.3-.9"/><path class="sch-badge-bad" d="M-1-1L1 1M1-1L-1 1"/></g>'
    );
  }

  /* --- Сам вид. --- */
  const RAIL_NAMES = { tp: 'Верхняя рейка «+»', tn: 'Верхняя рейка «−»', bp: 'Нижняя рейка «+»', bn: 'Нижняя рейка «−»' };
  const ROWS = [...Object.entries(C.ROW_UNITS), ...Object.entries(C.RAIL_UNITS)].map(([name, u]) => ({ name, y: C.rowY(u) }));
  const ITEM_INDEX = new Map(C.ITEMS.map((it, i) => [it.id, i]));
  const LAST_OF_STEP = C.ITEMS.reduce((acc, it, i) => ((acc[it.step] = i), acc), {});
  const POT_MAX = 1023;
  const SWEEP = 135;
  const GLOW_MIN = 5; // радиус свечения в мм при малой и полной яркости
  const GLOW_MAX = 9.5;

  function holeAt(p) {
    const col = Math.round((p.x - C.colX(1)) / C.PITCH) + 1;
    if (col < 1 || col > C.BB.cols) return null;
    const row = ROWS.find((r) => Math.abs(p.y - r.y) <= C.PITCH / 2);
    if (!row) return null;
    if (row.name in C.RAIL_UNITS && !C.railHoleExists(col)) return null;
    return row.name + col;
  }

  function createSchematic(host, opts) {
    const o = Object.assign({ live: true, interactive: true, labels: true, wires: null, parts: null, onPick: null }, opts);
    o.interactive = o.interactive && o.live; // без live ручка меняла бы общее состояние и не поворачивалась
    const wires = o.wires || C.WIRES;
    const parts = o.parts || C.PARTS;
    let step = o.step == null ? (o.live ? state.step : 0) : o.step;
    let upto = null;
    let labels = o.labels;
    let seenStep = state.step;
    let seenUpto = state.upto;
    // Схема с подменой стоит в задании: шаг верстака её не касается, отметка новых деталей выдала бы ответ.
    const fixed = Boolean(o.wires || o.parts);

    ensureDefs();
    boards = boards || boardsArt();

    const pickAttrs = (title) => (o.onPick ? `tabindex="0" role="button" aria-label="${esc(title)}"` : '');
    const titles = new Map();
    let buzzerCenter = null;
    let dome = null;

    const partsHtml = Object.entries(parts)
      .map(([id, p]) => {
        const { art, box, c } = ART[p.kind](p);
        titles.set(id, p.title);
        if (p.kind === 'buzzer') buzzerCenter = c;
        if (p.kind === 'rgb') {
          dome = center(['r', 'k', 'g', 'b'].map((k) => C.pos(p.legs[k])));
          dome.y += DOME_DROP;
        }
        return (
          `<g class="sch-item sch-item--part" data-item="${id}" data-item-kind="part" data-item-step="${p.step}" ${pickAttrs(p.title)}>` +
          R(box.x, box.y, box.w, box.h, `class="sch-halo" rx="${box.rx || 1.2}"`) +
          art +
          badgeArt({ x: box.x + box.w, y: box.y - 1.4 }) +
          '</g>'
        );
      })
      .join('');

    const wiresHtml = wires
      .map((w) => {
        const { art, badge } = wireArt(w);
        const title = w.title || 'Провод';
        titles.set(w.id, title);
        return (
          `<g class="sch-item sch-item--wire" data-item="${w.id}" data-item-kind="wire" data-item-step="${w.step || 0}" ${pickAttrs(title)}>` +
          art +
          badgeArt(badge) +
          '</g>'
        );
      })
      .join('');

    const pill = (name, x, y, w, h, caption) =>
      `<g class="sch-pill sch-pill--${name}" style="display:none">${R(x, y, w, h, 'rx="1.3"')}` +
      (caption ? T(x + w / 2, y + 2.05, caption, 'class="sch-pill-cap" text-anchor="middle"') : '') +
      `<text x="${n2(x + w / 2)}" y="${n2(y + (caption ? 5.15 : h / 2))}" dy=".36em" text-anchor="middle"></text></g>`;

    // Подпись A0 сидит на оранжевом проводе, между платой и чёрным проводом.
    const a0 = C.pos('uno:A0');
    const a0Wire = wires.find((w) => w.id === 'wa0');
    let pillsHtml = pill('in', a0.x + 2.6, (a0Wire && a0Wire.via != null ? a0Wire.via : 56.5) - 2.1, 19.4, 4.2);
    if (dome) pillsHtml += pill('led', dome.x + 5.9, dome.y - 4, 12, 8, 'яркость');
    if (buzzerCenter) pillsHtml += pill('tone', buzzerCenter.x - 8.2, buzzerCenter.y + 7.1, 16.4, 4.2);

    const v = C.view;
    const rootEl = document.createElement('div');
    rootEl.className = 'sch';
    rootEl.innerHTML =
      `<div class="sch-scroll"><svg class="sch-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="group" aria-label="Схема подключения: Arduino Uno и макетная плата">` +
      boards.under +
      (dome ? `<circle class="sch-glow" cx="${n2(dome.x)}" cy="${n2(dome.y)}" r="${GLOW_MIN}" fill="url(#sch-glow)" opacity="0"/>` : '') +
      boards.over +
      '<g class="sch-strip"></g>' +
      `<g class="sch-parts">${partsHtml}</g>` +
      `<g class="sch-wires">${wiresHtml}</g>` +
      '<rect class="sch-pinring" width="2.54" height="2.54" rx=".4" style="display:none"/>' +
      `<g class="sch-pills">${pillsHtml}</g>` +
      '</svg></div><div class="sch-tip" hidden></div>';
    host.appendChild(rootEl);

    const svg = rootEl.querySelector('svg');
    const tip = rootEl.querySelector('.sch-tip');
    const stripG = svg.querySelector('.sch-strip');
    const pinRing = svg.querySelector('.sch-pinring');
    const glow = svg.querySelector('.sch-glow');
    const core = svg.querySelector('.sch-core');
    const knob = svg.querySelector('.sch-knob');
    const rotor = svg.querySelector('.sch-rotor');
    const trackOn = svg.querySelector('.sch-track-on');
    const button = svg.querySelector('.sch-btn');
    const wavesG = svg.querySelector('.sch-waves');
    const waves = [...svg.querySelectorAll('.sch-wave')];
    const pillIn = svg.querySelector('.sch-pill--in');
    const pillLed = svg.querySelector('.sch-pill--led');
    const pillTone = svg.querySelector('.sch-pill--tone');
    const items = new Map([...svg.querySelectorAll('.sch-item')].map((el) => [el.dataset.item, el]));
    const knobC = knob ? { x: +knob.dataset.cx, y: +knob.dataset.cy } : null;

    const toMm = (e) => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    };

    /* --- Что показано --- */
    function shown(id, itemStep) {
      if (itemStep > step) return false;
      if (upto == null) return true;
      const i = ITEM_INDEX.get(id);
      return i == null || i <= upto;
    }

    function refresh() {
      items.forEach((el, id) => {
        const itemStep = +el.dataset.itemStep;
        const visible = shown(id, itemStep);
        el.style.display = visible ? '' : 'none';
        el.classList.toggle('is-new', visible && !fixed && step > 0 && itemStep === step);
      });
      paintOutputs();
    }

    /* --- Живые значения --- */
    let last = {};
    let lastD = null;
    let shownLed = 0;
    let shownTone = null;

    // Пока схема собрана не до конца, светодиод и buzzer молчат: цепь ещё не замкнута.
    function paintOutputs() {
      if (!lastD) return;
      const d = lastD;
      const wired = upto == null || upto >= LAST_OF_STEP[step];
      const led = wired ? d.led : 0;
      const tone = wired ? d.tone : null;
      if (led !== shownLed) paintLed((shownLed = led));
      if (tone !== shownTone) paintTone((shownTone = tone));

      const visible = (id) => items.has(id) && items.get(id).style.display !== 'none';
      const show = (el, yes, text) => {
        if (!el) return;
        el.style.display = yes ? '' : 'none';
        if (yes && el.lastChild.textContent !== text) el.lastChild.textContent = text;
      };
      show(pillIn, labels && visible('wa0'), 'A0 = ' + d.pot);
      show(pillLed, labels && wired && (d.step === 1 || (d.step === 3 && !d.soundMode)), String(led));
      show(pillTone, labels && tone != null, tone + ' Гц');
    }

    function paintPot(pot) {
      if (!knob) return;
      const deg = (pot / POT_MAX) * 2 * SWEEP - SWEEP;
      rotor.setAttribute('transform', `rotate(${deg.toFixed(1)} ${knobC.x} ${knobC.y})`);
      trackOn.setAttribute('stroke-dasharray', `${(deg + SWEEP).toFixed(1)} 270`);
      if (o.interactive) knob.setAttribute('aria-valuenow', pot);
    }

    function paintLed(led) {
      if (!glow) return;
      const k = led / 255;
      const a = Math.sqrt(k).toFixed(3);
      glow.setAttribute('opacity', a);
      glow.setAttribute('r', (GLOW_MIN + (GLOW_MAX - GLOW_MIN) * k).toFixed(1));
      core.setAttribute('opacity', a);
    }

    // Дуги вокруг buzzer: чем выше частота, тем быстрее расходятся.
    let hz = null;
    let raf = 0;
    let phase = 0;
    let prevT = 0;

    function drawWaves(still) {
      waves.forEach((w, i) => {
        const t = still ? ((i % 3) + 0.4) / 3 : (phase + (i % 3) / 3) % 1;
        const r = 6.8 + t * 3.1;
        const side = i < 3 ? -1 : 1;
        w.setAttribute('d', side > 0 ? arcPath(buzzerCenter, n2(r), 52, 128) : arcPath(buzzerCenter, n2(r), 232, 308));
        w.setAttribute('opacity', (1 - t).toFixed(2));
      });
    }

    function loop(now) {
      if (hz == null) {
        raf = 0;
        return;
      }
      phase = (phase + ((now - prevT) / 1000) * (0.8 + ((hz - 200) / 1800) * 3.2)) % 1;
      prevT = now;
      drawWaves(false);
      raf = requestAnimationFrame(loop);
    }

    function paintTone(tone) {
      hz = tone;
      if (!wavesG) return;
      wavesG.style.display = tone == null ? 'none' : '';
      if (tone == null) return;
      if (reducedMotion()) {
        drawWaves(true);
      } else if (!raf) {
        prevT = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    function update(s, d) {
      if (!fixed && (s.step !== seenStep || s.upto !== seenUpto)) {
        seenStep = s.step;
        seenUpto = s.upto;
        step = s.step;
        upto = s.upto;
        refresh();
      }
      if (s.pot !== last.pot) paintPot(s.pot);
      if (s.pressed !== last.pressed && button) button.classList.toggle('is-pressed', s.pressed);
      last = { pot: s.pot, pressed: s.pressed };
      lastD = d;
      paintOutputs();
    }

    /* --- Управление --- */
    const setPot = (value) => {
      const pot = clamp(Math.round(value), 0, POT_MAX);
      if (pot !== state.pot) set({ pot });
    };
    let dragging = false;

    function bindKnob() {
      const angleOf = (e) => {
        const p = toMm(e);
        return Math.hypot(p.x - knobC.x, p.y - knobC.y) < 0.9 ? null : (Math.atan2(p.x - knobC.x, knobC.y - p.y) * 180) / Math.PI;
      };
      let prev = null;
      let deg = 0;
      knob.setAttribute('tabindex', '0');
      knob.setAttribute('role', 'slider');
      knob.setAttribute('aria-label', 'Ручка потенциометра');
      knob.setAttribute('aria-valuemin', '0');
      knob.setAttribute('aria-valuemax', String(POT_MAX));
      knob.addEventListener('pointerdown', (e) => {
        knob.setPointerCapture(e.pointerId);
        dragging = true;
        hideTip();
        prev = angleOf(e);
        deg = (state.pot / POT_MAX) * 2 * SWEEP - SWEEP;
      });
      knob.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const a = angleOf(e);
        if (a == null) return;
        if (prev != null) {
          let delta = a - prev;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          deg = clamp(deg + delta, -SWEEP, SWEEP);
          setPot(((deg + SWEEP) / (2 * SWEEP)) * POT_MAX);
        }
        prev = a;
      });
      const stop = () => (dragging = false);
      knob.addEventListener('pointerup', stop);
      knob.addEventListener('pointercancel', stop);
      knob.addEventListener('wheel', (e) => {
        e.preventDefault();
        const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        setPot(state.pot - Math.sign(px) * clamp(Math.abs(px) / 6, 1, 32));
      }, { passive: false });
      knob.addEventListener('keydown', (e) => {
        const delta = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 100, PageDown: -100 }[e.key];
        if (delta) setPot(state.pot + delta);
        else if (e.key === 'Home') setPot(0);
        else if (e.key === 'End') setPot(POT_MAX);
        else return;
        e.preventDefault();
      });
    }

    function bindButton() {
      button.setAttribute('tabindex', '0');
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Кнопка смены режима: свет или звук');
      button.addEventListener('pointerdown', (e) => {
        button.setPointerCapture(e.pointerId);
        press(true);
      });
      button.addEventListener('pointerup', () => press(false));
      button.addEventListener('pointercancel', () => press(false));
      button.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (!e.repeat) press(true);
      });
      button.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') press(false);
      });
      button.addEventListener('blur', () => press(false));
    }

    if (o.interactive && knob) bindKnob();
    if (o.interactive && button) bindButton();

    /* --- Наведение --- */
    let hoverItem = null;
    let hoverRef = null;

    function hideTip() {
      tip.hidden = true;
    }

    function showTip(html, e) {
      if (tip.innerHTML !== html) tip.innerHTML = html;
      tip.hidden = false;
      const box = rootEl.getBoundingClientRect();
      const x = clamp(e.clientX - box.left - tip.offsetWidth / 2, 4, Math.max(4, box.width - tip.offsetWidth - 4));
      const above = e.clientY - box.top - tip.offsetHeight - 14;
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(above < 4 ? e.clientY - box.top + 20 : above)}px)`;
    }

    function setHoverItem(el) {
      if (el === hoverItem) return;
      if (hoverItem) hoverItem.classList.remove('is-hover');
      if (el) el.classList.add('is-hover');
      hoverItem = el;
    }

    function setStrip(ref) {
      if (ref === hoverRef) return;
      hoverRef = ref;
      if (!ref) {
        stripG.innerHTML = '';
        return;
      }
      const refs = C.strip(ref);
      const pts = refs.map(C.pos);
      const a = pts[0];
      const b = pts[pts.length - 1];
      stripG.innerHTML =
        `<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}"/>` +
        refs.map((r, i) => R(pts[i].x - 0.8, pts[i].y - 0.8, 1.6, 1.6, `data-ref="${r}"${r === ref ? ' class="is-at"' : ''}`)).join('');
    }

    function setPinRing(pin) {
      pinRing.style.display = pin ? '' : 'none';
      if (!pin) return;
      const p = C.pos('uno:' + pin);
      pinRing.setAttribute('x', n2(p.x - 1.27));
      pinRing.setAttribute('y', n2(p.y - 1.27));
    }

    const CONTROL_HINT = { pot: 'Тяни ручку по кругу или крути колесо мыши', btn: 'Нажми, чтобы сменить режим' };

    function itemTip(el) {
      const id = el.dataset.item;
      const hint = id === 'rgb' ? 'Самая длинная ножка K: общий катод' : o.interactive && CONTROL_HINT[id];
      return esc(titles.get(id)) + (hint ? `<small>${hint}</small>` : '');
    }

    function pinTip(pin) {
      const ref = 'uno:' + pin;
      const linked = wires.filter((w) => (w.from === ref || w.to === ref) && shown(w.id, w.step));
      const what = linked.length ? linked.map((w) => esc(w.title)).join(', ') : 'ничего не подключено';
      return `<b>${esc(C.UNO_LABEL[pin])}</b> ${what}`;
    }

    function holeTip(ref) {
      const r = C.parseRef(ref);
      if (r.type === 'rail') return `${RAIL_NAMES[r.rail]}, столбец ${r.col}`;
      return `<b>${esc(ref)}</b> соединено с рядами ${'jihgf'.includes(r.row) ? 'f–j' : 'a–e'} столбца ${r.col}`;
    }

    function onHover(e) {
      if (dragging) return;
      const item = e.target.closest('[data-item]');
      const pin = !item && e.target.dataset.pin;
      const ref = !item && !pin && e.target.classList.contains('sch-bb-hit') ? holeAt(toMm(e)) : null;
      setHoverItem(item);
      setPinRing(pin || null);
      setStrip(ref);
      if (item) showTip(itemTip(item), e);
      else if (pin) showTip(pinTip(pin), e);
      else if (ref) showTip(holeTip(ref), e);
      else hideTip();
    }

    function clearHover() {
      setHoverItem(null);
      setPinRing(null);
      setStrip(null);
      hideTip();
    }

    svg.addEventListener('pointermove', onHover);
    svg.addEventListener('pointerdown', onHover);
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') clearHover();
    });

    /* --- Выбор детали или провода --- */
    if (o.onPick) {
      const pick = (el) => o.onPick(el.dataset.item, el.dataset.itemKind);
      svg.addEventListener('click', (e) => {
        if (o.interactive && e.target.closest('.sch-ctl')) return;
        const el = e.target.closest('[data-item]');
        if (el) pick(el);
      });
      svg.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!e.target.dataset.item) return;
        e.preventDefault();
        pick(e.target);
      });
    }

    refresh();
    paintPot(512);
    const off = o.live ? on(update) : null;

    return {
      svg,
      setStep(n) {
        if (n !== step) upto = null;
        step = n;
        refresh();
      },
      setUpto(i) {
        upto = i;
        refresh();
      },
      highlight(id) {
        const el = id == null ? null : items.get(id) || null;
        rootEl.classList.toggle('has-hi', Boolean(el));
        items.forEach((it) => it.classList.toggle('is-hi', it === el));
      },
      mark(id, status) {
        const el = items.get(id);
        if (!el) return;
        if (status) el.dataset.mark = status;
        else delete el.dataset.mark;
      },
      setLabels(value) {
        labels = Boolean(value);
        paintOutputs();
      },
      destroy() {
        if (off) off();
        hz = null;
        cancelAnimationFrame(raf);
        rootEl.remove();
      },
    };
  }

  NS.createSchematic = createSchematic;
})(typeof window !== 'undefined' ? window : globalThis);
