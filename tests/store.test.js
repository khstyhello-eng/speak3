import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, mergeRecords, mergeState, exportJson, importJson } from '../js/store.js';

const rec = (updatedAt, interval) => ({ interval, due: '2026-08-01', stage: 1, reps: 1, lapses: 0, introducedOn: '2026-07-30', recFails: 0, selfAssess: false, updatedAt });

test('mergeRecords: 문장별 최신 updatedAt 승리', () => {
  const a = { s1: rec('2026-07-30T10:00:00Z', 1), s2: rec('2026-07-30T09:00:00Z', 3) };
  const b = { s1: rec('2026-07-30T11:00:00Z', 7), s3: rec('2026-07-30T08:00:00Z', 1) };
  const m = mergeRecords(a, b);
  assert.equal(m.s1.interval, 7);
  assert.equal(m.s2.interval, 3);
  assert.equal(m.s3.interval, 1);
});

test('mergeState: custom은 id 기준 합집합, settings는 최신 상태 승리', () => {
  const local = { ...defaultState(), updatedAt: '2026-07-30T10:00:00Z', settings: { newPerDay: 5 }, custom: { src: [{ id: 'c1', en: 'x', ko: 'y' }] } };
  const remote = { ...defaultState(), updatedAt: '2026-07-30T11:00:00Z', settings: { newPerDay: 8 }, custom: { src: [{ id: 'c1', en: 'x', ko: 'y' }, { id: 'c2', en: 'z', ko: 'w' }] } };
  const m = mergeState(local, remote);
  assert.equal(m.settings.newPerDay, 8);
  assert.deepEqual(m.custom.src.map((s) => s.id).sort(), ['c1', 'c2']);
  assert.equal(m.updatedAt, '2026-07-30T11:00:00Z');
});

test('mergeState: remote가 null이면 local 그대로', () => {
  const local = defaultState();
  assert.equal(mergeState(local, null), local);
});

test('export/import 왕복', () => {
  const s = { ...defaultState(), records: { s1: rec('2026-07-30T10:00:00Z', 1) } };
  const back = importJson(exportJson(s));
  assert.deepEqual(back, s);
});

test('importJson: version 없는 JSON은 거부', () => {
  assert.throws(() => importJson('{"foo":1}'));
});

test('mergeState: local이 더 최신이면 local의 settings 승리', () => {
  const local = { ...defaultState(), updatedAt: '2026-07-30T12:00:00Z', settings: { newPerDay: 7 } };
  const remote = { ...defaultState(), updatedAt: '2026-07-30T09:00:00Z', settings: { newPerDay: 3 } };
  const m = mergeState(local, remote);
  assert.equal(m.settings.newPerDay, 7);
  assert.equal(m.updatedAt, '2026-07-30T12:00:00Z');
});

test('importJson: records:null는 거부', () => {
  assert.throws(() => importJson('{"version":1,"records":null}'));
});

test('defaultState: skipped는 빈 객체', () => {
  assert.deepEqual(defaultState().skipped, {});
});

test('mergeState: skipped는 id 기준 합집합, 충돌 시 최신 timestamp 승리', () => {
  const local = { ...defaultState(), updatedAt: '2026-07-30T10:00:00Z', skipped: { s1: '2026-07-30T09:00:00Z', s2: '2026-07-30T08:00:00Z' } };
  const remote = { ...defaultState(), updatedAt: '2026-07-30T11:00:00Z', skipped: { s1: '2026-07-30T12:00:00Z', s3: '2026-07-30T07:00:00Z' } };
  const m = mergeState(local, remote);
  assert.deepEqual(m.skipped, { s1: '2026-07-30T12:00:00Z', s2: '2026-07-30T08:00:00Z', s3: '2026-07-30T07:00:00Z' });
});

test('export/import 왕복: skipped 보존', () => {
  const s = { ...defaultState(), skipped: { s1: '2026-07-30T10:00:00Z' } };
  const back = importJson(exportJson(s));
  assert.deepEqual(back, s);
});

test('defaultState: variationSel은 빈 객체', () => {
  assert.deepEqual(defaultState().variationSel, {});
});

test('mergeState: variationSel은 문장별 최신 updatedAt 승리', () => {
  const local = { ...defaultState(), updatedAt: '2026-07-30T10:00:00Z', variationSel: { s1: { sel: [0], updatedAt: '2026-07-30T09:00:00Z' }, s2: { sel: [1], updatedAt: '2026-07-30T08:00:00Z' } } };
  const remote = { ...defaultState(), updatedAt: '2026-07-30T11:00:00Z', variationSel: { s1: { sel: [1, 2], updatedAt: '2026-07-30T12:00:00Z' }, s3: { sel: [0], updatedAt: '2026-07-30T07:00:00Z' } } };
  const m = mergeState(local, remote);
  assert.deepEqual(m.variationSel, {
    s1: { sel: [1, 2], updatedAt: '2026-07-30T12:00:00Z' },
    s2: { sel: [1], updatedAt: '2026-07-30T08:00:00Z' },
    s3: { sel: [0], updatedAt: '2026-07-30T07:00:00Z' },
  });
});

test('export/import 왕복: variationSel 보존', () => {
  const s = { ...defaultState(), variationSel: { s1: { sel: [0, 2], updatedAt: '2026-07-30T10:00:00Z' } } };
  const back = importJson(exportJson(s));
  assert.deepEqual(back, s);
});
