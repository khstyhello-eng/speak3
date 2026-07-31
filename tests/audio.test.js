import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { enVariationKey, koOriginalKey, koCueKey, koVariationKey } from '../js/audioKeys.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

const sections = read('sections.json').sections;
const allSourceIds = sections.flatMap((sec) => sec.sources);
const manifest = read('audio/manifest.json');

const sentences = [];
for (const srcId of allSourceIds) {
  for (const s of read(srcId + '.json').sentences) sentences.push(s);
}

// 리뷰 라운드1 FINDING 5: 오디오 키 문자열이 drill.js(cueFor)·speech.js(speakVariation)
// 곳곳에 따로 하드코딩돼 있으면 "v${idx+1}을 v${idx}로 잘못 고쳐도 그린"인 드리프트 버그가
// 생긴다. js/audioKeys.js는 그 문자열의 단일 소스이자 실제로 앱이 런타임에 쓰는 함수이므로,
// 여기서 별도로 키를 재조합하지 않고 이 함수들을 직접 호출해 manifest와 대조한다.
test('audioKeys.js(실제 앱 키 생성 함수)로 만든 모든 키가 manifest에 존재', () => {
  for (const s of sentences) {
    assert.ok(manifest[koOriginalKey(s.id)], `${koOriginalKey(s.id)} 없음`);
    if (s.situationCue) assert.ok(manifest[koCueKey(s.id)], `${koCueKey(s.id)} 없음`);
    (s.variations || []).forEach((_, idx) => {
      assert.ok(manifest[enVariationKey(s.id, idx)], `${enVariationKey(s.id, idx)} 없음`);
      assert.ok(manifest[koVariationKey(s.id, idx)], `${koVariationKey(s.id, idx)} 없음`);
    });
  }
});

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
