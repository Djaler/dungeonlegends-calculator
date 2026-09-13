import { rollDie, sumDice, attackRoll, isHitWithTalent, resolveModeFor, talentTally } from '../engine.js';

// Пустые пакеты на каждую цель.
function empty(n) { return Array.from({ length: n }, () => []); }

// Одиночная атака д20+стат по цели index; при попадании — пакет.
// stat — характеристика броска; addStat добавляет её же к урону (владение оружием).
function singleAttack(ctx, index, sides, type, stat, addStat) {
  const out = empty(ctx.targets.length);
  const mode = resolveModeFor(ctx.mods.adv, ctx.mods.dis, ctx.targets[index]);
  const bonus = ctx.attackBonus(stat);
  const nat = attackRoll(ctx.rng, mode);
  const { hit, crit } = isHitWithTalent(ctx, nat, bonus, ctx.targets[index].ac);
  if (hit) {
    const amount = crit
      ? rollDie(sides, ctx.rng, ctx.mods.orcReroll, talentTally(ctx)) + rollDie(sides, ctx.rng, ctx.mods.orcReroll, talentTally(ctx))
      : rollDie(sides, ctx.rng, ctx.mods.orcReroll, talentTally(ctx));
    out[index].push({ type, amount: amount + (addStat ? bonus : 0) });
  }
  return out;
}

export const WIZARD_ABILITIES = [
  {
    id: 'magicMissiles', name: 'Волшебные снаряды', classKey: 'wizard',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    minGame: 1, choiceGroup: null, charges: '3 раза в бой', targeting: 'area',
    params: [{ id: 'distribute', kind: 'distribute', label: 'Снаряды по целям', count: 3, default: null }],
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      const plan = ctx.params.distribute || Array.from({ length: 3 }, (_, i) => i % n);
      for (const t of plan) out[t].push({ type: 'magic', amount: rollDie(4, ctx.rng, ctx.mods.orcReroll, talentTally(ctx)) + 1 });
      return out;
    },
  },
  {
    id: 'staff', name: 'Атака посохом', classKey: 'wizard',
    usesAttackRoll: true, usesSave: false, category: 'physical',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    // Посох — оружие «требует ловкость»: владение даёт стат оружия к атаке и урону.
    simulateOnce(ctx) { return singleAttack(ctx, ctx.params.target ?? 0, 4, 'physical', ctx.weapon.stat, true); },
  },
  {
    id: 'telekinesis', name: 'Телекинез (атака)', classKey: 'wizard',
    usesAttackRoll: true, usesSave: false, category: 'magic',
    minGame: 1, choiceGroup: null, charges: 'без ограничений', targeting: 'single',
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    // Телекинез — не оружие: бросок по Интеллекту, стат к урону не прибавляется.
    simulateOnce(ctx) { return singleAttack(ctx, ctx.params.target ?? 0, 4, 'magic', 'int', false); },
  },
  {
    id: 'fireball', name: 'Огненный шар', classKey: 'wizard',
    usesAttackRoll: false, usesSave: true, category: 'magic',
    minGame: 1, choiceGroup: null, charges: '1 раз в бой', targeting: 'area',
    params: [],
    simulateOnce(ctx) {
      const out = empty(ctx.targets.length);
      const mode = ctx.mods.hex ? 'dis' : 'none'; // Сглаз = помеха спасброску цели
      for (let i = 0; i < ctx.targets.length; i++) {
        const saveBonus = (ctx.targets[i].saves && ctx.targets[i].saves.dex) || 0;
        const nat = attackRoll(ctx.rng, mode);
        const saved = nat !== 1 && (nat === 20 || nat + saveBonus >= 15);
        const full = sumDice(6, 6, ctx.rng, ctx.mods.orcReroll, talentTally(ctx));
        out[i].push({ type: 'fire', amount: saved ? Math.floor(full / 2) : full });
      }
      return out;
    },
  },
  {
    id: 'chainLightning', name: 'Цепная молния', classKey: 'wizard',
    usesAttackRoll: true, usesSave: false, category: 'magic',
    minGame: 1, choiceGroup: null, charges: '2 раза в бой', targeting: 'chain',
    params: [{ id: 'order', kind: 'targetOrder', label: 'Порядок ударов', max: 4, default: null }],
    simulateOnce(ctx) {
      const n = ctx.targets.length;
      const out = empty(n);
      if (n === 0) return out;
      // Режим считается по каждой цели: молния прыгает по разным противникам.
      const modeFor = (i) => resolveModeFor(ctx.mods.adv, ctx.mods.dis, ctx.targets[i]);
      const boltAmount = (isCrit) => sumDice(isCrit ? 4 : 2, 6, ctx.rng, ctx.mods.orcReroll, talentTally(ctx));
      const seq = ctx.params.order;
      if (seq && seq.length) {
        out[seq[0]].push({ type: 'lightning', amount: boltAmount(false) }); // авто, не крит
        for (let i = 1; i < seq.length; i++) {
          const nat = attackRoll(ctx.rng, modeFor(seq[i]));
          const { hit, crit } = isHitWithTalent(ctx, nat, ctx.attackBonus('int'), ctx.targets[seq[i]].ac);
          if (!hit) break;
          out[seq[i]].push({ type: 'lightning', amount: boltAmount(crit) });
        }
        return out;
      }
      // Жадная маршрутизация (наим. КБ, кроме текущей; можно вернуться, но не подряд).
      out[0].push({ type: 'lightning', amount: boltAmount(false) }); // авто, не крит
      if (n < 2) return out;
      let prev = 0;
      for (let step = 0; step < 3; step++) {
        let next = -1;
        for (let j = 0; j < n; j++) {
          if (j === prev) continue;
          if (next < 0 || ctx.targets[j].ac < ctx.targets[next].ac) next = j;
        }
        const nat = attackRoll(ctx.rng, modeFor(next));
        const { hit, crit } = isHitWithTalent(ctx, nat, ctx.attackBonus('int'), ctx.targets[next].ac);
        if (!hit) break;
        out[next].push({ type: 'lightning', amount: boltAmount(crit) });
        prev = next;
      }
      return out;
    },
  },
  {
    id: 'unknownAttack', name: 'Неизвестная атака', classKey: 'wizard',
    minGame: 12, choiceGroup: 'game12', charges: '2 раза в день', targeting: 'single',
    usesAttackRoll: false, usesSave: false, category: 'magic',
    fixedDamage: true, // ровно 15, ни одного броска — Таланту не к чему приложиться
    params: [{ id: 'target', kind: 'targetPick', label: 'Цель', default: 0 }],
    simulateOnce(ctx) {
      // Выбранная цель получает ровно 15 урона типа psychic
      const out = Array.from({ length: ctx.targets.length }, () => []);
      out[ctx.params.target ?? 0].push({ type: 'psychic', amount: 15 });
      return out;
    },
  },
];
