const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const support = {
  recognition: !!SR,
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
};

let voice = null;
export function speak(text) {
  if (!support.tts) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (!voice) voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('en') && v.localService) || speechSynthesis.getVoices().find((v) => v.lang.startsWith('en')) || null;
  if (voice) u.voice = voice;
  u.lang = 'en-US';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = null; };
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
