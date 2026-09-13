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

test('Танец: атака по цели, урон делится пополам', () => {
  // атака nat 0.5 (=11, +4>=10 попал); урон d12 0.99->12 +4 =16; половина =8
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0.5, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 8 }]]);
});

test('Танец: промах не даёт пакета', () => {
  // nat 1 (0) -> промах; кубы урона не бросаются
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0]) }));
  assert.deepEqual(p, [[]]);
});

test('Танец: по одной атаке на каждую цель в области', () => {
  // на цель по паре бросков: атака 0.5, урон 0.99 -> (12+4)/2 =8
  const p = get('deathDance').simulateOnce(ctx({
    rng: seqRng([0.5, 0.99, 0.5, 0.99]),
    targets: [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }],
  }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 8 }], [{ type: 'physical', amount: 8 }]]);
});

test('Танец: крит удваивает кубы оружия, затем половина', () => {
  // nat 20 (0.99) -> крит; d12+d12 (0.99,0.99)=24 +4 =28; половина =14
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 14 }]]);
});

test('Танец: ярость варвара удваивает Силу до деления пополам', () => {
  // атака nat 11 (+8); урон d12 0.99->12 + 4*2 =20; половина =10
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0.5, 0.99]), mods: { barbRage: true } }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 10 }]]);
});

test('Танец: нечётный урон округляется вниз', () => {
  // урон d12 0.5->7 +4 =11; половина = floor(5.5) =5
  const p = get('deathDance').simulateOnce(ctx({ rng: seqRng([0.5, 0.5]) }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 5 }]]);
});
