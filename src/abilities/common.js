import { multiWeaponAttack } from './shared.js';

// Базовая атака оружием: d20+стат владения против КБ; при попадании куб оружия + стат, физический урон.
export const COMMON_ABILITIES = [
  {
    id: 'basicAttack', name: 'Базовая атака оружием', classKey: 'common',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical', weaponBased: true,
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const i = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [i]);
    },
  },
];
