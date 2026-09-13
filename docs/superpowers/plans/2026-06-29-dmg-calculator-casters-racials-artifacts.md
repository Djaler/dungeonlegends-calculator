# Калькулятор урона — заклинатели, расовые способности, артефакты (План 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить покрытие: добавить урон-способности пяти классов-заклинателей (Друид, Изобретатель, Жрец, Бард, Некромант), способность волшебника 12-й игры, расовые урон-способности (драконорождённый/дварф/тифлинг) с гейтингом по расе и пассивные артефакты (Руна воителя, Наручи удачи, Руна стихий).

**Architecture:** Атакующие способности оружием по-прежнему идут через `multiWeaponAttack`; заклинательские/спасброс/авто-урон считаются в своих `simulateOnce` напрямую (как `deathDance`/`fireball`). Способности гейтятся по `classKey`/`raceKey`/`minGame`/`choiceGroup`. Артефакты: Руна воителя — флаг в `mods`, обрабатывается в `multiWeaponAttack` (+1 к атаке и урону оружия); Наручи удачи — через `critRangeForCharacter` (19); Руна стихий — флаг в `mods`, обрабатывается в пайплайне (`applyPipeline`): конверсия типа всех пакетов в выбранный + добавление 1д6 этого типа. Талант (16-я) — НЕ моделируется (по решению заказчика).

**Tech Stack:** Чистый ES-модульный JavaScript, без зависимостей. Тесты — `node --test`. Сборка — `node build.js`. Браузерная проверка — Playwright MCP.

## Global Constraints

- Никаких внешних зависимостей/CDN/сети — всё инлайн в `dnd-dmg.html`; 0 внешних URL.
- `ctx` через `postMessage` — только данные (без функций); `attackBonus` навешивается в воркере.
- Статы: `str,dex,con,wis,int,cha`. Категории урона: physical / magic. Тип: physical/magic/fire/lightning/necrotic/psychic/radiant.
- Способность → массив пакетов `{type,amount}` на цель; `[]` = ноль. Крит удваивает кубы урона (уже реализовано).
- Сохранять зелёными существующие тесты (105 на старте); адаптировать только меняющееся.
- Комментарии/UI-текст — на русском, в стиле кода. Дизайн-язык не менять.
- Коммиты — conventional commits; ветка `feat/dmg-calculator`.

## Контекст для исполнителя (состояние на старте)

Планы 1–3 готовы. Есть: `engine.js` (rollDie, sumDice, rollNotation, attackRoll, isHit(nat,bonus,ac,critRange) возвращает {hit,crit}, resolveMode, makeRng), `types.js` (categoryOf), `characters.js` (CLASSES/RACES/deriveStats/computePreset), `modifiers.js` (applyPipeline — аддитив концентрации, множители chaos/rage по категории, правила цели), `abilities/shared.js` (multiWeaponAttack — все боевые модификаторы + крит-удвоение), `abilities/{common,wizard,warrior,barbarian,ranger,monk}.js`, `abilities/index.js` (ABILITIES), `simulator.js`, `ui-logic.js` (availableAbilities, defaultParams, sanitizeOrder, modifierRelevance(ability,character), GAME12_CHOICES, weaponForCharacter, critRangeForCharacter, presetTarget, state helpers), `ui.js`. Способности волшебника читают `ctx.attackBonus('int')`; оружейные — `ctx.attackBonus(ctx.weapon.stat)`.

`availableAbilities(character)` сейчас: `(classKey==='common' || classKey===character.classKey) && minGame<=game && (choiceGroup==='game12' ? game>=12 && game12Choice===id : true)`.

---

## File Structure

- `src/ui-logic.js` — **Modify**: `availableAbilities` добавляет `raceKey`-гейтинг; `GAME12_CHOICES` — добавить варианты для друида/изобретателя/жреца/барда/некроманта (если ещё нет); `critRangeForCharacter` — учесть Наручи удачи (19); `modifierRelevance` — новые флаги (sacredWeapon, inspiration, tincture, runeOfWarrior, runeOfElements).
- `src/abilities/racial.js` — **Create**: RACIAL_ABILITIES (dragonbornBreath, dwarfHeadbutt, tieflingRetribution).
- `src/abilities/druid.js`, `artificer.js`, `cleric.js`, `necromancer.js` — **Create**. (Бард — без объектов-способностей, только модификаторы.)
- `src/abilities/wizard.js` — **Modify**: добавить `unknownAttack` (choiceGroup game12).
- `src/abilities/shared.js` — **Modify**: учесть `mods.runeOfWarrior` (+1 к атаке и урону) и `mods.sacredWeapon` (+con к атаке и урону).
- `src/modifiers.js` — **Modify**: `applyPipeline` — поддержать `mods.tincture` (×2 весь урон), `mods.inspiration` (+1д6 первой цели), `mods.runeOfElements` (конверсия типа + 1д6).
- `src/abilities/index.js` — **Modify**: подмешать новые массивы.
- `src/ui.js` — **Modify**: мультивыбор артефактов в конструкторе, новые тумблеры модификаторов, проводка `mods`/`artifacts` в baseCtx (гейтить по relevance, как в Плане 3).
- `test/*.test.js` — **Create/Modify** соответствующие.

---

## Task 1: Расовый гейтинг + расовые способности (`racial.js`)

**Files:** Create `src/abilities/racial.js`, `test/racial.test.js`; Modify `src/ui-logic.js` (availableAbilities), `src/abilities/index.js`, `test/ui-logic.test.js`.

