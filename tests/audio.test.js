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

// tools/build_audio.py가 실제로 생성하는 오디오 단위(키/텍스트/디렉터리) 목록.
// dir은 data/ 기준 상대 경로 — 영어(원문·변형)는 audio/, 한국어(원문·상황큐·변형)는 audio/ko/.
function expectedUnits(s) {
  const units = [{ key: s.id, text: s.en, dir: 'audio' }];
  const variations = s.variations || [];
  variations.forEach((v, i) => units.push({ key: `${s.id}-v${i + 1}`, text: v.en, dir: 'audio' }));
  units.push({ key: `ko-${s.id}`, text: s.ko, dir: 'audio/ko' });
  if (s.situationCue) units.push({ key: `cue-${s.id}`, text: s.situationCue, dir: 'audio/ko' });
  variations.forEach((v, i) => units.push({ key: `ko-${s.id}-v${i + 1}`, text: v.ko, dir: 'audio/ko' }));
  return units;
}

const allUnits = sentences.flatMap(expectedUnits);

test('audio manifest: 모든 오디오 키(원문·변형 영어 + 원문·상황큐·변형 한국어)를 포함', () => {
  for (const u of allUnits) {
    assert.ok(manifest[u.key], `manifest에 ${u.key} 없음`);
  }
});

test('audio manifest: 고아 항목 없음 (소스에 없는 키)', () => {
  const keys = new Set(allUnits.map((u) => u.key));
  for (const key of Object.keys(manifest)) {
    assert.ok(keys.has(key), `manifest에 소스에 없는 키: ${key}`);
  }
});

for (const s of sentences) {
  for (const u of expectedUnits(s)) {
    test(`data/${u.dir}/${u.key}.mp3: 존재·sha1 일치·용량`, () => {
      const entry = manifest[u.key];
      assert.ok(entry, `manifest 항목 없음: ${u.key}`);
      assert.equal(entry.sha1, sha1(u.text), `${u.key} sha1 불일치`);
      const path = new URL(`../data/${u.dir}/${u.key}.mp3`, import.meta.url);
      const stat = statSync(path);
      assert.ok(stat.size > 1024, `${u.key}.mp3 크기가 1KB 이하: ${stat.size}`);
    });
  }
}
