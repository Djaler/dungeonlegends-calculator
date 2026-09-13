import { multiWeaponAttack } from './shared.js';

// Воин: серия атак оружием по одной цели.
export const WARRIOR_ABILITIES = [
  {
    id: 'rainOfBlows', name: 'Град ударов', classKey: 'warrior',
    minGame: 1, choiceGroup: null, charges: 'раз в бой = Стойкость', targeting: 'area',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const t = ctx.params.target ?? 0;
      return multiWeaponAttack(ctx, [t, t, t, t]);
    },
  },
];