**Interfaces:**
- `availableAbilities(character)` дополнить: ability проходит, если `a.classKey==='common' || a.classKey===character.classKey || a.raceKey===character.raceKey`, при тех же условиях minGame/choiceGroup. (`raceKey` по умолчанию undefined у классовых способностей.)
- `RACIAL_ABILITIES`:
  - `dragonbornBreath` (Огненное дыхание): `raceKey:'dragonborn', classKey:null, minGame:1, charges:'2 раза в бой', targeting:'area', usesAttackRoll:false, usesSave:false, category:'magic', params:[]`. Каждая цель получает `sumDice(2,6)` урона типа `fire` (авто, без броска).
  - `dwarfHeadbutt` (Тяжёлая голова): `raceKey:'dwarf', minGame:1, charges:'2 раза в бой', targeting:'single', usesAttackRoll:false, usesSave:false, category:'physical', params:[targetPick]`. Выбранная цель получает ровно `6` физического урона (без броска).
  - `tieflingRetribution` (Адское возмездие): `raceKey:'tiefling', minGame:1, charges:'2 раза в бой', targeting:'single', usesAttackRoll:false, usesSave:false, category:'magic', params:[targetPick]`. Выбранная цель получает `sumDice(1,8)` урона типа `fire`.

- [ ] **Step 1: Write failing tests (`test/racial.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => ({ rng: over.rng, stats: over.stats ?? {str:0,dex:0,con:0,wis:0,int:0,cha:0},
  attackBonus:(s)=>(over.stats?over.stats[s]:0), critRange:20, weapon:{dice:'1d6',stat:'dex'},
  targets: over.targets ?? [{ac:12,hp:30}], mods:{orcReroll:false,...(over.mods||{})}, params: over.params||{} });

test('dragonbornBreath: 2d6 огнём по всем целям', () => {
  const p = get('dragonbornBreath').simulateOnce(ctx({ rng: seqRng([0.99,0.99, 0.99,0.99]), targets:[{ac:12,hp:30},{ac:12,hp:30}] }));
  assert.deepEqual(p, [[{type:'fire',amount:12}],[{type:'fire',amount:12}]]);
});
test('dwarfHeadbutt: ровно 6 физ по выбранной цели', () => {
  const p = get('dwarfHeadbutt').simulateOnce(ctx({ rng: seqRng([]), targets:[{ac:12,hp:30},{ac:12,hp:30}], params:{target:1} }));
  assert.deepEqual(p, [[],[{type:'physical',amount:6}]]);
});
test('tieflingRetribution: 1d8 огнём', () => {
  const p = get('tieflingRetribution').simulateOnce(ctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[{type:'fire',amount:8}]]);
});
```

И в `test/ui-logic.test.js` добавь:
```js
test('availableAbilities: дварф любого класса видит Тяжёлую голову', () => {
  const ids = availableAbilities({classKey:'wizard',raceKey:'dwarf',game:1,game12Choice:null}).map(a=>a.id);
  assert.ok(ids.includes('dwarfHeadbutt'));
});
test('availableAbilities: не-дварф НЕ видит Тяжёлую голову', () => {
  const ids = availableAbilities({classKey:'wizard',raceKey:'orc',game:1,game12Choice:null}).map(a=>a.id);
  assert.ok(!ids.includes('dwarfHeadbutt'));
});
```

- [ ] **Step 2: Run → fail** (`node --test test/racial.test.js test/ui-logic.test.js`).

- [ ] **Step 3: Write `src/abilities/racial.js`**

```js
import { sumDice } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const RACIAL_ABILITIES = [
  {
    id: 'dragonbornBreath', name: 'Огненное дыхание', raceKey: 'dragonborn', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount: sumDice(2, 6, ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
  {
    id: 'dwarfHeadbutt', name: 'Тяжёлая голова', raceKey: 'dwarf', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      out[ctx.params.target ?? 0].push({ type: 'physical', amount: 6 });
      return out;
    },
  },
  {
    id: 'tieflingRetribution', name: 'Адское возмездие', raceKey: 'tiefling', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      out[ctx.params.target ?? 0].push({ type: 'fire', amount: sumDice(1, 8, ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
];
```

- [ ] **Step 4: Update `availableAbilities` (`src/ui-logic.js`)** — добавить `|| a.raceKey === character.raceKey` в условие класса:
```js
    if (a.classKey !== 'common' && a.classKey !== character.classKey && a.raceKey !== character.raceKey) return false;
```
- [ ] **Step 5: index.js** — импортировать и подмешать `RACIAL_ABILITIES`.
- [ ] **Step 6: Run** focused + full → green.
- [ ] **Step 7: Commit** `feat: racial damage abilities with race gating`

---

## Task 2: Артефакты (Руна воителя, Наручи удачи, Руна стихий)

**Files:** Modify `src/abilities/shared.js`, `src/modifiers.js`, `src/ui-logic.js`; tests `test/shared.test.js`, `test/modifiers.test.js`, `test/ui-logic.test.js`.

**Interfaces:**
- `multiWeaponAttack`: учесть `m.runeOfWarrior` (bool) и `m.sacredWeapon` (число — бонус Стойкости, передаётся UI; 0 если нет). Добавляются к `hitBonus` и к урону оружия (как плоский бонус, НЕ удваивается критом): `const extra = (m.runeOfWarrior?1:0) + (m.sacredWeapon||0);` → `hitBonus += extra`, и в `amount` прибавляется `extra`.
- `applyPipeline`: новые шаги (после аддитива концентрации, до множителей):
  - `mods.inspiration` (bool): +`sumDice(1,6)` к первой цели с уроном (как концентрация, но 1д6, тип `magic`). [Воодушевление барда — +д6 к урону.]
  - `mods.runeOfElements` (bool) + `mods.runeType` (строка типа): сперва конвертировать тип ВСЕХ пакетов всех целей в `runeType`, затем добавить `{type:runeType, amount:sumDice(1,6)}` первой цели с уроном.
  - множители: добавить `mods.tincture` (bool) — ×2 ВЕСЬ урон (после chaos/rage; т.е. общий множитель). [Настойка «смелость».]
- `critRangeForCharacter(c)`: вернуть `Math.min(базовый, 19)` если `c.artifacts` включает `'braceletsOfLuck'` (Наручи удачи: 19 = крит). Базовый = 18 (weakSpot воина) или 20.

- [ ] **Step 1: Write failing tests**

`test/shared.test.js` (добавь):
```js
test('Руна воителя: +1 к урону оружия (и помогает попасть)', () => {
  // stat str 3, rune +1 => bonus к урону 4. nat 0.5 hit; d10 0.99->10 +3 +1 =14
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5,0.99]), mods:{ runeOfWarrior:true } }), [0]);
  assert.deepEqual(p, [[{type:'physical',amount:14}]]);
});
test('Священное оружие: +Стойкость к урону оружия', () => {
  // sacredWeapon=4 => +4 урон. d10 0.99->10 +3 +4 =17
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5,0.99]), mods:{ sacredWeapon:4 } }), [0]);
  assert.deepEqual(p, [[{type:'physical',amount:17}]]);
});
```
(используй существующий ctx-хелпер shared.test.js; добавь поля в его mods-дефолт: runeOfWarrior:false, sacredWeapon:0, runeOfElements:false, inspiration:false, tincture:false.)

`test/modifiers.test.js` (добавь):
```js
test('настойка: ×2 весь урон (физ и маг)', () => {
  const out = applyPipeline([[{type:'fire',amount:10},{type:'physical',amount:5}]], baseCtx({ mods:{ tincture:true } }));
  assert.deepEqual(out, [30]); // (10+5)*2
});
test('воодушевление: +1д6 первой цели с уроном', () => {
  const out = applyPipeline([[{type:'physical',amount:5}]], baseCtx({ rng: seqRng([0.99]), mods:{ inspiration:true } }));
  assert.deepEqual(out, [11]); // 5 + 6
});
test('Руна стихий: конверсия типа + 1д6', () => {
  // конвертим всё в radiant, +1д6 radiant. база physical 5 -> radiant 5; +6 =11 radiant
  const out = applyPipeline([[{type:'physical',amount:5}]], baseCtx({ rng: seqRng([0.99]), mods:{ runeOfElements:true, runeType:'radiant' } }));
  assert.deepEqual(out, [11]);
});
```
(добавь в baseCtx-хелпер modifiers.test.js недостающие mods-ключи с дефолтами: tincture:false, inspiration:false, runeOfElements:false, runeType:undefined.)

`test/ui-logic.test.js`:
```js
test('critRangeForCharacter: Наручи удачи дают 19', () => {
  assert.equal(critRangeForCharacter({classKey:'wizard',game:1,artifacts:['braceletsOfLuck']}), 19);
  assert.equal(critRangeForCharacter({classKey:'warrior',game:12,game12Choice:'weakSpot',artifacts:['braceletsOfLuck']}), 18);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `shared.js`** — в начале расчёта бонуса:
```js
  const extra = (m.runeOfWarrior ? 1 : 0) + (m.sacredWeapon || 0);
  const statBonus = ctx.attackBonus(ctx.weapon.stat) * rageF;
  const hitBonus = statBonus + extra - (m.gwm ? 5 : 0);
  // ... в amount: + statBonus + extra + dmgFlat (extra НЕ удваивается критом)
```
Перепиши формулу урона так, чтобы удваивались критом ТОЛЬКО кубы (`rollWeapon(crit)`), а `statBonus + extra + dmgFlat` прибавлялись один раз.

- [ ] **Step 4: Implement `modifiers.js`** — добавь функции/шаги в `applyPipeline` (после `addAttackerAdditive`):
```js
function addInspiration(packets, ctx) {
  if (!ctx.mods.inspiration) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll) }];
  return packets;
}
function applyRuneOfElements(packets, ctx) {
  if (!ctx.mods.runeOfElements) return packets;
  const t = ctx.mods.runeType || 'fire';
  let p = packets.map((arr) => arr.map((pk) => ({ ...pk, type: t })));
  const idx = p.findIndex((arr) => arr.length > 0);
  const target = idx >= 0 ? idx : 0;
  p[target] = [...(p[target] || []), { type: t, amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll) }];
  return p;
}
```
В `applyMultipliers` учти tincture: общий множитель `tinctureF = ctx.mods.tincture ? 2 : 1` применяется ко всем пакетам ПОСЛЕ категорийных (chaos/rage):
```js
  return packets.map((arr) => arr.map((p) => ({ ...p, amount: p.amount * mult(categoryOf(p.type)) * tinctureF })));
