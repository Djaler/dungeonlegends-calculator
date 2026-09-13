import { rollNotation } from '../engine.js';

// Вспомогательная функция: создаёт массив пустых массивов для целей.
function empty(n) { return Array.from({ length: n }, () => []); }

export const CLERIC_ABILITIES = [
  {
    id: 'divineLight', name: 'Божественный свет', classKey: 'cleric',
    minGame: 12, choiceGroup: 'game12', charges: '2 раза в день', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const con = ctx.attackBonus('con');
      for (let i = 0; i < ctx.targets.length; i++) {
        out[i].push({ type: 'radiant', amount: rollNotation('1d4', ctx.rng, ctx.mods.orcReroll) + con });
      }
      return out;
    },
  },
];
