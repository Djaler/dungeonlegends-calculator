# Калькулятор урона — воинские классы (План 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить урон-способности и боевые модификаторы шести воинских классов (Воин, Варвар, Плут, Паладин, Следопыт, Монах), централизовав механику атаки оружием в общем хелпере и подключив новые тумблеры/степперы в UI.

**Architecture:** Вся механика атаки оружием (множественные атаки, преимущество/помеха, орочий переброс, ярость варвара ×2 Силы, гарантированное попадание, игнор брони, смена типа урона, божественная кара, доп. атака, скрытная атака) централизуется в `src/abilities/shared.js#multiWeaponAttack`. Каждый класс — тонкий файл `src/abilities/<class>.js`, описывающий доступные способности (минимально: план целей для атак или площадной спасбросок) и метаданные. Сквозные модификаторы живут в `ctx.mods`; пайплайн (`applyPipeline`) обрабатывает зелья и расовые правила цели как и раньше.

**Tech Stack:** Чистый ES-модульный JavaScript, без зависимостей. Тесты — `node --test`. Сборка — `node build.js`. Браузерная проверка — Playwright MCP.

## Global Constraints

- Никаких внешних зависимостей/CDN/сети — всё инлайн в `dnd-dmg.html`; 0 внешних URL.
- `ctx` через `postMessage` — только данные (без функций); хелпер `attackBonus` навешивается в воркере (`runAbility`).
- Статы: `str,dex,con,wis,int,cha`. Категории урона: physical / magic (см. `types.js`).
- Способность возвращает на цель массив пакетов `{type,amount}`; `[]` = ноль.
- Сохранить зелёными существующие тесты; адаптировать только то, что меняет контракт.
- Комментарии и UI-текст — на русском, в стиле кода. Дизайн-язык не менять.
- Коммиты — conventional commits; ветка `feat/dmg-calculator`.

## Зафиксированные решения по моделированию (утверждены)

1. **Ярость варвара** — тумблер `mods.barbRage`: удваивает бонус Силы (= `weaponStat` варвара) и в броске атаки, и в уроне. Отдельно от зелья ярости (`mods.rage` = ×2 физ в пайплайне, уже есть).
2. **Гарантированное попадание** — тумблер `mods.guaranteedHit`: ПЕРВАЯ атака оружием за расчёт попадает без броска (обычное попадание). Покрывает Чутьё охотника, Эльфийскую безупречность, Фартовый.
3. **Доп. атака** — тумблер `mods.bonusAttack`: +1 атака оружием к атакующей способности. Покрывает Воинское мастерство, Доп. атаку паладина [12], Засаду следопыта [4].
4. **Божественная кара** — степпер `mods.smiteDice` (0..пул): пул 4, либо 6 при выборе [12] «Улучшенная кара». `N`д10 излучения добавляются ОДИН раз к первому попаданию оружием за расчёт.
5. **Слабое место [12]** (воин) — `critRange = 18` (через выбор 12-й, прокидывается в `ctx.critRange`).
6. **Скрытная атака** (плут) — `mods.sneak`: урон вместо `dex` берёт `2×dex` (т.е. +`dex` сверх обычного) и атака с преимуществом; `mods.sneakDouble`: дополнительно ×2 к этому удару (потеря скрытности).
7. **Мастер большого оружия [12]** (варвар) — `mods.gwm`: −5 к попаданию, +10 к урону оружия.
8. **Охотник на великанов [12]** (следопыт) — `mods.acIgnore` = Мудрость (эффективная броня цели = `max(10, ac − acIgnore)`).
9. **Бесконтактный бой [4]** (монах) — `mods.typeOverride='magic'`: тип урона атак оружием → magic.
10. **Усиление Ци [12]** (монах) — куб безоружного 1д4→1д6 (через выбор 12-й: UI ставит `weapon.dice='1d6'`).
11. **Рикошет [12]** (следопыт) — `mods.ricochet`: один выстрел за расчёт дублирует свой урон по второй цели (следующей по списку).

`ctx` дополняется полем `classKey` (нужно UI-фильтрам и не мешает движку). `weapon.dice` для монаха зависит от выбора [12].

---

## File Structure

- `src/abilities/shared.js` — **Create**: `multiWeaponAttack(ctx, plan, opts)` + хелперы.
- `src/abilities/common.js` — **Modify**: `basicAttack` переходит на `multiWeaponAttack`.
- `src/abilities/warrior.js`, `barbarian.js`, `rogue.js`, `paladin.js`, `ranger.js`, `monk.js` — **Create**.
- `src/abilities/index.js` — **Modify**: подмешать все классовые массивы.
- `src/ui-logic.js` — **Modify**: `modifierRelevance` расширить новыми мод-флагами по классу/способности; учесть game12-выборы и `weapon.dice` монаха в выводе.
- `src/ui.js` — **Modify**: новые тумблеры/степперы модификаторов, селектор выбора 12-й игры, прокидывание `classKey`/`critRange`/`weapon.dice` в `baseCtx`.
- `test/shared.test.js`, `test/warrior.test.js`, ... `test/monk.test.js` — **Create**.
- `test/ui-logic.test.js` — **Modify**.

---

## Task 1: Общий хелпер атаки оружием (`shared.js`) + рефактор basicAttack

**Files:**
- Create: `src/abilities/shared.js`
- Modify: `src/abilities/common.js`
- Create: `test/shared.test.js`
- Modify: `test/abilities.test.js` (basicAttack по-прежнему зелёный)

