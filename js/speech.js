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
export function speakSentence(sentence) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (support.tts) speechSynthesis.cancel();
  const audio = new Audio(`data/audio/${sentence.id}.mp3`);
  currentAudio = audio;
  audio.onerror = () => { if (currentAudio === audio) { currentAudio = null; speak(sentence.en); } };
  audio.play().catch(() => { if (currentAudio === audio) { currentAudio = null; speak(sentence.en); } });
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
