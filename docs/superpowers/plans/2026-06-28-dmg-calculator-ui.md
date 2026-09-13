# Калькулятор урона — UI и конструктор героя (План 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать UI калькулятора под полноценный конструктор героя (класс/раса/игра → статы/оружие/способности), авто-рендер параметров способности, фильтрацию модификаторов, пресеты целей с расой, сохранение/сброс состояния и открепляемый результат; обобщить `ctx` так, чтобы способность брала нужный стат сама, и добавить generic «Базовую атаку оружием» для всех классов.

**Architecture:** Способность получает `ctx.stats` (6 характеристик) и хелпер `ctx.attackBonus(stat)`, который навешивается **в воркере** внутри `runAbility` (функции не переживают `postMessage`). `baseCtx` от UI несёт только данные: `stats`, `weapon{dice,stat}`, `critRange`, `targets[{ac,hp,dexSave,race}]`, `mods`, `params`. Чистая UI-логика (фильтр доступных способностей, дефолты/нормализация параметров, релевантность модификаторов, пресет→цель, сериализация состояния) выносится в тестируемый `src/ui-logic.js`; DOM-связка остаётся в `src/ui.js` и проверяется браузером в конце.

**Tech Stack:** Чистый ES-модульный JavaScript, без зависимостей. Тесты — `node --test`. Сборка — `node build.js`. Браузерная проверка — Playwright MCP по локальному `dnd-dmg.html`.

## Global Constraints

- Никаких внешних зависимостей, CDN, сетевых запросов — всё инлайн в один файл `dnd-dmg.html`; на выходе 0 внешних URL.
- Движок — Монте-Карло; ГПСЧ детерминированный; в тестах `seqRng` из `test/helpers.js`.
- `ctx`, передаваемый в `worker.postMessage`, содержит ТОЛЬКО клонируемые данные (без функций). Хелпер `attackBonus` навешивается в `runAbility`.
- Статы: `str, dex, con, wis, int, cha` (con = Стойкость). Категории урона: physical / magic (см. `types.js`).
- Способность возвращает на цель массив пакетов `{type, amount}`; `[]` = ноль.
- Сохранять обратную совместимость существующих 58 тестов (адаптировать только то, что меняет контракт).
- Комментарии и UI-текст — на русском, в стиле существующего кода.
- Дизайн-язык не менять: тёмный «боевой гримуар», свечение по типу урона; результат по умолчанию НЕ закреплён, есть кнопка «📌 Закрепить».
- Коммиты — conventional commits; ветка `feat/dmg-calculator`.

## Контекст для исполнителя (текущее состояние)

План 1 завершён: есть `src/engine.js` (rollDie, sumDice, attackRoll, isHit(nat,bonus,ac,critRange), resolveMode, makeRng), `src/types.js` (categoryOf), `src/characters.js` (CLASSES{name,ac,hp,dice,weaponStat,stats}, RACES{...,orcReroll?,onIncoming?}, deriveStats, computePreset), `src/modifiers.js` (applyPipeline), `src/abilities/wizard.js` (WIZARD_ABILITIES, контракт пакетов, читают `ctx.attackBonus` как ЧИСЛО), `src/abilities/index.js` (ABILITIES), `src/simulator.js` (runAbility/compareAbilities на пакетах). `src/ui.js` ещё на СТАРОМ `ctx` (intBonus/chainSeq) — собранный `dnd-dmg.html` сейчас падает в браузере; этот план его чинит.

---

## File Structure

- `src/engine.js` — **Modify**: добавить `rollNotation(notation, rng, orcReroll)` (парсит 'NdS').
- `src/simulator.js` — **Modify**: в `runAbility` навесить `ctx.attackBonus = (stat) => ctx.stats[stat]`.
- `src/abilities/wizard.js` — **Modify**: `ctx.attackBonus` → `ctx.attackBonus('int')`; добавить метаданные `usesAttackRoll/usesSave/category` каждой способности.
- `src/abilities/common.js` — **Create**: `COMMON_ABILITIES = [basicAttack]`.
- `src/abilities/index.js` — **Modify**: подмешать COMMON_ABILITIES.
- `src/ui-logic.js` — **Create**: чистые функции (availableAbilities, defaultParams, normalizeParams, sanitizeOrder, modifierRelevance, presetTarget, serializeState/deserializeState/defaultState).
- `src/ui.js` — **Modify (rewrite)**: конструктор героя, авто-рендер параметров, модификаторы, цели с расой, сохранение/сброс, открепление результата, новый `baseCtx`.
- `build.js` — **Modify**: учесть, что `src/abilities/*.js` теперь включает `common.js` (glob уже это делает — проверить порядок: common перед index).
- `test/engine.test.js`, `test/abilities.test.js`, `test/simulator.test.js` — **Modify**.
- `test/ui-logic.test.js` — **Create**.

---

## Task 1: Парсер кубов в движке (`rollNotation`)

**Files:**
- Modify: `src/engine.js`
- Modify: `test/engine.test.js`

**Interfaces:**
- Produces: `rollNotation(notation, rng, orcReroll) → number`. Парсит строку вида `'2d8'`/`'1d10'` и суммирует N бросков `rollDie(S, rng, orcReroll)`. Бросает `Error` на нераспознанной строке.

- [ ] **Step 1: Write the failing test**

