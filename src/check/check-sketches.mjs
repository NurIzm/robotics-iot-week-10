/* Проверка скетчей: компилирует настоящий код из sketches.js с заглушкой Arduino.h, прогоняет loop()
   и сравнивает выходы с MapLab.sim — виртуальная плата на странице обязана вести себя как код.
   Запуск: node check/check-sketches.mjs */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
require(join(here, '../core.js'));
require(join(here, '../sketches.js'));
const { SKETCHES, sim, mapInt, pwmBits } = globalThis.MapLab;

const MOCK = String.raw`
#pragma once
#include <cstdio>
#include <cstdint>
const int A0 = 14, A1 = 15, A2 = 16, A3 = 17, A4 = 18, A5 = 19;
const int HIGH = 1, LOW = 0, INPUT = 0, OUTPUT = 1, INPUT_PULLUP = 2;
extern int g_pot, g_btn, g_mode[32], g_pwm[32], g_tone, g_toneCalls;
inline int analogRead(int) { return g_pot; }
inline int digitalRead(int) { return g_btn; }
inline void pinMode(int p, int m) { g_mode[p] = m; }
inline void analogWrite(int p, int v) { g_pwm[p] = v; }
inline void tone(int, unsigned int f) { g_tone = (int)f; g_toneCalls++; }
inline void noTone(int) { g_tone = -1; }
inline void delay(unsigned long) {}
inline long map(long x, long a, long b, long c, long d) { return (x - a) * (d - c) / (b - a) + c; }
struct SerialT {
  void begin(long) {}
  void print(const char *s) { printf("S:%s", s); }
  void print(int v) { printf("S:%d", v); }
  void println(const char *s) { printf("S:%s\n", s); }
  void println(int v) { printf("S:%d\n", v); }
};
extern SerialT Serial;
`;

const HARNESS = String.raw`
#include "Arduino.h"
#include <cstdio>
#include <cstdlib>
int g_pot, g_btn = HIGH, g_mode[32], g_pwm[32], g_tone = -1, g_toneCalls;
SerialT Serial;
void setup();
void loop();
int main(int argc, char **argv) {
  setup();
  for (int i = 1; i + 1 < argc; i += 2) {
    g_pot = atoi(argv[i]);
    g_btn = atoi(argv[i + 1]);
    loop();
    printf("O:%d %d %d %d\n", g_pwm[5], g_pwm[6], g_pwm[9], g_tone);
  }
  return 0;
}
`;

const dir = mkdtempSync(join(tmpdir(), 'sk-'));
writeFileSync(join(dir, 'Arduino.h'), MOCK);
writeFileSync(join(dir, 'harness.cpp'), HARNESS);

function run(index, inputs) {
  const src = join(dir, `s${index}.cpp`);
  writeFileSync(src, `#include "Arduino.h"\n${SKETCHES[index].code}`);
  const bin = join(dir, `s${index}`);
  execFileSync('g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-I', dir, src, join(dir, 'harness.cpp'), '-o', bin], { stdio: 'pipe' });
  const out = execFileSync(bin, inputs.flatMap(([p, b]) => [String(p), String(b)])).toString();
  return out.split('\n').filter((l) => l.startsWith('O:')).map((l) => l.slice(2).split(' ').map(Number));
}

const pots = [0, 1, 255, 256, 511, 512, 767, 1022, 1023];

// Шаги 1–3: выходы платы совпадают с виртуальной Arduino.
for (const step of [0, 1, 2]) {
  const rows = run(step, pots.map((p) => [p, 1]));
  rows.forEach(([r, g, b, tone], i) => {
    const d = sim({ step, pot: pots[i], soundMode: false, pressed: false });
    assert.deepStrictEqual([r, g, b], [d.led, d.led, d.led], `шаг ${step + 1}, pot ${pots[i]}`);
    assert.strictEqual(tone === -1 ? null : tone, d.tone, `шаг ${step + 1}, tone при pot ${pots[i]}`);
  });
}

// Шаг 4: удержание кнопки переключает режим один раз, отпускание не переключает.
const seq = [
  [100, 1], [100, 0], [100, 0], [100, 1], [900, 1], [900, 0], [900, 1], [512, 1], [512, 0], [512, 1],
];
const rows = run(3, seq);
let soundMode = false;
let pressed = false;
rows.forEach(([r, g, b, tone], i) => {
  const [pot, btn] = seq[i];
  const down = btn === 0;
  if (down && !pressed) soundMode = !soundMode;
  pressed = down;
  const d = sim({ step: 3, pot, soundMode, pressed });
  assert.deepStrictEqual([r, g, b], [d.led, d.led, d.led], `шаг 4, строка ${i}`);
  assert.strictEqual(tone === -1 ? null : tone, d.tone, `шаг 4, tone, строка ${i}`);
});

// Контрольные значения из материалов урока.
assert.strictEqual(mapInt(512, 0, 1023, 0, 255), 127);
assert.strictEqual(mapInt(512, 0, 1023, 200, 2000), 1100);
assert.strictEqual(mapInt(1023, 0, 1023, 200, 2000), 2000);
assert.strictEqual(mapInt(0, 0, 1023, 255, 0), 255);
assert.strictEqual(mapInt(1200, 0, 1023, 0, 255), 299);
assert.strictEqual(pwmBits(300), 44);
assert.strictEqual(pwmBits(1023), 255);

console.log('ok: 4 скетча компилируются без предупреждений, поведение совпадает с виртуальной платой');
