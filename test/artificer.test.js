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
    weapon: { dice: '1d8', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false, ...(over.mods || {}) },
    params: over.params || {},
  };
};

test('Аргумент усиленный: 1d8+dex при попадании', () => {
  // nat 0.5 (=11, +2>=10 hit); 1d8 (0.99)=8 + dex 2 = 10
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { ammo: 'усиленный', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 10 }]]);
});

test('Аргумент гарпун: 1d4+dex', () => {
  // 1d4 (0.99)=4 + dex 2 = 6
  const p = get('argument').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { ammo: 'гарпун', target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]);
});

test('Силовой болт: 1d6+dex при попадании', () => {
  // nat 0.5 (=11, +2>=10 hit); 1d6 (0.99)=6 + dex 2 = 8
  const p = get('forceBolt').simulateOnce(actx({ rng: seqRng([0.5, 0.99]), params: { target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 8 }]]);
});

test('Силовой болт: крит удваивает куб', () => {
  // nat 20 (0.99) -> крит; 1d6+1d6 (0.99,0.99)=12 + dex 2 = 14
  const p = get('forceBolt').simulateOnce(actx({ rng: seqRng([0.99, 0.99, 0.99]), params: { target: 0 } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 14 }]]);
});

test('Силовой болт: промах — нет пакета', () => {
  // nat 1 (0) -> промах, кубы урона не бросаются
  const p = get('forceBolt').simulateOnce(actx({ rng: seqRng([0]), params: { target: 0 } }));
  assert.deepEqual(p, [[]]);
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
