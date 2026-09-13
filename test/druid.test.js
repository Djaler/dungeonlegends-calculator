import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const dctx = (over) => {
  const stats = over.stats ?? { str: 2, dex: 2, con: 0, wis: 2, int: 0, cha: -2 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: 20,
    weapon: { dice: '1d4', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false, beastRage: false, ...(over.mods || {}) },
    params: over.params || {},
  };
};

test('Медведь: 2 атаки d10+Сила', () => {
  // 2 атаки: nat 0.5 (=11 hit, +2>=10), d10 0.99->10 +2 =12 каждая
  const p = get('beastForm').simulateOnce(dctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]), params: { form: 'bear', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 12 }, { type: 'physical', amount: 12 }]]);
});

test('Змея: 1 атака d6+Ловкость', () => {
  const p = get('beastForm').simulateOnce(dctx({ rng: seqRng([0.5, 0.99]), params: { form: 'snake', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 8 }]]); // d6 0.99->6 +2(dex)
});

test('Ярость зверя: медведь d12', () => {
  const p = get('beastForm').simulateOnce(dctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]), mods: { beastRage: true }, params: { form: 'bear', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 14 }, { type: 'physical', amount: 14 }]]); // d12 0.99->12 +2
});

test('thornPath: 3d6 по всем целям', () => {
  const p = ABILITIES.find(a => a.id === 'thornPath').simulateOnce(dctx({ rng: seqRng([0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 18 }]]);
});
