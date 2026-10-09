# Сверка калькулятора с правилами 2026-10 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести расчёт урона к правилам dungeonlegends.ru на 2026-10-09: сначала исправить изменившиеся способности существующих классов и рас, затем добавить класс Чародей и расы Голиафы и Дампиры.

**Architecture:** Калькулятор — Монте-Карло на чистом JS (ES-модули, без зависимостей). Способность — объект с `simulateOnce(ctx)`, который возвращает пакеты урона по целям. Пакеты проходят общий пайплайн (`src/modifiers.js`), а тумблеры модификаторов задаются в `modifierRelevance` (`src/ui-logic.js`). Инвариант `test/relevance.test.js`: каждый показанный тумблер обязан менять расчёт. Он автоматически перебирает все классы, расы и выборы 12-й игры, поэтому новые сущности проверяются им без дополнительного кода.

**Tech Stack:** Node 22, `node --test`, сборка `node build.js` → `dnd-dmg.html`.

**Spec:** `docs/rules.md` (сверен с сайтом в коммите `30c562c`) + раздел «Решения по трактовке» ниже.

## Global Constraints

- Только встроенный `node:test` и `node:assert/strict`, без новых зависимостей.
- Детерминированные тесты способностей — через `seqRng` из `test/helpers.js`: формула броска `1 + Math.floor(r * sides)`, т. е. `0.99` → максимум грани, `0` → 1, `0.5` на д20 → 11. Если бросков не хватило, `seqRng` бросает ошибку — так ловятся лишние броски.
- Всё, что не урон (лечение, контроль, перемещение, защита), не моделируется — так устроен калькулятор.
- Коммиты — conventional commits на русском, без `Co-Authored-By`. Ветка `main`, **не пушить**: пуш в `main` запускает деплой на Pages.
- Перед каждым коммитом `npm test` полностью зелёный (сейчас 194 теста).

## Решения по трактовке

| Правило | Как моделируем |
| --- | --- |
| Талант: «пассивно, 3 раза в день» | За ход до 3 применений, к одному кубу (в т. ч. к одному д20) — не больше одного раза. Сначала спасаются промахи, остаток уходит в самые выгодные кубы урона. Талант применим к любому кубу, включая д20 Губителя |
| Урон по области (Огненный шар, Пламя, Адепт, Огненное дыхание, Огнемёт, Нестабильный аргумент, Путь в небытие, Жатва) | Кубы урона кидаются **один раз на все цели**. Где есть спасбросок, каждая цель спасается сама: провалившие получают полный урон, спасшиеся — половину (Жатва — ничего). Талант на этих общих кубах тратится сразу, потому что прибавка к общему кубу достаётся каждой цели |
| Губитель (Некромант, 12) | Тумблер: +д20 к урону **первого попадания** оружием за ход. Цена здоровьем не моделируется. Талант к д20 применим, орочий переброс — нет (это не куб урона) |
| Очарованный клинок (Бард, 12) | Отдельная способность «Удар очарованным клинком». До атаки — проверка «д20 + Харизма»; натуральная 1 (или итог ≤ 1) → д4, 2–9 → д6, 10–14 → д8, 15–19 → д10, 20+ → д12. Атака кидается как обычно; при попадании обычный **физический** урон оружием остаётся, а сверху добавляется **магический** «куб клинка + Харизма». На крите удваиваются оба куба. Зелье ярости удваивает физическую часть, зелье хаоса — магическую |
| Могучий (Голиаф) | Тумблер: +1д4 физического к первой цели с физическим уроном, до множителей зелий |
| Громоздкий (Голиаф) | Голиаф-цель кидает спасброски Ловкости с помехой (Огненный шар, Пламя, Адепт). Сглаз + голиаф — всё равно одна помеха |
| Вампиризм (Дампир) | Проверка «д20 + Ловкость ≥ 12» (1 — провал, 20 — успех, Талант может спасти), затем 1д6 физического урона цели |
| Магические кинжалы | 4 атаки «д20 + Инт» с распределением по целям, по д8 магии, крит удваивает куб. Притягивание и телепорт вне модели |
| Пламя | Один д20 на заклинание: 1–14 → 3д6, 15–20 → 6д6. Затем область со спасом «ловкость — 15», урон огнём. Талант поднимает д20 с 12–14 до порога 15 (это +3д6) |
| Вспышка | Ровно 5 магии каждой цели (все цели считаются в ближнем бою) |
| Адепт дикой магии (Чародей, 12) | д6: 1 — 10 излучением всем целям; 2 — огненный шар 6д6 со спасом; 3–6 — без урона. Пассивная «Дикая магия» не моделируется |
| Прочие изменения (Дымовая шашка, Клич героя, Контроль Ци, Бесконтактный бой, Шустрый и т. п.) | На урон не влияют — код не меняется |

## Review Focus

1. **Сохранённое состояние со старыми значениями.** `game12Choice: 'soulMaster'` или `params.ammo: 'усиленный'` из прежней версии не должны ронять расчёт: Некромант без способности 12-й игры, Аргумент с кубом 1д8. Тесты — в задачах 3 и 6.
2. **Общий урон по области на нескольких целях.** Все цели получают урон от одного броска (спасшиеся — `⌊X/2⌋`); Талант на общих кубах прибавляется каждой цели и не применяется к ним повторно в конце хода. Тесты — в задаче 5.
3. **Сглаз плюс голиаф-цель.** Две помехи не складываются в «двойную»: два д20, берётся меньший. Тест — в задаче 8.
4. **Очарованный клинок на крите и на промахе.** На крите удваиваются и куб оружия, и куб клинка; на промахе нет ни того, ни другого. Тесты — в задаче 7.
5. **Талант на нескольких кубах.** К каждому кубу прибавка один раз, даже если зарядов больше, чем кубов. Тест — в задаче 4.

Известное упрощение, которое не исправляем: свободный остаток Таланта на кубах **одиночных** атак целиком добавляется к первой цели с уроном, даже если лучший куб был брошен по другой цели. Групповой урон от этого не меняется. Так же было и раньше. Для общих кубов области упрощение снято (задача 5).

---

## Часть A. Изменения существующих классов и рас

### Task 1: Слабое место — крит на 19–20

**Files:**
- Modify: `src/ui-logic.js:68`, `src/ui-logic.js:110`
- Test: `test/ui-logic.test.js:94-97`, `test/ui-logic.test.js:150`

**Interfaces:** `critRangeForCharacter(c)` для Воина с `weakSpot` на 12+ игре возвращает `19`.

- [ ] **Step 1: Поправить тесты под новое правило**

В `test/ui-logic.test.js` тест на строках 94–97 начать так (остальное тело, включая проверку `game: 8 → 20`, оставить):

```js
test('critRangeForCharacter: Слабое место даёт 19 на 12 игре', () => {
  assert.equal(critRangeForCharacter({ classKey: 'warrior', game: 12, game12Choice: 'weakSpot' }), 19);
```

В тесте «Наручи удачи дают 19» (строка 150) ожидание для `weakSpot` + `braceletsOfLuck` поменять с `18` на `19`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test test/ui-logic.test.js`
Expected: FAIL — `18 !== 19`.

- [ ] **Step 3: Исправить код**

`src/ui-logic.js:68`:

```js
  warrior:   [{ id: 'weakSpot', name: 'Слабое место (крит 19–20)' }, { id: 'masterFencer', name: 'Мастер фехтования' }],
```

`src/ui-logic.js:110`:

```js
  let r = (c.classKey === 'warrior' && c.game >= 12 && c.game12Choice === 'weakSpot') ? 19 : 20;
```

- [ ] **Step 4: Прогнать всё** — Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui-logic.js test/ui-logic.test.js
git commit -m "fix: Слабое место воина — крит на 19–20 по новым правилам"
```

### Task 2: Путь в небытие — 1д8 без Интеллекта

**Files:**
- Modify: `src/abilities/necromancer.js:28-39`
- Test: `test/necromancer.test.js:21-24`

- [ ] **Step 1: Поправить тест**

```js
test('Путь в небытие: 1d8 некротик по всем, без Интеллекта', () => {
  const p = get('pathToOblivion').simulateOnce(nctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 8 }]]); // d8 0.99->8, интеллект не прибавляется
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test test/necromancer.test.js`
Expected: FAIL — `11 !== 8`.

