import { categoryOf } from './types.js';
import { sumDice } from './engine.js';
import { RACES } from './characters.js';

// (1) Аддитив атакующего: концентрация добавляет 2д6 магии (за стак)
// первой цели, у которой уже есть урон.
function addAttackerAdditive(packets, ctx) {
  const stacks = Number(ctx.mods.concentration) || 0;
  if (stacks <= 0) return packets;
  let bonus = 0;
  for (let s = 0; s < stacks; s++) bonus += sumDice(2, 6, ctx.rng, ctx.mods.orcReroll);
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: bonus }];
  return packets;
}

// (1b) Воодушевление барда: +1д6 магии к первой цели с уроном.
function addInspiration(packets, ctx) {
  if (!ctx.mods.inspiration) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll) }];
  return packets;
}

// (1c) Руна стихий: конвертировать тип всех пакетов, добавить 1д6 первой цели с уроном.
function applyRuneOfElements(packets, ctx) {
  if (!ctx.mods.runeOfElements) return packets;
  const t = ctx.mods.runeType || 'fire';
  let p = packets.map((arr) => arr.map((pk) => ({ ...pk, type: t })));
  const idx = p.findIndex((arr) => arr.length > 0);
  const target = idx >= 0 ? idx : 0;
  p[target] = [...(p[target] || []), { type: t, amount: sumDice(1, 6, ctx.rng, ctx.mods.orcReroll) }];
  return p;
}

// (2) Множители атакующего по категории урона + настойка (×2 всего).
function applyMultipliers(packets, ctx) {
  const mult = (cat) => (cat === 'physical' ? (ctx.mods.rage ? 2 : 1) : (ctx.mods.chaos ? 2 : 1));
  const tinctureF = ctx.mods.tincture ? 2 : 1;
  return packets.map((arr) =>
    arr.map((p) => ({ ...p, amount: p.amount * mult(categoryOf(p.type)) * tinctureF })));
}

// (3)+(4) Правила цели по категории + сумма в число.
function finalizeTarget(arr, target) {
  const sums = { physical: 0, magic: 0 };
  for (const p of arr) sums[categoryOf(p.type)] += p.amount;
  const rule = target && target.race ? (RACES[target.race] || {}).onIncoming : null;
  if (rule) {
    for (const cat of ['physical', 'magic']) {
      if (!rule[cat]) continue;
      // Прибавка идёт «к магическому урону», а не вместо него: если урона этой
      // категории не было (промах или удар другой категории), прибавлять не к чему.
      if (rule[cat].add != null && sums[cat] > 0) sums[cat] += rule[cat].add;
      if (rule[cat].mult != null) sums[cat] = Math.floor(sums[cat] * rule[cat].mult);
    }
  }
  return sums.physical + sums.magic;
}

export function applyPipeline(packets, ctx) {
  let p = packets.map((arr) => arr.slice());
  p = addAttackerAdditive(p, ctx);
  p = addInspiration(p, ctx);
  p = applyRuneOfElements(p, ctx);
  p = applyMultipliers(p, ctx);
  return p.map((arr, i) => finalizeTarget(arr, ctx.targets[i]));
}
