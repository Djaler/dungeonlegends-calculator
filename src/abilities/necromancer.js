import { attackRoll, isHit, resolveMode, rollNotation, d20, sumDice } from '../engine.js';

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
      // Каждая цель получает 1d8 + Интеллект некротического урона.
      const out = empty(ctx.targets.length);
      const int = ctx.attackBonus('int');
      for (let i = 0; i < ctx.targets.length; i++) {
        out[i].push({
          type: 'necrotic',
          amount: rollNotation('1d8', ctx.rng, ctx.mods.orcReroll) + int,
        });
      }
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
        amount: rollNotation(bellDice(nat), ctx.rng, ctx.mods.orcReroll),
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
      for (let i = 0; i < ctx.targets.length; i++) {
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat === 20 || (nat !== 1 && nat + ((ctx.targets[i].saves && ctx.targets[i].saves.con) || 0) >= 15);
        if (!saved) {
          out[i].push({
            type: 'necrotic',
            amount: rollNotation('1d10', ctx.rng, ctx.mods.orcReroll),
          });
        }
      }
      return out;
    },
  },
];