**Interfaces:**
- Consumes: `rollNotation, attackRoll, isHit, resolveMode, sumDice` из `../engine.js`.
- Produces: `multiWeaponAttack(ctx, plan) → packets` (массив по целям из `{type,amount}`), где `plan` — массив индексов целей (по одной атаке оружием на элемент). Учитывает (всё из `ctx.mods`, безопасные дефолты):
  - `barbRage` (bool): множитель бонуса оружия = 2.
  - `gwm` (bool): −5 к попаданию, +10 к урону на каждую атаку.
  - `guaranteedHit` (bool): первая атака в `plan` попадает без броска (не крит).
  - `acIgnore` (число, дефолт 0): эффективная броня цели = `max(10, ac − acIgnore)`.
  - `typeOverride` ('magic'|undefined): тип урона атак (иначе 'physical').
  - `bonusAttack` (bool): добавляет +1 атаку по первой цели плана.
  - `sneak` (bool): к урону добавляется ещё один `weaponStat` (итого 2×) и атака с преимуществом; `sneakDouble` (bool): весь урон этого удара ×2 (применяется только к первому удару плана — «скрытная атака»).
  - `smiteDice` (число, дефолт 0): `Nд10` излучения добавляются ОДИН раз к первому попавшему удару (отдельным пакетом `{type:'radiant'}`).
  - `ricochet` (bool): первый удар, попавший по цели, дублирует свой суммарный пакет(ы) по «следующей» цели (`(idx+1) % n`, если есть другая).
  - орочий переброс берётся из `ctx.mods.orcReroll` в бросках урона.

- [ ] **Step 1: Write the failing test (`test/shared.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiWeaponAttack } from '../src/abilities/shared.js';
import { seqRng } from './helpers.js';

const ctx = (over) => {
  const stats = over.stats ?? { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: over.critRange ?? 20,
    weapon: over.weapon ?? { dice: '1d10', stat: 'str' },
    targets: over.targets ?? [{ ac: 10, hp: 30 }],
    mods: { orcReroll: false, adv: false, dis: false, barbRage: false, gwm: false,
      guaranteedHit: false, acIgnore: 0, typeOverride: undefined, bonusAttack: false,
      sneak: false, sneakDouble: false, smiteDice: 0, ricochet: false, ...(over.mods || {}) },
  };
};

test('одна атака: попадание = куб+стат physical', () => {
  // nat=floor(0.5*20)+1=11; 11+3>=10 hit; d10 0.99 ->10; +3 =13
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99]) }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('две атаки по одной цели складываются в два пакета', () => {
  // обе nat 11 (0.5), урон 0.99->10+3=13 каждая
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]) }), [0, 0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'physical', amount: 13 }]]);
});

test('barbRage удваивает бонус Силы в уроне (и помогает попасть)', () => {
  // bonus = 3*2 = 6. nat=floor(0.0*20)+1=1 -> промах? nat1 always miss. Возьмём nat=10 (0.45):
  // 10+6>=10 hit; d10 0.99->10 + 6 = 16
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.45, 0.99]), mods: { barbRage: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 16 }]]);
});

test('gwm: -5 к попаданию, +10 к урону', () => {
  // bonus 3, gwm -5 => эффект попадания 3-5=-2: nat=10 ->10-2=8 <10 промах. Возьмём nat=20-? используем 0.99 -> nat20 крит-попадание.
  // урон d10 0.99->10 +3 +10 = 23
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.99, 0.99]), mods: { gwm: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 23 }]]);
});

test('guaranteedHit: первая атака попадает без броска (куб урона — первый бросок)', () => {
  // guaranteedHit -> не кидаем d20 на первую атаку; первый бросок rng идёт в урон: 0.99->10 +3 =13
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.99]), mods: { guaranteedHit: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('acIgnore понижает эффективную броню, не ниже 10', () => {
  // цель ac 14, acIgnore 6 -> eff 10 (floor). nat=10 (0.45): 10+3>=10 hit
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.45, 0.99]), targets: [{ ac: 14, hp: 30 }], mods: { acIgnore: 6 } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('typeOverride делает урон magic', () => {
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99]), mods: { typeOverride: 'magic' } }), [0]);
  assert.deepEqual(p, [[{ type: 'magic', amount: 13 }]]);
});

test('bonusAttack добавляет ещё одну атаку по первой цели плана', () => {
  // план [0]; bonusAttack -> две атаки. обе nat 0.5, урон 0.99
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]), mods: { bonusAttack: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'physical', amount: 13 }]]);
});

test('smiteDice добавляет Nд10 излучения один раз к первому попаданию', () => {
  // атака: nat 0.5 hit, урон d10 0.99->10+3=13; затем smite 2d10 по 0.99 ->20 radiant
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.99, 0.99]), mods: { smiteDice: 2 } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'radiant', amount: 20 }]]);
});

test('sneak: +dex к урону и преимущество; sneakDouble удваивает удар', () => {
  // weapon dex-based: stat dex=4, dice 2d4. sneak -> бонус урона 2*dex=8; sneakDouble ->*2
  // adv: два d20 (0.5,0.5)->11 hit; урон 2d4 (0.99,0.99)=8 + 8(2dex) =16; *2 =32
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.5, 0.5, 0.99, 0.99]),
    stats: { str: 0, dex: 4, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '2d4', stat: 'dex' },
    mods: { sneak: true, sneakDouble: true },
  }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 32 }]]);
});

test('ricochet дублирует урон первого попадания по следующей цели', () => {
  // 2 цели; атака по 0: nat 0.5 hit, d10 0.99->13; ricochet -> та же 13 по цели 1
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.5, 0.99]),
    targets: [{ ac: 10, hp: 30 }, { ac: 10, hp: 30 }],
    mods: { ricochet: true },
  }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }], [{ type: 'physical', amount: 13 }]]);
});

test('промах не даёт пакета и не тратит смайт', () => {
  // nat=1 (0) промах; смайт не применяется (нет попадания)
  const p = multiWeaponAttack(ctx({ rng: seqRng([0]), mods: { smiteDice: 2 } }), [0]);
  assert.deepEqual(p, [[]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/shared.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Write `src/abilities/shared.js`**

```js
import { rollNotation, attackRoll, isHit, resolveMode, sumDice } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

// Универсальная атака оружием по плану целей (по одной атаке на элемент plan).
// Все сквозные боевые модификаторы централизованы здесь.
export function multiWeaponAttack(ctx, plan) {
  const n = ctx.targets.length;
  const out = empty(n);
  if (n === 0 || !plan || plan.length === 0) return out;
  const m = ctx.mods;
  const seq = m.bonusAttack ? [...plan, plan[0]] : plan;
  const mode = resolveMode(m.adv || m.sneak, m.dis); // скрытная атака даёт преимущество
  const rageF = m.barbRage ? 2 : 1;
  const statBonus = ctx.attackBonus(ctx.weapon.stat) * rageF;
  const hitBonus = statBonus - (m.gwm ? 5 : 0);
  const dmgFlat = (m.gwm ? 10 : 0);
  const type = m.typeOverride || 'physical';
  const acIgnore = m.acIgnore || 0;
  let firstHitDone = false;     // для смайта (один раз)
  let firstStrike = true;       // первый удар плана — для guaranteedHit/скрытной
  let ricochetSource = -1;      // индекс цели первого попадания (для рикошета)

  for (const idx of seq) {
    const ac = Math.max(10, ctx.targets[idx].ac - acIgnore);
    let hit, crit = false;
    if (firstStrike && m.guaranteedHit) {
      hit = true;
    } else {
      const nat = attackRoll(ctx.rng, mode);
      const r = isHit(nat, hitBonus, ac, ctx.critRange);
      hit = r.hit; crit = r.crit;
    }
    if (hit) {
      let amount = rollNotation(ctx.weapon.dice, ctx.rng, m.orcReroll) + statBonus + dmgFlat;
      // скрытная атака: +ещё один стат оружия (вместо ловкости — удвоенная); только на первом ударе
      if (m.sneak && firstStrike) {
        amount += ctx.attackBonus(ctx.weapon.stat);
        if (m.sneakDouble) amount *= 2;
      }
      out[idx].push({ type, amount });
      if (ricochetSource < 0) ricochetSource = idx;
      if (!firstHitDone && (m.smiteDice || 0) > 0) {
        out[idx].push({ type: 'radiant', amount: sumDice(m.smiteDice, 10, ctx.rng, m.orcReroll) });
        firstHitDone = true;
      }
    }
    firstStrike = false;
  }

  // Рикошет: продублировать суммарный урон первого попадания по следующей цели.
  if (m.ricochet && ricochetSource >= 0 && n >= 2) {
    const dst = (ricochetSource + 1) % n;
    for (const pkt of out[ricochetSource]) out[dst].push({ ...pkt });
  }
  return out;
}
```

> Замечание: `crit` сейчас не влияет на урон (`CRIT_DOUBLES_DICE=false`), переменная оставлена для ясности и совместимости с `isHit`. Если линтер ругается на неиспользуемую — можно не присваивать.

- [ ] **Step 4: Refactor `basicAttack` to use the helper (`src/abilities/common.js`)**

Замени тело `simulateOnce` у `basicAttack` на вызов хелпера (поведение для дефолтных модов идентично прежнему):

```js
import { multiWeaponAttack } from './shared.js';
// ...
    simulateOnce(ctx) {
      const i = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [i]);
    },
