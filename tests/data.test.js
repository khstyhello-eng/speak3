import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));

const TAGS = ['협상', '설득', '반박', '지시', '요청', '사과', '압박', '자기주장', '스몰토크', '갈등', '조언', '거절'];
const LATIN = /[A-Za-z]/;
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
// 섹션별 문장 수 범위
const COUNT_RANGE = { drama: [40, 60], speech: [8, 60] };

const sections = read('sections.json').sections;
const allSources = sections.flatMap((sec) => sec.sources.map((id) => ({ id, sectionId: sec.id })));
// 앱 loadScript와 같은 규칙: script- + sourceId(단, drama- 접두사는 제거)
const scriptFile = (sourceId) => 'script-' + sourceId.replace('drama-', '') + '.json';

test('sections.json: 소스 파일이 모두 존재', () => {
  assert.ok(sections.length >= 1);
  const files = readdirSync(new URL('../data/', import.meta.url));
  for (const sec of sections) for (const src of sec.sources) {
    assert.ok(files.includes(src + '.json'), src + '.json 없음');
  }
});

test('문장 id는 전체 소스에서 유일', () => {
  const seen = new Map();
  for (const { id } of allSources) {
    for (const s of read(id + '.json').sentences) {
      assert.ok(!seen.has(s.id), `id 중복: ${s.id} (${seen.get(s.id)} / ${id})`);
      seen.set(s.id, id);
    }
  }
});

for (const { id, sectionId } of allSources) {
  test(id + '.json: 스키마·개수·태그', () => {
    const src = read(id + '.json');
    assert.equal(src.id, id);
    assert.equal(src.sectionId, sectionId);
    assert.ok(typeof src.title === 'string' && src.title.length > 0, 'title 누락');
    const [min, max] = COUNT_RANGE[sectionId];
    assert.ok(src.sentences.length >= min && src.sentences.length <= max, '문장 수 ' + src.sentences.length);
    const ids = new Set();
    for (const s of src.sentences) {
      for (const k of ['id', 'en', 'ko', 'note', 'situationCue', 'speaker']) {
        assert.ok(typeof s[k] === 'string' && s[k].length > 0, `${s.id || '?'} 필드 ${k} 누락`);
      }
      for (const k of ['contextBefore', 'contextAfter']) {
        assert.equal(typeof s[k], 'string', `${s.id} 필드 ${k}는 문자열이어야 함`);
      }
      assert.ok(Array.isArray(s.tags) && s.tags.length >= 1 && s.tags.length <= 3, `${s.id} 태그 개수`);
      for (const t of s.tags) assert.ok(TAGS.includes(t), `${s.id} 미등록 태그: ${t}`);
      assert.equal(s.curated, true);
      assert.ok(!ids.has(s.id), 'id 중복: ' + s.id);
      ids.add(s.id);
    }
  });

  test(id + '.json: 핵심표현(core/coreKo)과 변형문장(variations)', () => {
    for (const s of read(id + '.json').sentences) {
      for (const k of ['core', 'coreKo']) {
        assert.ok(typeof s[k] === 'string' && s[k].trim().length > 0, `${s.id} 필드 ${k} 누락`);
      }
      assert.ok(!LATIN.test(s.coreKo), `${s.id} coreKo에 로마자 포함: ${s.coreKo}`);

      assert.ok(Array.isArray(s.variations), `${s.id} variations 누락`);
      assert.ok(s.variations.length >= 2 && s.variations.length <= 3, `${s.id} variations 개수 ${s.variations.length}`);
      const seenEn = new Set();
      for (const v of s.variations) {
        for (const k of ['en', 'ko']) {
          assert.ok(typeof v[k] === 'string' && v[k].trim().length > 0, `${s.id} variation 필드 ${k} 누락`);
        }
        assert.ok(!LATIN.test(v.ko), `${s.id} variation ko에 로마자 포함: ${v.ko}`);
        assert.ok(!HANGUL.test(v.en), `${s.id} variation en에 한글 포함: ${v.en}`);
        assert.notEqual(v.en, s.en, `${s.id} variation en이 원문과 동일: ${v.en}`);
        assert.ok(!seenEn.has(v.en), `${s.id} variation en 중복: ${v.en}`);
        seenEn.add(v.en);
      }
    }
  });

  test(scriptFile(id) + ': 전체 스크립트 줄 배열', () => {
    const sc = read(scriptFile(id));
    assert.equal(sc.id, id);
    assert.ok(Array.isArray(sc.lines) && sc.lines.length >= 8, '줄 수 부족: ' + sc.lines.length);
  });

  test(id + '.json: 모든 en이 스크립트 원문에 존재', () => {
    const lines = read(scriptFile(id)).lines;
    for (const s of read(id + '.json').sentences) {
      assert.ok(lines.some((l) => l.includes(s.en)), `${s.id} en이 스크립트에 없음: ${s.en}`);
    }
  });
}
