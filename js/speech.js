const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const support = {
  recognition: !!SR,
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
};

let voice = null;
// macOS의 영어 음성 목록은 'Albert' 같은 효과음성이 알파벳순 앞에 있어
// 단순 첫 번째 선택은 기괴한 소리가 남 — 검증된 자연 음성을 이름으로 우선한다.
const PREFERRED_VOICES = ['Google US English', 'Samantha', 'Google UK English Female', 'Google UK English Male', 'Karen', 'Daniel'];
function pickVoice() {
  const en = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.startsWith('en'));
  for (const name of PREFERRED_VOICES) {
    const hit = en.find((v) => v.name === name || v.name.startsWith(name));
    if (hit) return hit;
  }
  return en.find((v) => v.default) || en.find((v) => v.lang === 'en-US') || en[0] || null;
}
export function speak(text) {
  if (!support.tts) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (!voice) voice = pickVoice();
  if (voice) u.voice = voice;
  u.lang = 'en-US';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = null; };
}

let currentAudio = null;

// 새 오디오(영어 mp3든 한국어 mp3든) 재생 전 이전 오디오를 반드시 pause한다.
// speakSentence/speakVariation/speakKorean이 모두 이 규율을 공유하므로, 어느 경로로
// 재생을 시작하든 직전 재생은 자동으로 끊긴다 (화면 이탈 후 재진입 시에도 다음
// 재생 호출 시점에 이전 오디오가 끊기는 것으로 정지가 보장됨 — drill.js 세대 카운터와 별개 방어선).
export function stopSpeech() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (support.tts) speechSynthesis.cancel();
}

function playAudioOrFallback(path, fallbackText) {
  stopSpeech();
  const audio = new Audio(path);
  currentAudio = audio;
  audio.onerror = () => { if (currentAudio === audio) { currentAudio = null; speak(fallbackText); } };
  audio.play().catch(() => { if (currentAudio === audio) { currentAudio = null; speak(fallbackText); } });
}

export function speakSentence(sentence) {
  playAudioOrFallback(`data/audio/${sentence.id}.mp3`, sentence.en);
}

// 변형 문장(sentence.variations[idx])의 영어 음성. mp3 우선(data/audio/<id>-v<idx+1>.mp3),
// 실패 시 브라우저 TTS로 v.en을 읽는다 (speakSentence와 동일한 정지/폴백 규율 공유).
export function speakVariation(sentence, idx) {
  const v = sentence.variations[idx];
  playAudioOrFallback(`data/audio/${sentence.id}-v${idx + 1}.mp3`, v.en);
}

// 한국어 큐 음성. data/audio/ko/<audioKey>.mp3 우선 → 실패 시 브라우저 TTS(ko-KR) →
// TTS도 없으면 즉시 onDone. onDone은 settled 플래그로 정확히 1회만 호출된다.
// (audio의 onerror와 play().catch()가 같은 실패에 대해 둘 다 발화할 수 있으므로
// fallback 시작 자체도 별도 플래그로 한 번만 트리거되도록 이중 방어한다.)
export function speakKorean(text, audioKey, onDone) {
  stopSpeech();
  let settled = false;
  const finish = () => { if (settled) return; settled = true; onDone?.(); };
  let fallbackStarted = false;
  const toFallback = () => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    if (!support.tts) { finish(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.onend = () => finish();
    u.onerror = () => finish();
    speechSynthesis.speak(u);
  };
  const audio = new Audio(`data/audio/ko/${audioKey}.mp3`);
  currentAudio = audio;
  audio.onended = () => { if (currentAudio === audio) currentAudio = null; finish(); };
  audio.onerror = () => { if (currentAudio === audio) currentAudio = null; toFallback(); };
  audio.play().catch(() => { if (currentAudio === audio) currentAudio = null; toFallback(); });
}

export function recognizeOnce({ onSpeechStart } = {}) {
  return new Promise((resolve) => {
    if (!SR) { resolve({ alternatives: [], speechStartMs: null, error: 'unsupported' }); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    const t0 = performance.now();
    let speechStartMs = null;
    let finals = [];
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      resolve({ alternatives: finals, speechStartMs, error: error || null });
    };
    rec.onspeechstart = () => {
      if (speechStartMs === null) { speechStartMs = performance.now() - t0; onSpeechStart?.(speechStartMs); }
    };
    rec.onresult = (e) => {
      if (speechStartMs === null) { speechStartMs = performance.now() - t0; onSpeechStart?.(speechStartMs); }
      for (const res of e.results) {
        if (res.isFinal) finals = [...res].map((a) => a.transcript);
      }
    };
    rec.onerror = (e) => finish(e.error);
    rec.onend = () => finish(null);
    setTimeout(() => { try { rec.stop(); } catch {} }, 15000);
    try { rec.start(); } catch (e) { finish(e && e.name ? e.name : 'start-failed'); }
  });
}
