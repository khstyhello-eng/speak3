import { review } from '../srs.js';
import { bestScore, PASS_THRESHOLD } from '../match.js';
import { support, speakSentence, speakVariation, speakKorean, recognizeOnce } from '../speech.js';

const START_WINDOW_MS = 3000;
const REC_FAILS_TO_SELF_ASSESS = 3;
const VARIATION_MIN_INTERVAL = 15; // home.js의 MY_SENTENCE_MIN과 동일한 "내 문장" 기준

// 화면을 벗어났다가 #drill로 돌아왔을 때 이전 recognizeOnce 콜백이 새 아이템을
// 건드리지 않도록 하는 세대 카운터. renderDrill/runItem 진입마다 증가시키고,
// runRecognition은 진입 시점 값을 캡처해 await 이후·onSpeechStart 안에서 비교한다.
// 한국어 큐 음성 재생(playCueAudio)도 동일한 세대 값을 캡처해, 재생이 끝난 뒤
// 카운트다운·마이크를 시작하기 직전에 다시 검사한다 — 오디오 재생이라는 새 비동기
// 단계가 늘어난 만큼 이 가드를 그 경로에도 반드시 적용해야 한다.
let generation = 0;

// 마이크 권한 거부(not-allowed)/서비스 차단(service-not-allowed) 등 세션 내내 반복될
// 수밖에 없는 오류를 만나면 이번 드릴 세션 동안만 자기평가로 폴백한다. record.selfAssess와
// 달리 저장되지 않으며, renderDrill(드릴 화면 재진입)마다 초기화된다.
let sessionSelfAssess = false;

