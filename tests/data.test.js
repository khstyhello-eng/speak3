import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));

test('sections.json: 소스 파일이 모두 존재', () => {
  const sections = read('sections.json').sections;
  assert.ok(sections.length >= 1);
  const files = readdirSync(new URL('../data/', import.meta.url));
  for (const sec of sections) for (const src of sec.sources) {
    assert.ok(files.includes(src + '.json'), src + '.json 없음');
  }
});

for (const file of ['drama-suits-s01e01.json', 'drama-suits-s01e02.json']) {
  test(file + ': 스키마·개수·id 유일성', () => {
    const src = read(file);
    assert.equal(src.sectionId, 'drama');
    assert.ok(src.sentences.length >= 40 && src.sentences.length <= 60, '문장 수 ' + src.sentences.length);
    const ids = new Set();
    for (const s of src.sentences) {
      for (const k of ['id', 'en', 'ko', 'note', 'situationCue', 'speaker']) {
        assert.ok(typeof s[k] === 'string' && s[k].length > 0, `${s.id || '?'} 필드 ${k} 누락`);
      }
      assert.ok(Array.isArray(s.tags) && s.tags.length >= 1);
      assert.equal(s.curated, true);
      assert.ok(!ids.has(s.id), 'id 중복: ' + s.id);
      ids.add(s.id);
    }
  });
}

for (const file of ['script-suits-s01e01.json', 'script-suits-s01e02.json']) {
  test(file + ': 전체 스크립트 줄 배열', () => {
    const sc = read(file);
    assert.ok(Array.isArray(sc.lines) && sc.lines.length > 500, '줄 수 부족');
  });
}
