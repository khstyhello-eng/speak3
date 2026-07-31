import { review } from '../srs.js';
import { bestScore, PASS_THRESHOLD } from '../match.js';
import { support, speakSentence, speakVariation, speakKorean, recognizeOnce, stopSpeech, abortRecognition } from '../speech.js';
import { koOriginalKey, koCueKey, koVariationKey } from '../audioKeys.js';

const START_WINDOW_MS = 3000;
const REC_FAILS_TO_SELF_ASSESS = 3;
const VARIATION_MIN_INTERVAL = 15; // home.js의 MY_SENTENCE_MIN과 동일한 "내 문장" 기준
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

// 화면을 벗어났다가 #drill로 돌아왔을 때 이전 recognizeOnce 콜백이 새 아이템을
// 건드리지 않도록 하는 세대 카운터. renderDrill(세션 선택 화면 진입)·runItem(세션 내
// 아이템 진행/이연)마다 증가시키고, runRecognition은 진입 시점 값을 캡처해 await 이후·
// onSpeechStart 안에서 비교한다. 한국어 큐 음성 재생(playCueAudio)도 동일한 세대 값을
// 캡처해, 재생이 끝난 뒤 카운트다운·마이크를 시작하기 직전에 다시 검사한다 — 오디오
// 재생이라는 새 비동기 단계가 늘어난 만큼 이 가드를 그 경로에도 반드시 적용해야 한다.
// "나중에"(defer)로 같은 아이템 인덱스를 재사용해 runItem을 다시 부를 때도 이 카운터가
// 자동으로 올라가므로, 화면 이탈과 동일한 방식으로 직전 아이템의 잔류 콜백이 무해해진다.
let generation = 0;

// 마이크 권한 거부(not-allowed)/서비스 차단(service-not-allowed) 등 세션 내내 반복될
// 수밖에 없는 오류를 만나면 이번 드릴 세션 동안만 자기평가로 폴백한다. record.selfAssess와
// 달리 저장되지 않으며, renderDrill(드릴 화면 재진입)마다 초기화된다.
let sessionSelfAssess = false;

export function renderDrill(el, ctx) {
  generation += 1;
  sessionSelfAssess = false;
  renderPicker(el, ctx);
}

// due 문장을 소스별로 묶고 chunkSize 단위(기본 10)로 자른다. due 필터·정렬 규칙은 예전
// buildQueue(전체 큐)와 동일 — dueIdsSorted를 공유한다. 그룹 순서는 content.sections에
// 나열된 순서(섹션→소스)를 따르며, due가 하나도 없는 소스는 결과에서 제외한다.
// 순수 함수라 node 테스트 가능.
export function buildSessions(records, content, todayStr, chunkSize = 10) {
  const dueIds = dueIdsSorted(records, content, todayStr);
  const bySource = new Map();
  for (const id of dueIds) {
    const srcId = content.sourceOfSentence[id];
    if (!bySource.has(srcId)) bySource.set(srcId, []);
    bySource.get(srcId).push(id);
  }
  const sessions = [];
  for (const sec of content.sections) {
    for (const sourceId of sec.sources) {
      const ids = bySource.get(sourceId);
      if (!ids || !ids.length) continue;
      const chunks = [];
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
      sessions.push({ sourceId, title: content.sourcesById[sourceId].title, chunks });
    }
  }
  return sessions;
}

function dueIdsSorted(records, content, todayStr) {
  return Object.entries(records)
    .filter(([id, r]) => r.due <= todayStr && content.sentenceById[id])
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([id]) => id);
}

// "전체 시작"용 평탄 큐 — 소스로 묶기 전, due 순서 그대로.
function buildQueue(ctx) {
  return dueIdsSorted(ctx.state.records, ctx.content, ctx.todayStr());
}

function chunkLabel(n) {
  return n <= 10 ? `복습 ${CIRCLED[n - 1]}` : `복습 ${n}`;
}

// 세션 선택 화면(구 renderDrill의 자리). due가 없으면 기존 빈 카드 그대로, 있으면
// "전체 시작" 카드 + 소스별 청크 버튼 카드들을 그린다.
function renderPicker(el, ctx) {
  const sessions = buildSessions(ctx.state.records, ctx.content, ctx.todayStr());
  const total = sessions.reduce((n, s) => n + s.chunks.reduce((m, c) => m + c.length, 0), 0);
  if (!total) {
    el.innerHTML = `<section class="card"><p class="big">오늘 발화할 문장이 없어요 🎉</p><div class="row"><a class="btn" href="#learn">새 문장 학습하기</a></div></section>`;
    return;
  }
  const groupsHtml = sessions.map((s, si) => {
    const buttons = s.chunks.map((chunk, ci) =>
      `<button class="chunk-btn" data-si="${si}" data-ci="${ci}">${chunkLabel(ci + 1)} (${chunk.length}문장)</button>`
    ).join('');
    return `<section class="card"><p class="big">${s.title}</p><div class="row">${buttons}</div></section>`;
  }).join('');
  el.innerHTML = `<section class="card">
      <p class="sub">오늘 복습 ${total}문장</p>
      <div class="row"><button id="start-all">전체 시작</button></div>
    </section>${groupsHtml}`;
  el.querySelector('#start-all').onclick = () => startSession(el, ctx, buildQueue(ctx));
  el.querySelectorAll('.chunk-btn').forEach((btn) => {
    btn.onclick = () => {
      const s = sessions[Number(btn.dataset.si)];
      startSession(el, ctx, s.chunks[Number(btn.dataset.ci)]);
    };
  });
}