export function renderDrill(el, ctx) {
  generation += 1;
  sessionSelfAssess = false;
  const queue = buildQueue(ctx);
  if (!queue.length) {
    el.innerHTML = `<section class="card"><p class="big">오늘 발화할 문장이 없어요 🎉</p><div class="row"><a class="btn" href="#home">홈으로</a></div></section>`;
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

// 변형 로테이션 — 순수 함수(node 테스트 가능). record.interval>=15 && sentence.variations
// 이 있으면 결정적으로 하나를 고른다(reps % 개수). 아니면 null.
export function pickVariation(record, sentence) {
  const list = sentence && sentence.variations;
  if (!record || record.interval < VARIATION_MIN_INTERVAL || !list || !list.length) return null;
  const idx = record.reps % list.length;
  return { idx, v: list[idx] };
}

// 드릴 큐 하나를 결정한다. 우선순위: 변형 모드(15+ && variations) > 상황큐(situationCue,
// stage>=2) > 상대방 대사(contextBefore, stage>=2, 한국어 음성 없음 — 아래 참고) > 원문 ko(기본/stage1).
// audioKey는 speakKorean에 넘길 data/audio/ko/<audioKey>.mp3 키. contextBefore 분기는 영어
// 텍스트(스크립트 앞 대사)라 한국어 음성이 존재하지 않으므로 audioKey를 null로 둔다 — 커스텀
// 문장(situationCue가 항상 '')이 stage 2+ 로 승급했을 때만 실제로 닿는 드문 경로다.
function cueFor(sentence, record) {
  const pv = pickVariation(record, sentence);
  if (pv) return { label: '응용해서 말해보세요', text: pv.v.ko, audioKey: `ko-${sentence.id}-v${pv.idx + 1}`, pv };
  if (record.stage >= 2 && sentence.situationCue) return { label: '이런 상황이라면?', text: sentence.situationCue, audioKey: `cue-${sentence.id}` };
  if (record.stage >= 2 && sentence.contextBefore) return { label: '상대방이 이렇게 말했다:', text: sentence.contextBefore, audioKey: null };
  return { label: '3초 안에 영어로!', text: sentence.ko, audioKey: `ko-${sentence.id}` };
}

// 변형 모드면 채점/표시 대상은 sentence 자체가 아니라 골라둔 변형(en/ko)이다.
function answerFor(sentence, cue) {
  return cue.pv ? cue.pv.v : { en: sentence.en, ko: sentence.ko };
}

function playAnswerAudio(sentence, cue) {
  if (cue.pv) speakVariation(sentence, cue.pv.idx);
  else speakSentence(sentence);
}

function runItem(el, ctx, queue, i) {
  generation += 1;
  if (i >= queue.length) {
    el.innerHTML = `<section class="card"><p class="big">오늘 세션 끝! ${queue.length}문장 완료 💪</p><div class="row"><a class="btn" href="#home">홈으로</a></div></section>`;
    return;
  }
  const id = queue[i];
  const record = ctx.state.records[id];
  const sentence = ctx.content.sentenceById[id];
  const cue = cueFor(sentence, record);
  if (record.selfAssess || sessionSelfAssess || !support.recognition) runSelfAssess(el, ctx, queue, i, sentence, record, cue);
  else runRecognition(el, ctx, queue, i, sentence, record, cue);
}

// hideCueText가 true면 큐 텍스트를 가리고 한국어 음성만으로 큐를 준다. #countdown 칸은
// 오디오 재생 중엔 🔊로 표시해두고, 재생이 끝난 뒤(playCueAudio의 onDone)에야 '3'으로
// 바꾸고 실제 카운트다운을 시작한다 — 듣는 시간이 3초를 깎아먹지 않도록 하는 핵심 장치.
function cueHtml(ctx, cue, i, total) {
  const hide = ctx.state.settings.hideCueText;
  const displayText = hide ? '🔊 듣고 3초 안에 발화' : cue.text;
  return `<section class="card">
    <p class="sub">${i + 1} / ${total} · ${cue.label}</p>
    <p class="big" style="margin:16px 0">${displayText}</p>
    <p class="count" id="countdown">🔊</p>
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

// 한국어 큐 음성을 재생하고, 끝나면 onDone을 부른다. audioKey가 없는 드문 분기
// (contextBefore 폴백)는 재생할 한국어 음성이 없으므로 onDone을 즉시 호출한다.
// 이 함수 자체는 세대 검사를 하지 않는다 — 호출자(runRecognition/runSelfAssess)가
// onDone 안에서 myGen을 검사해, 화면을 벗어났다 돌아온 뒤 도착한 콜백이 새 아이템의
// 카운트다운·마이크를 건드리지 못하게 막는다.
function playCueAudio(cue, onDone) {
  if (!cue.audioKey) { onDone(); return; }
  speakKorean(cue.text, cue.audioKey, onDone);
}

async function runRecognition(el, ctx, queue, i, sentence, record, cue) {
  const myGen = generation;
  el.innerHTML = cueHtml(ctx, cue, i, queue.length) + `<p class="sub" id="mic-status">🔊 듣는 중…</p>`;
  playCueAudio(cue, () => {
    if (myGen !== generation) return; // 다른 아이템/화면으로 넘어간 뒤 도착한 콜백
    if (!el.querySelector('#mic-status')) return; // 화면 이탈 — 방어적 이중 체크(기존 패턴과 동일)
    startListening(el, ctx, queue, i, sentence, record, cue, myGen);
  });
}

async function startListening(el, ctx, queue, i, sentence, record, cue, myGen) {
  el.querySelector('#countdown').textContent = '3';
  el.querySelector('#mic-status').textContent = '🎤 듣는 중…';
  let started = false;
  const stop = startCountdown(el, () => {
    if (!started) el.querySelector('#mic-status').textContent = '⏰ 3초 지남 — 그래도 끝까지 말해보세요';
  });
  const result = await recognizeOnce({ onSpeechStart: () => {
    if (myGen !== generation) return; // 다른 아이템/화면으로 넘어간 뒤 도착한 콜백
    started = true; el.querySelector('#countdown').textContent = '🗣';
  } });
  stop();
  if (myGen !== generation) return; // 화면 이탈 후 재진입 — 이 recognizeOnce는 더 이상 유효하지 않음
  if (!el.querySelector('#mic-status')) return; // 화면 이탈
  const answer = answerFor(sentence, cue);
  if (result.error && result.error !== 'no-speech') {
    if (result.error === 'not-allowed' || result.error === 'service-not-allowed') {
      // 마이크 권한 거부/서비스 차단은 재시도해도 다시 반복될 뿐인 영구적 오류이므로
      // record.recFails를 늘리거나 record.selfAssess를 영구 저장하지 않고, 이번 세션에
      // 한해서만 즉시 자기평가로 전환한다.
      sessionSelfAssess = true;
      runSelfAssess(el, ctx, queue, i, sentence, record, cue);
      return;
    }
    record.recFails += 1;
    record.updatedAt = ctx.nowIso();
    if (record.recFails >= REC_FAILS_TO_SELF_ASSESS) {
      record.selfAssess = true;
      ctx.save();
      runSelfAssess(el, ctx, queue, i, sentence, record, cue);
      return;
    }
    ctx.save();
    el.innerHTML = `<section class="card"><p class="big">음성인식 오류 (${result.error})</p>
      <div class="row"><button id="retry">다시 시도</button></div></section>`;
    el.querySelector('#retry').onclick = () => runRecognition(el, ctx, queue, i, sentence, record, cue);
    return;
  }
  record.recFails = 0;
  const inTime = result.speechStartMs !== null && result.speechStartMs <= START_WINDOW_MS;
  const score = bestScore(answer.en, result.alternatives);
  const matched = score >= PASS_THRESHOLD;
  const heard = result.alternatives[0] || '(음성 없음)';
  showVerdict(el, ctx, queue, i, sentence, record, cue, { pass: inTime && matched, inTime, matched, heard });
}

function showVerdict(el, ctx, queue, i, sentence, record, cue, v) {
  const answer = answerFor(sentence, cue);
  playAnswerAudio(sentence, cue);
  const reason = v.pass ? '' : (!v.inTime ? '3초 안에 시작하지 못했어요' : '문장이 정답과 달랐어요');
  el.innerHTML = `<section class="card">
    <p class="sub">${v.pass ? '✅ 성공!' : '❌ ' + reason}</p>
    <p class="big">${answer.en}</p>
    <p class="sub">${answer.ko}</p>
    <p class="sub" style="margin-top:8px">들린 문장: “${v.heard}”</p>
    <div class="row">
      ${v.pass
        ? `<button id="next" class="ok">다음 (즉답 성공)</button><button id="hard" class="ghost">겨우 했어요</button>`
        : `<button id="next" class="bad">다음 (실패)</button><button id="override" class="ghost">내가 맞았음</button>`}
      <button id="listen" class="ghost">🔊 다시 듣기</button>
    </div>
  </section>`;
  if (!support.tts) el.querySelector('#listen').style.display = 'none';
  el.querySelector('#listen').onclick = () => playAnswerAudio(sentence, cue);
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

function runSelfAssess(el, ctx, queue, i, sentence, record, cue) {
  const myGen = generation;
  el.innerHTML = cueHtml(ctx, cue, i, queue.length) + `<div class="row"><button id="reveal" disabled>🔊 듣는 중…</button></div>`;
  playCueAudio(cue, () => {
    if (myGen !== generation) return; // 다른 아이템/화면으로 넘어간 뒤 도착한 콜백
    const revealBtn = el.querySelector('#reveal');
    if (!revealBtn) return; // 화면 이탈 — 방어적 이중 체크
    el.querySelector('#countdown').textContent = '3';
    revealBtn.disabled = false;
    revealBtn.textContent = '정답 보기';
    const stop = startCountdown(el);
    revealBtn.onclick = () => {
      stop();
      const answer = answerFor(sentence, cue);
      playAnswerAudio(sentence, cue);
      el.innerHTML = `<section class="card">
        <p class="big">${answer.en}</p>
        <p class="sub">${answer.ko}</p>
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
  });
}
