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
