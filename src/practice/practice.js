/* practice.js — раздел #practice. Сверху данные и чистая логика (их проверяет check/check-practice.js),
   ниже отрисовка. Числовые ответы нигде не записаны вручную: их считает mapInt. */
(function (root) {
  'use strict';
  const ML = (root.MapLab = root.MapLab || {});
  const { mapInt } = ML;

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (list) => list[rnd(list.length)];
  const callText = (args, name) => 'map(' + (name == null ? args[0] : name) + ', ' + args.slice(1).join(', ') + ')';

  /* Разбор вручную в том же порядке, в каком считает Arduino: сначала умножение, потом деление без дроби. */
  function solveSteps([x, a, b, c, d]) {
    const walked = x - a;
    const outSpan = d - c;
    const inSpan = b - a;
    const product = walked * outSpan;
    const part = Math.trunc(product / inSpan);
    const exact = product / inSpan;
    const steps = [
      `Сколько прошли от начала: ${x} − (${a}) = ${walked}`,
      `Длина новой шкалы: ${d} − (${c}) = ${outSpan}`,
      `Умножаем: ${walked} × ${outSpan} = ${product}`,
      `Длина старой шкалы: ${b} − (${a}) = ${inSpan}`,
      Number.isInteger(exact)
        ? `Делим: ${product} / ${inSpan} = ${part}`
        : `Делим: ${product} / ${inSpan} = ${exact.toFixed(2)}, дробную часть отбрасываем: ${part}`,
      `Прибавляем начало новой шкалы: ${part} + (${c}) = ${part + c}`,
    ];
    return steps;
  }

  /* --- Генератор примеров --- */
  function genEasy() {
    const [a, b, c, d] = pick([
      [0, 100, 0, 10], [0, 10, 0, 100], [0, 100, 0, 1000], [0, 50, 0, 100], [0, 200, 0, 100],
      [0, 1000, 0, 100], [0, 20, 0, 100], [0, 40, 0, 100], [0, 100, 0, 50],
    ]);
    const parts = pick([2, 4, 5, 10].filter((n) => (b - a) % n === 0 && (d - c) % n === 0));
    return [a + (rnd(parts + 1) * (b - a)) / parts, a, b, c, d];
  }
  function genMedium() {
    const [c, d] = pick([[0, 255], [0, 180], [0, 100], [0, 1000], [0, 10]]);
    return [pick([0, 102, 205, 256, 307, 341, 409, 512, 614, 682, 767, 818, 921, 1023]), 0, 1023, c, d];
  }
  function genHard() {
    const [a, b, c, d] = pick([
      [0, 1023, 200, 2000], [0, 1023, 100, 500], [0, 1023, 20, 255], [0, 1023, 255, 0], [0, 1023, 100, 0],
      [0, 1023, 2000, 200], [0, 1023, -255, 255], [0, 1023, -90, 90], [300, 800, 0, 100], [850, 350, 0, 100],
      [5, 100, 50, 1000], [1000, 2000, 0, 255],
    ]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return [lo + rnd(hi - lo + 1), a, b, c, d];
  }
  const GEN = [genEasy, genMedium, genHard];

  /* --- Задачи из жизни --- */
  const WORD = [
    { id: 'w1', level: 0, text: 'В игре шкала здоровья от 0 до 50. У героя осталось 25. Сколько процентов покажет полоска здоровья?', args: [25, 0, 50, 0, 100], unit: '%' },
    { id: 'w2', level: 0, text: 'В тесте 20 вопросов. Ты верно ответил на 15. Сколько это баллов из 100?', args: [15, 0, 20, 0, 100], unit: 'баллов' },
    { id: 'w3', level: 0, text: 'В бак входит 40 литров. Датчик показывает 10 литров. На сколько процентов бак заполнен?', args: [10, 0, 40, 0, 100], unit: '%' },
    { id: 'w4', level: 1, text: 'Датчик расстояния видит от 0 до 200 см. До стены 50 см. На экране полоска из 8 делений. Сколько делений закрасить?', args: [50, 0, 200, 0, 8], unit: 'дел.' },
    { id: 'w5', level: 1, text: 'Потенциометр показал 256. Сервопривод поворачивается от 0° до 180°. На какой угол он встанет? Дробную часть отбрасывай, как map().', args: [256, 0, 1023, 0, 180], unit: '°' },
    { id: 'w6', level: 1, text: 'Фоторезистор дал 818 на шкале 0–1023. Подсветка задаётся в процентах от 0 до 100. Сколько процентов получится? Дробную часть отбрасывай, как map().', args: [818, 0, 1023, 0, 100], unit: '%' },
    { id: 'w7', level: 2, text: 'Батарея: 3300 мВ — это 0%, 4200 мВ — это 100%. Вольтметр показал 3750 мВ. Сколько процентов заряда покажет индикатор?', args: [3750, 3300, 4200, 0, 100], unit: '%' },
    { id: 'w8', level: 2, text: 'Датчик влажности: сухая почва даёт 850, мокрая — 350. Сейчас он показал 600. Сколько процентов влажности?', args: [600, 850, 350, 0, 100], unit: '%' },
    { id: 'w9', level: 2, text: 'Терменвокс: рука на 5 см даёт 2000 Гц, на 50 см даёт 200 Гц. Рука на 20 см. Какая частота?', args: [20, 5, 50, 2000, 200], unit: 'Гц' },
    { id: 'w10', level: 2, text: 'Джойстик 0–1023 управляет мотором от −255 до 255. Джойстик дал 767. Какая скорость? Дробную часть отбрасывай, как map().', args: [767, 0, 1023, -255, 255], unit: '' },
  ];

  /* --- Пропуски. [[ответ]] — поле ввода. alts — другие верные наборы ответов. --- */
  const FILL = [
    { id: 'c1', level: 0, text: 'Переведи положение ручки 0–1023 в яркость 0–255.',
      code: 'int brightness = map(potValue, [[0]], [[1023]], [[0]], [[255]]);', alts: [['1023', '0', '255', '0']] },
    { id: 'c2', level: 1, text: 'Прочитай потенциометр и запиши яркость на красный канал.',
      code: 'int potValue = [[analogRead]](A0);\nint brightness = map(potValue, 0, 1023, 0, 255);\n[[analogWrite]](redPin, brightness);' },
    { id: 'c3', level: 1, text: 'Сделай частоту от 200 до 2000 Гц и включи звук.',
      code: 'int frequency = map(potValue, 0, 1023, [[200]], [[2000]]);\n[[tone]](buzzerPin, frequency);' },
    { id: 'c4', level: 2, text: 'Кнопка соединена с GND. Настрой пин и проверь нажатие.',
      code: 'pinMode(buttonPin, [[INPUT_PULLUP]]);\nbool pressed = digitalRead(buttonPin) == [[LOW]];' },
  ];

  /* --- Напиши сам --- */
  const WRITE = [
    { id: 'c5', level: 0, text: 'Переведи potValue (0–1023) в проценты от 0 до 100. Результат запиши в переменную percent.', target: [0, 1023, 0, 100], answer: 'int percent = map(potValue, 0, 1023, 0, 100);' },
    { id: 'c6', level: 1, text: 'Переверни ручку: при 0 яркость 255, при 1023 яркость 0. Результат в brightness.', target: [0, 1023, 255, 0], answer: 'int brightness = map(potValue, 0, 1023, 255, 0);' },
    { id: 'c7', level: 1, text: 'Парктроник: расстояние cm от 5 до 100 переведи в паузу pause от 50 до 1000 мс.', target: [5, 100, 50, 1000], answer: 'int pause = map(cm, 5, 100, 50, 1000);' },
    { id: 'c8', level: 2, text: 'Джойстик y (0–1023) должен давать скорость speed от −255 до 255.', target: [0, 1023, -255, 255], answer: 'int speed = map(y, 0, 1023, -255, 255);' },
  ];

  /* Разбирает строку ученика. Ничего не выполняет: только регулярные выражения. */
  function parseMapLine(raw) {
    const text = raw.replace(/[−–]/g, '-').trim();
    if (!text) return { ok: false, msg: 'Напиши строку с вызовом map().' };
    if (/\bMAP\b|\bMap\b/.test(text)) return { ok: false, msg: 'В языке Arduino важны большие и маленькие буквы. Пиши map маленькими.' };
    const open = text.indexOf('map');
    if (open < 0 || !/\bmap\s*\(/.test(text)) return { ok: false, msg: 'В строке нет вызова map(...). Проверь название и открывающую скобку.' };
    if (!/\)\s*;?\s*$/.test(text)) return { ok: false, msg: 'Не хватает закрывающей скобки в конце.' };
    const m = /^(?:(?:const\s+)?(?:int|long|byte|float)\s+)?(?:([A-Za-z_]\w*)\s*=\s*)?map\s*\(([^()]*)\)\s*(;?)\s*$/.exec(text);
    if (!m) return { ok: false, msg: 'Не могу разобрать строку. Нужен такой вид: int y = map(x, 0, 1023, 0, 255);' };
    const args = m[2].split(',').map((s) => s.trim());
    if (args.length !== 5) return { ok: false, msg: `У map() должно быть 5 значений через запятую, а у тебя ${args.length}.` };
    if (!/^[A-Za-z_]\w*$/.test(args[0]) && !/^-?\d+$/.test(args[0])) return { ok: false, msg: 'Первым идёт значение, которое переводим: имя переменной.' };
    const nums = args.slice(1).map((s) => s.replace(/\s+/g, ''));
    const badNum = nums.find((s) => !/^-?\d+$/.test(s));
    if (badNum !== undefined) return { ok: false, msg: `«${badNum}» не целое число. Границы шкал должны быть целыми числами.` };
    return { ok: true, name: args[0], variable: m[1] || null, range: nums.map(Number), semicolon: m[3] === ';' };
  }

  /* Сравнивает по поведению: на концах точно, внутри допускает расхождение на 1 из-за отбрасывания дроби. */
  function checkMapLine(range, target) {
    const [a, b, c, d] = target;
    const swapped = [c, d, a, b];
    if (range.every((v, i) => v === swapped[i])) return { ok: false, msg: 'Диапазоны перепутаны местами. Сначала откуда, потом куда.' };
    if (range[0] === range[1]) return { ok: false, msg: 'Первые две границы равны: на ноль делить нельзя.' };
    const ends = [a, b];
    for (const x of ends) {
      const want = mapInt(x, a, b, c, d);
      const got = mapInt(x, ...range);
      if (want !== got) return { ok: false, msg: `Когда значение равно ${x}, должно получиться ${want}, а твоя строка даёт ${got}.` };
    }
    for (let i = 1; i < 8; i++) {
      const x = Math.round(a + ((b - a) * i) / 8);
      const want = mapInt(x, a, b, c, d);
      const got = mapInt(x, ...range);
      if (Math.abs(want - got) > 1) return { ok: false, msg: `Когда значение равно ${x}, должно получиться ${want}, а твоя строка даёт ${got}.` };
    }
    return { ok: true };
  }

  /* --- Найди ошибку. fixed получается заменой строки bad, поэтому его можно скомпилировать. --- */
  const BUGS = [
    { id: 'c9', level: 0, text: 'В Serial Monitor всегда 0, как ни крути ручку.',
      code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int potValue = digitalRead(A0);
  int brightness = map(potValue, 0, 1023, 0, 255);
  Serial.println(brightness);
  delay(200);
}`,
      bad: '  int potValue = digitalRead(A0);', fix: '  int potValue = analogRead(A0);',
      why: 'digitalRead отвечает только 0 или 1. map(1, 0, 1023, 0, 255) даёт 0, потому что дробная часть отбрасывается. Для потенциометра нужен analogRead.' },
    { id: 'c10', level: 0, text: 'Buzzer молчит, зато светодиод странно горит.',
      code: `const int redPin = 5;
const int buzzerPin = 4;

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
}

void loop() {
  int potValue = analogRead(A0);
  int frequency = map(potValue, 0, 1023, 200, 2000);
  tone(redPin, frequency);
}`,
      bad: '  tone(redPin, frequency);', fix: '  tone(buzzerPin, frequency);',
      why: 'Звук отправлен на пин светодиода. В tone() первым идёт пин buzzer.' },
    { id: 'c11', level: 1, text: 'Светодиод не меняет яркость плавно: он только включается и выключается.',
      code: `const int ledPin = 7;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int potValue = analogRead(A0);
  int brightness = map(potValue, 0, 1023, 0, 255);
  analogWrite(ledPin, brightness);
}`,
      bad: 'const int ledPin = 7;', fix: 'const int ledPin = 9;',
      why: 'У пина 7 нет волны ~, значит нет ШИМ. analogWrite здесь работает как выключатель. Возьми пин 3, 5, 6, 9, 10 или 11.' },
    { id: 'c12', level: 1, text: 'За один поворот ручки яркость прыгает несколько раз.',
      code: `void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  int potValue = analogRead(A0);
  int brightness = map(potValue, 0, 255, 0, 1023);
  analogWrite(9, brightness);
}`,
      bad: '  int brightness = map(potValue, 0, 255, 0, 1023);', fix: '  int brightness = map(potValue, 0, 1023, 0, 255);',
      why: 'Диапазоны перепутаны. Сначала откуда (0, 1023), потом куда (0, 255). Сейчас числа уходят далеко за 255, а лишние биты analogWrite теряет.' },
    { id: 'c13', level: 1, text: 'Кнопка подключена к пину 2 и GND. Светодиод мигает сам, кнопка работает как попало.',
      code: `const int buttonPin = 2;
const int ledPin = 9;

void setup() {
  pinMode(buttonPin, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(buttonPin) == LOW) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}`,
      bad: '  pinMode(buttonPin, INPUT);', fix: '  pinMode(buttonPin, INPUT_PULLUP);',
      why: 'Пока кнопка не нажата, пин ни с чем не соединён и читается случайно. INPUT_PULLUP подтягивает его к 5V.' },
    { id: 'c14', level: 2, text: 'Buzzer пищит всегда, хотя mode равен 0.',
      code: `const int buzzerPin = 4;
int mode = 0;

void setup() {
  pinMode(buzzerPin, OUTPUT);
}

void loop() {
  if (mode = 1) {
    tone(buzzerPin, 1000);
  } else {
    noTone(buzzerPin);
  }
}`,
      bad: '  if (mode = 1) {', fix: '  if (mode == 1) {',
      why: 'Один знак = записывает 1 в mode, и условие всегда истинно. Сравнение пишется двумя знаками: ==.' },
    { id: 'c15', level: 2, text: 'Пока звучит buzzer, яркость светодиода перестаёт слушаться ручку.',
      code: `const int ledPin = 3;
const int buzzerPin = 4;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int potValue = analogRead(A0);
  analogWrite(ledPin, map(potValue, 0, 1023, 0, 255));
  tone(buzzerPin, map(potValue, 0, 1023, 200, 2000));
  delay(10);
}`,
      bad: 'const int ledPin = 3;', fix: 'const int ledPin = 5;',
      why: 'tone() занимает таймер, от которого работает ШИМ на пинах 3 и 11. Поставь светодиод на пин 5, 6, 9 или 10.' },
  ];

  /* --- Порядок строк. start — начальная перестановка. --- */
  const ORDER = [
    { id: 'c16', level: 0, text: 'Собери loop() для шага 2: прочитать, перевести, отправить на светодиод.',
      lines: ['int potValue = analogRead(A0);', 'int brightness = map(potValue, 0, 1023, 0, 255);', 'analogWrite(redPin, brightness);'], start: [2, 0, 1] },
    { id: 'c17', level: 1, text: 'Собери переключение режима из шага 4.',
      lines: ['bool pressed = digitalRead(buttonPin) == LOW;', 'if (pressed && !wasPressed) {', '  soundMode = !soundMode;', '}', 'wasPressed = pressed;'], start: [4, 2, 0, 3, 1] },
  ];

  /* --- Доработки проекта. Ученик сам отмечает, что получилось на плате. --- */
  const PROJECTS = [
    { id: 'p1', level: 0, title: 'Перевёрнутая ручка', text: 'Сделай так, чтобы при повороте вправо свет гас, а не разгорался.',
      hint: 'Поменяй местами два последних числа в map().',
      code: 'int brightness = map(potValue, 0, 1023, 255, 0);' },
    { id: 'p2', level: 1, title: 'Тишина на нуле', text: 'В режиме звука buzzer должен молчать, когда ручка почти на нуле.',
      hint: 'Сравни potValue с небольшим числом, например 10.',
      code: 'if (potValue < 10) {\n  noTone(buzzerPin);\n} else {\n  tone(buzzerPin, frequency);\n}' },
    { id: 'p3', level: 1, title: 'Цвет следует за звуком', text: 'В режиме звука низкие ноты дают синий свет, высокие — красный.',
      hint: 'Вместо setBrightness(0) запиши красному прямую шкалу, а синему перевёрнутую.',
      code: 'analogWrite(redPin, map(potValue, 0, 1023, 0, 255));\nanalogWrite(greenPin, 0);\nanalogWrite(bluePin, map(potValue, 0, 1023, 255, 0));\ntone(buzzerPin, frequency);' },
    { id: 'p4', level: 2, title: 'Третий режим', text: 'Добавь режим «Всё выключено». Кнопка переключает режимы по кругу: свет, звук, тишина.',
      hint: 'Замени bool на int mode и считай по кругу через остаток от деления.',
      code: 'if (pressed && !wasPressed) {\n  mode = (mode + 1) % 3;\n}\n\nif (mode == 0) {\n  noTone(buzzerPin);\n  setBrightness(map(potValue, 0, 1023, 0, 255));\n} else if (mode == 1) {\n  setBrightness(0);\n  tone(buzzerPin, map(potValue, 0, 1023, 200, 2000));\n} else {\n  setBrightness(0);\n  noTone(buzzerPin);\n}' },
  ];

  /* --- Ошибки на схеме. wires и parts меняют настоящую схему шага 4. --- */
  const FAULTS = [
    { id: 'v1', level: 0, text: 'Числа в Serial Monitor скачут сами, ручка на них не влияет. Нажми на провод с ошибкой.',
      bad: ['wa0'], wires: { wa0: { to: 'a5' } },
      why: 'Оранжевый провод стоит в столбце 5, а средняя ножка потенциометра в столбце 4. Столбец 5 ни с чем не соединён, поэтому A0 висит в воздухе.' },
    { id: 'v2', level: 0, text: 'Светодиод не горит ни при каком положении ручки. Нажми на провод с ошибкой.',
      bad: ['wk'], wires: { wk: { to: 'bp22' } },
      why: 'Общая ножка светодиода (общий катод, это минус) должна идти в рейку «−». Здесь перемычка стоит в рейке «+», и ток через светодиод не идёт.' },
    { id: 'v3', level: 1, text: 'Код правильный, но buzzer молчит. Нажми на провод с ошибкой.',
      bad: ['wbuz'], wires: { wbuz: { to: 'j15' } },
      why: 'Фиолетовый провод пришёл в столбец 15, а ножка «+» у buzzer стоит в столбце 16.' },
    { id: 'v4', level: 1, text: 'Кнопка нажимается, но режим не меняется. Нажми на провод с ошибкой.',
      bad: ['wbtng', 'wbtn'], wires: { wbtng: { from: 'a10', to: 'bn10' } },
      why: 'Оба провода кнопки стоят на столбце 10. Ножки напротив друг друга через канавку соединены внутри кнопки всегда, поэтому пин 2 постоянно соединён с GND.' },
    { id: 'v5', level: 1, text: 'Зелёный и синий каналы работают, красный нет. Нажми на деталь с ошибкой.',
      bad: ['r1'], parts: { r1: { legs: { a: 'f21', b: 'i21' } } },
      why: 'Резистор стоит в верхней половине и не перекинут через канавку. Обе его ножки в одном столбце, и ток до красной ножки светодиода не доходит.' },
    { id: 'v6', level: 2, text: 'Светодиод не горит, кнопка не отвечает, а на скетче шага 1 числа в Serial Monitor идут наоборот. Что перепутали у Arduino? Нажми на провод с ошибкой.',
      bad: ['w5v', 'wgnd'], wires: { w5v: { to: 'bn9' }, wgnd: { to: 'bp8' } },
      why: 'Провода 5V и GND поменяны местами: 5V попал в рейку «−», а GND в рейку «+». Все детали на макетке получили обратную полярность.' },
  ];

  /* --- Поставь метку --- */
  const MARKS = [
    { id: 'v7', level: 0, args: [50, 0, 100, 0, 1000] },
    { id: 'v8', level: 0, args: [512, 0, 1023, 0, 255] },
    { id: 'v9', level: 1, args: [256, 0, 1023, 200, 2000] },
    { id: 'v10', level: 2, args: [767, 0, 1023, 255, 0] },
  ];
  const MARK_TOLERANCE = 0.05; // доля длины шкалы

  /* --- Настрой шкалу: ученик подбирает две границы --- */
  const SCALES = [
    { id: 'v11', level: 0, kind: 'bar', text: 'Датчик в баке даёт 120, когда бак пуст, и 900, когда полон. Подбери первые два числа, чтобы полоска показывала 0% для пустого бака и 100% для полного.',
      fields: ['inMin', 'inMax'], start: { inMin: 0, inMax: 1023, outMin: 0, outMax: 100 }, answer: { inMin: 120, inMax: 900 }, test: { min: 120, max: 900, value: 510 }, unit: '%' },
    { id: 'v12', level: 1, kind: 'needle', text: 'Стрелка прибора должна идти от −90° (до упора влево) до 90° (до упора вправо). Подбери два последних числа.',
      fields: ['outMin', 'outMax'], start: { inMin: 0, inMax: 1023, outMin: 0, outMax: 180 }, answer: { outMin: -90, outMax: 90 }, test: { min: 0, max: 1023, value: 767 }, unit: '°' },
    { id: 'v13', level: 2, kind: 'needle', text: 'Шлагбаум: 0° значит поднят вертикально, 90° значит лежит вправо. Сейчас при x = 0 он поднят, при x = 1023 лежит. Сделай наоборот: при x = 0 лежит, при x = 1023 поднят. Подбери два последних числа.',
      fields: ['outMin', 'outMax'], start: { inMin: 0, inMax: 1023, outMin: 0, outMax: 90 }, answer: { outMin: 90, outMax: 0 }, test: { min: 0, max: 1023, value: 256 }, unit: '°' },
  ];

  /* --- Какой график --- */
  const GRAPHS = [
    { id: 'v14', level: 0, line: [0, 1023, 255, 0], options: [[0, 1023, 0, 255], [0, 1023, 255, 0], [0, 1023, 0, 100], [0, 1023, 100, 255]] },
    { id: 'v15', level: 1, line: [0, 1023, 200, 2000], options: [[0, 1023, 0, 2000], [0, 1023, 2000, 200], [0, 1023, 200, 2000], [0, 1023, 200, 1000]] },
    { id: 'v16', level: 2, line: [0, 1023, -255, 255], options: [[0, 1023, 255, -255], [0, 1023, 0, 255], [0, 1023, -255, 0], [0, 1023, -255, 255]] },
  ];

  /* --- Соедини пары --- */
  const PAIRS = [
    { id: 'v17', level: 0, text: 'Что с каким диапазоном работает?', pairs: [
      ['analogRead на Arduino Uno', '0–1023'], ['analogWrite', '0–255'], ['Угол сервопривода', '0–180'], ['Проценты', '0–100'], ['Частота в нашем проекте', '200–2000'],
    ], right: [3, 0, 4, 1, 2] },
    { id: 'v18', level: 1, text: 'Какая строка что делает?', pairs: [
      ['map(x, 0, 1023, 255, 0)', 'Ручка вправо, и свет гаснет'],
      ['map(x, 0, 1023, 0, 180)', 'Угол сервопривода от ручки'],
      ['map(x, 0, 1023, -255, 255)', 'Мотор вперёд и назад'],
      ['map(x, 850, 350, 0, 100)', 'Влажность: сухо 0%, мокро 100%'],
    ], right: [2, 3, 0, 1] },
  ];

  const ALL = [WORD, FILL, WRITE, BUGS, ORDER, PROJECTS, FAULTS, MARKS, SCALES, GRAPHS, PAIRS];

  ML.PRACTICE = {
    GEN, WORD, FILL, WRITE, BUGS, ORDER, PROJECTS, FAULTS, MARKS, MARK_TOLERANCE, SCALES, GRAPHS, PAIRS,
    solveSteps, parseMapLine, checkMapLine, total: ALL.reduce((n, list) => n + list.length, 0),
  };

  if (typeof document === 'undefined') return;
  const section = document.getElementById('practice');
  if (!section) return;

  /* ---------- Отрисовка ---------- */
  const { highlight, esc, store, CIRCUIT: C, createGraph, createRulers, createSchematic } = ML;
  const LEVELS = ['Лёгкое', 'Среднее', 'Сложное'];
  const $ = (id) => document.getElementById(id);
  const big = (html) => '<p class="pr-q">' + html + '</p>';
  const mono = (s) => '<code class="pr-call">' + esc(s) + '</code>';

  function make(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function button(label, cls) {
    const b = make('button', 'btn' + (cls ? ' ' + cls : ''), esc(label));
    b.type = 'button';
    return b;
  }

  /* Счёт */
  const solved = store.get('practice.solved', {});
  function paintScore() {
    const n = Object.keys(solved).filter((id) => solved[id]).length;
    $('pr-solved').textContent = n;
    $('pr-total').textContent = ML.PRACTICE.total;
    $('pr-bar').style.width = (n / ML.PRACTICE.total) * 100 + '%';
    section.querySelectorAll('[data-pr-dot]').forEach((d) => d.classList.toggle('is-done', Boolean(solved[d.dataset.prDot])));
  }
  function markSolved(id) {
    if (solved[id]) return;
    solved[id] = true;
    store.set('practice.solved', solved);
    paintScore();
  }
  const resetBtn = $('pr-reset');
  let resetArmed = null;
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetBtn.textContent = 'Точно сбросить?';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        resetBtn.textContent = 'Сбросить счёт';
      }, 3000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    resetBtn.textContent = 'Сбросить счёт';
    Object.keys(solved).forEach((id) => delete solved[id]);
    store.set('practice.solved', solved);
    paintScore();
    pagers.forEach((p) => p());
  });

  /* Ответ и сообщения */
  function feedback(box) {
    const el = make('div', 'pr-fb');
    el.setAttribute('role', 'status');
    el.hidden = true;
    box.appendChild(el);
    const show = (cls, html) => {
      el.hidden = false;
      el.className = 'pr-fb ' + cls;
      el.innerHTML = html;
    };
    return { el, ok: (html) => show('is-ok', html), no: (html) => show('is-no', html), info: (html) => show('', html), clear: () => (el.hidden = true) };
  }
  const stepsHtml = (args) => '<ol class="pr-steps">' + solveSteps(args).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';

  /* Листалка задач */
  const pagers = [];
  function pager(hostId, tasks, render) {
    const host = $(hostId);
    const body = make('div', 'pr-body');
    const foot = make('div', 'pr-pager');
    const prev = button('Назад');
    const next = button('Следующая задача');
    const dots = make('div', 'pr-dots');
    tasks.forEach((t) => {
      const d = make('i');
      d.dataset.prDot = t.id;
      dots.appendChild(d);
    });
    const count = make('span', 'pr-count');
    foot.append(prev, dots, count, next);
    host.append(body, foot);
    let i = 0;
    function show() {
      const t = tasks[i];
      body.innerHTML = '';
      body.appendChild(make('div', 'pr-meta', '<span class="level">' + LEVELS[t.level] + '</span>' + (solved[t.id] ? '<span class="chip chip--ok">Решено</span>' : '')));
      render(body, t, () => {
        markSolved(t.id);
        body.querySelector('.pr-meta').innerHTML = '<span class="level">' + LEVELS[t.level] + '</span><span class="chip chip--ok">Решено</span>';
      });
      count.textContent = i + 1 + ' из ' + tasks.length;
      prev.disabled = i === 0;
      next.disabled = i === tasks.length - 1;
      [...dots.children].forEach((d, n) => d.classList.toggle('is-here', n === i));
      paintScore();
    }
    prev.addEventListener('click', () => { i -= 1; show(); });
    next.addEventListener('click', () => { i += 1; show(); });
    pagers.push(show);
    show();
  }

  /* Числовой ответ: общий для генератора и задач из жизни */
  function numberAnswer(box, id, args, unit, onRight) {
    const want = mapInt(...args);
    const row = make('form', 'pr-answer');
    const input = make('input', 'pr-input');
    input.id = 'pr-in-' + id;
    input.type = 'text';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Твой ответ');
    const go = button('Проверить', 'btn--primary');
    go.type = 'submit';
    const show = button('Показать решение');
    row.append(input, make('span', 'pr-unit', esc(unit || '')), go, show);
    box.appendChild(row);
    const fb = feedback(box);
    row.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = Number(input.value.replace(/[−–]/g, '-').replace(',', '.').trim());
      if (input.value.trim() === '' || Number.isNaN(value)) {
        fb.no('Введи число.');
      } else if (value === want) {
        fb.ok('Верно: ' + esc(callText(args)) + ' = ' + want + '.');
        onRight();
      } else if (Math.abs(value - want) <= 1) {
        fb.no('Почти. map() не округляет, а отбрасывает дробную часть. Пересчитай последний шаг.');
      } else {
        fb.no('Пока не то. Попробуй ещё раз или открой решение.');
      }
    });
    show.addEventListener('click', () => fb.info(stepsHtml(args) + '<p>Ответ: <b>' + want + '</b></p>'));
    return input;
  }

  /* Блок 1: генератор */
  let genLevel = 0;
  let genCount = 0;
  const genBox = $('pr-gen');
  const levelBox = $('pr-gen-levels');
  ['Лёгкий', 'Средний', 'Сложный'].forEach((name, i) => {
    const b = button(name);
    b.addEventListener('click', () => { genLevel = i; newExample(); });
    levelBox.appendChild(b);
  });
  function newExample() {
    [...levelBox.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === genLevel)));
    const args = GEN[genLevel]();
    genBox.innerHTML = '';
    genBox.appendChild(make('p', 'pr-gen-call', mono(callText(args)) + ' <span class="pr-eq">=</span> ?'));
    if (genLevel === 1) genBox.appendChild(make('p', 'small', 'Можно считать на калькуляторе.'));
    numberAnswer(genBox, 'gen', args, '', () => {
      genCount += 1;
      genStreak.textContent = 'Решено подряд: ' + genCount;
    });
    const next = button('Новый пример');
    next.addEventListener('click', newExample);
    const foot = make('div', 'pr-pager');
    const genStreak = make('span', 'pr-count', 'Решено подряд: ' + genCount);
    foot.append(genStreak, next);
    genBox.appendChild(foot);
  }
  newExample();

  /* Блок 1: задачи из жизни */
  pager('pr-word', WORD, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text))));
    numberAnswer(box, t.id, t.args, t.unit, done);
  });

  /* Блок 2: пропуски */
  pager('pr-fill', FILL, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text))));
    const pre = make('div', 'code pr-code');
    const answers = [];
    const parts = t.code.split(/(\[\[.*?\]\])/);
    let html = '';
    parts.forEach((part) => {
      const m = /^\[\[(.*)\]\]$/.exec(part);
      if (m) {
        const n = answers.length;
        answers.push(m[1]);
        html += '<input class="pr-blank" id="pr-blank-' + t.id + '-' + n + '" style="width:' + (m[1].length + 2) + 'ch" autocomplete="off" spellcheck="false" aria-label="Пропуск ' + (n + 1) + '">';
      } else {
        html += highlight(part);
      }
    });
    pre.innerHTML = html;
    box.appendChild(pre);
    const row = make('div', 'pr-actions');
    const go = button('Проверить', 'btn--primary');
    const show = button('Показать решение');
    row.append(go, show);
    box.appendChild(row);
    const fb = feedback(box);
    const inputs = [...pre.querySelectorAll('input')];
    const check = () => {
      const got = inputs.map((i) => i.value.trim());
      const accepted = [answers, ...(t.alts || [])];
      if (accepted.some((a) => a.every((v, i) => v === got[i]))) {
        inputs.forEach((i) => i.classList.add('is-ok'));
        fb.ok('Верно.');
        done();
        return;
      }
      const lower = answers.some((a, i) => got[i] !== a && got[i].toLowerCase() === a.toLowerCase());
      fb.no(lower ? 'Почти. В Arduino важны большие и маленькие буквы.' : 'Проверь ещё раз. Подсказка есть в коде проекта, шаги 1–4.');
    };
    go.addEventListener('click', check);
    inputs.forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); }));
    show.addEventListener('click', () => {
      inputs.forEach((inp, i) => (inp.value = answers[i]));
      fb.info('Вот так выглядит верный код.');
    });
  });

  /* Блок 2: напиши сам */
  pager('pr-write', WRITE, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text))));
    const form = make('form', 'pr-answer pr-answer--line');
    const input = make('input', 'pr-input pr-input--code');
    input.id = 'pr-line-' + t.id;
    input.type = 'text';
    input.placeholder = 'int y = map(x, 0, 1023, 0, 255);';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Твоя строка кода');
    const go = button('Проверить', 'btn--primary');
    go.type = 'submit';
    const show = button('Показать решение');
    form.append(input, go, show);
    box.appendChild(form);
    const fb = feedback(box);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = parseMapLine(input.value);
      if (!p.ok) return fb.no(esc(p.msg));
      const r = checkMapLine(p.range, t.target);
      if (!r.ok) return fb.no(esc(r.msg));
      fb.ok('Верно.' + (p.semicolon ? '' : ' Только в настоящем коде в конце строки нужна точка с запятой.'));
      done();
    });
    show.addEventListener('click', () => fb.info('<code class="pr-call">' + esc(t.answer) + '</code>'));
  });

  /* Блок 2: найди ошибку */
  pager('pr-bug', BUGS, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text)) + '<p class="small">Нажми на строку с ошибкой.</p>'));
    const list = make('div', 'code pr-code pr-lines');
    const fb = feedback(box);
    t.code.split('\n').forEach((line) => {
      const b = make('button', 'pr-line', highlight(line) || ' ');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (line === t.bad) {
          b.classList.add('is-ok');
          fb.ok(esc(t.why) + '<br>Правильно: <code class="pr-call">' + esc(t.fix.trim()) + '</code>');
          done();
        } else {
          b.classList.add('is-no');
          fb.no('Эта строка в порядке. Подумай, что нужно для такого симптома.');
        }
      });
      list.appendChild(b);
    });
    box.insertBefore(list, fb.el);
  });

  /* Блок 2: порядок строк, кнопками и перетаскиванием */
  pager('pr-order', ORDER, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text))));
    const list = make('ol', 'pr-order');
    const fb = feedback(box);
    t.start.forEach((index) => {
      const li = make('li', 'pr-row');
      li.dataset.index = index;
      const grip = make('span', 'pr-grip', '<i></i><i></i><i></i>');
      grip.setAttribute('aria-hidden', 'true');
      const text = make('code', 'pr-row__text', highlight(t.lines[index]));
      const up = button('Выше', 'pr-mini');
      const down = button('Ниже', 'pr-mini');
      up.addEventListener('click', () => { if (li.previousElementSibling) list.insertBefore(li, li.previousElementSibling); });
      down.addEventListener('click', () => { if (li.nextElementSibling) list.insertBefore(li.nextElementSibling, li); });
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        li.classList.add('is-drag');
        const move = (ev) => {
          const prev = li.previousElementSibling;
          const next = li.nextElementSibling;
          if (prev && ev.clientY < prev.getBoundingClientRect().bottom - prev.offsetHeight / 2) list.insertBefore(li, prev);
          else if (next && ev.clientY > next.getBoundingClientRect().top + next.offsetHeight / 2) list.insertBefore(next, li);
        };
        const stop = () => {
          li.classList.remove('is-drag');
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', stop);
          grip.removeEventListener('pointercancel', stop);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', stop);
        grip.addEventListener('pointercancel', stop);
      });
      li.append(grip, text, up, down);
      list.appendChild(li);
    });
    box.insertBefore(list, fb.el);
    const row = make('div', 'pr-actions');
    const go = button('Проверить', 'btn--primary');
    row.appendChild(go);
    box.insertBefore(row, fb.el);
    go.addEventListener('click', () => {
      const now = [...list.children].map((li) => Number(li.dataset.index));
      if (now.every((v, i) => v === i)) {
        fb.ok('Верно: сначала читаем, потом считаем, потом действуем.');
        done();
      } else {
        fb.no('Порядок пока другой. Значение нельзя использовать раньше, чем оно получено.');
      }
    });
  });

  /* Блок 2: доработки проекта */
  pager('pr-proj', PROJECTS, (box, t, done) => {
    box.appendChild(make('div', '', big('<b>' + esc(t.title) + '.</b> ' + esc(t.text))));
    const row = make('div', 'pr-actions');
    const hint = button('Подсказка');
    const show = button('Показать решение');
    const yes = button('Получилось на плате', 'btn--primary');
    row.append(hint, show, yes);
    box.appendChild(row);
    const fb = feedback(box);
    hint.addEventListener('click', () => fb.info(esc(t.hint)));
    show.addEventListener('click', () => fb.info('<pre class="code pr-code">' + highlight(t.code) + '</pre>'));
    yes.addEventListener('click', () => {
      fb.ok('Отлично. Покажи учителю, как это работает.');
      done();
    });
  });

  /* Блок 3: ошибка на схеме. Схема одна: лёгкая для слабых компьютеров. */
  let faultView = null;
  pager('pr-fault', FAULTS, (box, t, done) => {
    if (faultView) faultView.destroy();
    box.appendChild(make('div', '', big(esc(t.text))));
    const stage = make('div', 'pr-stage');
    box.appendChild(stage);
    const fb = feedback(box);
    const wires = C.WIRES.map((w) => Object.assign({}, w, (t.wires || {})[w.id]));
    const parts = {};
    Object.keys(C.PARTS).forEach((id) => (parts[id] = Object.assign({}, C.PARTS[id], (t.parts || {})[id])));
    let found = false;
    faultView = createSchematic(stage, {
      step: 3, live: false, interactive: false, labels: false, wires, parts,
      onPick(id) {
        if (found) return;
        if (t.bad.includes(id)) {
          found = true;
          t.bad.forEach((b) => faultView.mark(b, 'ok'));
          fb.ok(esc(t.why));
          done();
        } else {
          faultView.mark(id, 'bad');
          fb.no('Здесь всё подключено верно. Смотри, куда идут концы проводов.');
        }
      },
    });
  });

  /* Блок 3: метка на шкале */
  pager('pr-mark', MARKS, (box, t, done) => {
    const [x, a, b, c, d] = t.args;
    const want = mapInt(...t.args);
    box.appendChild(make('div', '', big('Где окажется результат? ' + mono(callText(t.args)))));
    const holder = make('div', 'pr-rulers pr-hide');
    box.appendChild(holder);
    const rulers = createRulers(holder, { inMin: a, inMax: b, outMin: c, outMax: d, value: x, interactive: false, showValues: false, showPercent: false, inName: 'Вход', outName: 'Выход' });
    rulers.el.querySelector('.ruler--out .ruler__head').remove();
    const slider = make('input', 'range range--out');
    slider.id = 'pr-mark-' + t.id;
    slider.type = 'range';
    slider.min = 0;
    slider.max = 1000;
    slider.value = 0;
    slider.setAttribute('aria-label', 'Твоя метка на нижней шкале');
    const paintSlider = () => slider.style.setProperty('--fill', slider.value / 10 + '%');
    slider.addEventListener('input', paintSlider);
    paintSlider();
    holder.appendChild(slider);
    const row = make('div', 'pr-actions');
    const go = button('Проверить', 'btn--primary');
    row.appendChild(go);
    box.appendChild(row);
    const fb = feedback(box);
    go.addEventListener('click', () => {
      const f = slider.value / 1000;
      const correct = (x - a) / (b - a);
      if (Math.abs(f - correct) <= MARK_TOLERANCE) {
        holder.classList.remove('pr-hide');
        fb.ok('Верно. Точный ответ: ' + want + '.');
        done();
      } else {
        fb.no(f < correct ? 'Метка стоит левее, чем нужно. Какую долю пути прошёл вход?' : 'Метка стоит правее, чем нужно. Какую долю пути прошёл вход?');
      }
    });
  });

  /* Блок 3: настрой шкалу */
  function drawGauge(kind, value, min, max, unit) {
    if (kind === 'bar') {
      const f = ML.clamp((value - min) / (max - min || 1), 0, 1);
      return '<div class="pr-gauge-bar"><i style="width:' + f * 100 + '%"></i></div><div class="pr-gauge-text">' + value + esc(unit) + '</div>';
    }
    const angle = ML.clamp(value, -135, 135);
    return '<svg class="pr-needle" viewBox="0 0 200 118" role="img" aria-label="Стрелка показывает ' + value + ' градусов">' +
      '<path d="M20 108a80 80 0 0 1 160 0" fill="none" stroke="var(--line)" stroke-width="8"/>' +
      '<g transform="rotate(' + angle + ' 100 108)"><line x1="100" y1="108" x2="100" y2="34" stroke="var(--out)" stroke-width="5" stroke-linecap="round"/></g>' +
      '<circle cx="100" cy="108" r="8" fill="var(--out)"/></svg><div class="pr-gauge-text">' + value + esc(unit) + '</div>';
  }
  pager('pr-scale', SCALES, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text))));
    const v = Object.assign({}, t.start);
    const names = { inMin: 'in_min', inMax: 'in_max', outMin: 'out_min', outMax: 'out_max' };
    const line = make('div', 'pr-scaleline');
    ['inMin', 'inMax', 'outMin', 'outMax'].forEach((k) => {
      if (t.fields.includes(k)) {
        const inp = make('input', 'pr-input pr-input--small');
        inp.id = 'pr-scale-' + t.id + '-' + k;
        inp.value = v[k];
        inp.setAttribute('aria-label', names[k]);
        inp.autocomplete = 'off';
        inp.addEventListener('input', () => {
          const n = Number(inp.value.replace(/[−–]/g, '-'));
          if (!Number.isNaN(n)) v[k] = n;
          paint();
        });
        line.appendChild(inp);
      } else {
        line.appendChild(make('span', 'pr-fixed', String(v[k])));
      }
    });
    box.appendChild(make('p', 'pr-gen-call', '<code class="pr-call">map(x,</code>'));
    const wrap = box.lastChild;
    wrap.appendChild(line);
    wrap.appendChild(make('code', 'pr-call', ')'));
    const gauge = make('div', 'pr-gauge');
    box.appendChild(gauge);
    const lab = make('label', 'small', 'Проверь на разных значениях x');
    lab.setAttribute('for', 'pr-test-' + t.id);
    const test = make('input', 'range');
    test.id = 'pr-test-' + t.id;
    test.type = 'range';
    test.min = t.test.min;
    test.max = t.test.max;
    test.value = t.test.value;
    box.append(lab, test);
    test.addEventListener('input', paint);
    function paint() {
      const x = Number(test.value);
      test.style.setProperty('--fill', ((x - t.test.min) / (t.test.max - t.test.min)) * 100 + '%');
      const y = mapInt(x, v.inMin, v.inMax, v.outMin, v.outMax);
      gauge.innerHTML = y == null ? '<p class="small">Первые две границы равны: на ноль делить нельзя.</p>' : drawGauge(t.kind, y, 0, 100, t.unit);
    }
    paint();
    const row = make('div', 'pr-actions');
    const go = button('Проверить', 'btn--primary');
    const show = button('Показать решение');
    row.append(go, show);
    box.appendChild(row);
    const fb = feedback(box);
    go.addEventListener('click', () => {
      if (Object.keys(t.answer).every((k) => v[k] === t.answer[k])) {
        fb.ok('Верно, шкала настроена.');
        done();
      } else {
        fb.no('Пока не то. Подвигай ползунок и посмотри, что показывает прибор на концах шкалы.');
      }
    });
    show.addEventListener('click', () => {
      fb.info(Object.keys(t.answer).map((k) => names[k] + ' = ' + t.answer[k]).join(', '));
    });
  });

  /* Блок 3: какой график */
  pager('pr-graph', GRAPHS, (box, t, done) => {
    box.appendChild(make('div', '', big('Какой график подходит к строке ' + mono('map(x, ' + t.line.join(', ') + ')') + '?')));
    const grid = make('div', 'pr-graphs');
    box.appendChild(grid);
    const fb = feedback(box);
    t.options.forEach((opt, i) => {
      const b = make('button', 'pr-graph-opt');
      b.type = 'button';
      b.setAttribute('aria-label', 'График ' + (i + 1));
      grid.appendChild(b);
      createGraph(b, { inMin: opt[0], inMax: opt[1], outMin: opt[2], outMax: opt[3], showPoint: false, width: 220, height: 150, labelX: 'x', labelY: '' });
      b.addEventListener('click', () => {
        if (opt.every((v, n) => v === t.line[n])) {
          b.classList.add('is-ok');
          fb.ok('Верно. Смотри на два конца линии: что при x = 0 и что при x = 1023.');
          done();
        } else {
          b.classList.add('is-no');
          fb.no('Посмотри, какое значение получится при x = 0 и при x = 1023.');
        }
      });
    });
  });

  /* Блок 3: пары, кликами: работает и на телефоне */
  pager('pr-pairs', PAIRS, (box, t, done) => {
    box.appendChild(make('div', '', big(esc(t.text)) + '<p class="small">Нажми на строку слева, потом на её пару справа.</p>'));
    const grid = make('div', 'pr-pairs');
    const left = make('div', 'pr-col');
    const right = make('div', 'pr-col');
    grid.append(left, right);
    box.appendChild(grid);
    const fb = feedback(box);
    let picked = null;
    let matched = 0;
    t.pairs.forEach(([a], i) => {
      const b = make('button', 'pr-opt', esc(a));
      b.type = 'button';
      b.addEventListener('click', () => {
        if (b.disabled) return;
        left.querySelectorAll('.pr-opt').forEach((o) => o.classList.remove('is-picked'));
        b.classList.add('is-picked');
        picked = { i, b };
      });
      left.appendChild(b);
    });
    t.right.forEach((i) => {
      const b = make('button', 'pr-opt', esc(t.pairs[i][1]));
      b.type = 'button';
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (!picked) return fb.no('Сначала выбери строку слева.');
        if (picked.i === i) {
          [b, picked.b].forEach((o) => { o.disabled = true; o.classList.remove('is-picked'); o.classList.add('is-ok'); });
          picked = null;
          matched += 1;
          fb.clear();
          if (matched === t.pairs.length) {
            fb.ok('Все пары верны.');
            done();
          }
        } else {
          fb.no('Эта пара не подходит. Попробуй другую.');
        }
      });
      right.appendChild(b);
    });
  });

  paintScore();
})(typeof window !== 'undefined' ? window : globalThis);
