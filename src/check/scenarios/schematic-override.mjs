/* Подмена проводов и деталей: все отверстия и все пины, ошибочные схемы из задания «Найди ошибку».
   Запуск из папки src:
   timeout 120 node check/drive.mjs schematic/dev.html check/scenarios/schematic-override.mjs 1440x900 */
import assert from 'node:assert';

const SHOTS = (process.env.SHOTS || '/tmp') + '/';

export default async (page) => {
  await page.wait(300);
  const js = (code) => page.eval(`(() => { ${code} })()`);
  const noBadAttrs = async (label) => {
    assert.deepStrictEqual(page.errors, [], label + ': ошибки страницы');
    const bad = await js(`
      const out = [];
      document.querySelectorAll('.sch-svg *').forEach((e) => {
        for (const a of e.attributes) if (/NaN|undefined|Infinity/.test(a.value)) out.push(e.tagName + ' ' + a.name + '=' + a.value.slice(0, 40));
      });
      return out.slice(0, 5);
    `);
    assert.deepStrictEqual(bad, [], label + ': плохие атрибуты');
  };

  await js(`
    const box = document.createElement('div');
    box.id = 'over';
    box.style.width = '800px';
    document.body.appendChild(box);
    const C = MapLab.CIRCUIT;
    window.make = (patch) => {
      if (window.v) window.v.destroy();
      window.v = MapLab.createSchematic(box, Object.assign({ step: 3, live: false, interactive: false, labels: false, onPick: () => {} }, patch));
      return window.v;
    };
    // Все отверстия макетки и все пины Uno.
    window.allRefs = () => {
      const refs = [];
      for (let c = 1; c <= C.BB.cols; c++) {
        C.ROWS_TOPDOWN.forEach((r) => refs.push(r + c));
        if (C.railHoleExists(c)) C.RAILS.forEach((r) => refs.push(r + c));
      }
      [...Object.keys(C.UNO_TOP), ...Object.keys(C.UNO_BOTTOM)].forEach((p) => refs.push('uno:' + p));
      return refs;
    };
    window.wire = (id, from, to, extra) => Object.assign({ id, from, to, color: 'orange', step: 0, title: id }, extra);
    window.swap = (id, patch) => C.WIRES.map((w) => (w.id === id ? { ...w, ...patch } : w));
    return 1;
  `);

  /* --- Любое отверстие и пин: концы провода точно в pos(), с via и без. --- */
  for (const via of ['null', '-11', '56.5', '30']) {
    const res = await js(`
      const refs = allRefs();
      const wires = refs.map((r, i) => wire('t' + i, 'a1', r, ${via} == null ? {} : { via: ${via} }));
      const v = make({ wires });
      const off = [];
      refs.forEach((r, i) => {
        const e = v.svg.querySelector('[data-item="t' + i + '"] [data-end="to"]');
        const p = MapLab.CIRCUIT.pos(r);
        if (Math.hypot(+e.getAttribute('cx') - p.x, +e.getAttribute('cy') - p.y) > 0.02) off.push(r);
      });
      return { n: refs.length, off };
    `);
    assert.deepStrictEqual(res.off, [], 'via ' + via);
    await noBadAttrs('via ' + via);
    console.log(`  ok  ${res.n} ссылок, via = ${via}: концы проводов точно в pos()`);
  }

  /* --- Вырожденные случаи: оба конца рядом, в одном столбце, в одном отверстии. --- */
  const edge = await js(`
    const cases = {
      'оба конца в одном отверстии': wire('x', 'a5', 'a5'),
      'via равен ряду': wire('x', 'a5', 'a9', { via: MapLab.CIRCUIT.pos('a5').y }),
      'один столбец через via': wire('x', 'a5', 'j5', { via: -8 }),
      'соседние отверстия': wire('x', 'a5', 'b5'),
      'пин в тот же пин': wire('x', 'uno:A0', 'uno:A0', { via: 50 }),
      'пин в соседний пин': wire('x', 'uno:A0', 'uno:A1'),
      'неизвестный цвет': wire('x', 'a5', 'b5', { color: 'magenta' }),
      'без step и title': { id: 'x', from: 'a5', to: 'c7', color: 'red' },
    };
    const out = {};
    for (const [name, w] of Object.entries(cases)) {
      try {
        const v = make({ wires: [...MapLab.CIRCUIT.WIRES, w] });
        out[name] = v.svg.querySelectorAll('[data-item="x"]').length === 1 ? 'ok' : 'нет провода';
      } catch (e) { out[name] = e.message; }
    }
    return out;
  `);
  for (const [name, res] of Object.entries(edge)) assert.strictEqual(res, 'ok', name);
  await noBadAttrs('вырожденные');
  console.log('  ok  вырожденные провода рисуются: ' + Object.keys(edge).length + ' случаев');

  /* --- Детали: нет части деталей, ножки в другом порядке, в других рядах. --- */
  const partsRes = await js(`
    const P = MapLab.CIRCUIT.PARTS;
    const cases = {
      'только потенциометр': { pot: P.pot },
      'без потенциометра': (({ pot, ...rest }) => rest)(P),
      'без светодиода': (({ rgb, ...rest }) => rest)(P),
      'без buzzer и кнопки': (({ buz, btn, ...rest }) => rest)(P),
      'нет деталей': {},
      'ножки RGB наоборот': { ...P, rgb: { ...P.rgb, legs: { r: 'c24', k: 'c23', g: 'c22', b: 'c21' } } },
      'катод в другой половине': { ...P, rgb: { ...P.rgb, legs: { ...P.rgb.legs, k: 'h22' } } },
      'ножка потенциометра выше корпуса': { ...P, pot: { ...P.pot, legs: { ...P.pot.legs, gnd: 'j2' } } },
      'резистор не через канавку': { ...P, r1: { ...P.r1, legs: { a: 'g21', b: 'f21' } } },
      'резистор в одно отверстие': { ...P, r1: { ...P.r1, legs: { a: 'g21', b: 'g21' } } },
      'резистор лёжа': { ...P, r1: { ...P.r1, legs: { a: 'g21', b: 'g25' } } },
      'buzzer наоборот': { ...P, buz: { ...P.buz, legs: { plus: 'e16', minus: 'f16' } } },
      'кнопка в одном столбце': { ...P, btn: { ...P.btn, legs: { a1: 'f10', a2: 'e10', b1: 'f10', b2: 'e10' } } },
    };
    const out = {};
    for (const [name, parts] of Object.entries(cases)) {
      for (const live of [false, true]) {
        try {
          const v = make({ parts, live, interactive: live, labels: live });
          MapLab.set({ step: 3, pot: 700, soundMode: live });
          MapLab.set({ soundMode: false });
          v.setStep(3); v.setUpto(4); v.setUpto(null); v.highlight('pot'); v.highlight(null); v.mark('rgb', 'bad'); v.setLabels(true);
          out[name] = 'ok';
        } catch (e) { out[name] = e.message; }
      }
    }
    make({});
    return out;
  `);
  for (const [name, res] of Object.entries(partsRes)) assert.strictEqual(res, 'ok', name);
  await noBadAttrs('детали');
  console.log('  ok  подмена деталей рисуется: ' + Object.keys(partsRes).length + ' случаев, live и без live');

  /* --- Пять поломок из задания «Найди ошибку». --- */
  const breaks = [
    ['a0', 'провод A0 не в той строке', `{ wires: swap('wa0', { to: 'a5' }) }`, 'wa0', 'wire'],
    ['a0row', 'провод A0 в верхней половине', `{ wires: swap('wa0', { to: 'i4' }) }`, 'wa0', 'wire'],
    ['power', '5V и GND поменяны', `{ wires: MapLab.CIRCUIT.WIRES.map((w) => (w.id === 'wpotg' ? { ...w, to: 'bp2' } : w.id === 'wpotv' ? { ...w, to: 'bn6' } : w)) }`, 'wpotg', 'wire'],
    ['button', 'кнопка двумя проводами к одному столбцу', `{ wires: swap('wbtng', { from: 'a10', to: 'bn10' }) }`, 'wbtng', 'wire'],
    ['cathode', 'катод без GND', `{ wires: MapLab.CIRCUIT.WIRES.filter((w) => w.id !== 'wk') }`, 'rgb', 'part'],
    ['resistor', 'резистор не через канавку', `{ parts: { ...MapLab.CIRCUIT.PARTS, r1: { ...MapLab.CIRCUIT.PARTS.r1, legs: { a: 'g21', b: 'f21' } } } }`, 'r1', 'part'],
    ['short', 'провод A0 короткой перемычкой', `{ wires: swap('wa0', { from: 'a4', to: 'bp4', via: undefined }) }`, 'wa0', 'wire'],
  ];
  await js(`window.scrollTo(0, 0); document.querySelector('main').style.display = 'none'; return 1;`);
  for (const [name, label, patch, id, kind] of breaks) {
    const res = await js(`
      window.picked = [];
      const v = make(Object.assign(${patch}, { labels: false, onPick: (id, kind) => window.picked.push(id + ':' + kind) }));
      v.mark(${JSON.stringify(id)}, 'bad');
      const box = v.svg.getBoundingClientRect();
      return {
        el: !!v.svg.querySelector('[data-item="${id}"]'),
        isNew: v.svg.querySelectorAll('.is-new').length,
        h: Math.round(box.height),
      };
    `);
    assert(res.el, label + ': элемент на месте');
    assert.strictEqual(res.isNew, 0, label + ': отметка новых деталей выдаёт ответ');
    await page.wait(60);
    await page.shot(`${SHOTS}schematic-break-${name}.png`);
    await noBadAttrs(label);
    console.log('  ok  ' + label);
  }

  // Клик настоящей мышью рядом с тонким выводом резистора: мимо корпуса, но в его рамке.
  await js(`
    window.picked = [];
    make({ parts: { ...MapLab.CIRCUIT.PARTS, r1: { ...MapLab.CIRCUIT.PARTS.r1, legs: { a: 'g21', b: 'f21' } } }, onPick: (id, kind) => window.picked.push(id + ':' + kind) });
    return 1;
  `);
  const at = await js(`
    const p = MapLab.CIRCUIT.pos('g23');
    const q = new DOMPoint(p.x + 0.9, p.y + 0.9).matrixTransform(v.svg.getScreenCTM());
    return { x: q.x, y: q.y };
  `);
  await page.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, button: 'none', clickCount: 0 });
  await page.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await page.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await page.wait(40);
  assert.deepStrictEqual(await js(`return window.picked;`), ['r2:part'], 'клик рядом с тонким выводом резистора');
  console.log('  ok  деталь выбирается кликом по всей своей рамке');

  // Схема с подменой живёт своей жизнью: шаг на верстаке не меняет задание.
  const fixed = await js(`
    const v = make({ wires: swap('wa0', { to: 'a5' }), live: true, interactive: true });
    const count = () => [...v.svg.querySelectorAll('.sch-item')].filter((e) => e.style.display !== 'none').length;
    const a = count();
    MapLab.set({ step: 0 });
    const b = count();
    MapLab.set({ step: 3 });
    return [a, b];
  `);
  assert.deepStrictEqual(fixed, [20, 20], 'шаг на верстаке не меняет задание с подменой');

  // Без live ручка не трогает общее состояние.
  const still = await js(`
    const v = make({ live: false });
    const k = v.svg.querySelector('.sch-knob');
    return { role: k.getAttribute('role'), tab: k.getAttribute('tabindex') };
  `);
  assert.deepStrictEqual(still, { role: null, tab: null }, 'без live ручка не управляется');
  console.log('  ok  схема с подменой не зависит от шага, без live ручка неподвижна');
  assert.deepStrictEqual(page.errors, [], 'ошибки страницы');
  console.log('\nвсе проверки подмены пройдены');
};
