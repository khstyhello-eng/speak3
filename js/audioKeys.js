// 오디오 파일/manifest 키 이름 규칙의 단일 소스.
//
// drill.js(한국어 큐 오디오)와 speech.js(영어 변형 오디오)가 모두 이 함수들을 통해서만
// 키 문자열을 만들어야 한다 — 그래야 "v${idx+1}을 v${idx}로 잘못 고쳐도 테스트가 그린인 채로
// 넘어간다" 같은 드리프트 버그를 막을 수 있다. tools/build_audio.py(Python)는 이 규칙을
// 별도로 동일하게 구현하며(언어가 달라 직접 공유는 불가), tests/audio.test.js가 이 모듈을
// import해 실제 매니페스트 키와 대조 검증한다.
export function enVariationKey(sentenceId, idx) {
  return `${sentenceId}-v${idx + 1}`;
}

export function koOriginalKey(sentenceId) {
  return `ko-${sentenceId}`;
}

export function koCueKey(sentenceId) {
  return `cue-${sentenceId}`;
}

export function koVariationKey(sentenceId, idx) {
  return `ko-${sentenceId}-v${idx + 1}`;
}
