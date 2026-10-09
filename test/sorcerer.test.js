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
