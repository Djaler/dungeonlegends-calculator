# Калькулятор урона — Фундамент (План 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переоснастить движок калькулятора урона на расширяемую архитектуру (типы урона, модель героя, пайплайн модификаторов на типизированных пакетах, декларативные параметры способностей, glob-сборка способностей по классам) и мигрировать существующего волшебника на новый контракт без потери поведения.

**Architecture:** Слои: `engine.js` (кубы/броски/крит) → `types.js` (типы и категории урона) → `characters.js` (таблицы классов/рас, вывод статов, пресеты целей) → `abilities/<class>.js` + `abilities/index.js` (способности, каждая возвращает типизированные пакеты урона) → `modifiers.js` (пайплайн: аддитив → множитель → правила цели) → `simulator.js` (Монте-Карло). `build.js` склеивает всё в один `dnd-dmg.html` с Web Worker, подхватывая `abilities/*.js` автоматически.

**Tech Stack:** Чистый ES-модульный JavaScript, без зависимостей. Тесты — `node --test`. Сборка — `node build.js`.

## Global Constraints

- Никаких внешних зависимостей, CDN, сетевых запросов — всё инлайн в один файл `dnd-dmg.html`.
- Движок — Монте-Карло; ГПСЧ детерминированный (`makeRng(seed)`); в тестах используется `seqRng` из `test/helpers.js`.
- Крит не удваивает кубы урона: `CRIT_DOUBLES_DICE = false` (сохранить).
- Все идентификаторы статов: `str, dex, con, wis, int, cha` (con = Стойкость).
- Типы урона и категории: `physical → 'physical'`; `magic, fire, lightning, necrotic, psychic, radiant → 'magic'`.
- Способность возвращает на каждую цель **массив пакетов** `{ type, amount }`; пустой массив `[]` = ноль урона по цели.
- Комментарии и сообщения — на русском, в стиле существующего кода.
- Коммиты — conventional commits; ветка `feat/dmg-calculator` (scope в сообщении опускаем, таск-кода в ветке нет).

---

## File Structure

- `src/engine.js` — **Modify**: добавить параметр `critRange` в `isHit`.
- `src/types.js` — **Create**: таблица `TYPES`, `categoryOf(type)`.
- `src/characters.js` — **Create**: `CLASSES`, `RACES`, `MILESTONES`, `deriveStats()`, `computePreset()` (перенос+расширение из `presets.js`).
- `src/presets.js` — **Delete** (содержимое поглощено `characters.js`).
- `src/abilities/wizard.js` — **Create**: способности волшебника на новом контракте (перенос из `abilities.js`).
- `src/abilities/index.js` — **Create**: сбор `ABILITIES`.
- `src/abilities.js` — **Delete** (заменён каталогом `abilities/`).
- `src/modifiers.js` — **Create**: `applyPipeline(packets, ctx) → number[]` и подфункции.
- `src/simulator.js` — **Modify**: `runAbility` использует пакеты + `applyPipeline`; убрать старый `applyModifiers`.
- `build.js` — **Modify**: glob `src/abilities/*.js`, использование `characters.js`.
- `test/types.test.js`, `test/characters.test.js`, `test/modifiers.test.js` — **Create**.
- `test/abilities.test.js`, `test/simulator.test.js`, `test/presets.test.js` — **Modify** (миграция; `presets.test.js` → `characters.test.js`).

---

## Task 1: Типы урона (`types.js`)

**Files:**
- Create: `src/types.js`
- Test: `test/types.test.js`

**Interfaces:**
- Produces: `TYPES` (объект `{ [type]: { cat: 'physical'|'magic' } }`); `categoryOf(type) → 'physical'|'magic'` (бросает `Error` на неизвестном типе).

- [ ] **Step 1: Write the failing test**

```js
// test/types.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, categoryOf } from '../src/types.js';

test('physical относится к категории physical', () => {
  assert.equal(categoryOf('physical'), 'physical');
});

test('магические подтипы относятся к категории magic', () => {
  for (const t of ['magic', 'fire', 'lightning', 'necrotic', 'psychic', 'radiant']) {
    assert.equal(categoryOf(t), 'magic', `${t} должен быть magic`);
  }
});

test('TYPES содержит все 7 типов', () => {
  assert.deepEqual(
    Object.keys(TYPES).sort(),
    ['fire', 'lightning', 'magic', 'necrotic', 'physical', 'psychic', 'radiant'],
  );
});

test('categoryOf бросает на неизвестном типе', () => {
  assert.throws(() => categoryOf('holy'), /неизвестный тип/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/types.test.js`
Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/types.js
// Тип урона → категория. Категория ('physical'/'magic') — то, на что смотрят
// зелья (ярость ×2 физ, хаос ×2 маг) и расовые правила цели.
export const TYPES = {
  physical:  { cat: 'physical' },
  magic:     { cat: 'magic' },
  fire:      { cat: 'magic' },
  lightning: { cat: 'magic' },
  necrotic:  { cat: 'magic' },
  psychic:   { cat: 'magic' },
  radiant:   { cat: 'magic' },
};