// 선택된 id 목록으로 세션 하나를 시작한다. 큐를 얕은 복사해 두는 이유: "나중에"(defer)가
// 이 배열 자체를 splice/push로 재배열하므로, picker가 sessions 계산 시 들고 있던 원본
// chunk 배열(및 buildQueue가 새로 만든 배열)을 세션이 끝날 때까지 자유롭게 변형해도
// 다른 상태에 영향이 없도록 한다.
function startSession(el, ctx, ids) {
  runItem(el, ctx, [...ids], 0);
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
  if (pv) return { label: '응용해서 말해보세요', text: pv.v.ko, audioKey: koVariationKey(sentence.id, pv.idx), pv };
  if (record.stage >= 2 && sentence.situationCue) return { label: '이런 상황이라면?', text: sentence.situationCue, audioKey: koCueKey(sentence.id) };
  if (record.stage >= 2 && sentence.contextBefore) return { label: '상대방이 이렇게 말했다:', text: sentence.contextBefore, audioKey: null };
  return { label: '3초 안에 영어로!', text: sentence.ko, audioKey: koOriginalKey(sentence.id) };
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
    el.innerHTML = `<section class="card"><p class="big">세션 끝! ${queue.length}문장 완료 💪</p>
      <div class="row"><button id="back-to-list">목록으로</button><a class="btn ghost" href="#home">홈으로</a></div></section>`;
    // "목록으로"는 #drill 라우트 안에 그대로 머무는 이동이라 location.hash가 바뀌지 않는다
    // (해시 변경이 없으면 hashchange 이벤트가 안 뜨므로 <a href="#drill">로는 재렌더가 안 됨) —
    // renderDrill을 직접 다시 호출해 picker를 그린다. 이때 방금 review()로 갱신된
    // ctx.state.records를 buildSessions가 다시 읽으므로, 이번 세션에서 끝낸 문장은 due가
    // 미래로 밀려나 있으면(대부분 pass/hard) 카운트에서 자연히 빠진다.
    el.querySelector('#back-to-list').onclick = () => renderDrill(el, ctx);
    return;
  }
  const id = queue[i];
  const record = ctx.state.records[id];
  const sentence = ctx.content.sentenceById[id];
  const cue = cueFor(sentence, record);
  if (record.selfAssess || sessionSelfAssess || !support.recognition) runSelfAssess(el, ctx, queue, i, sentence, record, cue);
  else runRecognition(el, ctx, queue, i, sentence, record, cue);
}

// 큐 재배열의 순수 부분만 분리 — node 테스트 가능. queue[i]를 빼서 배열 맨 뒤로 옮기고
// (제자리 변형·같은 참조 반환) 같은 인덱스 i에는 원래 i+1에 있던 항목이 오게 된다.
// splice+push는 배열 길이를 보존하므로(제거 1 + 추가 1 = 순변화 0), 같은 인덱스에서
// 반복 호출하면 남은 항목 수만큼 돌고 나서 원래 순서로 돌아온다(사이클).
export function deferInQueue(queue, i) {
  const [id] = queue.splice(i, 1);
  queue.push(id);
  return queue;
}

// "나중에" — 현재 아이템을 큐 맨 뒤로 미루고(review() 미적용 — 진도 변화 없음) 같은
// 인덱스 i로 runItem을 다시 부른다. runItem이 진입 즉시 generation을 올리므로, 직전
// 아이템에 대해 나가 있던 recognizeOnce의 RESULT/오디오 onDone은 이 한 번으로 화면
// 이탈 때와 동일하게 "낡은 값"이 되어 상태를 더 건드리지 못한다 — 하지만 그것만으로는
// 브라우저의 실제 마이크·오디오 재생 자체가 멈추지 않는다(#drill을 벗어나는 게 아니라서
// speech.js의 hashchange 리스너도 타지 않는다). 그래서 여기서 명시적으로:
//  - abortRecognition(): 직전 아이템이 recognizeOnce로 듣고 있던 실제 마이크 세션을
//    끈다 — 이게 없으면 다음 아이템이 새 recognizeOnce를 시작할 때 두 개의
//    SpeechRecognition이 동시에 떠 있는 이중 마이크 상태가 된다.
//  - stopSpeech(): 직전 아이템의 한국어 큐 mp3/TTS가 재생 중이었다면 즉시 멈춘다.
//    보통은 다음 아이템의 playCueAudio→speakKorean이 시작되며 stopSpeech()가 저절로
//    불리지만, 다음 아이템의 cue가 audioKey null + hideCueText 꺼짐 조합이면 그
//    호출 자체가 없어(onDone을 즉시 부르고 끝) 이전 오디오가 배경에서 계속 들릴 수
//    있다 — 그 틈을 여기서 미리 막는다.
function deferCurrent(el, ctx, queue, i) {
  abortRecognition();
  stopSpeech();
  deferInQueue(queue, i);
  runItem(el, ctx, queue, i);
}

