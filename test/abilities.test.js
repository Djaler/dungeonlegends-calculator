import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { seqRng } from './helpers.js';

const get = (id) => ABILITIES.find((a) => a.id === id);
const ctx = (over) => {
  const stats = over.stats ?? { str: -2, dex: 0, con: -1, wis: 2, int: 4, cha: 1 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: over.critRange ?? 20,
    targets: over.targets ?? [{ ac: 12, hp: 30 }],
    mods: { orcReroll: false, hex: false, adv: false, dis: false, ...(over.mods || {}) },
    params: over.params || {},
    weapon: over.weapon ?? { dice: '1d4', stat: 'dex' },
  };
};

test('magicMissiles: 3 снаряда 1д4+1 авто по одной цели — пакеты magic', () => {
  const p = get('magicMissiles').simulateOnce(ctx({ rng: seqRng([0, 0, 0]) }));
  // одна цель, три пакета по 1+1=2 (д4=1 при rng 0)
  assert.deepEqual(p, [[{ type: 'magic', amount: 2 }, { type: 'magic', amount: 2 }, { type: 'magic', amount: 2 }]]);
});

test('magicMissiles распределяет снаряды по нескольким целям по кругу', () => {
  const p = get('magicMissiles').simulateOnce(ctx({
    rng: seqRng([0.99, 0.99, 0.99]),
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  // каждый снаряд д4=4 -> 5; по одному на цель
  assert.deepEqual(p, [
    [{ type: 'magic', amount: 5 }],
    [{ type: 'magic', amount: 5 }],
    [{ type: 'magic', amount: 5 }],
  ]);
});

test('fireball: провал спасброска = полный 6д6 fire', () => {
  const rng = seqRng([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 36 }]]);
});

test('fireball: успех спасброска = половина (вниз)', () => {
  const rng = seqRng([0.99, 0, 0, 0, 0, 0, 0]);
  const p = get('fireball').simulateOnce(ctx({ rng }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 3 }]]);
});

