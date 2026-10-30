/* drive.mjs — управляет настоящим браузером (headless Brave с WebGL) по протоколу DevTools.
   Сценарий — обычный .mjs с default-экспортом async (page) => {…}.

     node check/drive.mjs <файл.html или URL> <сценарий.mjs> [ширинаxвысота]

   page.eval(js)            выполнить выражение на странице, вернуть значение (await работает)
   page.shot(path, {full})  скриншот, full: true — вся страница
   page.size(w, h)          размер окна
   page.wait(ms)            пауза
   page.click(selector)     настоящий клик мышью по центру элемента
   page.drag(x1,y1,x2,y2)   перетаскивание мышью
   page.key(key)            нажатие клавиши, например 'Escape'
   page.errors              ошибки консоли и исключения страницы (в конце печатаются сами)

   Бережём ноутбук: браузер только один, запускается при свободной памяти, закрывается при любом
   исходе, а через DRIVE_LIMIT секунд (по умолчанию 90) сторож убивает его принудительно.
   WebGL тяжёлый (SwiftShader считает на процессоре), он включается только с DRIVE_WEBGL=1.
   Скриншот с расширением .jpg намного меньше PNG. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [target, scenario, sizeArg] = process.argv.slice(2);
if (!target || !scenario) {
  console.error('Использование: node check/drive.mjs <файл|URL> <сценарий.mjs> [1440x900]');
  process.exit(2);
}
const [W, H] = (sizeArg || '1440x900').split('x').map(Number);
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(resolve(target)).href;

const MIN_FREE_MB = 3000;
const LIMIT_S = Number(process.env.DRIVE_LIMIT || 90);
const LOCK = join(tmpdir(), 'maplab-drive.lock');

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (existsSync(LOCK) && isAlive(Number(readFileSync(LOCK, 'utf8')))) {
  console.error('Браузер уже занят другой проверкой, дождись её конца.');
  process.exit(4);
}
const freeMb = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024;
if (freeMb < MIN_FREE_MB) {
  console.error(`Свободно только ${Math.round(freeMb)} МБ памяти, браузер не запускаю.`);
  process.exit(5);
}
writeFileSync(LOCK, String(process.pid));

const graphics = process.env.DRIVE_WEBGL === '1'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--disable-software-rasterizer'];

const profile = mkdtempSync(join(tmpdir(), 'drive-'));
const browser = spawn(
  'brave-browser',
  ['--headless=new', '--no-sandbox', '--disable-gpu', ...graphics, '--mute-audio', '--autoplay-policy=no-user-gesture-required',
   '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync',
   '--renderer-process-limit=1', '--js-flags=--max-old-space-size=768',
   `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--remote-debugging-port=0', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'], detached: true } // своя группа процессов: закрываем её целиком
);

function closeBrowser() {
  try { process.kill(-browser.pid, 'SIGKILL'); } catch {}
  try { rmSync(LOCK, { force: true }); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('exit', closeBrowser);
['SIGTERM', 'SIGINT', 'SIGHUP'].forEach((sig) => process.on(sig, () => process.exit(130)));
process.on('uncaughtException', (e) => { console.error(e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(String(e)); process.exit(1); });

// Сторож переживёт даже kill -9 этого скрипта: браузер не останется работать в одиночку.
spawn('sh', ['-c',
  `i=0; while kill -0 ${process.pid} 2>/dev/null && [ $i -lt ${LIMIT_S} ]; do sleep 1; i=$((i+1)); done; ` +
  `kill -9 -${browser.pid} 2>/dev/null; rm -rf "$1" "$2"`, 'sh', profile, LOCK],
  { detached: true, stdio: 'ignore' }).unref();
setTimeout(() => { console.error(`Проверка дольше ${LIMIT_S} с, останавливаю.`); process.exit(6); }, LIMIT_S * 1000);

const wsUrl = await new Promise((ok, fail) => {
  let log = '';
  const t = setTimeout(() => fail(new Error('браузер не запустился')), 20000);
  browser.stderr.on('data', (d) => {
    log += d;
    const m = /DevTools listening on (ws:\S+)/.exec(log);
    if (m) { clearTimeout(t); ok(m[1]); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((ok) => (ws.onopen = ok));
let seq = 0;
const pending = new Map();
const handlers = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { ok, fail } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result);
  } else if (m.method) {
    (handlers.get(m.method) || []).forEach((fn) => fn(m.params));
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const listen = (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]);

const { targetInfos } = await send('Target.getTargets');
const tab = targetInfos.find((t) => t.type === 'page');
const { sessionId } = await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
const cmd = (method, params) => send(method, params, sessionId);

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Log.enable');

const errors = [];
listen('Runtime.exceptionThrown', (p) => errors.push('исключение: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
listen('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
});
listen('Log.entryAdded', (p) => {
  if (p.entry.level === 'error' && !/favicon|fonts\.g/.test(p.entry.url || '')) errors.push('лог: ' + p.entry.text + ' ' + (p.entry.url || ''));
});

const size = (w, h) => cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await size(W, H);

const loaded = new Promise((ok) => listen('Page.loadEventFired', ok));
await cmd('Page.navigate', { url });
await Promise.race([loaded, new Promise((ok) => setTimeout(ok, 15000))]);

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function evaluate(expression) {
  const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function center(selector) {
  const box = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
    e.scrollIntoView({block:'center', behavior:'instant'}); const r = e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  if (!box) throw new Error('нет элемента: ' + selector);
  return box;
}

const mouse = (type, x, y, extra = {}) => cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });

const page = {
  errors,
  eval: evaluate,
  wait,
  size,
  async shot(path, { full = false } = {}) {
    const params = /\.jpe?g$/i.test(path)
      ? { format: 'jpeg', quality: 72, captureBeyondViewport: full }
      : { format: 'png', captureBeyondViewport: full };
    if (full) {
      const { contentSize } = await cmd('Page.getLayoutMetrics');
      params.clip = { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 };
    }
    const { data } = await cmd('Page.captureScreenshot', params);
    writeFileSync(path, Buffer.from(data, 'base64'));
  },
  async click(selector) {
    const { x, y } = await center(selector);
    await mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 });
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
  },
  async drag(x1, y1, x2, y2, steps = 10) {
    await mouse('mouseMoved', x1, y1, { button: 'none', clickCount: 0 });
    await mouse('mousePressed', x1, y1);
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, { buttons: 1 });
    }
    await mouse('mouseReleased', x2, y2);
  },
  async key(key) {
    const code = { Escape: 27, Enter: 13, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Tab: 9, ' ': 32 }[key];
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code });
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
  },
  center,
  cmd,
};

let code = 0;
try {
  const mod = await import(pathToFileURL(resolve(scenario)).href);
  await mod.default(page);
} catch (e) {
  console.error('сценарий упал:', e.message);
  code = 1;
}
if (errors.length) {
  console.error('Ошибки страницы:\n' + errors.join('\n'));
  code = code || 3;
}
process.exit(code);
