/* Проверка всей страницы настоящими кликами. Запуск: node check/drive.mjs <страница> check/scenarios/page-check.mjs 1440x900
   SHOTS — папка для скриншотов. */
import assert from 'node:assert';

const S = (process.env.SHOTS || '/tmp') + '/';
const ok = (name) => console.log('  ok  ' + name);

export default async (page) => {
  const js = (code) => page.eval(`(() => { ${code} })()`);
  await page.wait(800);

  assert.ok(await page.eval(`['hero','why','how','lab','uses','practice'].every((id) => document.getElementById(id))`));
  ok('все шесть разделов на месте');

  /* Шаг 1: Serial Monitor и живые значения. */
  await page.eval(`document.getElementById('wb-code').scrollIntoView({ block: 'center', behavior: 'instant' }); MapLab.set({ pot: 512 }); 1`);
  await page.wait(800);
  const serial = await js(`return document.getElementById('wb-serial-out').textContent;`);
  assert.ok(serial.includes('pot = 512   map = 127'), 'в Serial Monitor: ' + JSON.stringify(serial));
  await page.click('#wb-serial-pause');
  const frozen = await js(`return document.getElementById('wb-serial-out').textContent.length;`);
  await page.wait(500);
  assert.strictEqual(await js(`return document.getElementById('wb-serial-out').textContent.length;`), frozen);
  await page.click('#wb-serial-pause');
  await page.click('#wb-serial-clear');
  ok('шаг 1: Serial Monitor печатает верные числа, пауза и очистка работают');

  /* Полный экран схемы и кода. */
  await page.click('#wb-diagram [data-fs]');
  await page.wait(500);
  const box = await js(`const p = document.getElementById('wb-diagram'); const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, real: document.fullscreenElement === p, max: p.classList.contains('is-max'),
      stage: document.querySelector('.wb-stage').getBoundingClientRect().height, ctl: document.getElementById('wb-controls-diagram').getBoundingClientRect().bottom };`);
  assert.ok(box.real || box.max, 'панель не развернулась');
  assert.strictEqual(Math.round(box.w), box.iw);
  assert.strictEqual(Math.round(box.h), box.ih);
  assert.ok(box.ctl <= box.ih + 1, 'полоса управления ушла за экран');
  assert.ok(box.stage > box.ih * 0.55, 'схема слишком маленькая: ' + box.stage);
  await page.shot(S + 'full-diagram.jpg');
  await page.click('#wb-view-3d');
  await page.wait(300);
  await page.click('#wb-view-2d');
  await page.click('#wb-diagram [data-fs]');
  await page.wait(300);
  assert.ok(await js(`return !document.fullscreenElement && !document.querySelector('.panel.is-max');`), 'не вышли из полного экрана');
  ok(`схема на весь экран (${box.real ? 'Fullscreen API' : 'запасной режим'}), выход работает`);

  await page.click('#wb-code [data-fs]');
  await page.wait(500);
  const code = await js(`const p = document.getElementById('wb-code'); const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, size: parseFloat(getComputedStyle(document.getElementById('wb-code-view')).fontSize),
      slider: getComputedStyle(document.getElementById('wb-controls-code')).display, btns: [...p.querySelectorAll('.panel__bar .btn')].every((b) => { const q = b.getBoundingClientRect(); return q.right <= innerWidth && q.top >= 0 && q.height > 0; }) };`);
  assert.strictEqual(Math.round(code.w), code.iw);
  assert.ok(code.size >= 20, 'код мелкий: ' + code.size);
  assert.notStrictEqual(code.slider, 'none');
  assert.ok(code.btns, 'кнопки панели кода не видны');
  await page.shot(S + 'full-code.jpg');
  await page.click('#wb-code [data-fs]');
  await page.wait(300);
  ok(`код на весь экран, шрифт ${code.size}px, ползунок виден`);

  /* Запасной режим, если Fullscreen API запрещён. */
  await page.eval(`Element.prototype.requestFullscreen = () => Promise.reject(new Error('нельзя')); 1`);
  await page.click('#wb-code [data-fs]');
  await page.wait(200);
  assert.ok(await js(`return document.getElementById('wb-code').classList.contains('is-max');`));
  await page.key('Escape');
  await page.wait(150);
  assert.ok(await js(`return !document.querySelector('.panel.is-max');`));
  ok('запасной полный экран и выход по Esc');

  /* Шаг 3: звук включается только по кнопке. */
  await page.click('[data-wb-step="2"]');
  assert.ok(await js(`return MapLab.state.audio === false && document.querySelector('#wb-controls-diagram [data-audio]').hidden === false;`));
  await page.click('#wb-controls-diagram [data-audio]');
  assert.ok(await js(`return MapLab.state.audio === true;`));
  await page.click('[data-wb-step="1"]');
  assert.ok(await js(`return MapLab.state.audio === false && MapLab.sim(MapLab.state).tone === null;`));
  ok('звук только по кнопке, выход на шаг 2 выключает его');

  /* Шаг 4: режимы. */
  await page.click('[data-wb-step="3"]');
  await page.eval(`MapLab.set({ pot: 767 }); 1`);
  await page.wait(100);
  const before = await js(`return MapLab.sim(MapLab.state);`);
  assert.strictEqual(before.led, 191);
  assert.strictEqual(before.tone, null);
  await page.click('#wb-controls-diagram [data-press]');
  await page.wait(150);
  const after = await js(`return { d: MapLab.sim(MapLab.state), serial: document.getElementById('wb-serial-out').textContent,
    dim: document.querySelectorAll('#wb-code-view .is-dim').length, pressed: MapLab.state.pressed };`);
  assert.strictEqual(after.d.tone, 1549);
  assert.strictEqual(after.d.led, 0);
  assert.ok(after.serial.includes('mode: SOUND'), after.serial);
  assert.ok(after.dim > 3);
  assert.strictEqual(after.pressed, false);
  ok('шаг 4: кнопка меняет режим, 1549 Гц, Serial печатает режим, ветка приглушена');
  await page.shot(S + 'lab.jpg');

  /* Сборка по деталям. */
  await page.click('#wb-asm-next');
  await page.wait(100);
  assert.ok((await js(`return document.getElementById('wb-asm-text').textContent;`)).includes('1 из 3'));
  await page.click('#wb-asm-next');
  assert.ok(await js(`return document.querySelectorAll('.wb-list li')[1].classList.contains('is-current');`));
  await page.click('#wb-asm-all');
  assert.ok((await js(`return document.getElementById('wb-asm-text').textContent;`)).includes('целиком'));
  ok('сборка: Дальше, Показать всё');
  await page.eval(`MapLab.set({ step: 0, soundMode: false, upto: null, pot: 512 }); 1`);

  /* Задания: по одному верному ответу каждого типа и один неверный. */
  const score = () => js(`return Number(document.getElementById('pr-solved').textContent);`);
  assert.strictEqual(await score(), 0);
  const fill = (sel, value) => js(`const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);

  await fill('#pr-in-w1', '40');
  await page.click('#pr-word form [type=submit]');
  assert.ok((await js(`return document.querySelector('#pr-word .pr-fb').className;`)).includes('is-no'));
  await fill('#pr-in-w1', '50');
  await page.click('#pr-word form [type=submit]');
  assert.strictEqual(await score(), 1);
  ok('числовая задача: неверный ответ подсказывает, верный считается');

  await js(`document.querySelectorAll('#pr-fill .pr-blank').forEach((b, i) => { b.value = ['0', '1023', '0', '255'][i]; }); return 1;`);
  await page.click('#pr-fill .btn--primary');
  assert.strictEqual(await score(), 2);

  await fill('#pr-line-c5', 'int percent = map(potValue, 0, 100, 0, 1023);');
  await page.click('#pr-write form [type=submit]');
  assert.ok((await js(`return document.querySelector('#pr-write .pr-fb').textContent;`)).includes('перепутаны'));
  await fill('#pr-line-c5', 'int percent = map(pot, 0, 1023, 0, 100)');
  await page.click('#pr-write form [type=submit]');
  assert.strictEqual(await score(), 3);
  ok('пропуски и строка кода: проверка по смыслу, сообщение об ошибке понятное');

  await js(`[...document.querySelectorAll('#pr-bug .pr-line')].find((b) => b.textContent.includes('digitalRead')).click(); return 1;`);
  assert.strictEqual(await score(), 4);

  await js(`const list = document.querySelector('#pr-order .pr-order'); [...list.children].sort((a, b) => a.dataset.index - b.dataset.index).forEach((li) => list.appendChild(li)); return 1;`);
  await page.click('#pr-order .btn--primary');
  assert.strictEqual(await score(), 5);

  const order = await js(`const b = document.querySelector('#pr-order .pr-row .pr-mini'); return !!b;`);
  assert.ok(order);
  await js(`[...document.querySelectorAll('#pr-proj .btn')].find((b) => b.textContent.includes('Получилось')).click(); return 1;`);
  assert.strictEqual(await score(), 6);
  ok('поиск ошибки, порядок строк, доработка');

  /* Схема с ошибкой: неверный клик, затем верный провод. */
  await page.wait(100);
  await js(`document.querySelector('#pr-fault [data-item="wa0"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 1;`);
  await js(`document.querySelector('#pr-fault [data-item="w5v"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1;`);
  await page.wait(120);
  const wrong = await js(`return document.querySelector('#pr-fault .pr-fb').className;`);
  await js(`document.querySelector('#pr-fault [data-item="wa0"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1;`);
  await page.wait(120);
  console.log('      неверный клик:', wrong, '| счёт', await score());
  assert.strictEqual(await score(), 7);
  await page.shot(S + 'fault.jpg');
  ok('ошибка на схеме находится кликом по проводу');

  await js(`const s = document.getElementById('pr-mark-v7'); s.value = 500; s.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await page.click('#pr-mark .btn--primary');
  assert.strictEqual(await score(), 8);

  await fill('#pr-scale-v11-inMin', '120');
  await fill('#pr-scale-v11-inMax', '900');
  await page.click('#pr-scale .btn--primary');
  assert.strictEqual(await score(), 9);

  await js(`document.querySelectorAll('#pr-graph .pr-graph-opt')[1].click(); return 1;`);
  assert.strictEqual(await score(), 10);

  await js(`const L = [...document.querySelectorAll('#pr-pairs .pr-col:first-child .pr-opt')]; const R = [...document.querySelectorAll('#pr-pairs .pr-col:last-child .pr-opt')];
    const want = ['0–1023', '0–255', '0–180', '0–100', '200–2000'];
    L.forEach((b, i) => { b.click(); R.find((r) => r.textContent === want[i]).click(); }); return 1;`);
  assert.strictEqual(await score(), 11);
  ok('метка, шкала, график, пары');

  /* Новая задача после листания и счёт после перезагрузки. */
  await js(`[...document.querySelectorAll('#pr-word .btn')].find((b) => b.textContent.includes('Следующая')).click(); return 1;`);
  assert.ok(await js(`return !!document.getElementById('pr-in-w2');`));
  await page.eval(`location.reload(); 1`);
  await page.wait(1200);
  assert.strictEqual(await score(), 11);
  await page.click('#pr-reset');
  await page.click('#pr-reset');
  assert.strictEqual(await score(), 0);
  ok('счёт сохраняется после перезагрузки, сброс работает');

  /* Тёмная тема и телефон. */
  await page.eval(`document.documentElement.dataset.theme = 'dark'; 1`);
  await page.wait(200);
  await page.eval(`document.getElementById('practice').scrollIntoView({ behavior: 'instant' }); 1`);
  await page.wait(200);
  await page.shot(S + 'dark-practice.jpg');
  await page.eval(`document.documentElement.dataset.theme = 'light'; 1`);

  await page.size(400, 800);
  await page.wait(400);
  const over = await js(`const w = document.documentElement.clientWidth; const bad = [...document.querySelectorAll('main *, header *')].filter((e) => {
      if (e.closest('.sch-scroll, .wb-codebody, .pr-code, .pr-row__text, .topbar__nav, svg')) return false;
      const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; }).slice(0, 6).map((e) => e.tagName + '.' + e.className);
    return { scroll: document.documentElement.scrollWidth, w, bad };`);
  console.log('      400 px:', JSON.stringify(over));
  assert.ok(over.scroll <= over.w, 'страница скроллится вбок на телефоне');
  await page.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); 1`);
  await page.wait(200);
  await page.shot(S + 'phone-lab.jpg');
  ok('на 400 px нет горизонтального скролла');
};
