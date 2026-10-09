import { categoryOf } from './types.js';
import { rollTyped, talentDamagePackets } from './engine.js';
import { RACES } from './characters.js';

// (1) Аддитив атакующего: концентрация добавляет 2д6 магии (за стак)
// первой цели, у которой уже есть урон.
function addAttackerAdditive(packets, ctx) {
  const stacks = Number(ctx.mods.concentration) || 0;
  if (stacks <= 0) return packets;
  let bonus = 0;
  for (let s = 0; s < stacks; s++) bonus += rollTyped(ctx, 2, 6, 'magic');
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: bonus }];
  return packets;
}

// (1b) Воодушевление барда: +1д6 магии к первой цели с уроном.
function addInspiration(packets, ctx) {
  if (!ctx.mods.inspiration) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'magic', amount: rollTyped(ctx, 1, 6, 'magic') }];
  return packets;
}

// (1c) Могучий (голиаф): +1д4 к физическому урону первой цели, которой он нанесён.
function addMighty(packets, ctx) {
  if (!ctx.mods.mighty) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0 && categoryOf(p.type) === 'physical'));
  if (idx >= 0) packets[idx] = [...packets[idx], { type: 'physical', amount: rollTyped(ctx, 1, 4, 'physical') }];
  return packets;
}

// (1d) Руна стихий: конвертировать тип всех пакетов, добавить 1д6 первой цели с уроном.
function applyRuneOfElements(packets, ctx) {
  if (!ctx.mods.runeOfElements) return packets;
  const t = ctx.mods.runeType || 'fire';
  let p = packets.map((arr) => arr.map((pk) => ({ ...pk, type: t })));
  // «К нанесённому урону»: при промахе прибавлять не к чему.
  const idx = p.findIndex((arr) => arr.some((pk) => pk.amount > 0));
  if (idx >= 0) p[idx] = [...p[idx], { type: t, amount: rollTyped(ctx, 1, 6, t) }];
  return p;
}

// (1e) Остаток Таланта — в самые выгодные кубы хода, прибавкой типа своего куба.
// С Руной стихий весь урон уже её типа — прибавка тоже.
function addTalentResidual(packets, ctx) {
  const extra = talentDamagePackets(ctx);
  if (!extra.length) return packets;
  const idx = packets.findIndex((arr) => arr.some((p) => p.amount > 0));
  if (idx < 0) return packets;
  const rune = ctx.mods.runeOfElements ? (ctx.mods.runeType || 'fire') : null;
  const first = packets[idx][0].type;
  packets[idx] = [...packets[idx], ...extra.map((p) => ({ type: rune || p.type || first, amount: p.amount }))];
  return packets;
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
  p = addMighty(p, ctx);
  p = applyRuneOfElements(p, ctx);
  p = addTalentResidual(p, ctx);
  p = applyMultipliers(p, ctx);
  return p.map((arr, i) => finalizeTarget(arr, ctx.targets[i]));
}
