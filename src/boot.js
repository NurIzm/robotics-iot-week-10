/* boot.js — верхняя панель: разделы, тема и индикатор прокрутки, который сам считается через map(). */
(function () {
  'use strict';
  const { mapInt, store } = window.MapLab;
  document.documentElement.lang = 'ru';

  const theme = store.get('theme', null);
  if (theme) document.documentElement.dataset.theme = theme;
  const themeBtn = document.getElementById('themeToggle');
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const paintTheme = () => (themeBtn.textContent = isDark() ? 'Светлая' : 'Тёмная');
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    paintTheme();
  });
  paintTheme();

  const scrollMap = document.getElementById('scrollMap');
  const bar = document.getElementById('scrollBar');
  const links = [...document.querySelectorAll('.topbar__nav a')];
  const targets = links.map((a) => document.querySelector(a.getAttribute('href')));

  function onScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const y = Math.min(max, Math.round(scrollY));
    const pct = mapInt(y, 0, max, 0, 100);
    scrollMap.innerHTML = 'map(' + y + ', 0, ' + max + ', 0, 100) = <b>' + pct + '</b>';
    bar.style.width = pct + '%';
    let current = -1;
    targets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top <= innerHeight * 0.35) current = i;
    });
    links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
})();
