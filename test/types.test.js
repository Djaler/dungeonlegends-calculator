import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, categoryOf } from '../src/types.js';

test('physical относится к категории physical', () => {
  assert.equal(categoryOf('physical'), 'physical');
});

test('магические подтипы относятся к категории magic', () => {
  for (const t of ['magic', 'fire', 'lightning', 'necrotic', 'psychic', 'radiant']) {
    assert.equal(categoryOf(t), 'magic', `${t} должен быть magic`);
  }
});

test('TYPES содержит все 7 типов', () => {
  assert.deepEqual(
    Object.keys(TYPES).sort(),
    ['fire', 'lightning', 'magic', 'necrotic', 'physical', 'psychic', 'radiant'],
  );
});

test('categoryOf бросает на неизвестном типе', () => {
  assert.throws(() => categoryOf('holy'), /неизвестный тип/i);
});