test('fireball: спасбросок берёт ловкость каждой цели (saves.dex)', () => {
  const rng = seqRng([0.45, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('fireball').simulateOnce(ctx({ rng, targets: [{ ac: 12, hp: 99, saves: { dex: 20 } }] }));
  assert.deepEqual(p, [[{ type: 'fire', amount: 18 }]]);
});

test('staff: попадание 1д4 physical по выбранной цели, промах — пусто', () => {
  // посох — оружие на ловкость: dex=0, ac=12 -> нужен nat>=12. 0.7->15, попал; d4 0.5->3
  const hit = get('staff').simulateOnce(ctx({ rng: seqRng([0.7, 0.5]) }));
  assert.deepEqual(hit, [[{ type: 'physical', amount: 3 }]]);
  const miss = get('staff').simulateOnce(ctx({ rng: seqRng([0]) }));
  assert.deepEqual(miss, [[]]);
});

test('staff бьёт по стату оружия (ловкость), а не по Интеллекту', () => {
  // nat 11 при dex 0 против ac 12 — промах. По Интеллекту (+4) это было бы попаданием.
  const p = get('staff').simulateOnce(ctx({ rng: seqRng([0.5]) }));
  assert.deepEqual(p, [[]]);
});

test('telekinesis бьёт по Интеллекту и не добавляет стат к урону', () => {
  // nat 11 + int 4 = 15 >= ac 12 -> попал; d4 0.5->3, без прибавки стата
  const p = get('telekinesis').simulateOnce(ctx({ rng: seqRng([0.5, 0.5]) }));
  assert.deepEqual(p, [[{ type: 'magic', amount: 3 }]]);
});

test('chainLightning: цель 0 авто 2д6 lightning, цепь рвётся на промахе', () => {
  const rng = seqRng([0.99, 0.99, 0]);
  const p = get('chainLightning').simulateOnce(ctx({
    rng,
    targets: [{ ac: 12, hp: 30 }, { ac: 12, hp: 30 }, { ac: 12, hp: 30 }],
  }));
  assert.deepEqual(p, [[{ type: 'lightning', amount: 12 }], [], []]);
});

test('chainLightning: явный порядок (params.order) соблюдается', () => {
  // seq=[0,1,0]: t0 авто 2d6 (0.99,0.99->12); t1 атака(0.99)+крит 4d6 (0.99×4->24); t2 атака(0.99)+крит 4d6 (0.99×4->24)
  // итого 2+1+4+1+4=12 значений rng
  const rng = seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const p = get('chainLightning').simulateOnce(ctx({
    rng,
    params: { order: [0, 1, 0] },
    targets: [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }],
  }));
  // t0: авто 12 + крит 24 = два пакета; t1: крит 24
  assert.deepEqual(p, [
    [{ type: 'lightning', amount: 12 }, { type: 'lightning', amount: 24 }],
    [{ type: 'lightning', amount: 24 }],
  ]);
});

test('способности волшебника несут UI-метаданные релевантности', () => {
  assert.equal(get('fireball').usesSave, true);
  assert.equal(get('chainLightning').usesAttackRoll, true);
  assert.equal(get('magicMissiles').category, 'magic');
  assert.equal(get('staff').category, 'physical');
});

test('magicMissiles с орочьим перебросом: d4 реролл при ≤2', () => {
  const p = get('magicMissiles').simulateOnce(ctx({
    rng: seqRng([0, 0.99, 0, 0.99, 0, 0.99]),
    mods: { orcReroll: true },
  }));
  assert.deepEqual(p, [[{ type: 'magic', amount: 5 }, { type: 'magic', amount: 5 }, { type: 'magic', amount: 5 }]]);
});

test('basicAttack: попадание = куб оружия + стат владения, тип physical', () => {
  // оружие 1d10, стат str=3. attackRoll none: nat=floor(0.5*20)+1=11; 11+3>=10 hit.
  // урон d10 rng 0.99 ->10, +3 = 13.
  const p = get('basicAttack').simulateOnce(ctx({
    rng: seqRng([0.5, 0.99]),
    stats: { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '1d10', stat: 'str' },
    targets: [{ ac: 10, hp: 30 }],
  }));
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('basicAttack: промах = пустой пакет', () => {
  // nat=1 (rng 0) -> промах
  const p = get('basicAttack').simulateOnce(ctx({
    rng: seqRng([0]),
    stats: { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '1d10', stat: 'str' },
    targets: [{ ac: 10, hp: 30 }],
  }));
  assert.deepEqual(p, [[]]);
});

test('staff крит: 1д4 удваивается', () => {
  // int=4, target ac=12; nat=0.99->20 crit; два d4 0.99->4 each =8
  const hit = get('staff').simulateOnce(ctx({ rng: seqRng([0.99, 0.99, 0.99]) }));
  assert.deepEqual(hit, [[{ type: 'physical', amount: 8 }]]);
});

test('chainLightning крит: 2д6 удваиваются до 4д6', () => {
  // seq [0,1]; t0 авто 2d6 (0.99,0.99->12) no crit; t1: атака(0.99)->20 crit; 4d6 (0.99×4->24)
  // итого 2+1+4=7 значений rng
  const p = get('chainLightning').simulateOnce(ctx({
    rng: seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
    params: { order: [0, 1] },
    targets: [{ ac: 10, hp: 99 }, { ac: 10, hp: 99 }],
  }));
  // t0: авто 2d6 0.99->12; t1: crit 4d6 0.99->24
  assert.deepEqual(p, [
    [{ type: 'lightning', amount: 12 }],
    [{ type: 'lightning', amount: 24 }],
  ]);
});

test('unknownAttack: ровно 15 психического по цели', () => {
  const p = get('unknownAttack').simulateOnce(ctx({ rng: seqRng([]), targets:[{ac:99,hp:99}], params:{target:0} }));
  assert.deepEqual(p, [[{ type: 'psychic', amount: 15 }]]);
});
