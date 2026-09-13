import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: 4, dex: 1, con: 2, wis: -1, int: -2, cha: 0 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: { dice: '1d12', stat: 'str' }, targets: over.targets ?? [{ ac: 10, hp: 99, saves: { dex: 0 } }],
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
