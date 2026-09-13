import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAbility, pAtLeast, killChance, compareAbilities } from '../src/simulator.js';
import { seqRng } from './helpers.js';

const baseCtx = (over) => ({
  attackBonus: 4,
  critRange: 20,
  targets: over?.targets ?? [{ ac: 12, hp: 30 }],
  targetDexSave: over?.targetDexSave ?? 0,
  mods: {
    adv: false, dis: false, concentration: false, chaos: false,
    hex: false, orcReroll: false, rage: false,
    ...(over?.mods || {}),
  },
  params: {},
});

test('runAbility агрегирует среднее (детерминированное авто-попадание)', () => {
  // simulateOnce returns per-target array of packets: [[{type,amount}]]
  const fakeAbility = {
    id: 'x', name: 'X', charges: '',
    simulateOnce: (ctx) => ctx.targets.map(() => [{ type: 'physical', amount: 1 }]),
  };
  const m = runAbility(fakeAbility, baseCtx(), { trials: 1000, seed: 7 });
  assert.equal(m.groupMean, 1);
  assert.equal(m.trials, 1000);
});

test('runAbility считает killCount и killChance', () => {
  const ability = {
    id: 'k', name: 'K', charges: '',
    simulateOnce: () => [[{ type: 'physical', amount: 100 }]],
  };
  const m = runAbility(ability, baseCtx({ targets: [{ ac: 12, hp: 30 }] }), { trials: 50, seed: 1 });
  assert.equal(m.killCount[0], 50);
  assert.equal(killChance(m, 0), 1);
});

const fixed = (id, amount) => ({ id, name: id, charges: '', simulateOnce: () => [[{ type: 'physical', amount }]] });

test('Решительность: второе действие добавляет половину своего урона (вниз)', () => {
  // основное 10, второе действие 7 -> 10 + floor(7/2)=3 -> 13
  const m = runAbility(fixed('main', 10), baseCtx(), { trials: 10, seed: 3, resolveAbility: fixed('second', 7) });
  assert.equal(m.groupMean, 13);
});

test('Решительность: без второго действия урон прежний', () => {
  const m = runAbility(fixed('main', 10), baseCtx(), { trials: 10, seed: 3 });
  assert.equal(m.groupMean, 10);
});

test('Решительность: вторым действием может быть та же способность', () => {
  let calls = 0;
  const ability = { id: 'r3', name: 'R3', charges: '', simulateOnce: () => { calls++; return [[]]; } };
  runAbility(ability, baseCtx(), { trials: 5, seed: 1, resolveAbility: ability });
  assert.equal(calls, 10);
});

test('Решительность: второе действие получает свои параметры', () => {
  let seen = null;
  const second = { id: 's', name: 'S', charges: '', simulateOnce: (ctx) => { seen = ctx.params; return [[]]; } };
  runAbility(fixed('main', 1), baseCtx(), { trials: 1, seed: 1, resolveAbility: second, resolveParams: { target: 1 } });
  assert.deepEqual(seen, { target: 1 });
});

test('Решительность: killCount учитывает оба действия', () => {
  const main = fixed('main', 20);
  const hit = runAbility(main, baseCtx({ targets: [{ ac: 12, hp: 30 }] }), { trials: 20, seed: 1, resolveAbility: fixed('s', 20) });
  assert.equal(hit.killCount[0], 20); // 20 + 10 = 30 >= 30
  const miss = runAbility(main, baseCtx({ targets: [{ ac: 12, hp: 30 }] }), { trials: 20, seed: 1 });
  assert.equal(miss.killCount[0], 0);
});

test('Талант в прогоне: поднимает низший куб урона и обновляется каждый ход', async () => {
  const { ABILITIES } = await import('../src/abilities/index.js');
  const fb = ABILITIES.find((x) => x.id === 'fireball');
  const ctxFor = (talent) => ({
    ...baseCtx({ targets: [{ ac: 10, hp: 999, saves: { dex: -20 } }] }),
    stats: { int: 0 }, attackBonus: () => 0, critRange: 20, fumbleRange: 1,
    weapon: { dice: '1d4', stat: 'dex' },
    mods: { ...baseCtx({}).mods, talent },
  });
  const off = runAbility(fb, ctxFor(false), { trials: 20000, seed: 5 });
  const on = runAbility(fb, ctxFor(true), { trials: 20000, seed: 5 });
  const gain = on.groupMean - off.groupMean;
  // Талант каждый ход поднимает самый низкий из 6д6: почти всегда полные +3
  assert.ok(gain > 2.5 && gain < 3.05, `прирост ${gain.toFixed(2)} вне ожидаемого 2.5..3.05`);
});

test('runAbility отдаёт распределение по каждой цели', () => {
  // две цели с фиксированным уроном 7 и 3 -> у каждой свой одноточечный freq
  const ability = {
    id: 'tf', name: 'TF', charges: '',
    simulateOnce: () => [
      [{ type: 'physical', amount: 7 }],
      [{ type: 'physical', amount: 3 }],
    ],
  };
  const m = runAbility(ability, baseCtx({ targets: [{ ac: 12, hp: 99 }, { ac: 12, hp: 99 }] }), { trials: 100, seed: 1 });
  assert.equal(m.targetFreq.length, 2);
  assert.equal(m.targetFreq[0].get(7), 100);
  assert.equal(m.targetFreq[1].get(3), 100);
});

test('pAtLeast возвращает долю прогонов', () => {
  const ability = {
    id: 'c', name: 'C', charges: '',
    simulateOnce: () => [[{ type: 'physical', amount: 10 }]],
  };
  const m = runAbility(ability, baseCtx(), { trials: 100, seed: 1 });
  assert.equal(pAtLeast(m.groupFreq, m.trials, 10), 1);
  assert.equal(pAtLeast(m.groupFreq, m.trials, 11), 0);
});

test('compareAbilities сортирует по среднему урону убыв', () => {
  const a = { id: 'a', name: 'A', charges: '', simulateOnce: () => [[{ type: 'physical', amount: 5 }]] };
  const b = { id: 'b', name: 'B', charges: '', simulateOnce: () => [[{ type: 'physical', amount: 20 }]] };
  const rows = compareAbilities([a, b], baseCtx(), { trials: 10, seed: 1 });
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
});

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

test('Монте-Карло огненного шара близок к ожидаемому среднему', async () => {
  const { ABILITIES } = await import('../src/abilities/index.js');
  const fb = ABILITIES.find((x) => x.id === 'fireball');
  // одна цель, dex save bonus = 0 (нужно >=15 -> шанс провала высокий)
  const m = runAbility(fb, baseCtx({ targets: [{ ac: 10, hp: 999 }] }), { trials: 50000, seed: 123 });
  // грубая вилка: среднее в диапазоне 17..27 (теоретическое ≈17.46: 70%*21 + 26%*10.5)
  assert.ok(m.groupMean > 17 && m.groupMean < 27, `mean=${m.groupMean}`);
});