- [ ] **Step 3: Исправить `simulateOnce`**

```js
    simulateOnce(ctx) {
      // Каждая цель получает 1d8 некротического урона.
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) {
        out[i].push({
          type: 'necrotic',
          amount: rollNotation('1d8', ctx.rng, ctx.mods.orcReroll, talentTally(ctx)),
        });
      }
      return out;
    },
```

- [ ] **Step 4: Прогнать всё** — Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/abilities/necromancer.js test/necromancer.test.js
git commit -m "fix: Путь в небытие наносит 1д8 без Интеллекта"
```

### Task 3: Аргумент — наконечник «обычный»

**Files:**
- Modify: `src/abilities/artificer.js:12-27`
- Test: `test/artificer.test.js:21-25`

- [ ] **Step 1: Поправить тест и добавить тесты на старое значение и дефолт**

```js
test('Аргумент обычный: 1d8+dex при попадании', () => {
  // nat 0.5 (=11, +2>=10 hit); 1d8 (0.99)=8 + dex 2 = 10
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { ammo: 'обычный', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 10 }]]);
});

test('Аргумент: «усиленный» из старого сохранения считается обычным 1d8', () => {
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { ammo: 'усиленный', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 10 }]]);
});

test('Аргумент: по умолчанию выбран обычный наконечник', () => {
  const a = get('argument');
  assert.equal(a.params[0].default, 'обычный');
  assert.equal(a.params[0].options[0].value, 'обычный');
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `node --test test/artificer.test.js`
Expected: FAIL на проверке `default`/`options`.

- [ ] **Step 3: Переименовать**

```js
const AMMO = { 'обычный': '1d8', 'гарпун': '1d4' };
```

```js
      { id: 'ammo', kind: 'select', label: 'Наконечник', default: 'обычный',
        options: [{ value: 'обычный', label: 'Обычный (1д8)' }, { value: 'гарпун', label: 'Гарпун (1д4)' }] },
```

```js
      const die = AMMO[ctx.params.ammo] || AMMO['обычный'];
```

- [ ] **Step 4: Прогнать всё** — Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/abilities/artificer.js test/artificer.test.js
git commit -m "fix: наконечник Аргумента «усиленный» переименован в «обычный»"
```

### Task 4: Талант — до трёх раз за ход, к кубу один раз

**Files:**
- Modify: `src/engine.js:53-80`, `src/simulator.js:4-10`, `src/simulator.js:29-30`, `src/ui.js:377`
- Test: `test/engine.test.js` (после строки 124), `test/simulator.test.js:75-89`

**Interfaces:**
- Produces:
  - `TALENT_USES = 3` (экспорт `src/engine.js`);
  - `ctx.talent = { left: number, tally: Array<{sides, roll}> }`, в начале хода `left = TALENT_USES`;
  - `spendTalentOnDice(ctx, dice: Array<{sides, roll}>) -> number` — тратит до `ctx.talent.left` зарядов на самые выгодные кубы из `dice` (по одному на куб), возвращает сумму прибавок; без таланта — 0;
  - `talentDamageBonus(ctx)` — то же для `ctx.talent.tally`.
- `isHitWithTalent` не меняется: один вызов — один д20, +3 максимум один раз.

- [ ] **Step 1: Тесты движка**

Добавить в `test/engine.test.js` (в импорт дописать `TALENT_USES, spendTalentOnDice`):

```js
test('Талант: три заряда уходят в три самых выгодных разных куба', () => {
  const ctx = { talent: { left: 3, tally: [
    { sides: 6, roll: 1 }, { sides: 6, roll: 2 }, { sides: 6, roll: 5 }, { sides: 6, roll: 6 },
  ] } };
  assert.equal(talentDamageBonus(ctx), 7); // 3 + 3 + 1, шестёрке прибавлять некуда
  assert.equal(ctx.talent.left, 0);
});

test('Талант: к одному кубу не применяется дважды', () => {
  const ctx = { talent: { left: 3, tally: [{ sides: 6, roll: 1 }] } };
  assert.equal(talentDamageBonus(ctx), 3);
  assert.equal(ctx.talent.left, 2);
});

test('Талант: спасает несколько атак за ход, пока есть заряды', () => {
  const ctx = { critRange: 20, fumbleRange: 1, talent: { left: 2, tally: [] } };
  assert.equal(isHitWithTalent(ctx, 11, 4, 17).hit, true);
  assert.equal(isHitWithTalent(ctx, 11, 4, 17).hit, true);
  assert.equal(isHitWithTalent(ctx, 11, 4, 17).hit, false); // зарядов нет
  assert.equal(ctx.talent.left, 0);
});

test('spendTalentOnDice: тратит заряды на переданные кубы, без таланта — 0', () => {
  const ctx = { talent: { left: 3, tally: [] } };
  assert.equal(spendTalentOnDice(ctx, [{ sides: 6, roll: 2 }, { sides: 6, roll: 4 }]), 5); // 3 + 2
  assert.equal(ctx.talent.left, 1);
  assert.equal(spendTalentOnDice({ talent: null }, [{ sides: 6, roll: 1 }]), 0);
});

test('Талант: три заряда за ход', () => {
  assert.equal(TALENT_USES, 3);
});
```

- [ ] **Step 2: Тест симулятора**

В `test/simulator.test.js` в тесте «Талант в прогоне» заменить проверку:

```js
  // До трёх зарядов на три самых низких из 6д6: в среднем ≈ +8.4
  assert.ok(gain > 7.9 && gain < 8.9, `прирост ${gain.toFixed(2)} вне ожидаемого 7.9..8.9`);
```

- [ ] **Step 3: Убедиться, что падают**

Run: `node --test test/engine.test.js test/simulator.test.js`
Expected: FAIL — экспортов нет; первый тест даёт 3 вместо 7; прирост ≈ 2.9.

- [ ] **Step 4: Реализация в `src/engine.js`**

Перед `talentTally`:

```js
// Талант: «пассивно, 3 раза в день» — за ход можно потратить все три,
// но к одному кубу (в том числе к одному д20) — не больше одного раза.
export const TALENT_USES = 3;
```

`talentDamageBonus` заменить на:

```js
// Тратит заряды Таланта на кубы с наибольшим запасом до потолка грани —
// по одному заряду на куб. Возвращает сумму прибавок.
export function spendTalentOnDice(ctx, dice) {
  const t = ctx.talent;
  if (!t || t.left <= 0) return 0;
  const gains = dice
    .map((d) => Math.min(d.roll + 3, d.sides) - d.roll)
    .filter((g) => g > 0)
    .sort((a, b) => b - a)
    .slice(0, t.left);
  t.left -= gains.length;
  return gains.reduce((s, g) => s + g, 0);
}

// Оставшиеся к концу хода заряды уходят в кубы урона, брошенные за ход.
export function talentDamageBonus(ctx) {
  const t = ctx.talent;
  if (!t || !t.tally.length) return 0;
  return spendTalentOnDice(ctx, t.tally);
}
```

Комментарий над `isHitWithTalent` дополнить строкой: «Каждый вызов — отдельный д20, поэтому одна атака спасается не больше одного раза.»

- [ ] **Step 5: Реализация в `src/simulator.js`**

Импорт: `import { makeRng, talentDamageBonus, TALENT_USES } from './engine.js';`

```js
    // Талант: до трёх зарядов за ход — сначала спасают промахи, остаток идёт в урон.
    ctx.talent = baseCtx.mods && baseCtx.mods.talent ? { left: TALENT_USES, tally: [] } : null;
```

Комментарий над `addTalentDamage`: «Неизрасходованные заряды Таланта добавляются к первой цели, получившей урон.»

- [ ] **Step 6: Подпись в UI**

`src/ui.js:377`:

```js
      ['talent', 'Талант (+3 к кубам)', '16-я игра: до 3 раз за ход, к одному кубу — один раз; сначала спасает промахи, остаток — в самые низкие кубы урона'],
```

- [ ] **Step 7: Прогнать всё**

Run: `npm test`
Expected: PASS. Если упадёт другой тест, завязанный на один заряд за ход, — пересчитать ожидание под 3 заряда, а не откатывать.

- [ ] **Step 8: Commit**

```bash
git add src/engine.js src/simulator.js src/ui.js test/engine.test.js test/simulator.test.js
git commit -m "fix: Талант — до трёх раз за ход, к одному кубу один раз"
```

### Task 5: Урон по области кидается один раз на всех

**Files:**
- Modify: `src/engine.js`, `src/abilities/shared.js`, `src/abilities/wizard.js:54-70`, `src/abilities/racial.js:6-15`, `src/abilities/artificer.js:36-81`, `src/abilities/necromancer.js` (Путь в небытие, Жатва)
- Test: `test/engine.test.js`, `test/abilities.test.js`, `test/racial.test.js`, `test/artificer.test.js`, `test/necromancer.test.js:44-59`

**Interfaces:**
- Consumes: `spendTalentOnDice` (Task 4).
- Produces:
  - `rollShared(ctx, n, sides) -> number` в `src/engine.js`: один бросок `n`д`sides` на все цели (с орочьим перебросом). Талант на этих кубах тратится сразу, и кубы **не** пишутся в `ctx.talent.tally`, иначе остаток Таланта в конце хода применился бы к ним повторно;
  - `dexSaveBlast(ctx, out, nDice, type) -> out` в `src/abilities/shared.js`: спасбросок каждой цели («ловкость — 15», при `ctx.mods.hex` — с помехой), затем `rollShared(ctx, nDice, 6)`; в `out[i]` — полный урон при провале, `⌊/2⌋` при успехе.

Что переводится на общий бросок:

| Способность | Было | Стало |
| --- | --- | --- |
| Огненный шар | 6д6 на каждую цель | `dexSaveBlast(..., 6, 'fire')` |
| Огненное дыхание | 2д6 на каждую цель | `rollShared(ctx, 2, 6)` всем |
| Огнемёт | 2д6 на каждую цель | `rollShared(ctx, 2, 6)` всем |
| Нестабильный аргумент, грань 1 | 2д4 на каждую цель | `rollShared(ctx, 2, 4)` всем |
| Путь в небытие | 1д8 на каждую цель | `rollShared(ctx, 1, 8)` всем |
| Жатва | 1д10 каждой провалившей | спасброски до 3 целей, затем один `rollShared(ctx, 1, 10)` всем провалившим; если проваливших нет — урон не кидается |

Для одной цели порядок бросков не меняется (спас, затем кубы), поэтому существующие одноцелевые тесты остаются как есть. Переписывается только тест Жатвы «не больше 3 целей».

- [ ] **Step 1: Тесты**

`test/engine.test.js` (импорт дописать `rollShared`):

```js
test('rollShared: один бросок, Талант тратится сразу и не пишется в журнал', () => {
  const ctx = { rng: seqRng([0, 0.99]), mods: { orcReroll: false }, talent: { left: 3, tally: [] } };
  assert.equal(rollShared(ctx, 2, 6), 7 + 3); // 1 + 6, тройка уходит в единицу
  assert.equal(ctx.talent.left, 2);
  assert.equal(ctx.talent.tally.length, 0);
});
```

(если `seqRng` в `test/engine.test.js` не импортирован — добавить `import { seqRng } from './helpers.js';`.)

`test/abilities.test.js`:

```js
const twoTargets = [{ ac: 12, hp: 99, saves: { dex: 0 } }, { ac: 12, hp: 99, saves: { dex: 0 } }];

test('fireball: урон кидается один раз на всех — провал целиком, спас половина', () => {
  // спасы: 0 -> 1 провал, 0.99 -> 20 успех; затем ОДИН бросок 6д6 = 36
  const rng = seqRng([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('fireball').simulateOnce(ctx({ rng, targets: twoTargets }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }], [{ type: 'fire', amount: 18 }]]);
});

test('fireball: Талант на общих кубах прибавляется каждой цели', () => {
  // оба провалили; 6д6 по единице = 6; три заряда по +3 = 15 каждой цели
  const c = ctx({ rng: seqRng([0, 0, 0, 0, 0, 0, 0, 0]), targets: twoTargets });
  c.talent = { left: 3, tally: [] };
  const p = get('fireball').simulateOnce(c);
  assert.deepEqual(p, [[{ type: 'fire', amount: 15 }], [{ type: 'fire', amount: 15 }]]);
  assert.equal(c.talent.left, 0);
  assert.equal(c.talent.tally.length, 0);
});
```

(`ctx` — существующий хелпер файла; если он не принимает `targets`, передать цели так же, как в тесте «спасбросок берёт ловкость каждой цели».)

`test/racial.test.js`:

```js
test('dragonbornBreath: 2d6 кидается один раз на все цели', () => {
  // 6 + 4 = 10 обеим; при броске на каждую цель seqRng исчерпался бы
  const p = get('dragonbornBreath').simulateOnce(ctx({ rng: seqRng([0.99, 0.5]), targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 10 }], [{ type: 'fire', amount: 10 }]]);
});
```

`test/artificer.test.js`:

```js
const twoT = [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }];

