import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariation, deferInQueue } from '../js/ui/drill.js';

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

test('pickVariation: sel=null(생략)이면 기존 동작과 동일 — 전체 variations에서 로테이션', () => {
  assert.deepEqual(pickVariation({ interval: 15, reps: 0 }, sentence, null), { idx: 0, v: sentence.variations[0] });
  assert.deepEqual(pickVariation({ interval: 15, reps: 1 }, sentence), { idx: 1, v: sentence.variations[1] });
});

test('pickVariation: sel=[1]이면 reps와 무관하게 항상 원본 인덱스 1', () => {
  assert.deepEqual(pickVariation({ interval: 15, reps: 0 }, sentence, [1]), { idx: 1, v: sentence.variations[1] });
  assert.deepEqual(pickVariation({ interval: 33, reps: 5 }, sentence, [1]), { idx: 1, v: sentence.variations[1] });
});

test('pickVariation: sel=[]이면 (전부 해제) null — 변형 모드 자체를 끈다', () => {
  assert.equal(pickVariation({ interval: 15, reps: 0 }, sentence, []), null);
  assert.equal(pickVariation({ interval: 33, reps: 5 }, sentence, []), null);
});

test('pickVariation: sel=[0,2]면 reps%2로 그 부분집합 안에서만 로테이션하되 원본 인덱스를 반환', () => {
  const three = { variations: [{ en: 'a', ko: '가' }, { en: 'b', ko: '나' }, { en: 'c', ko: '다' }] };
  assert.deepEqual(pickVariation({ interval: 15, reps: 0 }, three, [0, 2]), { idx: 0, v: three.variations[0] });
  assert.deepEqual(pickVariation({ interval: 15, reps: 1 }, three, [0, 2]), { idx: 2, v: three.variations[2] });
  assert.deepEqual(pickVariation({ interval: 15, reps: 2 }, three, [0, 2]), { idx: 0, v: three.variations[0] });
  assert.deepEqual(pickVariation({ interval: 15, reps: 3 }, three, [0, 2]), { idx: 2, v: three.variations[2] });
});

test('pickVariation: interval<15면 sel과 무관하게 항상 null', () => {
  assert.equal(pickVariation({ interval: 14, reps: 0 }, sentence, [1]), null);
  assert.equal(pickVariation({ interval: 0, reps: 0 }, sentence, []), null);
  assert.equal(pickVariation({ interval: 5, reps: 0 }, sentence, null), null);
});

test('deferInQueue: 큐 중간(i)에서 미루면 해당 항목이 맨 뒤로, i는 원래 i+1 항목을 가리킨다', () => {
  const queue = ['a', 'b', 'c', 'd'];
  const out = deferInQueue(queue, 1); // 'b'를 미룸
  assert.deepEqual(out, ['a', 'c', 'd', 'b']);
  assert.equal(out[1], 'c'); // 같은 인덱스가 이제 다음 항목을 가리킴
  assert.equal(out, queue); // 제자리 변형(같은 참조)
});

test('deferInQueue: 끝에서 두 번째(마지막 바로 앞) 항목을 미룸', () => {
  const queue = ['a', 'b', 'c'];
  const out = deferInQueue(queue, 1); // 'b'를 미룸 — 남은 건 c, b
  assert.deepEqual(out, ['a', 'c', 'b']);
});

test('deferInQueue: 길이는 항상 보존된다 (제거 1 + 추가 1 = 순변화 0)', () => {
  const queue = ['a', 'b', 'c', 'd', 'e'];
  deferInQueue(queue, 2);
  assert.equal(queue.length, 5);
});

test('deferInQueue: 같은 인덱스에서 반복 호출하면 큐 길이만큼 돌고 원래 순서로 돌아온다(사이클)', () => {
  const queue = ['a', 'b', 'c'];
  deferInQueue(queue, 0);
  assert.deepEqual(queue, ['b', 'c', 'a']);
  deferInQueue(queue, 0);
  assert.deepEqual(queue, ['c', 'a', 'b']);
  deferInQueue(queue, 0);
  assert.deepEqual(queue, ['a', 'b', 'c']); // 3번(길이만큼) 반복하니 원래 순서로 복귀
});
