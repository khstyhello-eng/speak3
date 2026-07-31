import { readFileSync, writeFileSync } from 'node:fs';

// 연설문 원고는 드라마 자막과 달리 한 줄이 문단(또는 하드랩된 문단 조각)이다.
// 앱의 문장 브라우저와 en 검증이 "한 줄 = 한 문장"을 전제하므로 문단을 문장 단위로 쪼갠다.

// 마침표가 문장 끝이 아닌 약어들. 문장이 실제로 이 단어로 끝날 일이 거의 없는 것만 넣는다.
const ABBREV = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'rev', 'hon',
  'gov', 'sen', 'rep', 'gen', 'lt', 'capt', 'col', 'sgt', 'pres',
  'vs', 'etc', 'inc', 'ltd', 'corp', 'dept',
]);

// 원문 정리: 깨진 문자 복원 → 타이포그래피 문자 ASCII화.
// ASCII 아포스트로피여야 앱 match.js의 축약형 사전(it's → it is)이 동작한다.
function cleanText(raw) {
  let t = raw;
  // U+FFFD(원본 인코딩 손실). 앞뒤 문맥으로 아포스트로피/따옴표 복원.
  t = t.replace(/(\w)�(?=\w|\s|$)/g, '$1’'); // don�t → don’t, parents� → parents’
  t = t.replace(/(^|\s)�/g, '$1“');          // or �blessed → or “blessed
  t = t.replace(/�/g, '”');                  // blessed,� → blessed,”
  return t;
}

function toAscii(t) {
  return t
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '--')
    .replace(/-{3,}/g, '--') // "-–" 같은 표기 흔들림 정리
    .replace(/(?:--\s*){2,}/g, '-- ') // 박수·환호 편집 흔적("-- --")을 대시 하나로
    .replace(/ /g, " ");
}

// 하드랩된 줄들을 한 덩어리로 잇고, 줄바꿈 때문에 생긴 어색한 공백을 없앤다.
function joinLines(lines) {
  let t = lines.join(' ').replace(/\s+/g, ' ');
  t = t.replace(/([“‘(]) +/g, '$1'); // “ HeForShe → “HeForShe
  t = t.replace(/ +([.,;:!?”’)])/g, '$1'); // HeForShe .” → HeForShe.”
  return t.trim();
}

// text[i]의 마침표가 약어의 일부인가?
function isAbbrevDot(text, i) {
  if (text[i] !== '.') return false;
  // U.S. / D.C. / G.I. / F.H.A. / p.m. / e.g. — 앞이 "마침표 + 한 글자"
  if (i >= 2 && text[i - 2] === '.' && /[A-Za-z]/.test(text[i - 1])) return true;
  const word = (text.slice(0, i).match(/([A-Za-z]+)$/) || [])[1];
  if (!word) return false;
  if (word.length === 1 && word === word.toUpperCase()) return true; // 이름 이니셜: Barack H. Obama
  return ABBREV.has(word.toLowerCase());
}

export function splitSentences(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!'.!?'.includes(text[i])) continue;
    let end = i;
    while (end + 1 < text.length && '.!?'.includes(text[end + 1])) end++; // "...", "?!"
    let k = end + 1;
    while (k < text.length && '"\')]'.includes(text[k])) k++; // 닫는 따옴표·괄호까지 포함
    i = end;
    if (k >= text.length || text[k] !== ' ') continue;
    const next = text.slice(k + 1, k + 3);
    if (!/^["'(]?[A-Z0-9]/.test(next)) continue; // 다음이 대문자/숫자로 시작해야 문장 시작
    if (isAbbrevDot(text, end)) continue;
    const piece = text.slice(start, k).trim();
    if (piece) out.push(piece);
    start = k + 1;
    i = k;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function build(rawPath, outPath, id) {
  const raw = readFileSync(rawPath, 'utf8');
  const body = cleanText(raw).split('\n').slice(3) // 헤더 3줄(제목·출처·빈 줄) 제거
    .map((l) => l.trim()).filter((l) => l.length > 0);
  const lines = splitSentences(toAscii(joinLines(body)));
  writeFileSync(outPath, JSON.stringify({ id, lines }, null, 1) + '\n');
  console.log(outPath, lines.length + ' lines');
  return lines;
}

const SPEECHES = [
  ['raw/speech_obama_farewell2017.txt', 'data/script-speech-obama-farewell2017.json', 'speech-obama-farewell2017'],
  ['raw/speech_obama_dnc2004.txt', 'data/script-speech-obama-dnc2004.json', 'speech-obama-dnc2004'],
  ['raw/speech_watson_heforshe.txt', 'data/script-speech-watson-heforshe.json', 'speech-watson-heforshe'],
  ['raw/speech_queen_covid.txt', 'data/script-speech-queen-covid.json', 'speech-queen-covid'],
];

if (process.argv[1] && process.argv[1].endsWith('build-speech-script.mjs')) {
  for (const [rawPath, outPath, id] of SPEECHES) build(rawPath, outPath, id);
}
