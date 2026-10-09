import { attackRoll, rollNotation, d20, sumDice, talentTally, rollShared } from '../engine.js';

function empty(n) {
  return Array.from({ length: n }, () => []);
}

function bellDice(nat) {
  if (nat <= 4) return '1d6';
  if (nat <= 9) return '2d6';
  if (nat <= 14) return '3d6';
  if (nat <= 19) return '4d6';
  return '5d6';
}

export const NECRO_ABILITIES = [
  {
    id: 'pathToOblivion',
    name: 'Путь в небытие',
    classKey: 'necromancer',
    minGame: 1,
    choiceGroup: null,
    charges: 'раз в день = Стойкость',
    targeting: 'area',
    usesAttackRoll: false,
    usesSave: false,
    category: 'magic',
    params: [],
    simulateOnce(ctx) {
      // Все цели на линии получают один и тот же бросок 1d8 некротического урона.
      const out = empty(ctx.targets.length);
      const amount = rollShared(ctx, 1, 8);
      for (let i = 0; i < ctx.targets.length; i++) out[i].push({ type: 'necrotic', amount });
      return out;
    },
  },
  {
    id: 'funeralBell',
    name: 'Погребальный звон',
    classKey: 'necromancer',
    minGame: 1,
    choiceGroup: null,
    charges: 'действие',
    targeting: 'single',
    usesAttackRoll: false,
    usesSave: false,
    category: 'magic',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      // Катаем d20: 1–4 → 1d6; 5–9 → 2d6; 10–14 → 3d6; 15–19 → 4d6; 20 → 5d6 некротического урона.
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const nat = d20(ctx.rng);
      out[i].push({
        type: 'necrotic',
        amount: rollNotation(bellDice(nat), ctx.rng, ctx.mods.orcReroll, talentTally(ctx)),
      });
      return out;
    },
  },
  {
    id: 'harvest',
    name: 'Жатва',
    classKey: 'necromancer',
    minGame: 12,
    choiceGroup: 'game12',
    charges: 'раз в день = Стойкость',
    targeting: 'area',
    usesAttackRoll: false,
    usesSave: true,
    category: 'magic',
    params: [],
    simulateOnce(ctx) {
      // Цели проходят спас «стойкость — 15»; при провале теряют 1d10 некротического урона.
      // Спасбросок использует реальный стат Стойкости (con) цели.
      // Финальный дальнобойный «выброс энергии» опускаем (вне модели урона v1).
      const out = empty(ctx.targets.length);
      const mode = ctx.mods.hex ? 'dis' : 'none';
      // «Выберите до 3 целей» — дальше первых трёх жатва не идёт.
      const reach = Math.min(3, ctx.targets.length);
      const failed = [];
      for (let i = 0; i < reach; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat === 20 || (nat !== 1 && nat + ((ctx.targets[i].saves && ctx.targets[i].saves.con) || 0) >= 15);
        if (!saved) failed.push(i);
      }
      // Один бросок 1d10 на всех провалившихся; если провалившихся нет — кидать нечего.
      if (failed.length) {
        const amount = rollShared(ctx, 1, 10);
        for (const i of failed) out[i].push({ type: 'necrotic', amount });
      }
      return out;
    },
  },
];
