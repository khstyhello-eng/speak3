import { newRecord, countIntroducedToday } from '../srs.js';
import { support, speakSentence } from '../speech.js';

export function renderLearn(el, ctx) {
  const today = ctx.todayStr();
  const remaining = ctx.state.settings.newPerDay - countIntroducedToday(ctx.state.records, today);
  if (remaining <= 0) {
    el.innerHTML = `<section class="card"><p class="big">오늘 새 문장 학습량을 채웠어요 ✨</p>
      <div class="row"><a class="btn" href="#drill">발화 연습으로</a></div></section>`;
    return;
  }
  const candidates = [];
  for (const sec of ctx.content.sections) for (const srcId of sec.sources) {
    for (const s of ctx.content.sourcesById[srcId].sentences) {
      if (!ctx.state.records[s.id]) candidates.push(s);
    }
  }
  if (!candidates.length) {
    el.innerHTML = `<section class="card"><p class="big">학습할 새 문장이 없어요. 문장 브라우저에서 추가해보세요.</p>
      <div class="row"><a class="btn" href="#browser">문장 브라우저</a></div></section>`;
    return;
  }
  // 커스텀(직접추가) 문장을 먼저 학습하도록 안정 정렬: curated=false가 앞으로,
  // curated 여부가 같은 항목끼리는 기존 순서를 그대로 유지한다.
  candidates.sort((a, b) => (a.curated === b.curated) ? 0 : (a.curated ? 1 : -1));
  showCard(el, ctx, candidates[0], remaining);
}

function showCard(el, ctx, s, remaining) {
  el.innerHTML = `<section class="card">
    <p class="sub">오늘 남은 새 문장 ${remaining}개 · ${s.speaker}</p>
    ${s.contextBefore ? `<p class="sub">↰ ${s.contextBefore}</p>` : ''}
    <p class="big" style="margin:8px 0">${s.en}</p>
    ${s.contextAfter ? `<p class="sub">↳ ${s.contextAfter}</p>` : ''}
    <p style="margin:12px 0">${s.ko}</p>
    <p class="sub">${s.note || ''}</p>
    <p class="row">${(s.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}</p>
    <div class="row">
      <button id="listen" class="ghost">🔊 듣기</button>
      <button id="done">학습 완료 → 오늘 발화 목록에 추가</button>
    </div>
  </section>`;
  if (support.tts) speakSentence(s); else el.querySelector('#listen').style.display = 'none';
  el.querySelector('#listen').onclick = () => speakSentence(s);
  el.querySelector('#done').onclick = () => {
    ctx.state.records[s.id] = newRecord(ctx.todayStr(), ctx.nowIso());
    ctx.save();
    renderLearn(el, ctx); // 다음 후보 or 완료 화면(→발화 연습 링크)
  };
}
