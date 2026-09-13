import { sumDice } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

export const RACIAL_ABILITIES = [
  {
    id: 'dragonbornBreath', name: 'Огненное дыхание', raceKey: 'dragonborn', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'fire', amount: sumDice(2, 6, ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
  {
    id: 'dwarfHeadbutt', name: 'Тяжёлая голова', raceKey: 'dwarf', classKey: null,
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'physical',
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
      out[ctx.params.target ?? 0].push({ type: 'fire', amount: sumDice(1, 8, ctx.rng, ctx.mods.orcReroll) });
      return out;
    },
  },
];
