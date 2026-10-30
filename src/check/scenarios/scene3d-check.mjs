/* Короткая проверка 3D. Тяжёлая: запускать по одной, с DRIVE_WEBGL=1 и маленьким окном.
   DRIVE_WEBGL=1 nice -n 10 node check/drive.mjs scene3d/dev.html check/scenarios/scene3d-check.mjs 1000x640 */
import assert from 'node:assert';

const S = (process.env.SHOTS || '/tmp') + '/';

export default async (page) => {
  await page.wait(2000);
  assert.ok(await page.eval(`typeof view === 'object' && !!view.renderer`), 'нет сцены');
  await page.eval(`MapLab.set({ step: 3, pot: 767 }); 1`);
  await page.wait(1800);
  await page.shot(S + 's3d-iso.jpg');
  console.log('сцена:', await page.eval(`JSON.stringify({ вызовов: view.renderer.info.render.calls, треугольников: view.renderer.info.render.triangles, геометрий: view.renderer.info.memory.geometries, текстур: view.renderer.info.memory.textures })`));

  await page.eval(`window.__frames = 0; const r = view.renderer.render.bind(view.renderer); view.renderer.render = (...a) => { window.__frames++; r(...a); }; 1`);
  await page.wait(2000);
  const idle = await page.eval(`window.__frames`);
  console.log('кадров за 2 с простоя:', idle);
  assert.ok(idle <= 1, 'сцена рисует в простое');

  await page.eval(`MapLab.set({ pot: 0 }); 1`);
  await page.wait(600);
  assert.ok((await page.eval(`window.__frames`)) >= 1, 'смена ручки не вызвала кадр');
  await page.eval(`view.setCamera('top'); MapLab.set({ pot: 300 }); 1`);
  await page.wait(1800);
  await page.shot(S + 's3d-top.jpg');
  await page.eval(`view.setUpto(2); view.highlight('w5v'); 1`);
  await page.wait(600);
  await page.eval(`view.setUpto(null); view.highlight(null); view.setLabels(true); 1`);
  await page.wait(400);
  await page.eval(`view.destroy(); 1`);
  console.log('ok: кадры по требованию, камера, сборка, подписи, destroy');
};
