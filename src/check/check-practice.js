/* Проверка заданий без браузера: ответы, генератор, разбор строки, ошибки в коде и на схеме.
   Запуск: node check/check-practice.js */
const assert = require('assert');
const { execFileSync } = require('child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

require('../core.js');
require('../circuit.js');
require('../practice/practice.js');
const { mapInt, PRACTICE: P, CIRCUIT: C } = globalThis.MapLab;

/* Генератор: 2000 примеров на уровень. */
P.GEN.forEach((gen, level) => {
  for (let i = 0; i < 2000; i++) {
    const args = gen();
    const y = mapInt(...args);
    assert(Number.isInteger(y), `уровень ${level}: ${args}`);
    if (level === 0) assert.strictEqual(((args[0] - args[1]) * (args[4] - args[3])) % (args[2] - args[1]), 0, `лёгкий пример с дробью: ${args}`);
    const steps = P.solveSteps(args);
    assert(steps[steps.length - 1].endsWith('= ' + y), `разбор расходится с mapInt: ${args} → ${steps}`);
  }
});

/* Задачи из жизни: ответы сверены вручную отдельно от кода. */
const WORD_ANSWERS = { w1: 50, w2: 75, w3: 25, w4: 2, w5: 45, w6: 79, w7: 50, w8: 50, w9: 1400, w10: 127 };
P.WORD.forEach((t) => assert.strictEqual(mapInt(...t.args), WORD_ANSWERS[t.id], t.id));

/* Разбор строки map(). */
const parse = P.parseMapLine;
P.WRITE.forEach((t) => {
  const p = parse(t.answer);
  assert(p.ok, t.answer);
  assert(P.checkMapLine(p.range, t.target).ok, t.answer);
});
for (const good of ['int y = map(x, 0, 1023, 0, 255);', 'y=map( x ,0,1023,0,255)', 'map(potValue, 0, 1023, 0, 255);', 'long z = map(a, 0, 1023, 0, 255) ;']) {
  assert(parse(good).ok, good);
}
assert(P.checkMapLine(parse('int y = map(x, 1023, 0, 255, 0);').range, [0, 1023, 0, 255]).ok, 'обратная запись той же шкалы');
assert(!P.checkMapLine(parse('int y = map(x, 0, 255, 0, 1023);').range, [0, 1023, 0, 255]).ok, 'перепутанные диапазоны');
assert(/перепутаны/.test(P.checkMapLine([0, 255, 0, 1023], [0, 1023, 0, 255]).msg));
assert(/ноль/.test(P.checkMapLine([5, 5, 0, 10], [0, 1023, 0, 255]).msg));
assert(!P.checkMapLine([0, 1023, 0, 254], [0, 1023, 0, 255]).ok, 'другой конец шкалы');
for (const [bad, needle] of [['', 'Напиши'], ['Map(x, 0, 1023, 0, 255);', 'маленькими'], ['int y = map(x, 0, 1023, 0, 255', 'скобки'], ['y = x + 1;', 'нет вызова'], ['map(x, 0, 1023, 255);', '5 значений'], ['map(x, 0, a, 0, 255);', 'не целое']]) {
  const r = parse(bad);
  assert(!r.ok && r.msg.includes(needle), `${bad} → ${r.msg}`);
}

/* Пропуски: у каждого есть ответ. */
P.FILL.forEach((t) => assert(/\[\[.+?\]\]/.test(t.code), t.id));

/* Найди ошибку: bad встречается ровно один раз, исправленный код компилируется и отличается. */
const MOCK = `#pragma once
const int A0 = 14; const int HIGH = 1, LOW = 0, INPUT = 0, OUTPUT = 1, INPUT_PULLUP = 2;
inline int analogRead(int) { return 0; } inline int digitalRead(int) { return 1; }
inline void pinMode(int, int) {} inline void analogWrite(int, int) {} inline void digitalWrite(int, int) {}
inline void tone(int, unsigned int) {} inline void noTone(int) {} inline void delay(unsigned long) {}
inline long map(long x, long a, long b, long c, long d) { return (x - a) * (d - c) / (b - a) + c; }
struct SerialT { void begin(long) {} void println(int) {} }; __attribute__((unused)) static SerialT Serial;
`;
const dir = mkdtempSync(join(tmpdir(), 'pr-'));
writeFileSync(join(dir, 'Arduino.h'), MOCK);
const compile = (name, code) => {
  const src = join(dir, name + '.cpp');
  writeFileSync(src, `#include "Arduino.h"\n${code}\nint main() { setup(); loop(); return 0; }\n`);
  execFileSync('g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-I', dir, '-c', src, '-o', join(dir, name + '.o')], { stdio: 'pipe' });
};
P.BUGS.forEach((t) => {
  const lines = t.code.split('\n');
  assert.strictEqual(lines.filter((l) => l === t.bad).length, 1, `${t.id}: строка с ошибкой`);
  assert.notStrictEqual(t.bad, t.fix);
  compile(t.id, t.code.replace(t.bad, t.fix));
});

