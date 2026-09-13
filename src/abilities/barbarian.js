import { rollNotation, attackRoll } from '../engine.js';

// Вспомогательная функция: создаёт массив пустых массивов для целей.
function empty(n) { return Array.from({ length: n }, () => []); }

export const BARBARIAN_ABILITIES = [
  {
    id: 'deathDance', name: 'Танец со смертью', classKey: 'barbarian',
    minGame: 4, choiceGroup: null, charges: 'действие', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'physical',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      // Режим спасброска: 'dis' если есть hex, иначе 'none'
      const mode = ctx.mods.hex ? 'dis' : 'none';
      // Бонус урона: Сила (с учётом ярости варвара) + 10 если gwm
      const bonus = ctx.attackBonus(ctx.weapon.stat) * (ctx.mods.barbRage ? 2 : 1) + (ctx.mods.gwm ? 10 : 0);
      for (let i = 0; i < ctx.targets.length; i++) {
        // Спасбросок цели
        const nat = attackRoll(ctx.rng, mode);
        // Цель спасена если: nat=20, либо nat!=1 и (nat+спас Ловкости>=12)
        const saved = nat === 20 || (nat !== 1 && nat + ((ctx.targets[i].saves && ctx.targets[i].saves.dex) || 0) >= 12);
        if (!saved) {
          // При провале: урон = куб оружия + бонус Силы (удвоен если ярость)
          out[i].push({ type: 'physical', amount: rollNotation(ctx.weapon.dice, ctx.rng, ctx.mods.orcReroll) + bonus });
        }
      }
      return out;
    },
  },
];