```

Удали из `common.js` ставшие лишними прямые импорты/функции (`rollNotation/attackRoll/isHit/resolveMode`, локальный `empty`), если они больше не используются.

- [ ] **Step 5: Run tests**

Run: `node --test test/shared.test.js test/abilities.test.js`
Expected: PASS (shared 12 кейсов; basicAttack кейсы из abilities.test.js остаются зелёными — поведение при дефолтных модах не изменилось). Затем полный `node --test`.

- [ ] **Step 6: Commit**

```bash
git add src/abilities/shared.js src/abilities/common.js test/shared.test.js
git commit -m "feat: shared weapon-attack helper with combat modifiers"
```

---

## Task 2: Воин (`warrior.js`)

**Files:** Create `src/abilities/warrior.js`, `test/warrior.test.js`; Modify `src/abilities/index.js`.

**Interfaces:** `WARRIOR_ABILITIES = [rainOfBlows]`. `rainOfBlows` (Град ударов): `classKey:'warrior', minGame:1, charges:'раз в бой = Стойкость', targeting:'area', usesAttackRoll:true, usesSave:false, category:'physical', params:[]`. Делает 4 атаки оружием по выбранной первичной цели через `multiWeaponAttack(ctx, [t,t,t,t])`, где `t = ctx.params.target ?? 0` (добавь param `target` targetPick default 0). Доп. модификатор «Слабое место [12]» не отдельная способность — это `choiceGroup:'game12'` способность-маркер `weakSpot` с нулевым уроном? НЕТ — крит-эффект прокидывается через `ctx.critRange` (UI ставит 18 при выборе). Поэтому в файле воина только `rainOfBlows`; выбор 12-й воина обрабатывается в UI (Task 8).

- [ ] **Step 1: Write failing test (`test/warrior.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: 3, dex: 1, con: 1, wis: 0, int: 0, cha: -1 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: { dice: '1d10', stat: 'str' }, targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false, smiteDice: 0, acIgnore: 0, ...(over.mods || {}) },
    params: over.params || {} };
};

test('Град ударов: 4 атаки оружием по цели', () => {
  // 4 атаки, каждая nat 0.5 (=11 hit), урон d10 0.99->10+3=13 -> 4 пакета по 13
  const p = get('rainOfBlows').simulateOnce(ctx({ rng: seqRng([0.5,0.99, 0.5,0.99, 0.5,0.99, 0.5,0.99]) }));
  assert.deepEqual(p, [[{type:'physical',amount:13},{type:'physical',amount:13},{type:'physical',amount:13},{type:'physical',amount:13}]]);
});