function bindDefer(el, ctx, queue, i) {
  const btn = el.querySelector('#defer');
  if (btn) btn.onclick = () => deferCurrent(el, ctx, queue, i);
}

// hideCueText가 true면 큐 텍스트를 가리고 한국어 음성만으로 큐를 준다. #countdown 칸은
// 오디오 재생 중엔 🔊로 표시해두고, 재생이 끝난 뒤(playCueAudio의 onDone)에야 '3'으로
// 바꾸고 실제 카운트다운을 시작한다 — 듣는 시간이 3초를 깎아먹지 않도록 하는 핵심 장치.
// canDefer가 true일 때만 "나중에" 버튼을 심는다(남은 아이템이 2개 이상일 때만 — 마지막
// 하나 남았을 때 미루면 자기 자신만 도로 만나게 되므로 그 경우엔 숨긴다).
function cueHtml(ctx, cue, i, total, canDefer) {
  const hide = ctx.state.settings.hideCueText;
  const displayText = hide ? '🔊 듣고 3초 안에 발화' : cue.text;
  return `<section class="card">
    <p class="sub">${i + 1} / ${total} · ${cue.label}</p>
    <p class="big" style="margin:16px 0">${displayText}</p>
    <p class="count" id="countdown">🔊</p>
    ${canDefer ? '<div class="row"><button id="defer" class="ghost">나중에</button></div>' : ''}
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
// (contextBefore 폴백, 한국어 mp3 자체가 없음)는:
//  - hideCueText가 꺼져 있으면 큐 텍스트가 이미 화면에 보이므로 onDone을 즉시 호출.
//  - hideCueText가 켜져 있으면 텍스트가 가려져 있어 음성마저 없으면 사용자에게 아무 큐도
//    주어지지 않는 채로 카운트다운만 도는 상황이 된다 — speakKorean(text, null, onDone)으로
//    mp3 시도를 건너뛰고 곧장 브라우저 ko-KR TTS로 큐를 들려준다.
// 이 함수 자체는 세대 검사를 하지 않는다 — 호출자(runRecognition/runSelfAssess)가
// onDone 안에서 myGen을 검사해, 화면을 벗어났다 돌아온 뒤 도착한 콜백이 새 아이템의
// 카운트다운·마이크를 건드리지 못하게 막는다. "나중에"로 아이템이 이연된 경우도 이
// 검사 하나로 동일하게 걸러진다 — deferCurrent가 runItem을 다시 부르며 generation을
// 올려두므로, 미뤄진 아이템의 재생이 나중에 실제로 끝나 onDone이 불려도 myGen이 이미
// 낡은 값이라 카운트다운/마이크를 시작하지 않고 조용히 리턴한다. 오디오 자체를 강제로
// 멈추지는 않지만(이 프로젝트의 기존 규율과 동일 — speech.js의 stopSpeech는 다음 재생
// 호출 시점이나 hashchange에만 물린다), 다음 아이템도 대개 자체 큐 음성을 재생하므로
// 그 speakKorean 호출이 곧바로 stopSpeech()를 태워 잔여 재생을 끊는다.
function playCueAudio(ctx, cue, onDone) {
  if (!cue.audioKey) {
    if (ctx.state.settings.hideCueText) { speakKorean(cue.text, null, onDone); return; }
    onDone();
    return;
  }
  speakKorean(cue.text, cue.audioKey, onDone);
}

async function runRecognition(el, ctx, queue, i, sentence, record, cue) {
  const myGen = generation;
  const canDefer = queue.length - i > 1;
  el.innerHTML = cueHtml(ctx, cue, i, queue.length, canDefer) + `<p class="sub" id="mic-status">🔊 듣는 중…</p>`;
  bindDefer(el, ctx, queue, i);
  playCueAudio(ctx, cue, () => {
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
  const canDefer = queue.length - i > 1;
  el.innerHTML = cueHtml(ctx, cue, i, queue.length, canDefer) + `<div class="row"><button id="reveal" disabled>🔊 듣는 중…</button></div>`;
  bindDefer(el, ctx, queue, i);
  playCueAudio(ctx, cue, () => {
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
