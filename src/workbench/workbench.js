/* workbench.js — раздел #lab: шаги проекта, схема 2D/3D, код с живыми значениями, Serial Monitor, сборка. */
(function () {
  'use strict';
  const ML = window.MapLab;
  const { CIRCUIT: C, SKETCHES, highlight, esc, on, set, press, state, mapInt, copyText, store, sim } = ML;
  const root = document.getElementById('lab');
  if (!root) return;
  const $ = (id) => document.getElementById(id);

  const code = (s) => '<code>' + esc(s) + '</code>';
  const atBright = (pot) => mapInt(pot, 0, 1023, 0, 255);
  const atFreq = (pot) => mapInt(pot, 0, 1023, 200, 2000);

  /* Тексты шагов. Числа считает mapInt, чтобы они не разошлись с платой. */
  const TEXT = [
    {
      what: 'Поворот ручки плавно меняет напряжение на средней ножке потенциометра: от 0 до 5 вольт. Эта ножка подключена к пину A0, а Arduino превращает напряжение в число от 0 до 1023. Функция map() переводит это число на шкалу от 0 до 255. Пока мы никуда его не отправляем, только смотрим в Serial Monitor.',
      notes: [
        [code('analogRead(potPin)'), 'читает напряжение на A0 и выдаёт число от 0 до 1023.'],
        [code('map(potValue, 0, 1023, 0, 255)'), 'переводит это число на шкалу от 0 до 255.'],
        [code('Serial.print') + ' и ' + code('Serial.println'), 'печатают числа на экран компьютера. println ещё и переходит на новую строку.'],
        [code('delay(200)'), 'делает паузу 0,2 секунды, иначе числа побегут слишком быстро.'],
      ],
      tries: [
        'Поверни ручку до упора влево: будет pot = 0 и map = 0. До упора вправо: pot = 1023 и map = 255.',
        `Поставь ручку на 256. В Serial Monitor будет map = ${atBright(256)}: примерно четверть шкалы.`,
        `Поставь на 512. Получится ${atBright(512)}, а не 128, потому что map() отбрасывает дробную часть.`,
      ],
    },
    {
      what: 'Теперь число от map() идёт на светодиод. Пин с волной ~ не умеет выдавать половину напряжения. Он очень быстро включается и выключается, а глазу кажется, что светодиод горит слабее. При 255 он включён всё время, при 127 примерно половину времени. Этот приём называется ШИМ.',
      notes: [
        [code('pinMode(redPin, OUTPUT)'), 'говорит, что пин будет выходом.'],
        [code('analogWrite(redPin, brightness)'), 'задаёт яркость от 0 до 255. Работает только на пинах с волной ~.'],
        ['Три строки ' + code('analogWrite'), 'дают красному, зелёному и синему одинаковую яркость. Вместе они выглядят белым светом.'],
      ],
      tries: [
        'Поверни ручку на ноль: светодиод погас. До упора вправо: горит на полную.',
        `Поставь ручку на 767: яркость ${atBright(767)}, три четверти шкалы.`,
        'Поставь // в начале строки analogWrite(greenPin, brightness); и загрузи код снова. Останутся красный и синий, и свет станет пурпурным.',
      ],
    },
    {
      what: 'Потенциометр и map() те же, а шкала другая: от 200 до 2000. Это частота в герцах: сколько раз в секунду дрожит пластинка внутри buzzer. Чем больше частота, тем выше звук.',
      notes: [
        [code('map(potValue, 0, 1023, 200, 2000)'), 'переводит положение ручки в частоту. Шкала начинается с 200, а не с нуля.'],
        [code('tone(buzzerPin, frequency)'), 'запускает звук и сразу идёт дальше. Звук не прекратится сам.'],
        ['Повторный ' + code('tone'), 'на том же пине просто меняет частоту, поэтому высота следует за ручкой.'],
      ],
      tries: [
        `Ручка на нуле: ${atFreq(0)} Гц. Ручка на максимуме: ${atFreq(1023)} Гц.`,
        `Поставь на 512: ${atFreq(512)} Гц. Сравни с серединой шкалы: (200 + 2000) / 2 = 1100.`,
        'На нуле звук всё равно есть. Как думаешь, почему? Подсказка: что вернёт map(0, 0, 1023, 200, 2000)?',
      ],
    },
    {
      what: 'Один потенциометр, два режима. Кнопка выбирает, куда идёт значение: на яркость или на частоту. В режиме света buzzer молчит, в режиме звука светодиод погашен. Часть кода, которая сейчас не выполняется, показана бледным.',
      notes: [
        [code('INPUT_PULLUP'), 'подтягивает пин к 5V внутри Arduino. Кнопка не нажата: HIGH. Нажата: пин соединён с GND и читается LOW.'],
        [code('pressed && !wasPressed'), 'кнопка нажата сейчас и не была нажата в прошлый раз. Поэтому условие срабатывает один раз, в момент нажатия. Иначе режим менялся бы всё время, пока держишь кнопку.'],
        [code('soundMode = !soundMode'), 'меняет false на true и обратно.'],
        [code('setBrightness(value)'), 'наша функция. С ней три строки analogWrite не нужно писать дважды.'],
        [code('noTone(buzzerPin)'), 'выключает звук, когда мы вернулись в режим света.'],
      ],
      tries: [
        `Режим «Свет», ручка на 767: яркость ${atBright(767)}, звука нет.`,
        `Нажми кнопку: тот же поворот ручки теперь даёт ${atFreq(767)} Гц, а светодиод погас.`,
        'Держи кнопку нажатой: режим поменялся один раз и больше не меняется.',
      ],
    },
  ];

  const READS = [
    [{ name: 'Потенциометр', cls: 'is-in', val: (d) => d.pot }, { name: 'map()', cls: 'is-out', val: (d) => d.mapped }],
    [{ name: 'Потенциометр', cls: 'is-in', val: (d) => d.pot }, { name: 'Яркость', cls: 'is-out', val: (d) => d.mapped }],
    [{ name: 'Потенциометр', cls: 'is-in', val: (d) => d.pot }, { name: 'Частота', cls: 'is-out', val: (d) => d.freq + ' Гц' }],
    [
      { name: 'Потенциометр', cls: 'is-in', val: (d) => d.pot },
      { name: 'Режим', cls: '', val: (d) => (d.soundMode ? 'Звук' : 'Свет') },
      { name: (d) => (d.soundMode ? 'Частота' : 'Яркость'), cls: 'is-out', val: (d) => (d.soundMode ? d.freq + ' Гц' : d.mapped) },
    ],
  ];

  /* --- Шаги --- */
  const stepsBox = $('wb-steps');
  C.STEPS.forEach((st) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wb-step';
    b.dataset.wbStep = st.id;
    b.innerHTML = '<b>' + (st.id + 1) + '</b><span>' + esc(st.short) + '</span>';
    b.addEventListener('click', () => goStep(st.id));
    stepsBox.appendChild(b);
  });

  function goStep(n) {
    if (n === state.step) return;
    set({ step: n, upto: null, soundMode: false, pressed: false, audio: n >= 2 ? state.audio : false });
  }

  /* --- Схема: 2D сразу, 3D при первом открытии --- */
  const views = [];
  const view2d = ML.createSchematic ? ML.createSchematic($('wb-2d'), { step: state.step, live: true, interactive: true, labels: true }) : null;
  if (view2d) views.push(view2d);
  let view3d = null;
  let labels = store.get('wb.labels', true);
  let cursor = null; // номер детали в сборке текущего шага, null — показана вся схема

  function open3d(on3d) {
    $('wb-2d').hidden = on3d;
    $('wb-3d').hidden = !on3d;
    $('wb-view-2d').setAttribute('aria-pressed', String(!on3d));
    $('wb-view-3d').setAttribute('aria-pressed', String(on3d));
    $('wb-cams').hidden = !on3d;
    if (!on3d) return;
    if (!view3d && ML.createScene3D) {
      view3d = ML.createScene3D($('wb-3d'), { step: state.step });
      view3d.setLabels(labels);
      views.push(view3d);
      syncAssembly();
    }
    if (view3d) view3d.resize();
  }
  $('wb-view-2d').addEventListener('click', () => open3d(false));
  $('wb-view-3d').addEventListener('click', () => open3d(true));
  $('wb-cams').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (b && view3d) view3d.setCamera(b.dataset.cam);
  });
  const paintLabels = () => $('wb-labels').setAttribute('aria-pressed', String(labels));
  $('wb-labels').addEventListener('click', () => {
    labels = !labels;
    store.set('wb.labels', labels);
    views.forEach((v) => v.setLabels(labels));
    paintLabels();
  });
  if (view2d) view2d.setLabels(labels);
  paintLabels();

  root.addEventListener('lab:fullchange', () => {
    if (view3d) requestAnimationFrame(() => view3d.resize());
  });

  /* --- Сборка --- */
  const itemsOfStep = (step) => C.ITEMS.map((it, i) => Object.assign({ index: i }, it)).filter((it) => it.step === step);

  function syncAssembly() {
    const list = itemsOfStep(state.step);
    const it = cursor == null ? null : list[cursor];
    views.forEach((v) => {
      v.setUpto(it ? it.index : null);
      v.highlight(it ? it.id : null);
    });
    $('wb-asm-text').innerHTML = it
      ? '<b>' + (cursor + 1) + ' из ' + list.length + '.</b> ' + esc(it.instr)
      : 'Схема показана целиком. «Дальше» соберёт её по одной детали.';
    $('wb-asm-prev').disabled = cursor == null;
    $('wb-asm-next').disabled = cursor === list.length - 1;
    $('wb-asm-all').disabled = cursor == null;
    root.querySelectorAll('.wb-list li').forEach((li, i) => li.classList.toggle('is-current', i === cursor));
  }

  function goAssembly(pos) {
    cursor = pos;
    syncAssembly();
  }
  $('wb-asm-prev').addEventListener('click', () => goAssembly(cursor > 0 ? cursor - 1 : null));
  $('wb-asm-next').addEventListener('click', () => goAssembly(cursor == null ? 0 : cursor + 1));
  $('wb-asm-all').addEventListener('click', () => goAssembly(null));

  function renderList(step) {
    const box = $('wb-list');
    box.innerHTML = '';
    itemsOfStep(step).forEach((it, pos) => {
      const wire = C.WIRES.find((w) => w.id === it.id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wb-item';
      const dot = wire ? '<i class="wb-dot" style="background:' + C.WIRE_COLORS[wire.color].hex + '"></i>' : '<i class="wb-dot wb-dot--part"></i>';
      b.innerHTML = dot + '<span>' + esc(it.instr) + '</span>';
      b.addEventListener('click', () => goAssembly(cursor === pos ? null : pos));
      li.appendChild(b);
      box.appendChild(li);
    });
  }

  /* --- Код --- */
  const codeView = $('wb-code-view');
  let lines = [];
  let liveRows = [];
  let dimRows = [];

  function renderCode(step) {
    const sk = SKETCHES[step];
    const src = sk.code.replace(/\n$/, '').split('\n');
    lines = src;
    codeView.innerHTML = src
      .map((line, i) =>
        '<div class="wb-line" data-line="' + i + '"><span class="wb-ln" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="wb-src">' + (highlight(line) || ' ') + '</span></div>')
      .join('');
    const rows = codeView.children;
    const find = (text, from) => src.findIndex((l, i) => i >= (from || 0) && l.includes(text));
    liveRows = (sk.live || []).map((rule) => {
      const row = rows[find(rule.find)];
      const chip = document.createElement('span');
      chip.className = 'wb-live';
      row.appendChild(chip);
      return { chip, rule };
    });
    dimRows = (sk.dim || []).map((rule) => {
      const a = find(rule.from);
      const b = find(rule.to, a + 1);
      return { rows: [...rows].slice(a + 1, b), rule };
    });
    $('wb-file').textContent = sk.file;
  }

  function paintCode(d) {
    liveRows.forEach(({ chip, rule }) => {
      const text = rule.text(d);
      if (chip.textContent !== text) chip.textContent = text;
      chip.hidden = !text;
    });
    dimRows.forEach(({ rows, rule }) => {
      const off = rule.when(d);
      rows.forEach((r) => r.classList.toggle('is-dim', off));
    });
  }

  $('wb-copy').addEventListener('click', (e) => copyText(SKETCHES[state.step].code, e.currentTarget));

  let fontStep = store.get('wb.font', 0);
  function paintFont() {
    $('wb-code').style.setProperty('--wb-font-scale', 1 + fontStep * 0.12);
    $('wb-font-down').disabled = fontStep <= -2;
    $('wb-font-up').disabled = fontStep >= 6;
  }
  const changeFont = (delta) => {
    fontStep += delta;
    store.set('wb.font', fontStep);
    paintFont();
  };
  $('wb-font-down').addEventListener('click', () => changeFont(-1));
  $('wb-font-up').addEventListener('click', () => changeFont(1));
  paintFont();

  /* --- Serial Monitor --- */
  const MAX_LINES = 60;
  const out = $('wb-serial-out');
  let serial = [];
  let paused = false;
  let serialTimer = null;
  let codeOnScreen = true;

  function printLine(text) {
    if (paused) return;
    serial.push(text);
    if (serial.length > MAX_LINES) serial.shift();
    out.textContent = serial.join('\n');
    out.scrollTop = out.scrollHeight;
  }
  function clearSerial() {
    serial = [];
    out.textContent = '';
  }
  function runSerial() {
    clearInterval(serialTimer);
    const sk = SKETCHES[state.step];
    if (!sk.serial || !codeOnScreen) return;
    serialTimer = setInterval(() => {
      if (!document.hidden) printLine(sk.serial(sim(state)));
    }, sk.serialMs);
  }
  $('wb-serial-pause').addEventListener('click', (e) => {
    paused = !paused;
    e.currentTarget.setAttribute('aria-pressed', String(paused));
    e.currentTarget.textContent = paused ? 'Продолжить' : 'Пауза';
  });
  $('wb-serial-clear').addEventListener('click', clearSerial);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((seen) => {
      codeOnScreen = seen[seen.length - 1].isIntersecting;
      runSerial();
    }).observe($('wb-code'));
  }

  /* --- Управление: одинаковая полоса под схемой и под кодом --- */
  function buildControls(box, id) {
    box.innerHTML =
      '<div class="wb-pot"><label for="' + id + '-pot">Двигай ручку потенциометра</label>' +
      '<input class="range" id="' + id + '-pot" type="range" min="0" max="1023" step="1"></div>' +
      '<div class="wb-reads" data-reads></div>' +
      '<div class="wb-actions">' +
      '<button class="btn" type="button" data-press hidden>Нажать кнопку</button>' +
      '<button class="btn" type="button" data-audio hidden>Включить звук</button></div>';
    const range = box.querySelector('input');
    range.addEventListener('input', () => set({ pot: Number(range.value) }));

    const btn = box.querySelector('[data-press]');
    btn.addEventListener('pointerdown', () => press(true));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, () => press(false)));
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(true);
    });
    btn.addEventListener('keyup', () => press(false));

    box.querySelector('[data-audio]').addEventListener('click', () => set({ audio: !state.audio }));
    return { box, range, reads: box.querySelector('[data-reads]'), btn, audio: box.querySelector('[data-audio]'), shown: [] };
  }
  const controls = [buildControls($('wb-controls-diagram'), 'wb-d'), buildControls($('wb-controls-code'), 'wb-c')];

  function renderReads(step) {
    controls.forEach((c) => {
      c.reads.innerHTML = '';
      c.shown = READS[step].map((r) => {
        const el = document.createElement('div');
        el.className = 'wb-read';
        el.innerHTML = '<span></span><b class="' + r.cls + '"></b>';
        c.reads.appendChild(el);
        return { r, name: el.firstChild, value: el.lastChild };
      });
      c.btn.hidden = step !== 3;
      c.audio.hidden = step < 2;
    });
  }

  function paintControls(s, d) {
    controls.forEach((c) => {
      if (Number(c.range.value) !== s.pot) c.range.value = s.pot;
      c.range.style.setProperty('--fill', (s.pot / 1023) * 100 + '%');
      c.shown.forEach(({ r, name, value }) => {
        const label = typeof r.name === 'function' ? r.name(d) : r.name;
        const text = String(r.val(d));
        if (name.textContent !== label) name.textContent = label;
        if (value.textContent !== text) value.textContent = text;
      });
      c.audio.textContent = s.audio ? 'Выключить звук' : 'Включить звук';
      c.audio.setAttribute('aria-pressed', String(s.audio));
    });
  }

  /* --- Текстовая часть шага --- */
  function renderText(step) {
    const st = C.STEPS[step];
    const t = TEXT[step];
    $('wb-task-label').textContent = 'Шаг ' + (step + 1) + ' из 4';
    $('wb-task').textContent = st.task;
    $('wb-what').textContent = t.what;
    $('wb-notes').innerHTML = t.notes.map(([head, body]) => '<li>' + head + ': ' + esc(body) + '</li>').join('');
    $('wb-try').innerHTML = t.tries.map((x) => '<li>' + esc(x) + '</li>').join('');
    stepsBox.querySelectorAll('.wb-step').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wbStep) === step)));
  }

  function renderBom() {
    $('wb-bom').innerHTML = C.BOM.map(
      (it) => '<li><span>' + esc(it.name) + '</span><b>' + it.qty + ' шт.</b></li>'
    ).join('');
  }

  /* --- Всё вместе --- */
  let shownStep = -1;
  let shownMode = null;

  on((s, d) => {
    if (s.step !== shownStep) {
      shownStep = s.step;
      shownMode = null;
      cursor = null;
      const sk = SKETCHES[s.step];
      const hasSerial = Boolean(sk.serial || sk.serialOnMode);
      $('wb-serial').hidden = !hasSerial;
      renderText(s.step);
      renderCode(s.step);
      renderList(s.step);
      renderReads(s.step);
      views.forEach((v) => v.setStep(s.step));
      syncAssembly();
      clearSerial();
      runSerial();
    }
    paintCode(d);
    paintControls(s, d);
    const sk = SKETCHES[s.step];
    if (sk.serialOnMode) {
      if (shownMode !== null && shownMode !== d.soundMode) printLine(sk.serialOnMode(d));
      shownMode = d.soundMode;
    }
  });

  renderBom();

  document.addEventListener('keydown', (e) => {
    if (!/^[1-4]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const box = root.getBoundingClientRect();
    if (box.top < innerHeight && box.bottom > 0) goStep(Number(e.key) - 1);
  });
})();
