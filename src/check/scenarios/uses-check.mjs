/* Проверка раздела #uses: настоящая мышь и клавиатура, числа против MapLab.mapInt. */
const ids =['servo','park','screen','soil','stick','theremin'];
const assert = (ok, msg) => { if (!ok) throw new Error('ПРОВАЛ: ' + msg); };

// Всё читаем со страницы: диапазоны берём из показанной строки кода, а не из исходника.
const read = (page, id) => page.eval(`(() => {
  const c = document.getElementById('use-${id}');
  const code = c.querySelector('.use-code').textContent;
  const m = /map\\((\\w+), (-?\\d+), (-?\\d+), (-?\\d+), (-?\\d+)\\)/.exec(code);
  const live = /\\/\\/ \\w+ = (-?\\d+), \\w+ = (-?\\d+)/.exec(code);
  const num = (k) => Number(c.querySelector('[data-k="' + k + '"]').textContent.replace('−','-').match(/-?\\d+/)[0]);
  const input = c.querySelector('input');
  const args = m.slice(2).map(Number);
  const svg = c.querySelector('svg');
  const sig = [...svg.querySelectorAll('[data-k]')].filter(e => e.closest('svg') && !['x','y','lx','ly'].includes(e.dataset.k))
    .map(e => (e.getAttribute('style')||'') + '|' + (e.getAttribute('d')||'') + '|' + e.textContent.trim().slice(0,12)).join(';');
  return { x:+input.value, hudX:num('x'), hudY:num('y'), liveX:+live[1], liveY:+live[2], want:MapLab.mapInt(+input.value, ...args), args, sig, text:svg.querySelector('[data-k="y"]').textContent };
})()`);

