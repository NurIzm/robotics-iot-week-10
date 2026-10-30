/* Настоящие действия мышью и клавиатурой. Все числа на экране сравниваются с MapLab.mapInt. */
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('НЕВЕРНО: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: на экране ${JSON.stringify(a)}, ждали ${JSON.stringify(b)}`);
const text = (page, sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).textContent.trim()`);

async function setField(page, id, value) {
  await page.eval(`(() => { const f = document.getElementById('${id}'); f.scrollIntoView({block:'center', behavior:'instant'}); f.focus(); f.value = ''; })()`);
  await page.cmd('Input.insertText', { text: String(value) });
  await page.eval(`document.getElementById('${id}').blur()`);
}

async function heroAgrees(page, label) {
  const r = await page.eval(`JSON.stringify({
    x: document.querySelector('#hero .ruler--in .ruler__value').textContent,
    y: document.querySelector('#hero .ruler--out .ruler__value').textContent,
    call: document.getElementById('ex-hero-call').textContent,
    slider: document.querySelector('#hero input').value,
    glow: document.getElementById('hero').style.getPropertyValue('--glow'),
    state: MapLab.state.pot,
    why: document.getElementById('ex-why-pot-value').textContent,
    whyInput: document.getElementById('ex-why-pot').value,
    raw: document.getElementById('ex-why-raw').textContent,
    mapped: document.getElementById('ex-why-map').textContent,
    pit: document.getElementById('ex-pit-pot').value,
  })`);
  const o = JSON.parse(r);
  const x = Number(o.x);
  const y = await page.eval(`MapLab.mapInt(${x}, 0, 1023, 0, 255)`);
  eq(o.y, String(y), label + ': результат героя');
  eq(o.call, `map(${x}, 0, 1023, 0, 255) = ${y}`, label + ': строка вызова героя');
  eq(o.slider, String(x), label + ': ползунок героя');
  eq(o.state, x, label + ': MapLab.state.pot');
  eq(o.glow, Math.sqrt(y / 255).toFixed(3), label + ': свечение');
  eq(o.why, String(x), label + ': #why значение');
  eq(o.whyInput, String(x), label + ': #why ползунок');
  eq(o.raw, String(await page.eval(`MapLab.pwmBits(${x})`)), label + ': без map()');
  eq(o.mapped, String(y), label + ': с map()');
  eq(o.pit, String(x), label + ': камни ползунок');
  return x;
}

async function labAgrees(page, label) {
  const r = await page.eval(`(() => {
    const v = (id) => Number(document.getElementById(id).value);
    const p = [v('ex-lab-x'), v('ex-lab-in-min'), v('ex-lab-in-max'), v('ex-lab-out-min'), v('ex-lab-out-max')];
    const y = MapLab.mapInt(...p);
    return JSON.stringify({ p, y,
      call: document.getElementById('ex-lab-call').textContent,
      out: document.querySelector('#ex-lab .ruler--out .ruler__value').textContent,
      x: document.querySelector('#ex-lab .ruler--in .ruler__value').textContent,
      steps: document.getElementById('ex-hand-steps').textContent,
      end: (document.querySelector('.ex-calc__end code') || {}).textContent,
      math: document.getElementById('ex-hand-math').textContent,
      notes: document.getElementById('ex-lab-notes').textContent,
      hiddenRulers: document.getElementById('ex-lab-rulers').hidden,
      dead: !document.getElementById('ex-lab-dead').hidden,
    });
  })()`);
  const o = JSON.parse(r);
  if (o.y === null) {
    ok(o.dead, label + ': нет объяснения про деление на ноль');
    ok(o.hiddenRulers, label + ': шкалы должны скрыться');
    ok(o.call.endsWith('нет результата'), label + ': строка вызова ' + o.call);
    return o;
  }
  ok(!o.dead, label + ': лишнее объяснение');
  eq(o.call, `map(${o.p.join(', ')}) = ${o.y}`, label + ': строка вызова');
  eq(o.out.replace(/\s*(Гц|%)$/, ''), String(o.y), label + ': шкала результата');
  eq(o.x, String(o.p[0]), label + ': шкала значения');
  eq(o.end, `map(${o.p.join(', ')}) = ${o.y}`, label + ': итог разбора');
  // Пересчёт по шагам независимо от страницы: умножение, целое деление, сложение.
  const [x, a, b, c, d] = o.p;
  const m = (s) => s.replace(/-/g, '−');
  const prod = (x - a) * (d - c);
  const q = Math.trunc(prod / (b - a));
  eq(q + c, o.y, label + ': шаги дают результат mapInt');
  ok(o.steps.includes(m(`= ${prod}`)), label + ': в разборе нет произведения ' + prod + ' / ' + o.steps);
  ok(o.steps.includes(m(`${q} + `)), label + ': в разборе нет целой части ' + q);
  ok(o.steps.includes(`= ${m(String(o.y))}`), label + ': в разборе нет ответа ' + o.y);
  // Заметка не врёт про выход за шкалу, в алгебре нет деления на ноль, прямая проходит через концы шкал.
  const past = o.y < Math.min(c, d) || o.y > Math.max(c, d);
  eq(o.notes.includes('вышел за шкалу'), past, label + ': заметка про выход за шкалу');
  ok(!/\/ 0(?![\d,])/.test(o.math), label + ': деление на ноль в алгебре: ' + o.math);
  const line = /y = (−?[\d,]+)…? · x(?: ([+−]) ([\d,]+)…?)?/.exec(o.math);
  ok(line, label + ': нет уравнения прямой: ' + o.math);
  if (line) {
    const num = (s) => Number(s.replace('−', '-').replace(',', '.'));
    const K = num(line[1]);
    const B = line[2] ? (line[2] === '−' ? -1 : 1) * num(line[3]) : 0;
    const near = (X, Y) => Math.abs(K * X + B - Y) <= 0.0002 * Math.abs(X) + 0.02;
    ok(near(a, c), `${label}: прямая y = ${K}x + ${B} не проходит через (${a}, ${c})`);
    ok(near(b, d), `${label}: прямая y = ${K}x + ${B} не проходит через (${b}, ${d})`);
  }
  return o;
}

export default async (page) => {
  await page.wait(300);
  const during = await page.eval(`Number(document.querySelector('#hero input').value)`);
  await page.wait(1800);
  eq(await page.eval(`Number(document.querySelector('#hero input').value)`), 512, 'анимация заканчивается на 512');
  ok(during < 512, 'анимация ещё шла через 300 мс: ' + during);
  eq(await page.eval(`MapLab.state.pot`), 512, 'анимация не меняет MapLab.state');
  await heroAgrees(page, 'старт');

  // Перетаскивание настоящей мышью.
  const box = JSON.parse(await page.eval(`(() => { window.scrollTo({top:0,behavior:'instant'}); const r = document.querySelector('#hero input').getBoundingClientRect(); return JSON.stringify({l:r.left,w:r.width,y:r.top+r.height/2}); })()`));
  const at = (f) => box.l + box.w * f;
  await page.drag(at(0.5), box.y, at(0.2), box.y);
  await page.wait(50);
  const x1 = await heroAgrees(page, 'тянем влево');
  ok(x1 > 120 && x1 < 280, 'ползунок после перетаскивания: ' + x1);
  await page.drag(at(0.2), box.y, at(0.75), box.y);
  await page.wait(50);
  const x2 = await heroAgrees(page, 'тянем вправо');
  ok(x2 > 680 && x2 < 860, 'ползунок после перетаскивания: ' + x2);
  await page.eval(`document.querySelector('#hero input').focus()`);
  await page.key('ArrowRight');
  await page.key('ArrowRight');
  await page.wait(50);
  eq(await heroAgrees(page, 'клавиатура'), x2 + 2, 'стрелка вправо');

  // Контрольные числа.
  for (const [p, y] of [[0, 0], [256, 63], [512, 127], [767, 191], [1023, 255]]) {
    await page.eval(`MapLab.set({pot:${p}})`);
    eq(await text(page, '#hero .ruler--out .ruler__value'), String(y), 'контрольное число ' + p);
    await heroAgrees(page, 'контроль ' + p);
  }

  // График: перетаскивание по самому графику и отметка текущего положения.
  await page.eval(`MapLab.set({pot:512})`);
  const chart = JSON.parse(await page.eval(`(() => { const s = document.querySelector('#ex-why-chart svg'); s.scrollIntoView({block:'center',behavior:'instant'}); const r = s.getBoundingClientRect(); return JSON.stringify({l:r.left,w:r.width,t:r.top,h:r.height}); })()`));
  const k = chart.w / 420;
  const px = (v) => chart.l + (40 + (v / 1023) * 370) * k;
  await page.drag(px(100), chart.t + chart.h / 2, px(300), chart.t + chart.h / 2);
  await page.wait(50);
  const pot = await heroAgrees(page, 'график');
  ok(Math.abs(pot - 300) <= 3, 'перетаскивание по графику: ' + pot);
  const geo = await page.eval(`(() => { const s = document.querySelector('#ex-why-chart svg');
    const raw = s.querySelector('.ex-chart__raw').getAttribute('d').split(/[ML]/).filter(Boolean);
    const map = s.querySelector('.ex-chart__map').getAttribute('d').split(/[ML]/).filter(Boolean);
    const dip = raw.filter((p, i) => i && Number(p.split(' ')[1]) > Number(raw[i-1].split(' ')[1]) + 50).length;
    return JSON.stringify({ n: raw.length, m: map.length, dip, teeth: s.querySelectorAll('.ex-chart__num').length,
      legend: [...document.querySelectorAll('.ex-legend li')].map(l => l.textContent) }); })()`);
  const g = JSON.parse(geo);
  eq(g.n, 1024, 'точек на пиле'); eq(g.m, 1024, 'точек на ровной линии');
  eq(g.dip, 3, 'резких падений пилы между 4 зубцами'); eq(g.teeth, 4, 'подписей зубцов');
  ok(/четыре раза проходит от 0 до 255/.test(g.legend[0]), 'подпись про четыре прохода');

  // #why: круги и биты.
  for (const p of [0, 255, 256, 300, 511, 512, 767, 768, 1023]) {
    await page.eval(`MapLab.set({pot:${p}})`);
    const b = JSON.parse(await page.eval(`JSON.stringify({ bits: [...document.querySelectorAll('.ex-bit b')].map(e=>e.textContent).join(''), eq: document.getElementById('ex-bits-eq').textContent, laps: document.getElementById('ex-why-laps').textContent, tooth: document.getElementById('ex-bits-tooth').textContent })`));
    eq(b.bits, p.toString(2).padStart(10, '0'), 'биты ' + p);
    eq(b.eq, `${p} & 255 = ${p & 255}`, 'строка битов ' + p);
    ok(b.laps.includes('остаток: ' + (p & 255)) || p < 256, 'круги ' + p + ': ' + b.laps);
    ok(b.tooth.endsWith('зубец ' + (Math.floor(p / 256) + 1) + '.'), 'зубец ' + p + ': ' + b.tooth);
  }

  // Лаборатория: наборы.
  const names = await page.eval(`JSON.stringify([...document.querySelectorAll('#ex-lab .ex-sets button')].map(b=>b.textContent))`);
  for (const name of JSON.parse(names)) {
    const sel = await page.eval(`(() => { const b = [...document.querySelectorAll('#ex-lab .ex-sets button')].find(b => b.textContent === ${JSON.stringify(name)}); return '#' + b.parentNode.id + ' button:nth-child(' + ([...b.parentNode.children].indexOf(b) + 1) + ')'; })()`);
    await page.click(sel);
    await page.wait(30);
    eq(await page.eval(`[...document.querySelectorAll('#ex-lab .ex-sets button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent).join()`), name, 'нажатый набор');
    await labAgrees(page, name);
  }
  await page.click('#ex-lab-sets button:nth-child(1)');
  await page.wait(30);
  await setField(page, 'ex-lab-x', 512);

  // Контрольные числа наборов.
  const expect = [['Яркость 0–255', '127'], ['Частота 200–2000', '1100 Гц'], ['Серво 0–180', '90'], ['Проценты 0–100', '50 %'], ['Наоборот 255–0', '128']];
  for (const [name, val] of expect) {
    await page.eval(`[...document.querySelectorAll('#ex-lab-sets button')].find(b => b.textContent === ${JSON.stringify(name)}).click()`);
    eq(await page.eval(`document.getElementById('ex-lab-x').value`), '512', 'значение при смене набора');
    eq(await text(page, '#ex-lab .ruler--out .ruler__value'), val, name);
  }

  // Ввод параметров настоящими символами.
  const cases = [
    [1200, 0, 1023, 0, 255], [-50, 0, 1023, 0, 255], [512, 1023, 0, 0, 255], [512, 1023, 0, 255, 0], [512, 0, 1023, 255, 0],
    [0, -100, 100, -50, 50], [-30, -100, -10, 5, -5], [7, 0, 10, 0, 3], [-7, 0, 10, 0, 3], [1, 0, 3, 0, -1], [20000, -20000, 20000, -20000, 20000],
    [5, 5, 5, 0, 255], [100, 3, 3, 1, 2], [512, 0, 1023, 7, 7],
    [1024, 0, 1023, 0, 255], [-1, 0, 1023, 0, 255], [1200, 0, 1023, 7, 7], [100, 0, 1023, 255, 0], [30, 5, 100, 50, 1000], [600, 850, 350, 0, 100],
    [-19999, -20000, 20000, -20000, 19999],
  ];
  const ids = ['ex-lab-x', 'ex-lab-in-min', 'ex-lab-in-max', 'ex-lab-out-min', 'ex-lab-out-max'];
  for (const c of cases) {
    for (let i = 0; i < 5; i++) await setField(page, ids[i], c[i]);
    await page.wait(20);
    await labAgrees(page, 'ввод ' + c.join(','));
    if (c[1] === c[2]) eq(await page.eval(`MapLab.mapInt(${c.join(',')})`), null, 'mapInt вернул null');
    const noScroll = await page.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
    ok(noScroll, 'горизонтальный скролл при ' + c.join(','));
  }

  // Ползунок лаборатории мышью.
  await page.click('#ex-lab-sets button:nth-child(2)');
  await page.wait(30);
  const lb = JSON.parse(await page.eval(`(() => { const i = document.querySelector('#ex-lab-rulers input'); i.scrollIntoView({block:'center',behavior:'instant'}); const r = i.getBoundingClientRect(); return JSON.stringify({l:r.left,w:r.width,y:r.top+r.height/2}); })()`));
  await page.drag(lb.l + lb.w * 0.5, lb.y, lb.l + lb.w * 0.8, lb.y);
  await page.wait(30);
  const o = await labAgrees(page, 'ползунок лаборатории');
  ok(o.p[0] > 700 && o.p[0] < 900, 'значение после перетаскивания: ' + o.p[0]);

  // Неверный ввод.
  await page.eval(`(() => { const f = document.getElementById('ex-lab-x'); f.scrollIntoView({block:'center',behavior:'instant'}); f.focus(); f.value = ''; })()`);
  await page.cmd('Input.insertText', { text: '1.5' });
  await page.wait(20);
  ok(await page.eval(`!document.getElementById('ex-lab-hint').hidden`), 'подсказка при дробном вводе');
  eq(await page.eval(`document.getElementById('ex-lab-x').getAttribute('aria-invalid')`), 'true', 'поле отмечено');
  await page.eval(`document.getElementById('ex-lab-x').blur()`);
  await page.wait(20);
  ok(await page.eval(`document.getElementById('ex-lab-hint').hidden`), 'подсказка уходит');
  await labAgrees(page, 'после неверного ввода');
  await setField(page, 'ex-lab-x', 99999);
  await page.wait(20);
  await labAgrees(page, 'после слишком большого числа');

  // Подводные камни.
  for (const p of [0, 100, 128, 129, 200, 300, 512, 800, 900, 1023]) {
    await page.eval(`MapLab.set({pot:${p}})`);
    const v = JSON.parse(await page.eval(`JSON.stringify(Object.fromEntries(['ex-pit-cut','ex-edge-raw','ex-edge-bits','ex-edge-safe','ex-long-prod','ex-long-ok','ex-long-wrap','ex-long-bad','ex-volt-map','ex-volt-real','ex-volt-milli'].map(id => [id, document.getElementById(id).textContent])))`));
    const map = (...a) => page.eval(`MapLab.mapInt(${a.join(',')})`);
    eq(v['ex-pit-cut'], String(await map(p, 0, 1023, 0, 255)), 'камень 1, ' + p);
    const raw = await map(p, 200, 800, 0, 255);
    eq(v['ex-edge-raw'], String(raw).replace('-', '−'), 'камень 2, ' + p);
    eq(v['ex-edge-bits'], String(raw & 255), 'камень 2, биты ' + p);
    eq(v['ex-edge-safe'], String(Math.min(255, Math.max(0, raw))), 'камень 2, constrain ' + p);
    eq(v['ex-long-prod'], String(p * 255), 'камень 3, произведение ' + p);
    const wrap = ((p * 255) << 16) >> 16;
    eq(v['ex-long-wrap'], String(wrap).replace('-', '−'), 'камень 3, int ' + p);
    eq(v['ex-long-bad'], String(Math.trunc(wrap / 1023)).replace('-', '−'), 'камень 3, ответ int ' + p);
    eq(v['ex-volt-map'], (await map(p, 0, 1023, 0, 5)) + ' В', 'камень 4, ' + p);
    eq(v['ex-volt-real'], ((p * 5) / 1023).toFixed(2).replace('.', ',') + ' В', 'камень 4, вольты ' + p);
    eq(v['ex-volt-milli'], (await map(p, 0, 1023, 0, 5000)) + ' мВ', 'камень 4, милливольты ' + p);
  }
  eq(await page.eval(`[...document.querySelectorAll('#ex-zones-short .ex-zones__bar span')].map(s => s.textContent).join('|')`), '0341|1341|2341|', 'зоны 1023');
  eq(await page.eval(`[...document.querySelectorAll('#ex-zones-even .ex-zones__bar span')].map(s => s.textContent).join('|')`), '0256|1256|2256|3256', 'зоны 1024');

  // Блок 1: тест на 40 вопросов.
  eq(await text(page, '#ex-test-call'), 'map(30, 0, 40, 0, 100) = 75', 'тест');
  await page.eval(`(() => { const i = document.querySelector('#ex-test-rulers input'); i.value = 10; i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  eq(await text(page, '#ex-test-call'), 'map(10, 0, 40, 0, 100) = 25', 'тест после ползунка');

  console.log(`проверок ${checks}, неверных ${fails}`);
  if (fails) throw new Error('есть расхождения');
};
