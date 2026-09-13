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

export function rollDie(sides, rng, orcReroll) {
  let v = 1 + Math.floor(rng() * sides);
  if (orcReroll && v <= 2) v = 1 + Math.floor(rng() * sides);
  return v;
}

export function sumDice(n, sides, rng, orcReroll) {
  let total = 0;
  for (let i = 0; i < n; i++) total += rollDie(sides, rng, orcReroll);
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

export function attackRoll(rng, mode) {
  if (mode === 'none') return d20(rng);
  const a = d20(rng), b = d20(rng);
  return mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
}

export function isHit(nat, bonus, ac, critRange = 20) {
  if (nat === 1) return { hit: false, crit: false };
  if (nat >= critRange) return { hit: true, crit: true };
  return { hit: nat + bonus >= ac, crit: false };
}

// Парсит нотацию кубов 'NdS' и суммирует N бросков dS (с учётом орочьего переброса).
export function rollNotation(notation, rng, orcReroll) {
  const m = /^(\d+)d(\d+)$/.exec(String(notation).trim());
  if (!m) throw new Error(`Не распознана кость: ${notation}`);
  return sumDice(Number(m[1]), Number(m[2]), rng, orcReroll);
}