test('Град ударов присутствует с метаданными', () => {
  const a = get('rainOfBlows');
  assert.equal(a.classKey, 'warrior');
  assert.equal(a.category, 'physical');
});
```

- [ ] **Step 2: Run → fail** (`node --test test/warrior.test.js`): rainOfBlows не найдена.

- [ ] **Step 3: Write `src/abilities/warrior.js`**

```js
import { multiWeaponAttack } from './shared.js';

export const WARRIOR_ABILITIES = [
  {
    id: 'rainOfBlows', name: 'Град ударов', classKey: 'warrior',
    minGame: 1, choiceGroup: null, charges: 'раз в бой = Стойкость', targeting: 'area',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [t, t, t, t]);
    },
  },
];
```

- [ ] **Step 4: Update `src/abilities/index.js`** — импортировать `WARRIOR_ABILITIES` и добавить в общий массив (после COMMON, порядок классов между собой неважен).

- [ ] **Step 5: Run** `node --test test/warrior.test.js` → PASS; полный `node --test` → зелёный.

- [ ] **Step 6: Commit**

```bash
git add src/abilities/warrior.js test/warrior.test.js src/abilities/index.js
git commit -m "feat: warrior abilities (Rain of Blows)"
```

---

## Task 3: Варвар (`barbarian.js`)

**Files:** Create `src/abilities/barbarian.js`, `test/barbarian.test.js`; Modify index.js.

**Interfaces:** `BARBARIAN_ABILITIES = [deathDance]`. `deathDance` (Танец со смертью): area, каждая цель проходит спасбросок Ловкости против 12; при провале получает урон одной атаки оружием (куб+Сила, с учётом barbRage/gwm). `usesAttackRoll:false, usesSave:true, category:'physical', params:[]`. Спасбросок: `nat = attackRoll(rng, mods.hex?'dis':'none')`; провал, если `nat!==20 && (nat===1 || nat + (target.dexSave??0) < 12)`. При провале урон = `rollNotation(weapon.dice)+attackBonus(weaponStat)*(barbRage?2:1)+(gwm?10:0)`, тип physical. (Ярость варвара применяется к её урону, как к атаке.)

> Замечание: Танец не использует `multiWeaponAttack` (там бросок атаки, а тут спасбросок цели), поэтому считает урон напрямую тем же правилом бонуса. Импортируй `rollNotation, attackRoll` из `../engine.js`.

- [ ] **Step 1: Write failing test (`test/barbarian.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: 4, dex: 1, con: 2, wis: -1, int: -2, cha: 0 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: { dice: '1d12', stat: 'str' }, targets: over.targets ?? [{ ac: 10, hp: 99, dexSave: 0 }],
    mods: { orcReroll: false, barbRage: false, gwm: false, hex: false, ...(over.mods || {}) },
    params: over.params || {} };
};

test('Танец: провал спасброска = урон атаки (куб+Сила)', () => {
  // спас nat = floor(0*20)+1 =1 -> провал; урон d12 0.99->12 +4 =16
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 16 }]]);
});

test('Танец: успех спасброска = нет урона', () => {
  // спас nat=20 (0.99) -> успех -> пакет пуст
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[]]);
});

test('Танец: ярость варвара удваивает Силу в уроне', () => {
  // провал nat 0; урон d12 0.99->12 + 4*2 =20
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0, 0.99]), mods: { barbRage: true } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 20 }]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/barbarian.js`**

```js
import { rollNotation, attackRoll } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const BARBARIAN_ABILITIES = [
  {
    id: 'deathDance', name: 'Танец со смертью', classKey: 'barbarian',
    minGame: 4, choiceGroup: null, charges: 'действие', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'physical',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const mode = ctx.mods.hex ? 'dis' : 'none';
      const bonus = ctx.attackBonus(ctx.weapon.stat) * (ctx.mods.barbRage ? 2 : 1) + (ctx.mods.gwm ? 10 : 0);
      for (let i = 0; i < ctx.targets.length; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat === 20 || (nat !== 1 && nat + (ctx.targets[i].dexSave ?? 0) >= 12);
        if (!saved) {
          out[i].push({ type: 'physical', amount: rollNotation(ctx.weapon.dice, ctx.rng, ctx.mods.orcReroll) + bonus });
        }
      }
      return out;
    },
  },
];
```

> `minGame:4` — Танец со смертью открывается на 4 игре (из правил). Базовый урон варвара покрывает «Базовая атака оружием» (общая) с тумблером ярости.

- [ ] **Step 4: index.js** — добавить `BARBARIAN_ABILITIES`.
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: barbarian abilities (Death Dance) and rage via shared helper`

---

## Task 4: Плут (`rogue.js`)

**Files:** Create `src/abilities/rogue.js`, `test/rogue.test.js`; Modify index.js.

**Interfaces:** У плута нет отдельной урон-способности кроме базовой атаки (оружие 2д4) — урон формируют модификаторы `sneak`/`sneakDouble` (через хелпер) и `guaranteedHit` (Фартовый). Чтобы у плута был осмысленный пункт списка помимо общей базовой атаки, добавим `ROGUE_ABILITIES = [sneakStrike]` — синоним базовой атаки с включённой подсказкой скрытной атаки (но саму скрытность задаёт тумблер). Проще и честнее: `ROGUE_ABILITIES = []`, а плут пользуется общей «Базовой атакой оружием» + тумблерами. **Выбираем пустой массив**; задача сводится к тесту, что у плута доступна базовая атака и релевантны нужные модификаторы (проверяется в ui-logic.test.js, Task 8). Поэтому этот таск — только маркер актуальности скрытной атаки на базовой атаке.

Поскольку отдельного файла со способностями нет, **Task 4 сворачивается в Task 8** (релевантность модификаторов плута) и здесь отдельного кода нет.

