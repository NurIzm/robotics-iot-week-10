const S = (process.env.SHOTS || '/tmp') + '/';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'да  ' : 'НЕТ ') + m); if (!c) fails++; };
export default async (page) => {
  const reload = async () => { await page.cmd('Page.reload', {}); await page.wait(250); };

  // Анимация идёт и не трогает состояние.
  await reload();
  const mid = await page.eval(`[Number(document.querySelector('#hero input').value), MapLab.state.pot]`);
  ok(mid[0] < 512 && mid[1] === 512, `анимация идёт мимо состояния: ползунок ${mid[0]}, state ${mid[1]}`);

  // Прерывание мышью во время анимации.
  await reload();
  const box = JSON.parse(await page.eval(`(() => { const r = document.querySelector('#hero input').getBoundingClientRect(); return JSON.stringify({l:r.left,w:r.width,y:r.top+r.height/2}); })()`));
  await page.drag(box.l + box.w * 0.1, box.y, box.l + box.w * 0.85, box.y, 4);
  await page.wait(1900);
  const after = await page.eval(`[Number(document.querySelector('#hero input').value), MapLab.state.pot, document.querySelector('#hero .ruler--out .ruler__value').textContent]`);
  ok(after[0] === after[1] && after[0] > 780, `касание прервало анимацию и не откатилось: ползунок ${after[0]}, state ${after[1]}, результат ${after[2]}`);
  ok(Number(after[2]) === await page.eval(`MapLab.mapInt(${after[0]},0,1023,0,255)`), 'результат после прерывания совпадает с mapInt');

  // Движение ручки из другого вида останавливает анимацию.
  await reload();
  await page.eval(`MapLab.set({pot: 100})`);
  await page.wait(1800);
  ok(await page.eval(`document.querySelector('#hero input').value`) === '100', 'внешнее изменение pot останавливает анимацию');

  // Смена шага не мешает анимации и не сбивает значение.
  await reload();
  await page.eval(`MapLab.set({step: 2})`);
  await page.wait(1800);
  ok(await page.eval(`document.querySelector('#hero input').value`) === '512', 'смена шага не влияет на героя');
  ok(await page.eval(`document.querySelector('#hero .ruler--out .ruler__value').textContent`) === '127', 'яркость героя не зависит от шага');

  // prefers-reduced-motion.
  await page.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await reload();
  ok(await page.eval(`MapLab.reducedMotion()`), 'reducedMotion включён');
  ok(await page.eval(`document.querySelector('#hero input').value`) === '512', 'при reducedMotion анимации нет, сразу 512');
  await page.cmd('Emulation.setEmulatedMedia', { features: [] });

  // Клавиатура: порядок и видимый фокус.
  await reload();
  await page.wait(1600);
  await page.eval(`(document.activeElement || document.body).blur(); window.scrollTo(0,0)`);
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await page.key('Tab');
    seen.push(await page.eval(`(() => { const a = document.activeElement; return a.id || a.textContent.trim().slice(0, 14) || a.tagName; })()`));
    if (seen.at(-1).startsWith('ruler-')) {
      const o = await page.eval(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor; })()`);
      ok(/solid 3px/.test(o), 'фокус на ползунке героя виден: ' + o);
      await page.shot(S + 'explain-focus.png');
      await page.key('ArrowRight');
      ok(await page.eval(`MapLab.state.pot`) === 513, 'стрелка на ползунке героя');
    }
    if (seen.length > 8 && seen.at(-1) === 'ex-why-pot') break;
  }
  console.log('Tab: ' + seen.join(' > '));
  ok(seen.includes('ex-why-pot'), 'до ползунка #why можно дойти с клавиатуры');

  // Длинные слова в Unbounded.
  for (const [w, h] of [[400, 800], [360, 740], [320, 640]]) {
    await page.size(w, h);
    await page.wait(150);
    const r = JSON.parse(await page.eval(`(() => {
      const cw = document.documentElement.clientWidth; const bad = []; let n = 0;
      document.querySelectorAll('main h1, main h2, main .ruler__value, main .ex-bench__num, main .ex-pot__value, main .ex-block__num').forEach((e) => {
        if (!getComputedStyle(e).fontFamily.includes('Unbounded')) return; n++;
        const rg = document.createRange(); rg.selectNodeContents(e);
        const b = rg.getBoundingClientRect();
        if (b.right > cw - 8 || b.left < 8) bad.push(e.textContent.trim().slice(0, 20) + ' ' + Math.round(b.left) + '-' + Math.round(b.right));
      });
      return JSON.stringify({ cw, sw: document.documentElement.scrollWidth, n, bad });
    })()`));
    ok(r.bad.length === 0 && r.sw <= r.cw, `ширина ${w}: ${r.n} крупных надписей, вылезло ${r.bad.length} ${r.bad.join('; ')}, скролл ${r.sw}/${r.cw}`);
  }
  if (fails) throw new Error('есть провалы: ' + fails);
};