test('Огнемёт: 2d6 один раз на все цели', () => {
  const p = get('flamethrower').simulateOnce(actx({ rng: seqRng([0.99, 0.5]), targets: twoT }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 10 }], [{ type: 'fire', amount: 10 }]]);
});

test('Нестабильный, грань 1: 2d4 один раз на все цели', () => {
  // грань 0 -> 1; 2d4: 4 + 3 = 7
  const p = get('unstableArgument').simulateOnce(actx({ rng: seqRng([0, 0.99, 0.5]), targets: twoT }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 7 }], [{ type: 'fire', amount: 7 }]]);
});
```

`test/necromancer.test.js` — тест «Жатва берёт не больше 3 целей» заменить и добавить новые:

```js
test('Жатва берёт не больше 3 целей, урон один на всех провалившим', () => {
  // три спаса-провала (0), затем ОДИН 1d10 = 10; четвёртая и пятая не трогаются
  const t = { ac: 10, hp: 99, saves: { con: 0 } };
  const p = get('harvest').simulateOnce(nctx({ rng: seqRng([0, 0, 0, 0.99]), targets: [t, t, t, t, t] }));
  const hit = [{ type: 'necrotic', amount: 10 }];
  assert.deepEqual(p, [hit, hit, hit, [], []]);
});

test('Жатва: спасшаяся цель без урона, все спаслись — урон не кидается', () => {
  const t = { ac: 10, hp: 99, saves: { con: 0 } };
  const mixed = get('harvest').simulateOnce(nctx({ rng: seqRng([0, 0.99, 0.99]), targets: [t, t] }));
  assert.deepEqual(mixed, [[{ type: 'necrotic', amount: 10 }], []]);
  const none = get('harvest').simulateOnce(nctx({ rng: seqRng([0.99, 0.99]), targets: [t, t] }));
  assert.deepEqual(none, [[], []]);
});

test('Путь в небытие: 1d8 один раз на все цели', () => {
  const t = { ac: 10, hp: 99 };
  const p = get('pathToOblivion').simulateOnce(nctx({ rng: seqRng([0.5]), targets: [t, t] }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 5 }], [{ type: 'necrotic', amount: 5 }]]);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test`
Expected: FAIL — `rollShared` не экспортирован; многоцелевые тесты падают на `seqRng исчерпан` (сейчас кубы кидаются на каждую цель).

- [ ] **Step 3: `rollShared` в `src/engine.js`**

После `talentDamageBonus`:

```js
// Общий урон области: кубы кидаются один раз на все цели. Талант на них тратится сразу —
// прибавка к общему кубу достаётся каждой цели, — и в журнал они не пишутся,
// иначе остаток Таланта в конце хода лёг бы на них повторно.
export function rollShared(ctx, n, sides) {
  const dice = [];
  return sumDice(n, sides, ctx.rng, ctx.mods.orcReroll, dice) + spendTalentOnDice(ctx, dice);
}
```

- [ ] **Step 4: `dexSaveBlast` в `src/abilities/shared.js`**

Импорт дополнить: `attackRoll, rollShared`.

```js
// Область со спасброском «ловкость — 15»: каждая цель спасается сама, а урон кидается
// один раз на всех — провалившие получают его целиком, спасшиеся половину.
export function dexSaveBlast(ctx, out, nDice, type) {
  const saved = ctx.targets.map((t) => {
    const nat = attackRoll(ctx.rng, ctx.mods.hex ? 'dis' : 'none'); // Сглаз = помеха спасброску
    return nat !== 1 && (nat === 20 || nat + ((t.saves && t.saves.dex) || 0) >= 15);
  });
  const full = rollShared(ctx, nDice, 6);
  saved.forEach((s, i) => out[i].push({ type, amount: s ? Math.floor(full / 2) : full }));
  return out;
}
```

`src/abilities/wizard.js`, импорт `import { dexSaveBlast } from './shared.js';`, тело `fireball.simulateOnce`:

```js
    simulateOnce(ctx) {
      return dexSaveBlast(ctx, empty(ctx.targets.length), 6, 'fire');
    },