- [ ] **Step 1:** Подтвердить намерение: плут не получает новых способностей-объектов; его урон — базовая атака + `sneak`/`sneakDouble`/`guaranteedHit`. Никаких файлов/тестов в этом таске. (Этот пункт — явная пометка, что пропуск намеренный; покрытие — в Task 1 shared-тестах sneak и в Task 8 релевантности.)

> Если при ревью сочтём нужным дать плуту явный пункт списка — добавим `sneakStrike` (алиас базовой атаки с авто-включённым sneak) отдельной правкой. Пока YAGNI.

(Task 4 не порождает коммита.)

---

## Task 5: Паладин (`paladin.js`)

**Files:** Create `src/abilities/paladin.js`, `test/paladin.test.js`; Modify index.js.

**Interfaces:** У паладина урон — базовая атака + `smiteDice` (через хелпер) + `bonusAttack` (Доп. атака [12]). Отдельных урон-способностей-объектов нет; выборы 12-й («Доп. атака» / «Улучшенная кара») — маркеры для UI (Task 8): «Доп. атака» включает доступность тумблера `bonusAttack`; «Улучшенная кара» поднимает максимум степпера смайта до 6. Поэтому `PALADIN_ABILITIES = []` и отдельного боевого кода нет — всё в shared + UI.

- [ ] **Step 1:** Пометить намеренный пропуск: паладин использует общую базовую атаку + смайт-степпер + доп.атаку. Покрытие смайта — в Task 1 (`smiteDice` тест). Выборы 12-й и пул смайта — в Task 8.

(Task 5 не порождает коммита; объекты способностей не нужны.)

> Примечание для Task 8: max пула смайта = `paladin && game12Choice==='improvedSmite' ? 6 : 4`.

---

## Task 6: Следопыт (`ranger.js`)

**Files:** Create `src/abilities/ranger.js`, `test/ranger.test.js`; Modify index.js.

**Interfaces:** `RANGER_ABILITIES = [doubleShot]`. `doubleShot` (Быстрая рука): 2 дальнобойные атаки по выбранной цели через `multiWeaponAttack(ctx, [t, t])`. `classKey:'ranger', minGame:1, charges:'действие', targeting:'single', usesAttackRoll:true, usesSave:false, category:'physical', params:[target targetPick]`. Модификаторы следопыта (`guaranteedHit` Чутьё, `bonusAttack` Засада [4], `acIgnore` Охотник [12], `ricochet` Рикошет [12]) работают через хелпер и включаются в UI (Task 8).

