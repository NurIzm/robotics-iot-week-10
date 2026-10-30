/* Функциональная проверка схемы в настоящем браузере. Запуск из папки src:
   timeout 170 node check/drive.mjs schematic/dev.html check/scenarios/schematic-check.mjs 1440x900 */
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';

const SHOTS = (process.env.SHOTS || '/tmp') + '/';
let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

export default async (page) => {
  await page.wait(300);
  const js = (code) => page.eval(`(() => { ${code} })()`);
  const mouse = (type, x, y, extra = {}) => page.cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  const move = (x, y) => mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 });

  // Экранная точка по координатам в мм.
  await js(`window.scr = (x, y) => { const p = new DOMPoint(x, y).matrixTransform(view.svg.getScreenCTM()); return { x: p.x, y: p.y }; }; return 1;`);
  const scr = (x, y) => js(`return scr(${x}, ${y});`);
  const posOf = (ref) => js(`return MapLab.CIRCUIT.pos(${JSON.stringify(ref)});`);
  const setState = (patch) => js(`MapLab.set(${JSON.stringify(patch)}); return 1;`);

  /* --- 1. Шаг 4: все детали и провода на месте, наконечники точно в pos(). --- */
  await setState({ step: 3, pot: 512, soundMode: false, pressed: false, upto: null });
  const geo = await js(`
    const C = MapLab.CIRCUIT;
    const res = { parts: 0, wires: 0, off: [], ids: [] };
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.02;
    for (const [id, p] of Object.entries(C.PARTS)) {
      const el = view.svg.querySelector('[data-item="' + id + '"]');
      if (el && el.style.display !== 'none') res.parts++;
    }
    for (const w of C.WIRES) {
      const el = view.svg.querySelector('[data-item="' + w.id + '"]');
      if (!el || el.style.display === 'none') continue;
      res.wires++;
      const path = el.querySelector('.sch-w-core');
      const L = path.getTotalLength();
      const start = path.getPointAtLength(0), end = path.getPointAtLength(L);
      const A = C.pos(w.from), B = C.pos(w.to);
      if (!near(start, A)) res.off.push(w.id + ' начало пути ' + start.x + ',' + start.y + ' / ' + A.x + ',' + A.y);
      if (!near(end, B)) res.off.push(w.id + ' конец пути');
      for (const [tip, P] of [['from', A], ['to', B]]) {
        const c = el.querySelector('[data-end="' + tip + '"]');
        const at = { x: +c.getAttribute('cx'), y: +c.getAttribute('cy') };
        if (!near(at, P)) res.off.push(w.id + ' наконечник ' + tip);
      }
    }
    return res;
  `);
  assert.strictEqual(geo.parts, 7, 'деталей на шаге 4');
  assert.strictEqual(geo.wires, 13, 'проводов на шаге 4');
  assert.deepStrictEqual(geo.off, [], 'наконечники вне pos()');
  ok('шаг 4: 7 деталей, 13 проводов, все наконечники совпадают с pos()');

  // Шаги показывают только своё.
  const counts = await js(`
    const out = [];
    for (let i = 0; i < 4; i++) {
      MapLab.set({ step: i });
      out.push([...view.svg.querySelectorAll('.sch-item')].filter((e) => e.style.display !== 'none').length);
    }
    MapLab.set({ step: 3 });
    return out;
  `);
  const expected = await js(`const C = MapLab.CIRCUIT; return [0,1,2,3].map((s) => C.ITEMS.filter((i) => i.step <= s).length);`);
  assert.deepStrictEqual(counts, expected, 'число элементов по шагам');
  ok('шаги 1–4 показывают ' + counts.join(', ') + ' элементов');

  // Новые детали шага отмечены, на первом шаге отмечать нечего.
  const news = await js(`
    const out = [];
    for (let i = 0; i < 4; i++) {
      MapLab.set({ step: i });
      out.push([...view.svg.querySelectorAll('.is-new')].map((e) => e.dataset.item).sort());
    }
    return out;
  `);
  const newExpected = await js(`const C = MapLab.CIRCUIT; return [0,1,2,3].map((s) => s ? C.ITEMS.filter((i) => i.step === s).map((i) => i.id).sort() : []);`);
  assert.deepStrictEqual(news, newExpected, 'отметка новых деталей');
  const newUpto = await js(`view.setUpto(14); const n = [...view.svg.querySelectorAll('.is-new')].map((e) => e.dataset.item); view.setUpto(null); return n;`);
  assert.deepStrictEqual(newUpto, [], 'при сборке до 14 новых деталей шага 4 ещё не видно');
  ok('новые детали шага отмечены: ' + news.map((n) => n.length).join(', '));

  /* --- 2. Ручка: мышью по кругу, по часовой растёт. --- */
  await setState({ step: 0, pot: 512 });
  const knob = await js(`const k = view.svg.querySelector('.sch-knob'); return { x: +k.dataset.cx, y: +k.dataset.cy };`);
  const c = await scr(knob.x, knob.y);
  const R = (await scr(knob.x + 4, knob.y)).x - c.x;
  const at = (deg) => ({ x: c.x + R * Math.sin((deg * Math.PI) / 180), y: c.y - R * Math.cos((deg * Math.PI) / 180) });
  const sweep = async (from, to, steps = 40) => {
    const a = at(from);
    await move(a.x, a.y);
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= steps; i++) {
      const p = at(from + ((to - from) * i) / steps);
      await mouse('mouseMoved', p.x, p.y, { buttons: 1 });
    }
    const z = at(to);
    await mouse('mouseReleased', z.x, z.y);
    return js(`return MapLab.state.pot;`);
  };
  const potCw = await sweep(0, 45);
  assert(potCw > 512, 'по часовой значение растёт: ' + potCw);
  assert.strictEqual(potCw, Math.round((45 + (512 / 1023) * 270) / 270 * 1023), 'на 45 градусов: ' + potCw);
  const potCcw = await sweep(0, -30);
  assert(potCcw < potCw, 'против часовой значение падает');
  ok('поворот на +45° даёт ' + potCw + ', затем −30° даёт ' + potCcw);

  const right = await sweep(30, 170);
  assert.strictEqual(right, 1023, 'правый упор: ' + right);
  await js(`return 1`);
  const rotorMax = await js(`return view.svg.querySelector('.sch-rotor').getAttribute('transform');`);
  assert(rotorMax.startsWith('rotate(135.0'), 'риска на +135: ' + rotorMax);
  const left = await sweep(120, -175, 60);
  assert.strictEqual(left, 0, 'левый упор: ' + left);
  const rotorMin = await js(`return view.svg.querySelector('.sch-rotor').getAttribute('transform');`);
  assert(rotorMin.startsWith('rotate(-135.0'), 'риска на −135: ' + rotorMin);
  ok('упоры: 0 слева (' + rotorMin.slice(0, 13) + '), 1023 справа (' + rotorMax.slice(0, 12) + ')');

  // Проход через нижнюю мёртвую зону не перескакивает на другой упор.
  await setState({ pot: 0 });
  const dead = await sweep(-135, -179, 10);
  assert.strictEqual(dead, 0, 'упор держится: ' + dead);
  ok('за нижним упором значение не перепрыгивает');

  // Колесо и клавиатура.
  await setState({ pot: 500 });
  const wheel = await js(`
    const k = view.svg.querySelector('.sch-knob');
    const ev = new WheelEvent('wheel', { deltaY: -100, deltaMode: 0, bubbles: true, cancelable: true });
    k.dispatchEvent(ev);
    return { pot: MapLab.state.pot, prevented: ev.defaultPrevented };
  `);
  assert(wheel.pot > 500 && wheel.prevented, 'колесо вверх');
  ok('колесо: 500 → ' + wheel.pot + ', страница не скроллится');
  await js(`view.svg.querySelector('.sch-knob').focus(); return 1;`);
  await setState({ pot: 500 });
  await page.key('ArrowRight');
  assert.strictEqual(await js(`return MapLab.state.pot;`), 510, 'стрелка вправо');
  await page.key('ArrowLeft');
  await page.key('ArrowLeft');
  assert.strictEqual(await js(`return MapLab.state.pot;`), 490, 'стрелка влево');
  const aria = await js(`const k = view.svg.querySelector('.sch-knob'); return [k.getAttribute('role'), k.getAttribute('aria-valuenow'), k.getAttribute('aria-valuemax'), k.getAttribute('aria-label')];`);
  assert.deepStrictEqual(aria.slice(0, 3), ['slider', '490', '1023']);
  ok('клавиатура: role=slider, aria-valuenow=490, ' + aria[3]);

  /* --- 3. Кнопка: press, смена режима один раз при удержании. --- */
  await setState({ step: 3, soundMode: false, pressed: false, pot: 512 });
  const btn = await page.center('.sch-btn');
  await move(btn.x, btn.y);
  await mouse('mousePressed', btn.x, btn.y);
  await page.wait(250);
  const held = await js(`return { pressed: MapLab.state.pressed, sound: MapLab.state.soundMode, cls: view.svg.querySelector('.sch-btn').classList.contains('is-pressed') };`);
  assert.deepStrictEqual(held, { pressed: true, sound: true, cls: true }, 'нажатие');
  await page.wait(250);
  assert.strictEqual(await js(`return MapLab.state.soundMode;`), true, 'удержание не переключает повторно');
  await mouse('mouseReleased', btn.x, btn.y);
  assert.deepStrictEqual(await js(`return [MapLab.state.pressed, MapLab.state.soundMode];`), [false, true], 'отпускание');
  await page.click('.sch-btn');
  assert.strictEqual(await js(`return MapLab.state.soundMode;`), false, 'второй клик вернул свет');
  ok('мышь: нажатие меняет режим один раз, удержание не повторяет, отпускание сбрасывает pressed');

  await js(`view.svg.querySelector('.sch-btn').focus(); return 1;`);
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, autoRepeat: true });
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, autoRepeat: true });
  assert.deepStrictEqual(await js(`return [MapLab.state.pressed, MapLab.state.soundMode];`), [true, true], 'Space');
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  assert.deepStrictEqual(await js(`return [MapLab.state.pressed, MapLab.state.soundMode];`), [false, true], 'Space отпущен');
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await page.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  assert.strictEqual(await js(`return MapLab.state.soundMode;`), false, 'Enter вернул свет');
  ok('клавиатура: Space с автоповтором переключает один раз, Enter тоже работает');

  await setState({ step: 2 });
  await js(`MapLab.press(true); MapLab.press(false); return 1;`);
  assert.strictEqual(await js(`return MapLab.state.soundMode;`), false, 'на шаге 3 режим не меняется');
  await setState({ step: 3 });

  /* --- 4. Наведение: полоска, рейка, подсказки. --- */
  const hoverHole = async (ref) => {
    const p = await posOf(ref);
    const s = await scr(p.x, p.y);
    await move(s.x, s.y);
    await page.wait(30);
    return js(`return {
      refs: [...view.svg.querySelectorAll('.sch-strip rect')].map((r) => r.dataset.ref),
      at: (view.svg.querySelector('.sch-strip .is-at') || {dataset:{}}).dataset.ref,
      tip: document.querySelector('.sch-tip').hidden ? null : document.querySelector('.sch-tip').textContent,
    };`);
  };
  for (const ref of ['i5', 'b18', 'tn3', 'bp27', 'd28']) {
    const got = await hoverHole(ref);
    const want = await js(`return MapLab.CIRCUIT.strip(${JSON.stringify(ref)});`);
    assert.deepStrictEqual(got.refs, want, 'полоска ' + ref);
    assert.strictEqual(got.at, ref, 'отверстие под курсором');
    assert(got.tip, 'подсказка у ' + ref);
    console.log('      ' + ref + ': ' + got.refs.length + ' отв., «' + got.tip + '»');
  }
  ok('наведение подсвечивает всю полоску strip() и показывает подсказку');

  await move(5, 5);
  await page.wait(30);
  assert.strictEqual(await js(`return document.querySelector('.sch-tip').hidden && !view.svg.querySelector('.sch-strip rect');`), true, 'вне схемы подсказка и полоска убраны');

  const pinTip = async (pin) => {
    const p = await posOf('uno:' + pin);
    const s = await scr(p.x, p.y + (p.y < 20 ? 5 : -5));
    await move(s.x, s.y);
    await page.wait(30);
    return js(`return document.querySelector('.sch-tip').textContent;`);
  };
  const tipD3 = await pinTip('D3');
  const tipD5 = await pinTip('D5');
  const tipA0 = await pinTip('A0');
  console.log('      ' + [tipD3, tipD5, tipA0].join(' | '));
  assert(/ничего не подключено/.test(tipD3), 'свободный пин');
  assert(/красный канал/.test(tipD5), 'пин 5');
  assert(/A0/.test(tipA0), 'A0');
  ok('подсказка на пине Uno: подпись и что подключено');

  // Провод и деталь.
  const wireMid = await js(`const w = MapLab.CIRCUIT.wirePoints(MapLab.CIRCUIT.WIRES.find((w) => w.id === 'wb')); return { x: (w[1].x + w[2].x) / 2, y: w[1].y };`);
  const sw = await scr(wireMid.x, wireMid.y);
  await move(sw.x, sw.y);
  await page.wait(30);
  const hoverWire = await js(`return { tip: document.querySelector('.sch-tip').textContent, on: view.svg.querySelector('[data-item="wb"]').classList.contains('is-hover') };`);
  assert(/синий канал/.test(hoverWire.tip) && hoverWire.on, 'наведение на провод');
  await page.shot(SHOTS + 'schematic-hover-wire.png');
  const led = await js(`const r = view.svg.querySelector('[data-item="rgb"] .sch-core'); return { x: +r.getAttribute('cx'), y: +r.getAttribute('cy') };`);
  const sl = await scr(led.x, led.y);
  await move(sl.x, sl.y);
  await page.wait(30);
  const hoverPart = await js(`return { tip: document.querySelector('.sch-tip').textContent, on: view.svg.querySelector('[data-item="rgb"]').classList.contains('is-hover') };`);
  assert(/RGB-светодиод/.test(hoverPart.tip) && hoverPart.on, 'наведение на деталь');
  ok('наведение на провод и деталь: title и выделение (' + hoverWire.tip + ')');
  await move(5, 5);

  /* --- 5. API: setUpto, highlight, mark, setLabels, setStep. --- */
  const vis = () => js(`return [...view.svg.querySelectorAll('.sch-item')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.item);`);
  await js(`view.setUpto(0); return 1;`);
  assert.deepStrictEqual(await vis(), ['pot'], 'setUpto(0)');
  await js(`view.setUpto(9); return 1;`);
  const upto9 = await js(`return MapLab.CIRCUIT.ITEMS.slice(0, 10).map((i) => i.id).sort();`);
  assert.deepStrictEqual((await vis()).sort(), upto9, 'setUpto(9)');

  // При неполной сборке светодиод не светится, а цепь считается незамкнутой.
  await setState({ step: 1, pot: 1023 });
  await js(`view.setUpto(8); return 1;`);
  const off = await js(`return view.svg.querySelector('.sch-glow').getAttribute('opacity');`);
  assert.strictEqual(Number(off), 0, 'неполная сборка: свечения нет');
  await js(`view.setUpto(13); return 1;`);
  assert.strictEqual(Number(await js(`return view.svg.querySelector('.sch-glow').getAttribute('opacity');`)), 1, 'собрано: свечение есть');
  await js(`view.setUpto(null); return 1;`);
  await setState({ step: 3, pot: 512 });
  assert.strictEqual((await vis()).length, 20, 'setUpto(null)');
  ok('setUpto показывает только нужное, null возвращает всё, недособранный светодиод не горит');

  // Через MapLab.state: смена шага сбрасывает upto, значение ручки не сбрасывает ручной setUpto.
  await js(`view.setUpto(2); MapLab.set({ pot: 600 }); return 1;`);
  assert.strictEqual((await vis()).length, 3, 'изменение pot не сбросило setUpto');
  await setState({ step: 2, upto: null });
  assert.strictEqual((await vis()).length, 17, 'смена шага сбросила upto');
  await setState({ step: 3, pot: 512 });

  await js(`view.highlight('r2'); return 1;`);
  const hi = await js(`
    const op = (id) => getComputedStyle(view.svg.querySelector('[data-item="' + id + '"]')).opacity;
    return { r2: op('r2'), r3: op('r3'), wb: op('wb'), root: document.querySelector('.sch').classList.contains('has-hi') };
  `);
  await page.wait(220);
  const hi2 = await js(`
    const op = (id) => +getComputedStyle(view.svg.querySelector('[data-item="' + id + '"]')).opacity;
    return { r2: op('r2'), r3: op('r3'), wb: op('wb') };
  `);
  assert.strictEqual(hi2.r2, 1, 'выделенный не приглушён');
  assert(hi2.r3 < 0.5 && hi2.wb < 0.5, 'остальное приглушено');
  await page.shot(SHOTS + 'schematic-highlight.png');
  await js(`view.highlight(null); return 1;`);
  await page.wait(220);
  assert.strictEqual(await js(`return document.querySelector('.sch').classList.contains('has-hi');`), false, 'highlight(null)');
  ok('highlight выделяет одно и приглушает остальное, null снимает');

  await js(`view.mark('wa0', 'bad'); view.mark('r1', 'ok'); view.mark('btn', 'bad'); return 1;`);
  await page.wait(50);
  const marks = await js(`
    const d = (sel) => getComputedStyle(view.svg.querySelector(sel)).display;
    return {
      a: view.svg.querySelector('[data-item="wa0"]').dataset.mark,
      r: view.svg.querySelector('[data-item="r1"]').dataset.mark,
      badge: d('[data-item="wa0"] .sch-badge'),
      idle: d('[data-item="wb"] .sch-badge'),
      cross: d('[data-item="wa0"] .sch-badge-bad'),
      tick: d('[data-item="wa0"] .sch-badge-ok'),
    };
  `);
  assert.strictEqual(marks.a, 'bad');
  assert.strictEqual(marks.r, 'ok');
  assert.strictEqual(marks.idle, 'none');
  assert.notStrictEqual(marks.badge, 'none');
  assert.strictEqual(marks.tick, 'none');
  await page.shot(SHOTS + 'schematic-marks.png');
  await js(`view.mark('wa0', null); view.mark('r1', null); view.mark('btn', null); return 1;`);
  assert.strictEqual(await js(`return view.svg.querySelector('[data-item="wa0"]').dataset.mark;`), undefined, 'mark(null)');
  ok('mark ok/bad рисует отметку и значок, null снимает');

  const pills = () => js(`return [...view.svg.querySelectorAll('.sch-pill')].filter((e) => e.style.display !== 'none').map((e) => e.lastChild.textContent);`);
  await setState({ step: 0, pot: 512 });
  assert.deepStrictEqual(await pills(), ['A0 = 512'], 'подписи шага 1');
  await setState({ step: 1, pot: 767 });
  assert.deepStrictEqual(await pills(), ['A0 = 767', '191'], 'подписи шага 2');
  await setState({ step: 2, pot: 512 });
  assert.deepStrictEqual(await pills(), ['A0 = 512', '1100 Гц'], 'подписи шага 3');
  await setState({ step: 3, pot: 1023, soundMode: false });
  assert.deepStrictEqual(await pills(), ['A0 = 1023', '255'], 'подписи шага 4, свет');
  await setState({ soundMode: true });
  assert.deepStrictEqual(await pills(), ['A0 = 1023', '2000 Гц'], 'подписи шага 4, звук');
  await js(`view.setLabels(false); return 1;`);
  assert.deepStrictEqual(await pills(), [], 'setLabels(false)');
  await setState({ step: 1, pot: 0, soundMode: false });
  await js(`view.setLabels(true); return 1;`);
  assert.deepStrictEqual(await pills(), ['A0 = 0', '0'], 'на нуле яркость подписана');
  await js(`view.setUpto(8); return 1;`);
  assert.deepStrictEqual(await pills(), ['A0 = 0'], 'недособранный светодиод без подписи');
  await js(`view.setUpto(null); view.setLabels(false); return 1;`);
  await setState({ step: 3, pot: 1023, soundMode: true });
  await js(`view.setLabels(true); return 1;`);
  assert.strictEqual((await pills()).length, 2, 'setLabels(true)');
  await setState({ soundMode: false, pot: 512 });
  ok('подписи значений показываются только по делу, контрольные числа верные');

  /* --- 6. Подмена проводов и деталей, onPick. --- */
  const over = await js(`
    const C = MapLab.CIRCUIT;
    const box = document.createElement('div');
    box.id = 'over';
    box.style.width = '800px';
    document.body.appendChild(box);
    window.picks = [];
    const wires = C.WIRES.map((w) => (w.id === 'wa0' ? { ...w, to: 'a5' } : w)).concat([{ id: 'wx', from: 'a30', to: 'bn30', color: 'black', step: 0, title: 'Лишний провод' }]);
    const parts = { ...C.PARTS, r1: { ...C.PARTS.r1, legs: { a: 'g21', b: 'f21' } } };
    window.over = MapLab.createSchematic(box, { step: 3, live: false, interactive: false, labels: false, wires, parts, onPick: (id, kind) => window.picks.push(id + ':' + kind) });
    const q = (s) => window.over.svg.querySelector(s);
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.02;
    const end = q('[data-item="wa0"] [data-end="to"]');
    return {
      items: window.over.svg.querySelectorAll('.sch-item').length,
      moved: near({ x: +end.getAttribute('cx'), y: +end.getAttribute('cy') }, C.pos('a5')),
      extra: !!q('[data-item="wx"]'),
      knobRole: q('.sch-knob').getAttribute('role'),
      focusable: q('[data-item="wb"]').getAttribute('tabindex'),
      roleItem: q('[data-item="wb"]').getAttribute('role'),
      label: q('[data-item="wb"]').getAttribute('aria-label'),
      rotor: q('.sch-rotor').getAttribute('transform'),
    };
  `);
  assert.strictEqual(over.items, 21, '20 + лишний провод');
  assert(over.moved, 'провод в новом отверстии');
  assert(over.extra, 'лишний провод нарисован');
  assert.strictEqual(over.knobRole, null, 'interactive: false');
  assert.strictEqual(over.focusable, '0');
  assert.strictEqual(over.roleItem, 'button');
  assert(over.rotor.startsWith('rotate(0.'), 'без live ручка в среднем положении: ' + over.rotor);
  await page.wait(100);
  await page.shot(SHOTS + 'schematic-override.png', { full: true });

  // Настоящий клик по проводу и детали в подменённой схеме.
  const clickMm = async (x, y) => {
    const p = await js(`const q = new DOMPoint(${x}, ${y}).matrixTransform(window.over.svg.getScreenCTM()); return { x: q.x, y: q.y };`);
    await move(p.x, p.y);
    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
  };
  await js(`document.getElementById('over').scrollIntoView({ block: 'center', behavior: 'instant' }); return 1;`);
  await page.wait(100);
  await clickMm(wireMid.x, wireMid.y);
  const buzC = await posOf('f16');
  await clickMm(buzC.x, buzC.y + 3.8);
  await clickMm(knob.x, knob.y);
  await page.wait(50);
  assert.deepStrictEqual(await js(`return window.picks;`), ['wb:wire', 'buz:part', 'pot:part'], 'onPick');
  await js(`window.over.svg.querySelector('[data-item="wg"]').focus(); return 1;`);
  await page.key('Enter');
  assert.strictEqual(await js(`return window.picks[window.picks.length - 1];`), 'wg:wire', 'Enter выбирает');
  await js(`window.over.destroy(); document.getElementById('over').remove(); return 1;`);
  assert.strictEqual(await js(`return document.querySelectorAll('.sch').length;`), 1, 'destroy убрал вид');
  ok('wires и parts подменяются, onPick работает мышью и с клавиатуры, destroy чистит');

  // Живая схема с onPick: клик по ручке не считается выбором.
  await js(`document.getElementById('dev-picked').textContent = ''; window.scrollTo({ top: 0, behavior: 'instant' }); return 1;`);
  await setState({ step: 3 });
  await page.wait(60);
  const onKnob = await scr(knob.x, knob.y);
  await move(onKnob.x, onKnob.y);
  await mouse('mousePressed', onKnob.x, onKnob.y);
  await mouse('mouseReleased', onKnob.x, onKnob.y);
  await page.wait(80);
  assert.strictEqual(await js(`return document.getElementById('dev-picked').textContent;`), '', 'ручка не выбирается');
  const liveWire = await scr(wireMid.x, wireMid.y);
  await move(liveWire.x, liveWire.y);
  await mouse('mousePressed', liveWire.x, liveWire.y);
  await mouse('mouseReleased', liveWire.x, liveWire.y);
  await page.wait(80);
  assert.strictEqual(await js(`return document.getElementById('dev-picked').textContent;`), 'wire: wb', 'провод выбирается');
  ok('в живой схеме клик по ручке не считается выбором');

  /* --- 7. Свечение: видно, компактно, номера и отверстия рядом не меняются. Пиксели со снимка. --- */
  const areas = await js(`
    const C = MapLab.CIRCUIT;
    const g = view.svg.querySelector('.sch-glow');
    const d = { x: +g.getAttribute('cx'), y: +g.getAttribute('cy') };
    const numY = C.rowY(C.ROW_UNITS.a) + 2.75;
    const hole = (ref) => { const p = C.pos(ref); return { x: p.x, y: p.y, w: 1.4, h: 1.4 }; };
    return {
      dome: d,
      marks: {
        'номер 20': { x: C.colX(20), y: numY, w: 3.6, h: 2.2 },
        'номер 25': { x: C.colX(25), y: numY, w: 3.6, h: 2.2 },
        'отверстие c20': hole('c20'),
        'отверстие b20': hole('b20'),
        'отверстие a19': hole('a19'),
        'отверстие d19': hole('d19'),
        'рейка bn21': hole('bn21'),
        'рейка bn24': hole('bn24'),
      },
      light: { x: d.x - 4.4, y: d.y + 0.6, w: 1, h: 1 },
      far: { x: d.x - 11.5, y: d.y, w: 2.4, h: 8 },
    };
  `);
  const toPx = async (r) => {
    const a = await scr(r.x - r.w / 2, r.y - r.h / 2);
    const b = await scr(r.x + r.w / 2, r.y + r.h / 2);
    return { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) };
  };
  const boxes = {};
  for (const [name, r] of [...Object.entries(areas.marks), ['свет', areas.light], ['даль', areas.far]]) boxes[name] = await toPx(r);

  const sample = async (pot) => {
    await setState({ step: 1, pot });
    await page.wait(60);
    const g = await js(`const r = view.svg.querySelector('.sch-glow'); return { o: +r.getAttribute('opacity'), r: +r.getAttribute('r') };`);
    const a = await scr(areas.dome.x, areas.dome.y);
    const k = (await scr(areas.dome.x + 1, areas.dome.y)).x - a.x;
    const clip = { x: a.x - 34 * k, y: a.y - 18 * k, width: 54 * k, height: 34 * k, scale: 1 };
    const shot = await page.cmd('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(`${SHOTS}schematic-glow-${pot}.png`, Buffer.from(shot.data, 'base64'));
    const full = await page.cmd('Page.captureScreenshot', { format: 'png' });
    // Самый тёмный и средний пиксель в каждой рамке.
    const lum = await page.eval(`(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${full.data}';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const out = {};
      for (const [name, b] of Object.entries(${JSON.stringify(boxes)})) {
        const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
        let min = 255, sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += l;
          if (l < min) min = l;
        }
        out[name] = { min, mean: sum / (d.length / 4) };
      }
      return out;
    })()`);
    return { ...g, lum };
  };
  const g0 = await sample(0);
  const g127 = await sample(511);
  const g174 = await sample(699);
  const g255 = await sample(1023);
  assert.strictEqual(g0.o, 0, 'при 0 свечения нет');
  assert(g127.o > 0.5 && g255.o === 1 && g255.r > g127.r, 'при 127 и 255 свечение есть и растёт');
  assert(g255.r <= 10, 'свечение компактное: ' + g255.r);
  for (const g of [g127, g174, g255]) {
    for (const name of Object.keys(areas.marks)) {
      const delta = Math.abs(g.lum[name].min - g0.lum[name].min);
      assert(delta <= 6, `${name} при яркости ${g.o}: тёмный пиксель изменился на ${delta.toFixed(1)}`);
    }
    assert(Math.abs(g.lum['даль'].mean - g0.lum['даль'].mean) < 0.5, 'вдали от светодиода макетка не меняется');
  }
  const glowGain = g255.lum['свет'].mean - g0.lum['свет'].mean;
  assert(glowGain >= 8, 'свечение заметно на макетке: +' + glowGain.toFixed(1));
  ok(`свечение: opacity ${g0.o} / ${g127.o} / ${g255.o}, радиус ${g127.r} и ${g255.r} мм, ярче на ${glowGain.toFixed(1)}; номера и отверстия не смыты`);

  /* --- 8. Звук: дуги идут только при d.tone и быстрее на высокой частоте. --- */
  const waveSpeed = async (pot) => {
    await setState({ step: 2, pot });
    return js(`
      const w = view.svg.querySelector('.sch-wave');
      const seen = new Set();
      return new Promise((done) => {
        const t0 = performance.now();
        const tick = () => {
          seen.add(w.getAttribute('d'));
          if (performance.now() - t0 > 900) done({ frames: seen.size, opacity: w.getAttribute('opacity'), shown: getComputedStyle(view.svg.querySelector('.sch-waves')).display });
          else requestAnimationFrame(tick);
        };
        tick();
      });
    `);
  };
  const low = await waveSpeed(0);
  const high = await waveSpeed(1023);
  assert.notStrictEqual(low.shown, 'none', 'дуги видны');
  assert(low.frames > 1 && high.frames > 1, 'дуги двигаются');
  await setState({ step: 1 });
  assert.strictEqual(await js(`return getComputedStyle(view.svg.querySelector('.sch-waves')).display;`), 'none', 'без звука дуг нет');
  ok('дуги buzzer идут только при звуке');

  await setState({ step: 3, pot: 512, soundMode: false });
  console.log(`\nпроверок пройдено: ${passed}, ошибок страницы: ${page.errors.length}`);
};
