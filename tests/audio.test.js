import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

const sections = read('sections.json').sections;
const allSourceIds = sections.flatMap((sec) => sec.sources);
const manifest = read('audio/manifest.json');

const sentences = [];
for (const srcId of allSourceIds) {
  for (const s of read(srcId + '.json').sentences) sentences.push(s);
}

test('audio manifest: 모든 큐레이션 문장 id를 포함', () => {
  for (const s of sentences) {
    assert.ok(manifest[s.id], `manifest에 ${s.id} 없음`);
  }
});

test('audio manifest: 고아 항목 없음 (소스에 없는 id)', () => {
  const ids = new Set(sentences.map((s) => s.id));
  for (const id of Object.keys(manifest)) {
    assert.ok(ids.has(id), `manifest에 소스에 없는 id: ${id}`);
  }
});

for (const s of sentences) {
  test(`data/audio/${s.id}.mp3: 존재·sha1 일치·용량`, () => {
    const entry = manifest[s.id];
    assert.ok(entry, `manifest 항목 없음: ${s.id}`);
    assert.equal(entry.sha1, sha1(s.en), `${s.id} sha1(en) 불일치`);
    const path = new URL(`../data/audio/${s.id}.mp3`, import.meta.url);
    const stat = statSync(path);
    assert.ok(stat.size > 1024, `${s.id}.mp3 크기가 1KB 이하: ${stat.size}`);
  });
}
