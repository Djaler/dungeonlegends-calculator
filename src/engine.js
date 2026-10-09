import { RACES } from './characters.js';

// Детерминированный ГПСЧ (mulberry32). Возвращает функцию () -> [0,1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Только документация: реальное удвоение кубов при крите вшито в каждую способность отдельно.
export const CRIT_DOUBLES_DICE = true;

// tally — необязательный журнал брошенных кубов урона: Талант выбирает из него
// самый низкий куб, поэтому ему нужны отдельные броски, а не их сумма.
export function rollDie(sides, rng, orcReroll, tally) {
  let v = 1 + Math.floor(rng() * sides);
  if (orcReroll && v <= 2) v = 1 + Math.floor(rng() * sides);
  if (tally) tally.push({ sides, roll: v });
  return v;
}

export function sumDice(n, sides, rng, orcReroll, tally) {
  let total = 0;
  for (let i = 0; i < n; i++) total += rollDie(sides, rng, orcReroll, tally);
  return total;
}

export function d20(rng) {
  return 1 + Math.floor(rng() * 20);
}

export function resolveMode(adv, dis) {
  if (adv && !dis) return 'adv';
  if (dis && !adv) return 'dis';
  return 'none';
}

// Один бросок атаки со всеми эффектами, которые правила относят к ЛЮБОЙ атаке,
// а не только к удару оружием: Гениальность (+Интеллект союзника), Кроличья лапка
// (переброс неудачного д20), Гарантированное попадание, Талант.
// first — первый удар за ход: одноразовые эффекты тратятся только на нём.
export function attackOnce(ctx, bonus, ac, mode, first) {
  const m = ctx.mods || {};
  if (first && m.guaranteedHit) return { hit: true, crit: false };
  const b = bonus + (m.genius || 0);
  let r = isHitWithTalent(ctx, attackRoll(ctx.rng, mode), b, ac);
  if (!r.hit && first && m.rabbitFoot) r = isHitWithTalent(ctx, attackRoll(ctx.rng, mode), b, ac);
  return r;
}

// Талант: «пассивно, 3 раза в день» — за ход можно потратить все три,
// но к одному кубу (в том числе к одному д20) — не больше одного раза.
export const TALENT_USES = 3;

// Журнал кубов урона для Таланта; без включённого таланта — undefined, броски не пишутся.
export const talentTally = (ctx) => (ctx.talent ? ctx.talent.tally : undefined);

// Талант: «+3 к любому броску своего куба, но не больше максимума куба».
// На попадание тратится только когда решает исход — промах без него, попадание с ним.
// Крит он не создаёт: критом остаётся натуральная двадцатка.
// Каждый вызов — отдельный д20, поэтому одна атака спасается не больше одного раза.
export function isHitWithTalent(ctx, nat, bonus, ac) {
  const t = ctx.talent;
  const base = isHit(nat, bonus, ac, ctx.critRange, ctx.fumbleRange);
  if (base.hit || !t || t.left <= 0) return base;
  if (nat <= (ctx.fumbleRange ?? 1)) return base; // критическую неудачу талант не спасает
  if (Math.min(nat + 3, 20) + bonus >= ac) {
    t.left -= 1;
    return { hit: true, crit: false };
  }
  return base;
}

// Выбирает кубы с наибольшим запасом до потолка грани и тратит на них заряды —
// по одному заряду на куб.
function pickTalentDice(ctx, dice) {
  const t = ctx.talent;
  if (!t || t.left <= 0) return [];
  const picked = dice
    .map((d) => ({ d, gain: Math.min(d.roll + 3, d.sides) - d.roll }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, t.left);
  t.left -= picked.length;
  return picked;
}

// Тратит заряды Таланта на переданные кубы. Возвращает сумму прибавок.
export function spendTalentOnDice(ctx, dice) {
  return pickTalentDice(ctx, dice).reduce((s, x) => s + x.gain, 0);
}

// Оставшиеся к концу хода заряды уходят в кубы урона, брошенные за ход.
// Прибавка получает тип урона своего куба (type: null — тип не помечен,
// берётся тип первого пакета цели): иначе зелья умножили бы её не той категорией.
export function talentDamagePackets(ctx) {
  const t = ctx.talent;
  if (!t || !t.tally.length) return [];
  const byType = new Map();
  for (const { d, gain } of pickTalentDice(ctx, t.tally)) {
    const type = d.type || null;
    byType.set(type, (byType.get(type) || 0) + gain);
  }
  return [...byType].map(([type, amount]) => ({ type, amount }));
}

export function talentDamageBonus(ctx) {
  return talentDamagePackets(ctx).reduce((s, p) => s + p.amount, 0);
}

// Общий урон области: кубы кидаются один раз на все цели. Талант на них тратится сразу —
// прибавка к общему кубу достаётся каждой цели, — и в журнал они не пишутся,
// иначе остаток Таланта в конце хода лёг бы на них повторно.
export function rollShared(ctx, n, sides) {
  const dice = [];
  return sumDice(n, sides, ctx.rng, ctx.mods.orcReroll, dice) + spendTalentOnDice(ctx, dice);
}

// Режим броска по конкретной цели: к общим флагам хода добавляются состояния цели
// (скованный, окружённый, лежачий, дуэль) — у разных целей они разные.
export function resolveModeFor(adv, dis, target) {
  const t = target || {};
  return resolveMode(!!adv || !!t.adv, !!dis || !!t.dis);
}

export function attackRoll(rng, mode) {
  if (mode === 'none') return d20(rng);
  const a = d20(rng), b = d20(rng);
  return mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
}

// fumbleRange — верхняя граница критической неудачи: у человека «Злой рок» это 2.
export function isHit(nat, bonus, ac, critRange = 20, fumbleRange = 1) {
  if (nat <= fumbleRange) return { hit: false, crit: false };
  if (nat >= critRange) return { hit: true, crit: true };
  return { hit: nat + bonus >= ac, crit: false };
}

// Парсит нотацию кубов 'NdS' и суммирует N бросков dS (с учётом орочьего переброса).
export function rollNotation(notation, rng, orcReroll, tally) {
  const m = /^(\d+)d(\d+)$/.exec(String(notation).trim());
  if (!m) throw new Error(`Не распознана кость: ${notation}`);
  return sumDice(Number(m[1]), Number(m[2]), rng, orcReroll, tally);
}

// Режим спасброска цели i: Сглаз накладывает помеху одной выбранной цели (hexTarget),
// расовая слабость цели («Громоздкий» у голиафа) — помеху к проверкам своей характеристики.
// Две помехи — всё равно одна помеха.
export function saveModeFor(ctx, i, stat) {
  const target = ctx.targets[i];
  const race = target && target.race ? RACES[target.race] : null;
  const raceDis = !!(race && race.saveDis && race.saveDis[stat]);
  const hexed = !!(ctx.mods && ctx.mods.hex) && i === (ctx.mods.hexTarget ?? 0);
  return resolveMode(false, hexed || raceDis);
}