```js
// добавить в test/engine.test.js (импортировать rollNotation из ../src/engine.js)
test('rollNotation: 2d4 = два д4', () => {
  // rng 0.99,0.99 -> 4+4 = 8
  assert.equal(rollNotation('2d4', seqRng([0.99, 0.99]), false), 8);
});

test('rollNotation: 1d12 = один д12', () => {
  assert.equal(rollNotation('1d12', seqRng([0]), false), 1); // rng 0 -> 1
});

test('rollNotation: орочий переброс прокидывается в кости', () => {
  // 1d8: rng 0->1 (<=2 реролл) -> rng 0.99 -> 8
  assert.equal(rollNotation('1d8', seqRng([0, 0.99]), true), 8);
});

test('rollNotation: мусор бросает ошибку', () => {
  assert.throws(() => rollNotation('abc', seqRng([0]), false), /кость/i);
});
```

Добавь `rollNotation` и `seqRng` в импорты теста, если их там нет.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — `rollNotation is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// добавить в src/engine.js
// Парсит нотацию кубов 'NdS' и суммирует N бросков dS (с учётом орочьего переброса).
export function rollNotation(notation, rng, orcReroll) {
  const m = /^(\d+)d(\d+)$/.exec(String(notation).trim());
  if (!m) throw new Error(`Не распознана кость: ${notation}`);
  return sumDice(Number(m[1]), Number(m[2]), rng, orcReroll);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: rollNotation parses NdS dice strings"
```

---

