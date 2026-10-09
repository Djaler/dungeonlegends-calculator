import { multiWeaponAttack } from './shared.js';

export const BARD_ABILITIES = [
  {
    id: 'enchantedBladeAttack', name: 'Удар очарованным клинком', classKey: 'bard',
    minGame: 12, choiceGroup: 'game12', choiceId: 'enchantedBlade',
    charges: 'реакция, раз в ход', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical', weaponBased: true,
    alsoMagic: true, // сверху физики — магический урон клинка: на него действует Зелье хаоса
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      return multiWeaponAttack({ ...ctx, mods: { ...ctx.mods, enchantedBlade: true } }, [ctx.params.target ?? 0]);
    },
  },
];
