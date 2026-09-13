// test/modifiers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPipeline } from '../src/modifiers.js';
import { seqRng } from './helpers.js';

const baseCtx = (over) => ({
  rng: over.rng || (() => 0.99),
  targets: over.targets || [{}],
  mods: { concentration: 0, chaos: false, rage: false, orcReroll: false,
    tincture: false, inspiration: false, runeOfElements: false, runeType: undefined,
    ...(over.mods || {}) },
});

test('без модификаторов и рас — просто сумма пакетов на цель', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]], baseCtx({}));
  assert.deepEqual(out, [15]);
});

test('хаос ×2 удваивает только магическую категорию', () => {
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]],
    baseCtx({ mods: { chaos: true } }),
  );
  assert.deepEqual(out, [25]); // 10*2 + 5
});

test('ярость ×2 удваивает только физическую категорию', () => {
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }, { type: 'physical', amount: 5 }]],
    baseCtx({ mods: { rage: true } }),
  );
  assert.deepEqual(out, [20]); // 10 + 5*2
});

test('правило цели: орк +2 к получаемому магическому', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ targets: [{ race: 'orc' }] }));
  assert.deepEqual(out, [12]);
});

test('правило цели: дварф ×0.5 к магическому (floor)', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 9 }]], baseCtx({ targets: [{ race: 'dwarf' }] }));
  assert.deepEqual(out, [4]); // floor(9/2)
});

test('порядок: хаос (×2) до правила цели орка (+2)', () => {
  // 10 маг -> хаос ×2 = 20 -> орк +2 = 22 (а не (10+2)*2=24)
  const out = applyPipeline(
    [[{ type: 'fire', amount: 10 }]],
    baseCtx({ mods: { chaos: true }, targets: [{ race: 'orc' }] }),
  );
  assert.deepEqual(out, [22]);
});

test('уникальный противник без расы — правила не применяются', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ targets: [{}] }));
  assert.deepEqual(out, [10]);
});

test('концентрация добавляет 2д6 магии первой цели с уроном', () => {
  // 1 стак: 2д6 по rng 0.99 = 12, прибавляется к первой ненулевой цели
  const out = applyPipeline(
    [[], [{ type: 'physical', amount: 5 }]],
    baseCtx({ rng: seqRng([0.99, 0.99]), mods: { concentration: 1 } }),
  );
  assert.deepEqual(out, [0, 17]); // 5 + 12
});

test('концентрация: 2 заряда добавляют 4д6 (стакаются)', () => {
  // 2 заряда -> 4 кубика д6, по rng 0.99 каждый = 6 -> +24 к первой ненулевой цели
  const out = applyPipeline(
    [[{ type: 'physical', amount: 5 }]],
    baseCtx({ rng: seqRng([0.99, 0.99, 0.99, 0.99]), mods: { concentration: 2 } }),
  );
  assert.deepEqual(out, [29]); // 5 + 24
});

test('концентрация: 0 зарядов ничего не добавляет', () => {
  const out = applyPipeline(
    [[{ type: 'physical', amount: 5 }]],
    baseCtx({ mods: { concentration: 0 } }),
  );
  assert.deepEqual(out, [5]);
});

test('настойка: ×2 весь урон (физ и маг)', () => {
  const out = applyPipeline([[{type:'fire',amount:10},{type:'physical',amount:5}]], baseCtx({ mods:{ tincture:true } }));
  assert.deepEqual(out, [30]); // (10+5)*2
});

test('воодушевление: +1д6 первой цели с уроном', () => {
  const out = applyPipeline([[{type:'physical',amount:5}]], baseCtx({ rng: seqRng([0.99]), mods:{ inspiration:true } }));
  assert.deepEqual(out, [11]); // 5 + 6
});

test('Руна стихий: конверсия типа + 1д6', () => {
  // конвертим всё в radiant, +1д6 radiant. база physical 5 -> radiant 5; +6 =11 radiant
  const out = applyPipeline([[{type:'physical',amount:5}]], baseCtx({ rng: seqRng([0.99]), mods:{ runeOfElements:true, runeType:'radiant' } }));
  assert.deepEqual(out, [11]);
});
