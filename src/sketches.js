/* sketches.js — скетчи для четырёх шагов. Это настоящий код: его компилирует и прогоняет
   check/check-sketches.mjs. live — живые значения в конце строки, dim — строки ветки,
   которая сейчас не выполняется. d — результат MapLab.sim(state). */
(function (root) {
  'use strict';
  const NS = (root.MapLab = root.MapLab || {});

  NS.SKETCHES = [
    {
      file: 'shag1_map.ino',
      code: `// Шаг 1. Читаем потенциометр и переводим 0–1023 в 0–255
const int potPin = A0;   // средняя ножка потенциометра

void setup() {
  Serial.begin(9600);    // связь с компьютером
}

void loop() {
  int potValue = analogRead(potPin);                // 0…1023
  int brightness = map(potValue, 0, 1023, 0, 255);  // 0…255

  Serial.print("pot = ");
  Serial.print(potValue);
  Serial.print("   map = ");
  Serial.println(brightness);

  delay(200);            // пауза, чтобы успеть прочитать числа
}
`,
      live: [
        { find: 'int potValue = analogRead', text: (d) => 'potValue = ' + d.pot },
        { find: 'int brightness = map', text: (d) => 'brightness = ' + d.mapped },
      ],
      serial: (d) => 'pot = ' + d.pot + '   map = ' + d.mapped,
      serialMs: 200,
    },
    {
      file: 'shag2_rgb.ino',
      code: `// Шаг 2. Потенциометр управляет яркостью RGB-светодиода
const int potPin   = A0;
const int redPin   = 5;   // пины с волной ~ умеют analogWrite
const int greenPin = 6;
const int bluePin  = 9;

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
}

void loop() {
  int potValue = analogRead(potPin);                // 0…1023
  int brightness = map(potValue, 0, 1023, 0, 255);  // 0…255

  analogWrite(redPin, brightness);    // одинаковая яркость
  analogWrite(greenPin, brightness);  // на всех каналах
  analogWrite(bluePin, brightness);   // даёт белый свет
}
`,
      live: [
        { find: 'int potValue = analogRead', text: (d) => 'potValue = ' + d.pot },
        { find: 'int brightness = map', text: (d) => 'brightness = ' + d.mapped },
      ],
      serial: null,
    },
    {
      file: 'shag3_zvuk.ino',
      code: `// Шаг 3. Потенциометр управляет частотой звука
const int potPin    = A0;
const int buzzerPin = 4;

void setup() {
  pinMode(buzzerPin, OUTPUT);
}

void loop() {
  int potValue = analogRead(potPin);                   // 0…1023
  int frequency = map(potValue, 0, 1023, 200, 2000);   // 200…2000 Гц

  tone(buzzerPin, frequency);   // пищим с этой частотой
  delay(10);
}
`,
      live: [
        { find: 'int potValue = analogRead', text: (d) => 'potValue = ' + d.pot },
        { find: 'int frequency = map', text: (d) => 'frequency = ' + d.freq + ' Гц' },
      ],
      serial: null,
    },
    {
      file: 'muzykalnyj_regulyator.ino',
      code: `// Шаг 4. Музыкальный регулятор: кнопка меняет режим
const int potPin    = A0;
const int buttonPin = 2;
const int buzzerPin = 4;
const int redPin    = 5;
const int greenPin  = 6;
const int bluePin   = 9;

bool soundMode = false;    // false — свет, true — звук
bool wasPressed = false;   // была ли кнопка нажата в прошлый раз

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);   // нажата = LOW
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  Serial.begin(9600);
}

void setBrightness(int value) {
  analogWrite(redPin, value);
  analogWrite(greenPin, value);
  analogWrite(bluePin, value);
}

void loop() {
  bool pressed = digitalRead(buttonPin) == LOW;

  if (pressed && !wasPressed) {       // кнопку только что нажали
    soundMode = !soundMode;           // меняем режим
    Serial.println(soundMode ? "mode: SOUND" : "mode: LIGHT");
  }
  wasPressed = pressed;

  int potValue = analogRead(potPin);

  if (soundMode) {
    int frequency = map(potValue, 0, 1023, 200, 2000);
    setBrightness(0);
    tone(buzzerPin, frequency);
  } else {
    int brightness = map(potValue, 0, 1023, 0, 255);
    noTone(buzzerPin);
    setBrightness(brightness);
  }

  delay(20);   // короткая пауза заодно гасит дребезг кнопки
}
`,
      live: [
        { find: 'bool soundMode = false', text: (d) => 'soundMode = ' + d.soundMode },
        { find: 'int potValue = analogRead', text: (d) => 'potValue = ' + d.pot },
        { find: 'int frequency = map', text: (d) => (d.soundMode ? 'frequency = ' + d.freq + ' Гц' : '') },
        { find: 'int brightness = map', text: (d) => (d.soundMode ? '' : 'brightness = ' + d.mapped) },
      ],
      dim: [
        { from: 'if (soundMode) {', to: '} else {', when: (d) => !d.soundMode },
        { from: '} else {', to: 'delay(20);', when: (d) => d.soundMode },
      ],
      serial: null,
      serialOnMode: (d) => (d.soundMode ? 'mode: SOUND' : 'mode: LIGHT'),
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
