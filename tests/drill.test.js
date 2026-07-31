import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariation } from '../js/ui/drill.js';

const sentence = { variations: [{ en: 'a', ko: '가' }, { en: 'b', ko: '나' }] };

test('pickVariation: interval<15면 null', () => {
  assert.equal(pickVariation({ interval: 14, reps: 3 }, sentence), null);
  assert.equal(pickVariation({ interval: 0, reps: 0 }, sentence), null);
});

test('pickVariation: variations 없으면(빈 배열/undefined) null', () => {
  assert.equal(pickVariation({ interval: 33, reps: 5 }, { variations: [] }), null);
  assert.equal(pickVariation({ interval: 33, reps: 5 }, {}), null);
});

test('pickVariation: interval>=15면 reps % 개수 로 결정적 로테이션', () => {
  assert.deepEqual(pickVariation({ interval: 15, reps: 0 }, sentence), { idx: 0, v: sentence.variations[0] });
  assert.deepEqual(pickVariation({ interval: 15, reps: 1 }, sentence), { idx: 1, v: sentence.variations[1] });
  assert.deepEqual(pickVariation({ interval: 33, reps: 2 }, sentence), { idx: 0, v: sentence.variations[0] });
  assert.deepEqual(pickVariation({ interval: 71, reps: 3 }, sentence), { idx: 1, v: sentence.variations[1] });
});

test('pickVariation: record/sentence 자체가 없어도 안전하게 null', () => {
  assert.equal(pickVariation(null, sentence), null);
  assert.equal(pickVariation({ interval: 15, reps: 0 }, null), null);
});