## Task 2: Статы в ctx + хелпер attackBonus (`simulator.js`, `wizard.js`)

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/abilities/wizard.js`
- Modify: `test/simulator.test.js`
- Modify: `test/abilities.test.js`

**Interfaces:**
- Produces: внутри `runAbility` к каждому `ctx` добавляется `ctx.attackBonus = (stat) => (ctx.stats ? ctx.stats[stat] : 0)`. Способности зовут `ctx.attackBonus('int')` (волшебник) вместо чтения числа `ctx.attackBonus`.
- Каждая способность волшебника получает UI-метаданные: `usesAttackRoll` (bool), `usesSave` (bool), `category` ('physical'|'magic').
  - magicMissiles: `usesAttackRoll:false, usesSave:false, category:'magic'`
  - staff: `usesAttackRoll:true, usesSave:false, category:'physical'`
  - telekinesis: `usesAttackRoll:true, usesSave:false, category:'magic'`
  - fireball: `usesAttackRoll:false, usesSave:true, category:'magic'`
  - chainLightning: `usesAttackRoll:true, usesSave:false, category:'magic'`

- [ ] **Step 1: Write the failing test**

В `test/abilities.test.js` обнови хелпер `ctx`: вместо `attackBonus: over.attackBonus ?? 4` сделай так, чтобы тесты задавали статы и хелпер строился как в движке:

```js
const ctx = (over) => {
  const stats = over.stats ?? { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: over.critRange ?? 20,
    targets: over.targets ?? [{ ac: 12, hp: 30 }],
    mods: { orcReroll: false, hex: false, adv: false, dis: false, ...(over.mods || {}) },
    params: over.params || {},
  };
};
```

Существующие кейсы используют `attackBonus 4` = Интеллект 4, что совпадает с дефолтным `stats.int:4` — числа в ассертах не меняются. Добавь новый кейс на метаданные:

```js
test('способности волшебника несут UI-метаданные релевантности', () => {
  assert.equal(get('fireball').usesSave, true);
  assert.equal(get('chainLightning').usesAttackRoll, true);
  assert.equal(get('magicMissiles').category, 'magic');
  assert.equal(get('staff').category, 'physical');
});
```

В `test/simulator.test.js` добавь кейс, что движок навешивает хелпер:

```js
test('runAbility навешивает ctx.attackBonus из ctx.stats', () => {
  let seen = null;
  const ability = { id: 'probe', name: 'probe', params: [],
    simulateOnce: (ctx) => { seen = ctx.attackBonus('int'); return [[]]; } };
  const base = { stats: { str:0,dex:0,con:0,wis:0,int:7,cha:0 }, critRange: 20,
    targets: [{ ac: 10, hp: 99 }],
    mods: { concentration:0, chaos:false, rage:false, orcReroll:false, adv:false, dis:false, hex:false },
    params: {} };
  runAbility(ability, base, { trials: 1, seed: 1 });
  assert.equal(seen, 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/abilities.test.js test/simulator.test.js`
Expected: FAIL — wizard abilities ещё читают `ctx.attackBonus` как число (вызов `ctx.attackBonus('int')` упадёт: число не функция), и `runAbility` не навешивает хелпер.

- [ ] **Step 3: Implement — simulator helper**

В `src/simulator.js`, в `runAbility`, в теле цикла где формируется `ctx`, навесь хелпер (один раз на trial достаточно):

```js
  for (let t = 0; t < trials; t++) {
    const ctx = { ...baseCtx, rng };
    ctx.attackBonus = (stat) => (ctx.stats ? ctx.stats[stat] : 0);
    const packets = ability.simulateOnce(ctx);
    const dmg = applyPipeline(packets, ctx);
    // ...без изменений
```

- [ ] **Step 4: Implement — wizard abilities use the helper + metadata**

В `src/abilities/wizard.js`:
- В `singleAttack(ctx, index, sides, type)` замени `isHit(nat, ctx.attackBonus, ...)` на `isHit(nat, ctx.attackBonus('int'), ...)`.
- В `chainLightning` оба вызова `isHit(nat, ctx.attackBonus, ...)` → `isHit(nat, ctx.attackBonus('int'), ...)`.
- Добавь в КАЖДЫЙ объект способности поля `usesAttackRoll`, `usesSave`, `category` по таблице из Interfaces.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/abilities.test.js test/simulator.test.js`
Expected: PASS. Затем полный `node --test` — все зелёные.

- [ ] **Step 6: Commit**

```bash
git add src/simulator.js src/abilities/wizard.js test/abilities.test.js test/simulator.test.js
git commit -m "feat: abilities read stats via ctx.attackBonus(stat) helper"
```

---

## Task 3: Generic «Базовая атака оружием» (`abilities/common.js`)

**Files:**
- Create: `src/abilities/common.js`
- Modify: `src/abilities/index.js`
- Modify: `test/abilities.test.js`

**Interfaces:**
- Produces: `COMMON_ABILITIES = [basicAttack]`. `basicAttack`: `{ id:'basicAttack', name:'Базовая атака оружием', classKey:'common', minGame:1, choiceGroup:null, charges:'без ограничений', targeting:'single', usesAttackRoll:true, usesSave:false, category:'physical', params:[{id:'target',kind:'targetPick',label:'Цель',default:0}], simulateOnce }`. Бьёт по `ctx.params.target ?? 0`: атака `d20 + ctx.attackBonus(ctx.weapon.stat)` против `target.ac` (с adv/dis, critRange); при попадании урон `rollNotation(ctx.weapon.dice) + ctx.attackBonus(ctx.weapon.stat)` типа `physical` (владение добавляет стат к урону).
- `ABILITIES` из index = `[...COMMON_ABILITIES, ...WIZARD_ABILITIES]`.

- [ ] **Step 1: Write the failing test**

Добавь в `test/abilities.test.js`:

```js
test('basicAttack: попадание = куб оружия + стат владения, тип physical', () => {
  // оружие 1d10, стат str=3. attackRoll none: nat=floor(0.5*20)+1=11; 11+3>=10 hit.
  // урон d10 rng 0.99 ->10, +3 = 13.
  const p = get('basicAttack').simulateOnce(ctx({
    rng: seqRng([0.5, 0.99]),
    stats: { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '1d10', stat: 'str' },
    targets: [{ ac: 10, hp: 30 }],
  }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('basicAttack: промах = пустой пакет', () => {
  // nat=1 (rng 0) -> промах
  const p = get('basicAttack').simulateOnce(ctx({
    rng: seqRng([0]),
    stats: { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '1d10', stat: 'str' },
    targets: [{ ac: 10, hp: 30 }],
  }));
  assert.deepEqual(p, [[]]);
});
```

Расширь хелпер `ctx` в `test/abilities.test.js`, чтобы пробрасывал `weapon`: добавь в возвращаемый объект `weapon: over.weapon ?? { dice: '1d4', stat: 'dex' }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/abilities.test.js`
Expected: FAIL — `basicAttack` не найдена в ABILITIES.

- [ ] **Step 3: Write `src/abilities/common.js`**

```js
import { rollNotation, attackRoll, isHit, resolveMode } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const COMMON_ABILITIES = [
  {
    id: 'basicAttack', name: 'Базовая атака оружием', classKey: 'common',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bonus = ctx.attackBonus(ctx.weapon.stat);
      const nat = attackRoll(ctx.rng, mode);
      const { hit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange);
      if (hit) {
        const amount = rollNotation(ctx.weapon.dice, ctx.rng, ctx.mods.orcReroll) + bonus;
        out[i].push({ type: 'physical', amount });
      }
      return out;
    },
  },
];
```

- [ ] **Step 4: Update `src/abilities/index.js`**

```js
import { COMMON_ABILITIES } from './common.js';
import { WIZARD_ABILITIES } from './wizard.js';

export const ABILITIES = [
  ...COMMON_ABILITIES,
  ...WIZARD_ABILITIES,
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/abilities.test.js`
Expected: PASS. Затем полный `node --test` — зелёные.

- [ ] **Step 6: Commit**

```bash
git add src/abilities/common.js src/abilities/index.js test/abilities.test.js
git commit -m "feat: generic basic weapon attack for all classes"
```

---

## Task 4: Чистая UI-логика (`ui-logic.js`)

**Files:**
- Create: `src/ui-logic.js`
- Create: `test/ui-logic.test.js`

**Interfaces:**
- Consumes: `ABILITIES` из `./abilities/index.js`; `CLASSES, RACES, deriveStats, computePreset` из `./characters.js`.
- Produces:
  - `availableAbilities(character) → ability[]` — те, у кого `(classKey === character.classKey || classKey === 'common')`, `minGame <= character.game`, и (если `choiceGroup === 'game12'`) `character.game >= 12 && character.game12Choice === ability.id`.
  - `defaultParams(ability, targets) → object` — id→дефолт каждого параметра (`targetPick`→0; `targetOrder`→`defaultOrder(targets)`; `distribute`→null; `select`→`options[0].value`; `stepper`→`min ?? 0`; `toggle`→false).
  - `defaultOrder(targets) → number[]` и `sanitizeOrder(order, targets) → number[]` — перенос текущей логики `defaultChainSeq`/`sanitizeChainSeq` (длина = `n<2?1:4`, индексы в пределах, не дважды подряд, дефолт — жадно по наим. AC).
  - `modifierRelevance(ability) → { adv, dis, chaos, rage, hex, concentration, orcReroll }` (bool): `adv=dis=ability.usesAttackRoll`; `hex=ability.usesSave`; `chaos=concentration=(ability.category==='magic')`; `rage=(ability.category==='physical')`; `orcReroll=true`.
  - `presetTarget(race, klass, level) → { ac, hp, dexSave, race }` — `computePreset` + сохранённая `race` (для расовых правил).
  - `defaultState() → state`, `serializeState(state) → string`, `deserializeState(str) → state|null` (JSON; при ошибке/несовместимости возвращает null).

- [ ] **Step 1: Write the failing test**

```js
// test/ui-logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableAbilities, defaultParams, sanitizeOrder, modifierRelevance,
  presetTarget, defaultState, serializeState, deserializeState,
} from '../src/ui-logic.js';

test('availableAbilities: волшебник на 1 игре видит базовую атаку + стартовые спеллы, без [12]', () => {
  const ids = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).map((a) => a.id);
  assert.ok(ids.includes('basicAttack'));
  assert.ok(ids.includes('fireball'));
});

test('availableAbilities: воин на 1 игре видит только базовую атаку (спеллов нет)', () => {
  const ids = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null }).map((a) => a.id);
  assert.deepEqual(ids, ['basicAttack']);
});

test('modifierRelevance: огненный шар — hex да, adv нет', () => {
  const fb = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'fireball');
  const r = modifierRelevance(fb);
  assert.equal(r.hex, true);
  assert.equal(r.adv, false);
  assert.equal(r.chaos, true);
  assert.equal(r.rage, false);
});

test('modifierRelevance: базовая атака — rage да, chaos нет, adv да', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  const r = modifierRelevance(ba);
  assert.equal(r.rage, true);
  assert.equal(r.chaos, false);
  assert.equal(r.adv, true);
});

test('sanitizeOrder: чинит длину и запрет двух подряд', () => {
  const targets = [{ ac: 10 }, { ac: 12 }];
  const out = sanitizeOrder([0, 0, 0, 0], targets);
  assert.equal(out.length, 4);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i], out[i - 1]);
});

test('presetTarget: возвращает ac/hp/dexSave и сохраняет расу', () => {
  const t = presetTarget('orc', 'barbarian', 8);
  assert.equal(t.race, 'orc');
  assert.equal(t.hp, 45); // 30 + 5(орк) + 10(вехи 4,8)
});

test('serialize/deserialize round-trips, мусор -> null', () => {
  const s = defaultState();
  assert.deepEqual(deserializeState(serializeState(s)), s);
  assert.equal(deserializeState('{не json'), null);
});

test('defaultParams: targetPick=0, targetOrder сформирован', () => {
  const chain = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'chainLightning');
  const p = defaultParams(chain, [{ ac: 10 }, { ac: 12 }, { ac: 8 }]);
  assert.equal(Array.isArray(p.order), true);
  assert.equal(p.order.length, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ui-logic.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Write `src/ui-logic.js`**

```js
import { ABILITIES } from './abilities/index.js';
import { CLASSES, RACES, deriveStats, computePreset } from './characters.js';

export function availableAbilities(character) {
  return ABILITIES.filter((a) => {
    if (a.classKey !== 'common' && a.classKey !== character.classKey) return false;
    if (a.minGame > character.game) return false;
    if (a.choiceGroup === 'game12') {
      return character.game >= 12 && character.game12Choice === a.id;
    }
    return true;
  });
}

function pickNext(targets, prev) {
  let next = -1;
  for (let j = 0; j < targets.length; j++) {
    if (j === prev) continue;
    if (next < 0 || targets[j].ac < targets[next].ac) next = j;
  }
  return next < 0 ? 0 : next;
}

export function defaultOrder(targets) {
  const n = targets.length;
  if (n < 2) return [0];
  const seq = [0]; let prev = 0;
  for (let s = 0; s < 3; s++) { const v = pickNext(targets, prev); seq.push(v); prev = v; }
  return seq;
}

export function sanitizeOrder(order, targets) {
  const n = targets.length;
  const desired = n < 2 ? 1 : 4;
  if (!Array.isArray(order) || order.length !== desired) return defaultOrder(targets);
  const out = []; let prev = -1;
  for (let i = 0; i < desired; i++) {
    let v = order[i];
    if (typeof v !== 'number' || v < 0 || v >= n) v = (i > 0 ? pickNext(targets, prev) : 0);
    if (i > 0 && v === prev) v = pickNext(targets, prev);
    out.push(v); prev = v;
  }
  return out;
}

export function defaultParams(ability, targets) {
  const out = {};
  for (const p of ability.params || []) {
    if (p.kind === 'targetPick') out[p.id] = 0;
    else if (p.kind === 'targetOrder') out[p.id] = defaultOrder(targets);
    else if (p.kind === 'distribute') out[p.id] = null;
    else if (p.kind === 'select') out[p.id] = p.options && p.options.length ? p.options[0].value : null;
    else if (p.kind === 'stepper') out[p.id] = p.min ?? 0;
    else if (p.kind === 'toggle') out[p.id] = false;
    else out[p.id] = p.default ?? null;
  }
  return out;
}

export function modifierRelevance(ability) {
  const magic = ability.category === 'magic';
  return {
    adv: !!ability.usesAttackRoll,
    dis: !!ability.usesAttackRoll,
    hex: !!ability.usesSave,
    chaos: magic,
    concentration: magic,
    rage: ability.category === 'physical',
    orcReroll: true,
  };
}

export function presetTarget(race, klass, level) {
  const pr = computePreset(race, klass, level);
  return { ac: pr.ac, hp: pr.hp, dexSave: pr.dex, race };
}

export function defaultState() {
  return {
    character: { classKey: 'wizard', raceKey: 'orc', game: 1, statOverrides: {}, bumps: null, game12Choice: null },
    abilityId: 'fireball',
    params: {},
    targets: [{ ac: 12, hp: 30, dexSave: 0, race: null, preset: null }],
    mods: { adv: false, dis: false, concentration: 0, chaos: false, hex: false, rage: false, orcReroll: true },
    pinned: false,
    trials: 100000,
    seed: 1,
  };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function deserializeState(str) {
  try {
    const s = JSON.parse(str);
    if (!s || typeof s !== 'object' || !s.character || !Array.isArray(s.targets)) return null;
    return s;
  } catch {
    return null;
  }
}
```

> Примечание про `deriveStats`/`CLASSES`/`RACES`: они используются в `ui.js` (Task 5) для вывода статов и списков, импорт здесь оставлен для `computePreset`. Если линтер ругается на неиспользуемые импорты — оставь только реально используемые (`computePreset`); остальное импортируется в `ui.js` напрямую.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ui-logic.test.js`
Expected: PASS (8 tests). Затем полный `node --test` — зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/ui-logic.js test/ui-logic.test.js
git commit -m "feat: pure UI logic — abilities filter, params, modifier relevance, state"
```

---

## Task 5: Переписать UI (`ui.js`) — конструктор, параметры, сохранение

**Files:**
- Modify: `src/ui.js` (значительная переработка, следуя существующим паттернам рендера/воркера/графиков)
- Modify: `build.js` (проверить, что glob включает `common.js` ПЕРЕД `index.js`; так как сортировка алфавитная — `common.js` < `index.js` уже исключён фильтром, а `wizard.js` идёт после `common.js`; порядок классовых файлов между собой неважен, лишь бы все были до `index.js` — уже так)

**Interfaces:**
- Consumes: `ABILITIES`, `CLASSES`, `RACES`, `deriveStats`, и из `ui-logic.js`: `availableAbilities, defaultParams, sanitizeOrder, modifierRelevance, presetTarget, defaultState, serializeState, deserializeState`.
- `baseCtx()` теперь возвращает ТОЛЬКО данные:
  ```js
  {
    stats: deriveStats(c.classKey, c.raceKey, c.game, c.bumps) с применёнными statOverrides,
    weapon: { dice: CLASSES[c.classKey].dice, stat: CLASSES[c.classKey].weaponStat },
    critRange: 20,
    targets: state.targets.map((t) => ({ ac, hp, dexSave, race: t.race })),
    mods: { ...state.mods, orcReroll: RACES[c.raceKey].orcReroll ? true : state.mods.orcReroll },
    params: normalizedParamsForCurrentAbility(),
  }
  ```
- `worker.postMessage({type:'run', abilityId, baseCtx, opts})` и `{type:'compare', ...}` — как раньше (compare бежит по `availableAbilities` текущего героя; передавать список id не нужно — worker берёт ABILITIES, но фильтрацию делаем в UI и шлём `abilityIds`? — НЕТ: оставляем worker как есть; для compare worker гоняет все ABILITIES, а UI показывает только доступные. ЧТОБЫ не сравнивать чужие классы — добавить фильтр: см. Step ниже).

> Важно: сейчас worker `compare` гоняет ВСЕ ABILITIES. Нужно сравнивать только доступные текущему герою. Добавь в сообщение `compare` поле `abilityIds` (массив id доступных), а в worker-диспетчере (в `build.js`, секция `workerCore`) фильтруй: `compareAbilities(ABILITIES.filter(a => abilityIds.includes(a.id)), baseCtx, opts)`.

- [ ] **Step 1: Обновить worker-диспетчер в `build.js` под фильтр сравнения**

В `build.js`, в строке `workerCore` шаблона, заменить ветку compare:

```js
  if (type === 'compare') {
    const list = (e.data.abilityIds && e.data.abilityIds.length)
      ? ABILITIES.filter((a) => e.data.abilityIds.includes(a.id))
      : ABILITIES;
    self.postMessage({ type: 'comparison', rows: compareAbilities(list, baseCtx, opts) });
  }
```

- [ ] **Step 2: Переписать `src/ui.js`**

Сохрани без изменений (это display-only, уже работает): `SPELL_META`/`GLOW` (дополни записью `basicAttack: { element:'steel', formula:'куб оружия + стат' }` и `steel:'#cdb892'` в GLOW), вспомогательные `fmt/pct/gcd`, весь блок графиков `statsFromFreq/drawBase/wireChart/renderResult/renderComparison`. Гистограммы и метрики не меняются.

Замени модель состояния и связанные рендеры. Ключевые новые/изменённые части:

**Состояние и инициализация** — грузим из localStorage, иначе дефолт:

```js
function initUI(root) {
  const STORAGE_KEY = 'dnd-dmg-state';
  let state = deserializeState(localStorage.getItem(STORAGE_KEY)) || defaultState();

  const save = () => { try { localStorage.setItem(STORAGE_KEY, serializeState(state)); } catch {} };
  const qsa = (s) => document.querySelectorAll(s);

  const worker = makeWorker();
  worker.onmessage = (e) => {
    if (e.data.type === 'result') renderResult(e.data.metrics);
    if (e.data.type === 'comparison') renderComparison(e.data.rows);
  };
  // ... root.innerHTML (см. ниже), затем первичные рендеры и run()
}
```

**Каркас разметки** (`root.innerHTML`) — добавь секцию конструктора героя сверху, кнопку «Сбросить», открепляемый результат. Структура секций:

```
<header class="masthead"> crest + «Боевой гримуар» + динамический заголовок (имя класса) + кнопка «Сбросить» (.btn-ghost, id="reset")
<section class="hero" id="result"> ... (получает класс .pinned по state.pinned; внутри кнопка id="pin")
<div id="charts"></div>
<div class="label">Герой</div>
<div id="builder"></div>           ← класс/раса/игра + выведенные статы + оружие + (game12) + сброс статов
<div class="label">Способность</div>
<div id="spells"></div>
<div id="params"></div>            ← авто-рендер параметров выбранной способности
<div class="label">Модификаторы</div>
<div id="mods"></div>
<div class="label">Цели</div>
<div id="targets"></div>
<button class="btn btn-dashed" id="addTarget">+ Добавить цель</button>
<div class="label">Сравнение способностей героя</div>
<div id="compare"></div>
<p class="foot">…</p>
```

**renderBuilder()** — три селекта (класс/раса/игра 1–20) + сетка выведенных статов (редактируемые, с учётом `statOverrides`) + чип оружия. При смене класса/расы/игры: пересчитать доступные способности, если текущая `abilityId` недоступна — выбрать первую доступную; пересчитать дефолтные params; `save(); rerenderAll(); run()`.

```js
  function effectiveStats() {
    const c = state.character;
    const base = deriveStats(c.classKey, c.raceKey, c.game, c.bumps);
    return { ...base, ...c.statOverrides };
  }
  function renderBuilder() {
    const c = state.character;
    const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${sel===k?'selected':''}>${v.name}</option>`).join('');
    const games = Array.from({length:20},(_,i)=>i+1).map((g)=>`<option ${c.game===g?'selected':''}>${g}</option>`).join('');
    const s = effectiveStats();
    const keys = [['str','Сила'],['dex','Лов'],['con','Стой'],['wis','Муд'],['int','Инт'],['cha','Хар']];
    const wpn = CLASSES[c.classKey];
    document.getElementById('builder').innerHTML = `
      <div class="card">
        <div class="build-top">
          <label class="field"><span>Класс</span><select id="bClass">${opt(CLASSES,c.classKey)}</select></label>
          <label class="field"><span>Раса</span><select id="bRace">${opt(RACES,c.raceKey)}</select></label>
          <label class="field"><span>Игра</span><select id="bGame">${games}</select></label>
        </div>
        <div class="stats">${keys.map(([k,l])=>`<label class="stat"><span class="s-k">${l}</span><input class="s-v" type="number" data-stat="${k}" value="${s[k]}"></label>`).join('')}</div>
        <div class="kit"><span class="chip">Оружие <i>${wpn.dice} · ${wpn.weaponStat==='str'?'Сила':'Ловкость'}</i></span></div>
      </div>`;
    document.getElementById('bClass').onchange = (e)=>{ state.character.classKey=e.target.value; state.character.statOverrides={}; onCharacterChange(); };
    document.getElementById('bRace').onchange  = (e)=>{ state.character.raceKey=e.target.value; state.character.statOverrides={}; onCharacterChange(); };
    document.getElementById('bGame').onchange  = (e)=>{ state.character.game=Number(e.target.value); onCharacterChange(); };
    qsa('[data-stat]').forEach((el)=>el.onchange=()=>{ state.character.statOverrides[el.dataset.stat]=Number(el.value); save(); run(); });
  }
  function onCharacterChange() {
    const avail = availableAbilities(state.character);
    if (!avail.find((a)=>a.id===state.abilityId)) state.abilityId = avail[0] ? avail[0].id : null;
    ensureParams();
    save(); renderBuilder(); renderSpells(); renderParams(); renderMods(); setGlow(); run();
  }
```

**renderSpells()** — как раньше, но по `availableAbilities(state.character)` (не по всем ABILITIES); `state.abilityId` подсвечивается; при выборе — `ensureParams(); save(); renderParams(); renderMods(); setGlow(); run()`.

**ensureParams() / renderParams()** — авто-рендер контролов по `ability.params`:

```js
  function currentAbility(){ return availableAbilities(state.character).find((a)=>a.id===state.abilityId) || null; }
  function ensureParams() {
    const a = currentAbility(); if (!a) { state.params = {}; return; }
    const def = defaultParams(a, state.targets);
    state.params = { ...def, ...(state.params||{}) };
    if (a.params.some((p)=>p.kind==='targetOrder')) {
      const op = a.params.find((p)=>p.kind==='targetOrder');
      state.params[op.id] = sanitizeOrder(state.params[op.id], state.targets);
    }
    // targetPick в пределах числа целей
    a.params.filter((p)=>p.kind==='targetPick').forEach((p)=>{
      if (state.params[p.id]>=state.targets.length) state.params[p.id]=0;
    });
  }
```

`renderParams()` рисует по типам: `targetPick` → ряд кнопок-целей; `targetOrder` → набор select'ов «Удар N» (перенести вид из старого `renderChainSeq`, источник — `state.params.order`); `distribute` → (для волшебных снарядов можно пока показывать подпись «по кругу», без контрола — дефолт null); `select`/`stepper`/`toggle` → стандартные контролы. Любое изменение: пишет в `state.params[id]`, затем `ensureParams(); save(); renderParams(); run()`. Если у способности нет параметров — секция пустая.

**renderMods()** — как раньше, но релевантность из `modifierRelevance(currentAbility())`; добавить тумблер `rage` (Зелье ярости ×2 физ). `orcReroll`: если у расы `RACES[raceKey].orcReroll` — показать включённым и пометить «авто (раса)», чекбокс задизейблен. Концентрация-степпер — как раньше. Любое изменение: `save(); run()`.

**renderTargets()** — как раньше (КБ/HP/Ловкость + блок пресета раса/класс/игра), но:
- пресет теперь зовёт `presetTarget(race, klass, level)` и сохраняет `t.race` (для расовых правил);
- добавить в блок пресета селект расы опцию-первой «— без расы (уникальный)» (`value=""`), при выборе которой `t.race=null` и расовые правила не применяются; показывать активное правило, если `t.race` задан и у расы есть `onIncoming` (короткая подпись, напр. «−50% к маг» / «+2 к маг» / «+2 к физ»);
- при изменении КБ/HP/Ловкости/состава целей — пересчитывать `ensureParams()` (порядок/цель зависят от числа целей), `save(); run()`.

**Открепление результата и сброс:**

```js
  document.getElementById('reset').onclick = () => {
    localStorage.removeItem(STORAGE_KEY); state = defaultState(); ensureParams();
    renderAll(); run();
  };
  // в renderResult: навесить на #pin переключатель state.pinned + класс .pinned на #result; save()
```

**baseCtx()** (заменить старый):

```js
  function baseCtx() {
    const c = state.character;
    return {
      stats: effectiveStats(),
      weapon: { dice: CLASSES[c.classKey].dice, stat: CLASSES[c.classKey].weaponStat },
      critRange: 20,
      targets: state.targets.map((t)=>({ ac:t.ac, hp:t.hp, dexSave:t.dexSave, race:t.race||null })),
      mods: { ...state.mods, orcReroll: RACES[c.raceKey].orcReroll ? true : state.mods.orcReroll },
      params: state.params,
    };
  }
  function run() {
    ensureParams();
    const opts = { trials: state.trials, seed: state.seed };
    const ids = availableAbilities(state.character).map((a)=>a.id);
    worker.postMessage({ type:'run', abilityId: state.abilityId, baseCtx: baseCtx(), opts });
    worker.postMessage({ type:'compare', baseCtx: baseCtx(), opts, abilityIds: ids });
  }
```

Добавь функцию `renderAll()` (вызывает setGlow + renderBuilder + renderSpells + renderParams + renderMods + renderTargets) и вызови её при инициализации; `save()` — после каждого изменения состояния.

Удали мёртвые после переписи функции: старый `renderChainSeq` (вид переносится в renderParams для `targetOrder`), старый блок Интеллекта (#int) и его обработчики, `renderMechanics` можно сохранить (полезен) — но адаптируй под `state.params`/`effectiveStats().int`; если адаптация затратна — допускается убрать секцию «Механика по целям» в этом плане (не обязательна). Реши по месту, не плоди мёртвый код.

**CSS:** добавь в `template.html` минимально нужные классы из мокапа, которых ещё нет: `.card`, `.build-top`, `.stats`, `.stat`, `.s-k`, `.s-v`, `.kit`, `.params`, `.pick`, `.opt`, `.hero.pinned`, `.pin`, `.rule`, `.addfoe`/переиспользовать `.btn-dashed`. Стиль — в духе существующих токенов (var(--stone), var(--hairline), var(--rune-gold), var(--glow)). Не меняй существующие классы.

- [ ] **Step 3: Build**

Run: `node build.js`
Expected: `dnd-dmg.html собран, <N> байт`, без ошибок.

- [ ] **Step 4: Smoke + zero external URLs**

Run: `node -e "const s=require('fs').readFileSync('dnd-dmg.html','utf8'); for(const sym of ['basicAttack','availableAbilities','effectiveStats','localStorage']) if(!s.includes(sym)) throw new Error('нет '+sym); const u=(s.match(/https?:\/\/[^\s\"')]+/g)||[]); if(u.length) throw new Error('внешние url: '+u.length); console.log('ok', s.length)"`
Expected: `ok <N>`.

- [ ] **Step 5: Run full unit suite**

Run: `node --test`
Expected: PASS (всё зелёное; UI не покрыт юнит-тестами, логика — в ui-logic.test.js).

- [ ] **Step 6: Commit**

```bash
git add src/ui.js build.js template.html dnd-dmg.html
git commit -m "feat: character builder UI, ability params, persistence, pinning"
```

---

## Task 6: Браузерная проверка (Playwright)

**Files:** нет изменений кода (только проверка; багфиксы — отдельными правками, если найдутся).

**Interfaces:** none.

- [ ] **Step 1: Открыть собранный файл**

Открой `file://<абсолютный путь>/dnd-dmg.html` через Playwright MCP (`browser_navigate`). Установи окно ~390px шириной (`browser_resize` 390×800) для мобильной проверки.

- [ ] **Step 2: Проверки (через snapshot/evaluate, фиксируй результат)**

1. Стартовый расчёт волшебника отрисовался (в `#result` есть число среднего урона, гистограмма-canvas присутствует). 
2. Конструктор: смени класс на «Воин» — список способностей становится `['Базовая атака оружием']`, статы пересчитались (Сила +3 и т.п.), расчёт обновился без ошибок.
3. Параметры: верни «Волшебник», выбери «Цепная молния», добавь 2-ю цель — появляется блок «Порядок ударов» (targetOrder), смена порядка пересчитывает урон.
4. Модификаторы: у «Огненного шара» активен «Сглаз», «Преимущество» приглушено; у «Базовой атаки» активна «Ярость», «Хаос» приглушён. Орочий переброс показан включённым/авто (раса орк).
5. Цели: примени пресет (раса+класс+уровень) — КБ/HP подставились, видна подпись расового правила; выбери «— без расы» — правило исчезает.
6. Сохранение: измени класс/способность, перезагрузи страницу (`browser_navigate` повторно) — состояние восстановилось из localStorage. Нажми «Сбросить» — вернулся дефолт (Волшебник/Огненный шар).
7. Закрепление: кнопка «📌 Закрепить» делает `#result` липким (класс .pinned), повторное нажатие снимает.
8. Консоль (`browser_console_messages`) — нет ошибок (errors). 

- [ ] **Step 3: Зафиксировать результат**

Запиши в отчёт: какие из 8 проверок PASS/FAIL, текст любых консольных ошибок, скриншот десктоп + мобайл (`browser_take_screenshot`). Если есть FAIL/ошибки — перечисли конкретно (это станет багфикс-правками до завершения плана).

- [ ] **Step 4: Commit (только если были багфиксы)**

Если по итогам проверки понадобились правки кода — внеси их, пересобери (`node build.js`), повтори проверку, затем:

```bash
git add -A
git commit -m "fix: <конкретная проблема, найденная браузерной проверкой>"
```

Если всё прошло без правок — коммит не нужен.

---

## Self-Review

**Spec coverage (разделы дизайн-спеки, относящиеся к UI):**
- Конструктор героя (класс/раса/игра → статы/оружие, правка вручную) → Task 5 (renderBuilder, effectiveStats). ✔
- Выбор способности только доступных (minGame/choiceGroup) → Task 4 (availableAbilities) + Task 5. ✔
- Авто-рендер параметров способности → Task 4 (defaultParams) + Task 5 (renderParams). ✔
- Базовая атака для всех классов + статы в ctx → Task 2, Task 3. ✔
- Модификаторы: фильтрация по релевантности, rage, орочий переброс авто от расы → Task 4 (modifierRelevance) + Task 5. ✔
- Цели: пресет с расой + уникальный без расы + показ правила → Task 5 (presetTarget). ✔
- Сохранение в localStorage + кнопка «Сбросить» → Task 4 (serialize) + Task 5. ✔
- Результат не закреплён по умолчанию + «📌 Закрепить» → Task 5. ✔
- Сравнение только способностей текущего героя → Task 5 (abilityIds) + build.js фильтр. ✔
- Браузерная верификация → Task 6. ✔
- Талант 16-й как модификатор — **намеренно отложен в План 4** (нечёткая семантика «+3 к кубу»); артефакты — План 4.

**Placeholder scan:** Tasks 1–4 содержат полный код и тесты. Task 5 — переработка большого display-файла существующего проекта: даны полный новый контракт `baseCtx`, ключевые новые функции (renderBuilder, onCharacterChange, ensureParams, baseCtx, run) и точные инструкции по адаптации остального с опорой на существующие паттерны `ui.js`; блоки графиков/метрик переиспользуются без изменений. Это осознанная адаптация под правило «в существующем коде следуй принятым паттернам»; целостность гарантируется юнит-тестами логики (Task 4) и браузерной проверкой (Task 6).

**Type consistency:** `baseCtx` несёт `stats/weapon/critRange/targets[{ac,hp,dexSave,race}]/mods/params` (Task 5) — ровно то, что потребляют `runAbility` (Task 2, навешивает `attackBonus`), `applyPipeline` (расовые правила по `target.race`), и способности (`ctx.attackBonus(stat)`, `ctx.weapon`, `ctx.params`). `availableAbilities/defaultParams/sanitizeOrder/modifierRelevance/presetTarget/defaultState/serializeState/deserializeState` определены в Task 4 и потребляются в Task 5 под теми же именами. `abilityIds` в сообщении compare (Task 5) потребляется фильтром в `build.js` worker-ядре (Task 5 Step 1).

## Execution Handoff

После сохранения плана — выбор способа исполнения (как в Плане 1: subagent-driven).
