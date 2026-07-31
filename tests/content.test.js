import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexContent, withCustom } from '../js/content.js';

const sections = [{ id: 'drama', title: '미드', sources: ['src1'] }];
const sourcesById = {
  src1: { id: 'src1', sectionId: 'drama', title: 'S1', sentences: [{ id: 's1', en: 'Hello there.', ko: '안녕', curated: true }] },
};

test('indexContent: 문장 id 인덱스 생성', () => {
  const c = indexContent(sections, sourcesById);
  assert.equal(c.sentenceById.s1.en, 'Hello there.');
  assert.equal(c.sourceOfSentence.s1, 'src1');
});

test('withCustom: 커스텀 문장이 소스에 합쳐지고 인덱스에 반영', () => {
  const base = indexContent(sections, sourcesById);
  const c = withCustom(base, { src1: [{ id: 'c1', en: 'Custom line.', ko: '커스텀', curated: false }] });
  assert.equal(c.sentenceById.c1.en, 'Custom line.');
  assert.equal(c.sourcesById.src1.sentences.length, 2);
  // 원본은 불변
  assert.equal(base.sourcesById.src1.sentences.length, 1);
});
