import { rollNotation, rollDie, d20, attackOnce, resolveModeFor, sumDice, talentTally, attackRoll, rollShared } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

// Очарованный клинок: итог проверки Харизмы задаёт куб дополнительного магического урона.
function bladeDie(nat, total) {
  if (nat === 1 || total <= 1) return 4;
  if (total >= 20) return 12;
  if (total >= 15) return 10;
  if (total >= 10) return 8;
  return 6;
}

// Область со спасброском «ловкость — 15»: каждая цель спасается сама, а урон кидается
// один раз на всех — провалившие получают его целиком, спасшиеся половину.
export function dexSaveBlast(ctx, out, nDice, type) {
  const saved = ctx.targets.map((t) => {
    const nat = attackRoll(ctx.rng, ctx.mods.hex ? 'dis' : 'none'); // Сглаз = помеха спасброску
    return nat !== 1 && (nat === 20 || nat + ((t.saves && t.saves.dex) || 0) >= 15);
  });
  const full = rollShared(ctx, nDice, 6);
  saved.forEach((s, i) => out[i].push({ type, amount: s ? Math.floor(full / 2) : full }));
  return out;
}

// Универсальная атака оружием по плану целей (по одной атаке на элемент plan).
// Все сквозные боевые модификаторы централизованы здесь.
export function multiWeaponAttack(ctx, plan) {
  const n = ctx.targets.length;
  const out = empty(n);
  if (n === 0 || !plan || plan.length === 0) return out;
  const m = ctx.mods;
  const seq = m.bonusAttack ? [...plan, plan[0]] : plan;
  const advFlag = m.adv || m.sneak; // скрытная атака даёт преимущество
  const rageF = m.barbRage ? 2 : 1;
  const extra = (m.runeOfWarrior ? 1 : 0) + (m.sacredWeapon || 0);
  const statBonus = ctx.attackBonus(ctx.weapon.stat) * rageF;
  const hitBonus = statBonus + extra - (m.gwm ? 5 : 0);
  const dmgFlat = (m.gwm ? 10 : 0);
  const type = m.typeOverride || 'physical';
  const acIgnore = m.acIgnore || 0;
  let firstHitDone = false;     // для смайта (один раз)
  let reaperDone = false;       // Губитель — одна реакция, на первое попадание
  // Клинок напевают перед атакой: проверка бросается до первого удара.
  let blade = 0;
  if (m.enchantedBlade) {
    const nat = d20(ctx.rng);
    blade = bladeDie(nat, nat + ctx.attackBonus('cha'));
  }
  let firstStrike = true;       // первый удар плана — для guaranteedHit/скрытной
  let ricochetSource = -1;      // индекс цели первого попадания (для рикошета)
  let ricochetPacket = null;    // пакет того самого выстрела — дублируется только он

  for (const idx of seq) {
    const mode = resolveModeFor(advFlag, m.dis, ctx.targets[idx]);
    const baseAc = ctx.targets[idx].ac - acIgnore;
    const ac = acIgnore > 0 ? Math.max(10, baseAc) : ctx.targets[idx].ac;
    let hit, crit = false;
    if (firstStrike && m.luckyCrit) {
      // Промах превращается в крит, поэтому одноразовые спасения броска тут не нужны.
      const r = attackOnce(ctx, hitBonus, ac, mode, false);
      if (r.hit) { hit = true; crit = r.crit; }   // попал обычно (или сам по себе крит)
      else { hit = true; crit = true; }            // промах -> считаем критом
    }
    else {
      const r = attackOnce(ctx, hitBonus, ac, mode, firstStrike);
      hit = r.hit; crit = r.crit;
    }
    if (hit) {
      const rollWeapon = (isCrit, d = ctx.weapon.dice) => isCrit
        ? rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx)) + rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx))
        : rollNotation(d, ctx.rng, m.orcReroll, talentTally(ctx));
      let amount = rollWeapon(crit) + statBonus + extra + dmgFlat;
      // скрытная атака: +ещё один стат оружия (вместо ловкости — удвоенная); только на первом ударе
      if (m.sneak && firstStrike) {
        amount += ctx.attackBonus(ctx.weapon.stat);
        if (m.sneakDouble) amount *= 2;
      }
      // Губитель: реакцией прибавить к урону д20 здоровья (цена здоровьем вне модели).
      // Это куб — Талант к нему применим, а орочий переброс (только кубы урона) — нет.
      if (m.reaper && !reaperDone) { amount += rollDie(20, ctx.rng, false, talentTally(ctx)); reaperDone = true; }
      out[idx].push({ type, amount });
      // Клинок усиливает только первую атаку: физика оружия остаётся, магия идёт сверху.
      if (blade && firstStrike) {
        out[idx].push({ type: 'magic', amount: rollWeapon(crit, `1d${blade}`) + ctx.attackBonus('cha') });
      }
      if (ricochetSource < 0) { ricochetSource = idx; ricochetPacket = { type, amount }; }
      if (!firstHitDone && (m.smiteDice || 0) > 0) {
        out[idx].push({ type: 'radiant', amount: sumDice(crit ? 2 * m.smiteDice : m.smiteDice, 10, ctx.rng, m.orcReroll, talentTally(ctx)) });
        firstHitDone = true;
      }
    }
    firstStrike = false;
  }

  // Рикошет: «перед одним из выстрелов выберите дополнительную цель, которая получит
  // тот же урон» — дублируется ровно один выстрел, а не весь урон по цели за ход.
  if (m.ricochet && ricochetPacket && n >= 2) {
    const dst = (ricochetSource + 1) % n;
    out[dst].push({ ...ricochetPacket });
  }
  return out;
}
