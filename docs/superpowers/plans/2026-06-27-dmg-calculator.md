# Калькулятор урона (орк-волшебник) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Самодостаточный `dnd-dmg.html` — мобильный калькулятор урона орка-волшебника, считающий 4 метрики методом Монте-Карло.

**Architecture:** Чистый движок бросков + декларативные описания способностей + симулятор-агрегатор разрабатываются как тестируемые ES-модули в `src/`. Build-скрипт инлайнит их (вместе с UI и Web Worker) в один офлайн-файл `dnd-dmg.html`. Тесты — на встроенном `node:test`, без внешних зависимостей.

**Tech Stack:** Vanilla JS (ES modules), Node 20 `node:test`, Web Worker, Canvas для гистограммы. Никаких npm-зависимостей, CDN, внешних шрифтов.

## Global Constraints

- Самодостаточность: итоговый `dnd-dmg.html` работает офлайн, без внешних запросов. Весь JS/CSS инлайн.
- Mobile-first: одноколоночный поток, отсутствие горизонтального скролла, тач-цели ≥44px, проверка на ширине 360px.
- Движок: Монте-Карло, по умолчанию 100 000 прогонов, ГПСЧ с фиксируемым зерном (детерминизм для тестов и режима проверки).
- Орочья слабость «+2 к магическому урону» — это ПОЛУЧАЕМЫЙ урон, в расчёт исходящего НЕ входит. Учитывается только «Рождённый в битве» (переброс «1–2» на кубике урона), по умолчанию включён.
- **Допущение о крите (задокументировано):** наши правила определяют натуральную 20 как авто-попадание, но НЕ задают удвоение кубиков урона. Поэтому крит = гарантированное попадание без удвоения дайсов. Поведение вынесено в единственную константу `CRIT_DOUBLES_DICE = false` в `src/engine.js` — флипнуть, если мастер судит иначе.
- Урон волшебника считается магическим. Зелье хаоса удваивает итоговый магический урон действия; Концентрация добавляет 2д6 к итогу действия.
- Все суммы кубиков урона применяют орочий переброс, если `mods.orcReroll === true`.

---

## File Structure

- `package.json` — `{"type":"module"}`, скрипты `test` и `build`.
- `src/engine.js` — ГПСЧ и примитивы бросков (чистые функции).
- `src/presets.js` — справочник классов/рас + расчёт пресета цели.
- `src/abilities.js` — декларативные способности волшебника.
- `src/simulator.js` — прогон Монте-Карло, агрегация метрик, сравнение.
- `src/ui.js` — построение DOM, обработчики, связь с Worker (грузится в браузере, не в тестах).
- `template.html` — каркас страницы + CSS (mobile-first).
- `build.js` — инлайнит src + ui + worker в `dnd-dmg.html`.
- `test/engine.test.js`, `test/presets.test.js`, `test/abilities.test.js`, `test/simulator.test.js` — тесты.
- `test/helpers.js` — `seqRng` (скриптованный ГПСЧ для детерминированных проверок).

---

## Task 1: Каркас проекта + ГПСЧ

**Files:**
- Create: `package.json`
- Create: `src/engine.js`
- Create: `test/helpers.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Produces: `makeRng(seed:number) -> () => number` (детерминированный поток в [0,1)); `test/helpers.js` экспортирует `seqRng(values:number[]) -> () => number` — выдаёт значения по очереди, бросает при выходе за предел.

- [ ] **Step 1: Создать package.json**

```json
{
  "name": "dnd-dmg",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "build": "node build.js"
  }
}
```

- [ ] **Step 2: Написать падающий тест на ГПСЧ**

`test/engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine.js';

