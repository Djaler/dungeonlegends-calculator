import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => ({ rng: over.rng, stats: over.stats ?? {str:0,dex:0,con:0,wis:0,int:0,cha:0},
  attackBonus:(s)=>(over.stats?over.stats[s]:0), critRange:20, weapon:{dice:'1d6',stat:'dex'},
  targets: over.targets ?? [{ac:12,hp:30}], mods:{orcReroll:false,...(over.mods||{})}, params: over.params||{} });

test('dragonbornBreath: 2d6 огнём по всем целям', () => {
  const p = get('dragonbornBreath').simulateOnce(ctx({ rng: seqRng([0.99,0.99, 0.99,0.99]), targets:[{ac:12,hp:30},{ac:12,hp:30}] }));
  assert.deepEqual(p, [[{type:'fire',amount:12}],[{type:'fire',amount:12}]]);
});
test('dwarfHeadbutt: ровно 6 физ по выбранной цели', () => {
  const p = get('dwarfHeadbutt').simulateOnce(ctx({ rng: seqRng([]), targets:[{ac:12,hp:30},{ac:12,hp:30}], params:{target:1} }));
  assert.deepEqual(p, [[],[{type:'physical',amount:6}]]);
});
test('tieflingRetribution: 1d8 огнём', () => {
  const p = get('tieflingRetribution').simulateOnce(ctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[{type:'fire',amount:8}]]);
});