```
Порядок в `applyPipeline`: additive(концентрация) → inspiration → runeOfElements → multipliers(chaos/rage/tincture) → finalize(правила цели).

- [ ] **Step 5: Implement `critRangeForCharacter` (`ui-logic.js`)** — учесть артефакт:
```js
export function critRangeForCharacter(c) {
  let r = (c.classKey === 'warrior' && c.game >= 12 && c.game12Choice === 'weakSpot') ? 18 : 20;
  if (c.artifacts && c.artifacts.includes('braceletsOfLuck')) r = Math.min(r, 19);
  return r;
}
```

- [ ] **Step 6: Run** all focused + full → green.
- [ ] **Step 7: Commit** `feat: passive artifacts (rune of warrior, bracelets of luck, rune of elements) + sacred weapon/inspiration/tincture pipeline`

---

## Task 3: Друид (`druid.js`)

**Files:** Create `src/abilities/druid.js`, `test/druid.test.js`; Modify index.js, `GAME12_CHOICES` (druid).

**Interfaces:** `DRUID_ABILITIES = [beastForm, thornPath]`.
- `beastForm` (Облик зверя): `classKey:'druid', minGame:1, targeting:'single', usesAttackRoll:true, usesSave:false, category:'physical', params:[{id:'form',kind:'select',label:'Форма',options:[{value:'bear',label:'Медведь'},{value:'snake',label:'Змея'}],default:'bear'},{id:'target',kind:'targetPick',label:'Цель',default:0}]`. Медведь: 2 атаки `d20+Сила`, урон `(beastRage?'1d12':'1d10')+Сила` (крит удваивает кубы). Змея: 1 атака `d20+Ловкость`, урон `(beastRage?'1d8':'1d6')+Ловкость`. `beastRage` = `ctx.mods.beastRage` (выставляется UI при выборе [12] «Ярость зверя»).
- `thornPath` (Тернистый путь): `classKey:'druid', minGame:1, charges:'2 раза в день', targeting:'area', usesAttackRoll:false, usesSave:false, category:'physical', params:[]`. Каждая цель получает `sumDice(3,6)` физического урона (авто).
- `GAME12_CHOICES.druid = [{id:'beastRage',name:'Ярость зверя (кубы форм↑)'},{id:'windGust',name:'Порыв ветра'}]`.

> Облик зверя не идёт через `multiWeaponAttack` (свои кубы/стат на форму). Реализуй атаки вручную через `attackRoll/isHit/rollNotation`, удваивая кубы на крите (как singleAttack в wizard.js — посмотри пример). Змеиный DoT «тот же урон 2 хода» — только немедленный удар, пометь комментарием.

- [ ] **Step 1: Write failing test (`test/druid.test.js`)** — кейсы: медведь = 2 атаки d10+str; змея = 1 атака d6+dex; beastRage делает d12/d8; крит удваивает кубы. (Сконструируй seqRng по образцу shared/wizard тестов; помни: nat 0.99 = крит → кубы дважды.)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a)=>a.id==='beastForm');
const dctx = (over) => { const stats = over.stats ?? {str:2,dex:2,con:0,wis:2,int:0,cha:-2};
  return { rng:over.rng, stats, attackBonus:(s)=>stats[s], critRange:20, weapon:{dice:'1d4',stat:'dex'},
    targets:over.targets??[{ac:10,hp:99}], mods:{orcReroll:false,adv:false,dis:false,beastRage:false,...(over.mods||{})}, params:over.params||{} }; };

test('Медведь: 2 атаки d10+Сила', () => {
  // 2 атаки: nat 0.5 (=11 hit, +2>=10), d10 0.99->10 +2 =12 каждая
  const p = get().simulateOnce(dctx({ rng: seqRng([0.5,0.99, 0.5,0.99]), params:{form:'bear',target:0} }));
  assert.deepEqual(p, [[{type:'physical',amount:12},{type:'physical',amount:12}]]);
});
test('Змея: 1 атака d6+Ловкость', () => {
  const p = get().simulateOnce(dctx({ rng: seqRng([0.5,0.99]), params:{form:'snake',target:0} }));
  assert.deepEqual(p, [[{type:'physical',amount:8}]]); // d6 0.99->6 +2(dex)
});
test('Ярость зверя: медведь d12', () => {
  const p = get().simulateOnce(dctx({ rng: seqRng([0.5,0.99, 0.5,0.99]), mods:{beastRage:true}, params:{form:'bear',target:0} }));
  assert.deepEqual(p, [[{type:'physical',amount:14},{type:'physical',amount:14}]]); // d12 0.99->12 +2
});
test('thornPath: 3d6 по всем целям', () => {
  const p = ABILITIES.find(a=>a.id==='thornPath').simulateOnce(dctx({ rng: seqRng([0.99,0.99,0.99]) }));
  assert.deepEqual(p, [[{type:'physical',amount:18}]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/druid.js`**

