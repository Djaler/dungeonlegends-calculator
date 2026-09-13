import { multiWeaponAttack } from './shared.js';

export const BARBARIAN_ABILITIES = [
  {
    id: 'deathDance', name: 'Танец со смертью', classKey: 'barbarian',
    minGame: 4, choiceGroup: null, charges: 'действие', targeting: 'area',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [],
    simulateOnce(ctx) {
      // Рукопашная атака по каждой цели в области; цели получают половину урона от этих атак.
      const out = multiWeaponAttack(ctx, ctx.targets.map((_, i) => i));
      return out.map((arr) => arr.map((p) => ({ ...p, amount: Math.floor(p.amount / 2) })));
    },
  },
];
