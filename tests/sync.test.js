import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreatePayload, buildUpdatePayload, parseGistState, GIST_FILE } from '../js/sync.js';
import { defaultState } from '../js/store.js';

test('GIST_FILE 이름 고정', () => { assert.equal(GIST_FILE, 'speak3-progress.json'); });

test('buildCreatePayload: 비공개 gist + 파일 내용', () => {
  const p = buildCreatePayload(defaultState());
  assert.equal(p.public, false);
  assert.ok(p.description.includes('speak3'));
  assert.equal(JSON.parse(p.files[GIST_FILE].content).version, 1);
});

test('buildUpdatePayload: files만 포함', () => {
  const p = buildUpdatePayload(defaultState());
  assert.deepEqual(Object.keys(p), ['files']);
});

test('parseGistState: 파일 있으면 상태, 없으면 null', () => {
  const s = defaultState();
  const gist = { files: { [GIST_FILE]: { content: JSON.stringify(s) } } };
  assert.deepEqual(parseGistState(gist), s);
  assert.equal(parseGistState({ files: {} }), null);
  assert.equal(parseGistState({ files: { [GIST_FILE]: { content: 'broken{' } } }), null);
});