```js
import { attackRoll, isHit, resolveMode, rollNotation } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

// Кубы урона с удвоением на крите (как в shared/wizard).
function dmgDice(notation, ctx, crit) {
  const one = () => rollNotation(notation, ctx.rng, ctx.mods.orcReroll);
  return crit ? one() + one() : one();
}

export const DRUID_ABILITIES = [
  {
    id: 'beastForm', name: 'Облик зверя', classKey: 'druid',
    minGame: 1, choiceGroup: null, charges: 'бонусное действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [
      { id: 'form', kind: 'select', label: 'Форма', default: 'bear',
        options: [{ value: 'bear', label: 'Медведь' }, { value: 'snake', label: 'Змея' }] },
      { id: 'target', kind: 'targetPick', label: 'Цель', default: 0 },
    ],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bear = (ctx.params.form ?? 'bear') === 'bear';
      const stat = bear ? 'str' : 'dex';
      const die = bear ? (ctx.mods.beastRage ? '1d12' : '1d10') : (ctx.mods.beastRage ? '1d8' : '1d6');
      const bonus = ctx.attackBonus(stat);
      const attacks = bear ? 2 : 1; // змеиный урон повторяется 2 хода — учитываем только немедленный
      for (let a = 0; a < attacks; a++) {
        const nat = attackRoll(ctx.rng, mode);
        const { hit, crit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange);
        if (hit) out[i].push({ type: 'physical', amount: dmgDice(die, ctx, crit) + bonus });
      }
      return out;
    },
  },
  {
    id: 'thornPath', name: 'Тернистый путь', classKey: 'druid',
    minGame: 1, choiceGroup: null, charges: '2 раза в день', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'physical', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'physical', amount: rollNotation('3d6', ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
];
```

- [ ] **Step 4: index.js + GAME12_CHOICES.druid** (в ui-logic.js).
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: druid abilities (beast form, thorn path)`

---

## Task 4: Изобретатель (`artificer.js`)

**Files:** Create `src/abilities/artificer.js`, `test/artificer.test.js`; Modify index.js, `GAME12_CHOICES.artificer`.

**Interfaces:** `ARTIFICER_ABILITIES = [argument, flamethrower, unstableArgument]`.
- `argument` (Арбалет «Аргумент»): single ranged attack `d20+Интеллект`(?) — НЕТ, изобретатель бьёт от Ловкости (владение арбалет=dex); используем `ctx.attackBonus('dex')`. select наконечник: `усиленный` (урон `2d8` physical), `гарпун` (урон `1d4` physical). (морозный — контроль без урона, опускаем.) Крит удваивает кубы. minGame 1.
- `flamethrower` (Огнемёт, из Весомого аргумента): `choiceGroup:'game12'`, id должен совпадать со значением выбора (`'flamethrower'`). area, каждая цель `2d6` fire (авто, линия). usesSave false.
- `unstableArgument` (Нестабильный аргумент): `choiceGroup:'game12'`, id `'unstableArgument'`. area, случайный эффект д4: 1 → `2d4` fire всем целям; 2–4 → урона нет (броня−/броня+/лечение — вне расчёта урона). Катаем д4 один раз, при 1 — урон.
- `GAME12_CHOICES.artificer = [{id:'flamethrower',name:'Весомый аргумент (огнемёт 2д6)'},{id:'unstableArgument',name:'Нестабильный аргумент'}]`.

> `argument` идёт через свой код (наконечник определяет кубы), не через multiWeaponAttack. Удваивай кубы на крите. Силовой болт/морозный/лечебные эффекты опускаем (пометь комментарием — вне урон-модели).

- [ ] **Step 1: Write failing test (`test/artificer.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id)=>ABILITIES.find(a=>a.id===id);
const actx = (over)=>{ const stats=over.stats??{str:-1,dex:2,con:0,wis:0,int:4,cha:-1};
  return { rng:over.rng, stats, attackBonus:(s)=>stats[s], critRange:20, weapon:{dice:'2d8',stat:'dex'},
    targets:over.targets??[{ac:10,hp:99}], mods:{orcReroll:false,adv:false,dis:false,...(over.mods||{})}, params:over.params||{} }; };

