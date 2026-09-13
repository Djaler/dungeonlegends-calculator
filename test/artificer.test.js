import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find(a => a.id === id);
const actx = (over) => {
  const stats = over.stats ?? { str: -1, dex: 2, con: 0, wis: 0, int: 4, cha: -1 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: 20,
    weapon: { dice: '2d8', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false, ...(over.mods || {}) },
    params: over.params || {},
  };
};

test('Аргумент усиленный: 2d8+dex при попадании', () => {
  // nat 0.5 (=11, +2>=10 hit); 2d8 (0.99,0.99)=16 + dex 2 = 18
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99, 0.99]), params: { ammo: 'усиленный', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 18 }]]);
});

test('Аргумент гарпун: 1d4+dex', () => {
  // 1d4 (0.99)=4 + dex 2 = 6
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { ammo: 'гарпун', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]);
});

test('Огнемёт: 2d6 огнём по всем', () => {
  const p = get('flamethrower').simulateOnce(actx({ rng: seqRng([0.99, 0.99]), targets: [{ ac: 10, hp: 99 }] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 12 }]]);
});

test('Нестабильный: д4=1 -> 2d4 огнём', () => {
  // д4 нота: rollDie(4) 0->1 (попадание в ветку 1). затем 2d4 (0.99,0.99)=8
  const p = get('unstableArgument').simulateOnce(actx({ rng: seqRng([0, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 8 }]]);
});

test('Нестабильный: д4=2 -> нет урона', () => {
  // rollDie(4): 0.5 -> 3 (ветка без урона)
  const p = get('unstableArgument').simulateOnce(actx({ rng: seqRng([0.5]) }));
  assert.deepEqual(p, [[]]);
});
