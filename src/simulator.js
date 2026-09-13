import { makeRng } from './engine.js';
import { applyPipeline } from './modifiers.js';

export function runAbility(ability, baseCtx, opts) {
  const trials = opts.trials;
  const rng = makeRng(opts.seed);
  // Второе действие Решительности приходит уже разрешённым объектом: симулятор
  // намеренно не знает о каталоге способностей.
  const resolveAbility = opts.resolveAbility || null;
  const resolveParams = opts.resolveParams || {};
  const n = baseCtx.targets.length;
  const perTargetSum = new Array(n).fill(0);
  const killCount = new Array(n).fill(0);
  const groupFreq = new Map();
  const targetFreq = Array.from({ length: n }, () => new Map());
  let groupMin = Infinity, groupMax = -Infinity;

  for (let t = 0; t < trials; t++) {
    const ctx = { ...baseCtx, rng };
    ctx.attackBonus = (stat) => (ctx.stats ? ctx.stats[stat] : 0);
    const packets = ability.simulateOnce(ctx);
    if (resolveAbility) {
      // Решительность (человек): второе действие за ход — своей способностью
      // и со своими параметрами; его урон делится пополам.
      // Пакеты вливаются до пайплайна, чтобы разовые за ход прибавки (концентрация,
      // воодушевление) начислились один раз, а не по разу на действие.
      const second = resolveAbility.simulateOnce({ ...ctx, params: resolveParams });
      second.forEach((arr, i) => {
        for (const p of arr) packets[i].push({ ...p, amount: Math.floor(p.amount / 2) });
      });
    }
    const dmg = applyPipeline(packets, ctx);
    let group = 0;
    for (let i = 0; i < n; i++) {
      perTargetSum[i] += dmg[i];
      group += dmg[i];
      if (dmg[i] >= baseCtx.targets[i].hp) killCount[i]++;
      targetFreq[i].set(dmg[i], (targetFreq[i].get(dmg[i]) || 0) + 1);
    }
    groupFreq.set(group, (groupFreq.get(group) || 0) + 1);
    if (group < groupMin) groupMin = group;
    if (group > groupMax) groupMax = group;
  }

  let groupSum = 0;
  for (const [g, c] of groupFreq) groupSum += g * c;

  return {
    perTargetMean: perTargetSum.map((s) => s / trials),
    groupMean: groupSum / trials,
    groupMin: groupMin === Infinity ? 0 : groupMin,
    groupMax: groupMax === -Infinity ? 0 : groupMax,
    groupFreq,
    targetFreq,
    killCount,
    trials,
  };
}

export function pAtLeast(groupFreq, trials, x) {
  let count = 0;
  for (const [g, c] of groupFreq) if (g >= x) count += c;
  return count / trials;
}

export function killChance(metrics, i) {
  return metrics.killCount[i] / metrics.trials;
}

export function compareAbilities(abilities, baseCtx, opts) {
  return abilities
    .map((a) => {
      const m = runAbility(a, baseCtx, opts);
      return { id: a.id, name: a.name, charges: a.charges, groupMean: m.groupMean };
    })
    .sort((x, y) => y.groupMean - x.groupMean);
}