const setV = (page, id, v) => page.eval(`(() => { const i = document.getElementById('use-${id}-range'); i.value = ${v}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);

function same(r, id) {
  assert(r.hudX === r.x && r.liveX === r.x, id + ': вход не совпал ' + JSON.stringify(r));
  assert(r.hudY === r.want && r.liveY === r.want, id + ': выход не совпал с mapInt ' + JSON.stringify(r));
}

async function dragAll(page, label) {
  for (const id of ids) {
    const before = await read(page, id);
    const box = await page.eval(`(() => { const i = document.getElementById('use-${id}-range'); i.scrollIntoView({block:'center',behavior:'instant'}); const r = i.getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height,min:+i.min,max:+i.max,v:+i.value}; })()`);
    await page.wait(60);
    const f = (box.v - box.min) / (box.max - box.min);
    const from = box.l + 12 + f * (box.w - 24);
    const to = box.l + box.w * (f > 0.5 ? 0.2 : 0.8);
    await page.drag(from, box.t + box.h/2, to, box.t + box.h/2, 12);
    await page.wait(40);
    const after = await read(page, id);
    same(after, id);
    assert(after.x !== before.x, id + ': мышь не сдвинула ползунок');
    assert(after.hudY !== before.hudY, id + ': число не поменялось');
    assert(after.sig !== before.sig, id + ': картинка не поменялась');
    console.log(label, id.padEnd(9), before.x, '->', after.x, ' выход', before.text, '->', after.text);
  }
}

export default async (page) => {
  await page.wait(500);

  // 1. Настоящая мышь на широком экране.
  await dragAll(page, '1440');

  // 2. Весь диапазон каждого ползунка против mapInt.
  for (const id of ids) {
    const { min, max } = await page.eval(`(() => { const i = document.getElementById('use-${id}-range'); return {min:+i.min,max:+i.max}; })()`);
    const step = Math.max(1, Math.round((max - min) / 40));
    for (let v = min; v <= max; v += step) { await setV(page, id, v); same(await read(page, id), id); }
    await setV(page, id, max); same(await read(page, id), id);
  }
  console.log('весь диапазон: числа совпали с mapInt на всех шести');

  // 3. Направления, которые нельзя перепутать.
  const at = async (id, v) => { await setV(page, id, v); return (await read(page, id)).hudY; };
  assert(await at('servo', 0) === 0 && await at('servo', 1023) === 180, 'серво 0–180');
  assert(await at('park', 5) === 50 && await at('park', 100) === 1000, 'парктроник: ближе чаще');
  assert(await at('screen', 0) === 20 && await at('screen', 1023) === 255, 'яркость 20–255');
  assert(await at('soil', 850) === 0 && await at('soil', 350) === 100, 'почва: сухо = большое число = 0%');
  assert(await at('stick', 0) === -255 && await at('stick', 1023) === 255, 'джойстик края');
  assert(await at('stick', 512) === 0, 'джойстик 512');
  assert(Math.abs(await at('stick', 511)) <= 1, 'джойстик 511 около нуля');
  const word511 = await page.eval("document.querySelector('#use-stick [data-k=word]').textContent");
  assert(await at('theremin', 5) === 2000 && await at('theremin', 50) === 200, 'терменвокс: ближе выше');
  console.log('направления верны; джойстик 511:', await at('stick', 511), word511, '| 512:', await at('stick', 512));

  // Картинка говорит то же, что числа: считаем то, что нарисовано, а не только подпись.
  const look = async (id, v, js) => { await setV(page, id, v); return page.eval(js); };
  const beeps = "document.querySelector('#use-park [data-k=beeps]').getAttribute('d').split('M').length - 1";
  const waves = "document.querySelector('#use-theremin [data-k=wave]').getAttribute('d').split('t').length";
  const shift = (id, k) => `new DOMMatrix(document.querySelector('#use-${id} [data-k=${k}]').style.transform).e`;
  const drops = "[...document.querySelectorAll('#use-soil [data-k=drops] path')].filter((p) => p.style.opacity === '1').length";
  const level = "document.querySelector('#use-soil [data-k=level]').style.transform";
  const word = "document.querySelector('#use-stick [data-k=word]').textContent";

  const beepNear = await look('park', 5, beeps); const carNear = await page.eval(shift('park', 'car'));
  const beepFar = await look('park', 100, beeps); const carFar = await page.eval(shift('park', 'car'));
  assert(beepNear > beepFar * 5, 'парктроник: у стены писков на ленте должно быть намного больше: ' + beepNear + ' и ' + beepFar);
  assert(carNear < carFar, 'парктроник: машина при 5 см должна стоять ближе к стене');
  const waveNear = await look('theremin', 5, waves); const handNear = await page.eval(shift('theremin', 'hand'));
  const waveFar = await look('theremin', 50, waves); const handFar = await page.eval(shift('theremin', 'hand'));
  assert(waveNear > waveFar * 5, 'терменвокс: рядом волна должна быть плотнее: ' + waveNear + ' и ' + waveFar);
  assert(handNear < handFar, 'терменвокс: рука при 5 см должна быть у датчика');
  assert(await look('soil', 850, drops) === 0 && /scaleY\(0\)/.test(await page.eval(level)), 'почва: при 850 капель и уровня быть не должно');
  assert(await look('soil', 350, drops) === 8 && /scaleY\(1\)/.test(await page.eval(level)), 'почва: при 350 шкала полная');
  assert(await look('stick', 512, word) === 'стоп', 'джойстик 512: стоп');
  assert(await look('stick', 1023, word) === 'вперёд' && await look('stick', 0, word) === 'назад', 'джойстик края: вперёд и назад');
  const arrowFlat = "!/m/.test(document.querySelector('#use-stick [data-k=arrow]').getAttribute('d'))";
  for (let v = 0; v <= 1023; v += 3) {
    const r = await look('stick', v, `[${word}, ${arrowFlat}]`);
    assert(r[0].includes('стоп') === r[1], 'джойстик ' + v + ': слово и стрелка расходятся: ' + r[0]);
  }
  const fine = await page.eval("document.querySelector('#use-stick .use-fine').textContent");
  assert(fine.includes('не ровно 512'), 'джойстик: нет пометки про настоящий центр');
  console.log('картинки: писков', beepNear, 'и', beepFar, ', волн', waveNear, 'и', waveFar, ', почва сухая и мокрая верны');

  // 4. Клавиатура.
  await page.eval("document.getElementById('use-servo-range').focus()");
  await setV(page, 'servo', 500);
  await page.key('ArrowRight');
  await page.wait(40);
  const k = await read(page, 'servo');
  assert(k.x === 501, 'клавиатура не двигает ползунок: ' + k.x);
  same(k, 'servo');
  console.log('клавиатура: ArrowRight 500 -> 501, угол', k.text);

  // 5. Анимация идёт только на экране.
  await page.eval(`window.__raf = 0; const __r = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { window.__raf++; return __r.call(window, f); };`);
  const waveAt = () => page.eval("document.querySelector('#use-theremin [data-k=wave]').getAttribute('transform')");
  const headAt = () => page.eval("document.querySelector('#use-park [data-k=head]').getAttribute('x')");
  const wheelAt = () => page.eval("document.querySelector('#use-stick [data-k=w1]').getAttribute('transform')");
  await setV(page, 'stick', 900);
  await page.eval("document.getElementById('use-theremin').scrollIntoView({block:'center',behavior:'instant'})");
  await page.wait(300);
  const w1 = await waveAt(); const wh1 = await wheelAt(); await page.wait(250); const w2 = await waveAt(); const wh2 = await wheelAt();
  assert(w1 !== w2, 'волна стоит на экране'); assert(wh1 !== wh2, 'колёса стоят на экране');
  await page.eval("document.getElementById('use-park').scrollIntoView({block:'center',behavior:'instant'})");
  await page.wait(200);
  const h1 = await headAt(); await page.wait(250); const h2 = await headAt();
  assert(h1 !== h2, 'лента писков стоит на экране');
  console.log('на экране: волна', w1, '->', w2, '; лента', h1, '->', h2);

  await page.eval("document.body.style.paddingBottom = '1500px'; scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})");
  await page.wait(300);
  const inView = await page.eval("[...document.querySelectorAll('.use-card')].filter(c => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(c => c.id)");
  assert(inView.length === 0, 'карточки всё ещё на экране: ' + inView);
  const r1 = await page.eval('window.__raf'); const off1 = await waveAt();
  await page.wait(400);
  const r2 = await page.eval('window.__raf'); const off2 = await waveAt();
  assert(r2 === r1, 'rAF продолжается вне экрана: ' + r1 + ' -> ' + r2);
  assert(off1 === off2, 'волна движется вне экрана');
  console.log('вне экрана: кадров за 400 мс', r2 - r1);

  await page.eval("document.body.style.paddingBottom = ''");
  // 6. reducedMotion: кадры не идут, картинка всё равно отвечает на ползунок.
  await page.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.eval("document.getElementById('use-theremin').scrollIntoView({block:'center',behavior:'instant'})");
  await page.wait(300);
  const rr1 = await page.eval('window.__raf'); const rw1 = await waveAt();
  await page.wait(400);
  const rr2 = await page.eval('window.__raf'); const rw2 = await waveAt();
  assert(rr2 - rr1 <= 1 && rw1 === rw2, 'анимация идёт при reducedMotion: ' + (rr2 - rr1));
  const a = await read(page, 'theremin'); await setV(page, 'theremin', 40); const b = await read(page, 'theremin');
  assert(a.sig !== b.sig, 'при reducedMotion картинка не отвечает'); same(b, 'theremin');
  console.log('reducedMotion: кадров', rr2 - rr1, ', картинка отвечает на ползунок');
  await page.cmd('Emulation.setEmulatedMedia', { features: [] });

  // 7. Узкий экран: настоящая мышь и никакого бокового скролла.
  await page.size(400, 800);
  await page.wait(300);
  await dragAll(page, ' 400');
  const wide = await page.eval(`(() => {
    const iw = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll('#uses *')].filter(e => !e.closest('svg') && !e.closest('.use-code') && !e.closest('.use-idea__code')).filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > iw + 0.5 || r.left < -0.5); }).map(e => e.tagName + '.' + e.className);
    const codes = [...document.querySelectorAll('.use-code,.use-idea__code')].filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent.slice(0, 40));
    return { sw: document.documentElement.scrollWidth, iw, bad, codes };
  })()`);
  console.log('400 px:', JSON.stringify(wide));
  assert(wide.sw <= wide.iw, 'боковой скролл на 400');
  assert(wide.bad.length === 0, 'элементы вылезают: ' + wide.bad);
};
