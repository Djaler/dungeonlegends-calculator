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