```

Из импорта `wizard.js` убрать `attackRoll`, если он больше нигде в файле не используется (`sumDice` остаётся — его использует цепная молния).

- [ ] **Step 5: Остальные способности по области**

`src/abilities/racial.js`, `dragonbornBreath.simulateOnce` (импорт `rollShared` из `../engine.js`; `sumDice`/`talentTally` остаются для Адского возмездия):

```js
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const amount = rollShared(ctx, 2, 6); // урон по области — один бросок на всех
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount });
      return out;
    },
```

`src/abilities/artificer.js` (импорт `rollShared`), в `flamethrower`:

```js
      // 2d6 огнём по всем целям (авто, без броска атаки), один бросок на всех
      const amount = rollShared(ctx, 2, 6);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount });
```

в `unstableArgument`, ветка `roll === 1`:

```js
      if (roll === 1) {
        const amount = rollShared(ctx, 2, 4);
        for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount });
      }
```

Из импорта `artificer.js` убрать `sumDice`, если он больше не используется.

`src/abilities/necromancer.js` (импорт `rollShared`), `pathToOblivion.simulateOnce`:

```js
    simulateOnce(ctx) {
      // Все цели на линии получают один и тот же бросок 1d8 некротического урона.
      const out = empty(ctx.targets.length);
      const amount = rollShared(ctx, 1, 8);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'necrotic', amount });
      return out;
    },
```

`harvest.simulateOnce` — цикл заменить на:

```js
      const failed = [];
      for (let i = 0; i < reach; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat === 20 || (nat !== 1 && nat + ((ctx.targets[i].saves && ctx.targets[i].saves.con) || 0) >= 15);
        if (!saved) failed.push(i);
      }
      // Один бросок 1d10 на всех провалившихся; если провалившихся нет — кидать нечего.
      if (failed.length) {
        const amount = rollShared(ctx, 1, 10);
        for (const i of failed) out[i].push({ type: 'necrotic', amount });
      }
      return out;
```

Из импорта `necromancer.js` убрать то, что стало неиспользуемым (`talentTally` остаётся для Погребального звона).

- [ ] **Step 6: Прогнать всё**

Run: `npm test`
Expected: PASS, включая старые одноцелевые тесты этих способностей, «Талант в прогоне» (на одной цели прирост тот же ≈ 8.4) и инвариант `relevance.test.js`.

- [ ] **Step 7: Commit**

```bash
git add src/engine.js src/abilities/shared.js src/abilities/wizard.js src/abilities/racial.js src/abilities/artificer.js src/abilities/necromancer.js test/engine.test.js test/abilities.test.js test/racial.test.js test/artificer.test.js test/necromancer.test.js
git commit -m "fix: урон по области кидается один раз на все цели"
```

### Task 6: Губитель вместо Мастера душ

**Files:**
- Modify: `src/ui-logic.js:78` (GAME12), `src/ui-logic.js:126-176` (`modifierRelevance`), `src/ui-logic.js:191-195` (`defaultState`), `src/abilities/shared.js`, `src/ui.js` (тумблеры ~строка 377, `baseCtx` ~строка 626)
- Test: `test/shared.test.js`, `test/ui-logic.test.js`, `test/relevance.test.js:38-45`

**Interfaces:**
- Produces: `ctx.mods.reaper: boolean`; `modifierRelevance(...).reaper`; id выбора 12-й игры `'reaper'`.

- [ ] **Step 1: Тесты**

`test/shared.test.js`:

```js
test('Губитель: +д20 к урону первого попадания, только один раз', () => {
  // атака 1: nat 11 попал, d10=10 +3 = 13, Губитель d20 (0.49 -> 10) = 23
  // атака 2: nat 11 попал, d10=10 +3 = 13, без Губителя
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.49, 0.5, 0.99]), mods: { reaper: true } }), [0, 0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 23 }, { type: 'physical', amount: 13 }]]);
});

test('Губитель: после промаха достаётся первому попаданию', () => {
  // атака 1: nat 1 промах; атака 2: nat 11, d10=10 +3 + d20(10) = 23
  const p = multiWeaponAttack(ctx({ rng: seqRng([0, 0.5, 0.99, 0.49]), mods: { reaper: true } }), [0, 0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 23 }]]);
});

test('Губитель: д20 попадает в журнал Таланта, орочий переброс его не трогает', () => {
  // d20 0.05 -> 2: с орочьим перебросом был бы переброшен, но это не куб урона
  const c = ctx({ rng: seqRng([0.5, 0.99, 0.05]), mods: { reaper: true, orcReroll: true } });
  c.talent = { left: 1, tally: [] };
  const p = multiWeaponAttack(c, [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 15 }]]); // 10 + 3 + 2
  assert.deepEqual(c.talent.tally.at(-1), { sides: 20, roll: 2 });
});
```

`test/ui-logic.test.js` (в импорт добавить `availableAbilities`, `modifierRelevance`, если их там нет):

```js
test('GAME12_CHOICES: у некроманта Жатва и Губитель', () => {
  assert.deepEqual(GAME12_CHOICES.necromancer.map((x) => x.id), ['harvest', 'reaper']);
});

test('Губитель показан некроманту 12-й игры на атаке оружием', () => {
  const c = { classKey: 'necromancer', raceKey: 'elf', game: 12, game12Choice: 'reaper', artifacts: [] };
  const basic = availableAbilities(c).find((a) => a.id === 'basicAttack');
  assert.equal(modifierRelevance(basic, c).reaper, true);
  assert.equal(modifierRelevance(basic, { ...c, game12Choice: 'harvest' }).reaper, false);
});

test('старый выбор soulMaster не ломает список способностей', () => {
  const ids = availableAbilities({ classKey: 'necromancer', game: 12, game12Choice: 'soulMaster' }).map((a) => a.id);
  assert.ok(ids.includes('pathToOblivion'));
  assert.ok(!ids.includes('harvest'));
});
```

`test/relevance.test.js` — в `OFF_MODS` добавить `reaper: false,`.

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test test/shared.test.js test/ui-logic.test.js`
Expected: FAIL — урон 13 вместо 23; в GAME12 `soulMaster`.

- [ ] **Step 3: `src/abilities/shared.js`**

Импорт дополнить: `rollDie, d20` (последний понадобится в Task 7).

Рядом с `let firstHitDone = false;`:

```js
  let reaperDone = false;       // Губитель — одна реакция, на первое попадание
```

Сразу после блока скрытной атаки (`if (m.sneak && firstStrike) { ... }`), до записи пакета:

```js
      // Губитель: реакцией прибавить к урону д20 здоровья (цена здоровьем вне модели).
      // Это куб — Талант к нему применим, а орочий переброс (только кубы урона) — нет.
      if (m.reaper && !reaperDone) { amount += rollDie(20, ctx.rng, false, talentTally(ctx)); reaperDone = true; }
```

- [ ] **Step 4: `src/ui-logic.js`**

```js
  necromancer: [{ id: 'harvest', name: 'Жатва' }, { id: 'reaper', name: 'Губитель (+д20 к урону оружием)' }],
```

В `modifierRelevance` после `ricochet`:

```js
    reaper: weapon && cls === 'necromancer' && g12 === 'reaper',
```

В `defaultState().mods` дописать `reaper: false`.

- [ ] **Step 5: `src/ui.js`**

В массив `toggles` перед `rabbitFoot`:

```js
      ['reaper', 'Губитель (+д20)', '12-я игра: реакцией платите д20 здоровья и прибавляете их к урону первого попадания оружием'],
```

В `baseCtx().mods` после `beastRage`:

```js
        reaper: !!(rel.reaper && state.mods.reaper),
```

- [ ] **Step 6: Прогнать всё** — Run: `npm test` → Expected: PASS, включая инвариант `relevance.test.js`.

- [ ] **Step 7: Commit**

```bash
git add src/abilities/shared.js src/ui-logic.js src/ui.js test/shared.test.js test/ui-logic.test.js test/relevance.test.js
git commit -m "feat: Губитель некроманта вместо Мастера душ"
```

### Task 7: Бард — выбор 12-й игры и Удар очарованным клинком

**Files:**
- Create: `src/abilities/bard.js`, `test/bard.test.js`
- Modify: `src/abilities/shared.js`, `src/abilities/index.js`, `src/ui-logic.js` (GAME12, `modifierRelevance.chaos`)
- Test: `test/shared.test.js`, `test/ui-logic.test.js`

**Interfaces:**
- Consumes: `d20` в `shared.js` (импортирован в Task 6).
- Produces:
  - `ctx.mods.enchantedBlade: boolean` — читает `multiWeaponAttack`; выставляет только способность клинка, тумблера в UI нет;
  - флаг способности `alsoMagic: true` — физическая способность с магической частью урона, для неё показывается Зелье хаоса;
  - способность `id: 'enchantedBladeAttack'`, `choiceGroup: 'game12'`, `choiceId: 'enchantedBlade'`;
  - id выборов барда `'enchantedBlade'`, `'fanbase'`.

- [ ] **Step 1: Тесты механики в `test/shared.test.js`**

```js
const bard = { str: 0, dex: 1, con: -1, wis: -1, int: 1, cha: 4 };
const bardWeapon = { dice: '1d6', stat: 'dex' };
const blade = (rng) => ctx({ rng: seqRng(rng), stats: bard, weapon: bardWeapon, mods: { enchantedBlade: true } });

test('Очарованный клинок: физика оружия остаётся, сверху магия куб клинка + Хар', () => {
  // проверка nat 11 +4 = 15 -> д10; атака nat 11 +1 >= 10; д6 = 6 +1 = 7 физ; д10 = 10 +4 = 14 маг
  const p = multiWeaponAttack(blade([0.5, 0.5, 0.99, 0.99]), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 7 }, { type: 'magic', amount: 14 }]]);
});

test('Очарованный клинок: натуральная 1 на проверке -> д4', () => {
  const p = multiWeaponAttack(blade([0, 0.5, 0.99, 0.99]), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 7 }, { type: 'magic', amount: 8 }]]); // д4 = 4 +4
});

test('Очарованный клинок: на крите удваиваются оба куба', () => {
  // проверка 15 -> д10; атака nat 20; 2×д6 = 12 +1 = 13 физ; 2×д10 = 20 +4 = 24 маг
  const p = multiWeaponAttack(blade([0.5, 0.99, 0.99, 0.99, 0.99, 0.99]), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'magic', amount: 24 }]]);
});

test('Очарованный клинок: промах — ни физики, ни магии', () => {
  const p = multiWeaponAttack(blade([0.5, 0]), [0]);
  assert.deepEqual(p, [[]]);
});

test('Очарованный клинок действует только на первую атаку плана', () => {
  const p = multiWeaponAttack(blade([0.5, 0.5, 0.99, 0.99, 0.5, 0.99]), [0, 0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 7 }, { type: 'magic', amount: 14 }, { type: 'physical', amount: 7 }]]);
});
```

- [ ] **Step 2: Тесты способности в `test/bard.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { availableAbilities, modifierRelevance, GAME12_CHOICES } from '../src/ui-logic.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const bard12 = (game12Choice) => ({ classKey: 'bard', raceKey: 'elf', game: 12, game12Choice, artifacts: [] });

test('Удар очарованным клинком: физическая и магическая части урона', () => {
  const stats = { str: 0, dex: 1, con: -1, wis: -1, int: 1, cha: 4 };
  const c = {
    rng: seqRng([0.5, 0.5, 0.99, 0.99]), stats, attackBonus: (s) => stats[s], critRange: 20, fumbleRange: 1,
    weapon: { dice: '1d6', stat: 'dex' }, targets: [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false }, params: { target: 0 },
  };
  assert.deepEqual(get('enchantedBladeAttack').simulateOnce(c),
    [[{ type: 'physical', amount: 7 }, { type: 'magic', amount: 14 }]]);
});

test('Клинок доступен барду только при выборе на 12-й игре', () => {
  const ids = (ch) => availableAbilities(bard12(ch)).map((a) => a.id);
  assert.ok(ids('enchantedBlade').includes('enchantedBladeAttack'));
  assert.ok(!ids('fanbase').includes('enchantedBladeAttack'));
  assert.ok(ids('enchantedBlade').includes('basicAttack')); // обычный удар остаётся для сравнения
});

test('На Клинке показаны оба зелья, на обычном ударе — только ярость', () => {
  const c = bard12('enchantedBlade');
  const relBlade = modifierRelevance(get('enchantedBladeAttack'), c);
  assert.equal(relBlade.rage, true);
  assert.equal(relBlade.chaos, true);
  assert.equal(modifierRelevance(get('basicAttack'), c).chaos, false);
});

test('GAME12_CHOICES: у барда Очарованный клинок и Фанбаза', () => {
  assert.deepEqual(GAME12_CHOICES.bard.map((x) => x.id), ['enchantedBlade', 'fanbase']);
});
```

- [ ] **Step 3: Убедиться, что падают**

Run: `node --test test/shared.test.js test/bard.test.js`
Expected: FAIL — нет магического пакета, нет способности.

- [ ] **Step 4: Механика в `src/abilities/shared.js`**

После функции `empty`:

```js
// Очарованный клинок: итог проверки Харизмы задаёт куб дополнительного магического урона.
function bladeDie(nat, total) {
  if (nat === 1 || total <= 1) return 4;
  if (total >= 20) return 12;
  if (total >= 15) return 10;
  if (total >= 10) return 8;
  return 6;
}
```

В начале `multiWeaponAttack`, после `let reaperDone = false;`:

```js
  // Клинок напевают перед атакой: проверка бросается до первого удара.
  let blade = 0;
  if (m.enchantedBlade) {
    const nat = d20(ctx.rng);
    blade = bladeDie(nat, nat + ctx.attackBonus('cha'));
  }
```

Внутри `if (hit) { ... }`, сразу после `out[idx].push({ type, amount });` (до рикошета и кары):

```js
      // Клинок усиливает только первую атаку: физика оружия остаётся, магия идёт сверху.
      if (blade && firstStrike) {
        out[idx].push({ type: 'magic', amount: rollWeapon(crit, `1d${blade}`) + ctx.attackBonus('cha') });
      }
```

И `rollWeapon` научить принимать куб (по умолчанию — куб оружия), остальные вызовы не меняются:

```js
      const rollWeapon = (isCrit, d = ctx.weapon.dice) => isCrit
        ? rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx)) + rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx))
        : rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx));
```

(строку `const d = ctx.weapon.dice;` удалить — её роль берёт параметр по умолчанию).

- [ ] **Step 5: Способность `src/abilities/bard.js`**

```js
import { multiWeaponAttack } from './shared.js';

export const BARD_ABILITIES = [
  {
    id: 'enchantedBladeAttack', name: 'Удар очарованным клинком', classKey: 'bard',
    minGame: 12, choiceGroup: 'game12', choiceId: 'enchantedBlade',
    charges: 'реакция, раз в ход', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical', weaponBased: true,
    alsoMagic: true, // сверху физики — магический урон клинка: на него действует Зелье хаоса
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      return multiWeaponAttack({ ...ctx, mods: { ...ctx.mods, enchantedBlade: true } }, [ctx.params.target ?? 0]);
    },
  },
];
```

`src/abilities/index.js`: `import { BARD_ABILITIES } from './bard.js';` и `...BARD_ABILITIES,` в `ABILITIES`.

- [ ] **Step 6: `src/ui-logic.js`**

В `GAME12_CHOICES` после `cleric`:

```js
  bard:      [{ id: 'enchantedBlade', name: 'Очарованный клинок' }, { id: 'fanbase', name: 'Фанбаза' }],
```

В `modifierRelevance`:

```js
    chaos: magic || !!ability.alsoMagic,
```

- [ ] **Step 7: Прогнать всё**

Run: `npm test`
Expected: PASS. Старые тесты `shared.test.js` (рикошет, скрытная, кара) зелёные — без клинка порядок бросков не изменился. Инвариант подтверждает, что ярость и хаос на клинке оба живые.

- [ ] **Step 8: Commit**

```bash
git add src/abilities/shared.js src/abilities/bard.js src/abilities/index.js src/ui-logic.js test/shared.test.js test/bard.test.js
git commit -m "feat: выбор 12-й игры барда и Удар очарованным клинком"
```

---

## Часть B. Новые расы и класс

### Task 8: Голиафы — Могучий и Громоздкий

**Files:**
- Modify: `src/characters.js:22-34`, `src/engine.js`, `src/abilities/shared.js` (`dexSaveBlast`), `src/modifiers.js`, `src/ui-logic.js`, `src/ui.js`
- Test: `test/characters.test.js`, `test/modifiers.test.js`, `test/abilities.test.js`, `test/relevance.test.js`

**Interfaces:**
- Consumes: `dexSaveBlast` (Task 5).
- Produces: `RACES.goliath = { ..., mighty: true, saveDis: { dex: true } }`; `saveModeFor(ctx, target, stat) -> 'none'|'dis'` в `src/engine.js`; `ctx.mods.mighty`.

- [ ] **Step 1: Тесты**

`test/characters.test.js`:

```js
test('Голиаф: без правок статов, с Могучим и помехой к Ловкости', () => {
  assert.equal(RACES.goliath.name, 'Голиаф');
  assert.equal(RACES.goliath.mighty, true);
  assert.deepEqual(RACES.goliath.saveDis, { dex: true });
  assert.deepEqual(computePreset('goliath', 'warrior', 1), { ac: 15, hp: 25, saves: { str: 3, dex: 1, con: 1, wis: 0, int: 0, cha: -1 } });
});
```

`test/modifiers.test.js`:

```js
test('Могучий: +1д4 физ первой цели с физическим уроном', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }], [{ type: 'physical', amount: 5 }]], baseCtx({ mods: { mighty: true } }));
  assert.deepEqual(out, [10, 9]); // д4 при 0.99 = 4
});

test('Могучий: без физического урона ничего не добавляет', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ mods: { mighty: true } }));
  assert.deepEqual(out, [10]);
});

test('Могучий удваивается зельем ярости', () => {
  const out = applyPipeline([[{ type: 'physical', amount: 5 }]], baseCtx({ mods: { mighty: true, rage: true } }));
  assert.deepEqual(out, [18]); // (5 + 4) × 2
});
```

`test/abilities.test.js`:

```js
const goliathTarget = (hex) => ctx({
  rng: seqRng([0.99, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  targets: [{ ac: 12, hp: 99, saves: { dex: 0 }, race: 'goliath' }],
  mods: { hex },
});

test('fireball: голиаф-цель спасается с помехой', () => {
  // помеха: 0.99 (20) и 0 (1) -> берётся 1, провал; 6д6 = 36
  assert.deepEqual(get('fireball').simulateOnce(goliathTarget(false)), [[{ type: 'fire', amount: 36 }]]);
});

test('fireball: Сглаз и голиаф — одна помеха, а не две', () => {
  // ровно два д20 на спас, иначе seqRng сдвинется и урон не совпадёт
  assert.deepEqual(get('fireball').simulateOnce(goliathTarget(true)), [[{ type: 'fire', amount: 36 }]]);
});
```

(если хелпер `ctx` файла не пробрасывает `mods`, задать их явно так же, как в соседних тестах).

`test/relevance.test.js` — в `OFF_MODS` добавить `mighty: false,`; в `TARGET_SETS` добавить `[{ ac: 16, race: 'goliath' }],`.

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test`
Expected: FAIL — `RACES.goliath` undefined, Могучий не добавляет урон, шар против голиафа спасается (18).

- [ ] **Step 3: Раса**

`src/characters.js`, в `RACES` после `kitsune`:

```js
  // mighty — «Могучий»: д4 к своему физическому урону (тумблер).
  // saveDis — слабость «Громоздкий»: помеха к проверкам Ловкости, когда голиаф — цель спасброска.
  goliath:    { name: 'Голиаф',           hpMod: 0,  acMod: 0, statMods: {}, mighty: true, saveDis: { dex: true } },
```

- [ ] **Step 4: Помеха спасброску**

`src/engine.js` (в конец; `RACES` импортировать из `./characters.js` — он ничего не импортирует, цикла нет):

```js
// Режим спасброска цели: Сглаз накладывает помеху, расовая слабость цели
// («Громоздкий» у голиафа) — помеху к проверкам своей характеристики.
// Две помехи — всё равно одна помеха.
export function saveModeFor(ctx, target, stat) {
  const race = target && target.race ? RACES[target.race] : null;
  const raceDis = !!(race && race.saveDis && race.saveDis[stat]);
  return resolveMode(false, !!(ctx.mods && ctx.mods.hex) || raceDis);
}
```

В `dexSaveBlast` (`src/abilities/shared.js`, импорт `saveModeFor`) заменить бросок спаса:

```js
    const nat = attackRoll(ctx.rng, saveModeFor(ctx, t, 'dex'));
```

- [ ] **Step 5: Пайплайн**

`src/modifiers.js`, после `addInspiration`:

```js
// (1c) Могучий (голиаф): +1д4 к физическому урону первой цели, которой он нанесён.
function addMighty(packets, ctx) {
  if (!ctx.mods.mighty) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0 && categoryOf(p.type) === 'physical'));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'physical', amount: sumDice(1, 4, ctx.rng, ctx.mods.orcReroll) }];
  return packets;
}
```

Комментарий Руны стихий перенумеровать в `(1d)`. В `applyPipeline` после `addInspiration`: `p = addMighty(p, ctx);`.

- [ ] **Step 6: Тумблер**

`src/ui-logic.js`, `modifierRelevance`:

```js
    mighty: !!(RACES[c.raceKey] && RACES[c.raceKey].mighty) && ability.category === 'physical',
```

`defaultState().mods` — `mighty: false`.

`src/ui.js`: тумблер перед `rabbitFoot`

```js
      ['mighty', 'Могучий (+д4 физ.)', 'голиаф: докинуть д4 к нанесённому физическому урону (4 раза в день)'],
```

и в `baseCtx().mods`: `mighty: !!(rel.mighty && state.mods.mighty),`.

- [ ] **Step 7: Прогнать всё**

Run: `npm test`
Expected: PASS, включая инвариант. Если инвариант покажет `mighty @ <способность>` — у неё категория `physical`, но физических пакетов нет: сузить условие relevance для неё, а не ослаблять проверку.

- [ ] **Step 8: Commit**

```bash
git add src/characters.js src/engine.js src/abilities/shared.js src/modifiers.js src/ui-logic.js src/ui.js test/characters.test.js test/modifiers.test.js test/abilities.test.js test/relevance.test.js
git commit -m "feat: раса Голиафы — Могучий и помеха к спасброскам Ловкости"
```

### Task 9: Дампиры — Вампиризм

**Files:**
- Modify: `src/characters.js`, `src/abilities/racial.js`
- Test: `test/racial.test.js`, `test/characters.test.js`

**Interfaces:**
- Consumes: `isHitWithTalent(ctx, nat, bonus, ac)`, `d20(rng)` из `src/engine.js`.
- Produces: `RACES.dhampir`; способность `id: 'dhampirBite'`.

- [ ] **Step 1: Тесты**

`test/racial.test.js` (импорт `availableAbilities` из `../src/ui-logic.js`):

```js
const dex2 = { str: 0, dex: 2, con: 0, wis: 0, int: 0, cha: 0 };

test('dhampirBite: проверка Ловкости 12 пройдена -> 1d6 физ', () => {
  // nat 11 +2 = 13 >= 12; 1d6 0.99 -> 6
  const p = get('dhampirBite').simulateOnce(ctx({ rng: seqRng([0.5, 0.99]), stats: dex2 }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]);
});

