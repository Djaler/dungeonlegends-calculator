import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: 0, dex: 3, con: 3, wis: 0, int: -1, cha: -1 };
  return { rng: over.rng, stats, attackBonus: (s) => stats[s], critRange: 20,
    weapon: over.weapon ?? { dice: '1d4', stat: 'dex' }, targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll:false, adv:false, dis:false, typeOverride:undefined, smiteDice:0, acIgnore:0, ...(over.mods||{}) },
    params: over.params || {} };
};

test('Шквал: число атак = Стойкость (3), куб 1д4 + Ловкость', () => {
  // con=3 -> 3 атаки; каждая nat 0.5(=11 hit,+3>=10), d4 0.99->4 +3 =7
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99, 0.5,0.99, 0.5,0.99]) }));
  assert.deepEqual(p, [[{type:'physical',amount:7},{type:'physical',amount:7},{type:'physical',amount:7}]]);
});

test('Шквал: Усиление Ци => куб 1д6', () => {
  // weapon dice 1d6; con=1 -> 1 атака; nat 0.5 hit, d6 0.99->6 +3 =9
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99]), stats:{str:0,dex:3,con:1,wis:0,int:-1,cha:-1}, weapon:{dice:'1d6',stat:'dex'} }));
  assert.deepEqual(p, [[{type:'physical',amount:9}]]);
});

test('Шквал: бесконтактный бой делает урон magic', () => {
  const p = get('flurry').simulateOnce(ctx({ rng: seqRng([0.5,0.99]), stats:{str:0,dex:3,con:1,wis:0,int:-1,cha:-1}, mods:{ typeOverride:'magic' } }));
  assert.deepEqual(p, [[{type:'magic',amount:7}]]);
});