test('Аргумент усиленный: 2d8 при попадании', () => {
  // nat 0.5 (=11, +2>=10 hit); 2d8 (0.99,0.99)=16
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5,0.99,0.99]), params:{ammo:'усиленный',target:0} }));
  assert.deepEqual(p, [[{type:'physical',amount:16}]]);
});
test('Аргумент гарпун: 1d4', () => {
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5,0.99]), params:{ammo:'гарпун',target:0} }));
  assert.deepEqual(p, [[{type:'physical',amount:4}]]);
});
test('Огнемёт: 2d6 огнём по всем', () => {
  const p = get('flamethrower').simulateOnce(actx({ rng: seqRng([0.99,0.99]), targets:[{ac:10,hp:99}] }));
  assert.deepEqual(p, [[{type:'fire',amount:12}]]);
});
test('Нестабильный: д4=1 -> 2d4 огнём', () => {
  // д4 нота: rollDie(4) 0->1 (попадание в ветку 1). затем 2d4 (0.99,0.99)=8
  const p = get('unstableArgument').simulateOnce(actx({ rng: seqRng([0, 0.99,0.99]) }));
  assert.deepEqual(p, [[{type:'fire',amount:8}]]);
});
test('Нестабильный: д4=2 -> нет урона', () => {
  // rollDie(4): 0.5 -> 3 (ветка без урона)
  const p = get('unstableArgument').simulateOnce(actx({ rng: seqRng([0.5]) }));
  assert.deepEqual(p, [[]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/artificer.js`**

```js
import { attackRoll, isHit, resolveMode, rollNotation, rollDie, sumDice } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }
function dmgDice(notation, ctx, crit) {
  const one = () => rollNotation(notation, ctx.rng, ctx.mods.orcReroll);
  return crit ? one() + one() : one();
}

const AMMO = { 'усиленный': '2d8', 'гарпун': '1d4' };

export const ARTIFICER_ABILITIES = [
  {
    id: 'argument', name: 'Арбалет «Аргумент»', classKey: 'artificer',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [
      { id: 'ammo', kind: 'select', label: 'Наконечник', default: 'усиленный',
        options: [{ value: 'усиленный', label: 'Усиленный (2д8)' }, { value: 'гарпун', label: 'Гарпун (1д4)' }] },
      { id: 'target', kind: 'targetPick', label: 'Цель', default: 0 },
    ],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const die = AMMO[ctx.params.ammo] || AMMO['усиленный'];
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bonus = ctx.attackBonus('dex');
      const nat = attackRoll(ctx.rng, mode);
      const { hit, crit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange);
      if (hit) out[i].push({ type: 'physical', amount: dmgDice(die, ctx, crit) }); // болт без стата к урону
      return out;
    },
  },
  {
    id: 'flamethrower', name: 'Огнемёт (Весомый аргумент)', classKey: 'artificer',
    minGame: 12, choiceGroup: 'game12', charges: 'пассивно', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount: sumDice(2, 6, ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
  {
    id: 'unstableArgument', name: 'Нестабильный аргумент', classKey: 'artificer',
    minGame: 12, choiceGroup: 'game12', charges: 'пассивно', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const roll = rollDie(4, ctx.rng, false); // 1 — пламенный привет (2д4 огнём); 2–4 — без урона
      if (roll === 1) {
        for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount: sumDice(2, 4, ctx.rng, ctx.mods.orcReroll) });
      }
      return out;
    },
  },
];
```

- [ ] **Step 4: index.js + GAME12_CHOICES.artificer.**
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: artificer abilities (argument, flamethrower, unstable)`

---

## Task 5: Жрец (`cleric.js`) + Священное оружие

**Files:** Create `src/abilities/cleric.js`, `test/cleric.test.js`; Modify index.js, `GAME12_CHOICES.cleric`. (Священное оружие как модификатор уже учтено в shared.js Task 2 — здесь только проверка релевантности в Task 9.)

**Interfaces:** `CLERIC_ABILITIES = [divineLight]`.
- `divineLight` (Божественный свет): `choiceGroup:'game12'`, id `'divineLight'`. area, каждая цель `rollNotation('1d4')+con` урона типа `radiant` (свет ранит врагов). usesAttackRoll false.
- `GAME12_CHOICES.cleric = [{id:'divineLight',name:'Божественный свет (1д4+Ст, излуч.)'},{id:'strongFaith',name:'Укрепление веры'}]`.
- Священное оружие — модификатор `mods.sacredWeapon` (число = Стойкость, выставляется UI для жреца), уже обрабатывается в `multiWeaponAttack` (Task 2).

- [ ] **Step 1: Write failing test (`test/cleric.test.js`)**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const cctx=(over)=>{ const stats=over.stats??{str:-1,dex:-1,con:4,wis:0,int:1,cha:1};
  return { rng:over.rng, stats, attackBonus:(s)=>stats[s], critRange:20, weapon:{dice:'1d6',stat:'dex'},
    targets:over.targets??[{ac:10,hp:99},{ac:10,hp:99}], mods:{orcReroll:false}, params:{} }; };
test('Божественный свет: 1d4+Стойкость излучением по всем', () => {
  // 2 цели: d4 0.99->4 +4(con) =8 каждой
  const p = ABILITIES.find(a=>a.id==='divineLight').simulateOnce(cctx({ rng: seqRng([0.99,0.99]) }));
  assert.deepEqual(p, [[{type:'radiant',amount:8}],[{type:'radiant',amount:8}]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/cleric.js`**
```js
import { rollNotation } from '../engine.js';
function empty(n){ return Array.from({length:n},()=>[]); }
export const CLERIC_ABILITIES = [
  {
    id: 'divineLight', name: 'Божественный свет', classKey: 'cleric',
    minGame: 12, choiceGroup: 'game12', charges: '2 раза в день', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const con = ctx.attackBonus('con');
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'radiant', amount: rollNotation('1d4', ctx.rng, ctx.mods.orcReroll) + con });
      return out;
    },
  },
];
```

- [ ] **Step 4: index.js + GAME12_CHOICES.cleric.**
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: cleric divine light; sacred weapon modifier`

---

## Task 6: Некромант (`necromancer.js`)

**Files:** Create `src/abilities/necromancer.js`, `test/necromancer.test.js`; Modify index.js, `GAME12_CHOICES.necromancer`.

**Interfaces:** `NECRO_ABILITIES = [pathToOblivion, funeralBell, harvest]`.
- `pathToOblivion` (Путь в небытие): `minGame:1, targeting:'area', usesAttackRoll:false`. Каждая цель (линия) получает `rollNotation('1d8')+Интеллект` урона типа `necrotic` (авто).
- `funeralBell` (Погребальный звон): `minGame:1, targeting:'single', usesAttackRoll:false`, params:[targetPick]. Катаем `d20`: 1–4 → `1d6`; 5–9 → `2d6`; 10–14 → `3d6`; 15–19 → `4d6`; 20 → `5d6`; тип `necrotic`, по выбранной цели.
- `harvest` (Жатва): `choiceGroup:'game12', id 'harvest', minGame:12, targeting:'area', usesSave:true`. Каждая цель: спас «стойкость — 15» (`nat=attackRoll; провал если nat!==20 && (nat===1 || nat+(target.conSave??target.dexSave??0) < 15)`) → при провале `1d10` necrotic. (Финальную «дальнобойную атаку накопленной энергией» опускаем — пометь комментарием; используем спас-урон как основной.)
- `GAME12_CHOICES.necromancer = [{id:'harvest',name:'Жатва'},{id:'soulMaster',name:'Мастер душ'}]`.

> Целям может не быть поля `conSave`; используем `target.dexSave ?? 0` как доступный прокси спасброска (в UI пресет даёт только Ловкость). Пометь это комментарием.

- [ ] **Step 1: Write failing test (`test/necromancer.test.js`)**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get=(id)=>ABILITIES.find(a=>a.id===id);
const nctx=(over)=>{ const stats=over.stats??{str:-1,dex:1,con:2,wis:1,int:3,cha:-2};
  return { rng:over.rng, stats, attackBonus:(s)=>stats[s], critRange:20, weapon:{dice:'1d4',stat:'dex'},
    targets:over.targets??[{ac:10,hp:99}], mods:{orcReroll:false,hex:false}, params:over.params||{} }; };
test('Путь в небытие: 1d8+Интеллект некротик по всем', () => {
  const p = get('pathToOblivion').simulateOnce(nctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[{type:'necrotic',amount:11}]]); // d8 0.99->8 +3(int)
});
test('Погребальный звон: d20=20 -> 5d6', () => {
  // d20 nat: attackRoll none -> floor(0.99*20)+1=20 -> 5d6 (все 0.99 ->6) =30
  const p = get('funeralBell').simulateOnce(nctx({ rng: seqRng([0.99, 0.99,0.99,0.99,0.99,0.99]) }));
  assert.deepEqual(p, [[{type:'necrotic',amount:30}]]);
});
test('Погребальный звон: d20 в 1-4 -> 1d6', () => {
  // nat = floor(0.0*20)+1=1 -> 1d6 (0.99->6)
  const p = get('funeralBell').simulateOnce(nctx({ rng: seqRng([0, 0.99]) }));
  assert.deepEqual(p, [[{type:'necrotic',amount:6}]]);
});
test('Жатва: провал спасброска -> 1d10', () => {
  // спас nat=1 (0) провал; 1d10 0.99->10
  const p = get('harvest').simulateOnce(nctx({ rng: seqRng([0, 0.99]), targets:[{ac:10,hp:99,dexSave:0}] }));
  assert.deepEqual(p, [[{type:'necrotic',amount:10}]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/necromancer.js`**
```js
import { attackRoll, isHit, resolveMode, rollNotation, d20, sumDice } from '../engine.js';
function empty(n){ return Array.from({length:n},()=>[]); }

function bellDice(nat) {
  if (nat <= 4) return '1d6';
  if (nat <= 9) return '2d6';
  if (nat <= 14) return '3d6';
  if (nat <= 19) return '4d6';
  return '5d6';
}

export const NECRO_ABILITIES = [
  {
    id: 'pathToOblivion', name: 'Путь в небытие', classKey: 'necromancer',
    minGame: 1, choiceGroup: null, charges: 'раз в день = Стойкость', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const int = ctx.attackBonus('int');
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'necrotic', amount: rollNotation('1d8', ctx.rng, ctx.mods.orcReroll) + int });
      return out;
    },
  },
  {
    id: 'funeralBell', name: 'Погребальный звон', classKey: 'necromancer',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const nat = d20(ctx.rng);
      out[i].push({ type: 'necrotic', amount: rollNotation(bellDice(nat), ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
  {
    id: 'harvest', name: 'Жатва', classKey: 'necromancer',
    minGame: 12, choiceGroup: 'game12', charges: 'раз в день = Стойкость', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'magic', params: [],
    simulateOnce(ctx) {
      // Цели проходят спас «стойкость — 15»; при провале теряют 1d10. Финальный
      // дальнобойный «выброс энергии» опускаем (вне урон-модели v1).
      // Спасбросок цели берём как dexSave (другого поля у целей нет).
      const out = empty(ctx.targets.length);
      const mode = ctx.mods.hex ? 'dis' : 'none';
      for (let i = 0; i < ctx.targets.length; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat === 20 || (nat !== 1 && nat + (ctx.targets[i].dexSave ?? 0) >= 15);
        if (!saved) out[i].push({ type: 'necrotic', amount: rollNotation('1d10', ctx.rng, ctx.mods.orcReroll) });
      }
      return out;
    },
  },
];
```

> Убедись, что `d20` экспортируется из `engine.js` (он там есть). Если нет — используй `attackRoll(ctx.rng,'none')`.

- [ ] **Step 4: index.js + GAME12_CHOICES.necromancer.**
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: necromancer abilities (path, funeral bell, harvest)`

---

## Task 7: Волшебник 12-й игры (`unknownAttack`)

**Files:** Modify `src/abilities/wizard.js`, `test/abilities.test.js`. (GAME12_CHOICES.wizard уже есть из Плана 3: unknownAttack/counterspell.)

**Interfaces:** Добавить в `WIZARD_ABILITIES`:
- `unknownAttack` (Неизвестная атака): `classKey:'wizard', minGame:12, choiceGroup:'game12', id 'unknownAttack', targeting:'single', usesAttackRoll:false, usesSave:false, category:'magic', params:[targetPick]`. Выбранная цель получает ровно `15` урона типа `psychic` (без броска).

- [ ] **Step 1: Write failing test (`test/abilities.test.js` add)**
```js
test('unknownAttack: ровно 15 психического по цели', () => {
  const p = get('unknownAttack').simulateOnce(ctx({ rng: seqRng([]), targets:[{ac:99,hp:99}], params:{target:0} }));
  assert.deepEqual(p, [[{ type: 'psychic', amount: 15 }]]);
});
```
(если хелпер `ctx` в abilities.test.js не задаёт `params`, он уже задаёт `params: over.params||{}`.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add `unknownAttack` to `WIZARD_ABILITIES`** (в конец массива):
```js
  {
    id: 'unknownAttack', name: 'Неизвестная атака', classKey: 'wizard',
    minGame: 12, choiceGroup: 'game12', charges: '2 раза в день', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = Array.from({ length: ctx.targets.length }, () => []);
      out[ctx.params.target ?? 0].push({ type: 'psychic', amount: 15 });
      return out;
    },
  },
```

- [ ] **Step 4: Run** focused + full → green.
- [ ] **Step 5: Commit** `feat: wizard game-12 unknown attack`

---

## Task 8: UI-проводка (артефакты, новые модификаторы, выборы 12-й)

**Files:** Modify `src/ui.js`, `src/ui-logic.js` (modifierRelevance + artifacts helpers), `test/ui-logic.test.js`.

**Interfaces:**
- `modifierRelevance(ability, character)` — добавить флаги:
  - `sacredWeapon`: `cls==='cleric'` (значение в baseCtx = Стойкость, если тумблер вкл).
  - `inspiration`: `cls==='bard' && c.game>=4` (Улучшенное воодушевление [4] позволяет +д6 к урону).
  - `tincture`: `cls==='bard'` (настойка «смелость» ×2).
  - `runeOfWarrior`, `runeOfElements`: `(c.artifacts||[]).includes(...)` (артефакт выбран).
  - `beastRage`: `cls==='druid' && c.game>=12 && c.game12Choice==='beastRage'` (для UI-флага формы; влияет на beastForm через mods.beastRage).
- Артефакты: список доступных = `ARTIFACTS = [{id:'runeOfWarrior',name:'Руна воителя (+1 атака/урон оружия)'},{id:'braceletsOfLuck',name:'Наручи удачи (крит 19)'},{id:'runeOfElements',name:'Руна стихий (+1д6, смена типа)'}]` (экспортируй из ui-logic). `character.artifacts` — массив id (мультивыбор).
- `runeType` — select типа для Руны стихий (`physical/magic/fire/radiant`), хранится в `state.mods.runeType`.

- [ ] **Step 1: Write failing ui-logic tests**
```js
test('modifierRelevance: sacredWeapon у жреца, tincture у барда', () => {
  const cabil = availableAbilities({classKey:'cleric',raceKey:'human',game:1,game12Choice:null})[0];
  assert.equal(modifierRelevance(cabil,{classKey:'cleric',game:1}).sacredWeapon, true);
  const babil = availableAbilities({classKey:'bard',raceKey:'human',game:4,game12Choice:null})[0];
  assert.equal(modifierRelevance(babil,{classKey:'bard',game:4}).tincture, true);
  assert.equal(modifierRelevance(babil,{classKey:'bard',game:4}).inspiration, true);
});
test('ARTIFACTS экспортируется (3 пассивных)', () => {
  assert.equal(ARTIFACTS.length, 3);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: ui-logic.js** — добавь `ARTIFACTS`, расширь `modifierRelevance` новыми флагами (по таблице выше; сохрани все прежние). Импорт `ARTIFACTS` в тест.

- [ ] **Step 4: ui.js wiring**
1. `defaultState().character.artifacts = []`; `defaultState().mods` += `sacredWeapon:false, inspiration:false, tincture:false, runeOfWarrior:false, runeOfElements:false, runeType:'fire', beastRage:false` (некоторые — производные от артефактов/выбора, но держим тумблеры состояния где нужно).
2. `renderBuilder`: добавь блок **«Артефакты»** — чекбоксы по `ARTIFACTS`, пишут в `state.character.artifacts` (массив). При изменении — `onCharacterChange()` (влияет на critRange и релевантность).
3. `baseCtx().mods` — гейтить по `rel = modifierRelevance(currentAbility(), character)` (как в Плане 3) и добавить:
   - `sacredWeapon: (rel.sacredWeapon && state.mods.sacredWeapon) ? effectiveStats().con : 0`
   - `inspiration: !!(rel.inspiration && state.mods.inspiration)`
   - `tincture: !!(rel.tincture && state.mods.tincture)`
   - `runeOfWarrior: (character.artifacts||[]).includes('runeOfWarrior')`
   - `runeOfElements: (character.artifacts||[]).includes('runeOfElements')`
   - `runeType: state.mods.runeType || 'fire'`
   - `beastRage: !!(character.classKey==='druid' && character.game>=12 && character.game12Choice==='beastRage')`
   `weapon`/`critRange` уже считаются `weaponForCharacter`/`critRangeForCharacter` (последний теперь учитывает Наручи удачи через artifacts — убедись, что `critRangeForCharacter` получает character с `artifacts`).
4. `renderMods`: показать новые тумблеры, где `rel[k]`: «Священное оружие (+Ст)», «Воодушевление (+д6)», «Настойка: смелость (×2)», «Руна стихий: +1д6». Для Руны стихий — рядом select типа (`runeType`) когда артефакт выбран. (Руна воителя/Наручи удачи — не тумблеры модификаторов, а артефакты в конструкторе.)
5. Все вызовы `modifierRelevance` — двухаргументные (уже так из Плана 3).

- [ ] **Step 5: Build + verify**
Run: `node build.js` → clean. Zero-URL + symbols: `node -e "const s=require('fs').readFileSync('dnd-dmg.html','utf8'); for(const f of ['RACIAL_ABILITIES','DRUID_ABILITIES','NECRO_ABILITIES','ARTIFACTS','runeOfElements']) if(!new RegExp(f).test(s)) throw new Error('missing '+f); const u=(s.match(/https?:\/\/[^\s\"')]+/g)||[]); if(u.length) throw new Error('ext urls'); console.log('ok',s.length)"`.
Run: `node --test` → all green.

- [ ] **Step 6: Commit** `feat: UI for artifacts, caster modifiers, caster game-12 choices`

---

## Task 9: Браузерная проверка (Playwright)

- [ ] **Step 1:** Открыть `file:///Users/ki.romanov/dnd/dnd-dmg.html`, очистить localStorage, окно 390×800.

- [ ] **Step 2: Проверки (PASS/FAIL с доказательством)**
1. **Друид**: «Облик зверя» с select формы (Медведь=2 атаки / Змея=1) меняет урон; «Тернистый путь» area; на игре 12 выбор «Ярость зверя» повышает урон формы.
2. **Изобретатель**: «Аргумент» с выбором наконечника (усиленный/гарпун) меняет урон; на 12 выбор «Огнемёт» даёт area-способность; «Нестабильный» — есть и считается.
3. **Жрец**: тумблер «Священное оружие (+Ст)» повышает урон базовой атаки; на 12 «Божественный свет» area доступен.
4. **Бард**: тумблеры «Воодушевление (+д6)» (игра ≥4) и «Настойка: смелость (×2)» повышают урон базовой атаки.
5. **Некромант**: «Путь в небытие», «Погребальный звон» (разброс по д20), «Жатва» (12) считаются.
6. **Раса**: у драконорождённого появляется «Огненное дыхание», у дварфа «Тяжёлая голова», у тифлинга «Адское возмездие» — независимо от класса; у других рас их нет.
7. **Артефакты**: в конструкторе мультивыбор; «Руна воителя» повышает урон оружия; «Наручи удачи» → крит 19 (повышает урон); «Руна стихий» + выбор типа меняет тип урона (заметно на дварфе/орке) и добавляет 1д6.
8. Сохранение/сброс/закрепление работают; смена класса/расы сбрасывает недоступную способность и гасит чужие модификаторы (проверка протечки, как в Плане 3). Консоль без ошибок.

- [ ] **Step 3:** Отчёт PASS/FAIL по каждому, консоль, скриншоты десктоп/мобайл. FAIL — точно перечислить.
- [ ] **Step 4: Commit** только при багфиксах.

---

## Self-Review

**Spec coverage:** Друид (Облик зверя, Тернистый путь, Ярость зверя) → Task 3. Изобретатель (Аргумент, Весомый→Огнемёт, Нестабильный) → Task 4. Жрец (Священное оружие, Божественный свет) → Tasks 2,5. Бард (Воодушевление +д6, Настойка ×2) → Tasks 2,8. Некромант (Путь, Звон, Жатва) → Task 6. Волшебник [12] (Неизвестная атака) → Task 7. Расовые (дыхание/голова/возмездие) → Task 1. Артефакты (Руна воителя/Наручи удачи/Руна стихий) → Task 2,8. Талант — НЕ моделируется (решение заказчика). ✔
Пропущено осознанно (вне урон-модели, помечено): морозный болт/силовой болт/лечебные эффекты изобретателя, змеиный DoT (только немедленный удар), финальный выброс Жатвы, лечение/контроль/призывы всех классов.

**Placeholder scan:** Tasks 1,3,4,5,6,7 — полный код+тесты. Task 2 — полный код инфраструктуры. Task 8 — UI с полным кодом ui-logic и точными инструкциями ui.js (паттерны Планов 2–3).

**Type consistency:** новые `mods` (runeOfWarrior, sacredWeapon, inspiration, tincture, runeOfElements, runeType, beastRage) объявлены в потребителях (shared.js Task 2, modifiers.js Task 2, druid Task 3) и проставляются гейтированно в baseCtx (Task 8). `raceKey` на способностях (Task 1) потребляется `availableAbilities`. `GAME12_CHOICES` пополняется для druid/artificer/cleric/necromancer (Tasks 3–6) и используется UI-селектором (есть из Плана 3). `critRangeForCharacter` принимает `artifacts` (Task 2), вызывается в baseCtx (Task 8).

## Execution Handoff

После сохранения — subagent-driven исполнение (как Планы 1–3).
