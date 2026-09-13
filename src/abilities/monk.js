import { multiWeaponAttack } from './shared.js';

// Монах: серия безоружных ударов в зависимости от Стойкости.
export const MONK_ABILITIES = [
  {
    id: 'flurry', name: 'Шквал', classKey: 'monk',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      const count = Math.max(1, ctx.stats.con);
      return multiWeaponAttack(ctx, new Array(count).fill(t));
    },
  },
];