- [ ] **Step 1: Write failing test (`test/ranger.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: -1, dex: 3, con: 1, wis: 3, int: -1, cha: -1 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: { dice: '1d8', stat: 'dex' }, targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll:false, adv:false, dis:false, acIgnore:0, ricochet:false, bonusAttack:false, guaranteedHit:false, smiteDice:0, ...(over.mods||{}) },
    params: over.params || {} };
};

test('Быстрая рука: 2 выстрела по цели (куб+Лов)', () => {
  // 2 атаки nat 0.5 (=11 hit, 11+3>=10), d8 0.99->8 +3 =11 каждая
  const p = get('doubleShot').simulateOnce(ctx({ rng: seqRng([0.5,0.99, 0.5,0.99]) }));
  assert.deepEqual(p, [[{type:'physical',amount:11},{type:'physical',amount:11}]]);
});

test('Рикошет дублирует первый попавший выстрел по второй цели', () => {
  // 2 цели; выстрел1 по 0: nat0.5 hit d8 0.99->11; выстрел2 по 0: nat 0 -> промах
  // ricochet: первый попавший (11 по цели0) дублируется по цели1
  const p = get('doubleShot').simulateOnce(ctx({ rng: seqRng([0.5,0.99, 0]), targets:[{ac:10,hp:99},{ac:10,hp:99}], mods:{ ricochet:true } }));
  assert.deepEqual(p, [[{type:'physical',amount:11}], [{type:'physical',amount:11}]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/ranger.js`**

```js
import { multiWeaponAttack } from './shared.js';

export const RANGER_ABILITIES = [
  {
    id: 'doubleShot', name: 'Быстрая рука (2 выстрела)', classKey: 'ranger',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [t, t]);
    },
  },
];
```

- [ ] **Step 4: index.js** — добавить `RANGER_ABILITIES`.
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: ranger abilities (Double Shot, ricochet/ac-ignore via shared)`

---

## Task 7: Монах (`monk.js`)

**Files:** Create `src/abilities/monk.js`, `test/monk.test.js`; Modify index.js.

**Interfaces:** `MONK_ABILITIES = [flurry]`. `flurry` (Шквал): число атак = `ctx.stats.con` (минимум 1) безоружными ударами через `multiWeaponAttack(ctx, plan)`, где `plan` = массив длины `max(1, con)` из индекса выбранной цели. `classKey:'monk', minGame:1, charges:'действие', targeting:'single', usesAttackRoll:true, usesSave:false, category:'physical', params:[target targetPick]`. Монах использует `ctx.weapon` = {dice: '1d4'|'1d6' (Усиление Ци [12]), stat:'dex'} (UI ставит куб). Бесконтактный бой [4] (`typeOverride='magic'`) — через хелпер/UI.

- [ ] **Step 1: Write failing test (`test/monk.test.js`)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: 0, dex: 3, con: 3, wis: 0, int: -1, cha: -1 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: over.weapon ?? { dice: '1d4', stat: 'dex' }, targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll:false, adv:false, dis:false, typeOverride:undefined, smiteDice:0, acIgnore:0, ...(over.mods||{}) },
    params: over.params || {} };
};

test('Шквал: число атак = Стойкость (3), куб 1д4 + Ловкость', () => {
  // con=3 -> 3 атаки; каждая nat 0.5(=11 hit,+3>=10), d4 0.99->4 +3 =7
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99, 0.5,0.99, 0.5,0.99]) }));
  assert.deepEqual(p, [[{type:'physical',amount:7},{type:'physical',amount:7},{type:'physical',amount:7}]]);
});

test('Шквал: Усиление Ци => куб 1д6', () => {
  // weapon dice 1d6; con=1 -> 1 атака; nat 0.5 hit, d6 0.99->6 +3 =9
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99]), stats:{str:0,dex:3,con:1,wis:0,int:-1,cha:-1}, weapon:{dice:'1d6',stat:'dex'} }));
  assert.deepEqual(p, [[{type:'physical',amount:9}]]);
});

test('Шквал: бесконтактный бой делает урон magic', () => {
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99]), stats:{str:0,dex:3,con:1,wis:0,int:-1,cha:-1}, mods:{ typeOverride:'magic' } }));
  assert.deepEqual(p, [[{type:'magic',amount:7}]]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write `src/abilities/monk.js`**

```js
import { multiWeaponAttack } from './shared.js';

export const MONK_ABILITIES = [
  {
    id: 'flurry', name: 'Шквал', classKey: 'monk',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      const count = Math.max(1, ctx.stats.con);
      return multiWeaponAttack(ctx, new Array(count).fill(t));
    },
  },
];
```

- [ ] **Step 4: index.js** — добавить `MONK_ABILITIES`.
- [ ] **Step 5: Run** focused + full → green.
- [ ] **Step 6: Commit** `feat: monk abilities (Flurry), Ki/contactless via weapon die + type override`

---

## Task 8: Модификаторы, выбор 12-й игры и UI

**Files:** Modify `src/ui-logic.js`, `test/ui-logic.test.js`, `src/ui.js`, possibly `template.html` (CSS for select/stepper already exist from Plan 2; reuse).

**Interfaces:**
- `modifierRelevance(ability, character)` — РАСШИРИТЬ сигнатуру вторым аргументом `character` и добавить новые флаги. Возвращает объект со всеми мод-ключами; релевантность по классу/способности:
  - `barbRage`: `character.classKey === 'barbarian'`.
  - `bonusAttack`: `(classKey==='warrior') || (classKey==='paladin' && game>=12 && game12Choice==='extraAttack') || (classKey==='ranger' && game>=4)`.
  - `smiteDice`: `classKey==='paladin'` (степпер; max=6 если `game12Choice==='improvedSmite'` и game>=12, иначе 4).
  - `guaranteedHit`: `classKey==='ranger' || (classKey==='rogue' && game>=12 && game12Choice==='lucky') || ability.usesAttackRoll` ? — НЕТ, ограничим: `ranger || rogue(lucky[12]) || elf-race`. Для простоты: `classKey==='ranger' || (classKey==='rogue')` (Фартовый как опция плута). Точное гейтирование — по классу, не по расе в v1.
  - `sneak`, `sneakDouble`: `classKey==='rogue'`.
  - `gwm`: `classKey==='barbarian' && game>=12 && game12Choice==='gwm'`.
  - `acIgnore`: `classKey==='ranger' && game>=12 && game12Choice==='giantHunter'` (значение = Мудрость).
  - `ricochet`: `classKey==='ranger' && game>=12 && game12Choice==='ricochet'`.
  - `typeOverride`: `classKey==='monk' && game>=4` (Бесконтактный бой).
  - Существующие: `adv/dis=usesAttackRoll`; `hex=usesSave`; `chaos=concentration=(category==='magic')`; `rage`(зелье ярости)=`category==='physical'`; `orcReroll=true`.
- `GAME12_CHOICES[classKey]` — список вариантов выбора 12-й игры для UI: `{ id, name }[]`. Например:
  - warrior: `[{id:'weakSpot',name:'Слабое место (крит 18–20)'}, {id:'masterFencer',name:'Мастер фехтования'}]` (masterFencer без урон-эффекта в v1).
  - barbarian: `[{id:'gwm',name:'Мастер большого оружия (−5/+10)'}, {id:'unbreakable',name:'Несокрушимый'}]`.
  - rogue: `[{id:'lucky',name:'Фартовый (промах→крит)'}, {id:'traumatic',name:'Травмоопасный'}]`.
  - paladin: `[{id:'extraAttack',name:'Дополнительная атака'}, {id:'improvedSmite',name:'Улучшенная кара (6д10)'}]`.
  - ranger: `[{id:'giantHunter',name:'Охотник на великанов (−КБ)'}, {id:'ricochet',name:'Рикошет (+цель)'}]`.
  - monk: `[{id:'kiBoost',name:'Усиление Ци (1д6)'}, {id:'balance',name:'Часть баланса'}]`.
  - wizard: `[{id:'unknownAttack',name:'Неизвестная атака'}, {id:'counterspell',name:'Контрзаклинание'}]` (для будущего; volшебник [12] — План 4, но селектор общий).
- `weaponForCharacter(character)` — НОВАЯ: возвращает `{dice, stat}` с учётом монаха `kiBoost` ([12] → '1d6'); иначе `CLASSES[classKey]` значения.
- `critRangeForCharacter(character)` — НОВАЯ: 18 если `classKey==='warrior' && game>=12 && game12Choice==='weakSpot'`, иначе 20.

- [ ] **Step 1: Write failing tests (`test/ui-logic.test.js` additions)**

```js
test('modifierRelevance: ярость варвара только у варвара; смайт только у паладина', () => {
  const ba = availableAbilities({classKey:'barbarian',game:1,game12Choice:null})[0];
  assert.equal(modifierRelevance(ba,{classKey:'barbarian',game:1}).barbRage, true);
  const wb = availableAbilities({classKey:'warrior',game:1,game12Choice:null})[0];
  assert.equal(modifierRelevance(wb,{classKey:'warrior',game:1}).barbRage, false);
  assert.equal(modifierRelevance(wb,{classKey:'warrior',game:1}).bonusAttack, true);
});

