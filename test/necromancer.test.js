import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find(a => a.id === id);
const nctx = (over) => {
  const stats = over.stats ?? { str: -1, dex: 1, con: 2, wis: 1, int: 3, cha: -2 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: 20,
    weapon: { dice: '1d4', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99 }],
    mods: { orcReroll: false, hex: false },
    params: over.params || {},
  };
};

test('Путь в небытие: 1d8+Интеллект некротик по всем', () => {
  const p = get('pathToOblivion').simulateOnce(nctx({ rng: seqRng([0.99]) }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 11 }]]); // d8 0.99->8 +3(int)
});

test('Погребальный звон: d20=20 -> 5d6', () => {
  // d20 nat: attackRoll none -> floor(0.99*20)+1=20 -> 5d6 (все 0.99 ->6) =30
  const p = get('funeralBell').simulateOnce(nctx({ rng: seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 30 }]]);
});

test('Погребальный звон: d20 в 1-4 -> 1d6', () => {
  // nat = floor(0.0*20)+1=1 -> 1d6 (0.99->6)
  const p = get('funeralBell').simulateOnce(nctx({ rng: seqRng([0, 0.99]) }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 6 }]]);
});

test('Жатва: провал спасброска -> 1d10', () => {
  // спас nat=1 (0) провал; 1d10 0.99->10
  const p = get('harvest').simulateOnce(nctx({ rng: seqRng([0, 0.99]), targets: [{ ac: 10, hp: 99, saves: { con: 0 } }] }));
  assert.deepEqual(p, [[{ type: 'necrotic', amount: 10 }]]);
});
