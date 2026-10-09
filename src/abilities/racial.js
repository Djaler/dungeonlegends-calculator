import { sumDice, talentTally, rollShared, d20, isHitWithTalent } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const RACIAL_ABILITIES = [
  {
    id: 'dragonbornBreath', name: 'Огненное дыхание', raceKey: 'dragonborn', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const amount = rollShared(ctx, 2, 6); // урон по области — один бросок на всех
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount });
      return out;
    },
  },
  {
    id: 'dwarfHeadbutt', name: 'Тяжёлая голова', raceKey: 'dwarf', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'physical',
    fixedDamage: true, // ровно 6, ни одного броска — Таланту не к чему приложиться
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      out[ctx.params.target ?? 0].push({ type: 'physical', amount: 6 });
      return out;
    },
  },
  {
    id: 'tieflingRetribution', name: 'Адское возмездие', raceKey: 'tiefling', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      out[ctx.params.target ?? 0].push({ type: 'fire', amount: sumDice(1, 8, ctx.rng, ctx.mods.orcReroll, talentTally(ctx)) });
      return out;
    },
  },
  {
    id: 'dhampirBite', name: 'Вампиризм', raceKey: 'dhampir', classKey: null,
    minGame: 1, choiceGroup: null, charges: 'бонусное действие', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      // Схватить — проверка «ловкость — 12»; это не атака, поэтому крит только на 20,
      // но Талант может её дотянуть. Затем 1д6 урона цели (лечение себе вне модели).
      const out = empty(ctx.targets.length);
      const check = { ...ctx, critRange: 20, fumbleRange: 1 };
      const { hit } = isHitWithTalent(check, d20(ctx.rng), ctx.attackBonus('dex'), 12);
      if (hit) out[ctx.params.target ?? 0].push({ type: 'physical', amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll, talentTally(ctx)) });
      return out;
    },
  },
];
