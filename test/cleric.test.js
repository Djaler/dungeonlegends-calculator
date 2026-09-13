import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const cctx = (over) => {
  const stats = over.stats ?? { str: -1, dex: -1, con: 4, wis: 0, int: 1, cha: 1 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: 20,
    weapon: { dice: '1d6', stat: 'dex' },
    targets: over.targets ?? [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }],
    mods: { orcReroll: false },
    params: {},
  };
};

test('Божественный свет: 1d4+Стойкость излучением по всем', () => {
  // 2 цели: d4 0.99->4 +4(con) =8 каждой
  const p = ABILITIES.find((a) => a.id === 'divineLight').simulateOnce(
    cctx({ rng: seqRng([0.99, 0.99]) })
  );
  assert.deepEqual(p, [[{ type: 'radiant', amount: 8 }], [{ type: 'radiant', amount: 8 }]]);
});
