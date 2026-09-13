import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, rollDie, sumDice, d20, resolveMode, attackRoll, isHit, CRIT_DOUBLES_DICE, rollNotation } from '../src/engine.js';
import { seqRng } from './helpers.js';

test('makeRng детерминирован по зерну', () => {
  const a = makeRng(42), b = makeRng(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('makeRng выдаёт значения в [0,1)', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test('разные зёрна дают разные потоки', () => {
  const a = makeRng(1), b = makeRng(2);
  assert.notEqual(a(), b());
});

test('rollDie без переброса: значение 1..sides', () => {
  // rng()=0 -> 1, rng()=0.999 -> sides
  assert.equal(rollDie(6, seqRng([0]), false), 1);
  assert.equal(rollDie(6, seqRng([0.999]), false), 6);
});

test('rollDie с орочьим перебросом: 1 перекидывается один раз', () => {
  // первый бросок -> 1 (rng=0), переброс -> 5 (rng=0.7 на d6 = floor(0.7*6)+1=5)
  assert.equal(rollDie(6, seqRng([0, 0.7]), true), 5);
});

test('rollDie с орочьим перебросом: 3 не перекидывается', () => {
  // floor(0.4*6)+1 = 3 -> остаётся, второй элемент не трогается
  assert.equal(rollDie(6, seqRng([0.4]), true), 3);
});

test('rollDie орочий переброс принимает новое значение даже если снова 1-2', () => {
  // 1 -> переброс -> 2 (принимаем, второй раз не перекидываем)
  assert.equal(rollDie(6, seqRng([0, 0.2]), true), 2);
});

test('sumDice складывает n кубиков', () => {
  assert.equal(sumDice(3, 6, seqRng([0, 0, 0]), false), 3);
});

test('resolveMode гасит преимущество и помеху', () => {
  assert.equal(resolveMode(true, true), 'none');
  assert.equal(resolveMode(true, false), 'adv');
  assert.equal(resolveMode(false, true), 'dis');
  assert.equal(resolveMode(false, false), 'none');
});

test('attackRoll adv берёт максимум двух d20', () => {
  // d20: floor(rng*20)+1. 0->1, 0.95->20. adv -> 20
  assert.equal(attackRoll(seqRng([0, 0.95]), 'adv'), 20);
});

test('attackRoll dis берёт минимум двух d20', () => {
  assert.equal(attackRoll(seqRng([0.95, 0]), 'dis'), 1);
});

test('isHit: нат.20 — крит', () => {
  assert.deepEqual(isHit(20, -5, 99), { hit: true, crit: true });
});

test('isHit: нат.1 — промах', () => {
  assert.deepEqual(isHit(1, 50, 5), { hit: false, crit: false });
});

test('isHit: обычное сравнение nat+bonus vs ac', () => {
  assert.deepEqual(isHit(10, 4, 14), { hit: true, crit: false });
  assert.deepEqual(isHit(10, 4, 15), { hit: false, crit: false });
});

test('CRIT_DOUBLES_DICE включён (крит удваивает кубы)', () => {
  assert.equal(CRIT_DOUBLES_DICE, true);
});

test('isHit: critRange 18 делает натуралку 18 крит-попаданием мимо КБ', () => {
  const r = isHit(18, 0, 99, 18); // 18+0 < 99, но 18 >= critRange -> крит
  assert.deepEqual(r, { hit: true, crit: true });
});

test('isHit: critRange по умолчанию 20 (натуралка 19 — обычный бросок)', () => {
  assert.deepEqual(isHit(19, 0, 99), { hit: false, crit: false });
  assert.deepEqual(isHit(20, 0, 99), { hit: true, crit: true });
});

test('isHit: натуралка 1 — всегда промах даже при низком critRange', () => {
  assert.deepEqual(isHit(1, 50, 5, 2), { hit: false, crit: false });
});

test('rollNotation: 2d4 = два д4', () => {
  // rng 0.99,0.99 -> 4+4 = 8
  assert.equal(rollNotation('2d4', seqRng([0.99, 0.99]), false), 8);
});

test('rollNotation: 1d12 = один д12', () => {
  assert.equal(rollNotation('1d12', seqRng([0]), false), 1); // rng 0 -> 1
});

test('rollNotation: орочий переброс прокидывается в кости', () => {
  // 1d8: rng 0->1 (<=2 реролл) -> rng 0.99 -> 8
  assert.equal(rollNotation('1d8', seqRng([0, 0.99]), true), 8);
});

test('rollNotation: мусор бросает ошибку', () => {
  assert.throws(() => rollNotation('abc', seqRng([0]), false), /кость/i);
});
