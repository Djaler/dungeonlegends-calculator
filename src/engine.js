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

// Журнал кубов урона для Таланта; без включённого таланта — undefined, броски не пишутся.
export const talentTally = (ctx) => (ctx.talent ? ctx.talent.tally : undefined);

// Талант: «+3 к любому броску своего куба, но не больше максимума куба».
// На попадание тратится только когда решает исход — промах без него, попадание с ним.
// Крит он не создаёт: критом остаётся натуральная двадцатка.
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

// Остался свободным к концу хода — уходит в самый низкий из брошенных кубов урона:
// там у него больше всего запаса до потолка грани.
export function talentDamageBonus(ctx) {
  const t = ctx.talent;
  if (!t || t.left <= 0 || !t.tally.length) return 0;
  let best = 0;
  for (const d of t.tally) best = Math.max(best, Math.min(d.roll + 3, d.sides) - d.roll);
  if (best > 0) t.left -= 1;
  return best;
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
