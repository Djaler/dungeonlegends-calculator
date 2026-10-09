import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { availableAbilities, modifierRelevance, GAME12_CHOICES } from '../src/ui-logic.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const bard12 = (game12Choice) => ({ classKey: 'bard', raceKey: 'elf', game: 12, game12Choice, artifacts: [] });

test('Удар очарованным клинком: физическая и магическая части урона', () => {
  const stats = { str: 0, dex: 1, con: -1, wis: -1, int: 1, cha: 4 };
  const c = {
    rng: seqRng([0.5, 0.5, 0.99, 0.99]), stats, attackBonus: (s) => stats[s], critRange: 20, fumbleRange: 1,
    weapon: { dice: '1d6', stat: 'dex' }, targets: [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, adv: false, dis: false }, params: { target: 0 },
  };
  assert.deepEqual(get('enchantedBladeAttack').simulateOnce(c),
    [[{ type: 'physical', amount: 7 }, { type: 'magic', amount: 14 }]]);
});

test('Клинок доступен барду только при выборе на 12-й игре', () => {
  const ids = (ch) => availableAbilities(bard12(ch)).map((a) => a.id);
  assert.ok(ids('enchantedBlade').includes('enchantedBladeAttack'));
  assert.ok(!ids('fanbase').includes('enchantedBladeAttack'));
  assert.ok(ids('enchantedBlade').includes('basicAttack')); // обычный удар остаётся для сравнения
});

test('На Клинке показаны оба зелья, на обычном ударе — только ярость', () => {
  const c = bard12('enchantedBlade');
  const relBlade = modifierRelevance(get('enchantedBladeAttack'), c);
  assert.equal(relBlade.rage, true);
  assert.equal(relBlade.chaos, true);
  assert.equal(modifierRelevance(get('basicAttack'), c).chaos, false);
});

test('GAME12_CHOICES: у барда Очарованный клинок и Фанбаза', () => {
  assert.deepEqual(GAME12_CHOICES.bard.map((x) => x.id), ['enchantedBlade', 'fanbase']);
});
