import { multiWeaponAttack } from './shared.js';

export const RANGER_ABILITIES = [
  {
    id: 'doubleShot', name: 'Быстрая рука (2 выстрела)', classKey: 'ranger',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [t, t]);
    },
  },
];