test('critRangeForCharacter: Слабое место даёт 18 на 12 игре', () => {
  assert.equal(critRangeForCharacter({classKey:'warrior',game:12,game12Choice:'weakSpot'}), 18);
  assert.equal(critRangeForCharacter({classKey:'warrior',game:12,game12Choice:'masterFencer'}), 20);
  assert.equal(critRangeForCharacter({classKey:'warrior',game:8,game12Choice:'weakSpot'}), 20);
});

test('weaponForCharacter: монах с Усилением Ци получает 1д6', () => {
  assert.equal(weaponForCharacter({classKey:'monk',game:12,game12Choice:'kiBoost'}).dice, '1d6');
  assert.equal(weaponForCharacter({classKey:'monk',game:1,game12Choice:null}).dice, '1d4');
});

test('GAME12_CHOICES: у паладина два варианта', () => {
  assert.equal(GAME12_CHOICES.paladin.length, 2);
});
```

(Импортируй новые экспорты в начале файла теста.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement ui-logic additions (`src/ui-logic.js`)**

Добавь импорт `CLASSES` (уже может быть). Реализуй `GAME12_CHOICES`, `weaponForCharacter`, `critRangeForCharacter`, и расширь `modifierRelevance(ability, character)` (второй аргумент опционален; при отсутствии character новые классовые флаги = false). Полная карта флагов — по таблице из Interfaces. Сохрани прежние флаги.

```js
export const GAME12_CHOICES = {
  warrior:   [{id:'weakSpot',name:'Слабое место (крит 18–20)'},{id:'masterFencer',name:'Мастер фехтования'}],
  barbarian: [{id:'gwm',name:'Мастер большого оружия (−5/+10)'},{id:'unbreakable',name:'Несокрушимый'}],
  rogue:     [{id:'lucky',name:'Фартовый (промах→крит)'},{id:'traumatic',name:'Травмоопасный'}],
  paladin:   [{id:'extraAttack',name:'Дополнительная атака'},{id:'improvedSmite',name:'Улучшенная кара (6д10)'}],
  ranger:    [{id:'giantHunter',name:'Охотник на великанов (−КБ)'},{id:'ricochet',name:'Рикошет (+цель)'}],
  monk:      [{id:'kiBoost',name:'Усиление Ци (1д6)'},{id:'balance',name:'Часть баланса'}],
  wizard:    [{id:'unknownAttack',name:'Неизвестная атака'},{id:'counterspell',name:'Контрзаклинание'}],
};

export function weaponForCharacter(c) {
  const w = { dice: CLASSES[c.classKey].dice, stat: CLASSES[c.classKey].weaponStat };
  if (c.classKey === 'monk' && c.game >= 12 && c.game12Choice === 'kiBoost') w.dice = '1d6';
  return w;
}

export function critRangeForCharacter(c) {
  if (c.classKey === 'warrior' && c.game >= 12 && c.game12Choice === 'weakSpot') return 18;
  return 20;
}

export function modifierRelevance(ability, character) {
  const c = character || {};
  const cls = c.classKey, g12 = c.game >= 12 && c.game12Choice;
  const magic = ability.category === 'magic';
  return {
    adv: !!ability.usesAttackRoll, dis: !!ability.usesAttackRoll,
    hex: !!ability.usesSave,
    chaos: magic, concentration: magic,
    rage: ability.category === 'physical',          // зелье ярости
    orcReroll: true,
    barbRage: cls === 'barbarian',
    bonusAttack: cls === 'warrior' || (cls === 'paladin' && g12 === 'extraAttack') || (cls === 'ranger' && c.game >= 4),
    smiteDice: cls === 'paladin',
    guaranteedHit: cls === 'ranger' || cls === 'rogue',
    sneak: cls === 'rogue', sneakDouble: cls === 'rogue',
    gwm: cls === 'barbarian' && g12 === 'gwm',
    acIgnore: cls === 'ranger' && g12 === 'giantHunter',
    ricochet: cls === 'ranger' && g12 === 'ricochet',
    typeOverride: cls === 'monk' && c.game >= 4,
  };
}
```

> `modifierRelevance` теперь принимает `character`; обнови существующие вызовы в ui.js (Step 5) и в прежних тестах (если они звали с одним аргументом — добавь второй или оставь — функция терпит отсутствие). Прежние ui-logic тесты, зовущие `modifierRelevance(fb)` без character, останутся валидны (новые флаги станут false), но проверь, что их ассерты на старые флаги не сломались.

- [ ] **Step 4: Run ui-logic tests** → PASS; полный `node --test`.

- [ ] **Step 5: Wire UI (`src/ui.js`)**

1. **baseCtx**: используй `weaponForCharacter(state.character)` для `weapon`, `critRangeForCharacter(state.character)` для `critRange`; добавь `classKey: state.character.classKey`; в `mods` добавь новые ключи из состояния (barbRage, gwm, guaranteedHit, bonusAttack, sneak, sneakDouble, ricochet; `acIgnore`: relevance.acIgnore ? effectiveStats().wis : 0; `smiteDice`: state.mods.smiteDice||0; `typeOverride`: relevance.typeOverride && state.mods.contactless ? 'magic' : undefined).
2. **defaultState().mods**: добавь новые булевы (по умолчанию false) и `smiteDice:0`, `contactless:false`.
3. **renderMods**: получай `rel = modifierRelevance(currentAbility(), state.character)`. Рисуй тумблеры для тех новых модов, где `rel[k]` истинно (приглушай нерелевантные так же, как сейчас). Лейблы: barbRage «Ярость (×2 Сила)», gwm «Мастер большого оружия (−5/+10)», guaranteedHit «Гарант. попадание (1 атака)», bonusAttack «+1 атака оружием», sneak «Скрытная атака (из скрытности)», sneakDouble «Скрытная: ×2 (потеря скрытности)», contactless «Бесконтактный бой (маг)», ricochet «Рикошет (+цель)», acIgnore-как-тумблер «Охотник на великанов (−КБ по Муд)». Смайт — степпер `smiteDice` 0..(paladin improvedSmite?6:4), как степпер концентрации.
   - Для acIgnore: тумблер хранит булево `state.mods.acIgniteOn`? Проще: храни `state.mods.giantHunter` (bool); в baseCtx `acIgnore = (rel.acIgnore && state.mods.giantHunter) ? effectiveStats().wis : 0`. Аналогично contactless→typeOverride.
4. **Выбор 12-й игры**: в конструкторе героя (renderBuilder) при `state.character.game>=12` показать `<select>` из `GAME12_CHOICES[classKey]` (плюс пустой вариант «—»); запись в `state.character.game12Choice`; при смене — `onCharacterChange()` (фильтр способностей/релевантности/оружия/крита меняется).
5. Обнови любые прежние вызовы `modifierRelevance(...)` на двухаргументную форму.

- [ ] **Step 6: Build + smoke + zero-URL + full tests**

Run: `node build.js` → clean.
Run: `node -e "const s=require('fs').readFileSync('dnd-dmg.html','utf8'); for(const f of ['multiWeaponAttack','GAME12_CHOICES','weaponForCharacter']) if(!new RegExp('function '+f+'\\\\b|'+f+'\\\\s*=').test(s)) throw new Error('missing '+f); const u=(s.match(/https?:\/\/[^\s\"')]+/g)||[]); if(u.length) throw new Error('ext urls'); console.log('ok',s.length)"`
Run: `node --test` → all green.

- [ ] **Step 7: Commit** `feat: martial modifiers, game-12 choices, UI wiring`

---

## Task 9: Браузерная проверка (Playwright)

**Files:** verification only; багфиксы — отдельными правками если нужны.

- [ ] **Step 1:** Открыть `file:///Users/ki.romanov/dnd/dnd-dmg.html` (очистить localStorage), окно 390×800.

