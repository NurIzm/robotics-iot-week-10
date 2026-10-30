/* build.js — собирает страницу из модулей.
   node build.js                    → dist/urok-10-map.html (офлайн, всё внутри) и dist/artifact.html (для публикации)
   node build.js --only a,b --out f → только перечисленные модули в один файл f (для отладки) */
const fs = require('fs');
const path = require('path');
const here = __dirname;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
};
const only = flag('--only') ? flag('--only').split(',') : null;
const outOverride = flag('--out');

const MODULES = ['schematic', 'scene3d', 'workbench', 'explain', 'uses', 'practice'];
const active = only ? MODULES.filter((m) => only.includes(m)) : MODULES;

const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const maybe = (p) => (fs.existsSync(path.join(here, p)) ? read(p) : '');

function assertInlineSafe(name, text) {
  if (/<\/script/i.test(text)) throw new Error(name + ' содержит </script и сломает страницу при вставке');
}

const css = ['base.css', ...active.map((m) => `${m}/${m}.css`)].map(maybe).join('\n');
const scripts = [
  'core.js', 'circuit.js', 'sketches.js', 'widgets.js',
  ...active.map((m) => `${m}/${m}.js`),
  'boot.js',
]
  .filter((p) => fs.existsSync(path.join(here, p)))
  .map((p) => {
    const js = read(p);
    assertInlineSafe(p, js);
    return `<script>\n${js}\n</script>`;
  })
  .join('\n');

const body = read('shell.html').replace(/<!--INCLUDE (.+?)-->/g, (_, file) => {
  const mod = file.split('/')[0];
  return active.includes(mod) ? maybe(file) : '';
});

const three = read('vendor/three.min.js');
const orbit = read('vendor/OrbitControls.js');
assertInlineSafe('three', three);
assertInlineSafe('orbit', orbit);

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..800&family=JetBrains+Mono:wght@400..700&family=Unbounded:wght@500..800&display=swap">';

const TITLE = '<title>Музыкальный регулятор</title>';

function offlinePage() {
  const fontCss = maybe('vendor/fonts-inline.css');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
${TITLE}
<style>${fontCss}</style>
<style>${css}</style>
</head>
<body>
${body}
<script>${three}</script>
<script>${orbit}</script>
${scripts}
</body>
</html>
`;
}

function artifactPage() {
  return `${TITLE}
<meta name="claude:viewport-fit-sides" content="cover">
${FONT_LINK}
<style>${css}</style>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
${scripts}
`;
}

if (outOverride) {
  fs.writeFileSync(outOverride, offlinePage());
  console.log('собрано:', outOverride, Math.round(fs.statSync(outOverride).size / 1024) + ' КБ');
} else {
  const dist = path.join(here, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'urok-10-map.html'), offlinePage());
  fs.writeFileSync(path.join(dist, 'artifact.html'), artifactPage());
  for (const f of ['urok-10-map.html', 'artifact.html']) {
    console.log('собрано:', f, Math.round(fs.statSync(path.join(dist, f)).size / 1024) + ' КБ');
  }
}