test('dhampirBite: провал проверки — без урона', () => {
  // nat 9 +2 = 11 < 12
  const p = get('dhampirBite').simulateOnce(ctx({ rng: seqRng([0.4]), stats: dex2 }));
  assert.deepEqual(p, [[]]);
});

test('dhampirBite: Талант дотягивает проверку', () => {
  const c = ctx({ rng: seqRng([0.4, 0.99]), stats: dex2 });
  c.talent = { left: 1, tally: [] };
  const p = get('dhampirBite').simulateOnce(c);
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]); // 9+3+2 = 14
  assert.equal(c.talent.left, 0);
});

test('Вампиризм доступен только дампиру', () => {
  const ids = (raceKey) => availableAbilities({ classKey: 'warrior', raceKey, game: 1 }).map((a) => a.id);
  assert.ok(ids('dhampir').includes('dhampirBite'));
  assert.ok(!ids('elf').includes('dhampirBite'));
});
```

`test/characters.test.js`:

```js
test('Дампир: без правок статов и здоровья', () => {
  assert.equal(RACES.dhampir.name, 'Дампир');
  assert.deepEqual(computePreset('dhampir', 'rogue', 1), { ac: 12, hp: 15, saves: { str: -2, dex: 4, con: -1, wis: 2, int: 0, cha: 1 } });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test test/racial.test.js test/characters.test.js`
Expected: FAIL — `get('dhampirBite')` undefined.

- [ ] **Step 3: Раса**

`src/characters.js`, после `goliath`:

```js
  // Слабость «Нежить» (лечение ранит) вне модели урона.
  dhampir:    { name: 'Дампир',           hpMod: 0,  acMod: 0, statMods: {} },
```

- [ ] **Step 4: Способность**

`src/abilities/racial.js`, импорт: `import { sumDice, talentTally, d20, isHitWithTalent } from '../engine.js';`. В конец `RACIAL_ABILITIES`:

```js
  {
    id: 'dhampirBite', name: 'Вампиризм', raceKey: 'dhampir', classKey: null,
    minGame: 1, choiceGroup: null, charges: 'бонусное действие', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      // Схватить — проверка «ловкость — 12»; это не атака, поэтому крит только на 20,
      // но Талант может её дотянуть. Затем 1д6 урона цели (лечение себе вне модели).
      const out = empty(ctx.targets.length);
      const check = { ...ctx, critRange: 20, fumbleRange: 1 };
      const { hit } = isHitWithTalent(check, d20(ctx.rng), ctx.attackBonus('dex'), 12);
      if (hit) out[ctx.params.target ?? 0].push({ type: 'physical', amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll, talentTally(ctx)) });
      return out;
    },
  },
```

(`{ ...ctx }` копирует ссылку на `ctx.talent`, поэтому расход заряда виден в исходном `ctx`.)

- [ ] **Step 5: Прогнать всё** — Run: `npm test` → Expected: PASS, включая инвариант.

- [ ] **Step 6: Commit**

```bash
git add src/characters.js src/abilities/racial.js test/racial.test.js test/characters.test.js
git commit -m "feat: раса Дампиры — Вампиризм"
```

### Task 10: Чародей — класс и стартовые способности

**Files:**
- Create: `src/abilities/sorcerer.js`, `test/sorcerer.test.js`
- Modify: `src/characters.js:4-17`, `src/abilities/index.js`
- Test: `test/characters.test.js`

**Interfaces:**
- Consumes: `dexSaveBlast(ctx, out, nDice, type)` (Task 5, с помехой голиафу из Task 8); `attackOnce`, `resolveModeFor`, `rollDie`, `d20`, `talentTally` из `src/engine.js`.
- Produces: `CLASSES.sorcerer`; `SORCERER_ABILITIES` с id `magicDaggers`, `flame`, `flash`.

- [ ] **Step 1: Тесты**

`test/sorcerer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { availableAbilities } from '../src/ui-logic.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const sctx = (over) => {
  const stats = { str: -2, dex: 1, con: 0, wis: 0, int: 3, cha: 2 };
  return {
    rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20, fumbleRange: 1,
    weapon: { dice: '1d4', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99, saves: { dex: 0 } }],
    mods: { orcReroll: false, adv: false, dis: false, hex: false, ...(over.mods || {}) },
    params: over.params || {},
  };
};

test('Магические кинжалы: 4 атаки по одной цели без распределения', () => {
  const r = [];
  for (let k = 0; k < 4; k++) r.push(0.5, 0.99); // nat 11 +3 >= 10, д8 = 8
  const p = get('magicDaggers').simulateOnce(sctx({ rng: seqRng(r) }));
  assert.deepEqual(p, [[8, 8, 8, 8].map((amount) => ({ type: 'magic', amount }))]);
});

test('Магические кинжалы: крит удваивает д8, промахи без урона', () => {
  const p = get('magicDaggers').simulateOnce(sctx({ rng: seqRng([0.99, 0.99, 0.99, 0, 0, 0]) }));
  assert.deepEqual(p, [[{ type: 'magic', amount: 16 }]]);
});

test('Магические кинжалы: распределение по двум целям', () => {
  const t = { ac: 10, hp: 99, saves: { dex: 0 } };
  const r = [];
  for (let k = 0; k < 4; k++) r.push(0.5, 0.99);
  const p = get('magicDaggers').simulateOnce(sctx({ rng: seqRng(r), targets: [t, t], params: { distribute: [1, 1, 0, 1] } }));
  assert.equal(p[0].length, 1);
  assert.equal(p[1].length, 3);
});

test('Пламя: д20 15+ -> 6д6, провал спаса — полный урон', () => {
  // порог 0.7 -> 15; спас 0 -> 1 провал; 6×6 = 36
  const p = get('flame').simulateOnce(sctx({ rng: seqRng([0.7, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }]]);
});

test('Пламя: д20 ниже 15 -> 3д6, успех спаса — половина', () => {
  // порог 0.5 -> 11; спас 0.99 -> 20; 3×6 = 18 -> 9
  const p = get('flame').simulateOnce(sctx({ rng: seqRng([0.5, 0.99, 0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 9 }]]);
});

test('Пламя: урон один на всех целях', () => {
  const t = { ac: 10, hp: 99, saves: { dex: 0 } };
  // порог 11 -> 3д6; спасы: провал, успех; один бросок 3д6 = 18
  const p = get('flame').simulateOnce(sctx({ rng: seqRng([0.5, 0, 0.99, 0.99, 0.99, 0.99]), targets: [t, t] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 18 }], [{ type: 'fire', amount: 9 }]]);
});

test('Пламя: Талант поднимает 12–14 до 6д6', () => {
  const c = sctx({ rng: seqRng([0.6, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]) }); // порог 13
  c.talent = { left: 1, tally: [] };
  const p = get('flame').simulateOnce(c);
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }]]);
  assert.equal(c.talent.left, 0);
});

test('Вспышка: ровно 5 магии каждой цели', () => {
  const t = { ac: 10, hp: 99 };
  const p = get('flash').simulateOnce(sctx({ rng: seqRng([]), targets: [t, t] }));
  assert.deepEqual(p, [[{ type: 'magic', amount: 5 }], [{ type: 'magic', amount: 5 }]]);
});

