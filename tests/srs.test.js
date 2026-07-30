import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRecord, review, nextInterval, addDays, countIntroducedToday } from '../js/srs.js';

const T = '2026-07-30';
const NOW = '2026-07-30T12:00:00.000Z';

test('addDays', () => {
  assert.equal(addDays('2026-07-30', 3), '2026-08-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('간격 사다리: 0→1→3→7→15→33', () => {
  assert.equal(nextInterval(0), 1);
  assert.equal(nextInterval(1), 3);
  assert.equal(nextInterval(3), 7);
  assert.equal(nextInterval(7), 15);
  assert.equal(nextInterval(15), 33);
});

test('newRecord 초기값', () => {
  const r = newRecord(T, NOW);
  assert.deepEqual(r, { interval: 0, due: T, stage: 1, reps: 0, lapses: 0, introducedOn: T, recFails: 0, selfAssess: false, updatedAt: NOW });
});

test('pass: 간격 성장 + due 갱신', () => {
  const r = review(newRecord(T, NOW), 'pass', T, NOW);
  assert.equal(r.interval, 1);
  assert.equal(r.due, '2026-07-31');
  assert.equal(r.reps, 1);
});

test('hard: 간격 유지(최소 1일)', () => {
  let r = { ...newRecord(T, NOW), interval: 7 };
  r = review(r, 'hard', T, NOW);
  assert.equal(r.interval, 7);
  assert.equal(r.due, addDays(T, 7));
});

test('fail: 1일로 리셋 + lapses 증가', () => {
  let r = { ...newRecord(T, NOW), interval: 16, stage: 2 };
  r = review(r, 'fail', T, NOW);
  assert.equal(r.interval, 1);
  assert.equal(r.lapses, 1);
  assert.equal(r.stage, 2); // 강등 없음
});

test('큐 2단계 승급: interval>=7 도달 시', () => {
  let r = { ...newRecord(T, NOW), interval: 3 };
  r = review(r, 'pass', T, NOW); // 3→7
  assert.equal(r.stage, 2);
});

test('countIntroducedToday', () => {
  const recs = { a: { introducedOn: T }, b: { introducedOn: '2026-07-29' } };
  assert.equal(countIntroducedToday(recs, T), 1);
});
