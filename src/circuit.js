/* circuit.js — единственный источник правды о схеме «Музыкальный регулятор».
   2D, 3D, список сборки и проверка цепи читают только эти данные.
   Координаты в мм, вид сверху: x вправо, y вниз, (0,0) — левый верхний угол платы Uno.
   Высоты (ось z) задаёт только 3D-сцена. */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});

  const PITCH = 2.54;
  const MIL = 0.0254;

  const UNO = { x: 0, y: 0, w: 68.58, h: 53.34 };
  const BB = { x: 78, y: -0.63, w: 82.5, h: 54.6, cols: 30 };

  // Гребёнки Uno R3, x в милах от левого края платы (USB слева).
  const UNO_TOP = {
    SCL: 840, SDA: 940, AREF: 1040, 'GND.3': 1140, D13: 1240, D12: 1340, D11: 1440, D10: 1540, D9: 1640, D8: 1740,
    D7: 1900, D6: 2000, D5: 2100, D4: 2200, D3: 2300, D2: 2400, D1: 2500, D0: 2600,
  };
  const UNO_BOTTOM = {
    NC: 1100, IOREF: 1200, RESET: 1300, '3V3': 1400, '5V': 1500, 'GND.1': 1600, 'GND.2': 1700, VIN: 1800,
    A0: 2000, A1: 2100, A2: 2200, A3: 2300, A4: 2400, A5: 2500,
  };
  // Подписи как на шелкографии реальной платы.
  const UNO_LABEL = {
    SCL: 'SCL', SDA: 'SDA', AREF: 'AREF', 'GND.3': 'GND', D13: '13', D12: '12', D11: '~11', D10: '~10', D9: '~9', D8: '8',
    D7: '7', D6: '~6', D5: '~5', D4: '4', D3: '~3', D2: '2', D1: 'TX→1', D0: 'RX←0',
    NC: '', IOREF: 'IOREF', RESET: 'RESET', '3V3': '3.3V', '5V': '5V', 'GND.1': 'GND', 'GND.2': 'GND', VIN: 'Vin',
    A0: 'A0', A1: 'A1', A2: 'A2', A3: 'A3', A4: 'A4', A5: 'A5',
  };

  // Ряды макетки сверху вниз, как в Tinkercad при номерах столбцов слева направо: j вверху, a внизу.
  // Единицы — шаги 2,54 мм от самой верхней рейки. Рейки тоже как там: снаружи сверху «−», снаружи снизу «+».
  const ROW_UNITS = { j: 3.5, i: 4.5, h: 5.5, g: 6.5, f: 7.5, e: 10.5, d: 11.5, c: 12.5, b: 13.5, a: 14.5 };
  const RAIL_UNITS = { tn: 0, tp: 1, bn: 17, bp: 18 };
  const ROWS_TOPDOWN = ['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const UPPER_ROWS = 'jihgf';
  const RAILS = ['tp', 'tn', 'bp', 'bn'];

  const originX = BB.x + (BB.w - (BB.cols - 1) * PITCH) / 2;
  const originY = BB.y + (BB.h - 18 * PITCH) / 2;
  const colX = (c) => originX + (c - 1) * PITCH;
  const rowY = (u) => originY + u * PITCH;

  // В рейках отверстия идут группами по пять: столбцы 1, 7, 13, 19, 25 пустые.
  const railHoleExists = (c) => c >= 1 && c <= BB.cols && (c - 1) % 6 !== 0;

  function parseRef(ref) {
    let m;
    if ((m = /^uno:(.+)$/.exec(ref))) return { type: 'pin', pin: m[1] };
    if ((m = /^(tp|tn|bp|bn)(\d+)$/.exec(ref))) return { type: 'rail', rail: m[1], col: +m[2] };
    if ((m = /^([a-j])(\d+)$/.exec(ref))) return { type: 'hole', row: m[1], col: +m[2] };
    throw new Error('Неизвестная ссылка: ' + ref);
  }

  function pos(ref) {
    const r = parseRef(ref);
    if (r.type === 'pin') {
      if (r.pin in UNO_TOP) return { x: UNO_TOP[r.pin] * MIL, y: UNO.h - 2000 * MIL };
      if (r.pin in UNO_BOTTOM) return { x: UNO_BOTTOM[r.pin] * MIL, y: UNO.h - 100 * MIL };
      throw new Error('Нет такого пина: ' + r.pin);
    }
    if (r.type === 'rail') {
      if (!railHoleExists(r.col)) throw new Error('В рейке нет отверстия: ' + ref);
      return { x: colX(r.col), y: rowY(RAIL_UNITS[r.rail]) };
    }
    if (r.col < 1 || r.col > BB.cols) throw new Error('Нет такого столбца: ' + ref);
    return { x: colX(r.col), y: rowY(ROW_UNITS[r.row]) };
  }

  // Электрический узел отверстия: столбец верхней или нижней половины, рейка или пин Uno.
  function node(ref) {
    const r = parseRef(ref);
    if (r.type === 'pin') return 'pin:' + r.pin.replace(/^GND\.\d$/, 'GND');
    if (r.type === 'rail') return 'rail:' + r.rail;
    return (UPPER_ROWS.includes(r.row) ? 'U' : 'L') + r.col;
  }

  // Все отверстия, соединённые с данным внутри макетки (подсветка как в Tinkercad).
  function strip(ref) {
    const r = parseRef(ref);
    if (r.type === 'rail') {
      const out = [];
      for (let c = 1; c <= BB.cols; c++) if (railHoleExists(c)) out.push(r.rail + c);
      return out;
    }
    if (r.type === 'hole') {
      const rows = UPPER_ROWS.includes(r.row) ? UPPER_ROWS : 'edcba';
      return rows.split('').map((row) => row + r.col);
    }
    return [ref];
  }

  /* Цвета проводов — физические, не зависят от темы страницы. */
  const WIRE_COLORS = {
    red: { hex: '#d92d20', name: 'красный' },
    black: { hex: '#1d2630', name: 'чёрный' },
    orange: { hex: '#ef8a06', name: 'оранжевый' },
    pink: { hex: '#e6399b', name: 'розовый' },
    green: { hex: '#16a34a', name: 'зелёный' },
    blue: { hex: '#2563eb', name: 'синий' },
    violet: { hex: '#7c3aed', name: 'фиолетовый' },
    cyan: { hex: '#0ea5b7', name: 'голубой' },
  };

  const PARTS = {
    pot: { kind: 'pot', step: 0, title: 'Потенциометр 10 кОм', legs: { gnd: 'e2', out: 'e4', vcc: 'e6' } },
    rgb: { kind: 'rgb', step: 1, title: 'RGB-светодиод (общий катод)', legs: { r: 'c21', k: 'c22', g: 'c23', b: 'c24' } },
    r1: { kind: 'res', step: 1, title: 'Резистор 220 Ом, красный канал', ohm: 220, legs: { a: 'g21', b: 'e21' } },
    r2: { kind: 'res', step: 1, title: 'Резистор 220 Ом, зелёный канал', ohm: 220, legs: { a: 'g23', b: 'e23' } },
    r3: { kind: 'res', step: 1, title: 'Резистор 220 Ом, синий канал', ohm: 220, legs: { a: 'g24', b: 'e24' } },
    buz: { kind: 'buzzer', step: 2, title: 'Пассивный buzzer', legs: { plus: 'f16', minus: 'e16' } },
    btn: { kind: 'button', step: 3, title: 'Кнопка смены режима', legs: { a1: 'f10', a2: 'e10', b1: 'f12', b2: 'e12' } },
  };

  /* via — y горизонтального участка провода: путь идёт из from вверх или вниз до via,
     вдоль платы и обратно к to. Без via — короткая перемычка. Высоты подобраны вложенно,
     поэтому провода не пересекаются. */
  const WIRES = [
    { id: 'w5v', from: 'uno:5V', to: 'bp9', color: 'red', via: 62.5, step: 0, title: '5V → рейка «+»' },
    { id: 'wgnd', from: 'uno:GND.2', to: 'bn8', color: 'black', via: 59.5, step: 0, title: 'GND → рейка «−»' },
    { id: 'wpotg', from: 'a2', to: 'bn2', color: 'black', step: 0, title: 'Левая ножка потенциометра → рейка «−»' },
    { id: 'wpotv', from: 'a6', to: 'bp6', color: 'red', step: 0, title: 'Правая ножка потенциометра → рейка «+»' },
    { id: 'wa0', from: 'uno:A0', to: 'a4', color: 'orange', via: 56.5, step: 0, title: 'Средняя ножка потенциометра → A0' },

    { id: 'wk', from: 'a22', to: 'bn22', color: 'black', step: 1, title: 'Общий катод → рейка «−»' },
    { id: 'wr', from: 'uno:D5', to: 'j21', color: 'pink', via: -11, step: 1, title: 'Пин 5 → красный канал' },
    { id: 'wg', from: 'uno:D6', to: 'j23', color: 'green', via: -14, step: 1, title: 'Пин 6 → зелёный канал' },
    { id: 'wb', from: 'uno:D9', to: 'j24', color: 'blue', via: -17, step: 1, title: 'Пин 9 → синий канал' },

    { id: 'wbuzg', from: 'a16', to: 'bn16', color: 'black', step: 2, title: 'Минус buzzer → рейка «−»' },
    { id: 'wbuz', from: 'uno:D4', to: 'j16', color: 'violet', via: -8, step: 2, title: 'Пин 4 → плюс buzzer' },

    { id: 'wbtng', from: 'a12', to: 'bn12', color: 'black', step: 3, title: 'Кнопка → рейка «−»' },
    { id: 'wbtn', from: 'uno:D2', to: 'j10', color: 'cyan', via: -5, step: 3, title: 'Пин 2 → кнопка' },
  ];

  function wirePoints(w) {
    const a = pos(w.from);
    const b = pos(w.to);
    if (w.via == null) return [a, b];
    return [a, { x: a.x, y: w.via }, { x: b.x, y: w.via }, b];
  }

  /* Порядок сборки. instr показывается ученику слово в слово. */
  const ITEMS = [
    { id: 'pot', instr: 'Вставь потенциометр ножками в отверстия e2, e4 и e6.' },
    { id: 'w5v', instr: 'Красный провод: от пина 5V на Arduino в нижнюю рейку «+», столбец 9.' },
    { id: 'wgnd', instr: 'Чёрный провод: от пина GND на Arduino в нижнюю рейку «−», столбец 8.' },
    { id: 'wpotg', instr: 'Чёрная перемычка: из a2 в рейку «−». Левая ножка потенциометра подключена к GND.' },
    { id: 'wpotv', instr: 'Красная перемычка: из a6 в рейку «+». Правая ножка подключена к 5V.' },
    { id: 'wa0', instr: 'Оранжевый провод: из a4 в пин A0. Со средней ножки Arduino читает напряжение.' },

    { id: 'rgb', instr: 'Вставь RGB-светодиод в c21, c22, c23 и c24. Самая длинная ножка (общий катод, это минус) идёт в c22.' },
    { id: 'r1', instr: 'Резистор 220 Ом через канавку: из g21 в e21.' },
    { id: 'r2', instr: 'Резистор 220 Ом через канавку: из g23 в e23.' },
    { id: 'r3', instr: 'Резистор 220 Ом через канавку: из g24 в e24.' },
    { id: 'wk', instr: 'Чёрная перемычка: из a22 в рейку «−». Общий катод подключён к GND.' },
    { id: 'wr', instr: 'Розовый провод: от пина 5 в j21. Это красный канал.' },
    { id: 'wg', instr: 'Зелёный провод: от пина 6 в j23. Это зелёный канал.' },
    { id: 'wb', instr: 'Синий провод: от пина 9 в j24. Это синий канал.' },

    { id: 'buz', instr: 'Вставь buzzer через канавку: ножка «+» в f16, ножка «−» в e16.' },
    { id: 'wbuzg', instr: 'Чёрная перемычка: из a16 в рейку «−».' },
    { id: 'wbuz', instr: 'Фиолетовый провод: от пина 4 в j16.' },

    { id: 'btn', instr: 'Вставь кнопку через канавку: ножки в f10, f12, e10 и e12.' },
    { id: 'wbtng', instr: 'Чёрная перемычка: из a12 в рейку «−».' },
    { id: 'wbtn', instr: 'Голубой провод: от пина 2 в j10.' },
  ].map((it) => {
    const part = PARTS[it.id];
    const wire = WIRES.find((w) => w.id === it.id);
    const src = part || wire;
    return { id: it.id, kind: part ? 'part' : 'wire', step: src.step, title: src.title, instr: it.instr };
  });

  /* Формулировки шагов — точно по плану занятия. */
  const STEPS = [
    { id: 0, short: 'Читаем потенциометр', task: 'Считать данные с потенциометра и перевести диапазон 0–1023 в 0–255 через map().' },
    { id: 1, short: 'Яркость RGB', task: 'Управлять яркостью RGB-светодиода с помощью потенциометра.' },
    { id: 2, short: 'Частота звука', task: 'Перевести данные с потенциометра в частоту звука (200–2000 Гц) для buzzer.' },
    { id: 3, short: 'Кнопка режимов', task: 'Добавить кнопку смены режима работы потенциометра (Управление светом / Управление звуком).' },
  ];

  const BOM = [
    { name: 'Arduino Uno с USB-кабелем', qty: 1, step: 0 },
    { name: 'Макетная плата на 400 точек', qty: 1, step: 0 },
    { name: 'Потенциометр 10 кОм', qty: 1, step: 0 },
    { name: 'RGB-светодиод с общим катодом', qty: 1, step: 1 },
    { name: 'Резистор 220 Ом', qty: 3, step: 1 },
    { name: 'Пассивный buzzer', qty: 1, step: 2 },
    { name: 'Тактовая кнопка', qty: 1, step: 3 },
    { name: 'Провода-перемычки', qty: WIRES.length, step: 0 },
  ];

  NS.CIRCUIT = {
    PITCH, MIL, UNO, BB, UNO_TOP, UNO_BOTTOM, UNO_LABEL,
    ROW_UNITS, RAIL_UNITS, ROWS_TOPDOWN, RAILS,
    PARTS, WIRES, ITEMS, STEPS, BOM, WIRE_COLORS,
    view: { x: -6, y: -22, w: 174, h: 90 },
    colX, rowY, railHoleExists, parseRef, pos, node, strip, wirePoints,
  };
})(typeof window !== 'undefined' ? window : globalThis);
