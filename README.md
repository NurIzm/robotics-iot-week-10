# Музыкальный регулятор

Урок 10 кружка робототехники: масштабирование данных через `map()` на Arduino Uno. Для 6–9 класса.

**Открыть урок:** https://nurizm.github.io/robotics-iot-week-10/

## Что внутри

- объяснение `map()` на трёх уровнях сложности с живыми шкалами;
- 2D-схема в стиле Tinkercad и 3D-модель сборки;
- четыре шага проекта: схема и код рядом, каждую панель можно развернуть на весь экран;
- примеры применения и идеи проектов;
- задачи, тренажёр кода и визуальные задания.

## Без интернета

Скачайте файл `urok-10-map.html` и откройте его двойным кликом. Всё нужное уже внутри него.

## Как поменять

Исходники лежат в папке `src`, контракт модулей и проверенные факты в `src/SPEC.md`.

```bash
cd src
node check/check-circuit.js
node check/check-sketches.mjs
node check/check-practice.js
node build.js
cp dist/urok-10-map.html ../urok-10-map.html
```

## Сторонние материалы

- [three.js](https://threejs.org/) r128, лицензия MIT.
- Шрифты Golos Text, JetBrains Mono и Unbounded, лицензия SIL Open Font License 1.1.