test('Чародею 1-й игры доступны кинжалы, пламя, вспышка и атака кинжалом', () => {
  const ids = availableAbilities({ classKey: 'sorcerer', raceKey: 'elf', game: 1 }).map((a) => a.id);
  assert.deepEqual(ids.sort(), ['basicAttack', 'flame', 'flash', 'magicDaggers']);
});
```

`test/characters.test.js`:

```js
test('Чародей: таблица класса из правил', () => {
  assert.deepEqual(CLASSES.sorcerer, {
    name: 'Чародей', ac: 12, hp: 20, dice: '1d4', weaponStat: 'dex',
    stats: { str: -2, dex: 1, con: 0, wis: 0, int: 3, cha: 2 },
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test test/sorcerer.test.js test/characters.test.js`
Expected: FAIL — способностей нет.

- [ ] **Step 3: Класс**

`src/characters.js`, в `CLASSES` после `monk`:

```js
  sorcerer:   { name: 'Чародей',      ac: 12, hp: 20, dice: '1d4',  weaponStat: 'dex', stats: { str: -2, dex: 1,  con: 0,  wis: 0,  int: 3,  cha: 2  } },
```

- [ ] **Step 4: Способности — `src/abilities/sorcerer.js`**

```js
import { rollDie, d20, attackOnce, resolveModeFor, talentTally } from '../engine.js';
import { dexSaveBlast } from './shared.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const SORCERER_ABILITIES = [
  {
    id: 'magicDaggers', name: 'Магические кинжалы', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'area',
    usesAttackRoll: true, usesSave: false, category: 'magic',
    params: [{ id: 'distribute', kind: 'distribute', label: 'Кинжалы по целям', count: 4, default: null }],
    simulateOnce(ctx) {
      // 4 дальнобойные атаки «д20+Интеллект» по д8 магии; притягивание и телепорт вне модели урона.
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      const plan = ctx.params.distribute || Array.from({ length: 4 }, (_, i) => i % n);
      plan.forEach((t, k) => {
        const mode = resolveModeFor(ctx.mods.adv, ctx.mods.dis, ctx.targets[t]);
        const { hit, crit } = attackOnce(ctx, ctx.attackBonus('int'), ctx.targets[t].ac, mode, k === 0);
        if (!hit) return;
        const die = () => rollDie(8, ctx.rng, ctx.mods.orcReroll, talentTally(ctx));
        out[t].push({ type: 'magic', amount: crit ? die() + die() : die() });
      });
      return out;
    },
  },
  {
    id: 'flame', name: 'Пламя', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'magic', params: [],
    simulateOnce(ctx) {
      // Один д20 на заклинание: 1–14 → 3д6, 15–20 → 6д6; дальше — область со спасом Ловкости.
      let nat = d20(ctx.rng);
      // Талант дотягивает 12–14 до порога: это +3д6, больше любой прибавки к кубу урона.
      if (nat >= 12 && nat < 15 && ctx.talent && ctx.talent.left > 0) { ctx.talent.left -= 1; nat += 3; }
      return dexSaveBlast(ctx, empty(ctx.targets.length), nat >= 15 ? 6 : 3, 'fire');
    },
  },
  {
    id: 'flash', name: 'Вспышка', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: '1 раз в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    fixedDamage: true, // ровно 5 каждой цели — Таланту не к чему приложиться
    params: [],
    simulateOnce(ctx) {
      // Все цели считаются стоящими с вами в ближнем бою; невидимость вне модели урона.
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'magic', amount: 5 });
      return out;
    },
  },
];
```

`src/abilities/index.js`: `import { SORCERER_ABILITIES } from './sorcerer.js';` и `...SORCERER_ABILITIES,` в `ABILITIES`.

- [ ] **Step 5: Прогнать всё** — Run: `npm test` → Expected: PASS, включая инвариант.

- [ ] **Step 6: Commit**

```bash
git add src/characters.js src/abilities/sorcerer.js src/abilities/index.js test/sorcerer.test.js test/characters.test.js
git commit -m "feat: класс Чародей — Магические кинжалы, Пламя, Вспышка"
```

### Task 11: Чародей — выбор 12-й игры и Адепт дикой магии

**Files:**
- Modify: `src/abilities/sorcerer.js`, `src/ui-logic.js` (GAME12)
- Test: `test/sorcerer.test.js`, `test/ui-logic.test.js`

**Interfaces:**
- Consumes: `dexSaveBlast` (Task 5), `SORCERER_ABILITIES` (Task 10).
- Produces: id выборов `'wildAdept'`, `'saturation'`; способность `wildAdept` с `choiceGroup: 'game12'`.

- [ ] **Step 1: Тесты**

`test/sorcerer.test.js`:

```js
test('Адепт дикой магии: грань 1 -> 10 излучением всем', () => {
  const t = { ac: 10, hp: 99, saves: { dex: 0 } };
  const p = get('wildAdept').simulateOnce(sctx({ rng: seqRng([0]), targets: [t, t] }));
  assert.deepEqual(p, [[{ type: 'radiant', amount: 10 }], [{ type: 'radiant', amount: 10 }]]);
});

test('Адепт дикой магии: грань 2 -> огненный шар 6д6 со спасом', () => {
  // грань 0.2 -> 2; спас 0 -> провал; 6×6 = 36
  const p = get('wildAdept').simulateOnce(sctx({ rng: seqRng([0.2, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }]]);
});

test('Адепт дикой магии: грани 3–6 урона не дают', () => {
  const p = get('wildAdept').simulateOnce(sctx({ rng: seqRng([0.5]) }));
  assert.deepEqual(p, [[]]);
});

test('Адепт доступен только при выборе на 12-й игре', () => {
  const ids = (game12Choice) => availableAbilities({ classKey: 'sorcerer', raceKey: 'elf', game: 12, game12Choice }).map((a) => a.id);
  assert.ok(ids('wildAdept').includes('wildAdept'));
  assert.ok(!ids('saturation').includes('wildAdept'));
});
```

`test/ui-logic.test.js`:

```js
test('GAME12_CHOICES: у чародея Адепт и Насыщение магией', () => {
  assert.deepEqual(GAME12_CHOICES.sorcerer.map((x) => x.id), ['wildAdept', 'saturation']);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test test/sorcerer.test.js test/ui-logic.test.js`
Expected: FAIL.

- [ ] **Step 3: Способность**

В конец `SORCERER_ABILITIES`:

```js
  {
    id: 'wildAdept', name: 'Адепт дикой магии', classKey: 'sorcerer',
    minGame: 12, choiceGroup: 'game12', charges: 'действие', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'magic', params: [],
    simulateOnce(ctx) {
      // д6 дикой магии вокруг выбранной цели; урон дают только две грани:
      // 1 — 10 излучением всем в области; 2 — огненный шар (6д6, спас «ловкость — 15»).
      // 3–6 — заморозка, лечение, бафф и телепорт — вне модели урона.
      const out = empty(ctx.targets.length);
      const face = rollDie(6, ctx.rng, false);
      if (face === 1) for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'radiant', amount: 10 });
      if (face === 2) dexSaveBlast(ctx, out, 6, 'fire');
      return out;
    },
  },
```

- [ ] **Step 4: GAME12**

`src/ui-logic.js`, в `GAME12_CHOICES` после `necromancer`:

```js
  sorcerer:  [{ id: 'wildAdept', name: 'Адепт дикой магии' }, { id: 'saturation', name: 'Насыщение магией' }],
```

- [ ] **Step 5: Прогнать всё** — Run: `npm test` → Expected: PASS, включая инвариант.

- [ ] **Step 6: Commit**

```bash
git add src/abilities/sorcerer.js src/ui-logic.js test/sorcerer.test.js test/ui-logic.test.js
git commit -m "feat: выбор 12-й игры чародея и Адепт дикой магии"
```

### Task 12: Проверка в собранном приложении

**Files:** без изменений кода, если проверка проходит.

- [ ] **Step 1: Сборка**

Run: `node build.js`
Expected: без ошибок, обновлён `dnd-dmg.html` (в `.gitignore`, не коммитится).

- [ ] **Step 2: Ручная проверка в браузере (Playwright)**

Открыть `file://<repo>/dnd-dmg.html` и проверить:
1. В «Классе» есть Чародей. На 1-й игре видны Магические кинжалы, Пламя и Вспышка. На 12-й игре есть выбор «Адепт / Насыщение», при выборе Адепта появляется способность.
2. В «Расе» есть Голиаф и Дампир. У голиафа-воина на базовой атаке есть тумблер «Могучий», и при его включении среднее растёт. У дампира в списке есть Вампиризм.
3. Цель с пресетом «Голиаф» под Огненным шаром получает больше урона, чем та же цель-эльф.
4. Некромант 12-й игры: в выборе есть Губитель, на атаке оружием есть тумблер, при включении среднее растёт.
5. Бард 12-й игры, Очарованный клинок: в списке есть «Удар очарованным клинком», на нём видны оба зелья, в разбивке урона есть и физическая, и магическая часть.
6. Воин 12-й игры, Слабое место: подпись «крит 19–20».
7. В консоли браузера нет ошибок.

- [ ] **Step 3: Итог**

Если всё совпало — коммитов нет, работа готова к пушу (пушить только по слову пользователя: пуш в `main` деплоит Pages). Если найден дефект — исправить в задаче, к которой он относится, с тестом, и отдельным `fix:` коммитом.