/* Решения доработок компилируются внутри скетча шага 4. */
const HEAD = `const int buttonPin = 2; const int buzzerPin = 4; const int redPin = 5; const int greenPin = 6; const int bluePin = 9;
int mode = 0; bool wasPressed = false; void setBrightness(int) {} void setup() {}`;
P.PROJECTS.forEach((t) => {
  compile(t.id, `${HEAD}\nvoid loop() {\n  bool pressed = false; int potValue = 512; int frequency = 1100; (void)pressed; (void)frequency;\n  ${t.id === 'p1' ? 'int brightness = 0; (void)brightness; { ' + t.code + ' (void)brightness; }' : t.code}\n}`);
});

/* Порядок строк: начальная перестановка не совпадает с верной. */
P.ORDER.forEach((t) => {
  assert.deepStrictEqual([...t.start].sort((a, b) => a - b), t.lines.map((_, i) => i), t.id);
  assert.notDeepStrictEqual(t.start, t.lines.map((_, i) => i), t.id);
});

/* Поломки схемы: настоящие узлы макетки показывают, что цепь действительно сломана. */
function nets(wires, parts) {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    while (parent.get(a) !== a) a = parent.get(a);
    return a;
  };
  const join2 = (a, b) => parent.set(find(a), find(b));
  wires.forEach((w) => join2(C.node(w.from), C.node(w.to)));
  join2(C.node(parts.btn.legs.a1), C.node(parts.btn.legs.a2));
  join2(C.node(parts.btn.legs.b1), C.node(parts.btn.legs.b2));
  return (ref) => find(C.node(ref));
}
const apply = (t) => {
  const wires = C.WIRES.map((w) => Object.assign({}, w, (t.wires || {})[w.id]));
  const parts = {};
  Object.keys(C.PARTS).forEach((id) => (parts[id] = Object.assign({}, C.PARTS[id], (t.parts || {})[id])));
  return { wires, parts, net: nets(wires, parts) };
};
const F = Object.fromEntries(P.FAULTS.map((t) => [t.id, apply(t)]));
const OK = apply({});
const legs = C.PARTS;
assert.strictEqual(OK.net('uno:A0'), OK.net(legs.pot.legs.out));

assert.notStrictEqual(F.v1.net('uno:A0'), F.v1.net(legs.pot.legs.out), 'v1: A0 должен отвалиться от ножки');
assert.strictEqual(F.v2.net(legs.rgb.legs.k), F.v2.net('uno:5V'), 'v2: катод на 5V');
assert.notStrictEqual(F.v3.net('uno:D4'), F.v3.net(legs.buz.legs.plus), 'v3: buzzer без сигнала');
assert.strictEqual(F.v4.net('uno:D2'), F.v4.net('uno:GND.2'), 'v4: пин 2 всегда на GND');
assert.strictEqual(C.node(F.v5.parts.r1.legs.a), C.node(F.v5.parts.r1.legs.b), 'v5: резистор не перекинут');
assert.notStrictEqual(F.v5.net('uno:D5'), F.v5.net(legs.rgb.legs.r), 'v5: красный без сигнала');
assert.strictEqual(F.v6.net('uno:5V'), F.v6.net('bn2'), 'v6: 5V на минусовой рейке');
assert.strictEqual(F.v6.net('uno:GND.2'), F.v6.net('bp2'), 'v6: GND на плюсовой рейке');
P.FAULTS.forEach((t) => t.bad.forEach((id) => assert(C.PARTS[id] || C.WIRES.some((w) => w.id === id), `${t.id}: нет элемента ${id}`)));

/* Метки, шкалы, графики, пары. */
P.MARKS.forEach((t) => assert(Number.isInteger(mapInt(...t.args)), t.id));
assert.strictEqual(mapInt(120, 120, 900, 0, 100), 0);
assert.strictEqual(mapInt(900, 120, 900, 0, 100), 100);
P.SCALES.forEach((t) => {
  const v = Object.assign({}, t.start, t.answer);
  assert.notDeepStrictEqual(v, t.start, `${t.id}: начальное значение уже верное`);
  assert.strictEqual(Object.keys(t.answer).sort().join(), [...t.fields].sort().join(), t.id);
});
P.GRAPHS.forEach((t) => {
  const same = t.options.filter((o) => o.every((v, i) => v === t.line[i]));
  assert.strictEqual(same.length, 1, t.id);
  assert.strictEqual(new Set(t.options.map(String)).size, t.options.length, t.id);
});
P.PAIRS.forEach((t) => {
  assert.deepStrictEqual([...t.right].sort((a, b) => a - b), t.pairs.map((_, i) => i), t.id);
  assert.notDeepStrictEqual(t.right, t.pairs.map((_, i) => i), t.id);
});

rmSync(dir, { recursive: true, force: true });
const ids = [P.WORD, P.FILL, P.WRITE, P.BUGS, P.ORDER, P.PROJECTS, P.FAULTS, P.MARKS, P.SCALES, P.GRAPHS, P.PAIRS].flat().map((t) => t.id);
assert.strictEqual(new Set(ids).size, ids.length, 'повторяются id заданий');
console.log(`ok: ${P.total} заданий, генератор на 6000 примеров, код ошибок компилируется, поломки схемы подтверждены`);
