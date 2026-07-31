import { review } from '../srs.js';
import { bestScore, PASS_THRESHOLD } from '../match.js';
import { support, speak, recognizeOnce } from '../speech.js';

const START_WINDOW_MS = 3000;
const REC_FAILS_TO_SELF_ASSESS = 3;

export function renderDrill(el, ctx) {
  const queue = buildQueue(ctx);
  if (!queue.length) {
    el.innerHTML = `<section class="card"><p class="big">오늘 발화할 문장이 없어요 🎉</p><div class="row"><a class="btn" href="#learn">새 문장 학습하기</a></div></section>`;
    return;
  }
  runItem(el, ctx, queue, 0);
}

function buildQueue(ctx) {
  const today = ctx.todayStr();
  return Object.entries(ctx.state.records)
    .filter(([id, r]) => r.due <= today && ctx.content.sentenceById[id])
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([id]) => id);
}

function cueFor(sentence, record) {
  if (record.stage >= 2 && sentence.situationCue) return { label: '이런 상황이라면?', text: sentence.situationCue };
  if (record.stage >= 2 && sentence.contextBefore) return { label: '상대방이 이렇게 말했다:', text: sentence.contextBefore };
  return { label: '3초 안에 영어로!', text: sentence.ko };
}

function runItem(el, ctx, queue, i) {
  if (i >= queue.length) {
    el.innerHTML = `<section class="card"><p class="big">오늘 세션 끝! ${queue.length}문장 완료 💪</p><div class="row"><a class="btn" href="#home">홈으로</a></div></section>`;
    return;
  }
  const id = queue[i];
  const record = ctx.state.records[id];
  const sentence = ctx.content.sentenceById[id];
  if (record.selfAssess || !support.recognition) runSelfAssess(el, ctx, queue, i, sentence, record);
  else runRecognition(el, ctx, queue, i, sentence, record);
}

function cueHtml(sentence, record, i, total) {
  const cue = cueFor(sentence, record);
  return `<section class="card">
    <p class="sub">${i + 1} / ${total} · ${cue.label}</p>
    <p class="big" style="margin:16px 0">${cue.text}</p>
    <p class="count" id="countdown">3</p>
  </section>`;
}

function startCountdown(el, onExpire) {
  let n = 3;
  const node = el.querySelector('#countdown');
  const timer = setInterval(() => {
    n -= 1;
    if (!node.isConnected) { clearInterval(timer); return; }
    if (n <= 0) { clearInterval(timer); node.textContent = '0'; onExpire?.(); }
    else node.textContent = String(n);
  }, 1000);
  return () => clearInterval(timer);
}

async function runRecognition(el, ctx, queue, i, sentence, record) {
  el.innerHTML = cueHtml(sentence, record, i, queue.length) + `<p class="sub" id="mic-status">🎤 듣는 중…</p>`;
  let started = false;
  const stop = startCountdown(el, () => {
    if (!started) el.querySelector('#mic-status').textContent = '⏰ 3초 지남 — 그래도 끝까지 말해보세요';
  });
  const result = await recognizeOnce({ onSpeechStart: () => { started = true; el.querySelector('#countdown').textContent = '🗣'; } });
  stop();
  if (!el.querySelector('#mic-status')) return; // 화면 이탈
  if (result.error && result.error !== 'no-speech') {
    record.recFails += 1;
    record.updatedAt = ctx.nowIso();
    if (record.recFails >= REC_FAILS_TO_SELF_ASSESS) {
      record.selfAssess = true;
      ctx.save();
      runSelfAssess(el, ctx, queue, i, sentence, record);
      return;
    }
    ctx.save();
    el.innerHTML = `<section class="card"><p class="big">음성인식 오류 (${result.error})</p>
      <div class="row"><button id="retry">다시 시도</button></div></section>`;
    el.querySelector('#retry').onclick = () => runRecognition(el, ctx, queue, i, sentence, record);
    return;
  }
  record.recFails = 0;
  const inTime = result.speechStartMs !== null && result.speechStartMs <= START_WINDOW_MS;
  const score = bestScore(sentence.en, result.alternatives);
  const matched = score >= PASS_THRESHOLD;
  const heard = result.alternatives[0] || '(음성 없음)';
  showVerdict(el, ctx, queue, i, sentence, record, { pass: inTime && matched, inTime, matched, heard });
}

function showVerdict(el, ctx, queue, i, sentence, record, v) {
  speak(sentence.en);
  const reason = v.pass ? '' : (!v.inTime ? '3초 안에 시작하지 못했어요' : '문장이 정답과 달랐어요');
  el.innerHTML = `<section class="card">
    <p class="sub">${v.pass ? '✅ 성공!' : '❌ ' + reason}</p>
    <p class="big">${sentence.en}</p>
    <p class="sub">${sentence.ko}</p>
    <p class="sub" style="margin-top:8px">들린 문장: “${v.heard}”</p>
    <div class="row">
      ${v.pass
        ? `<button id="next" class="ok">다음 (즉답 성공)</button><button id="hard" class="ghost">겨우 했어요</button>`
        : `<button id="next" class="bad">다음 (실패)</button><button id="override" class="ghost">내가 맞았음</button>`}
      <button id="listen" class="ghost">🔊 다시 듣기</button>
    </div>
  </section>`;
  if (!support.tts) el.querySelector('#listen').style.display = 'none';
  el.querySelector('#listen').onclick = () => speak(sentence.en);
  const apply = (res) => {
    ctx.state.records[queue[i]] = review(record, res, ctx.todayStr(), ctx.nowIso());
    ctx.save();
    runItem(el, ctx, queue, i + 1);
  };
  el.querySelector('#next').onclick = () => apply(v.pass ? 'pass' : 'fail');
  const hard = el.querySelector('#hard');
  if (hard) hard.onclick = () => apply('hard');
  const override = el.querySelector('#override');
  if (override) override.onclick = () => apply('pass');
}

function runSelfAssess(el, ctx, queue, i, sentence, record) {
  el.innerHTML = cueHtml(sentence, record, i, queue.length) + `<div class="row"><button id="reveal">정답 보기</button></div>`;
  const stop = startCountdown(el);
  el.querySelector('#reveal').onclick = () => {
    stop();
    speak(sentence.en);
    el.innerHTML = `<section class="card">
      <p class="big">${sentence.en}</p>
      <p class="sub">${sentence.ko}</p>
      <div class="row">
        <button id="pass" class="ok">⭕ 즉답했다</button>
        <button id="hard" class="ghost">겨우 했다</button>
        <button id="fail" class="bad">❌ 못 했다</button>
      </div>
    </section>`;
    const apply = (res) => {
      ctx.state.records[queue[i]] = review(record, res, ctx.todayStr(), ctx.nowIso());
      ctx.save();
      runItem(el, ctx, queue, i + 1);
    };
    el.querySelector('#pass').onclick = () => apply('pass');
    el.querySelector('#hard').onclick = () => apply('hard');
    el.querySelector('#fail').onclick = () => apply('fail');
  };
}
