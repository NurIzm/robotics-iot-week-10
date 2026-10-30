/* Проверка цепи: собирает реальные узлы макетки и подтверждает, что схема соответствует задумке
   на каждом шаге. Запуск: node check/check-circuit.js */
const assert = require('assert');
require('../circuit.js');
const C = globalThis.MapLab.CIRCUIT;

function nets(step) {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const join = (a, b) => parent.set(find(a), find(b));

  for (const w of C.WIRES) if (w.step <= step) join(C.node(w.from), C.node(w.to));
  // Ножки кнопки напротив друг друга через канавку соединены внутри корпуса всегда.
  if (C.PARTS.btn.step <= step) {
    join(C.node(C.PARTS.btn.legs.a1), C.node(C.PARTS.btn.legs.a2));
    join(C.node(C.PARTS.btn.legs.b1), C.node(C.PARTS.btn.legs.b2));
  }
  return (ref) => find(C.node(ref));
}

// Уникальность занятых отверстий на финальном шаге.
const used = new Map();
const take = (ref, who) => {
  assert(!used.has(ref), `Отверстие ${ref} занято дважды: ${used.get(ref)} и ${who}`);
  used.set(ref, who);
};
for (const [id, p] of Object.entries(C.PARTS)) for (const leg of Object.values(p.legs)) take(leg, id);
for (const w of C.WIRES) {
  if (!w.from.startsWith('uno:')) take(w.from, w.id);
  if (!w.to.startsWith('uno:')) take(w.to, w.id);
}

// Каждая ссылка существует и даёт координаты.
for (const w of C.WIRES) C.wirePoints(w).forEach((p) => assert(Number.isFinite(p.x) && Number.isFinite(p.y)));

// Сборка покрывает все детали и провода, каждый ровно один раз и по шагам подряд.
const ids = C.ITEMS.map((i) => i.id);
assert.strictEqual(new Set(ids).size, ids.length);
assert.deepStrictEqual([...ids].sort(), [...Object.keys(C.PARTS), ...C.WIRES.map((w) => w.id)].sort());
C.ITEMS.reduce((prev, it) => (assert(it.step >= prev, 'порядок шагов сборки'), it.step), 0);

const P = C.PARTS;
const expectations = [
  { step: 0, same: [['uno:5V', P.pot.legs.vcc], ['uno:GND.2', P.pot.legs.gnd], ['uno:A0', P.pot.legs.out]] },
  { step: 1, same: [['uno:D5', P.r1.legs.a], [P.r1.legs.b, P.rgb.legs.r], ['uno:D6', P.r2.legs.a], [P.r2.legs.b, P.rgb.legs.g], ['uno:D9', P.r3.legs.a], [P.r3.legs.b, P.rgb.legs.b], ['uno:GND.2', P.rgb.legs.k]] },
  { step: 2, same: [['uno:D4', P.buz.legs.plus], ['uno:GND.2', P.buz.legs.minus]] },
  { step: 3, same: [['uno:D2', P.btn.legs.a1], ['uno:GND.2', P.btn.legs.b2]] },
];

for (let step = 0; step < 4; step++) {
  const net = nets(step);
  for (const e of expectations) if (e.step <= step) for (const [a, b] of e.same) assert.strictEqual(net(a), net(b), `шаг ${step + 1}: ${a} и ${b} не соединены`);

  // Никаких коротких замыканий: все сигналы в разных узлах.
  const signals = ['uno:5V', 'uno:GND.2', 'uno:A0'];
  if (step >= 1) signals.push('uno:D5', 'uno:D6', 'uno:D9', P.r1.legs.b, P.r2.legs.b, P.r3.legs.b);
  if (step >= 2) signals.push('uno:D4');
  if (step >= 3) signals.push('uno:D2');
  const seen = new Map();
  for (const s of signals) {
    const n = net(s);
    assert(!seen.has(n), `шаг ${step + 1}: замыкание ${seen.get(n)} и ${s}`);
    seen.set(n, s);
  }
}

// Кнопка разомкнута до нажатия и замыкает пин 2 на GND при нажатии.
{
  const net = nets(3);
  assert.notStrictEqual(net('uno:D2'), net('uno:GND.2'));
  assert.strictEqual(net(P.btn.legs.a1), net('uno:D2'));
  assert.strictEqual(net(P.btn.legs.b1), net('uno:GND.2'));
}

// ШИМ: светодиод на пинах с ШИМ и не на таймере tone() (пины 3 и 11).
for (const pin of ['D5', 'D6', 'D9']) {
  assert(C.UNO_LABEL[pin].startsWith('~'), `${pin} без ШИМ`);
  assert(!['D3', 'D11'].includes(pin));
}

// Провода с via не пересекаются: на одной стороне платы вложенные дуги.
for (const side of [(w) => w.via < 0, (w) => w.via > 50]) {
  const arcs = C.WIRES.filter((w) => w.via != null && side(w)).map((w) => {
    const pts = C.wirePoints(w);
    return { id: w.id, lo: Math.min(pts[1].x, pts[2].x), hi: Math.max(pts[1].x, pts[2].x), depth: Math.abs(w.via) };
  });
  for (const a of arcs) for (const b of arcs) {
    if (a === b || a.depth >= b.depth) continue;
    assert(b.lo < a.lo && b.hi > a.hi, `провода ${a.id} и ${b.id} пересекаются`);
  }
}

console.log(`ok: ${C.ITEMS.length} элементов сборки, ${C.WIRES.length} проводов, 4 шага без замыканий и пересечений`);
