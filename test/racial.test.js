import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';
import { availableAbilities } from '../src/ui-logic.js';
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

test('dragonbornBreath: 2d6 кидается один раз на все цели', () => {
  // 6 + 4 = 10 обеим; при броске на каждую цель seqRng исчерпался бы
  const p = get('dragonbornBreath').simulateOnce(ctx({ rng: seqRng([0.99, 0.5]), targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 10 }], [{ type: 'fire', amount: 10 }]]);
});

const dex2 = { str: 0, dex: 2, con: 0, wis: 0, int: 0, cha: 0 };

test('dhampirBite: проверка Ловкости 12 пройдена -> 1d6 физ', () => {
  // nat 11 +2 = 13 >= 12; 1d6 0.99 -> 6
  const p = get('dhampirBite').simulateOnce(ctx({ rng: seqRng([0.5, 0.99]), stats: dex2 }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]);
});

test('dhampirBite: провал проверки — без урона', () => {
  // nat 9 +2 = 11 < 12
  const p = get('dhampirBite').simulateOnce(ctx({ rng: seqRng([0.4]), stats: dex2 }));
  assert.deepEqual(p, [[]]);
});

test('dhampirBite: Талант дотягивает проверку', () => {
  const c = ctx({ rng: seqRng([0.4, 0.99]), stats: dex2 });
  c.talent = { left: 1, tally: [] };
  const p = get('dhampirBite').simulateOnce(c);
  assert.deepEqual(p, [[{ type: 'physical', amount: 6 }]]); // 9+3+2 = 14
  assert.equal(c.talent.left, 0);
});

test('Вампиризм доступен только дампиру', () => {
  const ids = (raceKey) => availableAbilities({ classKey: 'warrior', raceKey, game: 1 }).map((a) => a.id);
  assert.ok(ids('dhampir').includes('dhampirBite'));
  assert.ok(!ids('elf').includes('dhampirBite'));
});
