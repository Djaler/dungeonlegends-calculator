import { attackRoll, isHit, resolveMode, rollNotation, rollDie, sumDice } from '../engine.js';

// Пустые пакеты на каждую цель.
function empty(n) { return Array.from({ length: n }, () => []); }

// Кубы урона с удвоением на крите.
function dmgDice(notation, ctx, crit) {
  const one = () => rollNotation(notation, ctx.rng, ctx.mods.orcReroll);
  return crit ? one() + one() : one();
}

const AMMO = { 'усиленный': '1d8', 'гарпун': '1d4' };

export const ARTIFICER_ABILITIES = [
  {
    id: 'argument', name: 'Арбалет «Аргумент»', classKey: 'artificer',
    minGame: 1, choiceGroup: null, charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [
      { id: 'ammo', kind: 'select', label: 'Наконечник', default: 'усиленный',
        options: [{ value: 'усиленный', label: 'Усиленный (1д8)' }, { value: 'гарпун', label: 'Гарпун (1д4)' }] },
      { id: 'target', kind: 'targetPick', label: 'Цель', default: 0 },
    ],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const die = AMMO[ctx.params.ammo] || AMMO['усиленный'];
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bonus = ctx.attackBonus('dex');
      const nat = attackRoll(ctx.rng, mode);
      const { hit, crit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange);
      // болт без стата к урону (стат-мультипликатор урона вне данной модели)
      if (hit) out[i].push({ type: 'physical', amount: dmgDice(die, ctx, crit) + ctx.attackBonus('dex') });
      return out;
    },
  },
  {
    id: 'flamethrower', name: 'Огнемёт (Весомый аргумент)', classKey: 'artificer',
    minGame: 12, choiceGroup: 'game12', charges: 'пассивно', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      // 2d6 огнём по всем целям (авто, без броска атаки)
      for (let i = 0; i < ctx.targets.length; i++) {
        out[i].push({ type: 'fire', amount: sumDice(2, 6, ctx.rng, ctx.mods.orcReroll) });
      }
      return out;
    },
  },
  {
    id: 'forceBolt', name: 'Силовой болт (Весомый аргумент)', classKey: 'artificer',
    minGame: 12, choiceGroup: 'game12', choiceId: 'flamethrower',
    charges: 'действие', targeting: 'single',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const i = ctx.params.target ?? 0;
      const mode = resolveMode(ctx.mods.adv, ctx.mods.dis);
      const bonus = ctx.attackBonus('dex');
      const nat = attackRoll(ctx.rng, mode);
      const { hit, crit } = isHit(nat, bonus, ctx.targets[i].ac, ctx.critRange);
      // 1д6 урона; «сбивает с ног» вне модели урона
      if (hit) out[i].push({ type: 'physical', amount: dmgDice('1d6', ctx, crit) + bonus });
      return out;
    },
  },
  {
    id: 'unstableArgument', name: 'Нестабильный аргумент', classKey: 'artificer',
    minGame: 12, choiceGroup: 'game12', charges: 'пассивно', targeting: 'area',
    usesAttackRoll: false, usesSave: false, category: 'magic', params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const roll = rollDie(4, ctx.rng, false);
      // 1 → 2d4 огнём всем целям; 2–4 → без урона (броня−/броня+/лечение вне модели урона)
      if (roll === 1) {
        for (let i = 0; i < ctx.targets.length; i++) {
          out[i].push({ type: 'fire', amount: sumDice(2, 4, ctx.rng, ctx.mods.orcReroll) });
        }
      }
      return out;
    },
  },
];
