// test/characters.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, RACES, deriveStats, computePreset } from '../src/characters.js';

test('CLASSES: волшебник имеет полный набор статов и оружие посох(dex)', () => {
  const w = CLASSES.wizard;
  assert.equal(w.dice, '1d4');
  assert.equal(w.weaponStat, 'dex');
  assert.deepEqual(w.stats, { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 });
});

test('CLASSES: изобретатель — броня 15, здоровье 15, арбалет 1д8(dex)', () => {
  const a = CLASSES.artificer;
  assert.equal(a.ac, 15);
  assert.equal(a.hp, 15);
  assert.equal(a.dice, '1d8');
  assert.equal(a.weaponStat, 'dex');
  assert.deepEqual(a.stats, { str: -1, dex: 2, con: 0, wis: 0, int: 4, cha: -1 });
});

test('deriveStats: орк-волшебник на 1 игре = база класса + расовые правки', () => {
  // орк не меняет статы (statMods пуст); дварф бы дал dex-1
  assert.deepEqual(deriveStats('wizard', 'orc', 1),
    { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 });
});

test('deriveStats: дварф даёт -1 к ловкости', () => {
  assert.equal(deriveStats('wizard', 'dwarf', 1).dex, -1);
});

test('deriveStats: на 8 игре +1 к двум наивысшим статам по умолчанию', () => {
  // волшебник: наивысшие int(4), wis(2) -> станут 5 и 3
  const s = deriveStats('wizard', 'orc', 8);
  assert.equal(s.int, 5);
  assert.equal(s.wis, 3);
  assert.equal(s.cha, 1); // остальные без изменений
});

test('deriveStats: bumps переопределяет, к каким статам идёт +1', () => {
  const s = deriveStats('wizard', 'orc', 8, ['str', 'dex']);
  assert.equal(s.str, -1);
  assert.equal(s.dex, 1);
  assert.equal(s.int, 4); // не тронут
});

test('deriveStats: до 8 игры приростов нет', () => {
  assert.deepEqual(deriveStats('wizard', 'orc', 7), deriveStats('wizard', 'orc', 1));
});

test('computePreset: орк-варвар на 8 игре = hp 30 +5(орк) +5+5(вехи 4,8)', () => {
  const p = computePreset('orc', 'barbarian', 8);
  assert.equal(p.hp, 45);
  assert.equal(p.ac, 10);
});

test('deriveStats: +1 на 8 игре берёт две наивысшие из фактических статов (с расовыми правками)', () => {
  // дварф-следопыт: базы dex+3, wis+3; расовая правка dex-1 -> dex 2, wis 3.
  // две наивысшие фактические: wis(3) и dex(2) -> станут wis 4, dex 3.
  const s = deriveStats('ranger', 'dwarf', 8);
  assert.equal(s.wis, 4);
  assert.equal(s.dex, 3);
  assert.equal(s.con, 1); // не тронут
});

test('RACES: правила цели по категориям', () => {
  assert.deepEqual(RACES.orc.onIncoming, { magic: { add: 2 } });
  assert.deepEqual(RACES.aasimar.onIncoming, { physical: { add: 2 } });
  assert.deepEqual(RACES.dwarf.onIncoming, { magic: { mult: 0.5 } });
  assert.equal(RACES.orc.orcReroll, true);
});
