import { rollDie, d20, attackOnce, resolveModeFor, talentTally } from '../engine.js';
import { dexSaveBlast } from './shared.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const SORCERER_ABILITIES = [
  {
    id: 'magicDaggers', name: 'Магические кинжалы', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'area',
    usesAttackRoll: true, usesSave: false, category: 'magic',
    params: [{ id: 'distribute', kind: 'distribute', label: 'Кинжалы по целям', count: 4, default: null }],
    simulateOnce(ctx) {
      // 4 дальнобойные атаки «д20+Интеллект» по д8 магии; притягивание и телепорт вне модели урона.
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      const plan = ctx.params.distribute || Array.from({ length: 4 }, (_, i) => i % n);
      plan.forEach((t, k) => {
        const mode = resolveModeFor(ctx.mods.adv, ctx.mods.dis, ctx.targets[t]);
        const { hit, crit } = attackOnce(ctx, ctx.attackBonus('int'), ctx.targets[t].ac, mode, k === 0);
        if (!hit) return;
        const die = () => rollDie(8, ctx.rng, ctx.mods.orcReroll, talentTally(ctx));
        out[t].push({ type: 'magic', amount: crit ? die() + die() : die() });
      });
      return out;
    },
  },
  {
    id: 'flame', name: 'Пламя', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: true, category: 'magic', params: [],
    simulateOnce(ctx) {
      // Один д20 на заклинание: 1–14 → 3д6, 15–20 → 6д6; дальше — область со спасом Ловкости.
      let nat = d20(ctx.rng);
      // Талант дотягивает 12–14 до порога: это +3д6, больше любой прибавки к кубу урона.
      if (nat >= 12 && nat < 15 && ctx.talent && ctx.talent.left > 0) { ctx.talent.left -= 1; nat += 3; }
      return dexSaveBlast(ctx, empty(ctx.targets.length), nat >= 15 ? 6 : 3, 'fire');
    },
  },
  {
    id: 'flash', name: 'Вспышка', classKey: 'sorcerer',
    minGame: 1, choiceGroup: null, charges: '1 раз в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    fixedDamage: true, // ровно 5 каждой цели — Таланту не к чему приложиться
    params: [],
    simulateOnce(ctx) {
      // Все цели считаются стоящими с вами в ближнем бою; невидимость вне модели урона.
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'magic', amount: 5 });
      return out;
    },
  },
];
