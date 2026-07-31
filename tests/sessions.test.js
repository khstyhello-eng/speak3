import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexContent } from '../js/content.js';
import { buildSessions } from '../js/ui/drill.js';

const TODAY = '2026-08-01';
const FUTURE = '2026-08-02';
const PAST = '2026-07-01';

const sections = [
  { id: 'secA', title: 'A', sources: ['src1', 'src2'] },
  { id: 'secB', title: 'B', sources: ['src3'] },
];

function makeSentences(prefix, n) {
  return Array.from({ length: n }, (_, k) => ({ id: `${prefix}${k + 1}`, en: 'x', ko: 'y' }));
}

const sourcesById = {
  src1: { id: 'src1', sectionId: 'secA', title: 'Source One', sentences: makeSentences('s', 23) },
  src2: { id: 'src2', sectionId: 'secA', title: 'Source Two', sentences: makeSentences('t', 3) },
  src3: { id: 'src3', sectionId: 'secB', title: 'Source Three', sentences: makeSentences('v', 3) },
};

const content = indexContent(sections, sourcesById);

function rec(due) { return { due, interval: 3, stage: 1, reps: 0 }; }

test('buildSessions: due 필터 — 미래 due·존재하지 않는 문장 id는 제외', () => {
  const records = {
    s1: rec(TODAY),
    s2: rec(FUTURE), // 미래 due — 제외
    ghost: rec(TODAY), // content.sentenceById에 없는 id — 제외
  };
  const sessions = buildSessions(records, content, TODAY);
  const ids = sessions.flatMap((s) => s.chunks.flat());
  assert.deepEqual(ids, ['s1']);
});

test('buildSessions: 소스 그룹 순서는 content.sections 선언 순서를 따른다 (전역 due 정렬이 아님)', () => {
  // src3(secB)의 due가 src1(secA)보다 훨씬 이르지만, 그룹 순서는 여전히 src1 → src3.
  // src2는 due가 없어 결과에서 통째로 빠진다(0건 소스 omission).
  const records = {
    s1: rec(TODAY),
    v1: rec(PAST),
  };
  const sessions = buildSessions(records, content, TODAY);
  assert.deepEqual(sessions.map((s) => s.sourceId), ['src1', 'src3']);
});

test('buildSessions: due 0건인 소스는 결과에서 생략된다', () => {
  const records = { s1: rec(TODAY) };
  const sessions = buildSessions(records, content, TODAY);
  assert.ok(!sessions.some((s) => s.sourceId === 'src2'));
  assert.ok(!sessions.some((s) => s.sourceId === 'src3'));
});

test('buildSessions: 소스 내 23건 due → 기본 chunkSize(10)로 10/10/3 분할', () => {
  const records = {};
  for (let k = 1; k <= 23; k++) records[`s${k}`] = rec(TODAY);
  const sessions = buildSessions(records, content, TODAY);
  assert.equal(sessions.length, 1);
  const src1 = sessions[0];
  assert.equal(src1.sourceId, 'src1');
  assert.equal(src1.title, 'Source One');
  assert.deepEqual(src1.chunks.map((c) => c.length), [10, 10, 3]);
  // 청크는 연속적이고 순서가 보존된다 — 이어붙이면 원래 23개 id와 동일.
  assert.deepEqual(src1.chunks.flat(), Array.from({ length: 23 }, (_, k) => `s${k + 1}`));
});

test('buildSessions: chunkSize override', () => {
  const records = { s1: rec(TODAY), s2: rec(TODAY), s3: rec(TODAY), s4: rec(TODAY), s5: rec(TODAY) };
  const sessions = buildSessions(records, content, TODAY, 2);
  assert.deepEqual(sessions[0].chunks.map((c) => c.length), [2, 2, 1]);
});

test('buildSessions: 같은 섹션 안 두 소스도 sec.sources 선언 순서를 따른다 (due 이른 쪽이 아님)', () => {
  // src2(t1)의 due가 src1(s1)보다 훨씬 이르지만, 같은 secA 안에서도 선언 순서(src1 → src2)가
  // 우선한다 — 그룹 순서 규칙이 "섹션 간"뿐 아니라 "섹션 내 소스 간"에도 동일하게 적용됨을 검증.
  const records = {
    t1: rec(PAST),
    s1: rec(TODAY),
  };
  const sessions = buildSessions(records, content, TODAY);
  assert.deepEqual(sessions.map((s) => s.sourceId), ['src1', 'src2']);
});

test('buildSessions: 소스 내 정렬은 buildQueue와 동일하게 due 오름차순', () => {
  const records = {
    s2: rec('2026-08-01'),
    s1: rec('2026-07-15'),
    s3: rec('2026-07-20'),
  };
  const sessions = buildSessions(records, content, TODAY);
  assert.deepEqual(sessions[0].chunks[0], ['s1', 's3', 's2']);
});