- [ ] **Step 2: Проверки (PASS/FAIL с доказательством)**

1. **Воин**: класс «Воин» → способности включают «Град ударов» и «Базовая атака»; выбрать Град ударов → урон считается; тумблер «+1 атака оружием» доступен и увеличивает урон; на игре 12 в конструкторе появляется выбор 12-й, при «Слабое место» среднее растёт (крит 18–20).
2. **Варвар**: «Танец со смертью» доступен на игре ≥4; тумблер «Ярость (×2 Сила)» доступен и увеличивает урон базовой атаки; «Мастер большого оружия» доступен только при выборе [12] gwm.
3. **Плут**: базовая атака; тумблеры «Скрытная атака» и «Скрытная: ×2» доступны и увеличивают урон; «Гарант. попадание» доступно.
4. **Паладин**: степпер «кубов кары» доступен (0..4), повышает урон; при выборе [12] «Улучшенная кара» максимум становится 6; при [12] «Доп. атака» появляется тумблер «+1 атака».
5. **Следопыт**: «Быстрая рука» = 2 выстрела; «Засада» (+1 атака) доступна с игры ≥4; [12] «Охотник» (−КБ) и «Рикошет» доступны по выбору и меняют урон (рикошет добавляет урон 2-й цели).
6. **Монах**: «Шквал» число атак = Стойкость; [12] «Усиление Ци» повышает урон (1д6); [4] «Бесконтактный бой» переключает тип на маг (заметно на цели с маг-сопротивлением/уязвимостью).
7. Сохранение/сброс и закрепление по-прежнему работают; смена класса корректно сбрасывает недоступную способность.
8. `browser_console_messages` — нет ошибок.

- [ ] **Step 3:** Записать отчёт (PASS/FAIL каждого, консоль, по скриншоту десктоп/мобайл). Любой FAIL — точно перечислить.

- [ ] **Step 4: Commit** только если были багфиксы (`fix: <проблема>` + пересборка).

---

## Self-Review

**Spec coverage:** Воин (Град ударов, Воинское мастерство, Слабое место) → Tasks 2,8. Варвар (Танец, Ярость, Мастер большого оружия) → Tasks 3,8. Плут (Скрытная атака, Фартовый) → Tasks 1(sneak),4,8. Паладин (Кара, Доп.атака, Улучш.кара) → Tasks 1(smite),5,8. Следопыт (Быстрая рука, Чутьё, Засада, Охотник, Рикошет) → Tasks 6,8. Монах (Шквал, Бесконтактный, Усиление Ци) → Tasks 7,8. Все четыре утверждённых решения (ярость, авто-попадание, доп.атака, кара) реализованы в shared + UI. ✔
Намеренно отложено в План 4: талант, артефакты, расовые урон-способности (дыхание драконорождённого, голова дварфа, возмездие тифлинга), заклинатели (друид/изобретатель/жрец/бард/некромант), волшебник [12].

**Placeholder scan:** Tasks 1–3,6,7 содержат полный код и тесты. Tasks 4,5 — намеренно безкодовые (плут/паладин не получают новых объектов-способностей; их урон — базовая атака + модификаторы; покрытие в Task 1 и Task 8) — это явно обосновано, не плейсхолдер. Task 8 — UI-проводка с полным кодом ui-logic и точными инструкциями по ui.js (паттерны из Плана 2).

**Type consistency:** `multiWeaponAttack(ctx, plan) → packets` определён в Task 1, используется в Tasks 2,6,7 и common.js. `ctx.mods` ключи (barbRage, gwm, guaranteedHit, acIgnore, typeOverride, bonusAttack, sneak, sneakDouble, smiteDice, ricochet) объявлены в Task 1 (потребление) и проставляются в Task 8 (baseCtx/renderMods/defaultState). `modifierRelevance(ability, character)` — новая сигнатура (Task 8), все вызовы обновлены. `weaponForCharacter/critRangeForCharacter/GAME12_CHOICES` определены в Task 8 и используются в baseCtx/renderBuilder.

## Execution Handoff

После сохранения — subagent-driven исполнение (как Планы 1–2).
