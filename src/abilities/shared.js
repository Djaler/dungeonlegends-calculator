import { rollNotation, attackRoll, isHit, resolveMode, sumDice } from '../engine.js';

function empty(n) { return Array.from({ length: n }, () => []); }

// Максимум нотации 'NdS' — потолок для Таланта.
function maxRoll(notation) {
  const m = /^(\d+)d(\d+)$/.exec(notation);
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

// Универсальная атака оружием по плану целей (по одной атаке на элемент plan).
// Все сквозные боевые модификаторы централизованы здесь.
export function multiWeaponAttack(ctx, plan) {
  const n = ctx.targets.length;
  const out = empty(n);
  if (n === 0 || !plan || plan.length === 0) return out;
  const m = ctx.mods;
  const seq = m.bonusAttack ? [...plan, plan[0]] : plan;
  const mode = resolveMode(m.adv || m.sneak, m.dis); // скрытная атака даёт преимущество
  const rageF = m.barbRage ? 2 : 1;
  const extra = (m.runeOfWarrior ? 1 : 0) + (m.sacredWeapon || 0);
  const statBonus = ctx.attackBonus(ctx.weapon.stat) * rageF;
  // Гениальность изобретателя / его браслет: союзник добавляет свой Интеллект к атаке.
  const hitBonus = statBonus + extra + (m.genius || 0) - (m.gwm ? 5 : 0);
  const dmgFlat = (m.gwm ? 10 : 0);
  const type = m.typeOverride || 'physical';
  const acIgnore = m.acIgnore || 0;
  let firstHitDone = false;     // для смайта (один раз)
  let firstStrike = true;       // первый удар плана — для guaranteedHit/скрытной
  let ricochetSource = -1;      // индекс цели первого попадания (для рикошета)
  let ricochetPacket = null;    // пакет того самого выстрела — дублируется только он

  for (const idx of seq) {
    const baseAc = ctx.targets[idx].ac - acIgnore;
    const ac = acIgnore > 0 ? Math.max(10, baseAc) : ctx.targets[idx].ac;
    let hit, crit = false;
    if (firstStrike && m.luckyCrit) {
      const nat = attackRoll(ctx.rng, mode);
      const r = isHit(nat, hitBonus, ac, ctx.critRange, ctx.fumbleRange);
      if (r.hit) { hit = true; crit = r.crit; }   // попал обычно (или сам по себе крит)
      else { hit = true; crit = true; }            // промах -> считаем критом
    }
    else if (firstStrike && m.guaranteedHit) { hit = true; }
    else {
      const nat = attackRoll(ctx.rng, mode);
      let r = isHit(nat, hitBonus, ac, ctx.critRange, ctx.fumbleRange);
      // Кроличья лапка: перебросить неудачный д20 (один раз за ход).
      if (!r.hit && firstStrike && m.rabbitFoot) {
        r = isHit(attackRoll(ctx.rng, mode), hitBonus, ac, ctx.critRange, ctx.fumbleRange);
      }
      hit = r.hit; crit = r.crit;
    }
    if (hit) {
      const d = ctx.weapon.dice;
      const rollWeapon = (isCrit) => isCrit
        ? rollNotation(d, ctx.rng, m.orcReroll) + rollNotation(d, ctx.rng, m.orcReroll)
        : rollNotation(d, ctx.rng, m.orcReroll);
      let weaponRoll = rollWeapon(crit);
      // Талант 16-й игры: +3 к броску куба, но не выше его максимума. Тратится на один удар.
      if (m.talent && firstStrike) weaponRoll = Math.min(weaponRoll + 3, maxRoll(d) * (crit ? 2 : 1));
      let amount = weaponRoll + statBonus + extra + dmgFlat;
      // скрытная атака: +ещё один стат оружия (вместо ловкости — удвоенная); только на первом ударе
      if (m.sneak && firstStrike) {
        amount += ctx.attackBonus(ctx.weapon.stat);
        if (m.sneakDouble) amount *= 2;
      }
      out[idx].push({ type, amount });
      if (ricochetSource < 0) { ricochetSource = idx; ricochetPacket = { type, amount }; }
      if (!firstHitDone && (m.smiteDice || 0) > 0) {
        out[idx].push({ type: 'radiant', amount: sumDice(crit ? 2 * m.smiteDice : m.smiteDice, 10, ctx.rng, m.orcReroll) });
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
