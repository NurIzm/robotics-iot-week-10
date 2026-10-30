/* core.js — общая математика, виртуальная Arduino, звук, полноэкранный режим, подсветка кода. */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});

  /* Как map() в ядре Arduino (WMath.cpp): только целые, дробь отбрасывается к нулю,
     границы не проверяются. Равные inMin и inMax на настоящей плате дают мусор,
     здесь — null, чтобы интерфейс мог это объяснить. */
  function mapInt(x, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) return null;
    return Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin)) + outMin;
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /* Что выдаёт analogWrite на Uno R3: регистр ШИМ 8-битный, лишние биты теряются. */
  const pwmBits = (value) => value & 255;

  /* --- Виртуальная Arduino: одно состояние на все виды. --- */
  const state = { step: 0, pot: 512, soundMode: false, pressed: false, audio: false, upto: null };
  const listeners = new Set();

  function sim(s) {
    const pot = s.pot;
    const mapped = mapInt(pot, 0, 1023, 0, 255);
    const freq = mapInt(pot, 0, 1023, 200, 2000);
    const soundMode = s.step === 3 && s.soundMode;
    let led = 0;
    let tone = null;
    if (s.step === 1) led = mapped;
    if (s.step === 2) tone = freq;
    if (s.step === 3) {
      if (soundMode) tone = freq;
      else led = mapped;
    }
    return { step: s.step, pot, mapped, freq, led, tone, soundMode, pressed: s.pressed, volts: (pot * 5) / 1023 };
  }

  function set(patch) {
    Object.assign(state, patch);
    const d = sim(state);
    listeners.forEach((fn) => fn(state, d));
  }

  function on(fn) {
    listeners.add(fn);
    fn(state, sim(state));
    return () => listeners.delete(fn);
  }

  /* Нажатие считается по переднему фронту, как в скетче шага 4. */
  function press(down) {
    if (down === state.pressed) return;
    const toggled = down && state.step === 3;
    set({ pressed: down, soundMode: toggled ? !state.soundMode : state.soundMode });
  }

  /* --- Звук buzzer: квадратная волна, как у tone(). Включается только по клику. --- */
  let ctx = null;
  let osc = null;
  let gain = null;

  function syncAudio(s, d) {
    const hz = s.audio ? d.tone : null;
    if (hz == null) {
      if (gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      return;
    }
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'square';
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
    }
    if (ctx.state === 'suspended') ctx.resume();
    osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.015);
  }

  /* --- Полный экран: настоящий Fullscreen API, запасной путь — панель на всё окно. --- */
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function notifyFull(panel) {
    const full = panel.classList.contains('is-max') || fsElement() === panel;
    panel.querySelectorAll('[data-fs]').forEach((b) => {
      b.setAttribute('aria-pressed', String(full));
      b.setAttribute('aria-label', full ? 'Выйти из полного экрана' : 'На весь экран');
      b.title = full ? 'Выйти из полного экрана (Esc)' : 'На весь экран';
    });
    panel.dispatchEvent(new CustomEvent('lab:fullchange', { bubbles: true, detail: { full } }));
  }

  function maximize(panel, on) {
    panel.classList.toggle('is-max', on);
    document.documentElement.classList.toggle('has-max', on);
    notifyFull(panel);
  }

  function toggleFull(panel) {
    if (fsElement() === panel) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (panel.classList.contains('is-max')) {
      maximize(panel, false);
      return;
    }
    const req = panel.requestFullscreen || panel.webkitRequestFullscreen;
    if (!req) {
      maximize(panel, true);
      return;
    }
    Promise.resolve()
      .then(() => req.call(panel))
      .catch(() => maximize(panel, true));
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-fs]');
      if (b) toggleFull(b.closest('.panel'));
    });
    let lastFull = null;
    const onChange = () => {
      const el = fsElement();
      if (lastFull) notifyFull(lastFull);
      if (el) notifyFull(el);
      lastFull = el;
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const p = document.querySelector('.panel.is-max');
      if (p) maximize(p, false);
    });
  }

  /* --- Подсветка кода Arduino. --- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|\b(void|int|long|float|bool|byte|char|const|if|else|for|while|return|true|false)\b|\b(setup|loop|pinMode|digitalRead|digitalWrite|analogRead|analogWrite|map|constrain|tone|noTone|delay|millis|Serial|begin|print|println)\b|\b(HIGH|LOW|INPUT_PULLUP|INPUT|OUTPUT|A[0-5])\b|(?<![\w.])(-?\d+(?:\.\d+)?)\b/g;

  function highlight(code) {
    let out = '';
    let last = 0;
    code.replace(TOKEN, (m, com, str, kw, fn, cst, num, i) => {
      out += esc(code.slice(last, i));
      const cls = com ? 't-com' : str ? 't-str' : kw ? 't-kw' : fn ? 't-fn' : cst ? 't-cst' : 't-num';
      out += '<span class="' + cls + '">' + esc(m) + '</span>';
      last = i + m.length;
      return m;
    });
    return out + esc(code.slice(last));
  }

  /* --- Мелочи. --- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('maplab.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('maplab.' + key, JSON.stringify(value));
      } catch (e) {
        /* приватный режим или запрет хранилища: страница работает и без него */
      }
    },
  };

  function copyText(text, button) {
    const done = (ok) => {
      if (!button) return;
      const label = button.textContent;
      button.textContent = ok ? 'Скопировано' : 'Выдели и скопируй вручную';
      setTimeout(() => (button.textContent = label), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }

  const reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  Object.assign(NS, {
    mapInt, clamp, pwmBits, state, sim, set, on, press, toggleFull, highlight, esc, store, copyText, reducedMotion,
  });

  if (typeof document !== 'undefined') on(syncAudio);
})(typeof window !== 'undefined' ? window : globalThis);