export function categoryOf(type) {
  const t = TYPES[type];
  if (!t) throw new Error(`Неизвестный тип урона: ${type}`);
  return t.cat;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/types.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types.js test/types.test.js
git commit -m "feat: damage type taxonomy with physical/magic categories"
```

---

## Task 2: Диапазон крита в движке (`engine.js`)

**Files:**
- Modify: `src/engine.js:42-46` (функция `isHit`)
- Test: `test/engine.test.js` (добавить кейсы)

**Interfaces:**
- Consumes: ничего нового.
- Produces: `isHit(nat, bonus, ac, critRange = 20) → { hit, crit }`. Натуралка `>= critRange` (и не 1) считается критическим авто-попаданием. `nat === 1` — всегда промах. Сигнатура обратносовместима (старые вызовы без `critRange` работают как раньше).

- [ ] **Step 1: Write the failing test**

```js
// добавить в test/engine.test.js
test('isHit: critRange 18 делает натуралку 18 крит-попаданием мимо КБ', () => {
  const r = isHit(18, 0, 99, 18); // 18+0 < 99, но 18 >= critRange -> крит
  assert.deepEqual(r, { hit: true, crit: true });
});

test('isHit: critRange по умолчанию 20 (натуралка 19 — обычный бросок)', () => {
  assert.deepEqual(isHit(19, 0, 99), { hit: false, crit: false });
  assert.deepEqual(isHit(20, 0, 99), { hit: true, crit: true });
});

test('isHit: натуралка 1 — всегда промах даже при низком critRange', () => {
  assert.deepEqual(isHit(1, 50, 5, 2), { hit: false, crit: false });
});
```

Убедись, что в начале `test/engine.test.js` импортирован `isHit` (если нет — добавь в существующий импорт из `../src/engine.js`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — первый кейс получит `{hit:false,crit:false}` (старая `isHit` игнорирует `critRange`).

- [ ] **Step 3: Write minimal implementation**

Заменить функцию `isHit` в `src/engine.js`:

```js
export function isHit(nat, bonus, ac, critRange = 20) {
  if (nat === 1) return { hit: false, crit: false };
  if (nat >= critRange) return { hit: true, crit: true };
  return { hit: nat + bonus >= ac, crit: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine.test.js`
Expected: PASS (включая прежние кейсы).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: configurable crit range in isHit"
```

---

## Task 3: Таблицы классов/рас и вывод статов (`characters.js`)

**Files:**
- Create: `src/characters.js`
- Delete: `src/presets.js`
- Create: `test/characters.test.js`
- Delete: `test/presets.test.js`

**Interfaces:**
- Produces:
  - `CLASSES[key] = { name, ac, hp, dice, weaponStat, stats: {str,dex,con,wis,int,cha} }`.
  - `RACES[key] = { name, hpMod, acMod, statMods: {..}, orcReroll?: true, onIncoming?: { physical?:{add?,mult?}, magic?:{add?,mult?} } }`.
  - `MILESTONES = [4,8,12,16,20]`.
  - `deriveStats(classKey, raceKey, game, bumps?) → {str,dex,con,wis,int,cha}` — база класса + расовые `statMods` + (`game>=8` ? `+1` к двум статам из `bumps`, по умолчанию две наивысшие базы).
  - `computePreset(raceKey, classKey, game) → { ac, hp, dex }` — для пресетов целей (как раньше: база класса + расовые правки + `+5 HP` за каждую достигнутую веху). `dex` = бонус ловкости цели (для спасброска).

- [ ] **Step 1: Write the failing test**

```js
// test/characters.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, RACES, deriveStats, computePreset } from '../src/characters.js';

test('CLASSES: волшебник имеет полный набор статов и оружие посох(dex)', () => {
  const w = CLASSES.wizard;
  assert.equal(w.dice, '1d4');
  assert.equal(w.weaponStat, 'dex');
  assert.deepEqual(w.stats, { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 });
});

test('deriveStats: орк-волшебник на 1 игре = база класса + расовые правки', () => {
  // орк не меняет статы (statMods пуст); дварф бы дал dex-1
  assert.deepEqual(deriveStats('wizard', 'orc', 1),
    { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 });
});

test('deriveStats: дварф даёт -1 к ловкости', () => {
  assert.equal(deriveStats('wizard', 'dwarf', 1).dex, -1);
});

test('deriveStats: на 8 игре +1 к двум наивысшим статам по умолчанию', () => {
  // волшебник: наивысшие int(4), wis(2) -> станут 5 и 3
  const s = deriveStats('wizard', 'orc', 8);
  assert.equal(s.int, 5);
  assert.equal(s.wis, 3);
  assert.equal(s.cha, 1); // остальные без изменений
});

test('deriveStats: bumps переопределяет, к каким статам идёт +1', () => {
  const s = deriveStats('wizard', 'orc', 8, ['str', 'dex']);
  assert.equal(s.str, -1);
  assert.equal(s.dex, 1);
  assert.equal(s.int, 4); // не тронут
});

test('deriveStats: до 8 игры приростов нет', () => {
  assert.deepEqual(deriveStats('wizard', 'orc', 7), deriveStats('wizard', 'orc', 1));
});

test('computePreset: орк-варвар на 8 игре = hp 30 +5(орк) +5+5(вехи 4,8)', () => {
  const p = computePreset('orc', 'barbarian', 8);
  assert.equal(p.hp, 45);
  assert.equal(p.ac, 10);
});

test('RACES: правила цели по категориям', () => {
  assert.deepEqual(RACES.orc.onIncoming, { magic: { add: 2 } });
  assert.deepEqual(RACES.aasimar.onIncoming, { physical: { add: 2 } });
  assert.deepEqual(RACES.dwarf.onIncoming, { magic: { mult: 0.5 } });
  assert.equal(RACES.orc.orcReroll, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/characters.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Write minimal implementation**

```js
// src/characters.js
// Полные таблицы классов и рас из «Правила Днд.txt».
// stats: str=Сила, dex=Ловкость, con=Стойкость, wis=Мудрость, int=Интеллект, cha=Харизма.
// weaponStat — характеристика владения оружием (прибавляется к атаке и урону).
export const CLASSES = {
  warrior:    { name: 'Воин',         ac: 15, hp: 25, dice: '1d10', weaponStat: 'str', stats: { str: 3,  dex: 1,  con: 1,  wis: 0,  int: 0,  cha: -1 } },
  barbarian:  { name: 'Варвар',       ac: 10, hp: 30, dice: '1d12', weaponStat: 'str', stats: { str: 4,  dex: 1,  con: 2,  wis: -1, int: -2, cha: 0  } },
  rogue:      { name: 'Плут',         ac: 12, hp: 15, dice: '2d4',  weaponStat: 'dex', stats: { str: -2, dex: 4,  con: -1, wis: 2,  int: 0,  cha: 1  } },
  paladin:    { name: 'Паладин',      ac: 17, hp: 20, dice: '1d10', weaponStat: 'str', stats: { str: 3,  dex: -2, con: 2,  wis: 0,  int: -1, cha: 2  } },
  druid:      { name: 'Друид',        ac: 10, hp: 25, dice: '1d4',  weaponStat: 'dex', stats: { str: 2,  dex: 2,  con: 0,  wis: 2,  int: 0,  cha: -2 } },
  wizard:     { name: 'Волшебник',    ac: 10, hp: 15, dice: '1d4',  weaponStat: 'dex', stats: { str: -2, dex: 0,  con: -1, wis: 2,  int: 4,  cha: 1  } },
  artificer:  { name: 'Изобретатель', ac: 15, hp: 15, dice: '2d8',  weaponStat: 'dex', stats: { str: -1, dex: 2,  con: 0,  wis: 0,  int: 4,  cha: -1 } },
  cleric:     { name: 'Жрец',         ac: 15, hp: 20, dice: '1d6',  weaponStat: 'dex', stats: { str: -1, dex: -1, con: 4,  wis: 0,  int: 1,  cha: 1  } },
  bard:       { name: 'Бард',         ac: 12, hp: 25, dice: '1d6',  weaponStat: 'dex', stats: { str: 0,  dex: 1,  con: -1, wis: -1, int: 1,  cha: 4  } },
  ranger:     { name: 'Следопыт',     ac: 12, hp: 20, dice: '1d8',  weaponStat: 'dex', stats: { str: -1, dex: 3,  con: 1,  wis: 3,  int: -1, cha: -1 } },
  necromancer:{ name: 'Некромант',    ac: 12, hp: 20, dice: '1d4',  weaponStat: 'dex', stats: { str: -1, dex: 1,  con: 2,  wis: 1,  int: 3,  cha: -2 } },
  monk:       { name: 'Монах',        ac: 10, hp: 30, dice: '1d4',  weaponStat: 'dex', stats: { str: 0,  dex: 3,  con: 3,  wis: 0,  int: -1, cha: -1 } },
};

// statMods — расовые правки характеристик (только дварф -1 ловкость).
// onIncoming — правила ПОЛУЧАЕМОГО урона по категории (для целей этой расы).
// orcReroll — пассивка атакующего «Рождённый в битве» (переброс кубика урона 1–2).
export const RACES = {
  human:      { name: 'Человек',          hpMod: 0,  acMod: 0, statMods: {} },
  elf:        { name: 'Эльф',             hpMod: 0,  acMod: 0, statMods: {} },
  dwarf:      { name: 'Дварф',            hpMod: 0,  acMod: 0, statMods: { dex: -1 }, onIncoming: { magic: { mult: 0.5 } } },
  halfling:   { name: 'Полурослик',       hpMod: -5, acMod: 0, statMods: {} },
  orc:        { name: 'Орк',              hpMod: 5,  acMod: 0, statMods: {}, orcReroll: true, onIncoming: { magic: { add: 2 } } },
  tiefling:   { name: 'Тифлинг',          hpMod: 0,  acMod: 0, statMods: {} },
  aasimar:    { name: 'Аасимар',          hpMod: 0,  acMod: 0, statMods: {}, onIncoming: { physical: { add: 2 } } },
  tabaxi:     { name: 'Табакси',          hpMod: 0,  acMod: 0, statMods: {} },
  dragonborn: { name: 'Драконорождённый', hpMod: 0,  acMod: 1, statMods: {} },
  goblin:     { name: 'Гоблин',           hpMod: 0,  acMod: 0, statMods: {} },
  kitsune:    { name: 'Кицунэ',           hpMod: 0,  acMod: 0, statMods: {} },
};

export const MILESTONES = [4, 8, 12, 16, 20];
const STAT_KEYS = ['str', 'dex', 'con', 'wis', 'int', 'cha'];

// Две наивысшие по базе характеристики (для дефолтного прироста 8-й игры).
function topTwoStats(stats) {
  return [...STAT_KEYS].sort((a, b) => stats[b] - stats[a]).slice(0, 2);
}

export function deriveStats(classKey, raceKey, game, bumps) {
  const c = CLASSES[classKey];
  const r = RACES[raceKey];
  if (!c || !r) throw new Error('Неизвестный класс или раса');
  const out = {};
  for (const k of STAT_KEYS) out[k] = c.stats[k] + (r.statMods[k] || 0);
  if (game >= 8) {
    const chosen = bumps && bumps.length === 2 ? bumps : topTwoStats(out);
    for (const k of chosen) out[k] += 1;
  }
  return out;
}

export function computePreset(raceKey, classKey, game) {
  const c = CLASSES[classKey];
  const r = RACES[raceKey];
  if (!c || !r) throw new Error('Неизвестный класс или раса');
  const reached = MILESTONES.filter((m) => m <= game).length;
  return {
    ac: c.ac + r.acMod,
    hp: c.hp + r.hpMod + 5 * reached,
    dex: c.stats.dex + (r.statMods.dex || 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/characters.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Delete old presets and its test**

```bash
git rm src/presets.js test/presets.test.js
```

- [ ] **Step 6: Run full suite to catch danglers**

Run: `node --test`
Expected: FAIL only in files that still `import` from `../src/presets.js` (`abilities.test.js`/`simulator.test.js`/`build.js` handled in later tasks). `characters.test.js`, `types.test.js`, `engine.test.js` PASS.

- [ ] **Step 7: Commit**

```bash
git add src/characters.js test/characters.test.js
git commit -m "feat: full class/race tables, stat derivation, target rules"
```

---

## Task 4: Пайплайн модификаторов (`modifiers.js`)

**Files:**
- Create: `src/modifiers.js`
- Test: `test/modifiers.test.js`

**Interfaces:**
- Consumes: `categoryOf` из `types.js`; `sumDice` из `engine.js`; `RACES` из `characters.js`.
- Produces: `applyPipeline(packets, ctx) → number[]`, где `packets` — массив по целям, каждая цель = массив `{type, amount}`. `ctx` содержит: `rng`, `mods` (`{ concentration, chaos, rage, orcReroll }`), `targets` (каждая цель может иметь `race`). Порядок: (1) аддитив атакующего, (2) множители по категории, (3) правила цели (уязвимость `add`, затем сопротивление `mult`, floor), (4) сумма → число.

- [ ] **Step 1: Write the failing test**

```js
// test/modifiers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPipeline } from '../src/modifiers.js';
import { seqRng } from './helpers.js';

const baseCtx = (over) => ({
  rng: over.rng || (() => 0.99),
  targets: over.targets || [{}],
  mods: { concentration: 0, chaos: false, rage: false, orcReroll: false, ...(over.mods || {}) },
});

test('без модификаторов и рас — просто сумма пакетов на цель', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]], baseCtx({}));
  assert.deepEqual(out, [15]);
});

test('хаос ×2 удваивает только магическую категорию', () => {
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]],
    baseCtx({ mods: { chaos: true } }),
  );
  assert.deepEqual(out, [25]); // 10*2 + 5
});

test('ярость ×2 удваивает только физическую категорию', () => {
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]],
    baseCtx({ mods: { rage: true } }),
  );
  assert.deepEqual(out, [20]); // 10 + 5*2
});

test('правило цели: орк +2 к получаемому магическому', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ targets: [{ race: 'orc' }] }));
  assert.deepEqual(out, [12]);
});

test('правило цели: дварф ×0.5 к магическому (floor)', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 9 }]], baseCtx({ targets: [{ race: 'dwarf' }] }));
  assert.deepEqual(out, [4]); // floor(9/2)
});

test('порядок: хаос (×2) до правила цели орка (+2)', () => {
  // 10 маг -> хаос ×2 = 20 -> орк +2 = 22 (а не (10+2)*2=24)
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }]],
    baseCtx({ mods: { chaos: true }, targets: [{ race: 'orc' }] }),
  );
  assert.deepEqual(out, [22]);
});

test('уникальный противник без расы — правила не применяются', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ targets: [{}] }));
  assert.deepEqual(out, [10]);
});

test('концентрация добавляет 2д6 магии первой цели с уроном', () => {
  // 1 стак: 2д6 по rng 0.99 = 12, прибавляется к первой ненулевой цели
  const out = applyPipeline(
    [[], [{ type: 'physical', amount: 5 }]],
    baseCtx({ rng: seqRng([0.99, 0.99]), mods: { concentration: 1 } }),
  );
  assert.deepEqual(out, [0, 17]); // 5 + 12
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/modifiers.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Write minimal implementation**

```js
// src/modifiers.js
import { categoryOf } from './types.js';
import { sumDice } from './engine.js';
import { RACES } from './characters.js';

// (1) Аддитив атакующего: концентрация добавляет 2д6 магии (за стак)
// первой цели, у которой уже есть урон.
function addAttackerAdditive(packets, ctx) {
  const stacks = Number(ctx.mods.concentration) || 0;
  if (stacks <= 0) return packets;
  let bonus = 0;
  for (let s = 0; s < stacks; s++) bonus += sumDice(2, 6, ctx.rng, ctx.mods.orcReroll);
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: bonus }];
  return packets;
}

// (2) Множители атакующего по категории урона.
function applyMultipliers(packets, ctx) {
  const mult = (cat) => (cat === 'physical' ? (ctx.mods.rage ? 2 : 1) : (ctx.mods.chaos ? 2 : 1));
  return packets.map((arr) =>
    arr.map((p) => ({ ...p, amount: p.amount * mult(categoryOf(p.type)) })));
}

// (3)+(4) Правила цели по категории + сумма в число.
function finalizeTarget(arr, target) {
  const sums = { physical: 0, magic: 0 };
  for (const p of arr) sums[categoryOf(p.type)] += p.amount;
  const rule = target && target.race ? (RACES[target.race] || {}).onIncoming : null;
  if (rule) {
    for (const cat of ['physical', 'magic']) {
      if (!rule[cat]) continue;
      if (rule[cat].add) sums[cat] += rule[cat].add;
      if (rule[cat].mult != null) sums[cat] = Math.floor(sums[cat] * rule[cat].mult);
    }
  }
  return sums.physical + sums.magic;
}

export function applyPipeline(packets, ctx) {
  let p = packets.map((arr) => arr.slice());
  p = addAttackerAdditive(p, ctx);
  p = applyMultipliers(p, ctx);
  return p.map((arr, i) => finalizeTarget(arr, ctx.targets[i]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/modifiers.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modifiers.js test/modifiers.test.js
git commit -m "feat: damage pipeline — additive, multipliers, target rules"
```

---

## Task 5: Миграция способностей волшебника на новый контракт (`abilities/`)

**Files:**
- Create: `src/abilities/wizard.js`
- Create: `src/abilities/index.js`
- Delete: `src/abilities.js`
- Modify: `test/abilities.test.js` (миграция на пакеты + параметры)

**Interfaces:**
- Consumes: `rollDie, sumDice, attackRoll, isHit, resolveMode` из `../../engine.js`.
- Produces:
  - `WIZARD_ABILITIES` (массив) и `ABILITIES` (из `index.js`).
  - Контракт способности: `{ id, name, classKey, minGame, choiceGroup, charges, targeting, params, simulateOnce(ctx) }`.
  - `simulateOnce(ctx) → packets`: массив по целям, каждая = массив `{type, amount}`.
  - `ctx`: `{ rng, attackBonus, critRange, targets, mods, params }`. `attackBonus` — число (бонус к атаке, для волшебника = Интеллект). `params` — значения параметров способности.
  - Параметры: `chainLightning` — `{ id:'order', kind:'targetOrder', default:null }` (если `null` — жадная маршрутизация); `magicMissiles` — `{ id:'distribute', kind:'distribute', count:3, default:null }`; `staff`/`telekinesis` — `{ id:'target', kind:'targetPick', default:0 }`.

- [ ] **Step 1: Write the failing test (миграция `test/abilities.test.js`)**

Полностью заменить содержимое `test/abilities.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => ({
  rng: over.rng,
  attackBonus: over.attackBonus ?? 4,
  critRange: over.critRange ?? 20,
  targets: over.targets ?? [{ ac: 12, hp: 30 }],
  mods: { orcReroll: false, hex: false, ...(over.mods || {}) },
  params: over.params || {},
});

test('magicMissiles: 3 снаряда 1д4+1 авто по одной цели — пакеты magic', () => {
  const p = get('magicMissiles').simulateOnce(ctx({ rng: seqRng([0, 0, 0]) }));
  // одна цель, три пакета по 1+1=2 (д4=1 при rng 0)
  assert.deepEqual(p, [[{ type: 'magic', amount: 2 }, { type: 'magic', amount: 2 }, { type: 'magic', amount: 2 }]]);
});

test('magicMissiles распределяет снаряды по нескольким целям по кругу', () => {
  const p = get('magicMissiles').simulateOnce(ctx({
    rng: seqRng([0.99, 0.99, 0.99]),
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  // каждый снаряд д4=4 -> 5; по одному на цель
  assert.deepEqual(p, [
    [{ type: 'magic', amount: 5 }],
    [{ type: 'magic', amount: 5 }],
    [{ type: 'magic', amount: 5 }],
  ]);
});

test('fireball: провал спасброска = полный 6д6 fire', () => {
  const rng = seqRng([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }]]);
});

test('fireball: успех спасброска = половина (вниз)', () => {
  const rng = seqRng([0.99, 0, 0, 0, 0, 0, 0]);
  const p = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 3 }]]);
});

test('fireball: спасбросок берёт ловкость каждой цели (dexSave)', () => {
  const rng = seqRng([0.45, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('fireball').simulateOnce(ctx({ rng, targets: [{ ac: 12, hp: 99, dexSave: 20 }] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 18 }]]);
});

test('staff: попадание 1д4 physical по выбранной цели, промах — пусто', () => {
  const hit = get('staff').simulateOnce(ctx({ rng: seqRng([0.95, 0.5]) }));
  assert.deepEqual(hit, [[{ type: 'physical', amount: 3 }]]);
  const miss = get('staff').simulateOnce(ctx({ rng: seqRng([0]) }));
  assert.deepEqual(miss, [[]]);
});

test('chainLightning: цель 0 авто 2д6 lightning, цепь рвётся на промахе', () => {
  const rng = seqRng([0.99, 0.99, 0]);
  const p = get('chainLightning').simulateOnce(ctx({
    rng,
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  assert.deepEqual(p, [[{ type: 'lightning', amount: 12 }], [], []]);
});

test('chainLightning: явный порядок (params.order) соблюдается', () => {
  const rng = seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('chainLightning').simulateOnce(ctx({
    rng,
    params: { order: [0, 1, 0] },
    targets: [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }],
  }));
  // t0: авто 12 + ещё 12 (3-й удар) = два пакета; t1: 12 (2-й удар)
  assert.deepEqual(p, [
    [{ type: 'lightning', amount: 12 }, { type: 'lightning', amount: 12 }],
    [{ type: 'lightning', amount: 12 }],
  ]);
});

test('magicMissiles с орочьим перебросом: d4 реролл при ≤2', () => {
  const p = get('magicMissiles').simulateOnce(ctx({
    rng: seqRng([0, 0.99, 0, 0.99, 0, 0.99]),
    mods: { orcReroll: true },
  }));
  assert.deepEqual(p, [[{ type: 'magic', amount: 5 }, { type: 'magic', amount: 5 }, { type: 'magic', amount: 5 }]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/abilities.test.js`
Expected: FAIL — `Cannot find module '../src/abilities/index.js'`.

- [ ] **Step 3: Write `src/abilities/wizard.js`**

```js
// src/abilities/wizard.js
import { rollDie, sumDice, attackRoll, isHit, resolveMode } from '../engine.js';

// Пустые пакеты на каждую цель.
function empty(n) { return Array.from({ length: n }, () => []); }

// Одиночная атака д20+attackBonus по цели index; при попадании — пакет.
function singleAttack(ctx, index, sides, type) {
  const out = empty(ctx.targets.length);
  const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
  const nat = attackRoll(ctx.rng, mode);
  const { hit } = isHit(nat, ctx.attackBonus, ctx.targets[index].ac, ctx.critRange);
  if (hit) out[index].push({ type, amount: rollDie(sides, ctx.rng, ctx.mods.orcReroll) });
  return out;
}

export const WIZARD_ABILITIES = [
  {
    id: 'magicMissiles', name: 'Волшебные снаряды', classKey: 'wizard',
    minGame: 1, choiceGroup: null, charges: '3 раза в бой', targeting: 'area',
    params: [{ id: 'distribute', kind: 'distribute', label: 'Снаряды по целям', count: 3, default: null }],
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      const plan = ctx.params.distribute || Array.from({ length: 3 }, (_, i) => i % n);
      for (const t of plan) out[t].push({ type: 'magic', amount: rollDie(4, ctx.rng, ctx.mods.orcReroll) + 1 });
      return out;
    },
  },
  {
    id: 'staff', name: 'Атака посохом', classKey: 'wizard',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) { return singleAttack(ctx, ctx.params.target ?? 0, 4, 'physical'); },
  },
  {
    id: 'telekinesis', name: 'Телекинез (атака)', classKey: 'wizard',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) { return singleAttack(ctx, ctx.params.target ?? 0, 4, 'magic'); },
  },
  {
    id: 'fireball', name: 'Огненный шар', classKey: 'wizard',
    minGame: 1, choiceGroup: null, charges: '1 раз в бой', targeting: 'area',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const mode = ctx.mods.hex ? 'dis' : 'none'; // Сглаз = помеха спасброску цели
      for (let i = 0; i < ctx.targets.length; i++) {
        const saveBonus = ctx.targets[i].dexSave ?? ctx.targetDexSave ?? 0;
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat !== 1 && (nat === 20 || nat + saveBonus >= 15);
        const full = sumDice(6, 6, ctx.rng, ctx.mods.orcReroll);
        out[i].push({ type: 'fire', amount: saved ? Math.floor(full / 2) : full });
      }
      return out;
    },
  },
  {
    id: 'chainLightning', name: 'Цепная молния', classKey: 'wizard',
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'chain',
    params: [{ id: 'order', kind: 'targetOrder', label: 'Порядок ударов', max: 4, default: null }],
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bolt = () => ({ type: 'lightning', amount: sumDice(2, 6, ctx.rng, ctx.mods.orcReroll) });
      const seq = ctx.params.order;
      if (seq && seq.length) {
        out[seq[0]].push(bolt());
        for (let i = 1; i < seq.length; i++) {
          const nat = attackRoll(ctx.rng, mode);
          const { hit } = isHit(nat, ctx.attackBonus, ctx.targets[seq[i]].ac, ctx.critRange);
          if (!hit) break;
          out[seq[i]].push(bolt());
        }
        return out;
      }
      // Жадная маршрутизация (наим. КБ, кроме текущей; можно вернуться, но не подряд).
      out[0].push(bolt());
      if (n < 2) return out;
      let prev = 0;
      for (let step = 0; step < 3; step++) {
        let next = -1;
        for (let j = 0; j < n; j++) {
          if (j === prev) continue;
          if (next < 0 || ctx.targets[j].ac < ctx.targets[next].ac) next = j;
        }
        const nat = attackRoll(ctx.rng, mode);
        const { hit } = isHit(nat, ctx.attackBonus, ctx.targets[next].ac, ctx.critRange);
        if (!hit) break;
        out[next].push(bolt());
        prev = next;
      }
      return out;
    },
  },
];
```

- [ ] **Step 4: Write `src/abilities/index.js`**

```js
// src/abilities/index.js
import { WIZARD_ABILITIES } from './wizard.js';

export const ABILITIES = [
  ...WIZARD_ABILITIES,
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/abilities.test.js`
Expected: PASS (9 tests).

- [ ] **Step 6: Delete old monolithic abilities file**

```bash
git rm src/abilities.js
```

- [ ] **Step 7: Commit**

```bash
git add src/abilities/wizard.js src/abilities/index.js test/abilities.test.js
git commit -m "feat: migrate wizard abilities to typed-packet contract with params"
```

---

## Task 6: Симулятор на пакетах и пайплайне (`simulator.js`)

**Files:**
- Modify: `src/simulator.js` (полная замена)
- Modify: `test/simulator.test.js` (миграция)

**Interfaces:**
- Consumes: `makeRng` из `engine.js`; `applyPipeline` из `modifiers.js`.
- Produces:
  - `runAbility(ability, baseCtx, opts) → metrics` (поля прежние: `perTargetMean, groupMean, groupMin, groupMax, groupFreq, targetFreq, killCount, trials`). Внутри: `ability.simulateOnce(ctx)` даёт пакеты → `applyPipeline(packets, ctx)` даёт число на цель.
  - `pAtLeast(groupFreq, trials, x)`, `killChance(metrics, i)` — без изменений.
  - `compareAbilities(abilities, baseCtx, opts) → rows` — без изменений по форме.
- `baseCtx` теперь несёт `attackBonus`, `critRange`, `mods` (включая `concentration, chaos, rage, orcReroll, adv, dis, hex`), `params`, `targets`.

- [ ] **Step 1: Write the failing test (миграция `test/simulator.test.js`)**

Прочитать текущий `test/simulator.test.js` и привести вызовы к новой форме `baseCtx` (заменить `intBonus` на `attackBonus`, добавить `params: {}`, `critRange: 20`; убедиться, что `mods` включает `concentration, chaos, rage, orcReroll`). Затем добавить новый кейс, проверяющий, что пайплайн подключён:

```js
test('runAbility: хаос ×2 учитывается в groupMean (магический урон)', () => {
  const ability = {
    id: 'x', name: 'x',
    simulateOnce: () => [[{ type: 'magic', amount: 10 }]],
    params: [],
  };
  const base = {
    attackBonus: 0, critRange: 20, targets: [{ ac: 10, hp: 99 }],
    mods: { concentration: 0, chaos: true, rage: false, orcReroll: false, adv: false, dis: false, hex: false },
    params: {},
  };
  const m = runAbility(ability, base, { trials: 100, seed: 1 });
  assert.equal(m.groupMean, 20);
});
```

(Существующие кейсы про метрики/частоты сохрани, поправив только форму `baseCtx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/simulator.test.js`
Expected: FAIL — старый `runAbility` ожидает плоский результат `simulateOnce` и не применяет пайплайн (новый кейс упадёт; миграционные — на форме ctx).

- [ ] **Step 3: Write implementation (replace `src/simulator.js`)**

```js
// src/simulator.js
import { makeRng } from './engine.js';
import { applyPipeline } from './modifiers.js';

export function runAbility(ability, baseCtx, opts) {
  const trials = opts.trials;
  const rng = makeRng(opts.seed);
  const n = baseCtx.targets.length;
  const perTargetSum = new Array(n).fill(0);
  const killCount = new Array(n).fill(0);
  const groupFreq = new Map();
  const targetFreq = Array.from({ length: n }, () => new Map());
  let groupMin = Infinity, groupMax = -Infinity;

  for (let t = 0; t < trials; t++) {
    const ctx = { ...baseCtx, rng };
    const packets = ability.simulateOnce(ctx);
    const dmg = applyPipeline(packets, ctx);
    let group = 0;
    for (let i = 0; i < n; i++) {
      perTargetSum[i] += dmg[i];
      group += dmg[i];
      if (dmg[i] >= baseCtx.targets[i].hp) killCount[i]++;
      targetFreq[i].set(dmg[i], (targetFreq[i].get(dmg[i]) || 0) + 1);
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
    targetFreq,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/simulator.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `node --test`
Expected: PASS во всех файлах (`types`, `engine`, `characters`, `modifiers`, `abilities`, `simulator`).

- [ ] **Step 6: Commit**

```bash
git add src/simulator.js test/simulator.test.js
git commit -m "refactor: simulator runs typed packets through damage pipeline"
```

---

## Task 7: Сборка с автосбором способностей (`build.js`)

**Files:**
- Modify: `build.js`

**Interfaces:**
- Consumes: все `src/*.js` и `src/abilities/*.js`.
- Produces: рабочий `dnd-dmg.html`. Worker-ядро = `engine + types + characters + modifiers + abilities/* + abilities/index + simulator` (после снятия import/export), диспетчер сообщений без изменений по форме. Основной поток также получает `characters` (для пресетов целей в UI) и `ABILITIES`.

- [ ] **Step 1: Обновить `build.js`**

Заменить блок чтения модулей и сборки `workerCore`/`mainGlue`. Ключевое: вместо `presets.js`/`abilities.js` — `types.js`, `characters.js`, `modifiers.js` и автосбор `src/abilities/*.js` (все, кроме `index.js`, затем `index.js`).

```js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

function strip(src) {
  return src
    .replace(/^\s*import[^;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

const read = (p) => readFileSync(p, 'utf8');

const engine = strip(read('src/engine.js'));
const types = strip(read('src/types.js'));
const characters = strip(read('src/characters.js'));
const modifiers = strip(read('src/modifiers.js'));

// Автосбор способностей: сперва все классовые файлы, потом index (объявляет ABILITIES).
const abilityFiles = readdirSync('src/abilities')
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();
const abilityClasses = abilityFiles.map((f) => strip(read(`src/abilities/${f}`))).join('\n');
const abilityIndex = strip(read('src/abilities/index.js'));

const simulator = strip(read('src/simulator.js'));
const ui = read('src/ui.js');

// Общий код для Worker и основного потока (порядок важен: типы и характеристики
// до модификаторов и способностей).
const core = [engine, types, characters, modifiers, abilityClasses, abilityIndex].join('\n');

const workerCore = [core, simulator, `
const ABILITY_MAP = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
self.onmessage = (e) => {
  const { type, abilityId, baseCtx, opts } = e.data;
  if (type === 'run') {
    const m = runAbility(ABILITY_MAP[abilityId], baseCtx, opts);
    self.postMessage({ type: 'result', metrics: { ...m,
      groupFreq: [...m.groupFreq],
      targetFreq: m.targetFreq.map((f) => [...f]) } });
  }
  if (type === 'compare') {
    self.postMessage({ type: 'comparison', rows: compareAbilities(ABILITIES, baseCtx, opts) });
  }
};
`].join('\n');

const mainGlue = `
${core}
function makeWorker() {
  const code = ${JSON.stringify(workerCore)};
  const blob = new Blob([code], { type: 'application/javascript' });
  const w = new Worker(URL.createObjectURL(blob));
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
          if (d.type === 'result') {
            d.metrics.groupFreq = new Map(d.metrics.groupFreq);
            d.metrics.targetFreq = d.metrics.targetFreq.map((f) => new Map(f));
          }
          v(e);
        };
        return true;
      }
      t[p] = v; return true;
    },
  });
}
`;

const engineBlock = mainGlue + '\n' + simulator;
const tpl = read('template.html');
const out = tpl.replace('/*ENGINE*/', engineBlock).replace('/*UI*/', ui);
writeFileSync('dnd-dmg.html', out);
console.log('dnd-dmg.html собран,', out.length, 'байт');
```

- [ ] **Step 2: Run the build**

Run: `node build.js`
Expected: вывод `dnd-dmg.html собран, <N> байт` без ошибок.

- [ ] **Step 3: Smoke-проверка собранного файла**

Run: `node -e "const s=require('fs').readFileSync('dnd-dmg.html','utf8'); if(!s.includes('WIZARD_ABILITIES')||!s.includes('applyPipeline')||!s.includes('makeWorker')) throw new Error('сборка неполная'); console.log('ok, длина', s.length)"`
Expected: `ok, длина <N>`.

> Примечание: UI в `src/ui.js` пока обращается к старому `ctx` (intBonus/chainSeq) и будет переписан в Плане 2. На этом этапе цель — корректная сборка ядра; визуальный прогон формы делается после Плана 2.

- [ ] **Step 4: Commit**

```bash
git add build.js dnd-dmg.html
git commit -m "build: auto-collect per-class abilities, wire new core modules"
```

---

## Self-Review

**Spec coverage (фундаментные разделы спеки):**
- Типы урона и категории → Task 1. ✔
- Крит/critRange → Task 2. ✔
- Модель героя (вывод статов, таблицы классов/рас, правила цели) → Task 3. ✔
- Пайплайн (аддитив → множитель → правила цели, порядок) → Task 4. ✔
- Контракт способности + типизированные пакеты + параметры (targetPick/targetOrder/distribute) → Task 5. ✔
- Симулятор на пакетах → Task 6. ✔
- Раскладка по файлам класса + glob-сборка → Task 7. ✔
- UI (конструктор, пресеты, сохранение, авто-рендер параметров), остальные 11 классов, талант/артефакты как модификаторы — **намеренно вне Плана 1** (Планы 2–4).

**Placeholder scan:** код приведён полностью в каждом шаге; «nameшарики» отсутствуют. Шаг миграции `test/simulator.test.js` (Task 6, Step 1) опирается на чтение текущего файла — это осознанно, т.к. точный набор существующих кейсов сохраняется, меняется только форма `baseCtx` (`intBonus → attackBonus`, добавить `params`/`critRange`, расширить `mods`).

**Type consistency:** `attackBonus`, `critRange`, `params`, `mods.{concentration,chaos,rage,orcReroll,adv,dis,hex}`, `targets[i].{ac,hp,dexSave,race}` используются единообразно в Tasks 4–6. Пакет везде `{type, amount}`. `applyPipeline(packets, ctx) → number[]` совпадает между Task 4 (определение) и Task 6 (потребление). `ABILITIES` из `abilities/index.js` потребляется в Task 5 (тест), Task 6 (`compareAbilities`) и Task 7 (worker).

## Execution Handoff

После сохранения этого плана — выбор способа исполнения (см. ниже в ответе).