test('makeRng детерминирован по зерну', () => {
  const a = makeRng(42), b = makeRng(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('makeRng выдаёт значения в [0,1)', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test('разные зёрна дают разные потоки', () => {
  const a = makeRng(1), b = makeRng(2);
  assert.notEqual(a(), b());
});
```

- [ ] **Step 3: Запустить тест — должен упасть**

Run: `node --test test/engine.test.js`
Expected: FAIL — `makeRng` не экспортируется / модуль не найден.

- [ ] **Step 4: Реализовать ГПСЧ (mulberry32)**

`src/engine.js`:
```js
// Детерминированный ГПСЧ (mulberry32). Возвращает функцию () -> [0,1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Создать test/helpers.js**

```js
// Скриптованный «ГПСЧ» для детерминированных тестов примитивов.
export function seqRng(values) {
  let i = 0;
  return function () {
    if (i >= values.length) throw new Error('seqRng исчерпан');
    return values[i++];
  };
}
```

- [ ] **Step 6: Запустить тест — должен пройти**

Run: `node --test test/engine.test.js`
Expected: PASS (3 теста).

- [ ] **Step 7: Commit**

```bash
git init -q 2>/dev/null; git add package.json src/engine.js test/engine.test.js test/helpers.js
git commit -m "feat: project scaffold and seeded RNG"
```

---

## Task 2: Примитивы бросков

**Files:**
- Modify: `src/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: `makeRng`, `seqRng`.
- Produces:
  - `rollDie(sides:number, rng, orcReroll:boolean) -> number` — бросок кубика; при `orcReroll` и выпадении 1–2 перебрасывает один раз и принимает новое значение.
  - `sumDice(n:number, sides:number, rng, orcReroll:boolean) -> number`.
  - `d20(rng) -> number` (1..20).
  - `resolveMode(adv:boolean, dis:boolean) -> 'adv'|'dis'|'none'` (взаимно гасятся).
  - `attackRoll(rng, mode:'adv'|'dis'|'none') -> number` (натуральное значение d20 с учётом преимущества/помехи).
  - `isHit(nat:number, bonus:number, ac:number) -> {hit:boolean, crit:boolean}` (нат.20 — крит-попадание; нат.1 — промах; иначе `nat+bonus>=ac`).
  - Константа `CRIT_DOUBLES_DICE = false`.

- [ ] **Step 1: Написать падающие тесты на примитивы**

Добавить в `test/engine.test.js`:
```js
import { rollDie, sumDice, d20, resolveMode, attackRoll, isHit, CRIT_DOUBLES_DICE } from '../src/engine.js';
import { seqRng } from './helpers.js';

test('rollDie без переброса: значение 1..sides', () => {
  // rng()=0 -> 1, rng()=0.999 -> sides
  assert.equal(rollDie(6, seqRng([0]), false), 1);
  assert.equal(rollDie(6, seqRng([0.999]), false), 6);
});

test('rollDie с орочьим перебросом: 1 перекидывается один раз', () => {
  // первый бросок -> 1 (rng=0), переброс -> 5 (rng=0.7 на d6 = floor(0.7*6)+1=5)
  assert.equal(rollDie(6, seqRng([0, 0.7]), true), 5);
});

test('rollDie с орочьим перебросом: 3 не перекидывается', () => {
  // floor(0.4*6)+1 = 3 -> остаётся, второй элемент не трогается
  assert.equal(rollDie(6, seqRng([0.4]), true), 3);
});

test('rollDie орочий переброс принимает новое значение даже если снова 1-2', () => {
  // 1 -> переброс -> 2 (принимаем, второй раз не перекидываем)
  assert.equal(rollDie(6, seqRng([0, 0.2]), true), 2);
});

test('sumDice складывает n кубиков', () => {
  assert.equal(sumDice(3, 6, seqRng([0, 0, 0]), false), 3);
});

test('resolveMode гасит преимущество и помеху', () => {
  assert.equal(resolveMode(true, true), 'none');
  assert.equal(resolveMode(true, false), 'adv');
  assert.equal(resolveMode(false, true), 'dis');
  assert.equal(resolveMode(false, false), 'none');
});

test('attackRoll adv берёт максимум двух d20', () => {
  // d20: floor(rng*20)+1. 0->1, 0.95->20. adv -> 20
  assert.equal(attackRoll(seqRng([0, 0.95]), 'adv'), 20);
});

test('attackRoll dis берёт минимум двух d20', () => {
  assert.equal(attackRoll(seqRng([0.95, 0]), 'dis'), 1);
});

test('isHit: нат.20 — крит', () => {
  assert.deepEqual(isHit(20, -5, 99), { hit: true, crit: true });
});

test('isHit: нат.1 — промах', () => {
  assert.deepEqual(isHit(1, 50, 5), { hit: false, crit: false });
});

test('isHit: обычное сравнение nat+bonus vs ac', () => {
  assert.deepEqual(isHit(10, 4, 14), { hit: true, crit: false });
  assert.deepEqual(isHit(10, 4, 15), { hit: false, crit: false });
});

test('CRIT_DOUBLES_DICE по умолчанию выключен', () => {
  assert.equal(CRIT_DOUBLES_DICE, false);
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `node --test test/engine.test.js`
Expected: FAIL — функции не экспортированы.

- [ ] **Step 3: Реализовать примитивы**

Добавить в `src/engine.js`:
```js
export const CRIT_DOUBLES_DICE = false;

export function rollDie(sides, rng, orcReroll) {
  let v = 1 + Math.floor(rng() * sides);
  if (orcReroll && v <= 2) v = 1 + Math.floor(rng() * sides);
  return v;
}

export function sumDice(n, sides, rng, orcReroll) {
  let total = 0;
  for (let i = 0; i < n; i++) total += rollDie(sides, rng, orcReroll);
  return total;
}

export function d20(rng) {
  return 1 + Math.floor(rng() * 20);
}

export function resolveMode(adv, dis) {
  if (adv && !dis) return 'adv';
  if (dis && !adv) return 'dis';
  return 'none';
}

export function attackRoll(rng, mode) {
  if (mode === 'none') return d20(rng);
  const a = d20(rng), b = d20(rng);
  return mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
}

export function isHit(nat, bonus, ac) {
  if (nat === 20) return { hit: true, crit: true };
  if (nat === 1) return { hit: false, crit: false };
  return { hit: nat + bonus >= ac, crit: false };
}
```

- [ ] **Step 4: Запустить — должны пройти**

Run: `node --test test/engine.test.js`
Expected: PASS (все тесты движка).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: dice primitives with orc reroll, advantage, crit"
```

---

## Task 3: Пресеты целей (справочник классов/рас)

**Files:**
- Create: `src/presets.js`
- Test: `test/presets.test.js`

**Interfaces:**
- Produces:
  - `CLASSES` — объект `{ key: { name, ac, hp } }` (базовые броня и здоровье из правил).
  - `RACES` — объект `{ key: { name, hpMod, acMod } }`.
  - `MILESTONES = [4, 8, 12, 16, 20]`.
  - `computePreset(raceKey, classKey, level) -> { ac:number, hp:number }`:
    `hp = CLASSES[c].hp + RACES[r].hpMod + 5 * (число вех ≤ level)`;
    `ac = CLASSES[c].ac + RACES[r].acMod`.

- [ ] **Step 1: Написать падающие тесты**

`test/presets.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, RACES, computePreset } from '../src/presets.js';

test('базовые значения класса из правил', () => {
  assert.equal(CLASSES.barbarian.ac, 10);
  assert.equal(CLASSES.barbarian.hp, 30);
  assert.equal(CLASSES.wizard.ac, 10);
  assert.equal(CLASSES.wizard.hp, 15);
});

test('расовые правки', () => {
  assert.equal(RACES.orc.hpMod, 5);
  assert.equal(RACES.halfling.hpMod, -5);
  assert.equal(RACES.dragonborn.acMod, 1);
  assert.equal(RACES.dwarf.acMod, 0);
});

test('computePreset дварф-варвар, 1 игра (нет вех)', () => {
  // ac=10+0=10, hp=30+0+0=30
  assert.deepEqual(computePreset('dwarf', 'barbarian', 1), { ac: 10, hp: 30 });
});

test('computePreset дварф-варвар, 8 игра (вехи 4 и 8 = +10)', () => {
  assert.deepEqual(computePreset('dwarf', 'barbarian', 8), { ac: 10, hp: 40 });
});

test('computePreset орк-варвар, 12 игра (вехи 4,8,12 = +15, орк +5)', () => {
  // hp = 30 + 5 + 15 = 50
  assert.deepEqual(computePreset('orc', 'barbarian', 12), { ac: 10, hp: 50 });
});

test('computePreset драконорождённый-воин даёт +1 КБ', () => {
  // воин ac 15 + 1 = 16
  assert.equal(computePreset('dragonborn', 'warrior', 1).ac, 16);
});
```

- [ ] **Step 2: Запустить — упадут**

Run: `node --test test/presets.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать справочник и расчёт**

`src/presets.js` (значения брони/здоровья — из «Правила Днд.txt», секция Классы; расовые правки — из секций Слабость/Способности):
```js
export const CLASSES = {
  warrior:   { name: 'Воин',        ac: 15, hp: 25 },
  barbarian: { name: 'Варвар',      ac: 10, hp: 30 },
  rogue:     { name: 'Плут',        ac: 12, hp: 15 },
  paladin:   { name: 'Паладин',     ac: 17, hp: 20 },
  druid:     { name: 'Друид',       ac: 10, hp: 25 },
  wizard:    { name: 'Волшебник',   ac: 10, hp: 15 },
  artificer: { name: 'Изобретатель',ac: 15, hp: 15 },
  cleric:    { name: 'Жрец',        ac: 15, hp: 20 },
  bard:      { name: 'Бард',        ac: 12, hp: 25 },
  ranger:    { name: 'Следопыт',    ac: 12, hp: 20 },
  necromancer:{ name: 'Некромант',  ac: 12, hp: 20 },
  monk:      { name: 'Монах',       ac: 10, hp: 30 },
};

export const RACES = {
  human:      { name: 'Человек',          hpMod: 0,  acMod: 0 },
  elf:        { name: 'Эльф',             hpMod: 0,  acMod: 0 },
  dwarf:      { name: 'Дварф',            hpMod: 0,  acMod: 0 },
  halfling:   { name: 'Полурослик',       hpMod: -5, acMod: 0 },
  orc:        { name: 'Орк',              hpMod: 5,  acMod: 0 },
  tiefling:   { name: 'Тифлинг',          hpMod: 0,  acMod: 0 },
  aasimar:    { name: 'Аасимар',          hpMod: 0,  acMod: 0 },
  tabaxi:     { name: 'Табакси',          hpMod: 0,  acMod: 0 },
  dragonborn: { name: 'Драконорождённый', hpMod: 0,  acMod: 1 },
  goblin:     { name: 'Гоблин',           hpMod: 0,  acMod: 0 },
  kitsune:    { name: 'Кицунэ',           hpMod: 0,  acMod: 0 },
};

export const MILESTONES = [4, 8, 12, 16, 20];

export function computePreset(raceKey, classKey, level) {
  const c = CLASSES[classKey];
  const r = RACES[raceKey];
  if (!c || !r) throw new Error('Неизвестный класс или раса');
  const reached = MILESTONES.filter((m) => m <= level).length;
  return {
    ac: c.ac + r.acMod,
    hp: c.hp + r.hpMod + 5 * reached,
  };
}
```

- [ ] **Step 4: Запустить — пройдут**

Run: `node --test test/presets.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presets.js test/presets.test.js
git commit -m "feat: target presets from class/race/level tables"
```

---

## Task 4: Способности без бросков попадания

**Files:**
- Create: `src/abilities.js`
- Test: `test/abilities.test.js`

**Interfaces:**
- Consumes: `rollDie`, `sumDice`, `attackRoll`, `isHit`, `resolveMode` из engine.
- Produces: массив `ABILITIES`, элементы — объекты:
  `{ id, name, charges:string, targeting:'single'|'area'|'chain', simulateOnce(ctx) -> number[] }`.
  `ctx = { rng, intBonus:number, targets:[{ac,hp}], mods:{ adv,dis,concentration,chaos,hex,orcReroll } }`.
  `simulateOnce` возвращает массив СЫРОГО магического урона по каждой цели (длиной `targets.length`), ДО применения глобальных модификаторов concentration/chaos (их применяет Task 6 в симуляторе).
- Эта задача добавляет: `magicMissiles` (3×(1д4+1) авто, бьёт по первым доступным целям, до 3), `staff` (1д4 атака по цели 0), `telekinesis` (1д4 атака по цели 0).

- [ ] **Step 1: Написать падающие тесты**

`test/abilities.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => ({
  rng: over.rng,
  intBonus: over.intBonus ?? 4,
  targets: over.targets ?? [{ ac: 12, hp: 30 }],
  mods: { adv: false, dis: false, concentration: false, chaos: false, hex: false, orcReroll: false, ...(over.mods || {}) },
});

test('magicMissiles: 3 снаряда 1д4+1 авто по одной цели', () => {
  // три кубика д4: 0->1, 0->1, 0->1 => (1+1)*3 = 6
  const dmg = get('magicMissiles').simulateOnce(ctx({ rng: seqRng([0, 0, 0]) }));
  assert.deepEqual(dmg, [6]);
});

test('magicMissiles распределяет снаряды по нескольким целям', () => {
  // 3 цели, по одному снаряду каждой: каждый д4=4 (rng 0.99) => 4+1=5
  const dmg = get('magicMissiles').simulateOnce(ctx({
    rng: seqRng([0.99, 0.99, 0.99]),
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  assert.deepEqual(dmg, [5, 5, 5]);
});

test('staff: попадание наносит 1д4, промах — 0', () => {
  // attackRoll none: d20 nat = floor(0.95*20)+1 = 20 (крит-попадание), урон д4=0.5->3
  const hit = get('staff').simulateOnce(ctx({ rng: seqRng([0.95, 0.5]) }));
  assert.deepEqual(hit, [3]);
  // nat = 1 (rng 0) -> промах, урон не бросается
  const miss = get('staff').simulateOnce(ctx({ rng: seqRng([0]) }));
  assert.deepEqual(miss, [0]);
});

test('telekinesis: атака 1д4 по цели 0', () => {
  const dmg = get('telekinesis').simulateOnce(ctx({ rng: seqRng([0.95, 0.99]) }));
  assert.deepEqual(dmg, [4]); // крит-попадание, д4=4
});
```

- [ ] **Step 2: Запустить — упадут**

Run: `node --test test/abilities.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать abilities.js (первые три)**

`src/abilities.js`:
```js
import { rollDie, sumDice, attackRoll, isHit, resolveMode } from './engine.js';

function zeros(n) { return new Array(n).fill(0); }

// Одиночная атака д20+intBonus по цели index; при попадании урон dice.
function singleAttack(ctx, index, sides) {
  const out = zeros(ctx.targets.length);
  const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
  const nat = attackRoll(ctx.rng, mode);
  const { hit } = isHit(nat, ctx.intBonus, ctx.targets[index].ac);
  if (hit) out[index] = rollDie(sides, ctx.rng, ctx.mods.orcReroll);
  return out;
}

export const ABILITIES = [
  {
    id: 'magicMissiles',
    name: 'Волшебные снаряды',
    charges: '3 раза в бой',
    targeting: 'area',
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = zeros(n);
      for (let i = 0; i < 3; i++) {
        const t = n === 0 ? -1 : i % n; // распределяем 3 снаряда по целям
        if (t < 0) break;
        out[t] += rollDie(4, ctx.rng, ctx.mods.orcReroll) + 1;
      }
      return out;
    },
  },
  {
    id: 'staff',
    name: 'Атака посохом',
    charges: 'без ограничений',
    targeting: 'single',
    simulateOnce(ctx) { return singleAttack(ctx, 0, 4); },
  },
  {
    id: 'telekinesis',
    name: 'Телекинез (атака)',
    charges: 'без ограничений',
    targeting: 'single',
    simulateOnce(ctx) { return singleAttack(ctx, 0, 4); },
  },
];
```

- [ ] **Step 4: Запустить — пройдут**

Run: `node --test test/abilities.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/abilities.js test/abilities.test.js
git commit -m "feat: auto-hit and simple attack abilities"
```

---

## Task 5: Огненный шар и цепная молния

**Files:**
- Modify: `src/abilities.js`
- Test: `test/abilities.test.js`

**Interfaces:**
- Consumes: всё из Task 4.
- Produces (добавляет в `ABILITIES`):
  - `fireball` (`targeting:'area'`): по каждой цели спасбросок д20+ловкость цели ≥15; провал → 6д6, успех → половина (округление вниз). Бонус спасброска цели берётся из `ctx.targetDexSave` (по умолчанию 0, см. ниже). При `mods.hex` цель кидает спасбросок с помехой.
  - `chainLightning` (`targeting:'chain'`): цель 0 — авто 2д6; затем для целей 1..3 последовательно атака д20+intBonus, при попадании 2д6, при первом промахе цепь рвётся (остальные 0).
- Расширение `ctx`: опциональное поле `targetDexSave:number` (модификатор спасброска целей от огненного шара; UI задаёт его, по умолчанию 0). Документируется в ctx.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `test/abilities.test.js`:
```js
test('fireball: провал спасброска = полный 6д6', () => {
  // спасбросок: attackRoll none d20 nat = floor(0*20)+1 = 1, +0 < 15 -> провал
  // затем 6 кубиков д6 по 0.99 -> 6 => 36
  const rng = seqRng([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const dmg = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(dmg, [36]);
});

test('fireball: успех спасброска = половина (вниз)', () => {
  // спасбросок d20 nat=20 (0.99) +0 >=15 -> успех; 6д6 по 0 ->6, половина=3
  const rng = seqRng([0.99, 0, 0, 0, 0, 0, 0]);
  const dmg = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(dmg, [3]);
});

test('chainLightning: цель 0 авто 2д6, цепь рвётся на промахе', () => {
  // цель0: 2д6 (0.99,0.99)=12
  // атака по цели1: nat=1 (rng 0) -> промах -> цепь рвётся, цель1 и далее 0
  const rng = seqRng([0.99, 0.99, 0]);
  const dmg = get('chainLightning').simulateOnce(ctx({
    rng,
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  assert.deepEqual(dmg, [12, 0, 0]);
});

test('chainLightning: успешная цепь по двум целям', () => {
  // цель0: 2д6=(0,0)->2; атака цель1 nat=20(0.99) попадание -> 2д6=(0,0)->2;
  // атака цель2 nat=1(0)-> промах -> 0
  const rng = seqRng([0, 0, 0.99, 0, 0, 0]);
  const dmg = get('chainLightning').simulateOnce(ctx({
    rng,
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  assert.deepEqual(dmg, [2, 2, 0]);
});
```

- [ ] **Step 2: Запустить — упадут**

Run: `node --test test/abilities.test.js`
Expected: FAIL — `fireball`/`chainLightning` не найдены.

- [ ] **Step 3: Реализовать (добавить в массив ABILITIES)**

В `src/abilities.js` добавить элементы в массив:
```js
  {
    id: 'fireball',
    name: 'Огненный шар',
    charges: '1 раз в бой',
    targeting: 'area',
    simulateOnce(ctx) {
      const out = zeros(ctx.targets.length);
      const saveBonus = ctx.targetDexSave ?? 0;
      const mode = ctx.mods.hex ? 'dis' : 'none'; // Сглаз = помеха спасброску цели
      for (let i = 0; i < ctx.targets.length; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat !== 1 && (nat === 20 || nat + saveBonus >= 15);
        const full = sumDice(6, 6, ctx.rng, ctx.mods.orcReroll);
        out[i] = saved ? Math.floor(full / 2) : full;
      }
      return out;
    },
  },
  {
    id: 'chainLightning',
    name: 'Цепная молния',
    charges: '2 раза в бой',
    targeting: 'chain',
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = zeros(n);
      if (n === 0) return out;
      out[0] = sumDice(2, 6, ctx.rng, ctx.mods.orcReroll); // авто по первой цели
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const maxChain = Math.min(n - 1, 3); // ещё до 3 перенаправлений
      for (let i = 1; i <= maxChain; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const { hit } = isHit(nat, ctx.intBonus, ctx.targets[i].ac);
        if (!hit) break; // цепь развеивается
        out[i] = sumDice(2, 6, ctx.rng, ctx.mods.orcReroll);
      }
      return out;
    },
  },
```

- [ ] **Step 4: Запустить — пройдут**

Run: `node --test test/abilities.test.js`
Expected: PASS (все тесты способностей).

- [ ] **Step 5: Commit**

```bash
git add src/abilities.js test/abilities.test.js
git commit -m "feat: fireball saves and chain lightning sequencing"
```

---

## Task 6: Симулятор и глобальные модификаторы

**Files:**
- Create: `src/simulator.js`
- Test: `test/simulator.test.js`

**Interfaces:**
- Consumes: `makeRng` из engine; ability-объекты (с `simulateOnce`).
- Produces:
  - `applyModifiers(perTarget:number[], ctx) -> number[]` — применяет глобальные модификаторы к СЫРОМУ урону действия:
    Концентрация (`mods.concentration`): к итогу первой ненулевой цели прибавить `sumDice(2,6,ctx.rng,orcReroll)`;
    Зелье хаоса (`mods.chaos`): весь массив ×2.
    Порядок: сперва концентрация, затем хаос (хаос удваивает и бонус концентрации — оба «магический урон этого действия»).
  - `runAbility(ability, baseCtx, opts) -> metrics`, где `opts = { trials:number, seed:number }`, `baseCtx` = ctx без `rng` (rng создаётся внутри на каждый прогон НЕ заново — один поток на весь прогон).
    Возвращает:
    ```
    {
      perTargetMean: number[],      // среднее по каждой цели
      groupMean, groupMin, groupMax,// по суммарному урону за прогон
      groupFreq: Map<number,number>,// частоты суммарного урона (для гистограммы/перцентилей)
      killCount: number[],          // сколько прогонов убили цель i (урон>=hp)
      trials
    }
    ```
  - `pAtLeast(groupFreq, trials, x:number) -> number` — доля прогонов с суммарным уроном ≥ x.
  - `killChance(metrics, i) -> number` — `killCount[i]/trials`.
  - `compareAbilities(abilities, baseCtx, opts) -> Array<{id,name,charges,groupMean}>` отсортирован по `groupMean` убыв.

- [ ] **Step 1: Написать падающие тесты**

`test/simulator.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyModifiers, runAbility, pAtLeast, killChance, compareAbilities } from '../src/simulator.js';
import { seqRng } from './helpers.js';

const baseCtx = (over) => ({
  intBonus: 4,
  targets: over?.targets ?? [{ ac: 12, hp: 30 }],
  targetDexSave: over?.targetDexSave ?? 0,
  mods: { adv: false, dis: false, concentration: false, chaos: false, hex: false, orcReroll: false, ...(over?.mods || {}) },
});

test('applyModifiers без модификаторов не меняет урон', () => {
  const ctx = { ...baseCtx(), rng: seqRng([]) };
  assert.deepEqual(applyModifiers([10, 0, 5], ctx), [10, 0, 5]);
});

test('applyModifiers хаос удваивает весь урон', () => {
  const ctx = { ...baseCtx({ mods: { chaos: true } }), rng: seqRng([]) };
  assert.deepEqual(applyModifiers([10, 0, 5], ctx), [20, 0, 10]);
});

test('applyModifiers концентрация добавляет 2д6 первой ненулевой цели', () => {
  // 2д6 по 0.99,0.99 = 12; цель0=0 пропускается, добавится цели1
  const ctx = { ...baseCtx({ mods: { concentration: true } }), rng: seqRng([0.99, 0.99]) };
  assert.deepEqual(applyModifiers([0, 5, 3], ctx), [0, 17, 3]);
});

test('runAbility агрегирует среднее (детерминированное авто-попадание)', () => {
  // magicMissiles: 3×(1д4+1) авто. Среднее д4 = 2.5 (+1)=3.5, ×3=10.5 по одной цели.
  const fakeAbility = {
    id: 'x', name: 'X', charges: '',
    simulateOnce: (ctx) => [ctx.targets.length], // 1 урон * targets — детерминированно
  };
  const m = runAbility(fakeAbility, baseCtx(), { trials: 1000, seed: 7 });
  assert.equal(m.groupMean, 1);
  assert.equal(m.trials, 1000);
});

test('runAbility считает killCount и killChance', () => {
  const ability = { id: 'k', name: 'K', charges: '', simulateOnce: () => [100] };
  const m = runAbility(ability, baseCtx({ targets: [{ ac: 12, hp: 30 }] }), { trials: 50, seed: 1 });
  assert.equal(m.killCount[0], 50);
  assert.equal(killChance(m, 0), 1);
});

test('pAtLeast возвращает долю прогонов', () => {
  const ability = { id: 'c', name: 'C', charges: '', simulateOnce: () => [10] };
  const m = runAbility(ability, baseCtx(), { trials: 100, seed: 1 });
  assert.equal(pAtLeast(m.groupFreq, m.trials, 10), 1);
  assert.equal(pAtLeast(m.groupFreq, m.trials, 11), 0);
});

test('compareAbilities сортирует по среднему урону убыв', () => {
  const a = { id: 'a', name: 'A', charges: '', simulateOnce: () => [5] };
  const b = { id: 'b', name: 'B', charges: '', simulateOnce: () => [20] };
  const rows = compareAbilities([a, b], baseCtx(), { trials: 10, seed: 1 });
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
});

test('Монте-Карло огненного шара близок к ожидаемому среднему', async () => {
  const { ABILITIES } = await import('../src/abilities.js');
  const fb = ABILITIES.find((x) => x.id === 'fireball');
  // одна цель, dex save bonus = 0 (нужно >=15 -> шанс провала высокий)
  const m = runAbility(fb, baseCtx({ targets: [{ ac: 10, hp: 999 }] }), { trials: 50000, seed: 123 });
  // грубая вилка: среднее в диапазоне 18..27
  assert.ok(m.groupMean > 18 && m.groupMean < 27, `mean=${m.groupMean}`);
});
```

- [ ] **Step 2: Запустить — упадут**

Run: `node --test test/simulator.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать simulator.js**

`src/simulator.js`:
```js
import { makeRng, sumDice } from './engine.js';

export function applyModifiers(perTarget, ctx) {
  let out = perTarget.slice();
  if (ctx.mods.concentration) {
    const bonus = sumDice(2, 6, ctx.rng, ctx.mods.orcReroll);
    const idx = out.findIndex((v) => v > 0);
    if (idx >= 0) out[idx] += bonus;
  }
  if (ctx.mods.chaos) out = out.map((v) => v * 2);
  return out;
}

export function runAbility(ability, baseCtx, opts) {
  const trials = opts.trials;
  const rng = makeRng(opts.seed);
  const n = baseCtx.targets.length;
  const perTargetSum = new Array(n).fill(0);
  const killCount = new Array(n).fill(0);
  const groupFreq = new Map();
  let groupMin = Infinity, groupMax = -Infinity;

  for (let t = 0; t < trials; t++) {
    const ctx = { ...baseCtx, rng };
    const raw = ability.simulateOnce(ctx);
    const dmg = applyModifiers(raw, ctx);
    let group = 0;
    for (let i = 0; i < n; i++) {
      perTargetSum[i] += dmg[i];
      group += dmg[i];
      if (dmg[i] >= baseCtx.targets[i].hp) killCount[i]++;
    }
    groupFreq.set(group, (groupFreq.get(group) || 0) + 1);
    if (group < groupMin) groupMin = group;
    if (group > groupMax) groupMax = group;
  }

  let groupSum = 0;
  for (const [g, c] of groupFreq) groupSum += g * c;

  return {
    perTargetMean: perTargetSum.map((s) => s / trials),
    groupMean: groupSum / trials,
    groupMin: groupMin === Infinity ? 0 : groupMin,
    groupMax: groupMax === -Infinity ? 0 : groupMax,
    groupFreq,
    killCount,
    trials,
  };
}

export function pAtLeast(groupFreq, trials, x) {
  let count = 0;
  for (const [g, c] of groupFreq) if (g >= x) count += c;
  return count / trials;
}

export function killChance(metrics, i) {
  return metrics.killCount[i] / metrics.trials;
}

export function compareAbilities(abilities, baseCtx, opts) {
  return abilities
    .map((a) => {
      const m = runAbility(a, baseCtx, opts);
      return { id: a.id, name: a.name, charges: a.charges, groupMean: m.groupMean };
    })
    .sort((x, y) => y.groupMean - x.groupMean);
}
```

- [ ] **Step 4: Запустить — пройдут**

Run: `node --test test/simulator.test.js`
Expected: PASS.

- [ ] **Step 5: Прогнать все тесты**

Run: `node --test`
Expected: PASS — все наборы (engine, presets, abilities, simulator).

- [ ] **Step 6: Commit**

```bash
git add src/simulator.js test/simulator.test.js
git commit -m "feat: Monte Carlo simulator, modifiers, metrics, comparison"
```

---

## Task 7: UI и шаблон страницы (mobile-first)

**Files:**
- Create: `template.html`
- Create: `src/ui.js`

**Interfaces:**
- Consumes (через инлайн при сборке): `ABILITIES`, `runAbility`, `pAtLeast`, `killChance`, `compareAbilities`, `computePreset`, `CLASSES`, `RACES`.
- Produces: глобальную функцию `initUI(root)`, навешиваемую на `DOMContentLoaded`. Расчёт запускается в Web Worker (инлайн-Blob), сообщения: `{type:'run', ability, baseCtx, opts}` -> `{type:'result', metrics}` и `{type:'compare', baseCtx, opts}` -> `{type:'comparison', rows}`.

Примечание: эта задача создаёт исходники UI; визуальная проверка — в Task 9 после сборки. Юнит-тестов на DOM нет (проверяется глазами в браузере), поэтому TDD-цикл здесь заменяется ручной верификацией в Task 9.

- [ ] **Step 1: Создать template.html (каркас + mobile-first CSS)**

`template.html` (плейсхолдеры `/*ENGINE*/` и `/*UI*/` заменит build.js):
```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Калькулятор урона — орк-волшебник</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #14161a; color: #e8e8e8; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 12px; }
  h1 { font-size: 1.2rem; margin: 8px 0; }
  .result { position: sticky; top: 0; z-index: 5; background: #1d2026; border: 1px solid #333;
            border-radius: 12px; padding: 12px; margin-bottom: 12px; }
  .big { font-size: 2rem; font-weight: 700; color: #ffce54; }
  .row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
  label { font-size: .85rem; color: #aab; }
  select, input[type=number] { font-size: 1rem; padding: 10px; min-height: 44px;
            background: #0f1115; color: #e8e8e8; border: 1px solid #444; border-radius: 8px; width: 100%; }
  .stepper { display: flex; align-items: center; gap: 6px; }
  .stepper button { min-width: 44px; min-height: 44px; font-size: 1.3rem; border-radius: 8px;
            border: 1px solid #444; background: #2a2e36; color: #fff; }
  .target { border: 1px solid #333; border-radius: 10px; padding: 10px; margin: 8px 0; }
  .toggle { display: flex; align-items: center; gap: 8px; min-height: 44px; }
  .toggle input { width: 22px; height: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #2a2e36; }
  .scroll { overflow-x: auto; }
  canvas { width: 100%; height: 120px; background: #0f1115; border-radius: 8px; }
  button.primary { background: #4a7; color: #06210f; font-weight: 700; border: none;
            border-radius: 10px; padding: 12px; min-height: 48px; width: 100%; font-size: 1rem; }
  .muted { color: #889; font-size: .8rem; }
</style>
</head>
<body>
<div class="wrap" id="app"></div>
<script>
/*ENGINE*/
</script>
<script>
/*UI*/
document.addEventListener('DOMContentLoaded', () => initUI(document.getElementById('app')));
</script>
</body>
</html>
```

- [ ] **Step 2: Создать src/ui.js**

`src/ui.js` — строит интерфейс, держит состояние, гоняет расчёт в Worker. Все символы движка доступны глобально (инлайнятся в той же области видимости при сборке).
```js
function initUI(root) {
  const state = {
    intBonus: 4,
    abilityId: 'fireball',
    targets: [{ ac: 12, hp: 30, dexSave: 0 }],
    mods: { adv: false, dis: false, concentration: false, chaos: false, hex: false, orcReroll: true },
    trials: 100000,
    seed: 1,
  };

  // --- Worker (инлайн) ---
  const worker = makeWorker();
  worker.onmessage = (e) => {
    if (e.data.type === 'result') renderResult(e.data.metrics);
    if (e.data.type === 'comparison') renderComparison(e.data.rows);
  };

  root.innerHTML = `
    <h1>Урон — орк-волшебник</h1>
    <div class="result" id="result"><div class="muted">Считаю…</div></div>
    <div class="row">
      <div style="flex:1"><label>Способность</label>
        <select id="ability">${ABILITIES.map((a) => `<option value="${a.id}">${a.name} (${a.charges})</option>`).join('')}</select>
      </div>
    </div>
    <div class="row">
      <div style="flex:1"><label>Интеллект (бонус атаки)</label>
        <div class="stepper"><button data-int="-1">−</button><input type="number" id="int" value="${state.intBonus}"><button data-int="1">+</button></div>
      </div>
    </div>
    <div id="mods"></div>
    <h1>Цели</h1>
    <div id="targets"></div>
    <button class="primary" id="addTarget">+ Цель</button>
    <h1>Сравнение способностей</h1>
    <div class="scroll"><table id="compare"></table></div>
    <p class="muted">Монте-Карло, ${state.trials.toLocaleString('ru')} прогонов. Пресет КБ/HP — оценка по расе/классу/уровню, боевые баффы не учитываются.</p>
  `;

  document.getElementById('ability').value = state.abilityId;
  document.getElementById('ability').onchange = (e) => { state.abilityId = e.target.value; run(); };
  root.querySelectorAll('[data-int]').forEach((b) => b.onclick = () => {
    state.intBonus += Number(b.dataset.int); document.getElementById('int').value = state.intBonus; run();
  });
  document.getElementById('int').onchange = (e) => { state.intBonus = Number(e.target.value); run(); };
  document.getElementById('addTarget').onclick = () => { state.targets.push({ ac: 12, hp: 30, dexSave: 0 }); renderTargets(); run(); };

  renderMods();
  renderTargets();
  run();

  function renderMods() {
    const defs = [
      ['orcReroll', 'Орочий переброс «1–2»'],
      ['concentration', 'Концентрация (+2д6)'],
      ['chaos', 'Зелье хаоса (×2)'],
      ['adv', 'Преимущество'],
      ['dis', 'Помеха'],
      ['hex', 'Сглаз (помеха спасброску цели)'],
    ];
    document.getElementById('mods').innerHTML = defs.map(([k, label]) =>
      `<label class="toggle"><input type="checkbox" data-mod="${k}" ${state.mods[k] ? 'checked' : ''}>${label}</label>`).join('');
    document.querySelectorAll('[data-mod]').forEach((c) => c.onchange = () => { state.mods[c.dataset.mod] = c.checked; run(); });
  }

  function renderTargets() {
    const raceOpts = Object.entries(RACES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    const classOpts = Object.entries(CLASSES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    document.getElementById('targets').innerHTML = state.targets.map((t, i) => `
      <div class="target">
        <div class="row"><strong>Цель ${i + 1}</strong>
          ${state.targets.length > 1 ? `<button data-del="${i}" style="margin-left:auto;min-height:44px">Удалить</button>` : ''}</div>
        <div class="row">
          <div style="flex:1"><label>КБ</label><input type="number" data-ac="${i}" value="${t.ac}"></div>
          <div style="flex:1"><label>HP</label><input type="number" data-hp="${i}" value="${t.hp}"></div>
        </div>
        <div class="row">
          <div style="flex:1"><label>Пресет: раса</label><select data-prace="${i}">${raceOpts}</select></div>
          <div style="flex:1"><label>класс</label><select data-pclass="${i}">${classOpts}</select></div>
          <div style="flex:1"><label>игра</label><input type="number" data-plevel="${i}" value="1"></div>
        </div>
        <button data-applypreset="${i}" style="min-height:44px">Применить пресет</button>
      </div>`).join('');

    document.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { state.targets.splice(Number(b.dataset.del), 1); renderTargets(); run(); });
    document.querySelectorAll('[data-ac]').forEach((el) => el.onchange = () => { state.targets[Number(el.dataset.ac)].ac = Number(el.value); run(); });
    document.querySelectorAll('[data-hp]').forEach((el) => el.onchange = () => { state.targets[Number(el.dataset.hp)].hp = Number(el.value); run(); });
    document.querySelectorAll('[data-applypreset]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.applypreset);
      const race = document.querySelector(`[data-prace="${i}"]`).value;
      const klass = document.querySelector(`[data-pclass="${i}"]`).value;
      const level = Number(document.querySelector(`[data-plevel="${i}"]`).value);
      const p = computePreset(race, klass, level);
      state.targets[i].ac = p.ac; state.targets[i].hp = p.hp;
      renderTargets(); run();
    });
  }

  function baseCtx() {
    return {
      intBonus: state.intBonus,
      targets: state.targets.map((t) => ({ ac: t.ac, hp: t.hp })),
      targetDexSave: 0,
      mods: { ...state.mods },
    };
  }

  function run() {
    const opts = { trials: state.trials, seed: state.seed };
    worker.postMessage({ type: 'run', abilityId: state.abilityId, baseCtx: baseCtx(), opts });
    worker.postMessage({ type: 'compare', baseCtx: baseCtx(), opts });
  }

  function renderResult(m) {
    const perTarget = m.perTargetMean.map((v, i) => `Цель ${i + 1}: ${v.toFixed(1)} (убить: ${Math.round((m.killCount[i] / m.trials) * 100)}%)`).join(' · ');
    document.getElementById('result').innerHTML = `
      <div class="muted">Ожидаемый урон по группе</div>
      <div class="big">${m.groupMean.toFixed(1)}</div>
      <div class="muted">мин ${m.groupMin} · макс ${m.groupMax}</div>
      <div style="margin-top:6px">${perTarget}</div>
      <canvas id="hist" width="600" height="120"></canvas>`;
    drawHist(m);
  }

  function drawHist(m) {
    const c = document.getElementById('hist'); if (!c) return;
    const ctx2 = c.getContext('2d');
    ctx2.clearRect(0, 0, c.width, c.height);
    const entries = [...m.groupFreq.entries()].sort((a, b) => a[0] - b[0]);
    if (!entries.length) return;
    const maxC = Math.max(...entries.map((e) => e[1]));
    const minG = entries[0][0], maxG = entries[entries.length - 1][0];
    const span = Math.max(1, maxG - minG);
    ctx2.fillStyle = '#ffce54';
    for (const [g, cnt] of entries) {
      const x = ((g - minG) / span) * (c.width - 4);
      const h = (cnt / maxC) * (c.height - 4);
      ctx2.fillRect(x, c.height - h, Math.max(2, (c.width - 4) / span), h);
    }
  }

  function renderComparison(rows) {
    document.getElementById('compare').innerHTML =
      `<tr><th>Способность</th><th>Ср. урон</th><th>Заряды</th></tr>` +
      rows.map((r) => `<tr><td>${r.name}</td><td>${r.groupMean.toFixed(1)}</td><td class="muted">${r.charges}</td></tr>`).join('');
  }
}
```

- [ ] **Step 3: Commit (исходники UI; проверка после сборки)**

```bash
git add template.html src/ui.js
git commit -m "feat: mobile-first UI and worker wiring (source)"
```

---

## Task 8: Build-скрипт — сборка самодостаточного HTML

**Files:**
- Create: `build.js`

**Interfaces:**
- Consumes: `src/engine.js`, `src/presets.js`, `src/abilities.js`, `src/simulator.js`, `src/ui.js`, `template.html`.
- Produces: `dnd-dmg.html` — единый офлайн-файл. Внутри: весь код движка (без `import`/`export`, склеен в один скоуп), inline Web Worker как Blob, UI. Также экспортирует функцию `makeWorker()` (используется в ui.js), создающую Worker из Blob с кодом движка + симулятора + обработчиком сообщений.

- [ ] **Step 1: Написать build.js**

`build.js`:
```js
import { readFileSync, writeFileSync } from 'node:fs';

// Снимаем строки import/export, чтобы склеить модули в один скоуп.
function strip(src) {
  return src
    .replace(/^\s*import[^;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

const engine = strip(readFileSync('src/engine.js', 'utf8'));
const presets = strip(readFileSync('src/presets.js', 'utf8'));
const abilities = strip(readFileSync('src/abilities.js', 'utf8'));
const simulator = strip(readFileSync('src/simulator.js', 'utf8'));
const ui = readFileSync('src/ui.js', 'utf8');

// Код, который поедет внутрь Worker: движок + способности + симулятор + диспетчер.
const workerCore = [engine, presets, abilities, simulator, `
const ABILITY_MAP = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
self.onmessage = (e) => {
  const { type, abilityId, baseCtx, opts } = e.data;
  if (type === 'run') {
    const m = runAbility(ABILITY_MAP[abilityId], baseCtx, opts);
    // Map не сериализуется в structured clone? сериализуем groupFreq как массив пар.
    self.postMessage({ type: 'result', metrics: { ...m, groupFreq: [...m.groupFreq] } });
  }
  if (type === 'compare') {
    self.postMessage({ type: 'comparison', rows: compareAbilities(ABILITIES, baseCtx, opts) });
  }
};
`].join('\n');

// makeWorker создаёт Worker из Blob. Плюс в основном потоке нужны ABILITIES, computePreset,
// CLASSES, RACES, и восстановление Map из массива пар в onmessage обёртке.
const mainGlue = `
${engine}
${presets}
${abilities}
function makeWorker() {
  const code = ${JSON.stringify(workerCore)};
  const blob = new Blob([code], { type: 'application/javascript' });
  const w = new Worker(URL.createObjectURL(blob));
  const realPost = w.onmessage;
  return new Proxy(w, {
    get(t, p) {
      if (p === 'onmessage') return t._wrapped;
      return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
    },
    set(t, p, v) {
      if (p === 'onmessage') {
        t._wrapped = v;
        t.onmessage = (e) => {
          const d = e.data;
          if (d.type === 'result') d.metrics.groupFreq = new Map(d.metrics.groupFreq);
          v(e);
        };
        return true;
      }
      t[p] = v; return true;
    },
  });
}
`;

const engineBlock = mainGlue + '\n' + simulator; // simulator нужен и в основном потоке (на всякий)
const tpl = readFileSync('template.html', 'utf8');
const out = tpl.replace('/*ENGINE*/', engineBlock).replace('/*UI*/', ui);
writeFileSync('dnd-dmg.html', out);
console.log('dnd-dmg.html собран,', out.length, 'байт');
```

- [ ] **Step 2: Собрать**

Run: `node build.js`
Expected: вывод `dnd-dmg.html собран, <N> байт`; файл создан.

- [ ] **Step 3: Проверить отсутствие внешних запросов и наличие ключевых символов**

Run: `grep -c "initUI\|runAbility\|makeWorker" dnd-dmg.html && grep -ci "http://\|https://\|cdn" dnd-dmg.html`
Expected: первое число ≥ 3; второе — `0` (внешних URL нет).

- [ ] **Step 4: Commit**

```bash
git add build.js dnd-dmg.html
git commit -m "build: inline single-file self-contained HTML"
```

---

## Task 9: Верификация в браузере + мобильная проверка

**Files:**
- Modify: при нахождении багов — соответствующий `src/*.js`, затем пересборка.

- [ ] **Step 1: Открыть и проверить расчёт через Playwright (desktop)**

Использовать MCP Playwright: `browser_navigate` на `file:///Users/ki.romanov/dnd/dnd-dmg.html`, затем `browser_snapshot`.
Expected: виден блок результата с числом ожидаемого урона, селектор способностей, список целей, таблица сравнения.

- [ ] **Step 2: Проверить интерактивность**

Через `browser_select_option` сменить способность на «Огненный шар», `browser_click` по «+ Цель» дважды (3 цели), затем `browser_snapshot`.
Expected: групповой урон огненного шара растёт с числом целей; гистограмма перерисовывается; таблица сравнения отсортирована по убыванию урона.

- [ ] **Step 3: Проверить пресет цели**

Выбрать у цели расу «Дварф», класс «Варвар», игру `8`, нажать «Применить пресет».
Expected: поля КБ=10, HP=40.

- [ ] **Step 4: Мобильная ширина (360px)**

`browser_resize` 360×800, `browser_snapshot` + `browser_take_screenshot`.
Expected: нет горизонтального скролла, блок результата «липкий» сверху, элементы в одну колонку, кнопки крупные.

- [ ] **Step 5: Проверить консоль на ошибки**

`browser_console_messages`.
Expected: нет ошибок (особенно про Worker / structured clone / Map).

- [ ] **Step 6: Зафиксировать результат проверки**

Если найдены баги — починить в `src/`, `node build.js`, повторить шаги. Когда чисто:
```bash
git add -A
git commit -m "test: verify single-file calculator in browser, desktop and mobile"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие спеки:**
- Самодостаточный HTML → Task 8. Mobile-first → Task 7 (CSS) + Task 9 (проверка 360px). Монте-Карло + зерно + Worker → Task 6 + Task 8. Орочий переброс / «+2 маг.урон» как защитный → Task 2 + Global Constraints. Способности (снаряды, молния, шар, телекинез, посох, модификаторы) → Tasks 4–6. Независимые цели КБ/HP + пресеты → Task 3 + Task 7. 4 метрики (среднее, разброс/гистограмма/шанс убить, сравнение, урон по группе) → Task 6 + Task 7. Допущение о крите → Global Constraints + Task 2.
- Гэпов не найдено.

**Скан плейсхолдеров:** не обнаружено — во всех шагах с кодом приведён полный код.

**Согласованность типов:** `ctx`/`baseCtx` поля (`intBonus`, `targets[{ac,hp}]`, `targetDexSave`, `mods{adv,dis,concentration,chaos,hex,orcReroll}`, `rng`) едины в Tasks 4–7. `metrics` (`perTargetMean`, `groupMean`, `groupMin/Max`, `groupFreq`, `killCount`, `trials`) согласованы между Task 6 (создание) и Task 7 (рендер). `groupFreq` — `Map`, сериализуется в массив пар на границе Worker (Task 8) и восстанавливается в `Map` в `makeWorker` обёртке/перед `drawHist`.
