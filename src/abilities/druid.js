import { attackRoll, isHit, resolveMode, rollNotation } from '../engine.js';

// Пустые пакеты на каждую цель.
function empty(n) { return Array.from({ length: n }, () => []); }

// Кубы урона с удвоением на крите (как в shared/wizard).
function dmgDice(notation, ctx, crit) {
  const one = () => rollNotation(notation, ctx.rng, ctx.mods.orcReroll);
  return crit ? one() + one() : one();
}

export const DRUID_ABILITIES = [
  {
    id: 'beastForm', name: 'Облик зверя', classKey: 'druid',
    minGame: 1, choiceGroup: null, charges: 'бонусное действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [
      { id: 'form', kind: 'select', label: 'Форма', default: 'bear',
        options: [{ value: 'bear', label: 'Медведь' }, { value: 'snake', label: 'Змея' }] },
      { id: 'target', kind: 'targetPick', label: 'Цель', default: 0 },
    ],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bear = (ctx.params.form ?? 'bear') === 'bear';
      const stat = bear ? 'str' : 'dex';
      const die = bear ? (ctx.mods.beastRage ? '1d12' : '1d10') : (ctx.mods.beastRage ? '1d8' : '1d6');
      const bonus = ctx.attackBonus(stat);
      const attacks = bear ? 2 : 1; // змеиный урон повторяется 2 хода — учитываем только немедленный
      for (let a = 0; a < attacks; a++) {
        const nat = attackRoll(ctx.rng, mode);
        const { hit, crit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange, ctx.fumbleRange);
        if (hit) out[i].push({ type: 'physical', amount: dmgDice(die, ctx, crit) + bonus });
      }
      return out;
    },
  },
  {
    id: 'thornPath', name: 'Тернистый путь', classKey: 'druid',
    minGame: 1, choiceGroup: null, charges: '2 раза в день', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'physical', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'physical', amount: rollNotation('3d6', ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
];
