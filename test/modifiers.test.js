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

test('концентрация добавляет 2д6 магии цели с уроном, промах без прибавки', () => {
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

test('расовая прибавка не начисляется на промах', () => {
  // пакетов нет — прибавлять «+2 к магическому» не к чему
  assert.equal(applyPipeline([[]], baseCtx({ targets: [{ race: 'orc' }] }))[0], 0);
  assert.equal(applyPipeline([[]], baseCtx({ targets: [{ race: 'aasimar' }] }))[0], 0);
});

test('расовая прибавка не переходит на чужую категорию', () => {
  // орк слаб к магии: чисто физический удар не должен получать +2
  const orcPhys = applyPipeline([[{ type: 'physical', amount: 10 }]], baseCtx({ targets: [{ race: 'orc' }] }));
  assert.equal(orcPhys[0], 10);
  // а магический — должен
  const orcMagic = applyPipeline([[{ type: 'magic', amount: 10 }]], baseCtx({ targets: [{ race: 'orc' }] }));
  assert.equal(orcMagic[0], 12);
  // аасимар зеркально: слаб к физическому
  const aasMagic = applyPipeline([[{ type: 'magic', amount: 10 }]], baseCtx({ targets: [{ race: 'aasimar' }] }));
  assert.equal(aasMagic[0], 10);
  const aasPhys = applyPipeline([[{ type: 'physical', amount: 10 }]], baseCtx({ targets: [{ race: 'aasimar' }] }));
  assert.equal(aasPhys[0], 12);
});

test('смешанный урон: прибавка идёт только своей категории', () => {
  // по орку 10 физ + 10 маг: +2 только к магической половине
  const out = applyPipeline(
    [[{ type: 'physical', amount: 10 }, { type: 'magic', amount: 10 }]],
    baseCtx({ targets: [{ race: 'orc' }] }),
  );
  assert.equal(out[0], 22);
});

test('Руна стихий: конверсия типа + 1д6', () => {
  // конвертим всё в radiant, +1д6 radiant. база physical 5 -> radiant 5; +6 =11 radiant
  const out = applyPipeline([[{type:'physical',amount:5}]], baseCtx({ rng: seqRng([0.99]), mods:{ runeOfElements:true, runeType:'radiant' } }));
  assert.deepEqual(out, [11]);
});

test('Могучий: +1д4 физ первой цели с физическим уроном', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }], [{ type: 'physical', amount: 5 }]], baseCtx({ mods: { mighty: true } }));
  assert.deepEqual(out, [10, 9]); // д4 при 0.99 = 4
});

test('Могучий: без физического урона ничего не добавляет', () => {
  const out = applyPipeline([[{ type: 'fire', amount: 10 }]], baseCtx({ mods: { mighty: true } }));
  assert.deepEqual(out, [10]);
});

test('Могучий удваивается зельем ярости', () => {
  const out = applyPipeline([[{ type: 'physical', amount: 5 }]], baseCtx({ mods: { mighty: true, rage: true } }));
  assert.deepEqual(out, [18]); // (5 + 4) × 2
});

test('Руна стихий: при промахе прибавлять не к чему', () => {
  // ни одного пакета урона — д6 руны не кидается (иначе seqRng исчерпался бы)
  const out = applyPipeline([[], []], baseCtx({ rng: seqRng([]), targets: [{}, {}], mods: { runeOfElements: true, runeType: 'fire' } }));
  assert.deepEqual(out, [0, 0]);
});

test('Руна стихий: д6 получает только цель, которой нанесён урон', () => {
  const out = applyPipeline([[], [{ type: 'physical', amount: 5 }]], baseCtx({ rng: seqRng([0.99]), targets: [{}, {}], mods: { runeOfElements: true, runeType: 'fire' } }));
  assert.deepEqual(out, [0, 11]);
});

test('Руна стихий: один д6 на всех целей, которым нанесён урон', () => {
  // д6 кидается один раз (в seqRng одно значение) и достаётся обеим раненым целям; промах — без прибавки
  const out = applyPipeline(
    [[{ type: 'fire', amount: 5 }], [], [{ type: 'fire', amount: 3 }]],
    baseCtx({ rng: seqRng([0.99]), targets: [{}, {}, {}], mods: { runeOfElements: true, runeType: 'fire' } }),
  );
  assert.deepEqual(out, [11, 0, 9]);
});

test('концентрация: один бросок 2д6 на всех целей с уроном', () => {
  // 2д6 = 6 + 1 по общему броску → +7 каждой раненой цели
  const out = applyPipeline(
    [[{ type: 'fire', amount: 5 }], [{ type: 'fire', amount: 3 }]],
    baseCtx({ rng: seqRng([0.99, 0]), targets: [{}, {}], mods: { concentration: 1 } }),
  );
  assert.deepEqual(out, [12, 10]);
});

test('Талант на общем кубе концентрации достаётся каждой цели', () => {
  // 2д6 = 6 + 1, Талант +3 к единице → +10 каждой из двух целей; заряд потрачен
  const c = baseCtx({ rng: seqRng([0.99, 0]), targets: [{}, {}], mods: { concentration: 1 } });
  c.talent = { left: 1, tally: [] };
  assert.deepEqual(applyPipeline([[{ type: 'fire', amount: 5 }], [{ type: 'fire', amount: 3 }]], c), [15, 13]);
  assert.equal(c.talent.left, 0);
});

test('Талант: остаток ложится и на д6 Воодушевления', () => {
  // физика 5, воодушевление д6 = 1, Талант +3 к нему магией → 5 + 1 + 3
  const c = baseCtx({ rng: seqRng([0]), mods: { inspiration: true } });
  c.talent = { left: 1, tally: [] };
  assert.deepEqual(applyPipeline([[{ type: 'physical', amount: 5 }]], c), [9]);
  assert.equal(c.talent.left, 0);
});

test('Талант: с Руной стихий прибавка получает тип руны', () => {
  // куб оружия 1 (+3), д6 руны = 6 (некуда); всё огонь, хаос ×2 → (5 + 6 + 3) × 2
  const c = baseCtx({ rng: seqRng([0.99]), mods: { runeOfElements: true, runeType: 'fire', chaos: true } });
  c.talent = { left: 3, tally: [{ sides: 6, roll: 1 }] };
  assert.deepEqual(applyPipeline([[{ type: 'physical', amount: 5 }]], c), [28]);
});
